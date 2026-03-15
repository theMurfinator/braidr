import { useState, useRef, useEffect } from 'react';
import type { Task, TaskFieldDef, Character, Scene, Tag, TimeEntry } from '../../../shared/types';
import {
  InlineTextInput,
  InlineNumberInput,
  InlineDropdown,
  InlineDatePicker,
  TagPicker,
  CharacterPicker,
  ScenePicker,
} from './TaskCellEditors';

interface TaskRowProps {
  task: Task;
  characters: Character[];
  scenes: Scene[];
  tags: Tag[];
  taskFieldDefs: TaskFieldDef[];
  onTaskUpdate: (updated: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => void;
  activeTimerTaskId: string | null;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onAddTimeEntry: (taskId: string, entry: TimeEntry) => void;
  onUpdateTimeEntry: (taskId: string, entryId: string, updates: Partial<Pick<TimeEntry, 'duration' | 'description'>>) => void;
  onDeleteTimeEntry: (taskId: string, entryId: string) => void;
  visibleColumns?: string[];
}

const STATUS_COLORS: Record<string, string> = {
  open: '#9e9e9e',
  'in-progress': '#2196f3',
  done: '#4caf50',
};

const PRIORITY_COLORS: Record<string, string> = {
  none: '#9e9e9e',
  low: '#8bc34a',
  medium: '#ff9800',
  high: '#f44336',
  urgent: '#9c27b0',
};

const TAG_CATEGORY_COLORS: Record<string, string> = {
  people: '#3D8B40',
  locations: '#3A7BC8',
  arcs: '#C44D5E',
  things: '#7B4FA2',
  time: '#D4820A',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: STATUS_COLORS.open },
  { value: 'in-progress', label: 'In Progress', color: STATUS_COLORS['in-progress'] },
  { value: 'done', label: 'Done', color: STATUS_COLORS.done },
];

const PRIORITY_OPTIONS = [
  { value: 'none', label: 'None', color: PRIORITY_COLORS.none },
  { value: 'low', label: 'Low', color: PRIORITY_COLORS.low },
  { value: 'medium', label: 'Medium', color: PRIORITY_COLORS.medium },
  { value: 'high', label: 'High', color: PRIORITY_COLORS.high },
  { value: 'urgent', label: 'Urgent', color: PRIORITY_COLORS.urgent },
];

function formatDuration(ms: number): string {
  if (!ms) return '0m';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function TimeEntryRow({ entry, onUpdate, onDelete }: {
  entry: TimeEntry;
  onUpdate: (updates: Partial<Pick<TimeEntry, 'duration' | 'description'>>) => void;
  onDelete: () => void;
}) {
  const [hours, setHours] = useState(Math.floor(entry.duration / 3600000));
  const [minutes, setMinutes] = useState(Math.floor((entry.duration % 3600000) / 60000));
  const [desc, setDesc] = useState(entry.description || '');
  const dateStr = new Date(entry.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const commitDuration = () => {
    const newDuration = (hours * 3600000) + (minutes * 60000);
    if (newDuration !== entry.duration && newDuration > 0) {
      onUpdate({ duration: newDuration });
    }
  };

  return (
    <div className="task-time-entry-item">
      <span className="task-time-entry-date">{dateStr}</span>
      <input type="number" min={0} className="task-time-entry-edit-input"
        value={hours} onChange={e => setHours(Math.max(0, parseInt(e.target.value) || 0))}
        onBlur={commitDuration} />
      <label>h</label>
      <input type="number" min={0} max={59} className="task-time-entry-edit-input"
        value={minutes} onChange={e => setMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
        onBlur={commitDuration} />
      <label>m</label>
      <input type="text" className="task-time-entry-edit-desc"
        value={desc} onChange={e => setDesc(e.target.value)} placeholder="Note"
        onBlur={() => {
          const trimmed = desc.trim() || undefined;
          if (trimmed !== (entry.description || undefined)) onUpdate({ description: trimmed });
        }} />
      <button className="task-time-entry-delete-btn" onClick={onDelete} title="Delete entry">&times;</button>
    </div>
  );
}

export default function TaskRow({
  task,
  characters,
  scenes,
  tags,
  taskFieldDefs,
  onTaskUpdate,
  onDeleteTask,
  onDuplicateTask,
  activeTimerTaskId,
  onStartTimer,
  onStopTimer,
  onAddTimeEntry,
  onUpdateTimeEntry,
  onDeleteTimeEntry,
  visibleColumns,
}: TaskRowProps) {
  const isVisible = (colId: string) => !visibleColumns || visibleColumns.includes(colId);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTimePopover, setShowTimePopover] = useState(false);
  const [manualHours, setManualHours] = useState(0);
  const [manualMinutes, setManualMinutes] = useState(0);
  const [manualDescription, setManualDescription] = useState('');
  const timePopoverRef = useRef<HTMLDivElement>(null);

  // Click outside to close time entry popover
  useEffect(() => {
    if (!showTimePopover) return;
    function handleClick(e: MouseEvent) {
      if (timePopoverRef.current && !timePopoverRef.current.contains(e.target as Node)) {
        setShowTimePopover(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTimePopover]);

  // Resolve tag objects
  const resolvedTags = task.tags
    .map((tagId) => tags.find((t) => t.id === tagId || t.name === tagId))
    .filter(Boolean);

  // Resolve characters
  const resolvedCharacters = task.characterIds
    .map((cId) => characters.find((c) => c.id === cId))
    .filter(Boolean);

  // Resolve scene
  let sceneLabel = '';
  if (task.sceneKey) {
    const taskScene = scenes.find((s) => s.id === task.sceneKey);
    const char = taskScene ? characters.find((c) => c.id === taskScene.characterId) : null;
    if (char && taskScene) {
      sceneLabel = `${char.name} \u2014 Scene #${taskScene.sceneNumber}`;
    }
  }

  // Time tracked
  const totalTime = task.timeEntries.reduce((sum, e) => sum + e.duration, 0);

  function commitField(field: string, value: unknown) {
    const updated = { ...task, [field]: value, updatedAt: Date.now() };
    onTaskUpdate(updated);
    setEditingColumn(null);
  }

  function commitCustomField(fieldId: string, value: unknown) {
    const updated = {
      ...task,
      customFields: { ...task.customFields, [fieldId]: value },
      updatedAt: Date.now(),
    };
    onTaskUpdate(updated);
    setEditingColumn(null);
  }

  function cancelEdit() {
    setEditingColumn(null);
  }

  return (
    <tr>
      {/* Title */}
      {isVisible('title') && (
      <td
        className={`task-title-cell${editingColumn === 'title' ? ' task-cell-editing' : ''}`}
        onClick={() => editingColumn !== 'title' && setEditingColumn('title')}
      >
        {editingColumn === 'title' ? (
          <InlineTextInput
            value={task.title}
            placeholder="Task title..."
            onCommit={(v) => commitField('title', v)}
            onCancel={cancelEdit}
          />
        ) : (
          task.title || <span style={{ color: 'var(--text-muted)' }}>Untitled</span>
        )}
      </td>
      )}

      {/* Status */}
      {isVisible('status') && (
      <td
        className={editingColumn === 'status' ? 'task-cell-editing' : undefined}
        onClick={() => editingColumn !== 'status' && setEditingColumn('status')}
      >
        {editingColumn === 'status' ? (
          <InlineDropdown
            options={STATUS_OPTIONS}
            value={task.status}
            onCommit={(v) => commitField('status', v)}
            onCancel={cancelEdit}
          />
        ) : (
          <span
            className="task-status-pill"
            style={{ background: STATUS_COLORS[task.status] || '#9e9e9e' }}
          >
            {task.status}
          </span>
        )}
      </td>
      )}

      {/* Priority */}
      {isVisible('priority') && (
      <td
        className={editingColumn === 'priority' ? 'task-cell-editing' : undefined}
        onClick={() => editingColumn !== 'priority' && setEditingColumn('priority')}
      >
        {editingColumn === 'priority' ? (
          <InlineDropdown
            options={PRIORITY_OPTIONS}
            value={task.priority}
            onCommit={(v) => commitField('priority', v)}
            onCancel={cancelEdit}
          />
        ) : (
          <span
            className="task-priority-badge"
            style={{ background: PRIORITY_COLORS[task.priority] || '#9e9e9e' }}
          >
            {task.priority}
          </span>
        )}
      </td>
      )}

      {/* Tags */}
      {isVisible('tags') && (
      <td
        className={editingColumn === 'tags' ? 'task-cell-editing' : undefined}
        onClick={() => editingColumn !== 'tags' && setEditingColumn('tags')}
      >
        {editingColumn === 'tags' ? (
          <TagPicker
            selectedTags={task.tags}
            availableTags={tags}
            onCommit={(v) => commitField('tags', v)}
            onCancel={cancelEdit}
          />
        ) : (
          resolvedTags.map((tag) => (
            <span
              key={tag!.id}
              className="task-tag-pill"
              style={{
                background: TAG_CATEGORY_COLORS[tag!.category]
                  ? `${TAG_CATEGORY_COLORS[tag!.category]}18`
                  : undefined,
                color: TAG_CATEGORY_COLORS[tag!.category] || undefined,
              }}
            >
              {tag!.name}
            </span>
          ))
        )}
      </td>
      )}

      {/* Characters */}
      {isVisible('characters') && (
      <td
        className={editingColumn === 'characters' ? 'task-cell-editing' : undefined}
        onClick={() => editingColumn !== 'characters' && setEditingColumn('characters')}
      >
        {editingColumn === 'characters' ? (
          <CharacterPicker
            selectedIds={task.characterIds}
            characters={characters}
            onCommit={(v) => commitField('characterIds', v)}
            onCancel={cancelEdit}
          />
        ) : (
          resolvedCharacters.map((char) => (
            <span
              key={char!.id}
              className="task-character-pill"
              style={{ background: char!.color || '#666' }}
            >
              {char!.name}
            </span>
          ))
        )}
      </td>
      )}

      {/* Scene */}
      {isVisible('scene') && (
      <td
        className={editingColumn === 'scene' ? 'task-cell-editing' : undefined}
        onClick={() => editingColumn !== 'scene' && setEditingColumn('scene')}
      >
        {editingColumn === 'scene' ? (
          <ScenePicker
            value={task.sceneKey}
            scenes={scenes}
            characters={characters}
            onCommit={(v) => commitField('sceneKey', v)}
            onCancel={cancelEdit}
          />
        ) : (
          sceneLabel
        )}
      </td>
      )}

      {/* Due Date */}
      {isVisible('dueDate') && (
      <td
        className={editingColumn === 'dueDate' ? 'task-cell-editing' : undefined}
        onClick={() => editingColumn !== 'dueDate' && setEditingColumn('dueDate')}
      >
        {editingColumn === 'dueDate' ? (
          <InlineDatePicker
            value={task.dueDate}
            onCommit={(v) => commitField('dueDate', v)}
            onCancel={cancelEdit}
          />
        ) : (
          task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ''
        )}
      </td>
      )}

      {/* Time Tracked */}
      {isVisible('timeTracked') && (
      <td style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className={`task-play-btn ${activeTimerTaskId === task.id ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTimerTaskId === task.id) {
                onStopTimer();
              } else {
                onStartTimer(task.id);
              }
            }}
          >
            {activeTimerTaskId === task.id ? '■' : '▶'}
          </button>
          <span
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              setShowTimePopover(!showTimePopover);
            }}
          >
            {formatDuration(totalTime)}
          </span>
        </div>
        {showTimePopover && (
          <div className="task-time-entry-popover" ref={timePopoverRef}>
            {task.timeEntries.length > 0 && (
              <div className="task-time-entry-list">
                {[...task.timeEntries].reverse().map(entry => (
                  <TimeEntryRow
                    key={entry.id}
                    entry={entry}
                    onUpdate={(updates) => onUpdateTimeEntry(task.id, entry.id, updates)}
                    onDelete={() => onDeleteTimeEntry(task.id, entry.id)}
                  />
                ))}
              </div>
            )}
            <div className="task-time-entry-add-section">
              <div className="task-time-entry-row">
                <input
                  type="number"
                  min={0}
                  value={manualHours}
                  onChange={(e) => setManualHours(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <label>h</label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                />
                <label>m</label>
              </div>
              <input
                className="task-time-entry-desc"
                type="text"
                placeholder="Description (optional)"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
              />
              <button
                className="task-time-entry-add-btn"
                onClick={() => {
                  const duration = (manualHours * 3600000) + (manualMinutes * 60000);
                  if (duration <= 0) return;
                  const entry: TimeEntry = {
                    id: crypto.randomUUID(),
                    startedAt: Date.now(),
                    duration,
                    description: manualDescription || undefined,
                  };
                  onAddTimeEntry(task.id, entry);
                  setManualHours(0);
                  setManualMinutes(0);
                  setManualDescription('');
                  setShowTimePopover(false);
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </td>
      )}

      {/* Time Estimate — number input in hours, stored as ms */}
      {isVisible('timeEstimate') && (
      <td
        className={editingColumn === 'timeEstimate' ? 'task-cell-editing' : undefined}
        onClick={() => editingColumn !== 'timeEstimate' && setEditingColumn('timeEstimate')}
      >
        {editingColumn === 'timeEstimate' ? (
          <InlineNumberInput
            value={task.timeEstimate ? task.timeEstimate / 3600000 : undefined}
            onCommit={(v) => commitField('timeEstimate', v !== undefined ? v * 3600000 : undefined)}
            onCancel={cancelEdit}
          />
        ) : (
          task.timeEstimate ? formatDuration(task.timeEstimate) : ''
        )}
      </td>
      )}

      {/* Custom fields */}
      {taskFieldDefs.filter(def => isVisible(def.id)).map((def) => {
        const value = task.customFields[def.id];
        const isEditing = editingColumn === `custom:${def.id}`;

        if (def.type === 'checkbox') {
          return (
            <td
              key={def.id}
              onClick={() => {
                commitCustomField(def.id, !value);
              }}
              style={{ cursor: 'pointer' }}
            >
              <input type="checkbox" checked={!!value} readOnly style={{ pointerEvents: 'none' }} />
            </td>
          );
        }

        return (
          <td
            key={def.id}
            className={isEditing ? 'task-cell-editing' : undefined}
            style={def.type === 'number' ? { textAlign: 'right' } : undefined}
            onClick={() => !isEditing && setEditingColumn(`custom:${def.id}`)}
          >
            {isEditing ? (
              renderCustomEditor(def, value, commitCustomField, cancelEdit)
            ) : (
              renderCustomField(def, value)
            )}
          </td>
        );
      })}

      {/* Row actions */}
      <td>
        {showDeleteConfirm ? (
          <div className="task-delete-confirm">
            Delete?
            <button
              className="task-delete-confirm-btn danger"
              onClick={() => onDeleteTask(task.id)}
            >
              Yes
            </button>
            <button
              className="task-delete-confirm-btn"
              onClick={() => setShowDeleteConfirm(false)}
            >
              No
            </button>
          </div>
        ) : (
          <div className="task-row-actions">
            <button
              className="task-row-action-btn"
              title="Duplicate task"
              onClick={() => onDuplicateTask(task.id)}
            >
              &#x29C9;
            </button>
            <button
              className="task-row-action-btn danger"
              title="Delete task"
              onClick={() => setShowDeleteConfirm(true)}
            >
              &times;
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function renderCustomEditor(
  def: TaskFieldDef,
  value: unknown,
  onCommit: (fieldId: string, value: unknown) => void,
  onCancel: () => void,
) {
  switch (def.type) {
    case 'text':
      return (
        <InlineTextInput
          value={String(value ?? '')}
          onCommit={(v) => onCommit(def.id, v)}
          onCancel={onCancel}
        />
      );
    case 'number':
      return (
        <InlineNumberInput
          value={value !== undefined && value !== null ? Number(value) : undefined}
          onCommit={(v) => onCommit(def.id, v)}
          onCancel={onCancel}
        />
      );
    case 'dropdown':
      return (
        <InlineDropdown
          options={(def.options || []).map((opt) => ({ value: opt, label: opt }))}
          value={String(value ?? '')}
          onCommit={(v) => onCommit(def.id, v)}
          onCancel={onCancel}
        />
      );
    case 'date':
      return (
        <InlineDatePicker
          value={value as number | undefined}
          onCommit={(v) => onCommit(def.id, v)}
          onCancel={onCancel}
        />
      );
    default:
      return null;
  }
}

function renderCustomField(def: TaskFieldDef, value: unknown) {
  if (value === undefined || value === null) return null;

  switch (def.type) {
    case 'text':
      return String(value);
    case 'number':
      return String(value);
    case 'checkbox':
      return <input type="checkbox" checked={!!value} disabled />;
    case 'dropdown':
      return String(value);
    case 'date':
      return value ? new Date(value as number | string).toLocaleDateString() : '';
    default:
      return String(value);
  }
}
