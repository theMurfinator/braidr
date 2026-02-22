import type { Task, TaskFieldDef, TaskViewConfig, Tag, Character, Scene } from '../../../shared/types';
import TaskTable from './TaskTable';

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
  return (
    <div className="tasks-view">
      <div className="tasks-toolbar">
        <h2 className="tasks-toolbar-title">Tasks</h2>
        <span className="tasks-toolbar-count">{tasks.length} tasks</span>
      </div>
      <div className="tasks-table-wrap">
        <TaskTable
          tasks={tasks}
          characters={characters}
          scenes={scenes}
          tags={tags}
          taskFieldDefs={taskFieldDefs}
          onTasksChange={onTasksChange}
          onTaskFieldDefsChange={onTaskFieldDefsChange}
        />
      </div>
    </div>
  );
}
