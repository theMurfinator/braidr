import { useEffect, useRef, useState } from 'react';
import type { Task, Character, Tag } from '../../../shared/types';

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: '#9e9e9e' },
  { value: 'in-progress', label: 'In Progress',  color: '#2196f3' },
  { value: 'done',        label: 'Done',         color: '#4caf50' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'none',   label: 'None',   color: '#9e9e9e' },
  { value: 'low',    label: 'Low',    color: '#8bc34a' },
  { value: 'medium', label: 'Medium', color: '#ff9800' },
  { value: 'high',   label: 'High',   color: '#f44336' },
  { value: 'urgent', label: 'Urgent', color: '#9c27b0' },
] as const;

interface TaskDetailPanelProps {
  isOpen: boolean;
  task: Task | null;
  tasks: Task[];
  characters: Character[];
  tags: Tag[];
  onClose: () => void;
  onCreateTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onTasksChange: (tasks: Task[]) => void;
}

export default function TaskDetailPanel({
  isOpen,
  task,
  tasks,
  tags,
  characters,
  onClose,
  onCreateTask,
  onUpdateTask,
  onTasksChange,
}: TaskDetailPanelProps) {
  const isCreateMode = task === null;
  const titleRef = useRef<HTMLInputElement>(null);
  const [draftTitle, setDraftTitle] = useState(task?.title ?? '');
  const [draftDescription, setDraftDescription] = useState(task?.description ?? '');
  const [draftStatus, setDraftStatus]           = useState<string>(task?.status ?? 'open');
  const [draftPriority, setDraftPriority]       = useState<string>(task?.priority ?? 'none');
  const [draftDueDate, setDraftDueDate]         = useState<string>(
    task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
  );
  const [draftTimeEstimate, setDraftTimeEstimate] = useState<string>(
    task?.timeEstimate ? String(Math.round(task.timeEstimate / 60000)) : ''
  );
  const [draftTagIds, setDraftTagIds]           = useState<string[]>(task?.tags ?? []);
  const [draftCharIds, setDraftCharIds]         = useState<string[]>(task?.characterIds ?? []);
  const [draftSubtasks, setDraftSubtasks] = useState<Array<{ id: string; title: string }>>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  // Sync when task changes (clicking a different row in edit mode)
  useEffect(() => {
    setDraftTitle(task?.title ?? '');
    setDraftDescription(task?.description ?? '');
    setDraftStatus(task?.status ?? 'open');
    setDraftPriority(task?.priority ?? 'none');
    setDraftDueDate(task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
    setDraftTimeEstimate(task?.timeEstimate ? String(Math.round(task.timeEstimate / 60000)) : '');
    setDraftTagIds(task?.tags ?? []);
    setDraftCharIds(task?.characterIds ?? []);
  }, [task?.id]);

  // Reset subtasks when task changes
  useEffect(() => {
    setDraftSubtasks([]);
    setNewSubtaskTitle('');
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

  function handleAddSubtask() {
    const title = newSubtaskTitle.trim();
    if (!title) return;

    if (isCreateMode) {
      setDraftSubtasks(prev => [...prev, { id: crypto.randomUUID(), title }]);
    } else if (task) {
      const newSub: Task = {
        id: crypto.randomUUID(),
        title,
        status: 'open',
        priority: 'none',
        tags: [],
        characterIds: [],
        timeEntries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: task.subtasks.length,
        customFields: {},
        parentTaskId: task.id,
        subtasks: [],
      };
      const updated = { ...task, subtasks: [...task.subtasks, newSub], updatedAt: Date.now() };
      onUpdateTask(updated);
      // Also update the flat tasks list so the table stays in sync
      onTasksChange(tasks.map(t => t.id === task.id ? updated : t));
    }
    setNewSubtaskTitle('');
    subtaskInputRef.current?.focus();
  }

  function handleSubtaskStatusToggle(subId: string) {
    if (!task) return;
    const updated = {
      ...task,
      subtasks: task.subtasks.map(s =>
        s.id === subId
          ? { ...s, status: s.status === 'done' ? 'open' : 'done' as Task['status'], updatedAt: Date.now() }
          : s
      ),
      updatedAt: Date.now(),
    };
    onUpdateTask(updated);
    onTasksChange(tasks.map(t => t.id === task.id ? updated : t));
  }

  function commitField(updates: Partial<Task>) {
    if (!isCreateMode && task) {
      onUpdateTask({ ...task, ...updates, updatedAt: Date.now() });
    }
  }

  function handleCreate() {
    const title = draftTitle.trim();
    if (!title) {
      titleRef.current?.focus();
      return;
    }

    const subtasks: Task[] = draftSubtasks.map((s, i) => ({
      id: s.id,
      title: s.title,
      status: 'open' as const,
      priority: 'none' as const,
      tags: [],
      characterIds: [],
      timeEntries: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: i,
      customFields: {},
      parentTaskId: null,
      subtasks: [],
    }));

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      description: draftDescription.trim() || undefined,
      status: draftStatus as Task['status'],
      priority: draftPriority as Task['priority'],
      tags: draftTagIds,
      characterIds: draftCharIds,
      dueDate: draftDueDate ? new Date(draftDueDate).getTime() : undefined,
      timeEstimate: draftTimeEstimate ? parseInt(draftTimeEstimate) * 60000 : undefined,
      timeEntries: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: tasks.length,
      customFields: {},
      parentTaskId: null,
      subtasks: subtasks.map(s => ({ ...s, parentTaskId: newTask.id })),
    };

    onCreateTask(newTask);
    onClose();
  }

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
            <div className="task-panel-subtasks">
              <span className="task-panel-section-label">Subtasks</span>

              {/* In create mode: show draft subtasks */}
              {isCreateMode && draftSubtasks.map(sub => (
                <div key={sub.id} className="task-panel-subtask-row">
                  <span className="task-panel-subtask-check">○</span>
                  <span className="task-panel-subtask-title">{sub.title}</span>
                  <button
                    className="task-panel-subtask-remove"
                    onClick={() => setDraftSubtasks(prev => prev.filter(s => s.id !== sub.id))}
                  >✕</button>
                </div>
              ))}

              {/* In edit mode: show existing subtasks */}
              {!isCreateMode && task && task.subtasks.map(sub => (
                <div key={sub.id} className="task-panel-subtask-row">
                  <button
                    className="task-panel-subtask-check"
                    onClick={() => handleSubtaskStatusToggle(sub.id)}
                    title={sub.status === 'done' ? 'Mark open' : 'Mark done'}
                  >
                    {sub.status === 'done' ? '●' : '○'}
                  </button>
                  <span
                    className="task-panel-subtask-title"
                    style={{ textDecoration: sub.status === 'done' ? 'line-through' : 'none', opacity: sub.status === 'done' ? 0.5 : 1 }}
                  >
                    {sub.title}
                  </span>
                </div>
              ))}

              {/* Add subtask input */}
              <div className="task-panel-subtask-add">
                <input
                  ref={subtaskInputRef}
                  className="task-panel-subtask-input"
                  placeholder="+ Add subtask"
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                />
              </div>
            </div>
          </div>
          <div className="task-panel-right">
            {/* Status */}
            <div className="task-panel-field-row">
              <span className="task-panel-field-label">Status</span>
              <select
                className="task-panel-field-select"
                value={draftStatus}
                style={{ color: STATUS_OPTIONS.find(o => o.value === draftStatus)?.color }}
                onChange={e => {
                  setDraftStatus(e.target.value);
                  commitField({ status: e.target.value as Task['status'] });
                }}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ color: o.color }}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="task-panel-field-row">
              <span className="task-panel-field-label">Priority</span>
              <select
                className="task-panel-field-select"
                value={draftPriority}
                style={{ color: PRIORITY_OPTIONS.find(o => o.value === draftPriority)?.color }}
                onChange={e => {
                  setDraftPriority(e.target.value);
                  commitField({ priority: e.target.value as Task['priority'] });
                }}
              >
                {PRIORITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ color: o.color }}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div className="task-panel-field-row">
              <span className="task-panel-field-label">Due date</span>
              <input
                type="date"
                className="task-panel-field-date"
                value={draftDueDate}
                onChange={e => setDraftDueDate(e.target.value)}
                onBlur={() => {
                  const ms = draftDueDate ? new Date(draftDueDate).getTime() : undefined;
                  commitField({ dueDate: ms });
                }}
              />
            </div>

            {/* Time estimate */}
            <div className="task-panel-field-row">
              <span className="task-panel-field-label">Estimate (min)</span>
              <input
                type="number"
                min={0}
                className="task-panel-field-number"
                placeholder="—"
                value={draftTimeEstimate}
                onChange={e => setDraftTimeEstimate(e.target.value)}
                onBlur={() => {
                  const ms = draftTimeEstimate ? parseInt(draftTimeEstimate) * 60000 : undefined;
                  commitField({ timeEstimate: ms });
                }}
              />
            </div>

            {/* Tags */}
            <div className="task-panel-field-row task-panel-field-row--wrap">
              <span className="task-panel-field-label">Tags</span>
              <div className="task-panel-tag-list">
                {tags.map(tag => {
                  const active = draftTagIds.includes(tag.id) || draftTagIds.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      className={`task-panel-tag-chip ${active ? 'active' : ''}`}
                      onClick={() => {
                        const next = active
                          ? draftTagIds.filter(id => id !== tag.id && id !== tag.name)
                          : [...draftTagIds, tag.id];
                        setDraftTagIds(next);
                        commitField({ tags: next });
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Characters */}
            <div className="task-panel-field-row task-panel-field-row--wrap">
              <span className="task-panel-field-label">Characters</span>
              <div className="task-panel-tag-list">
                {characters.map(char => {
                  const active = draftCharIds.includes(char.id);
                  return (
                    <button
                      key={char.id}
                      className={`task-panel-tag-chip ${active ? 'active' : ''}`}
                      onClick={() => {
                        const next = active
                          ? draftCharIds.filter(id => id !== char.id)
                          : [...draftCharIds, char.id];
                        setDraftCharIds(next);
                        commitField({ characterIds: next });
                      }}
                    >
                      {char.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {isCreateMode && (
          <div className="task-panel-footer">
            <button
              className="task-panel-create-btn"
              disabled={!draftTitle.trim()}
              onClick={handleCreate}
            >
              Create Task
            </button>
            <button className="task-panel-cancel-btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </>
  );
}
