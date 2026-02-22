import { useState } from 'react';
import type { Task, TaskFieldDef, TaskViewConfig, Tag, Character, Scene } from '../../../shared/types';

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
        <p style={{ padding: 24, color: 'var(--text-secondary)' }}>
          Task table coming soon. {tasks.length} tasks loaded.
        </p>
      </div>
    </div>
  );
}
