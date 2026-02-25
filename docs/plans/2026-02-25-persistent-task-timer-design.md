# Persistent Task Time Tracking (#128)

## Problem
Task timer state lives in TasksView.tsx, which unmounts when navigating away. Scene timer lives in App.tsx and persists correctly.

## Design

### Fix
Lift task timer state to App.tsx (same pattern as scene timer). Timers are mutually exclusive — starting a task timer stops any scene timer, and vice versa.

### Changes
1. **App.tsx** — Add `taskTimerTaskId`, `taskTimerRunning`, `taskTimerElapsed` state + interval effect. Modify scene timer start to stop task timer first. Add task timer start/stop handlers that stop scene timer first.
2. **App.tsx toolbar** — Add task timer pill next to scene timer pill (reuse `.toolbar-timer-pill` style).
3. **TasksView.tsx** — Remove local timer state. Accept timer props from App.tsx. Pass through to TaskToolbar/TaskTimer.
4. No new components.
