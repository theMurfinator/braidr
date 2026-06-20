import { useEffect, useRef, useState } from 'react';
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
  onUpdateTask,
}: TaskDetailPanelProps) {
  const isCreateMode = task === null;
  const titleRef = useRef<HTMLInputElement>(null);
  const [draftTitle, setDraftTitle] = useState(task?.title ?? '');
  const [draftDescription, setDraftDescription] = useState(task?.description ?? '');

  // Sync when task changes (clicking a different row in edit mode)
  useEffect(() => {
    setDraftTitle(task?.title ?? '');
    setDraftDescription(task?.description ?? '');
  }, [task?.id]);

  // Auto-focus title in create mode
  useEffect(() => {
    if (isOpen && isCreateMode) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [isOpen, isCreateMode]);

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
            <input
              ref={titleRef}
              className="task-panel-title-input"
              placeholder="Task title"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              onBlur={() => {
                if (!isCreateMode && task) {
                  onUpdateTask({ ...task, title: draftTitle, updatedAt: Date.now() });
                }
              }}
            />
            <textarea
              className="task-panel-description"
              placeholder="Add a description..."
              value={draftDescription}
              onChange={e => setDraftDescription(e.target.value)}
              onBlur={() => {
                if (!isCreateMode && task) {
                  onUpdateTask({ ...task, description: draftDescription, updatedAt: Date.now() });
                }
              }}
            />
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
