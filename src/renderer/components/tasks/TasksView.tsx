import { useState } from 'react';
import type { Task, TaskFieldDef, TaskViewConfig, Tag, Character, Scene } from '../../../shared/types';
import TaskTable from './TaskTable';
import TaskToolbar from './TaskToolbar';

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

  function handleSortChange(field: string | undefined, dir: 'asc' | 'desc') {
    setSortBy(field);
    setSortDir(dir);
  }

  // Suppress unused variable warnings for props used in future tasks
  void taskViews;
  void onTaskViewsChange;

  return (
    <div className="tasks-view">
      <TaskToolbar
        groupBy={groupBy}
        sortBy={sortBy}
        sortDir={sortDir}
        taskFieldDefs={taskFieldDefs}
        taskCount={tasks.length}
        onGroupByChange={setGroupBy}
        onSortChange={handleSortChange}
      />
      <div className="tasks-table-wrap">
        <TaskTable
          tasks={tasks}
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
