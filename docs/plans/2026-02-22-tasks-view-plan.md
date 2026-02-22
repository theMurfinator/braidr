# Tasks View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a ClickUp-style task management table view that merges/upgrades existing scene todos, with inline-editable cells, custom columns, grouping, filtering, saved views, and time tracking.

**Architecture:** Tasks stored as new keys on `TimelineData` in `timeline.json`, persisted via existing `saveTimeline()`. New `TasksView` top-level view following the same pattern as `NotesView`. No new IPC channels or DataService methods needed — the main process writes the data object as-is.

**Tech Stack:** React, TypeScript, existing Braidr component patterns. No new dependencies.

**Design doc:** `docs/plans/2026-02-22-tasks-view-design.md`

---

### Task 1: Add Task Types to Shared Types

**Files:**
- Modify: `src/shared/types.ts:85-118` (TimelineData interface)

**Step 1: Add task type definitions after line 118**

Add these types after the `TimelineData` closing brace (line 118), before `SceneComment` (line 120):

```typescript
// ── Task Management ──────────────────────────────────────────────────────────

export type TaskStatus = 'open' | 'in-progress' | 'done';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface TimeEntry {
  id: string;
  startedAt: number;
  duration: number;
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  characterIds: string[];
  sceneKey?: string;
  timeEntries: TimeEntry[];
  timeEstimate?: number;
  dueDate?: number;
  createdAt: number;
  updatedAt: number;
  order: number;
  customFields: Record<string, unknown>;
}

export type TaskFieldType = 'text' | 'number' | 'checkbox' | 'dropdown' | 'date';

export interface TaskFieldDef {
  id: string;
  name: string;
  type: TaskFieldType;
  options?: string[];
  width?: number;
}

export interface TaskViewConfig {
  id: string;
  name: string;
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: TaskFilter[];
  visibleColumns?: string[];
}

export interface TaskFilter {
  field: string;
  operator: 'is' | 'is_not' | 'contains' | 'is_set' | 'is_not_set';
  value?: string | string[];
}
```

**Step 2: Add task keys to TimelineData interface**

Inside the `TimelineData` interface (before line 118's closing `}`), add:

```typescript
  // Task management
  tasks?: Task[];
  taskFieldDefs?: TaskFieldDef[];
  taskViews?: TaskViewConfig[];
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors (pre-existing errors are fine, just no new ones referencing Task types).

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(tasks): add Task, TaskFieldDef, TaskViewConfig types to shared types"
```

---

### Task 2: Wire Up Task State in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx:34` (ViewMode type)
- Modify: `src/renderer/App.tsx:230-231` (state declarations area)
- Modify: `src/renderer/App.tsx:831-841` (load from timeline)
- Modify: `src/renderer/App.tsx:2040` (saveTimeline call)

**Step 1: Add 'tasks' to ViewMode**

At line 34, change:
```typescript
type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'analytics' | 'account';
```
to:
```typescript
type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'tasks' | 'analytics' | 'account';
```

**Step 2: Add task state variables**

Near line 230 (where `inlineTodos` state is declared), add:

```typescript
const [tasks, setTasks] = useState<Task[]>([]);
const tasksRef = useRef<Task[]>([]);
const [taskFieldDefs, setTaskFieldDefs] = useState<TaskFieldDef[]>([]);
const taskFieldDefsRef = useRef<TaskFieldDef[]>([]);
const [taskViews, setTaskViews] = useState<TaskViewConfig[]>([]);
const taskViewsRef = useRef<TaskViewConfig[]>([]);
```

Add the imports at the top of the file for `Task`, `TaskFieldDef`, `TaskViewConfig` from `../../shared/types`.

**Step 3: Load tasks from timeline data**

Near line 841 (after loading inlineTodos), add:

```typescript
// Load tasks
const loadedTasks = (data as any).tasks || [];
setTasks(loadedTasks);
tasksRef.current = loadedTasks;
const loadedTaskFieldDefs = (data as any).taskFieldDefs || [];
setTaskFieldDefs(loadedTaskFieldDefs);
taskFieldDefsRef.current = loadedTaskFieldDefs;
const loadedTaskViews = (data as any).taskViews || [];
setTaskViews(loadedTaskViews);
taskViewsRef.current = loadedTaskViews;
```

Note: Using `(data as any)` because the `loadProject` return type doesn't include task fields yet. This matches how other optional fields are loaded.

**Step 4: Include tasks in saveTimeline calls**

The `saveTimeline` function takes positional args that get bundled into a data object by `ElectronDataService`, which then calls `window.electronAPI.saveTimeline(projectPath, { ...allTheFields })`. Since the main process (`main.ts:629-633`) just does `JSON.stringify(data)`, we need to pass tasks through.

**Option A (clean):** Refactor `saveTimeline` to accept a single options object. But this touches many call sites and is a large change.

**Option B (pragmatic):** Add tasks to the data object in `ElectronDataService.saveTimeline`. Since `ElectronDataService` already bundles all the positional args into an object literal, we can attach tasks to that object.

Go with **Option B**. In `src/renderer/services/dataService.ts:187`, the implementation does:
```typescript
const result = await window.electronAPI.saveTimeline(this.projectPath, { positions, connections, chapters, ... });
```

We need to pass task data alongside. The cleanest way: add a `setTaskData` method on the data service that stores a reference, then include it in the save call. But simpler: just add tasks as extra params to `saveTimeline`.

Actually, the simplest approach: add `tasks`, `taskFieldDefs`, `taskViews` as additional optional parameters to `saveTimeline` on both the interface and implementation.

In `src/renderer/services/dataService.ts`, update the `saveTimeline` signature (line 10) to add at the end:
```typescript
..., sceneComments?: Record<string, SceneComment[]>, tasks?: Task[], taskFieldDefs?: TaskFieldDef[], taskViews?: TaskViewConfig[]): Promise<void>;
```

In the implementation (line 182), add the same three params and include them in the object:
```typescript
const result = await window.electronAPI.saveTimeline(this.projectPath, { positions, connections, chapters, characterColors, wordCounts, fontSettings, archivedScenes, draftContent, metadataFieldDefs, sceneMetadata, drafts, wordCountGoal, allFontSettings, scratchpad, sceneComments, tasks, taskFieldDefs, taskViews });
```

Then update the two `saveTimeline()` call sites in `App.tsx` (lines ~1243 and ~2040) to pass `tasksRef.current, taskFieldDefsRef.current, taskViewsRef.current` as the last three args.

**Step 5: Add task mutation callbacks**

In App.tsx, add helper functions (near where todo-related handlers are):

```typescript
const handleTasksChange = useCallback((newTasks: Task[]) => {
  setTasks(newTasks);
  tasksRef.current = newTasks;
  isDirtyRef.current = true;
}, []);

const handleTaskFieldDefsChange = useCallback((newDefs: TaskFieldDef[]) => {
  setTaskFieldDefs(newDefs);
  taskFieldDefsRef.current = newDefs;
  isDirtyRef.current = true;
}, []);

const handleTaskViewsChange = useCallback((newViews: TaskViewConfig[]) => {
  setTaskViews(newViews);
  taskViewsRef.current = newViews;
  isDirtyRef.current = true;
}, []);
```

**Step 6: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -i task`

Expected: No new task-related errors.

**Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/services/dataService.ts
git commit -m "feat(tasks): wire up task state, load/save in App.tsx and DataService"
```

---

### Task 3: Create TasksView Shell + Sidebar Button

**Files:**
- Create: `src/renderer/components/tasks/TasksView.tsx`
- Modify: `src/renderer/App.tsx:2925-2938` (sidebar buttons)
- Modify: `src/renderer/App.tsx:3320-3328` (view rendering)
- Modify: `src/renderer/styles.css` (basic layout styles)

**Step 1: Create the TasksView shell component**

Create `src/renderer/components/tasks/TasksView.tsx`:

```tsx
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
```

**Step 2: Add sidebar button in App.tsx**

After the notes sidebar button (line ~2938), add:

```tsx
<button
  className={`app-sidebar-btn ${viewMode === 'tasks' ? 'active' : ''}`}
  onClick={() => setViewMode('tasks')}
  title="Tasks"
  aria-label="Tasks view"
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
  <span className="app-sidebar-label">Tasks</span>
</button>
```

**Step 3: Add view rendering conditional**

After the `viewMode === 'notes'` conditional (line ~3328), add:

```tsx
) : viewMode === 'tasks' ? (
  <TasksView
    tasks={tasks}
    taskFieldDefs={taskFieldDefs}
    taskViews={taskViews}
    tags={projectData.tags}
    characters={projectData.characters}
    scenes={projectData.scenes}
    onTasksChange={handleTasksChange}
    onTaskFieldDefsChange={handleTaskFieldDefsChange}
    onTaskViewsChange={handleTaskViewsChange}
  />
```

Add the import at the top of App.tsx:
```typescript
import TasksView from './components/tasks/TasksView';
```

**Step 4: Add basic CSS**

At the end of `src/renderer/styles.css` (or near notes-view styles around line 8835), add:

```css
/* ─── Tasks View ─────────────────────────────────────────────────────────── */

.tasks-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tasks-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tasks-toolbar-title {
  font-size: 16px;
  font-weight: 600;
  font-family: var(--font-ui);
  color: var(--text-primary);
  margin: 0;
}

.tasks-toolbar-count {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
}

.tasks-table-wrap {
  flex: 1;
  overflow: auto;
}
```

**Step 5: Verify manually**

Run: `cd /Users/brian/braidr && npm run dev`

Expected: New "Tasks" button in sidebar. Clicking it shows the placeholder view with "Task table coming soon."

**Step 6: Commit**

```bash
git add src/renderer/components/tasks/TasksView.tsx src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat(tasks): add TasksView shell component with sidebar button"
```

---

### Task 4: Build TaskTable with Built-in Columns

**Files:**
- Create: `src/renderer/components/tasks/TaskTable.tsx`
- Create: `src/renderer/components/tasks/TaskRow.tsx`
- Modify: `src/renderer/components/tasks/TasksView.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Create TaskRow component**

Create `src/renderer/components/tasks/TaskRow.tsx` — renders one task as a table row with cells for each built-in column. Each cell is read-only for now (inline editing comes in Task 5).

Built-in columns to render:
- Title (bold text)
- Status (colored pill)
- Priority (flag icon + color)
- Tags (colored pills)
- Characters (name pills with character colors)
- Scene (label)
- Due Date (formatted)
- Time Tracked (summary)
- Time Estimate (formatted)

Status colors: `open` = `#9e9e9e`, `in-progress` = `#2196f3`, `done` = `#4caf50`
Priority colors: `none` = `#9e9e9e`, `low` = `#8bc34a`, `medium` = `#ff9800`, `high` = `#f44336`, `urgent` = `#9c27b0`

Helper for formatting milliseconds: `formatDuration(ms: number)` → "2h 15m" or "45m" or "0m"

The component should accept: `task`, `characters`, `tags`, `scenes`, `taskFieldDefs`, `onTaskUpdate` callback.

Custom field columns: iterate `taskFieldDefs` and render `task.customFields[def.id]` based on `def.type`.

**Step 2: Create TaskTable component**

Create `src/renderer/components/tasks/TaskTable.tsx` — renders a `<table>` with:
- Header row with column names
- Task rows using `TaskRow`
- "+ Add task" row at the bottom

Props: same as TasksView passes down, plus the current view config for column visibility.

The "+ Add task" button creates a new task with defaults:
```typescript
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
```

Define the built-in column list as a constant:
```typescript
const BUILTIN_COLUMNS = [
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
```

**Step 3: Update TasksView to use TaskTable**

Replace placeholder content in `TasksView.tsx` with `<TaskTable ... />`.

**Step 4: Add table CSS**

```css
.tasks-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-ui);
  font-size: 13px;
  table-layout: fixed;
}

.tasks-table th {
  text-align: left;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-primary);
  z-index: 2;
  user-select: none;
  white-space: nowrap;
}

.tasks-table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-light, var(--border));
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tasks-table tr:hover td {
  background: var(--bg-secondary);
}

.task-title-cell {
  font-weight: 600;
  color: var(--text-primary);
}

.task-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.task-priority-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.task-tag-pill {
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  margin-right: 4px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.task-character-pill {
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  margin-right: 4px;
  color: #fff;
  font-weight: 500;
}

.task-add-row {
  padding: 8px 12px;
}

.task-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: none;
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.task-add-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
```

**Step 5: Verify manually**

Run dev. Navigate to Tasks view. Should see an empty table with column headers and "+ Add task" button. Click it — should add a row.

**Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskTable.tsx src/renderer/components/tasks/TaskRow.tsx src/renderer/components/tasks/TasksView.tsx src/renderer/styles.css
git commit -m "feat(tasks): add TaskTable and TaskRow with built-in columns"
```

---

### Task 5: Add Inline Cell Editors

**Files:**
- Create: `src/renderer/components/tasks/TaskCellEditors.tsx`
- Modify: `src/renderer/components/tasks/TaskRow.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Create TaskCellEditors**

Create `src/renderer/components/tasks/TaskCellEditors.tsx` with these inline editor components:

- **`InlineTextInput`** — shown when you click a text cell. Renders an `<input>` that auto-focuses, commits on Enter/blur, cancels on Escape.
- **`InlineDropdown`** — a positioned dropdown menu for status, priority, and custom dropdown fields. Shows options list, closes on selection or outside click.
- **`InlineDatePicker`** — an `<input type="date">` overlay that opens on click.
- **`InlineNumberInput`** — like text input but `type="number"`.
- **`TagPicker`** — a dropdown showing available tags with checkboxes for multi-select. Reuses the existing tag names from props.
- **`CharacterPicker`** — a dropdown showing available characters with checkboxes for multi-select. Shows character colors.
- **`ScenePicker`** — a dropdown showing available scenes grouped by character.

Each editor follows the pattern:
```tsx
interface InlineEditorProps<T> {
  value: T;
  onCommit: (value: T) => void;
  onCancel: () => void;
}
```

**Step 2: Wire editors into TaskRow**

Update `TaskRow.tsx` to track which cell is being edited via `editingColumn` state. Clicking a cell sets it to editing mode, rendering the appropriate editor. On commit, call `onTaskUpdate` with the updated task.

**Step 3: Add editor CSS**

```css
.task-cell-editing {
  position: relative;
}

.task-inline-input {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  font-size: 13px;
  font-family: var(--font-ui);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
}

.task-inline-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 160px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 50;
  overflow: hidden;
  max-height: 240px;
  overflow-y: auto;
}

.task-inline-dropdown-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  cursor: pointer;
}

.task-inline-dropdown-option:hover {
  background: var(--bg-tertiary);
}

.task-inline-dropdown-option.active {
  font-weight: 600;
}

.task-picker-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  cursor: pointer;
}

.task-picker-checkbox:hover {
  background: var(--bg-tertiary);
}
```

**Step 4: Verify manually**

Run dev. Click on each cell type — should be able to edit title, change status, set priority, pick tags, pick characters, pick scene, set due date.

**Step 5: Commit**

```bash
git add src/renderer/components/tasks/TaskCellEditors.tsx src/renderer/components/tasks/TaskRow.tsx src/renderer/styles.css
git commit -m "feat(tasks): add inline cell editors for all column types"
```

---

### Task 6: Add Custom Field Management

**Files:**
- Create: `src/renderer/components/tasks/TaskFieldManager.tsx`
- Modify: `src/renderer/components/tasks/TaskTable.tsx`
- Modify: `src/renderer/components/tasks/TaskRow.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Create TaskFieldManager**

A modal dialog triggered by clicking "+ New Field" in the table header. Provides:
- Text input for field name
- Type selector (text, number, checkbox, dropdown, date)
- If dropdown: an options list editor (add/remove/reorder options)
- "Create" and "Cancel" buttons

On create, generates a new `TaskFieldDef` with `id: crypto.randomUUID()` and calls `onTaskFieldDefsChange` with the updated array.

**Step 2: Add "+" column header to TaskTable**

In the table header row, after all columns, add a `<th>` with a "+" button that opens the `TaskFieldManager` modal.

**Step 3: Render custom field columns in TaskRow**

After built-in columns, iterate `taskFieldDefs` and render cells:
- `text` → plain text (InlineTextInput editor)
- `number` → right-aligned number (InlineNumberInput editor)
- `checkbox` → checkbox (direct toggle, no editor needed)
- `dropdown` → pill with value (InlineDropdown editor with `def.options`)
- `date` → formatted date (InlineDatePicker editor)

Values read from `task.customFields[def.id]`.

**Step 4: Add field manager CSS**

```css
.task-field-manager-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.task-field-manager {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.task-field-manager h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-family: var(--font-ui);
}

.task-field-manager-row {
  margin-bottom: 12px;
}

.task-field-manager-row label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-family: var(--font-ui);
}

.task-field-manager-row input,
.task-field-manager-row select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-ui);
}

.task-field-manager-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
```

**Step 5: Verify manually**

Click "+". Create a text field, a dropdown field with 3 options, a checkbox field. Verify columns appear. Edit values in cells.

**Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskFieldManager.tsx src/renderer/components/tasks/TaskTable.tsx src/renderer/components/tasks/TaskRow.tsx src/renderer/styles.css
git commit -m "feat(tasks): add custom field creation and rendering"
```

---

### Task 7: Add Toolbar with Grouping and Sorting

**Files:**
- Create: `src/renderer/components/tasks/TaskToolbar.tsx`
- Modify: `src/renderer/components/tasks/TasksView.tsx`
- Modify: `src/renderer/components/tasks/TaskTable.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Create TaskToolbar**

Create `src/renderer/components/tasks/TaskToolbar.tsx` with:

- **Group By dropdown**: options are `None`, `Status`, `Priority`, `Character`, `Scene`, `Tag`, plus any custom dropdown fields. Selection stored in view state.
- **Sort dropdown**: field selector + asc/desc toggle. Clicking a column header also triggers sort.
- Task count display.

Props: `groupBy`, `sortBy`, `sortDir`, `taskFieldDefs`, `onGroupByChange`, `onSortChange`.

**Step 2: Implement grouping logic in TaskTable**

When `groupBy` is set, tasks are grouped into sections. Add a `groupTasks` function:

```typescript
function groupTasks(tasks: Task[], groupBy: string, characters: Character[]): { label: string; tasks: Task[] }[] {
  // Group by the specified field
  // Return array of { label, tasks } groups
  // Sort groups alphabetically by label
}
```

Grouping logic by field:
- `status` → group by `task.status`
- `priority` → group by `task.priority`
- `character` → group by first `task.characterIds[0]`, resolve to character name
- `scene` → group by `task.sceneKey`
- `tag` → one group per unique tag (tasks with multiple tags appear in multiple groups)
- Custom dropdown field → group by `task.customFields[fieldId]`

Render group headers as a `<tr>` spanning all columns with the group label and task count.

**Step 3: Implement sorting logic**

Sort within groups (or globally if ungrouped) using a `sortTasks` function:

```typescript
function sortTasks(tasks: Task[], sortBy: string, sortDir: 'asc' | 'desc'): Task[] {
  // Compare by the specified field
  // For status: open < in-progress < done
  // For priority: urgent > high > medium > low > none
  // For dates: numeric comparison
  // For text: localeCompare
}
```

Column headers become clickable — clicking sets `sortBy` to that column, clicking again toggles `sortDir`.

**Step 4: Wire into TasksView**

TasksView manages the current `groupBy`, `sortBy`, `sortDir` state and passes to both TaskToolbar and TaskTable.

**Step 5: Add toolbar CSS**

```css
.tasks-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tasks-toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.tasks-toolbar-btn:hover {
  background: var(--bg-tertiary);
}

.tasks-toolbar-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.tasks-toolbar-separator {
  width: 1px;
  height: 20px;
  background: var(--border);
}

.task-group-header td {
  padding: 10px 12px 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.task-group-header .task-group-count {
  font-weight: 400;
  margin-left: 8px;
  color: var(--text-tertiary, var(--text-secondary));
}

.task-sort-indicator {
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.6;
}
```

**Step 6: Verify manually**

Group by Status — see tasks grouped into Open/In Progress/Done sections. Group by Character. Sort by priority. Click column headers to sort.

**Step 7: Commit**

```bash
git add src/renderer/components/tasks/TaskToolbar.tsx src/renderer/components/tasks/TasksView.tsx src/renderer/components/tasks/TaskTable.tsx src/renderer/styles.css
git commit -m "feat(tasks): add grouping and sorting with toolbar controls"
```

---

### Task 8: Add Filter Bar

**Files:**
- Create: `src/renderer/components/tasks/TaskFilterBar.tsx`
- Modify: `src/renderer/components/tasks/TasksView.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Create TaskFilterBar**

A bar that appears below the toolbar when "Filter" is toggled. Contains:
- "+ Add filter" button that adds a new filter row
- Each filter row: field dropdown → operator dropdown → value input/dropdown → remove button
- Active filters shown as dismissible pills above the filter rows

Field options: all built-in columns + custom field defs.
Operator options vary by field type:
- Text/title: `is`, `is_not`, `contains`
- Status/priority/dropdown: `is`, `is_not`
- Tags/characters: `contains` (has any of the selected values)
- Date/number: `is`, `is_not`, `is_set`, `is_not_set`
- Checkbox: `is` (true/false)

**Step 2: Implement filter logic**

Add a `filterTasks` function in TasksView (or a utility):

```typescript
function filterTasks(tasks: Task[], filters: TaskFilter[], characters: Character[]): Task[] {
  return tasks.filter(task => {
    return filters.every(f => {
      const value = getTaskFieldValue(task, f.field, characters);
      switch (f.operator) {
        case 'is': return value === f.value || (Array.isArray(f.value) && f.value.includes(String(value)));
        case 'is_not': return value !== f.value;
        case 'contains': return Array.isArray(value) && (f.value as string[]).some(v => value.includes(v));
        case 'is_set': return value != null && value !== '' && (!Array.isArray(value) || value.length > 0);
        case 'is_not_set': return value == null || value === '' || (Array.isArray(value) && value.length === 0);
      }
    });
  });
}
```

Pipeline in TasksView: filter → group → sort, then render.

**Step 3: Wire into TasksView**

TasksView holds `filters` state. Filter button in toolbar toggles filter bar visibility. Filters state feeds into the pipeline.

**Step 4: Add filter bar CSS**

```css
.tasks-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.tasks-filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tasks-filter-row select,
.tasks-filter-row input {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-ui);
}

.tasks-filter-remove {
  padding: 2px 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
}

.tasks-filter-remove:hover {
  color: var(--text-primary);
}

.tasks-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tasks-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-family: var(--font-ui);
}

.tasks-filter-pill-remove {
  cursor: pointer;
  opacity: 0.7;
}

.tasks-filter-pill-remove:hover {
  opacity: 1;
}

.tasks-add-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: none;
  border: 1px dashed var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: var(--font-ui);
  cursor: pointer;
}

.tasks-add-filter-btn:hover {
  color: var(--text-primary);
  background: var(--bg-primary);
}
```

**Step 5: Verify manually**

Click Filter. Add a filter: Status is Open. Verify only open tasks show. Add another filter: Priority is High. Verify AND behavior. Remove filters.

**Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskFilterBar.tsx src/renderer/components/tasks/TasksView.tsx src/renderer/styles.css
git commit -m "feat(tasks): add filter bar with field/operator/value filtering"
```

---

### Task 9: Add Time Tracking with Timer

**Files:**
- Create: `src/renderer/components/tasks/TaskTimer.tsx`
- Modify: `src/renderer/components/tasks/TaskRow.tsx`
- Modify: `src/renderer/components/tasks/TaskToolbar.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Create TaskTimer**

A component that manages the global timer state:

```tsx
interface TaskTimerProps {
  tasks: Task[];
  onTaskUpdate: (task: Task) => void;
}
```

Internal state:
- `activeTaskId: string | null`
- `startTime: number | null`
- `elapsed: number` — updated every second via `setInterval`

Renders in the toolbar area:
- When idle: nothing (or a subtle "No timer running" label)
- When active: task title + elapsed time (formatted as "1h 23m 45s") + stop button

**Play button on each TaskRow:** A small play/stop icon in the Time Tracked cell. Clicking play:
1. If another timer is running, stop it first (save the TimeEntry)
2. Start timer for this task

Stopping saves a `TimeEntry`:
```typescript
const entry: TimeEntry = {
  id: crypto.randomUUID(),
  startedAt: startTime,
  duration: Date.now() - startTime,
};
```

**Step 2: Add manual time entry**

Clicking the Time Tracked cell (when not timing) opens a small popover to manually add a time entry:
- Duration input (hours + minutes)
- Optional description text
- "Add" button

**Step 3: Wire timer into TaskToolbar**

The timer display lives in the toolbar (right side). TasksView passes `activeTimerTaskId` and timer callbacks to both TaskToolbar and TaskTable.

**Step 4: Add timer CSS**

```css
.task-timer-display {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--accent);
  color: #fff;
  border-radius: 8px;
  font-size: 12px;
  font-family: var(--font-ui);
  font-weight: 600;
  margin-left: auto;
}

.task-timer-task-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.9;
}

.task-timer-elapsed {
  font-variant-numeric: tabular-nums;
}

.task-timer-stop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
}

.task-timer-stop-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.task-play-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}

.task-play-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.task-play-btn.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

.task-time-entry-popover {
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 50;
  min-width: 220px;
}

.task-time-entry-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.task-time-entry-row input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-ui);
  text-align: center;
}
```

**Step 5: Verify manually**

Click play on a task — timer appears in toolbar counting up. Stop — time entry saved, Time Tracked column updates. Click Time Tracked cell, manually add "1h 30m" — total updates. Start timer on a different task — first timer stops automatically.

**Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskTimer.tsx src/renderer/components/tasks/TaskRow.tsx src/renderer/components/tasks/TaskToolbar.tsx src/renderer/styles.css
git commit -m "feat(tasks): add time tracking with global timer and manual entry"
```

---

### Task 10: Add Saved Views

**Files:**
- Modify: `src/renderer/components/tasks/TaskToolbar.tsx`
- Modify: `src/renderer/components/tasks/TasksView.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Add view management to TasksView**

State: `activeViewId: string | null`. When a view is active, its config is loaded into groupBy/sortBy/sortDir/filters/visibleColumns state.

**Step 2: Add view switcher dropdown to TaskToolbar**

Left side of toolbar: a dropdown showing saved view names. Selecting one loads its config. Default entry: "All Tasks" (shows all columns, no grouping/filtering).

**Step 3: Add Save / Save As buttons**

- "Save" button (visible when an existing view is active and config has changed): updates the current view's config.
- "Save As" button: opens a small name input, creates a new `TaskViewConfig` with current settings.

**Step 4: Add column visibility/reorder**

A "Columns" button in the toolbar opens a checklist of all columns (built-in + custom). Toggle checkboxes to show/hide columns. Drag to reorder (or just up/down buttons for simplicity). The visible columns list is part of the view config.

**Step 5: Add CSS**

```css
.tasks-view-switcher {
  position: relative;
}

.tasks-view-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 50;
  overflow: hidden;
}

.tasks-view-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  cursor: pointer;
}

.tasks-view-option:hover {
  background: var(--bg-tertiary);
}

.tasks-view-option.active {
  font-weight: 600;
  background: var(--bg-secondary);
}

.tasks-columns-panel {
  position: absolute;
  top: 100%;
  right: 0;
  min-width: 220px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 50;
  padding: 8px 0;
  max-height: 360px;
  overflow-y: auto;
}

.tasks-column-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  cursor: pointer;
}

.tasks-column-toggle:hover {
  background: var(--bg-tertiary);
}
```

**Step 6: Verify manually**

Group by Status, sort by priority, hide Time Estimate column. Click "Save As", name it "Active Work". Switch to "All Tasks". Switch back to "Active Work" — config restored.

**Step 7: Commit**

```bash
git add src/renderer/components/tasks/TaskToolbar.tsx src/renderer/components/tasks/TasksView.tsx src/renderer/styles.css
git commit -m "feat(tasks): add saved views with column visibility and view switching"
```

---

### Task 11: Migrate Scene Todos + Editor Sidebar Integration

**Files:**
- Modify: `src/renderer/App.tsx` (migration logic in load)
- Modify: `src/renderer/components/EditorView.tsx:1525-1574` (sidebar tasks section)

**Step 1: Add migration logic**

In `App.tsx`, in the project load function (near line 841 where `inlineTodos` are loaded), add migration logic:

```typescript
// Migrate inline todos to tasks (one-time)
if (!loadedTasks.length) {
  const migratedTasks: Task[] = [];
  let order = 0;
  for (const [sceneKey, todos] of Object.entries(loadedInlineTodos)) {
    for (const todo of todos) {
      migratedTasks.push({
        id: todo.todoId || crypto.randomUUID(),
        title: todo.description,
        status: todo.done ? 'done' : 'open',
        priority: 'none',
        tags: [],
        characterIds: [sceneKey.split(':')[0]],
        sceneKey,
        timeEntries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: order++,
        customFields: {},
      });
    }
  }
  if (migratedTasks.length) {
    setTasks(migratedTasks);
    tasksRef.current = migratedTasks;
    isDirtyRef.current = true; // trigger save
  }
}
```

Also migrate note-linked todos from `sceneTodos` (the todos extracted from notes via `extractTodosFromNotes`).

**Step 2: Update editor sidebar "Changes Needed" section**

In `EditorView.tsx` lines 1525-1574, change the todo rendering to read from the `tasks` array instead of `sceneTodos`/`inlineTodos`. The sidebar should:

- Filter `tasks` where `task.sceneKey === currentSceneKey`
- Render each as a checkbox + title
- Toggle checkbox → update `task.status` between `'open'` and `'done'`
- "+ Add task" → create new `Task` with `sceneKey` pre-filled
- Clicking task title → navigate to Tasks view (call `setViewMode('tasks')` with a pending highlight)

Props needed: pass `tasks` and `onTasksChange` into EditorView from App.tsx.

**Step 3: Verify manually**

Load a project with existing inline todos. Navigate to Tasks view — migrated tasks should appear. Go to editor sidebar — same tasks visible under the scene. Toggle a checkbox — reflects in both views.

**Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/EditorView.tsx
git commit -m "feat(tasks): migrate scene todos to tasks and integrate editor sidebar"
```

---

### Task 12: Add Task Deletion and Row Actions

**Files:**
- Modify: `src/renderer/components/tasks/TaskRow.tsx`
- Modify: `src/renderer/components/tasks/TaskTable.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Add row hover actions**

On hover, show a small action menu on the right side of each row:
- Delete button (trash icon) with confirmation
- Duplicate button (copy icon)

**Step 2: Add row context menu**

Right-click a row to show a context menu with:
- Delete task
- Duplicate task
- Set status → submenu
- Set priority → submenu

**Step 3: Add delete confirmation**

Deleting a task shows a small inline confirmation: "Delete this task?" with "Delete" / "Cancel" buttons.

**Step 4: Add CSS**

```css
.task-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.tasks-table tr:hover .task-row-actions {
  opacity: 1;
}

.task-row-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}

.task-row-action-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.task-row-action-btn.danger:hover {
  color: #f44336;
}

.task-delete-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
```

**Step 5: Verify manually**

Hover a row — action buttons appear. Click delete — confirmation shows. Confirm — task removed. Right-click — context menu works.

**Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskRow.tsx src/renderer/components/tasks/TaskTable.tsx src/renderer/styles.css
git commit -m "feat(tasks): add task deletion, duplication, and row actions"
```

---

### Task 13: Polish and Final Integration

**Files:**
- Modify: `src/renderer/styles.css` (comprehensive styling pass)
- Modify: `src/renderer/components/tasks/TasksView.tsx` (keyboard shortcuts)
- Modify: `src/renderer/components/tasks/TaskTable.tsx` (empty state)

**Step 1: Add empty state**

When no tasks exist, show a centered empty state:
```tsx
<div className="tasks-empty">
  <svg><!-- checklist icon --></svg>
  <h3>No tasks yet</h3>
  <p>Create your first task to start tracking your writing work.</p>
  <button className="tasks-empty-btn" onClick={createFirstTask}>+ Create Task</button>
</div>
```

**Step 2: Add keyboard shortcuts**

- `Enter` on selected row → edit title
- `Delete` / `Backspace` on selected row → delete with confirmation
- `Tab` → move to next cell
- `Escape` → cancel editing / deselect

**Step 3: Add column resize**

Draggable column borders in the header. On drag, update column width. Store widths in view config or field def.

**Step 4: Styling polish**

- Ensure consistent spacing with other views
- Dark mode compatibility (all colors use CSS variables)
- Smooth transitions on hover/focus states
- Proper scroll behavior with sticky header

**Step 5: Verify end-to-end**

Full walkthrough:
1. Open Tasks view from sidebar
2. Create 5+ tasks with different statuses, priorities, characters, tags
3. Add a custom dropdown field "Act" with options "Act 1", "Act 2", "Act 3"
4. Group by Act → verify sections
5. Filter by Status = Open → verify
6. Save as "Open by Act" view
7. Start timer on a task → verify toolbar display → stop → check time entry
8. Switch to editor → verify sidebar shows scene-linked tasks
9. Toggle a task done in sidebar → switch to Tasks view → verify synced
10. Close and reopen app → all data persisted

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(tasks): polish UI, add empty state, keyboard shortcuts, column resize"
```

---

## Build Sequence Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Add types to `types.ts` | None |
| 2 | Wire state/save in `App.tsx` + `dataService.ts` | Task 1 |
| 3 | TasksView shell + sidebar button | Task 2 |
| 4 | TaskTable + TaskRow with built-in columns | Task 3 |
| 5 | Inline cell editors | Task 4 |
| 6 | Custom field management | Task 5 |
| 7 | Grouping and sorting | Task 4 |
| 8 | Filter bar | Task 4 |
| 9 | Time tracking with timer | Task 5 |
| 10 | Saved views | Task 7 + 8 |
| 11 | Scene todo migration + sidebar integration | Task 5 |
| 12 | Row actions (delete, duplicate) | Task 5 |
| 13 | Polish and final integration | All |
