/**
 * Session Tracker — automatically tracks writing sessions.
 *
 * A "session" = contiguous time spent editing a single scene.
 * - Starts on the first keystroke in a scene
 * - Pauses after 2 minutes of inactivity (idle detection)
 * - Ends when the user switches scenes, changes views, or closes the app
 * - Records duration (excluding idle time), word count delta, and scene key
 */

import { AnalyticsData, recordSession } from '../utils/analyticsStore';

const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export interface ActiveSession {
  sceneKey: string;          // "characterId:sceneNumber"
  startTime: number;         // Date.now() when session began
  wordsAtStart: number;      // word count when session started
  lastActivityTime: number;  // last keystroke/edit timestamp
  totalIdleMs: number;       // accumulated idle time within this session
  idleStart: number | null;  // when the current idle period began (null = not idle)
  isPaused: boolean;         // true if currently idle
}

export interface SessionSummary {
  sceneKey: string;
  durationMs: number;        // active writing time (excludes idle)
  wordsNet: number;          // net word change
  startTime: number;
  endTime: number;
}

/**
 * Creates a session tracker instance.
 * Call this once in App.tsx and wire it into the edit flow.
 */
export function createSessionTracker() {
  let currentSession: ActiveSession | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let onSessionEnd: ((summary: SessionSummary) => void) | null = null;

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function startIdlePeriod() {
    if (!currentSession || currentSession.isPaused) return;
    currentSession.isPaused = true;
    currentSession.idleStart = Date.now();
  }

  function endIdlePeriod() {
    if (!currentSession || !currentSession.isPaused || !currentSession.idleStart) return;
    currentSession.totalIdleMs += Date.now() - currentSession.idleStart;
    currentSession.idleStart = null;
    currentSession.isPaused = false;
  }

  function resetIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(() => startIdlePeriod(), IDLE_TIMEOUT_MS);
  }

  /**
   * Call on every editor change (keystroke, paste, delete).
   * Starts a new session if none exists, or resumes from idle.
   */
  function recordActivity(sceneKey: string, currentWordCount: number) {
    const now = Date.now();

    // Different scene → end old session, start new one
    if (currentSession && currentSession.sceneKey !== sceneKey) {
      endSession(currentWordCount);
    }

    if (!currentSession) {
      // Start a new session
      currentSession = {
        sceneKey,
        startTime: now,
        wordsAtStart: currentWordCount,
        lastActivityTime: now,
        totalIdleMs: 0,
        idleStart: null,
        isPaused: false,
      };
      resetIdleTimer();
      return;
    }

    // Resume from idle if needed
    if (currentSession.isPaused) {
      endIdlePeriod();
    }

    currentSession.lastActivityTime = now;
    resetIdleTimer();
  }

  /**
   * End the current session (scene switch, view change, app close).
   * Returns the session summary, or null if no session was active.
   */
  function endSession(currentWordCount?: number): SessionSummary | null {
    if (!currentSession) return null;

    clearIdleTimer();

    // If we're in an idle period, close it
    if (currentSession.isPaused && currentSession.idleStart) {
      currentSession.totalIdleMs += Date.now() - currentSession.idleStart;
    }

    const now = Date.now();
    const totalElapsed = now - currentSession.startTime;
    const activeDuration = Math.max(0, totalElapsed - currentSession.totalIdleMs);

    // Only record sessions longer than 30 seconds of active time
    const MIN_SESSION_MS = 30 * 1000;
    if (activeDuration < MIN_SESSION_MS) {
      currentSession = null;
      return null;
    }

    const wordsNet = currentWordCount !== undefined
      ? currentWordCount - currentSession.wordsAtStart
      : 0;

    const summary: SessionSummary = {
      sceneKey: currentSession.sceneKey,
      durationMs: activeDuration,
      wordsNet,
      startTime: currentSession.startTime,
      endTime: now,
    };

    currentSession = null;

    if (onSessionEnd) {
      onSessionEnd(summary);
    }

    return summary;
  }

  /**
   * Get info about the current session (for the toolbar indicator).
   */
  function getCurrentSession(): { sceneKey: string; activeMs: number; isPaused: boolean } | null {
    if (!currentSession) return null;

    const now = Date.now();
    const totalElapsed = now - currentSession.startTime;
    let idleMs = currentSession.totalIdleMs;
    if (currentSession.isPaused && currentSession.idleStart) {
      idleMs += now - currentSession.idleStart;
    }

    return {
      sceneKey: currentSession.sceneKey,
      activeMs: Math.max(0, totalElapsed - idleMs),
      isPaused: currentSession.isPaused,
    };
  }

  /**
   * Register a callback for when sessions end.
   */
  function setOnSessionEnd(callback: (summary: SessionSummary) => void) {
    onSessionEnd = callback;
  }

  /**
   * Check if a session is currently active.
   */
  function isActive(): boolean {
    return currentSession !== null;
  }

  /**
   * Destroy the tracker — clean up timers.
   */
  function destroy() {
    clearIdleTimer();
    currentSession = null;
    onSessionEnd = null;
  }

  return {
    recordActivity,
    endSession,
    getCurrentSession,
    setOnSessionEnd,
    isActive,
    destroy,
  };
}

export type SessionTracker = ReturnType<typeof createSessionTracker>;

/**
 * Helper: merge a completed session into analytics data.
 * Updates the daily session entry and persists to disk.
 */
export function mergeSessionIntoAnalytics(
  analytics: AnalyticsData,
  summary: SessionSummary,
  totalProjectWords: number,
): AnalyticsData {
  const minutes = Math.max(1, Math.round(summary.durationMs / 60000));
  const wordsWritten = Math.max(0, summary.wordsNet); // only count net positive
  return recordSession(analytics, totalProjectWords, wordsWritten, minutes);
}
