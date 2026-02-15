import { useState, useMemo, useEffect } from 'react';
import { Scene, Character, PlotPoint } from '../../shared/types';
import { AnalyticsData, SceneSession, loadAnalytics, saveAnalytics, getRecentDays, getThisWeekWords, getTodayStr, getCheckinAverages } from '../utils/analyticsStore';
import { track } from '../utils/posthogTracker';

interface WordCountDashboardProps {
  scenes: Scene[];
  characters: Character[];
  plotPoints: PlotPoint[];
  characterColors: Record<string, string>;
  draftContent: Record<string, string>;
  sceneMetadata: Record<string, Record<string, string | string[]>>;
  wordCountGoal: number;
  projectPath: string;
  onGoalChange: (goal: number) => void;
  onClose?: () => void; // optional — unused when inline
  sceneSessions?: SceneSession[];
}

function countWords(html: string): number {
  if (!html || html === '<p></p>') return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function getSceneKey(scene: Scene): string {
  return `${scene.characterId}:${scene.sceneNumber}`;
}

export default function WordCountDashboard({ scenes, characters, plotPoints, characterColors, draftContent, sceneMetadata, wordCountGoal, projectPath, onGoalChange, sceneSessions = [] }: WordCountDashboardProps) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(wordCountGoal || ''));
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [editingDailyGoal, setEditingDailyGoal] = useState(false);
  const [dailyGoalInput, setDailyGoalInput] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineTargetInput, setDeadlineTargetInput] = useState('');
  const [deadlineDateInput, setDeadlineDateInput] = useState('');

  // Load analytics on mount
  useEffect(() => {
    if (projectPath) {
      loadAnalytics(projectPath).then(data => {
        setAnalytics(data);
        setDailyGoalInput(String(data.dailyGoal.target || 500));
      });
    }
  }, [projectPath]);

  // Calculate word counts
  const stats = useMemo(() => {
    let totalWords = 0;
    const perCharacter: Record<string, number> = {};
    const perPlotPoint: Record<string, number> = {};
    const perStatus: Record<string, number> = {};
    let draftedScenes = 0;
    let longestScene = 0;
    const sceneCounts: number[] = [];

    scenes.forEach(scene => {
      const key = getSceneKey(scene);
      const content = draftContent[key];
      const words = countWords(content || '');

      totalWords += words;
      if (words > 0) {
        draftedScenes++;
        sceneCounts.push(words);
        if (words > longestScene) longestScene = words;
      }

      // Per character
      if (!perCharacter[scene.characterId]) perCharacter[scene.characterId] = 0;
      perCharacter[scene.characterId] += words;

      // Per plot point
      if (scene.plotPointId) {
        if (!perPlotPoint[scene.plotPointId]) perPlotPoint[scene.plotPointId] = 0;
        perPlotPoint[scene.plotPointId] += words;
      }

      // Per status
      const meta = sceneMetadata[key];
      const status = (meta?.['_status'] as string) || 'No status';
      if (!perStatus[status]) perStatus[status] = 0;
      perStatus[status]++;
    });

    const avgWords = sceneCounts.length > 0 ? Math.round(sceneCounts.reduce((a, b) => a + b, 0) / sceneCounts.length) : 0;

    return { totalWords, perCharacter, perPlotPoint, perStatus, draftedScenes, longestScene, avgWords };
  }, [scenes, draftContent, sceneMetadata]);

  // Reload analytics periodically so dashboard reflects session tracker writes
  useEffect(() => {
    if (!projectPath) return;
    const interval = setInterval(() => {
      loadAnalytics(projectPath).then(data => setAnalytics(data));
    }, 5000);
    return () => clearInterval(interval);
  }, [projectPath]);

  const handleGoalSave = () => {
    const parsed = parseInt(goalInput, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      track('goal_set', { type: 'project' });
      onGoalChange(parsed);
    }
    setEditingGoal(false);
  };

  const handleDailyGoalSave = () => {
    if (!analytics || !projectPath) return;
    const parsed = parseInt(dailyGoalInput, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      track('goal_set', { type: 'daily' });
      const updated = {
        ...analytics,
        dailyGoal: { enabled: parsed > 0, target: parsed },
      };
      setAnalytics(updated);
      saveAnalytics(projectPath, updated);
    }
    setEditingDailyGoal(false);
  };

  const goalProgress = wordCountGoal > 0 ? Math.min(stats.totalWords / wordCountGoal, 1) : 0;

  // Activity data
  const recentDays = analytics ? getRecentDays(analytics.sessions, 30) : [];
  const maxDayWords = Math.max(...recentDays.map(d => d.words), 1);
  const todayWords = recentDays.length > 0 ? recentDays[recentDays.length - 1].words : 0;
  const weekWords = analytics ? getThisWeekWords(analytics.sessions) : 0;
  const dailyGoalProgress = analytics?.dailyGoal.enabled && analytics.dailyGoal.target > 0
    ? Math.min(todayWords / analytics.dailyGoal.target, 1)
    : 0;

  // Calendar heatmap data
  const calendarData = useMemo(() => {
    if (!analytics) return [];
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = getTodayStr();

    const cells: { day: number; words: number; duration: number; isToday: boolean; isFuture: boolean }[] = [];
    // Empty leading cells
    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: 0, words: 0, duration: 0, isToday: false, isFuture: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const session = analytics.sessions.find(s => s.date === dateStr);
      const isFuture = new Date(dateStr) > today;
      cells.push({
        day: d,
        words: session?.wordsWritten || 0,
        duration: session?.duration || 0,
        isToday: dateStr === todayStr,
        isFuture,
      });
    }
    return cells;
  }, [analytics, calendarMonth]);

  const calendarMonthLabel = new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function getHeatLevel(words: number): string {
    if (!words || words === 0) return '';
    if (words < 300) return 'l1';
    if (words < 800) return 'l2';
    if (words < 1500) return 'l3';
    return 'l4';
  }

  // Monthly words for the displayed calendar month
  const monthlyWords = useMemo(() => {
    if (!analytics) return 0;
    const { year, month } = calendarMonth;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return analytics.sessions
      .filter(s => s.date.startsWith(prefix))
      .reduce((sum, s) => sum + s.wordsWritten, 0);
  }, [analytics, calendarMonth]);

  const monthlySessionCount = useMemo(() => {
    if (!analytics) return 0;
    const { year, month } = calendarMonth;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return analytics.sessions.filter(s => s.date.startsWith(prefix)).length;
  }, [analytics, calendarMonth]);

  const avgWordsPerDay = monthlySessionCount > 0 ? Math.round(monthlyWords / monthlySessionCount) : 0;

  // Goal ring: compute circumference
  const goalRingR = 50;
  const goalRingC = 2 * Math.PI * goalRingR; // ~314.16
  const goalRingOffset = goalRingC - goalRingC * goalProgress;

  // Deadline goal computed values
  const deadlineGoal = analytics?.deadlineGoal;
  const deadlineStats = useMemo(() => {
    if (!deadlineGoal?.enabled || !deadlineGoal.deadlineDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(deadlineGoal.deadlineDate + 'T00:00:00');
    // Include today as a remaining day (if deadline is today, that's 1 day left to write)
    const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / 86400000) + 1);
    const wordsRemaining = Math.max(0, deadlineGoal.targetWords - stats.totalWords);
    const requiredPerDay = daysRemaining > 0 ? Math.ceil(wordsRemaining / daysRemaining) : wordsRemaining;
    // Current pace: avg words per calendar day over the last 14 calendar days
    const sessions = analytics?.sessions || [];
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13); // 14-day window including today
    const cutoff = fourteenDaysAgo.toISOString().split('T')[0];
    const recentTotal = sessions
      .filter(s => s.date >= cutoff)
      .reduce((s, x) => s + x.wordsWritten, 0);
    const currentPace = Math.round(recentTotal / 14);
    const onTrack = currentPace >= requiredPerDay;
    const progress = deadlineGoal.targetWords > 0 ? Math.min(stats.totalWords / deadlineGoal.targetWords, 1) : 0;
    return { daysRemaining, wordsRemaining, requiredPerDay, currentPace, onTrack, progress };
  }, [deadlineGoal, stats.totalWords, analytics?.sessions]);

  const handleDeadlineSave = () => {
    if (!analytics || !projectPath) return;
    const target = parseInt(deadlineTargetInput, 10);
    const date = deadlineDateInput;
    if (!isNaN(target) && target > 0 && date) {
      track('goal_set', { type: 'deadline' });
      const updated = {
        ...analytics,
        deadlineGoal: { enabled: true, targetWords: target, deadlineDate: date },
      };
      setAnalytics(updated);
      saveAnalytics(projectPath, updated);
    }
    setEditingDeadline(false);
  };

  const handleDeadlineClear = () => {
    if (!analytics || !projectPath) return;
    const updated = {
      ...analytics,
      deadlineGoal: { enabled: false, targetWords: 0, deadlineDate: '' },
    };
    setAnalytics(updated);
    saveAnalytics(projectPath, updated);
    setEditingDeadline(false);
  };

  // Check-in averages
  const checkinAvgs = useMemo(() => getCheckinAverages(sceneSessions), [sceneSessions]);

  // Top scenes by time (exclude manual check-ins)
  const topScenesByTime = useMemo(() => {
    if (sceneSessions.length === 0) return [];
    const byScene: Record<string, number> = {};
    for (const s of sceneSessions) {
      if (s.sceneKey === 'manual:checkin') continue;
      byScene[s.sceneKey] = (byScene[s.sceneKey] || 0) + s.durationMs;
    }
    return Object.entries(byScene)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, ms]) => {
        const [charId, sceneNum] = key.split(':');
        const charName = characters.find(c => c.id === charId)?.name || 'Unknown';
        const scene = scenes.find(s => s.characterId === charId && String(s.sceneNumber) === sceneNum);
        const sceneTitle = scene?.title ? ` — ${scene.title}` : '';
        return { sceneKey: key, label: `${charName} — ${sceneNum}${sceneTitle}`, totalMs: ms };
      });
  }, [sceneSessions, characters, scenes]);

  return (
    <div className="analytics-dashboard">
      {/* Header */}
      <div className="analytics-header">
        <h1 className="analytics-title">Analytics</h1>
      </div>

      {/* Summary Strip */}
      <div className="analytics-summary-strip">
        <div className="analytics-summary-card">
          <span className="analytics-summary-label">Current Streak</span>
          <span className="analytics-summary-value">
            <span className="analytics-summary-icon">🔥</span>
            {analytics?.currentStreak || 0}
          </span>
          <span className="analytics-summary-change">Best: {analytics?.longestStreak || 0} days</span>
        </div>
        <div className="analytics-summary-card">
          <span className="analytics-summary-label">Words This Month</span>
          <span className="analytics-summary-value">{monthlyWords.toLocaleString()}</span>
          <span className="analytics-summary-change neutral">Total: {stats.totalWords.toLocaleString()}</span>
        </div>
        <div className="analytics-summary-card">
          <span className="analytics-summary-label">Avg Words / Day</span>
          <span className="analytics-summary-value">{avgWordsPerDay.toLocaleString()}</span>
          <span className="analytics-summary-change neutral">
            {analytics?.dailyGoal.enabled ? `Target: ${analytics.dailyGoal.target.toLocaleString()}` : 'No daily target'}
          </span>
        </div>
        <div className="analytics-summary-card">
          <span className="analytics-summary-label">Time Writing</span>
          <span className="analytics-summary-value">
            {(() => {
              if (!analytics) return '0h';
              const { year, month } = calendarMonth;
              const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
              const totalMins = analytics.sessions
                .filter(s => s.date.startsWith(prefix))
                .reduce((sum, s) => sum + s.duration, 0);
              if (totalMins < 60) return `${totalMins}m`;
              const hrs = Math.floor(totalMins / 60);
              const mins = totalMins % 60;
              return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
            })()}
          </span>
          <span className="analytics-summary-change neutral">{monthlySessionCount} {monthlySessionCount === 1 ? 'session' : 'sessions'} this month</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="analytics-grid">

        {/* Calendar Heatmap */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">{calendarMonthLabel}</span>
            <div className="analytics-calendar-nav">
              <button onClick={() => setCalendarMonth(prev => {
                const d = new Date(prev.year, prev.month - 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}>‹</button>
              <button onClick={() => setCalendarMonth(prev => {
                const d = new Date(prev.year, prev.month + 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}>›</button>
            </div>
          </div>
          <div className="analytics-calendar-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={`dow-${i}`} className="analytics-calendar-dow">{d}</div>
            ))}
            {calendarData.map((cell, i) => {
              if (cell.day === 0) return <div key={`empty-${i}`} className="analytics-calendar-cell empty" />;
              const level = !cell.isFuture ? getHeatLevel(cell.words) : '';
              return (
                <div
                  key={`day-${cell.day}`}
                  className={`analytics-calendar-cell ${level} ${cell.isToday ? 'today' : ''} ${cell.isFuture ? 'future' : ''}`}
                  title={cell.isFuture ? '' : `${cell.words.toLocaleString()} words${cell.duration > 0 ? ` · ${cell.duration}m` : ''}`}
                >
                  <span className="analytics-calendar-day">{cell.day}</span>
                  {cell.words > 0 && !cell.isFuture && (
                    <span className="analytics-calendar-words">
                      {cell.words >= 1000 ? `${(cell.words / 1000).toFixed(1)}k` : cell.words}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="analytics-calendar-legend">
            <span>0</span>
            <div className="analytics-legend-swatch" style={{ background: '#f5f5f5' }} />
            <div className="analytics-legend-swatch l1" />
            <div className="analytics-legend-swatch l2" />
            <div className="analytics-legend-swatch l3" />
            <div className="analytics-legend-swatch l4" />
            <span>2,000+</span>
          </div>
        </div>

        {/* Goal Ring */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Project Goal</span>
            <span className="analytics-card-subtitle">{stats.totalWords.toLocaleString()} words</span>
          </div>
          <div className="analytics-goal-section">
            <div className="analytics-goal-ring-wrapper">
              <svg viewBox="0 0 120 120">
                <circle className="analytics-goal-ring-bg" cx="60" cy="60" r={goalRingR} />
                {wordCountGoal > 0 && (
                  <circle
                    className="analytics-goal-ring-fill"
                    cx="60" cy="60" r={goalRingR}
                    strokeDasharray={goalRingC}
                    strokeDashoffset={goalRingOffset}
                  />
                )}
              </svg>
              <div className="analytics-goal-ring-center">
                <span className="analytics-goal-ring-pct">{wordCountGoal > 0 ? `${Math.round(goalProgress * 100)}%` : '—'}</span>
                <span className="analytics-goal-ring-label">{wordCountGoal > 0 ? 'complete' : 'no goal'}</span>
              </div>
            </div>
            <div className="analytics-goal-details">
              {editingGoal ? (
                <div className="analytics-goal-edit">
                  <input
                    type="number"
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleGoalSave();
                      if (e.key === 'Escape') setEditingGoal(false);
                    }}
                    onBlur={handleGoalSave}
                    autoFocus
                    min={0}
                    step={1000}
                    placeholder="Target words"
                  />
                  <span>word goal</span>
                </div>
              ) : (
                <>
                  <div className="analytics-goal-title">
                    {wordCountGoal > 0 ? `${wordCountGoal.toLocaleString()} words` : 'Set a goal'}
                  </div>
                  <div className="analytics-goal-numbers">
                    <strong>{stats.totalWords.toLocaleString()}</strong> of {wordCountGoal > 0 ? wordCountGoal.toLocaleString() : '—'} words
                  </div>
                  {wordCountGoal > 0 && (
                    <div className="analytics-goal-bar-track">
                      <div className="analytics-goal-bar-fill" style={{ width: `${goalProgress * 100}%` }} />
                    </div>
                  )}
                  <button className="analytics-goal-edit-btn" onClick={() => { setGoalInput(String(wordCountGoal || '')); setEditingGoal(true); }}>
                    {wordCountGoal > 0 ? 'Change goal' : 'Set goal'}
                  </button>
                </>
              )}

              {/* Daily Goal */}
              <div className="analytics-daily-goal">
                <div className="analytics-daily-goal-header">
                  <span className="analytics-daily-goal-label">Daily Target</span>
                  {editingDailyGoal ? (
                    <div className="analytics-goal-edit inline">
                      <input
                        type="number"
                        value={dailyGoalInput}
                        onChange={e => setDailyGoalInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleDailyGoalSave();
                          if (e.key === 'Escape') setEditingDailyGoal(false);
                        }}
                        onBlur={handleDailyGoalSave}
                        autoFocus
                        min={0}
                        step={100}
                      />
                    </div>
                  ) : (
                    <button className="analytics-goal-edit-btn" onClick={() => { setDailyGoalInput(String(analytics?.dailyGoal.target || 500)); setEditingDailyGoal(true); }}>
                      {analytics?.dailyGoal.enabled ? `${analytics.dailyGoal.target.toLocaleString()}/day` : 'Set'}
                    </button>
                  )}
                </div>
                {analytics?.dailyGoal.enabled && analytics.dailyGoal.target > 0 && (
                  <div className="analytics-goal-bar-track">
                    <div className="analytics-goal-bar-fill daily" style={{ width: `${dailyGoalProgress * 100}%` }} />
                  </div>
                )}
                <div className="analytics-daily-today">{todayWords.toLocaleString()} words today</div>
              </div>

              {/* Deadline Goal */}
              <div className="analytics-deadline-section">
                <div className="analytics-deadline-header">
                  <span className="analytics-deadline-label">Deadline Goal</span>
                  {!editingDeadline && (
                    <button
                      className="analytics-goal-edit-btn"
                      onClick={() => {
                        setDeadlineTargetInput(String(deadlineGoal?.targetWords || ''));
                        setDeadlineDateInput(deadlineGoal?.deadlineDate || '');
                        setEditingDeadline(true);
                      }}
                    >
                      {deadlineGoal?.enabled ? 'Edit' : 'Set'}
                    </button>
                  )}
                </div>

                {editingDeadline ? (
                  <div className="analytics-deadline-edit">
                    <div className="analytics-deadline-edit-row">
                      <label>Target words</label>
                      <input
                        type="number"
                        value={deadlineTargetInput}
                        onChange={e => setDeadlineTargetInput(e.target.value)}
                        placeholder="e.g. 120000"
                        min={0}
                        step={1000}
                        autoFocus
                      />
                    </div>
                    <div className="analytics-deadline-edit-row">
                      <label>Deadline</label>
                      <input
                        type="date"
                        value={deadlineDateInput}
                        onChange={e => setDeadlineDateInput(e.target.value)}
                      />
                    </div>
                    <div className="analytics-deadline-edit-row" style={{ flexDirection: 'row', gap: '8px' }}>
                      <button className="analytics-goal-edit-btn" onClick={handleDeadlineSave}>Save</button>
                      {deadlineGoal?.enabled && (
                        <button className="analytics-goal-edit-btn" onClick={handleDeadlineClear} style={{ opacity: 0.6 }}>Clear</button>
                      )}
                      <button className="analytics-goal-edit-btn" onClick={() => setEditingDeadline(false)} style={{ opacity: 0.6 }}>Cancel</button>
                    </div>
                  </div>
                ) : deadlineStats ? (
                  <>
                    <div className="analytics-deadline-stats">
                      <div className="analytics-deadline-stat">
                        <strong>{deadlineStats.daysRemaining}</strong> days left
                      </div>
                      <div className="analytics-deadline-stat">
                        <strong>{deadlineStats.wordsRemaining.toLocaleString()}</strong> words to go
                      </div>
                    </div>
                    <div className="analytics-goal-bar-track">
                      <div className="analytics-goal-bar-fill" style={{ width: `${deadlineStats.progress * 100}%` }} />
                    </div>
                    <div className="analytics-deadline-pace">
                      Need <strong>{deadlineStats.requiredPerDay.toLocaleString()}</strong>/day · Pace: <strong>{deadlineStats.currentPace.toLocaleString()}</strong>/day
                      <span className={`analytics-deadline-pill ${deadlineStats.onTrack ? 'on-track' : 'behind'}`}>
                        {deadlineStats.onTrack ? '✓ On track' : '⚠ Behind pace'}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Words Over Time (30-day bar chart) */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Words Over Time</span>
            <span className="analytics-card-subtitle">Last 30 days</span>
          </div>
          <div className="analytics-chart-area">
            {recentDays.map(day => {
              const barHeight = maxDayWords > 0 ? (day.words / maxDayWords) * 100 : 0;
              const isToday = day.date === getTodayStr();
              return (
                <div key={day.date} className="analytics-chart-bar-group" title={`${day.date}: ${day.words.toLocaleString()} words`}>
                  <div
                    className={`analytics-chart-bar ${isToday ? 'today' : ''} ${day.words > 0 ? 'has-words' : ''}`}
                    style={{ height: `${Math.max(barHeight, day.words > 0 ? 3 : 0)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="analytics-chart-labels">
            {recentDays.filter((_, i) => i % 7 === 0).map(day => (
              <span key={day.date}>
                {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            ))}
          </div>
        </div>

        {/* By Character */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Words by Character</span>
            <span className="analytics-card-subtitle">{characters.length} POVs</span>
          </div>
          <div className="analytics-character-bars">
            {characters.map(char => {
              const words = stats.perCharacter[char.id] || 0;
              const maxCharWords = Math.max(...Object.values(stats.perCharacter), 1);
              const barWidth = (words / maxCharWords) * 100;
              const color = characterColors[char.id] || '#3b82f6';
              return (
                <div key={char.id} className="analytics-char-row">
                  <div className="analytics-char-info">
                    <span className="analytics-char-dot" style={{ backgroundColor: color }} />
                    <span className="analytics-char-name">{char.name}</span>
                    <span className="analytics-char-words">{words.toLocaleString()}</span>
                  </div>
                  <div className="analytics-char-bar-track">
                    <div className="analytics-char-bar-fill" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Check-in Averages */}
        {checkinAvgs && (
          <div className="analytics-card">
            <div className="analytics-card-header">
              <span className="analytics-card-title">Check-in Averages</span>
              <span className="analytics-card-subtitle">{checkinAvgs.count} session{checkinAvgs.count !== 1 ? 's' : ''}</span>
            </div>
            <div className="analytics-checkin-averages">
              {([
                { key: 'energy', label: 'Energy', lowLabel: 'Low', highLabel: 'High', value: checkinAvgs.energy },
                { key: 'focus', label: 'Focus', lowLabel: 'Scattered', highLabel: 'Locked in', value: checkinAvgs.focus },
                { key: 'mood', label: 'Mood', lowLabel: 'Rough', highLabel: 'Great', value: checkinAvgs.mood },
              ] as const).map(row => (
                <div key={row.key} className="analytics-checkin-row">
                  <div className="analytics-checkin-label">
                    <span className="analytics-checkin-name">{row.label}</span>
                    <span className="analytics-checkin-score">{row.value.toFixed(1)}</span>
                  </div>
                  <div className="analytics-checkin-bar-track">
                    <div
                      className={`analytics-checkin-bar-fill ${row.key}`}
                      style={{ width: `${(row.value / 5) * 100}%` }}
                    />
                  </div>
                  <div className="analytics-checkin-range">
                    <span>{row.lowLabel}</span>
                    <span>{row.highLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Scenes by Time */}
        {topScenesByTime.length > 0 && (
          <div className="analytics-card">
            <div className="analytics-card-header">
              <span className="analytics-card-title">Time by Scene</span>
              <span className="analytics-card-subtitle">Top {topScenesByTime.length}</span>
            </div>
            <div className="analytics-scene-time-list">
              {topScenesByTime.map((scene, i) => {
                const maxMs = topScenesByTime[0].totalMs;
                const barWidth = maxMs > 0 ? (scene.totalMs / maxMs) * 100 : 0;
                const hrs = Math.floor(scene.totalMs / 3600000);
                const mins = Math.floor((scene.totalMs % 3600000) / 60000);
                const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                // Get character color
                const charId = scene.sceneKey.split(':')[0];
                const color = characterColors[charId] || '#3b82f6';
                return (
                  <div key={scene.sceneKey} className="analytics-scene-time-row">
                    <div className="analytics-scene-time-info">
                      <span className="analytics-scene-time-name">{scene.label}</span>
                      <span className="analytics-scene-time-duration">{timeStr}</span>
                    </div>
                    <div className="analytics-scene-time-bar-track">
                      <div
                        className="analytics-scene-time-bar-fill"
                        style={{ width: `${barWidth}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Writing Log — full width */}
        <div className="analytics-card full">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Writing Log</span>
            <span className="analytics-card-subtitle">Recent sessions</span>
          </div>
          <table className="analytics-sessions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Scene</th>
                <th>Words</th>
                <th>Time</th>
                <th>Words/hr</th>
              </tr>
            </thead>
            <tbody>
              {/* Show granular scene sessions if available, otherwise daily aggregates */}
              {sceneSessions.length > 0
                ? [...sceneSessions].filter(s => s.sceneKey !== 'manual:checkin').reverse().slice(0, 30).map((ss) => {
                    const dateObj = new Date(ss.date + 'T12:00:00');
                    const mins = Math.round(ss.durationMs / 60000);
                    const hrs = ss.durationMs / 3600000;
                    const wph = hrs > 0 ? Math.round(ss.wordsNet / hrs) : 0;
                    const [charId, sceneNum] = ss.sceneKey.split(':');
                    const charName = characters.find(c => c.id === charId)?.name || '?';
                    const scene = scenes.find(s => s.characterId === charId && String(s.sceneNumber) === sceneNum);
                    const sceneTitle = scene?.title || '';
                    const sceneLabel = sceneTitle
                      ? `${charName} — ${sceneNum} — ${sceneTitle}`
                      : `${charName} — ${sceneNum}`;
                    return (
                      <tr key={ss.id}>
                        <td>{dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                        <td className="analytics-log-scene" title={sceneLabel}>{sceneLabel}</td>
                        <td className="analytics-log-words">{ss.wordsNet >= 0 ? '+' : ''}{ss.wordsNet.toLocaleString()}</td>
                        <td className="analytics-log-time">{mins < 60 ? `${mins}m` : `${Math.round(hrs * 10) / 10}h`}</td>
                        <td className="analytics-log-wph">{wph > 0 ? wph.toLocaleString() : '—'}</td>
                      </tr>
                    );
                  })
                : analytics && [...analytics.sessions].reverse().slice(0, 20).map((session, i) => {
                    const dateObj = new Date(session.date + 'T12:00:00');
                    const wph = session.duration > 0 ? Math.round(session.wordsWritten / (session.duration / 60)) : 0;
                    return (
                      <tr key={`${session.date}-${i}`}>
                        <td>{dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                        <td className="analytics-log-scene">—</td>
                        <td className="analytics-log-words">+{session.wordsWritten.toLocaleString()}</td>
                        <td className="analytics-log-time">{session.duration < 60 ? `${session.duration}m` : `${Math.round(session.duration / 60 * 10) / 10}h`}</td>
                        <td className="analytics-log-wph">{wph > 0 ? wph.toLocaleString() : '—'}</td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
          {(!analytics || analytics.sessions.length === 0) && sceneSessions.length === 0 && (
            <div className="analytics-empty">No writing sessions recorded yet. Start writing to track your progress!</div>
          )}
        </div>
      </div>
    </div>
  );
}
