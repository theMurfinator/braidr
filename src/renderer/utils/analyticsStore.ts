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
  checkin?: { energy: number; focus: number; mood: number } | null;
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

export interface Milestone {
  id: string;
  label: string;
  targetWords: number;
  achieved: boolean;
  achievedDate?: string;
}

export interface AnalyticsData {
  sessions: WritingSession[];
  sceneSessions: SceneSession[];
  dailyGoal: DailyGoal;
  deadlineGoal: DeadlineGoal;
  milestones: Milestone[];
  currentStreak: number;
  longestStreak: number;
  lastWritingDate: string | null;
}

const DEFAULT_ANALYTICS: AnalyticsData = {
  sessions: [],
  sceneSessions: [],
  dailyGoal: { enabled: false, target: 500 },
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
      return { ...DEFAULT_ANALYTICS, milestones: DEFAULT_MILESTONES, ...result.data };
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
 * Get today's date string in ISO format.
 */
export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
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
    const yesterdayStr = yesterday.toISOString().split('T')[0];

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
    const dateStr = d.toISOString().split('T')[0];
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
  const mondayStr = monday.toISOString().split('T')[0];

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
 * Get average check-in scores across all sessions with check-in data.
 */
export function getCheckinAverages(
  sceneSessions: SceneSession[],
): { energy: number; focus: number; mood: number; count: number } | null {
  const withCheckins = sceneSessions.filter(s => s.checkin);
  if (withCheckins.length === 0) return null;
  const count = withCheckins.length;
  return {
    energy: withCheckins.reduce((s, x) => s + x.checkin!.energy, 0) / count,
    focus: withCheckins.reduce((s, x) => s + x.checkin!.focus, 0) / count,
    mood: withCheckins.reduce((s, x) => s + x.checkin!.mood, 0) / count,
    count,
  };
}
