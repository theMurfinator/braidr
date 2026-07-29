# Braidr Analytics & Habit Tracking — Implementation Plan

## Vision
Replace Brian's Google Sheets writing tracking workflow with an integrated analytics system inside Braidr. Auto-track writing sessions, log mood/energy/focus check-ins, surface correlations and insights, and display it all in a customizable dashboard.

## Core Principle
**Low friction above all.** Session tracking is automatic. Check-ins take 3 taps / 5 seconds and are always skippable. The dashboard motivates — it never guilt-trips.

---

## Data Model

### `analytics.json` (per project, alongside `timeline.json`)

```json
{
  "sessions": [
    {
      "id": "s_abc123",
      "startTime": 1770676524447,
      "endTime": 1770680124447,
      "durationMs": 3600000,
      "sceneKey": "c4k2j:14",
      "wordsStart": 12450,
      "wordsEnd": 13297,
      "wordsWritten": 1023,
      "wordsDeleted": 176,
      "wordsNet": 847,
      "checkin": {
        "energy": 4,
        "focus": 3,
        "mood": 4
      }
    }
  ],
  "dailySnapshots": {
    "2026-02-09": {
      "totalWords": 15247,
      "wordsWritten": 847,
      "wordsDeleted": 112,
      "sessionsCount": 1,
      "totalDurationMs": 4320000
    }
  },
  "goals": {
    "monthlyWordCount": 50000,
    "dailyWordCount": 500,
    "restDays": ["sunday"]
  },
  "streaks": {
    "current": 12,
    "best": 21,
    "lastActiveDate": "2026-02-09"
  },
  "dashboardLayout": ["calendar", "goal", "timeOfDay", "checkins", "recentScenes"]
}
```

### Key design decisions:
- **Session = contiguous time on one scene.** Switching scenes ends one session and starts another.
- **Scene key** uses existing `characterId:sceneNumber` format for linking back to outline data.
- **Daily snapshots** are the pre-aggregated data that powers the calendar heatmap and trend charts. Written once per day (or retroactively computed from sessions).
- **Dashboard layout** is an ordered array of widget IDs. Users toggle widgets on/off and reorder.

---

## Phase 1: Session Tracking & Check-ins (Foundation)

### 1a. Session Tracker Service
**New file:** `src/renderer/services/sessionTracker.ts`

- Starts tracking when user begins editing a scene (first keystroke or focus on editor)
- Tracks which scene is active via `sceneKey` (`characterId:sceneNumber`)
- Snapshots word count at session start
- **Idle detection:** If no editor activity for 2 minutes, auto-pause the session. Resume on next keystroke.
- **Scene switch:** When user navigates to a different scene, end current session, start new one
- **App close:** The existing graceful quit IPC handshake flushes the current session before closing
- Exposes: `getCurrentSession()`, `getSessionsForScene(sceneKey)`, `getTodaySummary()`

### 1b. Check-in Modal
**New file:** `src/renderer/components/CheckinModal.tsx`

- Triggered when a session ends (scene switch or manual stop) IF the session was > 5 minutes
- Three rows: Energy, Focus, Mood — each with 5 emoji buttons (1-5 scale)
- **Energy:** 😴 😐 😊 😄 🔥
- **Focus:** 🌫️ 😶 🎯 💡 ⚡
- **Mood:** 😞 😐 🙂 😊 🥳
- "Skip" button always visible — never block the writer
- If skipped, session is saved with `checkin: null`
- Quick animation: slide up from bottom, subtle blur backdrop
- Remembers last check-in values as defaults for quick re-tap

### 1c. Analytics Data Service
**New file:** `src/renderer/services/analyticsService.ts`

- `saveSession(session)` — appends to `analytics.json` sessions array
- `saveDailySnapshot(date, snapshot)` — updates daily aggregate
- `getSessions(dateRange?)` — returns filtered sessions
- `getDailySnapshots(dateRange?)` — returns daily data for charts
- `updateGoals(goals)` — saves goal settings
- `updateStreak()` — recalculates streak from session history
- `getDashboardLayout()` / `saveDashboardLayout(layout)` — widget order

### 1d. IPC Channels
Add to `preload.ts` and `main.ts`:
- `LOAD_ANALYTICS` — reads `analytics.json` from project folder
- `SAVE_ANALYTICS` — writes `analytics.json` to project folder

---

## Phase 2: Dashboard View

### 2a. Analytics View Shell
**New file:** `src/renderer/components/AnalyticsView.tsx`

- New view mode: `'analytics'` added to the view switcher (alongside POV, Braided, Editor, Rails, Notes)
- Toolbar shows: "Analytics" title, period toggle (Week / Month / Year), project selector
- Renders a grid of **widget cards** based on `dashboardLayout` array
- "Customize" button opens widget picker overlay

### 2b. Widget System
**New file:** `src/renderer/components/analytics/WidgetCard.tsx`

Each widget is a self-contained React component that receives analytics data as props. Widgets:

| Widget ID | Component | Description |
|-----------|-----------|-------------|
| `summary` | `SummaryStrip.tsx` | 4 stat cards: streak, monthly words, avg/day, sessions |
| `insights` | `InsightsStrip.tsx` | 3 correlation insight cards |
| `calendar` | `CalendarHeatmap.tsx` | Monthly calendar with word count heatmap + tooltips |
| `goal` | `GoalRing.tsx` | Progress ring + pace indicator |
| `wordsOverTime` | `WordsChart.tsx` | Bar chart: words written/deleted per day |
| `timeOfDay` | `TimeOfDayChart.tsx` | Bar chart: avg words/hour by hour of day |
| `checkins` | `CheckinAverages.tsx` | Emoji scales + weekly streak visual |
| `recentScenes` | `RecentScenes.tsx` | Table: scene name, time spent, words, vibe |
| `wordsByCharacter` | `WordsByCharacter.tsx` | Bar chart: words per POV character |
| `sessionLength` | `SessionLengthChart.tsx` | Distribution of session durations |
| `velocityTrend` | `VelocityTrend.tsx` | Words/hour trend over time |

### 2c. Widget Picker
**New file:** `src/renderer/components/analytics/WidgetPicker.tsx`

- Modal overlay listing all available widgets with toggle switches
- Drag handle icons for reordering
- Preview thumbnails for each widget
- "Reset to default" button

### 2d. Default Layout
```
["summary", "insights", "calendar", "goal", "timeOfDay", "checkins", "recentScenes"]
```

---

## Phase 3: Insights & Correlation Engine

### 3a. Insight Generator
**New file:** `src/renderer/services/insightEngine.ts`

Runs on dashboard load. Analyzes session history to find patterns:

- **Energy correlation:** Compare words/hour when energy ≥ 4 vs < 4. Surface if delta > 20%.
- **Peak time of day:** Find the 2-hour window with highest avg words/hour. Compare to overall average.
- **Streak milestone:** Note when current streak is approaching or exceeds personal best.
- **Session length trend:** Compare avg session duration this month vs last month.
- **Character productivity:** Which POV character has the highest words/hour?
- **Day-of-week patterns:** Which day of the week is most productive?
- **Mood-output correlation:** Do higher mood ratings correlate with more words?

Each insight is typed:
```typescript
interface Insight {
  id: string;
  icon: string;       // emoji
  text: string;       // "You write **43% more** when energy is 4+"
  color: 'blue' | 'green' | 'purple';
  confidence: number; // 0-1, only show if > 0.6
  dataPoints: number; // minimum 5 sessions to generate insight
}
```

### 3b. Insight Display Rules
- Show max 3 insights at a time
- Rotate/refresh weekly
- Need minimum 10 sessions before generating any insights
- Need minimum 5 data points per comparison group
- Never show negative/discouraging insights ("You wrote less this week")

---

## Phase 4: Future Enhancements (V2+)

- **Export to CSV** — dump all session data for spreadsheet analysis
- **Pomodoro mode** — optional built-in timer with configurable intervals
- **Goal types** — daily word count, weekly session count, monthly word target
- **Yearly review** — end-of-year summary with charts and highlights
- **Cross-project analytics** — aggregate stats across all projects
- **Focus mode indicator** — show current session timer in toolbar while writing

---

## Build Order & Estimates

| Step | What | Files | Effort |
|------|------|-------|--------|
| 1 | Analytics data model + IPC channels | types.ts, preload.ts, main.ts | Small |
| 2 | Session tracker service | sessionTracker.ts, analyticsService.ts | Medium |
| 3 | Wire session tracker into App.tsx / EditorView | App.tsx, EditorView.tsx | Medium |
| 4 | Check-in modal | CheckinModal.tsx, styles.css | Small |
| 5 | Analytics view shell + toolbar integration | AnalyticsView.tsx, App.tsx | Medium |
| 6 | Calendar heatmap widget | CalendarHeatmap.tsx | Medium |
| 7 | Goal ring widget | GoalRing.tsx | Small |
| 8 | Summary strip widget | SummaryStrip.tsx | Small |
| 9 | Recent scenes widget | RecentScenes.tsx | Small |
| 10 | Check-in averages widget | CheckinAverages.tsx | Small |
| 11 | Time of day widget | TimeOfDayChart.tsx | Medium |
| 12 | Widget picker + customizable layout | WidgetPicker.tsx, WidgetCard.tsx | Medium |
| 13 | Insight engine | insightEngine.ts, InsightsStrip.tsx | Large |
| 14 | Additional chart widgets | WordsChart, VelocityTrend, etc. | Medium |

**Total estimate: ~7-9 working sessions**

---

## Technical Notes

- All analytics data is stored in a single `analytics.json` per project — no SQLite needed for now
- Session tracker runs as a React context/provider wrapping the app
- Charts are pure CSS/SVG — no charting library dependency needed (keeps bundle small)
- The idle detection uses `document.addEventListener` for keydown/mousemove with a debounced timeout
- Word count deltas computed by diffing total word count at session boundaries (we already track `wordCounts` per scene in `timeline.json`)
- Dashboard layout persists in `analytics.json` so it's per-project
