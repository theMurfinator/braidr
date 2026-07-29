# 12-Week Writing Trend Widget

**Date:** 2026-05-16  
**Status:** Approved

## Summary

Add a "12-Week Trend" card to the analytics dashboard (WordCountDashboard.tsx) below the existing Weekly Hours card. Shows the last 12 Sat–Fri weeks as a bar chart with a goal reference line, giving a long-arc view of writing consistency.

## Data

A new `useMemo` in `WordCountDashboard.tsx` computes 12-week data. For each of the last 12 Sat–Fri weeks:

- Sum `sceneSessions[].durationMs` for sessions whose `date` falls within the week
- Sum `tasks[].timeEntries[].duration` for entries whose `date` falls within the week
- Convert total ms → hours
- Flag `hitGoal: boolean` if `totalHours >= weeklyGoal.targetHours` (and goal is enabled)

Output shape:
```ts
{
  weekStart: string;    // "YYYY-MM-DD" of the Saturday
  weekLabel: string;    // "Apr 5", "Apr 12", etc.
  totalHours: number;
  hitGoal: boolean;
  isCurrent: boolean;   // true for the in-progress week
}[]
```

Week boundaries follow the existing Sat–Fri convention used by the weekly tracker. Uses existing helpers: `getWeekSaturday`, `getWeekDays`, `toLocalDateStr`.

## Visual Layout

New `analytics-card full` card with class `analytics-weekly-trend`, rendered below the Weekly Hours card.

- **Header:** "12-Week Trend" (same style as other card headers)
- **Chart area:** 12 vertical bars, oldest left → newest right
- **Goal line:** Dashed horizontal line at `weeklyGoal.targetHours`. Label on the right edge showing the target value (e.g. "15h"). Only rendered when `weeklyGoal.enabled`.
- **Bar colors:**
  - Hit goal: accent/on-track color (matches existing `analytics-deadline-pill on-track`)
  - Below goal or no goal set: muted/default bar color
  - Current (in-progress) week: same `today` treatment as per-day bars
- **X-axis labels:** `"MMM D"` format (e.g. "Apr 5") of the week-start Saturday, shown below each bar
- **Bar values:** Hours float above bar when > 0 (e.g. "8.5"), omitted when 0
- **Empty state:** Card only renders if at least 1 week has data (totalHours > 0)

## Integration

- No new props required — reads `sceneSessions`, `tasks`, and `weeklyGoal` already available in `WordCountDashboard`
- No new files — new `useMemo` + JSX section within existing component
- CSS follows existing `analytics-weekly-*` naming convention; new classes prefixed `analytics-trend-*`

## Out of Scope

- No click-to-navigate interaction (user can use the weekly tracker's arrows)
- No tooltip on hover
- No scrolling (12 weeks fits without overflow at normal dashboard width)
