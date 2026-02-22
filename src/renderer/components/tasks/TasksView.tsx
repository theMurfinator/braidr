import { useState } from 'react';
import type { Task, TaskFilter, TaskFieldDef, TaskViewConfig, Tag, Character, Scene } from '../../../shared/types';
import TaskTable from './TaskTable';
import TaskToolbar from './TaskToolbar';
import TaskFilterBar from './TaskFilterBar';

function getFieldValue(task: Task, field: string, characters: Character[]): string | string[] | number | boolean | undefined {
  switch (field) {
    case 'title': return task.title;
    case 'status': return task.status;
    case 'priority': return task.priority;
    case 'tags': return task.tags;
    case 'characters': return task.characterIds.map(id => characters.find(c => c.id === id)?.name || id);
    case 'scene': return task.sceneKey || '';
    case 'dueDate': return task.dueDate;
    case 'timeTracked': return task.timeEntries.reduce((s, e) => s + e.duration, 0);
    case 'timeEstimate': return task.timeEstimate;
    default: return task.customFields[field] as string | string[] | number | boolean | undefined;
  }
}

function filterTasks(tasks: Task[], filters: TaskFilter[], characters: Character[]): Task[] {
  if (!filters.length) return tasks;
  return tasks.filter(task => {
    return filters.every(f => {
      const value = getFieldValue(task, f.field, characters);
      switch (f.operator) {
        case 'is':
          if (Array.isArray(value)) return Array.isArray(f.value) ? f.value.some(v => value.includes(v)) : value.includes(String(f.value));
          return String(value) === String(f.value);
        case 'is_not':
          if (Array.isArray(value)) return !Array.isArray(f.value) || !f.value.some(v => value.includes(v));
          return String(value) !== String(f.value);
        case 'contains':
          if (Array.isArray(value) && Array.isArray(f.value)) return f.value.some(v => value.includes(v));
          return String(value).toLowerCase().includes(String(f.value).toLowerCase());
        case 'is_set':
          return value != null && value !== '' && (!Array.isArray(value) || value.length > 0);
        case 'is_not_set':
          return value == null || value === '' || (Array.isArray(value) && value.length === 0);
        default: return true;
      }
    });
  });
}

interface TasksViewProps {
  tasks: Task[];
  taskFieldDefs: TaskFieldDef[];
  taskViews: TaskViewConfig[];
  tags: Tag[];
  characters: Character[];
  scenes: Scene[];
  onTasksChange: (tasks: Task[]) => void;
  onTaskFieldDefsChange: (defs: TaskFieldDef[]) => void;
  onTaskViewsChange: (views: TaskViewConfig[]) => void;
}

export default function TasksView({
  tasks,
  taskFieldDefs,
  taskViews,
  tags,
  characters,
  scenes,
  onTasksChange,
  onTaskFieldDefsChange,
  onTaskViewsChange,
}: TasksViewProps) {
  const [groupBy, setGroupBy] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<TaskFilter[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  function handleSortChange(field: string | undefined, dir: 'asc' | 'desc') {
    setSortBy(field);
    setSortDir(dir);
  }

  // Suppress unused variable warnings for props used in future tasks
  void taskViews;
  void onTaskViewsChange;

  const filteredTasks = filterTasks(tasks, filters, characters);

  return (
    <div className="tasks-view">
      <TaskToolbar
        groupBy={groupBy}
        sortBy={sortBy}
        sortDir={sortDir}
        taskFieldDefs={taskFieldDefs}
        taskCount={filteredTasks.length}
        onGroupByChange={setGroupBy}
        onSortChange={handleSortChange}
        showFilter={showFilter}
        onToggleFilter={() => setShowFilter(!showFilter)}
        filterCount={filters.length}
      />
      {showFilter && (
        <TaskFilterBar
          filters={filters}
          taskFieldDefs={taskFieldDefs}
          characters={characters}
          tags={tags}
          onFiltersChange={setFilters}
        />
      )}
      <div className="tasks-table-wrap">
        <TaskTable
          tasks={filteredTasks}
          characters={characters}
          scenes={scenes}
          tags={tags}
          taskFieldDefs={taskFieldDefs}
          onTasksChange={onTasksChange}
          onTaskFieldDefsChange={onTaskFieldDefsChange}
          groupBy={groupBy}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      </div>
    </div>
  );
}
