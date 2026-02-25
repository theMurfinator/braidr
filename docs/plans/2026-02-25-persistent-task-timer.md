# Persistent Task Time Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lift task timer state from TasksView.tsx to App.tsx so the timer persists across navigation, with a toolbar pill (matching the scene timer) and mutual exclusivity between scene and task timers.

**Architecture:** Add task timer state (`taskTimerTaskId`, `taskTimerRunning`, `taskTimerElapsed`) to App.tsx alongside existing scene timer state. Add mutual exclusivity — starting one timer stops the other. Render a task timer pill in the toolbar. Pass timer state down to TasksView as props, removing all local timer state from TasksView.

**Tech Stack:** React state + useEffect intervals (same pattern as existing scene timer). No new dependencies.

---

### Task 1: Add task timer state and interval to App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Add task timer state declarations**

After the scene timer state block (lines 147-151), add:

```tsx
// Global task timer (persists across view changes)
const [taskTimerRunning, setTaskTimerRunning] = useState(false);
const [taskTimerElapsed, setTaskTimerElapsed] = useState(0); // milliseconds
const [taskTimerTaskId, setTaskTimerTaskId] = useState<string | null>(null);
const taskTimerStartRef = useRef<number | null>(null);
const taskTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

**Step 2: Add task timer interval effect**

After the scene timer useEffect (lines 153-165), add:

```tsx
useEffect(() => {
  if (taskTimerRunning && taskTimerStartRef.current) {
    taskTimerIntervalRef.current = setInterval(() => {
      setTaskTimerElapsed(Date.now() - taskTimerStartRef.current!);
    }, 1000);
  } else if (taskTimerIntervalRef.current) {
    clearInterval(taskTimerIntervalRef.current);
    taskTimerIntervalRef.current = null;
  }
  return () => {
    if (taskTimerIntervalRef.current) clearInterval(taskTimerIntervalRef.current);
  };
}, [taskTimerRunning]);
```

**Step 3: Add task timer start/stop handlers**

After `handleResetTimer` (line 212), add:

```tsx
const handleStartTaskTimer = useCallback((taskId: string) => {
  // Stop scene timer if running (mutual exclusivity)
  if (timerRunning) {
    handleStopTimer();
  }
  setTaskTimerTaskId(taskId);
  taskTimerStartRef.current = Date.now();
  setTaskTimerElapsed(0);
  setTaskTimerRunning(true);
}, [timerRunning, handleStopTimer]);

const handleStopTaskTimer = useCallback(() => {
  if (!taskTimerTaskId || !taskTimerStartRef.current) return;
  const duration = Date.now() - taskTimerStartRef.current;
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    startedAt: taskTimerStartRef.current,
    duration,
  };
  // Update the task's timeEntries
  setTasks(prev => prev.map(t =>
    t.id === taskTimerTaskId
      ? { ...t, timeEntries: [...t.timeEntries, entry], updatedAt: Date.now() }
      : t
  ));
  setTaskTimerTaskId(null);
  taskTimerStartRef.current = null;
  setTaskTimerElapsed(0);
  setTaskTimerRunning(false);
}, [taskTimerTaskId]);
```

**Step 4: Make scene timer start stop task timer (mutual exclusivity)**

Modify `handleStartTimer` (line 175). Change from:

```tsx
const handleStartTimer = useCallback((sceneKey: string) => {
  setTimerSceneKey(sceneKey);
  setTimerElapsed(0);
  setTimerRunning(true);
}, []);
```

To:

```tsx
const handleStartTimer = useCallback((sceneKey: string) => {
  // Stop task timer if running (mutual exclusivity)
  if (taskTimerRunning) {
    handleStopTaskTimer();
  }
  setTimerSceneKey(sceneKey);
  setTimerElapsed(0);
  setTimerRunning(true);
}, [taskTimerRunning, handleStopTaskTimer]);
```

NOTE: There is a circular dependency between `handleStartTimer` ↔ `handleStopTaskTimer` and `handleStartTaskTimer` ↔ `handleStopTimer`. To resolve this, use refs for the running state checks instead of state in the dependency arrays. Alternatively, extract the "stop" logic into non-callback functions that read from refs. The implementer should handle this — the key requirement is that starting one timer stops the other.

**Step 5: Add TimeEntry import**

Make sure `TimeEntry` is imported from `../../shared/types` in App.tsx. Check the existing import line and add `TimeEntry` if not already present.

**Step 6: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -E "App\.tsx" | grep -v "TS6133" | head -10`
Expected: No new errors (TS6133 are unused variable warnings, ignore those)

**Step 7: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(tasks): lift task timer state to App.tsx for persistence"
```

---

### Task 2: Add task timer pill to the toolbar

**Files:**
- Modify: `src/renderer/App.tsx` (toolbar JSX around line 3361)

**Step 1: Add task timer pill after the scene timer pill**

After the scene timer pill block (line 3383) and the check-in button (line 3390), add a task timer pill. Find the task title from the `tasks` state:

```tsx
{taskTimerTaskId && (() => {
  const activeTask = tasks.find(t => t.id === taskTimerTaskId);
  const label = activeTask?.title || 'Task';
  return (
    <button
      className={`toolbar-timer-pill ${taskTimerRunning ? 'running' : 'paused'}`}
      onClick={() => {
        if (taskTimerRunning) {
          handleStopTaskTimer();
        } else {
          // Resume — restart the timer from where it was
          taskTimerStartRef.current = Date.now() - taskTimerElapsed;
          setTaskTimerRunning(true);
        }
      }}
      title={taskTimerRunning ? 'Stop task timer' : 'Resume task timer'}
    >
      <span className={`toolbar-timer-dot ${taskTimerRunning ? 'running' : ''}`} />
      <span className="toolbar-timer-time">{formatTimer(Math.floor(taskTimerElapsed / 1000))}</span>
      <span className="toolbar-timer-scene">{label}</span>
    </button>
  );
})()}
```

Note: `formatTimer` expects seconds but `taskTimerElapsed` is in ms, so divide by 1000.

**Step 2: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -E "App\.tsx" | grep -v "TS6133" | head -10`

**Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(tasks): add task timer pill to main toolbar"
```

---

### Task 3: Pass timer props to TasksView, remove local state

**Files:**
- Modify: `src/renderer/components/tasks/TasksView.tsx`
- Modify: `src/renderer/App.tsx` (where TasksView is rendered, line ~3616)

**Step 1: Add timer props to TasksViewProps interface**

In TasksView.tsx, add to the `TasksViewProps` interface (after line 59):

```tsx
// Task timer (lifted to App.tsx)
activeTimerTaskId: string | null;
taskTimerElapsed: number; // ms
onStartTimer: (taskId: string) => void;
onStopTimer: () => void;
```

**Step 2: Remove local timer state from TasksView**

Remove these lines from the component body (lines 108-175):
- State: `activeTimerTaskId`, `timerStart`, `timerElapsed` (lines 108-111)
- Refs: `tasksLocalRef`, `activeTimerTaskIdRef`, `timerStartRef` and their effects (lines 113-121)
- Timer interval effect (lines 123-129)
- `startTimer` function (lines 131-139)
- `stopTimer` function (lines 141-161)
- `handleAddTimeEntry` function (lines 163-170) — KEEP this one, it's used for manual time entries
- `activeTimerTaskTitle` computation (lines 172-175) — recompute from props

Replace with:

```tsx
// Destructure timer props
const { activeTimerTaskId, taskTimerElapsed, onStartTimer: startTimer, onStopTimer: stopTimer } = props;

// Keep refs for tasks (used by handleAddTimeEntry)
const tasksLocalRef = useRef(tasks);
useEffect(() => { tasksLocalRef.current = tasks; }, [tasks]);

// Compute active task title from props
const activeTimerTaskTitle = activeTimerTaskId
  ? tasks.find(t => t.id === activeTimerTaskId)?.title || 'Untitled'
  : '';
```

**Step 3: Update TaskToolbar props**

In the JSX where TaskToolbar is rendered (~line 265), update the timer props:

```tsx
activeTimerTaskId={activeTimerTaskId}
activeTimerTaskTitle={activeTimerTaskTitle}
timerElapsed={taskTimerElapsed}
onStopTimer={stopTimer}
```

**Step 4: Update TaskTable start timer calls**

Search for where `startTimer` is called in TasksView and passed to child components. It should be passed down to TaskTable and individual task rows. The prop name may already match since we aliased it in step 2. Verify that anywhere `startTimer(taskId)` is called still works with the lifted prop.

**Step 5: Pass timer props from App.tsx to TasksView**

In App.tsx where TasksView is rendered (line ~3616), add the new props:

```tsx
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
  initialColumnWidths={taskColumnWidths}
  initialVisibleColumns={taskVisibleColumns}
  onColumnConfigChange={handleTaskColumnConfigChange}
  activeTimerTaskId={taskTimerTaskId}
  taskTimerElapsed={taskTimerElapsed}
  onStartTimer={handleStartTaskTimer}
  onStopTimer={handleStopTaskTimer}
/>
```

**Step 6: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -v "TS6133" | head -20`
Expected: No new errors. Check especially for missing props or type mismatches.

**Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/tasks/TasksView.tsx
git commit -m "feat(tasks): wire TasksView to use lifted timer state from App.tsx"
```

---

### Task 4: Build and manual QA

**Step 1: Build**

Run: `cd /Users/brian/braidr && npm run build`
Expected: Clean build (no errors beyond pre-existing warnings)

**Step 2: Start dev server**

Run: `cd /Users/brian/braidr && npm run dev`

**Step 3: Test task timer persistence**

1. Go to Tasks view
2. Start a timer on any task
3. Navigate to Editor view — verify the task timer pill appears in the toolbar and keeps counting
4. Navigate to Notes view — verify pill still visible and counting
5. Click the pill to stop the timer — verify time entry is saved to the task
6. Go back to Tasks view — verify the time entry appears on the task

**Step 4: Test mutual exclusivity**

1. Go to Editor, start a scene timer
2. Verify scene timer pill appears in toolbar
3. Go to Tasks, start a task timer
4. Verify scene timer stopped and task timer pill replaced it in toolbar
5. Go to Editor, start a scene timer
6. Verify task timer stopped and scene timer pill replaced it

**Step 5: Test task timer within Tasks view**

1. Start timer on Task A
2. Start timer on Task B — verify Task A's timer stops and time entry is saved
3. Stop Task B's timer — verify time entry saved
