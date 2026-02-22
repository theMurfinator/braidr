import { useState, useEffect } from 'react';
import type { Task, TaskFilter, TaskFieldDef, TaskViewConfig, Tag, Character, Scene, TimeEntry } from '../../../shared/types';
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

  // Timer state
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<string | null>(null);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);

  useEffect(() => {
    if (!timerStart) return;
    const interval = setInterval(() => {
      setTimerElapsed(Date.now() - timerStart);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerStart]);

  const startTimer = (taskId: string) => {
    // If another timer is running, stop it first
    if (activeTimerTaskId) {
      stopTimer();
    }
    setActiveTimerTaskId(taskId);
    setTimerStart(Date.now());
    setTimerElapsed(0);
  };

  const stopTimer = () => {
    if (!activeTimerTaskId || !timerStart) return;
    const duration = Date.now() - timerStart;
    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      startedAt: timerStart,
      duration,
    };
    // Update the task's timeEntries
    const updated = tasks.map(t =>
      t.id === activeTimerTaskId
        ? { ...t, timeEntries: [...t.timeEntries, entry], updatedAt: Date.now() }
        : t
    );
    onTasksChange(updated);
    setActiveTimerTaskId(null);
    setTimerStart(null);
    setTimerElapsed(0);
  };

  const handleAddTimeEntry = (taskId: string, entry: TimeEntry) => {
    const updated = tasks.map(t =>
      t.id === taskId
        ? { ...t, timeEntries: [...t.timeEntries, entry], updatedAt: Date.now() }
        : t
    );
    onTasksChange(updated);
  };

  // Get active timer task title
  const activeTimerTaskTitle = activeTimerTaskId
    ? tasks.find(t => t.id === activeTimerTaskId)?.title || 'Untitled'
    : '';

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
        activeTimerTaskId={activeTimerTaskId}
        activeTimerTaskTitle={activeTimerTaskTitle}
        timerElapsed={timerElapsed}
        onStopTimer={stopTimer}
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
          activeTimerTaskId={activeTimerTaskId}
          onStartTimer={startTimer}
          onStopTimer={stopTimer}
          onAddTimeEntry={handleAddTimeEntry}
        />
      </div>
    </div>
  );
}
