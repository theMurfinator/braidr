/**
 * Bug 1: "words written today" undercounted.
 *   Old model summed per-session word deltas (and the manual timer recorded 0),
 *   so it never matched the real manuscript difference. New model snapshots the
 *   total manuscript word count per day: today's words = currentTotal - baseline,
 *   where baseline carries over from the prior day's ending total.
 *
 * Bug 2: manuscript goal reverted to its old value when the timer stopped.
 *   Two in-memory copies of analytics existed (App + dashboard). The dashboard
 *   saved the new goal, but App's stale copy overwrote it on the next analytics
 *   save (timer stop). applyAnalyticsPatch is the seam the fix relies on: a goal
 *   change is merged onto the authoritative copy without dropping sessions.
 */

import { describe, it, expect } from 'vitest';
import {
  AnalyticsData,
  recordManuscriptSnapshot,
  getWordsForDay,
  applyAnalyticsPatch,
  appendSceneSession,
  SceneSession,
} from '../renderer/utils/analyticsStore';

function makeAnalytics(partial: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    sessions: [],
    sceneSessions: [],
    dailyGoal: { enabled: false, target: 500 },
    weeklyGoal: { enabled: false, targetHours: 15 },
    deadlineGoal: { enabled: false, targetWords: 0, deadlineDate: '' },
    milestones: [],
    currentStreak: 0,
    longestStreak: 0,
    lastWritingDate: null,
    ...partial,
  };
}

function makeSession(id: string): SceneSession {
  return {
    id,
    sceneKey: 'char1:1',
    date: '2026-06-06',
    startTime: 1,
    endTime: 2,
    durationMs: 60000,
    wordsNet: 0,
    checkin: null,
  };
}

describe('recordManuscriptSnapshot', () => {
  it("carries today's baseline over from the prior day's ending total", () => {
    const base = makeAnalytics({
      dailyManuscript: { '2026-06-05': { baseline: 40000, latest: 50000 } },
    });

    const updated = recordManuscriptSnapshot(base, '2026-06-06', 51500);

    expect(updated.dailyManuscript!['2026-06-06']).toEqual({ baseline: 50000, latest: 51500 });
    // Today's words = 51500 - 50000 = 1500
    expect(getWordsForDay(updated, '2026-06-06')).toBe(1500);
  });

  it('seeds baseline from currentTotal minus already-counted words when there is no history', () => {
    const base = makeAnalytics(); // no dailyManuscript at all

    // 60000 words now, 313 already attributed to today via old session tracking
    const updated = recordManuscriptSnapshot(base, '2026-06-06', 60000, { seedWordsToday: 313 });

    expect(updated.dailyManuscript!['2026-06-06']).toEqual({ baseline: 59687, latest: 60000 });
    expect(getWordsForDay(updated, '2026-06-06')).toBe(313);
  });

  it("updates latest for an existing day without moving its baseline", () => {
    const base = makeAnalytics({
      dailyManuscript: { '2026-06-06': { baseline: 50000, latest: 51500 } },
    });

    const updated = recordManuscriptSnapshot(base, '2026-06-06', 53000);

    expect(updated.dailyManuscript!['2026-06-06']).toEqual({ baseline: 50000, latest: 53000 });
    expect(getWordsForDay(updated, '2026-06-06')).toBe(3000);
  });

  it('does not mutate the input analytics object', () => {
    const base = makeAnalytics();
    const updated = recordManuscriptSnapshot(base, '2026-06-06', 1000, { seedWordsToday: 0 });
    expect(base.dailyManuscript).toBeUndefined();
    expect(updated).not.toBe(base);
  });
});

describe('getWordsForDay', () => {
  it('returns the net manuscript delta and allows negatives (deletions)', () => {
    const a = makeAnalytics({
      dailyManuscript: { '2026-06-06': { baseline: 50000, latest: 49200 } },
    });
    expect(getWordsForDay(a, '2026-06-06')).toBe(-800);
  });

  it('returns 0 for a day with no snapshot', () => {
    expect(getWordsForDay(makeAnalytics(), '2026-06-06')).toBe(0);
  });
});

describe('applyAnalyticsPatch (Bug 2 seam)', () => {
  it('merges a goal change while preserving sceneSessions', () => {
    const base = makeAnalytics({
      sceneSessions: [makeSession('s1')],
      deadlineGoal: { enabled: true, targetWords: 95000, deadlineDate: '2026-12-31' },
    });

    const patched = applyAnalyticsPatch(base, {
      deadlineGoal: { enabled: true, targetWords: 120000, deadlineDate: '2026-12-31' },
    });

    expect(patched.deadlineGoal.targetWords).toBe(120000);
    expect(patched.sceneSessions).toHaveLength(1);
  });

  it('keeps a goal change that lands before a later session-append save (the revert bug)', () => {
    // Simulate the two-writer scenario with an in-memory "disk".
    let disk = makeAnalytics({
      deadlineGoal: { enabled: true, targetWords: 95000, deadlineDate: '2026-12-31' },
    });
    const save = (d: AnalyticsData) => { disk = JSON.parse(JSON.stringify(d)); };
    const load = () => JSON.parse(JSON.stringify(disk)) as AnalyticsData;

    // App holds the authoritative copy.
    let appRef = load();

    // Dashboard changes the goal: persists to disk AND notifies App (the fix).
    const patch = { deadlineGoal: { enabled: true, targetWords: 120000, deadlineDate: '2026-12-31' } };
    save(applyAnalyticsPatch(load(), patch));
    appRef = applyAnalyticsPatch(appRef, patch); // <-- fix: App no longer goes stale

    // Timer stop: App appends a session to its copy and saves.
    appRef = appendSceneSession(appRef, makeSession('timer-1'));
    save(appRef);

    expect(load().deadlineGoal.targetWords).toBe(120000);
    expect(load().sceneSessions).toHaveLength(1);
  });
});
