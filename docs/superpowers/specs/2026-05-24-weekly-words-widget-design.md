# Weekly Words Widget — Design Spec

**Date:** 2026-05-24
**Status:** Approved

## Problem

The current analytics dashboard has two separate places to express a daily word count goal:

1. A manual `dailyGoal.target` input ("Set daily goal" in the Today section)
2. A `deadlineGoal` section where you enter manuscript length + deadline date, which auto-calculates required words/day

These are redundant and confusing. The "Today" and "Deadline" sections also lack the week-at-a-glance view that makes the Weekly Hours card useful.

## Solution

Replace both the "Today" section and the "Deadline" section in the Writing Goals card with a single **Weekly Words** card. The card mirrors the Weekly Hours card exactly in layout and style. One configuration (manuscript target + target date) drives everything — daily target and weekly target are both derived automatically.

## Layout

Full-width card using the same CSS structure as Weekly Hours (`analytics-weekly-tracker`, `analytics-card full`, `analytics-weekly-body`).

### Header
Centered title "Weekly Words" with week label (e.g., "May 18 – May 24") and prev/next week navigation arrows. Same structure as Weekly Hours header.

### Left panel
Mirrors Weekly Hours left panel exactly:
- **Big number:** `1,035 / 1,960` (words this week / weekly target)
- **Derived label:** `280 words/day · 1,960/week` (auto-calculated, not editable)
- **Progress bar:** weekly words / weekly target
- **Pace line:** `Target through today: 1,400 · Behind by 365` (or "Ahead by N")
- **On-track pill:** `✓ On track` / `⚠ Behind pace` / `✓ Target hit` / `✗ Missed`
- **Edit button:** `90,000 words · Jan 1, 2027` — clicking opens the inline config form

### Right panel (bar chart)
7-day bar chart (Sat–Fri), same structure as Weekly Hours bar chart:
- One bar per day showing net new words written that day
- **Dashed horizontal reference line** at the height corresponding to the daily target, with a `280/day` label on the right edge
- Today's bar highlighted; future bars faded/ghost
- Value labels above each bar (hidden when zero)
- Day labels below (today bold)

### On-track calculation
```
daily_target   = ceil(words_remaining / days_remaining)
weekly_target  = daily_target × 7
target_through_today = daily_target × (days elapsed in week including today)
pace = words_this_week − target_through_today
on_track = pace >= 0
```

## Configuration

Single inline form (same pattern as the existing weekly hours edit):

| Field | Input |
|---|---|
| Target manuscript length | Number input (words) |
| Target date | Date picker |

Live preview shows derived values as the user types:
- `= 280 words/day · 1,960/week · 222 days remaining`

Save writes to `analytics.deadlineGoal` (`{ enabled, targetWords, deadlineDate }`). Also calls `onGoalChange(targetWords)` to keep `wordCountGoal` prop in sync for other uses (e.g., the Project Goal progress bar in the summary strip).

## Word Counting — Truly New Words

The existing session tracker records gross words written per session (words typed, not net gain). This widget needs **net manuscript growth**: how many words were actually added to the manuscript that day.

**Implementation:** snapshot the total manuscript word count at session start and end. Daily new words = `end_snapshot − start_snapshot`. If the day has multiple sessions, sum the net deltas.

This means adding a `wordCountSnapshot` field to `SceneSession` (or a separate daily snapshot store) that captures total manuscript words when a writing session starts and ends.

The existing `wordsWritten` field on sessions continues to exist for the Writing Log table. The new daily word count for this widget uses the snapshot-based net delta instead.

## Data Model Changes

### `analytics.deadlineGoal` (reused, unchanged)
```ts
deadlineGoal: {
  enabled: boolean
  targetWords: number
  deadlineDate: string  // YYYY-MM-DD
}
```

### `analytics.dailyGoal` (hidden from UI, preserved for backward compat)
No longer surfaced in any edit UI. Existing values ignored by the new widget.

### `SceneSession` (extended)
```ts
interface SceneSession {
  // ... existing fields ...
  manuscriptWordsAtStart?: number  // total word count when session started
  manuscriptWordsAtEnd?: number    // total word count when session ended
}
```

Daily net words for a given date = sum of `(manuscriptWordsAtEnd - manuscriptWordsAtStart)` across all sessions on that date where both snapshots exist. Falls back to `wordsNet` if snapshots are missing (backward compat).

## What Is Removed

- The "Today" hero section from the Writing Goals card (daily word count + manual goal input)
- The "Deadline" section from the Writing Goals card (replaced by this widget's config)
- The "Project Goal" section from the Writing Goals card is **kept as display-only** — it shows total words / manuscript target as a progress bar. Its standalone edit button is removed; the manuscript target is now only configurable through the Weekly Words widget config form (which calls `onGoalChange` to keep `wordCountGoal` in sync)

## What Is Not Changed

- Weekly Hours card — unchanged
- Summary strip — unchanged
- Writing Log, Calendar Heatmap, Words Over Time charts — unchanged
- `deadlineGoal` data structure — reused as-is
