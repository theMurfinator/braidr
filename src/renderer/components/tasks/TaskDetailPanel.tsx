import { useEffect } from 'react';
import type { Task, Character, Tag, Scene, TaskFieldDef } from '../../../shared/types';

interface TaskDetailPanelProps {
  isOpen: boolean;
  task: Task | null;
  tasks: Task[];
  characters: Character[];
  tags: Tag[];
  scenes: Scene[];
  taskFieldDefs: TaskFieldDef[];
  onClose: () => void;
  onCreateTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onTasksChange: (tasks: Task[]) => void;
}

export default function TaskDetailPanel({
  isOpen,
  task,
  onClose,
}: TaskDetailPanelProps) {
  const isCreateMode = task === null;

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return <></>;

  return (
    <>
      <div className="task-panel-backdrop" onClick={onClose} />
      <div className="task-panel">
        <div className="task-panel-header">
          <span className="task-panel-title">
            {isCreateMode ? 'New Task' : 'Task Detail'}
          </span>
          <button className="task-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="task-panel-body">
          <div className="task-panel-left">
            <p style={{ color: 'var(--text-muted)' }}>Left column (title, description, subtasks)</p>
          </div>
          <div className="task-panel-right">
            <p style={{ color: 'var(--text-muted)' }}>Right column (metadata fields)</p>
          </div>
        </div>
        {isCreateMode && (
          <div className="task-panel-footer">
            <button className="task-panel-create-btn" disabled>Create Task</button>
            <button className="task-panel-cancel-btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </>
  );
}
