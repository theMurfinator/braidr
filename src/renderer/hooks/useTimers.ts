import { useState, useEffect, useRef, useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { ProjectData, Task, TimeEntry } from '../../shared/types';
import { AnalyticsData, SceneSession, appendSceneSession, addManualTime, updateSceneSession, deleteSceneSession, saveAnalytics, getTodayStr } from '../utils/analyticsStore';

interface UseTimersOptions {
  projectData: ProjectData | null;
  analyticsRef: MutableRefObject<AnalyticsData | null>;
  setSceneSessions: Dispatch<SetStateAction<SceneSession[]>>;
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  tasksRef: MutableRefObject<Task[]>;
  isDirtyRef: MutableRefObject<boolean>;
}

export function useTimers({
  projectData,
  analyticsRef,
  setSceneSessions,
  tasks,
  setTasks,
  tasksRef,
  isDirtyRef,
}: UseTimersOptions) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const [timerSceneKey, setTimerSceneKey] = useState<string | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRunningRef = useRef(false);
  const timerStartedAtRef = useRef<number | null>(null);

  const [taskTimerRunning, setTaskTimerRunning] = useState(false);
  const [taskTimerElapsed, setTaskTimerElapsed] = useState(0);
  const [taskTimerTaskId, setTaskTimerTaskId] = useState<string | null>(null);
  const taskTimerStartRef = useRef<number | null>(null);
  const taskTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskTimerRunningRef = useRef(false);
  const taskTimerTaskIdRef = useRef<string | null>(null);

  useEffect(() => { timerRunningRef.current = timerRunning; }, [timerRunning]);
  useEffect(() => { taskTimerRunningRef.current = taskTimerRunning; }, [taskTimerRunning]);
  useEffect(() => { taskTimerTaskIdRef.current = taskTimerTaskId; }, [taskTimerTaskId]);

  // Restore persisted timer on mount
  useEffect(() => {
    const sceneRaw = localStorage.getItem('braidr-active-scene-timer');
    const taskRaw = localStorage.getItem('braidr-active-task-timer');

    if (sceneRaw) {
      try {
        const { id, startedAt } = JSON.parse(sceneRaw);
        timerStartedAtRef.current = startedAt;
        setTimerSceneKey(id);
        setTimerElapsed(Math.floor((Date.now() - startedAt) / 1000));
        setTimerRunning(true);
      } catch {
        localStorage.removeItem('braidr-active-scene-timer');
      }
      if (taskRaw) localStorage.removeItem('braidr-active-task-timer');
    } else if (taskRaw) {
      try {
        const { id, startedAt } = JSON.parse(taskRaw);
        taskTimerStartRef.current = startedAt;
        setTaskTimerTaskId(id);
        setTaskTimerElapsed(Date.now() - startedAt);
        setTaskTimerRunning(true);
      } catch {
        localStorage.removeItem('braidr-active-task-timer');
      }
    }
  }, []);

  // Validate persisted scene timer target after data loads
  useEffect(() => {
    if (timerSceneKey && projectData && projectData.scenes.length > 0) {
      const exists = projectData.scenes.some(s => s.id === timerSceneKey);
      if (!exists) {
        localStorage.removeItem('braidr-active-scene-timer');
        setTimerRunning(false);
        setTimerElapsed(0);
        setTimerSceneKey(null);
      }
    }
  }, [timerSceneKey, projectData]);

  useEffect(() => {
    if (timerRunning) {
      timerIntervalRef.current = setInterval(() => {
        if (timerStartedAtRef.current !== null) {
          setTimerElapsed(Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
        }
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning]);

  // Re-sync scene timer when window regains focus after sleep
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && timerRunningRef.current && timerStartedAtRef.current !== null) {
        setTimerElapsed(Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

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

  // Validate persisted task timer target after tasks load
  useEffect(() => {
    if (taskTimerTaskId && tasks.length > 0) {
      const exists = tasks.some(t => t.id === taskTimerTaskId);
      if (!exists) {
        localStorage.removeItem('braidr-active-task-timer');
        setTaskTimerTaskId(null);
        taskTimerStartRef.current = null;
        setTaskTimerElapsed(0);
        setTaskTimerRunning(false);
      }
    }
  }, [taskTimerTaskId, tasks]);

  const formatTimer = useCallback((totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }, []);

  const handleStopTimer = useCallback(() => {
    localStorage.removeItem('braidr-active-scene-timer');
    setTimerRunning(false);
    setTimerElapsed(prev => {
      if (prev >= 1 && timerSceneKey && analyticsRef.current && projectData) {
        const durationMs = prev * 1000;
        const now = Date.now();
        const session: SceneSession = {
          id: `timer-${now}-${Math.random().toString(36).slice(2, 8)}`,
          sceneKey: timerSceneKey,
          date: getTodayStr(),
          startTime: timerStartedAtRef.current ?? now - durationMs,
          endTime: now,
          durationMs,
          wordsNet: 0,
          checkin: null,
        };
        const updated = appendSceneSession(analyticsRef.current, session);
        analyticsRef.current = updated;
        setSceneSessions(updated.sceneSessions || []);
        saveAnalytics(projectData.projectPath, updated);
      }
      return 0;
    });
    timerStartedAtRef.current = null;
    setTimerSceneKey(null);
  }, [timerSceneKey, projectData, analyticsRef, setSceneSessions]);

  const handleResetTimer = useCallback(() => {
    localStorage.removeItem('braidr-active-scene-timer');
    setTimerRunning(false);
    setTimerElapsed(0);
    timerStartedAtRef.current = null;
    setTimerSceneKey(null);
  }, []);

  const handleStopTaskTimer = useCallback(() => {
    const currentTaskId = taskTimerTaskIdRef.current;
    if (!currentTaskId || !taskTimerStartRef.current) return;
    localStorage.removeItem('braidr-active-task-timer');
    const duration = Date.now() - taskTimerStartRef.current;
    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      startedAt: taskTimerStartRef.current,
      duration,
    };
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === currentTaskId
          ? { ...t, timeEntries: [...t.timeEntries, entry], updatedAt: Date.now() }
          : t
      );
      tasksRef.current = updated;
      isDirtyRef.current = true;
      return updated;
    });
    setTaskTimerTaskId(null);
    taskTimerStartRef.current = null;
    setTaskTimerElapsed(0);
    setTaskTimerRunning(false);
  }, [setTasks, tasksRef, isDirtyRef]);

  const handleStartTaskTimer = useCallback((taskId: string) => {
    if (timerRunningRef.current) {
      handleStopTimer();
    }
    if (taskTimerTaskIdRef.current) {
      handleStopTaskTimer();
    }
    const startedAt = Date.now();
    setTaskTimerTaskId(taskId);
    taskTimerStartRef.current = startedAt;
    setTaskTimerElapsed(0);
    setTaskTimerRunning(true);
    localStorage.setItem('braidr-active-task-timer', JSON.stringify({ id: taskId, startedAt }));
  }, [handleStopTimer, handleStopTaskTimer]);

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

  const handleAddManualTime = useCallback((sceneKey: string, minutes: number) => {
    if (!analyticsRef.current || !projectData) return;
    const durationMs = minutes * 60 * 1000;
    const updated = addManualTime(analyticsRef.current, sceneKey, durationMs);
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);
  }, [projectData, analyticsRef, setSceneSessions]);

  const handleUpdateSession = useCallback((sessionId: string, durationMs: number) => {
    if (!analyticsRef.current || !projectData) return;
    const updated = updateSceneSession(analyticsRef.current, sessionId, { durationMs });
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);
  }, [projectData, analyticsRef, setSceneSessions]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    if (!analyticsRef.current || !projectData) return;
    const updated = deleteSceneSession(analyticsRef.current, sessionId);
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);
  }, [projectData, analyticsRef, setSceneSessions]);

  const handleResumeTimer = useCallback(() => {
    setTimerRunning(true);
  }, []);

  const handleResumeTaskTimer = useCallback(() => {
    setTaskTimerElapsed(prev => {
      taskTimerStartRef.current = Date.now() - prev;
      return prev;
    });
    setTaskTimerRunning(true);
  }, []);

  return {
    timerRunning,
    timerElapsed,
    timerSceneKey,
    taskTimerRunning,
    taskTimerElapsed,
    taskTimerTaskId,
    formatTimer,
    handleStartTimer,
    handleStopTimer,
    handleResetTimer,
    handleResumeTimer,
    handleResumeTaskTimer,
    handleStartTaskTimer,
    handleStopTaskTimer,
    handleAddManualTime,
    handleUpdateSession,
    handleDeleteSession,
  };
}
