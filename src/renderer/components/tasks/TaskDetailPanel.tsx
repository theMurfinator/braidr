import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Task, Character, TaskFieldDef, TimeEntry } from '../../../shared/types';
import TaskFieldManager from './TaskFieldManager';

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
  taskFieldDefs: TaskFieldDef[];
  onClose: () => void;
  onCreateTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onTasksChange: (tasks: Task[]) => void;
  activeTimerTaskId: string | null;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onTaskFieldDefsChange: (defs: TaskFieldDef[]) => void;
}

export default function TaskDetailPanel({
  isOpen,
  task,
  tasks,
  characters,
  taskFieldDefs,
  onClose,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onTasksChange,
  onTaskFieldDefsChange,
  activeTimerTaskId,
  onStartTimer,
  onStopTimer,
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
  const [draftCharIds, setDraftCharIds]         = useState<string[]>(task?.characterIds ?? []);
  const [draftSubtasks, setDraftSubtasks] = useState<Array<{ id: string; title: string; status: Task['status'] }>>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [showCharPicker, setShowCharPicker] = useState(false);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [showFieldCreator, setShowFieldCreator] = useState(false);
  const fieldPickerRef = useRef<HTMLDivElement>(null);
  const [showTimeEntries, setShowTimeEntries] = useState(false);
  const [addHours, setAddHours] = useState(0);
  const [addMinutes, setAddMinutes] = useState(0);
  const [addDesc, setAddDesc] = useState('');

  useEffect(() => {
    setDraftTitle(task?.title ?? '');
    setDraftDescription(task?.description ?? '');
    setDraftStatus(task?.status ?? 'open');
    setDraftPriority(task?.priority ?? 'none');
    setDraftDueDate(task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
    setDraftTimeEstimate(task?.timeEstimate ? String(Math.round(task.timeEstimate / 60000)) : '');
    setDraftCharIds(task?.characterIds ?? []);
    setShowCharPicker(false);
  }, [task?.id]);

  useEffect(() => {
    setDraftSubtasks([]);
    setNewSubtaskTitle('');
    setEditingSubtaskId(null);
  }, [task?.id]);

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

  useEffect(() => {
    if (!showFieldPicker) return;
    function handleClick(e: MouseEvent) {
      if (fieldPickerRef.current && !fieldPickerRef.current.contains(e.target as Node)) {
        setShowFieldPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFieldPicker]);

  function handleAddSubtask() {
    const title = newSubtaskTitle.trim();
    if (!title) return;

    if (isCreateMode) {
      setDraftSubtasks(prev => [...prev, { id: crypto.randomUUID(), title, status: 'open' }]);
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
      onTasksChange(tasks.map(t => t.id === task.id ? updated : t));
    }
    setNewSubtaskTitle('');
    subtaskInputRef.current?.focus();
  }

  function handleSubtaskUpdate(subId: string, changes: Partial<Task>) {
    if (!task) return;
    const sub = task.subtasks.find(s => s.id === subId);
    if (!sub) return;
    const updatedSub = { ...sub, ...changes, updatedAt: Date.now() };
    // Persist the subtask itself (it's a full Task with its own ID)
    onUpdateTask(updatedSub);
    // Update local parent state so the UI reflects the change
    const updatedParent = {
      ...task,
      subtasks: task.subtasks.map(s => s.id === subId ? updatedSub : s),
      updatedAt: Date.now(),
    };
    onTasksChange(tasks.map(t => t.id === task.id ? updatedParent : t));
  }

  function handleSubtaskDelete(subId: string) {
    if (!task) return;
    // Soft-delete the subtask in the DB
    onDeleteTask(subId);
    // Remove from local parent state
    const updatedParent = {
      ...task,
      subtasks: task.subtasks.filter(s => s.id !== subId),
      updatedAt: Date.now(),
    };
    onTasksChange(tasks.map(t => t.id === task.id ? updatedParent : t));
  }

  function commitField(updates: Partial<Task>) {
    if (!isCreateMode && task) {
      const updated = { ...task, ...updates, updatedAt: Date.now() };
      onUpdateTask(updated);
      onTasksChange(tasks.map(t => t.id === task.id ? updated : t));
    }
  }

  function formatDuration(ms: number): string {
    if (!ms) return '0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function mutateTimeEntries(entries: TimeEntry[]) {
    if (!task) return;
    const updated = { ...task, timeEntries: entries, updatedAt: Date.now() };
    onUpdateTask(updated);
    onTasksChange(tasks.map(t => t.id === task.id ? updated : t));
  }

  function handleAddTimeEntry() {
    const duration = addHours * 3600000 + addMinutes * 60000;
    if (!duration || !task) return;
    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      duration,
      description: addDesc.trim() || undefined,
    };
    mutateTimeEntries([...task.timeEntries, entry]);
    setAddHours(0);
    setAddMinutes(0);
    setAddDesc('');
  }

  function commitCustomField(fieldId: string, value: unknown) {
    if (!isCreateMode && task) {
      const updated = { ...task, customFields: { ...task.customFields, [fieldId]: value }, updatedAt: Date.now() };
      onUpdateTask(updated);
      onTasksChange(tasks.map(t => t.id === task.id ? updated : t));
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
      status: s.status,
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
      tags: [],
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

  const statusColor = STATUS_OPTIONS.find(o => o.value === draftStatus)?.color ?? '#9e9e9e';
  const priorityOption = PRIORITY_OPTIONS.find(o => o.value === draftPriority);
  const selectedChars = characters.filter(c => draftCharIds.includes(c.id));
  const availableChars = characters.filter(c => !draftCharIds.includes(c.id));

  if (!isOpen) return <></>;

  return (
    <>
      <div className="task-panel-backdrop" onClick={onClose} />
      <div className="task-panel">
        <div className="task-panel-header">
          <span className="task-panel-header-label">
            {isCreateMode ? 'New Task' : 'Task'}
          </span>
          <div className="task-panel-header-actions">
            {!isCreateMode && task && (
              <button
                className="task-panel-header-btn task-panel-header-btn--danger"
                onClick={() => { onDeleteTask(task.id); onClose(); }}
                title="Delete task"
              >
                🗑
              </button>
            )}
            <button className="task-panel-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="task-panel-body">
          {/* Title */}
          <div className="task-panel-title-section">
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
          </div>

          {/* Properties */}
          <div className="task-panel-props">
            {/* Status */}
            <div className="task-panel-prop-row">
              <span className="task-panel-prop-label">Status</span>
              <select
                className="task-panel-status-pill"
                value={draftStatus}
                style={{ backgroundColor: statusColor }}
                onChange={e => {
                  setDraftStatus(e.target.value);
                  commitField({ status: e.target.value as Task['status'] });
                }}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="task-panel-prop-row">
              <span className="task-panel-prop-label">Priority</span>
              <div className="task-panel-priority-value">
                <span className="task-panel-priority-dot" style={{ background: priorityOption?.color }} />
                <select
                  className="task-panel-priority-select"
                  value={draftPriority}
                  style={{ color: priorityOption?.color }}
                  onChange={e => {
                    setDraftPriority(e.target.value);
                    commitField({ priority: e.target.value as Task['priority'] });
                  }}
                >
                  {PRIORITY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due date */}
            <div className="task-panel-prop-row">
              <span className="task-panel-prop-label">Due date</span>
              <input
                type="date"
                className="task-panel-prop-input"
                value={draftDueDate}
                onChange={e => setDraftDueDate(e.target.value)}
                onBlur={() => {
                  const ms = draftDueDate ? new Date(draftDueDate).getTime() : undefined;
                  commitField({ dueDate: ms });
                }}
              />
            </div>

            {/* Time tracked */}
            <div className="task-panel-prop-row">
              <span className="task-panel-prop-label">Time tracked</span>
              <div className="task-panel-time-value">
                {!isCreateMode && task && (
                  <button
                    className={`task-panel-timer-btn${activeTimerTaskId === task.id ? ' active' : ''}`}
                    onClick={() => activeTimerTaskId === task.id ? onStopTimer() : onStartTimer(task.id)}
                    title={activeTimerTaskId === task.id ? 'Stop timer' : 'Start timer'}
                  >
                    {activeTimerTaskId === task.id ? '■' : '▶'}
                  </button>
                )}
                <button
                  className="task-panel-time-total"
                  onClick={() => setShowTimeEntries(p => !p)}
                >
                  {isCreateMode ? '0m' : formatDuration(task?.timeEntries.reduce((s, e) => s + e.duration, 0) ?? 0)}
                </button>
              </div>
            </div>

            {/* Time entries (expanded) */}
            {showTimeEntries && !isCreateMode && task && (
              <div className="task-panel-time-entries">
                {task.timeEntries.length > 0 && (
                  <div className="task-panel-time-entry-list">
                    {[...task.timeEntries].reverse().map(entry => (
                      <div key={entry.id} className="task-panel-time-entry-row">
                        <span className="task-panel-time-entry-date">
                          {new Date(entry.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="task-panel-time-entry-dur">{formatDuration(entry.duration)}</span>
                        {entry.description && (
                          <span className="task-panel-time-entry-desc">{entry.description}</span>
                        )}
                        <button
                          className="task-panel-time-entry-del"
                          onClick={() => mutateTimeEntries(task.timeEntries.filter(e => e.id !== entry.id))}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="task-panel-time-add">
                  <input type="number" min={0} className="task-panel-time-add-num" placeholder="0" value={addHours || ''} onChange={e => setAddHours(Math.max(0, parseInt(e.target.value) || 0))} />
                  <span className="task-panel-time-add-unit">h</span>
                  <input type="number" min={0} max={59} className="task-panel-time-add-num" placeholder="0" value={addMinutes || ''} onChange={e => setAddMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} />
                  <span className="task-panel-time-add-unit">m</span>
                  <input type="text" className="task-panel-time-add-desc" placeholder="Note (optional)" value={addDesc} onChange={e => setAddDesc(e.target.value)} />
                  <button className="task-panel-time-add-btn" onClick={handleAddTimeEntry} disabled={!addHours && !addMinutes}>Add</button>
                </div>
              </div>
            )}

            {/* Estimate */}
            <div className="task-panel-prop-row">
              <span className="task-panel-prop-label">Estimate</span>
              <div className="task-panel-prop-number-row">
                <input
                  type="number"
                  min={0}
                  className="task-panel-prop-input task-panel-prop-input--narrow"
                  placeholder="—"
                  value={draftTimeEstimate}
                  onChange={e => setDraftTimeEstimate(e.target.value)}
                  onBlur={() => {
                    const ms = draftTimeEstimate ? parseInt(draftTimeEstimate) * 60000 : undefined;
                    commitField({ timeEstimate: ms });
                  }}
                />
                {draftTimeEstimate && <span className="task-panel-prop-unit">min</span>}
              </div>
            </div>

            {/* Characters */}
            <div className={`task-panel-prop-row${selectedChars.length > 0 || showCharPicker ? ' task-panel-prop-row--top' : ''}`}>
              <span className="task-panel-prop-label">Characters</span>
              <div className="task-panel-prop-chips">
                {selectedChars.map(char => (
                  <span key={char.id} className="task-panel-chip task-panel-chip--char">
                    {char.name}
                    <button
                      className="task-panel-chip-remove"
                      onClick={() => {
                        const next = draftCharIds.filter(id => id !== char.id);
                        setDraftCharIds(next);
                        commitField({ characterIds: next });
                      }}
                    >×</button>
                  </span>
                ))}
                {availableChars.length > 0 && (
                  <button
                    className="task-panel-chip-add"
                    onClick={() => setShowCharPicker(p => !p)}
                  >
                    {showCharPicker ? '− Less' : '+ Add'}
                  </button>
                )}
                {selectedChars.length === 0 && !showCharPicker && (
                  <span className="task-panel-prop-empty">—</span>
                )}
                {showCharPicker && (
                  <div className="task-panel-chip-picker">
                    {availableChars.map(char => (
                      <button
                        key={char.id}
                        className="task-panel-chip-option task-panel-chip-option--char"
                        onClick={() => {
                          const next = [...draftCharIds, char.id];
                          setDraftCharIds(next);
                          commitField({ characterIds: next });
                        }}
                      >
                        {char.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="task-panel-desc-section">
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

          {/* Custom fields */}
          <div className="task-panel-fields-section">
            <div className="task-panel-fields-header">
              <span className="task-panel-section-label">Fields</span>
              <div className="task-panel-fields-picker-wrap" ref={fieldPickerRef}>
                <button
                  className="task-panel-fields-add"
                  onClick={() => setShowFieldPicker(p => !p)}
                  title="Manage fields"
                >+</button>
                {showFieldPicker && (
                  <div className="task-panel-fields-picker">
                    {taskFieldDefs.length > 0 && (
                      <>
                        <div className="task-panel-fields-picker-label">Existing fields</div>
                        {taskFieldDefs.map(def => (
                          <div key={def.id} className="task-panel-fields-picker-item">
                            <span className="task-panel-fields-picker-item-name">{def.name}</span>
                            <span className="task-panel-fields-picker-item-type">{def.type}</span>
                            <button
                              className="task-panel-fields-picker-item-delete"
                              title="Delete field"
                              onClick={() => {
                                onTaskFieldDefsChange(taskFieldDefs.filter(d => d.id !== def.id));
                              }}
                            >✕</button>
                          </div>
                        ))}
                        <div className="task-panel-fields-picker-divider" />
                      </>
                    )}
                    <button
                      className="task-panel-fields-picker-create"
                      onClick={() => { setShowFieldPicker(false); setShowFieldCreator(true); }}
                    >
                      + Create new field
                    </button>
                  </div>
                )}
              </div>
            </div>
            {taskFieldDefs.map(def => {
              const value = task?.customFields?.[def.id];
              return (
                <div key={def.id} className="task-panel-prop-row">
                  <span className="task-panel-prop-label">{def.name}</span>
                  {isCreateMode ? (
                    <span className="task-panel-prop-empty">—</span>
                  ) : def.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      className="task-panel-custom-checkbox"
                      checked={!!value}
                      onChange={e => commitCustomField(def.id, e.target.checked)}
                    />
                  ) : def.type === 'dropdown' ? (
                    <select
                      className="task-panel-prop-input"
                      value={String(value ?? '')}
                      onChange={e => commitCustomField(def.id, e.target.value)}
                    >
                      <option value="">—</option>
                      {(def.options ?? []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : def.type === 'date' ? (
                    <input
                      type="date"
                      className="task-panel-prop-input"
                      value={value ? new Date(value as number).toISOString().split('T')[0] : ''}
                      onChange={e => commitCustomField(def.id, e.target.value ? new Date(e.target.value).getTime() : undefined)}
                    />
                  ) : def.type === 'number' ? (
                    <input
                      type="number"
                      className="task-panel-prop-input task-panel-prop-input--narrow"
                      value={value !== undefined && value !== null ? String(value) : ''}
                      placeholder="—"
                      onChange={e => commitCustomField(def.id, e.target.value !== '' ? Number(e.target.value) : undefined)}
                    />
                  ) : (
                    <input
                      type="text"
                      className="task-panel-prop-input task-panel-prop-input--flex"
                      value={String(value ?? '')}
                      placeholder="—"
                      onChange={e => commitCustomField(def.id, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
            {taskFieldDefs.length === 0 && (
              <button className="task-panel-fields-empty" onClick={() => setShowFieldCreator(true)}>
                + Create your first custom field
              </button>
            )}
          </div>

          {/* Subtasks */}
          <div className="task-panel-subtasks-section">
            <span className="task-panel-section-label">Subtasks</span>

            {isCreateMode && draftSubtasks.map(sub => (
              <div key={sub.id} className="task-panel-subtask-row">
                <select
                  className="task-panel-subtask-status"
                  value={sub.status}
                  style={{ backgroundColor: STATUS_OPTIONS.find(o => o.value === sub.status)?.color }}
                  onChange={e => setDraftSubtasks(prev =>
                    prev.map(s => s.id === sub.id ? { ...s, status: e.target.value as Task['status'] } : s)
                  )}
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="task-panel-subtask-title">{sub.title}</span>
                <button
                  className="task-panel-subtask-remove"
                  onClick={() => setDraftSubtasks(prev => prev.filter(s => s.id !== sub.id))}
                >✕</button>
              </div>
            ))}

            {!isCreateMode && task && task.subtasks.map(sub => (
              <div key={sub.id} className="task-panel-subtask-row">
                <select
                  className="task-panel-subtask-status"
                  value={sub.status}
                  style={{ backgroundColor: STATUS_OPTIONS.find(o => o.value === sub.status)?.color }}
                  onChange={e => handleSubtaskUpdate(sub.id, { status: e.target.value as Task['status'] })}
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {editingSubtaskId === sub.id ? (
                  <input
                    className="task-panel-subtask-title-input"
                    value={editingSubtaskTitle}
                    autoFocus
                    onChange={e => setEditingSubtaskTitle(e.target.value)}
                    onBlur={() => {
                      const title = editingSubtaskTitle.trim();
                      if (title) handleSubtaskUpdate(sub.id, { title });
                      setEditingSubtaskId(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.currentTarget.blur(); }
                      if (e.key === 'Escape') { setEditingSubtaskId(null); }
                    }}
                  />
                ) : (
                  <span
                    className="task-panel-subtask-title"
                    style={{ textDecoration: sub.status === 'done' ? 'line-through' : 'none', opacity: sub.status === 'done' ? 0.45 : 1 }}
                    onClick={() => { setEditingSubtaskId(sub.id); setEditingSubtaskTitle(sub.title); }}
                    title="Click to edit"
                  >
                    {sub.title}
                  </span>
                )}
                <button
                  className="task-panel-subtask-remove"
                  onClick={() => handleSubtaskDelete(sub.id)}
                >✕</button>
              </div>
            ))}

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
      {showFieldCreator && createPortal(
        <TaskFieldManager
          onClose={() => setShowFieldCreator(false)}
          onCreate={def => {
            onTaskFieldDefsChange([...taskFieldDefs, def]);
            setShowFieldCreator(false);
          }}
        />,
        document.body
      )}
    </>
  );
}
