# Timer Persistence & Editable Time Entries

## Problem

Both the scene timer and task timer lose their running state when the app closes. If a user is mid-session and the app quits (intentionally or not), the elapsed time is lost. Additionally, task time entries cannot be edited or deleted after creation, so mistakes or accidental entries are permanent.

## Solution

Two changes:

1. **Persist running timer state** so it survives app restarts and auto-resumes.
2. **Make task time entries editable and deletable** via the existing time popover.

---

## 1. Timer Persistence

### Mechanism

Use `localStorage` to persist the running timer's start timestamp. On app launch, check for a persisted timer and auto-resume.

### Keys

- `braidr-active-scene-timer` — for the scene writing timer
- `braidr-active-task-timer` — for the task timer

### Data Shape

```typescript
interface PersistedTimer {
  id: string;       // sceneKey or taskId
  startedAt: number; // epoch ms when timer was originally started
}
```

### Lifecycle

**On timer start:**
- Write `{ id, startedAt: Date.now() }` to the appropriate localStorage key.

**On timer stop:**
- Remove the localStorage key. The completed session saves normally (analytics.json for scenes, task.timeEntries for tasks).

**On app launch (in existing state initialization):**
- Check both localStorage keys.
- If a scene timer is found: set `timerSceneKey = id`, calculate `timerElapsed = Math.floor((Date.now() - startedAt) / 1000)`, then set `timerRunning = true`. The scene timer uses a pure seconds counter (`prev + 1` each tick), so the restored elapsed value seeds that counter correctly.
- If a task timer is found: assign `taskTimerStartRef.current = startedAt` **before** calling `setTaskTimerRunning(true)` (the running effect reads this ref). Then set `taskTimerTaskId = id`, `taskTimerElapsed = Date.now() - startedAt`, and `taskTimerRunning = true`. The task timer recalculates elapsed each tick via `Date.now() - startedAt`, so restoring the original `startedAt` is all that's needed.
- If both somehow exist (shouldn't happen, but defensive): restore the scene timer, clear the task timer key.

**On timer reset (discard without saving):**
- Remove the localStorage key.

### Mutual Exclusivity

The existing mutual exclusivity logic (starting one timer stops the other) already handles clearing state via the stop handlers. We add localStorage removal to `handleStopTimer`, `handleResetTimer`, and `handleStopTaskTimer`. Since there is no `handleResetTaskTimer` today, only stop+clear is needed for tasks.

### Edge Cases

- App closed overnight: timer auto-resumes with full elapsed time. Since time entries are now editable, the user can adjust after stopping.
- Task deleted while timer was running: tasks load asynchronously via IPC, so the deleted-entity check cannot run at `useState` init time. Instead, use a `useEffect` that watches for tasks to be loaded — if a persisted task timer's `taskId` is not found in the loaded tasks list, clear the localStorage key and reset timer state. Until tasks load, the timer can optimistically run (it just won't display a title).
- Scene deleted while timer was running: same pattern — validate the sceneKey in a `useEffect` after scenes load. If invalid, clear and reset.

---

## 2. Editable & Deletable Task Time Entries

### UI Changes (TaskRow.tsx)

Expand the existing time popover to two sections:

1. **Entry list** (top, scrollable) — all existing `task.timeEntries`, newest first
2. **Add new** (bottom) — the existing manual entry form, unchanged

Each entry row displays:
- Date (from `startedAt`, formatted as short date e.g. "Mar 15")
- Duration as editable h/m inputs (same style as the add form)
- Description as editable text input
- Delete button (x)

### Interaction

- Editing an entry's duration or description commits on blur or Enter.
- Deleting shows no confirmation (entries are small; undo isn't needed given the inline nature).

### Callbacks

New callbacks threaded through TasksView:

```typescript
onUpdateTimeEntry: (taskId: string, entryId: string, updates: Partial<Pick<TimeEntry, 'duration' | 'description'>>) => void;
onDeleteTimeEntry: (taskId: string, entryId: string) => void;
```

These update `task.timeEntries` in state and trigger the normal task save flow.

### TasksView Handlers

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

---

## Files to Modify

| File | Change |
|------|--------|
| `src/renderer/App.tsx` | Persist/restore timer state via localStorage in start/stop handlers and initialization |
| `src/renderer/components/tasks/TaskRow.tsx` | Expand time popover with entry list, edit/delete UI |
| `src/renderer/components/tasks/TasksView.tsx` | Add `handleUpdateTimeEntry` and `handleDeleteTimeEntry`, thread to TaskTable |
| `src/renderer/components/tasks/TaskTable.tsx` | Thread new callbacks to TaskRow |
| `src/renderer/styles.css` | Styles for entry list items in popover |

## Files NOT Modified

| File | Reason |
|------|--------|
| `src/shared/types.ts` | `TimeEntry` interface is unchanged |
| `src/renderer/utils/analyticsStore.ts` | Scene sessions are not made editable in this change |
