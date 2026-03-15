# Timer Persistence & Editable Time Entries Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist running timer state across app restarts and make task time entries editable/deletable.

**Architecture:** localStorage stores the active timer's start timestamp; on launch a useEffect restores and auto-resumes. The TaskRow time popover is expanded to list existing entries with inline edit/delete. New callbacks thread through TasksView → TaskTable → TaskRow following the existing `onAddTimeEntry` pattern.

**Tech Stack:** React, TypeScript, localStorage, Electron

**Spec:** `docs/superpowers/specs/2026-03-15-timer-persistence-design.md`

---

## File Structure

| File | Role |
|------|------|
| `src/renderer/App.tsx` | Timer state, start/stop/restore handlers, localStorage read/write |
| `src/renderer/components/tasks/TaskRow.tsx` | Time popover UI — entry list with edit/delete |
| `src/renderer/components/tasks/TaskTable.tsx` | Thread new callbacks to TaskRow |
| `src/renderer/components/tasks/TasksView.tsx` | Define update/delete time entry handlers |
| `src/renderer/styles.css` | Styles for entry list in popover |

No new files created. No type changes needed (`TimeEntry` interface is sufficient).

---

## Chunk 1: Timer Persistence

### Task 1: Persist scene timer to localStorage on start/stop/reset

**Files:**
- Modify: `src/renderer/App.tsx:329-337` (handleStartTimer)
- Modify: `src/renderer/App.tsx:262-287` (handleStopTimer)
- Modify: `src/renderer/App.tsx:289-293` (handleResetTimer)

- [ ] **Step 1: Add localStorage write to `handleStartTimer`**

In `src/renderer/App.tsx`, find `handleStartTimer` (~line 329). After `setTimerRunning(true)`, add:

```typescript
localStorage.setItem('braidr-active-scene-timer', JSON.stringify({ id: sceneKey, startedAt: Date.now() }));
```

- [ ] **Step 2: Add localStorage removal to `handleStopTimer`**

In `handleStopTimer` (~line 262), add at the top of the function (before `setTimerRunning(false)`):

```typescript
localStorage.removeItem('braidr-active-scene-timer');
```

- [ ] **Step 3: Add localStorage removal to `handleResetTimer`**

In `handleResetTimer` (~line 289), add:

```typescript
localStorage.removeItem('braidr-active-scene-timer');
```

- [ ] **Step 4: Verify app compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -c 'error'`
Expected: same count as before (pre-existing errors only, no new ones)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: persist scene timer start to localStorage"
```

---

### Task 2: Persist task timer to localStorage on start/stop

**Files:**
- Modify: `src/renderer/App.tsx:314-327` (handleStartTaskTimer)
- Modify: `src/renderer/App.tsx:295-312` (handleStopTaskTimer)

- [ ] **Step 1: Add localStorage write to `handleStartTaskTimer`**

In `handleStartTaskTimer` (~line 314), after `setTaskTimerRunning(true)`, add:

```typescript
localStorage.setItem('braidr-active-task-timer', JSON.stringify({ id: taskId, startedAt: Date.now() }));
```

- [ ] **Step 2: Add localStorage removal to `handleStopTaskTimer`**

In `handleStopTaskTimer` (~line 295), add at the top (before the early return):

```typescript
localStorage.removeItem('braidr-active-task-timer');
```

Actually — add it after the early return guard (`if (!taskTimerTaskId || !taskTimerStartRef.current) return;`) but before the duration calculation. This way the key is cleared even if we refactor later, and the guard already protects against the no-op case.

- [ ] **Step 3: Verify app compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -c 'error'`
Expected: same error count as before

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: persist task timer start to localStorage"
```

---

### Task 3: Restore timers on app launch

**Files:**
- Modify: `src/renderer/App.tsx` — add a `useEffect` after the existing timer state declarations (~line 215)

- [ ] **Step 1: Add restore effect**

After the existing timer ref sync effects (~line 217), add:

```typescript
// Restore persisted timer on mount
useEffect(() => {
  const sceneRaw = localStorage.getItem('braidr-active-scene-timer');
  const taskRaw = localStorage.getItem('braidr-active-task-timer');

  if (sceneRaw) {
    try {
      const { id, startedAt } = JSON.parse(sceneRaw);
      setTimerSceneKey(id);
      setTimerElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setTimerRunning(true);
    } catch {
      localStorage.removeItem('braidr-active-scene-timer');
    }
    // If both exist, scene wins — clear task
    if (taskRaw) localStorage.removeItem('braidr-active-task-timer');
  } else if (taskRaw) {
    try {
      const { id, startedAt } = JSON.parse(taskRaw);
      taskTimerStartRef.current = startedAt; // MUST be set before setTaskTimerRunning
      setTaskTimerTaskId(id);
      setTaskTimerElapsed(Date.now() - startedAt);
      setTaskTimerRunning(true);
    } catch {
      localStorage.removeItem('braidr-active-task-timer');
    }
  }
}, []);
```

Key ordering note: `taskTimerStartRef.current = startedAt` must be assigned **before** `setTaskTimerRunning(true)` because the running effect reads this ref to calculate elapsed.

- [ ] **Step 2: Verify app compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -c 'error'`

- [ ] **Step 3: Manual test**

1. Start a scene timer, close the app, reopen — timer should resume with correct elapsed time.
2. Start a task timer, close the app, reopen — timer should resume.
3. Stop either timer — localStorage key should be cleared (check DevTools > Application > Local Storage).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: restore running timers from localStorage on app launch"
```

---

### Task 4: Validate persisted timer targets after data loads

**Files:**
- Modify: `src/renderer/App.tsx` — add a validation `useEffect` that runs when scenes/tasks load

- [ ] **Step 1: Add validation effect for deleted scenes/tasks**

Add after the restore effect:

```typescript
// Clear persisted timer if target entity was deleted
useEffect(() => {
  if (timerSceneKey && projectData && projectData.scenes.length > 0) {
    const [charId, sceneNumStr] = timerSceneKey.split(':');
    const exists = projectData.scenes.some(s => s.characterId === charId && String(s.sceneNumber) === sceneNumStr);
    if (!exists) {
      localStorage.removeItem('braidr-active-scene-timer');
      // Inline reset to avoid stale closure / missing dep issues
      setTimerRunning(false);
      setTimerElapsed(0);
      setTimerSceneKey(null);
    }
  }
}, [timerSceneKey, projectData]);

useEffect(() => {
  if (taskTimerTaskId && tasks.length > 0) {
    const exists = tasks.some(t => t.id === taskTimerTaskId);
    if (!exists) {
      localStorage.removeItem('braidr-active-task-timer');
      setTaskTimerTaskId(null);
      taskTimerStartRef.current = null;
      setTaskTimerElapsed(0);
      setTaskTimerRunning(false);
    }
  }
}, [taskTimerTaskId, tasks]);
```

Note: Scenes live at `projectData.scenes` (not a standalone `scenes` variable). The `.length > 0` / `tasks.length > 0` guards prevent clearing on initial render when data hasn't loaded yet from IPC. The scene reset is inlined rather than calling `handleResetTimer()` to avoid dependency array issues.

- [ ] **Step 2: Verify app compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -c 'error'`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: validate persisted timer targets after async data loads"
```

---

## Chunk 2: Editable Time Entries

### Task 5: Add update/delete time entry handlers in TasksView

**Files:**
- Modify: `src/renderer/components/tasks/TasksView.tsx:117-124` (after `handleAddTimeEntry`)

- [ ] **Step 1: Add handlers**

After `handleAddTimeEntry` in `TasksView.tsx` (~line 124), add:

```typescript
const handleUpdateTimeEntry = (taskId: string, entryId: string, updates: Partial<Pick<TimeEntry, 'duration' | 'description'>>) => {
  const updated = tasks.map(t =>
    t.id === taskId
      ? { ...t, timeEntries: t.timeEntries.map(e => e.id === entryId ? { ...e, ...updates } : e), updatedAt: Date.now() }
      : t
  );
  onTasksChange(updated);
};

const handleDeleteTimeEntry = (taskId: string, entryId: string) => {
  const updated = tasks.map(t =>
    t.id === taskId
      ? { ...t, timeEntries: t.timeEntries.filter(e => e.id !== entryId), updatedAt: Date.now() }
      : t
  );
  onTasksChange(updated);
};
```

- [ ] **Step 2: Thread to TaskTable**

Find the `<TaskTable` JSX in TasksView.tsx (~line 250). Add props after `onAddTimeEntry`:

```tsx
onUpdateTimeEntry={handleUpdateTimeEntry}
onDeleteTimeEntry={handleDeleteTimeEntry}
```

- [ ] **Step 3: Verify app compiles (will show type errors for missing props — expected)**

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/tasks/TasksView.tsx
git commit -m "feat: add update/delete time entry handlers in TasksView"
```

---

### Task 6: Thread callbacks through TaskTable to TaskRow

**Files:**
- Modify: `src/renderer/components/tasks/TaskTable.tsx:18-38` (TaskTableProps interface)
- Modify: `src/renderer/components/tasks/TaskTable.tsx:150-158` (destructuring)
- Modify: `src/renderer/components/tasks/TaskTable.tsx:320-329` (TaskRow render)

- [ ] **Step 1: Add props to TaskTableProps interface**

In `TaskTable.tsx`, add to `TaskTableProps` (~line 34, after `onAddTimeEntry`):

```typescript
onUpdateTimeEntry: (taskId: string, entryId: string, updates: Partial<Pick<TimeEntry, 'duration' | 'description'>>) => void;
onDeleteTimeEntry: (taskId: string, entryId: string) => void;
```

- [ ] **Step 2: Destructure new props**

In the component destructuring (~line 155, after `onAddTimeEntry`), add:

```typescript
onUpdateTimeEntry,
onDeleteTimeEntry,
```

- [ ] **Step 3: Pass to TaskRow**

In the TaskRow render (~line 327, after `onAddTimeEntry={onAddTimeEntry}`), add:

```tsx
onUpdateTimeEntry={onUpdateTimeEntry}
onDeleteTimeEntry={onDeleteTimeEntry}
```

- [ ] **Step 4: Verify app compiles (will show type errors in TaskRow — expected)**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/tasks/TaskTable.tsx
git commit -m "feat: thread time entry update/delete callbacks through TaskTable"
```

---

### Task 7: Add TimeEntryRow component, props, and expand time popover UI

**Files:**
- Modify: `src/renderer/components/tasks/TaskRow.tsx:13-27` (TaskRowProps)
- Modify: `src/renderer/components/tasks/TaskRow.tsx:345-392` (time popover JSX)

- [ ] **Step 1: Add props to TaskRowProps**

In `TaskRow.tsx`, add to `TaskRowProps` (~line 25, after `onAddTimeEntry`):

```typescript
onUpdateTimeEntry: (taskId: string, entryId: string, updates: Partial<Pick<TimeEntry, 'duration' | 'description'>>) => void;
onDeleteTimeEntry: (taskId: string, entryId: string) => void;
```

- [ ] **Step 2: Destructure new props**

Find where the component destructures props and add `onUpdateTimeEntry` and `onDeleteTimeEntry`.

- [ ] **Step 3: Add `TimeEntryRow` component above `TaskRow`**

This is a small sub-component that owns local state for each entry's h/m/description fields, avoiding stale closures when editing multiple fields before blur:

```tsx
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
```

This uses controlled inputs with local state, so editing hours then minutes reads the current local values (not stale closure values from the parent). Duration commits on blur of either h or m field using the latest local state.

- [ ] **Step 4: Add entry list UI to time popover**

Replace the time popover content (the `{showTimePopover && (` block, ~lines 345-392 inclusive) with:

```tsx
{showTimePopover && (
  <div className="task-time-entry-popover" ref={timePopoverRef}>
    {/* Existing entries */}
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
    {/* Add new entry */}
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
```

- [ ] **Step 5: Verify app compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -c 'error'`
Expected: same pre-existing error count

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/tasks/TaskRow.tsx
git commit -m "feat: editable and deletable time entries in task popover"
```

---

### Task 8: Add styles for entry list

**Files:**
- Modify: `src/renderer/styles.css` — add after `.task-time-entry-add-btn` block (~line 15338)

- [ ] **Step 1: Add CSS**

After the `.task-time-entry-add-btn` rule, add:

```css
.task-time-entry-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}

.task-time-entry-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  font-size: 12px;
  font-family: var(--font-ui);
}

.task-time-entry-item + .task-time-entry-item {
  border-top: 1px solid var(--border-light, var(--border));
}

.task-time-entry-date {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 46px;
  flex-shrink: 0;
}

.task-time-entry-edit-input {
  width: 40px;
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-ui);
  text-align: center;
}

.task-time-entry-edit-desc {
  flex: 1;
  min-width: 60px;
  padding: 2px 4px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-family: var(--font-ui);
}

.task-time-entry-edit-desc:hover,
.task-time-entry-edit-desc:focus {
  border-color: var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.task-time-entry-delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
  border-radius: 3px;
  flex-shrink: 0;
}

.task-time-entry-delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.task-time-entry-add-section {
  padding-top: 4px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat: styles for editable time entry list in popover"
```

---

### Task 9: Manual end-to-end verification

- [ ] **Step 1: Test timer persistence**

1. Open the app, start a scene timer on any scene
2. Close the app completely (Cmd+Q)
3. Reopen — timer should be running with correct elapsed time
4. Stop the timer — session should save to analytics
5. Repeat for task timer

- [ ] **Step 2: Test editable entries**

1. Open a task with existing time entries
2. Click the time tracked value to open popover
3. Verify entry list shows all entries, newest first
4. Edit an entry's hours — blur — verify it persists
5. Edit an entry's description — blur — verify it persists
6. Delete an entry — verify it's removed
7. Add a new entry via the form — verify it appears in the list

- [ ] **Step 3: Test edge cases**

1. Start a timer, delete the scene/task in another view, restart app — timer should not restore
2. Start scene timer, then start task timer — verify scene timer saves and localStorage clears
3. Open time popover with 0 entries — should show only the add form, no empty list
