# Timer Fix + 12-Week Trend Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the scene timer so it survives computer sleep, and add a 12-week writing trend chart to the analytics dashboard.

**Architecture:** The scene timer bug is in App.tsx — replace tick-counting (`prev + 1`) with wall-clock calculation (`Date.now() - startRef`), mirroring what the task timer already does. The trend widget is a new `useMemo` + JSX section in `WordCountDashboard.tsx` that aggregates scene and task time across 12 Sat–Fri weeks and renders a bar chart with an optional goal line.

**Tech Stack:** React (hooks, useMemo, useRef), TypeScript, existing Vitest setup, CSS in `styles.css`.

---

## Files

- **Modify:** `src/renderer/App.tsx` — add `timerStartedAtRef`, update interval callback and start/restore handlers, add `visibilitychange` listener
- **Modify:** `src/renderer/components/WordCountDashboard.tsx` — add `trendData` useMemo, add 12-week trend card JSX
- **Modify:** `src/renderer/styles.css` — add `analytics-trend-*` CSS classes

---

## Task 1: Fix the scene timer sleep bug

**Files:**
- Modify: `src/renderer/App.tsx:231–311`

The scene timer at line 301–303 uses `setTimerElapsed(prev => prev + 1)`, counting ticks. `setInterval` pauses during system sleep so ticks are lost. The fix: store wall-clock start time in a ref and compute elapsed from `Date.now()` — same approach the task timer already uses.

- [ ] **Step 1: Add `timerStartedAtRef` after existing timer refs**

Find this block (around line 235–236):
```typescript
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRunningRef = useRef(false);
```
Add one line immediately after:
```typescript
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRunningRef = useRef(false);
  const timerStartedAtRef = useRef<number | null>(null);
```

- [ ] **Step 2: Update the interval callback to use wall-clock time**

Find (around line 299–311):
```typescript
  useEffect(() => {
    if (timerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerElapsed(prev => prev + 1);
      }, 1000);
    } else if (timerIntervalRef.current) {
```
Replace the callback:
```typescript
  useEffect(() => {
    if (timerRunning) {
      timerIntervalRef.current = setInterval(() => {
        if (timerStartedAtRef.current !== null) {
          setTimerElapsed(Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
        }
      }, 1000);
    } else if (timerIntervalRef.current) {
```

- [ ] **Step 3: Set `timerStartedAtRef` in `handleStartTimer`**

Find `handleStartTimer` (around line 413–422):
```typescript
  const handleStartTimer = useCallback((sceneKey: string) => {
    // Stop task timer if running (mutual exclusivity)
    if (taskTimerRunningRef.current) {
      handleStopTaskTimer();
    }
    setTimerSceneKey(sceneKey);
    setTimerElapsed(0);
    setTimerRunning(true);
    localStorage.setItem('braidr-active-scene-timer', JSON.stringify({ id: sceneKey, startedAt: Date.now() }));
  }, [handleStopTaskTimer]);
```
Add `timerStartedAtRef.current = Date.now()` before `setTimerElapsed(0)`:
```typescript
  const handleStartTimer = useCallback((sceneKey: string) => {
    if (taskTimerRunningRef.current) {
      handleStopTaskTimer();
    }
    const startedAt = Date.now();
    timerStartedAtRef.current = startedAt;
    setTimerSceneKey(sceneKey);
    setTimerElapsed(0);
    setTimerRunning(true);
    localStorage.setItem('braidr-active-scene-timer', JSON.stringify({ id: sceneKey, startedAt }));
  }, [handleStopTaskTimer]);
```

- [ ] **Step 4: Set `timerStartedAtRef` in the restore-from-localStorage effect**

Find the restore effect (around line 256–265):
```typescript
    if (sceneRaw) {
      try {
        const { id, startedAt } = JSON.parse(sceneRaw);
        setTimerSceneKey(id);
        setTimerElapsed(Math.floor((Date.now() - startedAt) / 1000));
        setTimerRunning(true);
```
Add `timerStartedAtRef.current = startedAt;` after parsing:
```typescript
    if (sceneRaw) {
      try {
        const { id, startedAt } = JSON.parse(sceneRaw);
        timerStartedAtRef.current = startedAt;
        setTimerSceneKey(id);
        setTimerElapsed(Math.floor((Date.now() - startedAt) / 1000));
        setTimerRunning(true);
```

- [ ] **Step 5: Add `visibilitychange` listener to re-sync immediately on wake**

Add a new `useEffect` after the existing timer effects (after line 311):
```typescript
  // Re-sync scene timer immediately when window regains focus after sleep
  useEffect(() => {
    const onVisible = () => {
      if (timerRunningRef.current && timerStartedAtRef.current !== null) {
        setTimerElapsed(Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
```

- [ ] **Step 6: Verify manually in the app**

```bash
cd /Users/brian/braidr && npm run dev
```
- Start a scene timer
- Note the elapsed time
- Put computer to sleep for ~1 minute
- Wake computer
- Verify timer shows the correct elapsed time (not stuck at the pre-sleep value)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "fix: scene timer survives sleep by using wall-clock time instead of tick counting"
```

---

## Task 2: Add `trendData` useMemo to WordCountDashboard

**Files:**
- Modify: `src/renderer/components/WordCountDashboard.tsx`

- [ ] **Step 1: Add `trendData` useMemo after the existing `weeklyData` memo**

Find this line (around line 314–317):
```typescript
  }, [weekOffset, sceneSessions, tasks]);

  const weeklyGoal = analytics?.weeklyGoal;
  const weeklyTargetHours = weeklyGoal?.enabled ? weeklyGoal.targetHours : 0;
```

Insert after `weeklyTargetHours` (after line 317):
```typescript
  const trendData = useMemo(() => {
    const now = new Date();
    const currentSat = getWeekSaturday(now);
    const result: {
      weekStart: string;
      weekLabel: string;
      totalHours: number;
      hitGoal: boolean;
      isCurrent: boolean;
    }[] = [];

    for (let i = 11; i >= 0; i--) {
      const weekSat = new Date(currentSat);
      weekSat.setDate(currentSat.getDate() - i * 7);
      const days = getWeekDays(weekSat);

      let totalMs = 0;
      for (const ss of sceneSessions) {
        if (ss.sceneKey === 'manual:checkin') continue;
        if (days.indexOf(ss.date) >= 0) totalMs += ss.durationMs;
      }
      for (const task of tasks) {
        for (const te of task.timeEntries) {
          if (days.indexOf(toLocalDateStr(new Date(te.startedAt))) >= 0) totalMs += te.duration;
        }
      }

      const totalHours = totalMs / 3600000;
      result.push({
        weekStart: toLocalDateStr(weekSat),
        weekLabel: weekSat.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalHours,
        hitGoal: !!(weeklyGoal?.enabled && weeklyTargetHours > 0 && totalHours >= weeklyTargetHours),
        isCurrent: i === 0,
      });
    }
    return result;
  }, [sceneSessions, tasks, weeklyGoal, weeklyTargetHours]);

  const maxTrendHours = Math.max(...trendData.map(w => w.totalHours), weeklyTargetHours, 0.1);
  // Goal line position: chart is 130px tall, label row is 16px, value row is 14px, 8px gaps.
  // Track height ≈ 130 - 16 - 14 - 8 = 92px. Goal line bottom = labelH + targetRatio * trackH.
  const TREND_CHART_H = 130;
  const TREND_LABEL_H = 16;
  const TREND_VALUE_H = 14;
  const TREND_TRACK_H = TREND_CHART_H - TREND_LABEL_H - TREND_VALUE_H - 8;
  const goalLinePx = weeklyGoal?.enabled && weeklyTargetHours > 0
    ? TREND_LABEL_H + (Math.min(weeklyTargetHours, maxTrendHours) / maxTrendHours) * TREND_TRACK_H
    : null;
```

- [ ] **Step 2: Verify the memo compiles with no type errors**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -i "trendData\|trend" | head -10
```
Expected: no output (no errors for the new code).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/WordCountDashboard.tsx
git commit -m "feat: add trendData memo for 12-week writing trend"
```

---

## Task 3: Add 12-week trend card JSX

**Files:**
- Modify: `src/renderer/components/WordCountDashboard.tsx`

- [ ] **Step 1: Insert the 12-week trend card after the weekly tracker closes**

Find this closing structure (around line 521–524):
```tsx
        </div>
      </div>

      {/* Main Grid */}
      <div className="analytics-grid">
```

Insert the trend card between the weekly tracker close and the main grid open:
```tsx
        </div>
      </div>

      {/* 12-Week Trend */}
      {trendData.some(w => w.totalHours > 0) && (
        <div className="analytics-trend-wrapper">
          <div className="analytics-card full">
            <div className="analytics-card-header">
              <span className="analytics-card-title">12-Week Trend</span>
            </div>
            <div
              className="analytics-trend-chart"
              style={{ height: `${TREND_CHART_H}px` }}
            >
              {goalLinePx !== null && (
                <div
                  className="analytics-trend-goal-line"
                  style={{ bottom: goalLinePx }}
                >
                  <span className="analytics-trend-goal-label">{weeklyTargetHours}h</span>
                </div>
              )}
              {trendData.map(week => {
                const barHeight = Math.max((week.totalHours / maxTrendHours) * 100, week.totalHours > 0 ? 3 : 0);
                return (
                  <div key={week.weekStart} className="analytics-trend-bar-group">
                    <div className="analytics-trend-bar-value">
                      {week.totalHours > 0 ? (week.totalHours >= 10 ? week.totalHours.toFixed(0) : week.totalHours.toFixed(1)) : ''}
                    </div>
                    <div className="analytics-trend-bar-track">
                      <div
                        className={`analytics-trend-bar${week.hitGoal ? ' hit-goal' : ''}${week.isCurrent ? ' current' : ''}${week.totalHours > 0 ? ' has-hours' : ''}`}
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <div className={`analytics-trend-bar-label${week.isCurrent ? ' current' : ''}`}>
                      {week.weekLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="analytics-grid">
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -v "error TS2304\|error TS7006" | grep "error" | head -10
```
Expected: no new errors (pre-existing errors in the codebase are OK).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/WordCountDashboard.tsx
git commit -m "feat: add 12-week trend chart JSX to analytics dashboard"
```

---

## Task 4: Add CSS for 12-week trend chart

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add trend chart CSS after the existing `.analytics-weekly-bar-label.today` block**

Find (around line 11907–11910):
```css
.analytics-weekly-bar-label.today {
  color: var(--text-primary);
  font-weight: 700;
}
```

Add immediately after:
```css
/* 12-Week Trend chart */
.analytics-trend-wrapper {
  margin-top: 16px;
}
.analytics-trend-chart {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 3px;
}
.analytics-trend-bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
}
.analytics-trend-bar-value {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  color: var(--text-secondary);
  height: 14px;
  line-height: 14px;
  text-align: center;
  min-width: 0;
}
.analytics-trend-bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.analytics-trend-bar {
  width: 80%;
  max-width: 18px;
  border-radius: 3px 3px 0 0;
  background: #ede9fe;
  transition: height 0.3s ease, opacity 0.15s;
}
.analytics-trend-bar.has-hours {
  background: #8b5cf6;
  opacity: 0.8;
}
.analytics-trend-bar.hit-goal {
  background: #059669;
  opacity: 0.85;
}
.analytics-trend-bar.current {
  background: #6d28d9;
  opacity: 1;
}
.analytics-trend-bar-group:hover .analytics-trend-bar {
  opacity: 1;
}
.analytics-trend-bar-label {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 500;
  color: var(--text-muted);
  height: 16px;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}
.analytics-trend-bar-label.current {
  color: var(--text-primary);
  font-weight: 700;
}
.analytics-trend-goal-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed rgba(139, 92, 246, 0.4);
  pointer-events: none;
}
.analytics-trend-goal-label {
  position: absolute;
  right: 0;
  top: -11px;
  font-family: var(--font-ui);
  font-size: 9px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  padding: 0 2px;
}
```

- [ ] **Step 2: Open the app and verify the chart renders correctly**

```bash
cd /Users/brian/braidr && npm run dev
```
- Navigate to Analytics
- Scroll past the Weekly Hours card
- Confirm a "12-Week Trend" card appears with bars for weeks that have data
- If `weeklyGoal` is set, confirm the dashed goal line appears
- Confirm the current week's bar is darker purple; bars hitting the goal are green
- Confirm label text ("Apr 5", etc.) appears below each bar

- [ ] **Step 3: Adjust goal line position if visually off**

The goal line uses pixel math: `bottom = TREND_LABEL_H + ratio * TREND_TRACK_H`. If the line doesn't visually align with bars of the expected height, tweak `TREND_TRACK_H` in `WordCountDashboard.tsx` until it aligns. Expected: a bar representing exactly the target hours should have its top touching the goal line.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles.css src/renderer/components/WordCountDashboard.tsx
git commit -m "feat: style 12-week trend chart with goal line and color-coded bars"
```
