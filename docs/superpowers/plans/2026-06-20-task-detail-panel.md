# Task Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `+ New Task` button to the app toolbar and a right-side task detail panel that opens in create mode from any screen and in edit mode when clicking a task row in TasksView.

**Architecture:** A new `TaskDetailPanel` component renders as a full-height overlay sliding in from the right. App.tsx holds `taskPanelOpen` + `taskPanelTaskId` state and passes open/close handlers down. TaskRow click behavior is updated to open the panel instead of inline-editing the title cell.

**Tech Stack:** React + TypeScript, Electron, existing `Task` type from `src/shared/types.ts`, existing IPC handlers `handleCreateTask` / `handleUpdateTask` / `handleTasksChange` in App.tsx.

## Global Constraints

- Never import `React` — codebase uses `react-jsx` transform; use named hooks only
- IPC return shape: `{ success: boolean, data?: T, error?: string }`
- Task create calls `handleTasksChange([...tasks, newTask])` then `handleCreateTask(newTask)` — both required
- Task update calls `handleUpdateTask(task)` which fires `task.setFields` IPC
- `isDirtyRef.current = true` is set inside `handleTasksChange` — no need to set it separately
- `better-sqlite3` is main-process only; never import from renderer
- CSS goes in `src/renderer/styles.css` — no CSS modules, no Tailwind
- No test framework exists — verification is manual in the Electron app (`npm run dev`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/components/tasks/TaskDetailPanel.tsx` | **Create** | Full task detail panel — create + edit modes, two-column layout, subtasks |
| `src/renderer/App.tsx` | **Modify** | Add panel state, `+ New Task` button in toolbar, render `<TaskDetailPanel>` |
| `src/renderer/components/tasks/TaskRow.tsx` | **Modify** | Make entire row clickable to open panel; remove title-cell inline-edit trigger |
| `src/renderer/components/tasks/TaskTable.tsx` | **Modify** | Pass `onOpenTaskPanel` down to each `TaskRow`; highlight selected row |
| `src/renderer/components/tasks/TasksView.tsx` | **Modify** | Accept + thread `onOpenTaskPanel` prop |
| `src/renderer/styles.css` | **Modify** | Panel slide-in animation, two-column layout, field rows, subtask list styles |

---

## Task 1: TaskDetailPanel shell + styles

**Files:**
- Create: `src/renderer/components/tasks/TaskDetailPanel.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces:
  ```ts
  interface TaskDetailPanelProps {
    isOpen: boolean;
    task: Task | null;           // null = create mode
    tasks: Task[];               // full list, needed for subtask parent resolution
    characters: Character[];
    tags: Tag[];
    scenes: Scene[];
    taskFieldDefs: TaskFieldDef[];
    onClose: () => void;
    onCreateTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void;
    onTasksChange: (tasks: Task[]) => void;
  }
  export default function TaskDetailPanel(props: TaskDetailPanelProps): JSX.Element
  ```

- [ ] **Step 1: Create the component shell**

Create `src/renderer/components/tasks/TaskDetailPanel.tsx`:

```tsx
import { useEffect, useRef } from 'react';
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
```

- [ ] **Step 2: Add panel CSS to styles.css**

Append to `src/renderer/styles.css`:

```css
/* ── TaskDetailPanel ────────────────────────────────────────────────────────── */

.task-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: transparent;
}

.task-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 560px;
  height: 100vh;
  z-index: 301;
  background: var(--bg-primary, #fff);
  border-left: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  animation: task-panel-slide-in 0.18s ease-out;
}

@keyframes task-panel-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

.task-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  flex-shrink: 0;
}

.task-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.task-panel-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #888);
  font-size: 16px;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}
.task-panel-close:hover { background: var(--bg-hover, #f0f0f0); }

.task-panel-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.task-panel-left {
  flex: 0 0 60%;
  padding: 20px 18px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-panel-right {
  flex: 0 0 40%;
  padding: 16px 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-panel-footer {
  display: flex;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-color, #e0e0e0);
  flex-shrink: 0;
}

.task-panel-create-btn {
  background: var(--accent, #6c47ff);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.task-panel-create-btn:hover:not(:disabled) { opacity: 0.88; }
.task-panel-create-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.task-panel-cancel-btn {
  background: none;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary, #333);
}
.task-panel-cancel-btn:hover { background: var(--bg-hover, #f0f0f0); }
```

- [ ] **Step 3: Wire panel into App.tsx (skeleton only)**

In `src/renderer/App.tsx`, add the import near the other task imports:

```tsx
import TaskDetailPanel from './components/tasks/TaskDetailPanel';
```

Add two state variables near the other task-related state (~line 301):

```tsx
const [taskPanelOpen, setTaskPanelOpen] = useState(false);
const [taskPanelTaskId, setTaskPanelTaskId] = useState<string | null>(null);
```

Add a helper just below those:

```tsx
const taskPanelTask = taskPanelTaskId ? tasks.find(t => t.id === taskPanelTaskId) ?? null : null;
```

At the bottom of the App JSX (before the final closing `</div>`), add:

```tsx
<TaskDetailPanel
  isOpen={taskPanelOpen}
  task={taskPanelTask}
  tasks={tasks}
  characters={projectData?.characters ?? []}
  tags={projectData?.tags ?? []}
  scenes={projectData ? getAllScenes(projectData) : []}
  taskFieldDefs={taskFieldDefs}
  onClose={() => { setTaskPanelOpen(false); setTaskPanelTaskId(null); }}
  onCreateTask={() => {}}
  onUpdateTask={() => {}}
  onTasksChange={handleTasksChange}
/>
```

Note: `getAllScenes` may already exist in App.tsx — grep for it. If not, use: `projectData.characters.flatMap(c => c.scenes)`.

- [ ] **Step 4: Add `+ New Task` button to toolbar**

In App.tsx, find `<div className="toolbar-right">` (~line 4921). Add this button at the very start of that div, before the `saveStatus` indicator:

```tsx
{projectData && (
  <>
    <button
      className="toolbar-btn toolbar-btn--primary"
      onClick={() => { setTaskPanelTaskId(null); setTaskPanelOpen(true); }}
    >
      + New Task
    </button>
    <div className="toolbar-divider" />
  </>
)}
```

- [ ] **Step 5: Run the app and verify the shell**

```bash
npm run dev
```

Expected: App launches. `+ New Task` button appears in the toolbar on every screen. Clicking it slides in the panel from the right. Clicking the backdrop or ✕ button closes it. Pressing Escape closes it. Panel shows placeholder text in both columns.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskDetailPanel.tsx src/renderer/styles.css src/renderer/App.tsx
git commit -m "feat: task detail panel shell + slide-in animation"
```

---

## Task 2: TaskDetailPanel — left column (title + description)

**Files:**
- Modify: `src/renderer/components/tasks/TaskDetailPanel.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `TaskDetailPanelProps` from Task 1
- Produces: Local draft state `draftTitle: string`, `draftDescription: string`; title input auto-focuses in create mode

- [ ] **Step 1: Add draft state and title input**

Replace the component body in `TaskDetailPanel.tsx`. Add state and refs at the top of the component function:

```tsx
import { useEffect, useRef, useState } from 'react';

// Inside component:
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
```

Replace the `.task-panel-left` content:

```tsx
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
    placeholder="Add a description…"
    value={draftDescription}
    onChange={e => setDraftDescription(e.target.value)}
    onBlur={() => {
      if (!isCreateMode && task) {
        onUpdateTask({ ...task, description: draftDescription, updatedAt: Date.now() });
      }
    }}
  />
</div>
```

- [ ] **Step 2: Add title + description CSS**

Append to `src/renderer/styles.css`:

```css
.task-panel-title-input {
  width: 100%;
  font-size: 18px;
  font-weight: 600;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary, #333);
  padding: 0;
  resize: none;
  font-family: inherit;
}
.task-panel-title-input::placeholder { color: var(--text-muted, #aaa); }

.task-panel-description {
  width: 100%;
  min-height: 140px;
  font-size: 13px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary, #333);
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
  padding: 0;
}
.task-panel-description::placeholder { color: var(--text-muted, #aaa); }
```

- [ ] **Step 3: Verify in app**

```bash
npm run dev
```

Expected: Clicking `+ New Task` shows the panel with a large title input (auto-focused) and a description textarea below it. Typing in both works.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/tasks/TaskDetailPanel.tsx src/renderer/styles.css
git commit -m "feat: task panel title + description inputs"
```

---

## Task 3: TaskDetailPanel — right column (metadata fields)

**Files:**
- Modify: `src/renderer/components/tasks/TaskDetailPanel.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `task`, `characters`, `tags`, `scenes` props; `STATUS_OPTIONS` / `PRIORITY_OPTIONS` constants (define locally — do not import from TaskRow, they are not exported)
- Produces: In edit mode, each field change calls `onUpdateTask({ ...task, [field]: value, updatedAt: Date.now() })`; draft state mirrors field values

- [ ] **Step 1: Add constants and draft field state**

At the top of `TaskDetailPanel.tsx`, add the constants (these mirror TaskRow.tsx — define them here independently):

```tsx
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
```

Add draft state for metadata fields inside the component:

```tsx
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
```

Extend the `useEffect` that syncs on `task?.id` to also reset these:

```tsx
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
```

- [ ] **Step 2: Helper to commit a field in edit mode**

Add this helper inside the component (after state declarations):

```tsx
function commitField(updates: Partial<Task>) {
  if (!isCreateMode && task) {
    onUpdateTask({ ...task, ...updates, updatedAt: Date.now() });
  }
}
```

- [ ] **Step 3: Replace the right column content**

Replace the `.task-panel-right` div content:

```tsx
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
```

- [ ] **Step 4: Add right-column CSS**

Append to `src/renderer/styles.css`:

```css
.task-panel-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}
.task-panel-field-row--wrap {
  align-items: flex-start;
  flex-direction: column;
  gap: 6px;
}
.task-panel-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  min-width: 90px;
}
.task-panel-field-row--wrap .task-panel-field-label { min-width: unset; }

.task-panel-field-select,
.task-panel-field-date,
.task-panel-field-number {
  background: transparent;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-primary, #333);
  cursor: pointer;
  outline: none;
}
.task-panel-field-select:hover,
.task-panel-field-date:hover,
.task-panel-field-number:hover {
  border-color: var(--accent, #6c47ff);
}
.task-panel-field-number { width: 70px; }

.task-panel-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.task-panel-tag-chip {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 20px;
  border: 1px solid var(--border-color, #e0e0e0);
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary, #555);
  transition: background 0.12s, border-color 0.12s;
}
.task-panel-tag-chip:hover { border-color: var(--accent, #6c47ff); }
.task-panel-tag-chip.active {
  background: var(--accent, #6c47ff);
  border-color: var(--accent, #6c47ff);
  color: #fff;
}
```

- [ ] **Step 5: Verify metadata fields in app**

```bash
npm run dev
```

Expected: Panel right column shows Status, Priority, Due date, Estimate, Tags, and Characters fields. Dropdowns change value visually. Tags and Characters toggle on/off as chips. In edit mode (after Task 6 wires row clicks), changes to status/priority immediately update the row in the table behind the panel.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskDetailPanel.tsx src/renderer/styles.css
git commit -m "feat: task panel metadata fields (status, priority, date, tags, characters)"
```

---

## Task 4: TaskDetailPanel — subtasks section

**Files:**
- Modify: `src/renderer/components/tasks/TaskDetailPanel.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `task.subtasks: Task[]`, `tasks` (full list for subtask display), `onTasksChange`
- In create mode: subtasks are collected in local draft state and attached to the new task on create
- In edit mode: adding a subtask calls `onTasksChange` immediately

- [ ] **Step 1: Add subtask draft state**

Inside the component, add:

```tsx
const [draftSubtasks, setDraftSubtasks] = useState<Array<{ id: string; title: string }>>([]);
const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
const subtaskInputRef = useRef<HTMLInputElement>(null);

// Reset subtasks when task changes
useEffect(() => {
  setDraftSubtasks([]);
  setNewSubtaskTitle('');
}, [task?.id]);
```

- [ ] **Step 2: Add subtask handlers**

```tsx
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
```

- [ ] **Step 3: Add subtask section to left column**

Add this section below the `<textarea>` in `.task-panel-left`:

```tsx
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
```

- [ ] **Step 4: Add subtask CSS**

Append to `src/renderer/styles.css`:

```css
.task-panel-section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
  display: block;
}

.task-panel-subtasks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.task-panel-subtask-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.task-panel-subtask-check {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted, #aaa);
  padding: 0;
  flex-shrink: 0;
}

.task-panel-subtask-title {
  font-size: 13px;
  color: var(--text-primary, #333);
  flex: 1;
}

.task-panel-subtask-remove {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-muted, #aaa);
  padding: 0 3px;
  opacity: 0;
  transition: opacity 0.1s;
}
.task-panel-subtask-row:hover .task-panel-subtask-remove { opacity: 1; }

.task-panel-subtask-add { margin-top: 4px; }

.task-panel-subtask-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--border-color, #e0e0e0);
  outline: none;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary, #333);
  padding: 4px 0;
}
.task-panel-subtask-input::placeholder { color: var(--text-muted, #aaa); }
.task-panel-subtask-input:focus { border-bottom-color: var(--accent, #6c47ff); }
```

- [ ] **Step 5: Verify subtasks in app**

```bash
npm run dev
```

Expected: In create mode, typing into the subtask input and pressing Enter adds a subtask to the list. The ✕ button removes draft subtasks. (Subtasks won't be saved yet until Task 5 wires the create button.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskDetailPanel.tsx src/renderer/styles.css
git commit -m "feat: task panel subtasks section"
```

---

## Task 5: Wire create mode — "Create Task" button

**Files:**
- Modify: `src/renderer/components/tasks/TaskDetailPanel.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `onCreateTask: (task: Task) => void`, `onTasksChange`, `draftSubtasks`, all draft field state
- Produces: Fully constructed `Task` object passed to `onCreateTask`; panel closes after creation

- [ ] **Step 1: Build handleCreate inside the component**

Add this function inside `TaskDetailPanel`:

```tsx
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
    parentTaskId: null, // will be set to new task id after creation — handled by caller
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
    subtasks: subtasks.map(s => ({ ...s, parentTaskId: null })),
  };

  onCreateTask(newTask);
  onClose();
}
```

- [ ] **Step 2: Enable and wire the Create Task button**

Update the footer button:

```tsx
<button
  className="task-panel-create-btn"
  disabled={!draftTitle.trim()}
  onClick={handleCreate}
>
  Create Task
</button>
```

- [ ] **Step 3: Wire onCreateTask in App.tsx**

Update the `<TaskDetailPanel>` in App.tsx to pass real handlers:

```tsx
<TaskDetailPanel
  isOpen={taskPanelOpen}
  task={taskPanelTask}
  tasks={tasks}
  characters={projectData?.characters ?? []}
  tags={projectData?.tags ?? []}
  scenes={projectData ? projectData.characters.flatMap(c => c.scenes) : []}
  taskFieldDefs={taskFieldDefs}
  onClose={() => { setTaskPanelOpen(false); setTaskPanelTaskId(null); }}
  onCreateTask={(newTask) => {
    handleTasksChange([...tasksRef.current, newTask]);
    handleCreateTask(newTask);
  }}
  onUpdateTask={handleUpdateTask}
  onTasksChange={handleTasksChange}
/>
```

- [ ] **Step 4: Verify task creation end-to-end**

```bash
npm run dev
```

1. Open any project with at least one task
2. Click `+ New Task` in toolbar
3. Type a title, fill in status, priority, add a tag, add a subtask
4. Click **Create Task**
5. Panel closes; switch to Tasks view — the new task appears at the bottom of the list with correct status/priority
6. The subtasks show in the TasksView row (expand toggle)
7. Save + reload the project — the task persists

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/tasks/TaskDetailPanel.tsx src/renderer/App.tsx
git commit -m "feat: task panel create mode - full task creation flow"
```

---

## Task 6: TasksView row click → open panel in edit mode

**Files:**
- Modify: `src/renderer/components/tasks/TaskRow.tsx`
- Modify: `src/renderer/components/tasks/TaskTable.tsx`
- Modify: `src/renderer/components/tasks/TasksView.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- New prop on `TaskRowProps`: `onOpenPanel?: () => void`
- New prop on `TaskTable`: `onOpenTaskPanel?: (taskId: string) => void`; `activePanelTaskId?: string`
- New prop on `TasksView`: `onOpenTaskPanel?: (taskId: string) => void`; `activePanelTaskId?: string`

- [ ] **Step 1: Add onOpenPanel prop to TaskRow**

In `TaskRow.tsx`, add to `TaskRowProps`:

```ts
onOpenPanel?: () => void;
activePanelTaskId?: string;
```

Add to the destructured props in the function signature:

```ts
onOpenPanel,
activePanelTaskId,
```

Find where the title cell is rendered (search for `editingColumn === 'title'` or `'title'` in the row render). The title cell currently has a click handler that sets `editingColumn`. Change it so that clicking the title cell (when not already editing) calls `onOpenPanel` instead:

```tsx
// Find the title cell — it looks roughly like:
// <td ... onClick={() => setEditingColumn('title')}>
// Change to:
<td
  className={`task-cell task-cell--title ${activePanelTaskId === task.id ? 'task-row--panel-active' : ''}`}
  style={{ cursor: 'pointer' }}
  onClick={() => onOpenPanel?.()}
>
  {/* Keep the display of the title as-is (not the editing input) */}
  <span className="task-title-text">{task.title || <span style={{ color: 'var(--text-muted)' }}>Untitled</span>}</span>
</td>
```

Note: The exact existing markup for the title cell will vary — read the current `TaskRow.tsx` render to find the title `<td>` and its onClick. Replace only the `onClick` and add the `style` and `className` update; keep all other attributes.

- [ ] **Step 2: Highlight the active row**

Append to `src/renderer/styles.css`:

```css
.task-row--panel-active .task-cell--title {
  background: var(--accent-light, #f0ecff);
}
```

- [ ] **Step 3: Thread prop through TaskTable**

In `TaskTable.tsx`, add to the component props interface:

```ts
onOpenTaskPanel?: (taskId: string) => void;
activePanelTaskId?: string;
```

Pass them down to each `<TaskRow>`:

```tsx
<TaskRow
  ...existing props...
  onOpenPanel={() => onOpenTaskPanel?.(task.id)}
  activePanelTaskId={activePanelTaskId}
/>
```

Do the same for subtask `<TaskRow>` renders (search for all `<TaskRow` instances in the file).

- [ ] **Step 4: Thread prop through TasksView**

In `TasksView.tsx`, add to the component props interface:

```ts
onOpenTaskPanel?: (taskId: string) => void;
activePanelTaskId?: string;
```

Pass them down to `<TaskTable>`:

```tsx
<TaskTable
  ...existing props...
  onOpenTaskPanel={onOpenTaskPanel}
  activePanelTaskId={activePanelTaskId}
/>
```

- [ ] **Step 5: Wire from App.tsx**

Find where `<TasksView>` is rendered in App.tsx (~line 4016) and add:

```tsx
<TasksView
  ...existing props...
  onOpenTaskPanel={(taskId) => { setTaskPanelTaskId(taskId); setTaskPanelOpen(true); }}
  activePanelTaskId={taskPanelTaskId ?? undefined}
/>
```

- [ ] **Step 6: Verify row click behavior**

```bash
npm run dev
```

1. Switch to Tasks view
2. Click any task row's title — the panel slides in from the right showing that task's data
3. All metadata fields show the task's current values
4. Changing status in the panel updates it immediately (the row behind the panel reflects the change)
5. Click a different task row — the panel updates to show the new task without closing
6. Clicking ✕ or pressing Escape closes the panel
7. The active task row has a subtle highlight on its title cell

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/tasks/TaskRow.tsx src/renderer/components/tasks/TaskTable.tsx src/renderer/components/tasks/TasksView.tsx src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: click task row to open detail panel in edit mode"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `+ New Task` button in toolbar on every screen | Task 1, Step 4 |
| Button opens panel in create mode | Task 1, Step 3 |
| Panel is full-height right-side overlay | Task 1, Step 2 |
| Left column: title, description, subtasks | Tasks 2, 4 |
| Right column: status, priority, due date, estimate, tags, characters | Task 3 |
| Create mode: Create Task + Cancel buttons | Task 5 |
| Edit mode: auto-saves on change | Task 3 (commitField on blur/change), Task 6 |
| No footer in edit mode | Task 1 (footer gated on isCreateMode) |
| Click task row title → opens panel in edit mode | Task 6 |
| Panel overlays table (doesn't push it) | Task 1, Step 2 (fixed positioning) |
| Panel stays pinned while clicking between rows | Task 6, Step 5 (setTaskPanelTaskId without closing) |
| Escape closes panel | Task 1, Step 1 |
| Panel header shows "New Task" or task title | Task 1, Step 1 |

**No placeholders found.**

**Type consistency:** `Task['status']` and `Task['priority']` casts used consistently. `commitField` signature is `Partial<Task>` — consistent with `{ ...task, ...updates }` spread pattern. `onOpenPanel` is optional (`?`) everywhere it's threaded.
