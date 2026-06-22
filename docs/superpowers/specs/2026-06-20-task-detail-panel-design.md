# Task Detail Panel Design

**Date:** 2026-06-20
**Status:** Approved

## Summary

Add a `+ New Task` button to the app header toolbar on every screen that opens a right-side task detail panel. The same panel opens in edit mode when clicking a task row in TasksView. The panel overlays content without pushing or resizing anything.

---

## Section 1: The "+ New Task" Button

A `+ New Task` button is added to the app header toolbar, visible on every screen (POV, Braided, Editor, Notes, Tasks, Arc, etc.). Clicking it opens the task detail panel in **create mode** with a blank form. No dropdown — the button directly opens the panel.

---

## Section 2: The Task Detail Panel

A full-height panel (~440px wide) slides in from the right, overlaying the current content. It has two modes:

- **Create mode** — blank form, opened via the `+ New Task` button from any screen
- **Edit mode** — pre-filled with existing task data, opened by clicking a task row in TasksView; stays pinned open as the user clicks between rows

### Layout

**Left column (~60% of panel width)**

- Task title — large, editable text input at the top
- Description — multiline rich text area below the title
- Subtasks — list at the bottom using the existing one-level subtask data structure, with an inline "Add subtask" input

**Right column (~40% of panel width)**

- Status (pill dropdown: open / in-progress / done)
- Priority (pill dropdown: none / low / medium / high / urgent)
- Due date (date picker)
- Time estimate
- Tags (tag chips)
- Characters (character picker, maps to `characterIds`)

### Header

- "New Task" label in create mode; task title in edit mode
- X button to close the panel

### Footer

- **Create mode only:** "Create Task" primary button + Cancel button
- **Edit mode:** No footer — all field changes auto-save immediately via the existing `handleUpdateTask` / `task.setFields` IPC path

---

## Section 3: TasksView Integration

- Clicking anywhere on a task row opens the panel in edit mode
- The row title cell is **no longer** an inline-edit click target — title editing moves into the panel
- Other row cells (status pill, priority, custom fields) continue to inline-edit as today
- The panel overlays the table (does not push or resize it)
- The panel stays **pinned open** as the user clicks different rows — switching rows loads the new task without closing the panel
- Pressing **Escape** or clicking the X button closes the panel

---

## Data Flow

- **Create:** Constructs a new `Task` object with a UUID, calls `handleTasksChange([...tasks, newTask])` and `handleCreateTask(newTask)` — identical to the existing `handleAddTask` in `TaskTable.tsx`
- **Edit:** Each field change calls `handleUpdateTask(updatedTask)` which fires `task.setFields` IPC and sets `isDirtyRef.current = true` for the debounced auto-save

---

## Key Files to Touch

- `src/renderer/App.tsx` — add `+ New Task` button to toolbar, manage `taskPanelOpen` + `taskPanelTaskId` state, pass handlers down
- `src/renderer/components/tasks/TaskDetailPanel.tsx` — new component (create + edit modes)
- `src/renderer/components/tasks/TaskTable.tsx` — make rows open the panel on click; remove inline title-edit click behavior
- `src/renderer/components/tasks/TasksView.tsx` — wire panel open/close and selected task state
- `src/renderer/styles.css` — panel slide-in styles

---

## Out of Scope

- Hotkey to open the panel (deferred)
- "New Note" or "New Scene" shortcuts from the same button (deferred)
- Resizable panel width
- Comment/activity feed in the panel
