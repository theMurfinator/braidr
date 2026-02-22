import { useState } from 'react';
import type { Task, TaskFieldDef, Character, Scene, Tag } from '../../../shared/types';
import TaskRow from './TaskRow';
import TaskFieldManager from './TaskFieldManager';

export const BUILTIN_COLUMNS = [
  { id: 'title', name: 'Title', width: 280 },
  { id: 'status', name: 'Status', width: 120 },
  { id: 'priority', name: 'Priority', width: 100 },
  { id: 'tags', name: 'Tags', width: 160 },
  { id: 'characters', name: 'Characters', width: 160 },
  { id: 'scene', name: 'Scene', width: 180 },
  { id: 'dueDate', name: 'Due Date', width: 120 },
  { id: 'timeTracked', name: 'Time Tracked', width: 110 },
  { id: 'timeEstimate', name: 'Time Estimate', width: 110 },
] as const;

interface TaskTableProps {
  tasks: Task[];
  characters: Character[];
  scenes: Scene[];
  tags: Tag[];
  taskFieldDefs: TaskFieldDef[];
  onTasksChange: (tasks: Task[]) => void;
  onTaskFieldDefsChange: (defs: TaskFieldDef[]) => void;
}

export default function TaskTable({
  tasks,
  characters,
  scenes,
  tags,
  taskFieldDefs,
  onTasksChange,
  onTaskFieldDefsChange,
}: TaskTableProps) {
  const [showFieldManager, setShowFieldManager] = useState(false);
  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  function handleCreateField(field: TaskFieldDef) {
    onTaskFieldDefsChange([...taskFieldDefs, field]);
    setShowFieldManager(false);
  }

  function handleAddTask() {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: '',
      status: 'open',
      priority: 'none',
      tags: [],
      characterIds: [],
      timeEntries: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: tasks.length,
      customFields: {},
    };
    onTasksChange([...tasks, newTask]);
  }

  function handleTaskUpdate(updated: Task) {
    onTasksChange(tasks.map((t) => (t.id === updated.id ? updated : t)));
  }

  return (
    <>
      <table className="tasks-table">
        <thead>
          <tr>
            {BUILTIN_COLUMNS.map((col) => (
              <th key={col.id} style={{ width: col.width }}>
                {col.name}
              </th>
            ))}
            {taskFieldDefs.map((def) => (
              <th key={def.id} style={{ width: def.width || 120 }}>
                {def.name}
              </th>
            ))}
            <th className="task-add-field-th">
              <button
                className="task-add-field-btn"
                onClick={() => setShowFieldManager(true)}
                title="Add custom field"
              >
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              characters={characters}
              scenes={scenes}
              tags={tags}
              taskFieldDefs={taskFieldDefs}
              onTaskUpdate={handleTaskUpdate}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="task-add-row" colSpan={BUILTIN_COLUMNS.length + taskFieldDefs.length + 1}>
              <button className="task-add-btn" onClick={handleAddTask}>
                + Add task
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
      {showFieldManager && (
        <TaskFieldManager
          onClose={() => setShowFieldManager(false)}
          onCreate={handleCreateField}
        />
      )}
    </>
  );
}
