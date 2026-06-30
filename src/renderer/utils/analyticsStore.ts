/**
 * Analytics data store — persisted to analytics.json in the project folder.
 * Tracks writing sessions, daily word counts, goals, and milestones.
 */

export interface WritingSession {
  date: string; // ISO date, e.g. "2026-02-11"
  wordsWritten: number;
  duration: number; // minutes spent writing
}

export interface SceneSession {
  id: string;              // unique ID
  sceneKey: string;        // "characterId:sceneNumber"
  date: string;            // ISO date
  startTime: number;       // epoch ms
  endTime: number;         // epoch ms
  durationMs: number;      // active writing time
  wordsNet: number;        // net word delta
  checkin?: {
    energy: number;
    focus: number;
    mood: number;
    custom?: Record<string, number>;
  } | null;
}

export interface CustomCheckinCategory {
  id: string;        // e.g. "cat-abc123"
  label: string;     // e.g. "Creativity"
  lowLabel: string;  // e.g. "Blocked"
  highLabel: string; // e.g. "Flowing"
}

export interface DailyGoal {
  enabled: boolean;
  target: number; // words per day
}

export interface DeadlineGoal {
  enabled: boolean;
  targetWords: number;
  deadlineDate: string; // ISO date "2026-05-31"
}

export interface WeeklyGoal {
  enabled: boolean;
  targetHours: number; // hours per week
}

export interface MonthlyGoal {
  enabled: boolean;
  targetWords: number; // words per calendar month (recurring; resets each month)
}

export interface Milestone {
  id: string;
  label: string;
  targetWords: number;
  achieved: boolean;
  achievedDate?: string;
}

/**
 * Per-day snapshot of the total manuscript word count.
 * `baseline` = total at the start of the day (carried over from the prior
 * day's `latest`); `latest` = most recent observed total that day.
 * Words written that day = latest - baseline (may be negative for deletions).
 */
export interface DailyManuscript {
  baseline: number;
  latest: number;
}

export interface AnalyticsData {
  sessions: WritingSession[];
  sceneSessions: SceneSession[];
  dailyGoal: DailyGoal;
  weeklyGoal: WeeklyGoal;
  monthlyGoal: MonthlyGoal;
  deadlineGoal: DeadlineGoal;
  milestones: Milestone[];
  currentStreak: number;
  longestStreak: number;
  lastWritingDate: string | null;
  customCheckinCategories?: CustomCheckinCategory[];
  /** Daily total-manuscript snapshots, keyed by YYYY-MM-DD. */
  dailyManuscript?: Record<string, DailyManuscript>;
  /**
   * Which scenes the manuscript word total counts. 'braided' = only scenes
   * placed in the timeline (timelinePosition !== null); legacy/undefined =
   * 'all' active scenes (braided + bullpen). A one-time rebaseline on first
   * load switches existing projects to 'braided' without a phantom deletion;
   * historical daily numbers stay on whatever basis recorded them (the stored
   * snapshots only hold totals, so braided-only history can't be reconstructed).
   */
  manuscriptBasis?: 'all' | 'braided';
}

const DEFAULT_ANALYTICS: AnalyticsData = {
  sessions: [],
  sceneSessions: [],
  dailyGoal: { enabled: false, target: 500 },
  weeklyGoal: { enabled: false, targetHours: 15 },
  monthlyGoal: { enabled: false, targetWords: 20000 },
  deadlineGoal: { enabled: false, targetWords: 0, deadlineDate: '' },
  milestones: [],
  currentStreak: 0,
  longestStreak: 0,
  lastWritingDate: null,
};

const DEFAULT_MILESTONES: Milestone[] = [
  { id: 'ms-10k', label: '10,000 words', targetWords: 10000, achieved: false },
  { id: 'ms-25k', label: '25,000 words', targetWords: 25000, achieved: false },
  { id: 'ms-50k', label: '50,000 words (NaNoWriMo)', targetWords: 50000, achieved: false },
  { id: 'ms-80k', label: '80,000 words (novel)', targetWords: 80000, achieved: false },
  { id: 'ms-100k', label: '100,000 words', targetWords: 100000, achieved: false },
];

/**
 * Load analytics data from the project folder.
 */
export async function loadAnalytics(projectPath: string): Promise<AnalyticsData> {
  try {
    const result = await window.electronAPI.readAnalytics(projectPath);
    if (result.success && result.data) {
      // Heal any spurious snapshot collapses (partial-load phantom deletions)
      // before the data reaches the dashboard.
      return repairManuscriptSnapshots({ ...DEFAULT_ANALYTICS, milestones: DEFAULT_MILESTONES, ...result.data });
    }
  } catch {}
  return { ...DEFAULT_ANALYTICS, milestones: DEFAULT_MILESTONES };
}

/**
 * Save analytics data to the project folder.
 */
export async function saveAnalytics(projectPath: string, data: AnalyticsData): Promise<void> {
  try {
    await window.electronAPI.saveAnalytics(projectPath, data);
  } catch (err) {
    console.error('Failed to save analytics:', err);
  }
}

/**
 * Record/update today's manuscript snapshot.
 *
 * - If the date already has an entry, only `latest` is updated (baseline is fixed
 *   for the life of the day).
 * - If it's a new day, the baseline carries over from the most recent prior day's
 *   `latest`. When there is no prior history, the baseline is seeded so that
 *   today's already-counted words (`seedWordsToday`) are preserved:
 *   baseline = currentTotal - seedWordsToday.
 */
export function recordManuscriptSnapshot(
  analytics: AnalyticsData,
  date: string,
  currentTotal: number,
  opts?: { seedWordsToday?: number },
): AnalyticsData {
  const dm: Record<string, DailyManuscript> = { ...(analytics.dailyManuscript || {}) };

  if (dm[date]) {
    dm[date] = { baseline: dm[date].baseline, latest: currentTotal };
  } else {
    // Most recent prior day's ending total becomes today's starting baseline.
    const priorDates = Object.keys(dm).filter(d => d < date).sort();
    const priorLatest = priorDates.length > 0 ? dm[priorDates[priorDates.length - 1]].latest : undefined;
    const baseline = priorLatest !== undefined
      ? priorLatest
      : currentTotal - (opts?.seedWordsToday ?? 0);
    dm[date] = { baseline, latest: currentTotal };
  }

  return { ...analytics, dailyManuscript: dm };
}

/**
 * Net manuscript words for a day from its snapshot (latest - baseline).
 * Returns 0 when there is no snapshot for that day.
 */
export function getWordsForDay(analytics: AnalyticsData, date: string): number {
  const e = analytics.dailyManuscript?.[date];
  return e ? e.latest - e.baseline : 0;
}

/**
 * Repair spurious manuscript-snapshot collapses.
 *
 * A partial-load reading (drafts still streaming in) can record a near-zero
 * `latest` for a day. That propagates as the next day's baseline and shows up as
 * a huge phantom deletion (e.g. -44k) followed by an equal phantom gain when the
 * real total reappears. We detect a day whose `latest` collapsed far below the
 * running total AND later recovered, carry the prior total across it, then
 * re-chain baselines (`baseline = prior day's latest`, which is the model's
 * invariant) so daily deltas are clean again.
 *
 * Conservative: only the collapse-THEN-recover signature is touched. A genuine
 * deletion (the total stays low afterward) is left untouched.
 */
export function repairManuscriptSnapshots(analytics: AnalyticsData): AnalyticsData {
  const dm = analytics.dailyManuscript;
  if (!dm) return analytics;
  const dates = Object.keys(dm).sort();
  if (dates.length < 2) return analytics;

  const fixed: Record<string, DailyManuscript> = {};
  let prevLatest: number | undefined;
  let changed = false;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const entry = dm[d];
    let latest = entry.latest;

    if (prevLatest !== undefined && prevLatest > 100 && latest < prevLatest * 0.5) {
      const recovers = dates
        .slice(i + 1)
        .some(dd => dm[dd].latest >= prevLatest! * 0.8);
      if (recovers) {
        latest = prevLatest; // carry the total across the spurious dip (net 0 that day)
        changed = true;
      }
    }

    const baseline = prevLatest !== undefined ? prevLatest : entry.baseline;
    if (baseline !== entry.baseline || latest !== entry.latest) changed = true;
    fixed[d] = { baseline, latest };
    prevLatest = latest;
  }

  if (!changed) return analytics;
  return { ...analytics, dailyManuscript: fixed };
}

/**
 * Shallow-merge a partial change onto an analytics object.
 * Used to keep separate in-memory copies (App's authoritative ref and the
 * dashboard) in sync when only a few config fields change, without one writer
 * clobbering the other's data (e.g. sceneSessions). See Bug 2.
 */
export function applyAnalyticsPatch(
  analytics: AnalyticsData,
  patch: Partial<AnalyticsData>,
): AnalyticsData {
  return { ...analytics, ...patch };
}

/**
 * Format a Date as YYYY-MM-DD in local time.
 */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get today's date string in YYYY-MM-DD (local time).
 */
export function getTodayStr(): string {
  return toLocalDateStr(new Date());
}

/**
 * Record a writing session — updates today's entry or creates a new one.
 * Also updates streak tracking and milestone checks.
 */
export function recordSession(
  analytics: AnalyticsData,
  totalProjectWords: number,
  wordsThisSession: number,
  minutesElapsed: number
): AnalyticsData {
  const today = getTodayStr();
  const sessions = [...analytics.sessions];

  // Find or create today's session
  const todayIdx = sessions.findIndex(s => s.date === today);
  if (todayIdx >= 0) {
    sessions[todayIdx] = {
      ...sessions[todayIdx],
      wordsWritten: sessions[todayIdx].wordsWritten + wordsThisSession,
      duration: sessions[todayIdx].duration + minutesElapsed,
    };
  } else {
    sessions.push({
      date: today,
      wordsWritten: wordsThisSession,
      duration: minutesElapsed,
    });
  }

  // Sort sessions by date
  sessions.sort((a, b) => a.date.localeCompare(b.date));

  // Update streak
  let currentStreak = analytics.currentStreak;
  let longestStreak = analytics.longestStreak;

  if (analytics.lastWritingDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterday);

    if (analytics.lastWritingDate === yesterdayStr) {
      currentStreak = currentStreak + 1;
    } else if (analytics.lastWritingDate !== today) {
      currentStreak = 1;
    }
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  // Check milestones
  const milestones = analytics.milestones.map(m => {
    if (!m.achieved && totalProjectWords >= m.targetWords) {
      return { ...m, achieved: true, achievedDate: today };
    }
    return m;
  });

  return {
    ...analytics,
    sessions,
    milestones,
    currentStreak,
    longestStreak,
    lastWritingDate: today,
  };
}

/**
 * Get word counts for the last N days (for charting).
 */
export function getRecentDays(sessions: WritingSession[], days: number): { date: string; words: number }[] {
  const result: { date: string; words: number }[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateStr(d);
    const session = sessions.find(s => s.date === dateStr);
    result.push({
      date: dateStr,
      words: session?.wordsWritten || 0,
    });
  }

  return result;
}

/**
 * Get this week's total words.
 */
export function getThisWeekWords(sessions: WritingSession[]): number {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const mondayStr = toLocalDateStr(monday);

  return sessions
    .filter(s => s.date >= mondayStr)
    .reduce((sum, s) => sum + s.wordsWritten, 0);
}

/**
 * Append a granular scene session to the analytics data.
 */
export function appendSceneSession(
  analytics: AnalyticsData,
  session: SceneSession,
): AnalyticsData {
  return {
    ...analytics,
    sceneSessions: [...(analytics.sceneSessions || []), session],
  };
}

/**
 * Get total time and session count for a specific scene.
 */
export function getSceneSessionTotals(
  sceneSessions: SceneSession[],
  sceneKey: string,
): { totalMs: number; sessionCount: number; totalWords: number } {
  const matching = sceneSessions.filter(s => s.sceneKey === sceneKey);
  return {
    totalMs: matching.reduce((sum, s) => sum + s.durationMs, 0),
    sessionCount: matching.length,
    totalWords: matching.reduce((sum, s) => sum + s.wordsNet, 0),
  };
}

/**
 * Add a manual time entry for a scene.
 */
export function addManualTime(
  analytics: AnalyticsData,
  sceneKey: string,
  durationMs: number,
  date?: string,
): AnalyticsData {
  const now = Date.now();
  const session: SceneSession = {
    id: `manual-${now}-${Math.random().toString(36).slice(2, 8)}`,
    sceneKey,
    date: date || getTodayStr(),
    startTime: now,
    endTime: now,
    durationMs,
    wordsNet: 0,
    checkin: null,
  };
  return {
    ...analytics,
    sceneSessions: [...(analytics.sceneSessions || []), session],
  };
}

/**
 * Get sessions for a scene grouped by date, sorted most recent first.
 */
export function getSceneSessionsByDate(
  sceneSessions: SceneSession[],
  sceneKey: string,
): { date: string; totalMs: number; sessionCount: number }[] {
  const matching = sceneSessions.filter(s => s.sceneKey === sceneKey);
  const byDate: Record<string, { totalMs: number; sessionCount: number }> = {};
  for (const s of matching) {
    if (!byDate[s.date]) byDate[s.date] = { totalMs: 0, sessionCount: 0 };
    byDate[s.date].totalMs += s.durationMs;
    byDate[s.date].sessionCount += 1;
  }
  return Object.entries(byDate)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Update a specific scene session's duration by ID.
 */
export function updateSceneSession(
  analytics: AnalyticsData,
  sessionId: string,
  updates: { durationMs: number },
): AnalyticsData {
  return {
    ...analytics,
    sceneSessions: (analytics.sceneSessions || []).map(s =>
      s.id === sessionId ? { ...s, ...updates } : s
    ),
  };
}

/**
 * Delete a specific scene session by ID.
 */
export function deleteSceneSession(
  analytics: AnalyticsData,
  sessionId: string,
): AnalyticsData {
  return {
    ...analytics,
    sceneSessions: (analytics.sceneSessions || []).filter(s => s.id !== sessionId),
  };
}

/**
 * Get individual sessions for a scene, sorted most recent first.
 */
export function getSceneSessionsList(
  sceneSessions: SceneSession[],
  sceneKey: string,
): SceneSession[] {
  return sceneSessions
    .filter(s => s.sceneKey === sceneKey)
    .sort((a, b) => b.startTime - a.startTime);
}

/**
 * Get average check-in scores across all sessions with check-in data.
 * Includes custom category averages keyed by category ID.
 */
export function getCheckinAverages(
  sceneSessions: SceneSession[],
): { energy: number; focus: number; mood: number; count: number; custom?: Record<string, { avg: number; count: number }> } | null {
  const withCheckins = sceneSessions.filter(s => s.checkin);
  if (withCheckins.length === 0) return null;
  const count = withCheckins.length;

  // Compute custom category averages
  const customTotals: Record<string, { sum: number; count: number }> = {};
  for (const s of withCheckins) {
    if (s.checkin?.custom) {
      for (const [catId, score] of Object.entries(s.checkin.custom)) {
        if (!customTotals[catId]) customTotals[catId] = { sum: 0, count: 0 };
        customTotals[catId].sum += score;
        customTotals[catId].count += 1;
      }
    }
  }
  const custom: Record<string, { avg: number; count: number }> = {};
  for (const [catId, data] of Object.entries(customTotals)) {
    custom[catId] = { avg: data.sum / data.count, count: data.count };
  }

  return {
    energy: withCheckins.reduce((s, x) => s + x.checkin!.energy, 0) / count,
    focus: withCheckins.reduce((s, x) => s + x.checkin!.focus, 0) / count,
    mood: withCheckins.reduce((s, x) => s + x.checkin!.mood, 0) / count,
    count,
    ...(Object.keys(custom).length > 0 ? { custom } : {}),
  };
}

/**
 * Get the Saturday that starts the week containing a given date.
 * Weeks run Saturday–Friday.
 */
export function getWeekSaturday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 6=Sat
  // Saturday is day 6. If today is Sat (6), offset is 0.
  // Sun (0) → went back 1, Mon (1) → back 2, ... Fri (5) → back 6
  const offset = (day + 1) % 7; // Sat=0, Sun=1, Mon=2, ..., Fri=6
  d.setDate(d.getDate() - offset);
  return d;
}

/**
 * Get ISO date strings (YYYY-MM-DD) for each day in a Sat–Fri week
 * starting from the given Saturday.
 */
export function getWeekDays(saturday: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    days.push(toLocalDateStr(d));
  }
  return days;
}

/**
 * Format a week range label, e.g. "Apr 12 – Apr 18, 2026"
 */
export function formatWeekLabel(saturday: Date): string {
  const friday = new Date(saturday);
  friday.setDate(saturday.getDate() + 6);
  const satMonth = saturday.toLocaleDateString('en-US', { month: 'short' });
  const friMonth = friday.toLocaleDateString('en-US', { month: 'short' });
  const satDay = saturday.getDate();
  const friDay = friday.getDate();
  const year = friday.getFullYear();
  if (satMonth === friMonth) {
    return `${satMonth} ${satDay} – ${friDay}, ${year}`;
  }
  return `${satMonth} ${satDay} – ${friMonth} ${friDay}, ${year}`;
}
