import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Scene, Character, WorldEvent, Tag, PlotPoint, TagCategory } from '../../../shared/types';
import SceneDetailPanel from '../SceneDetailPanel';
import TimelineGrid from './TimelineGrid';
import TimelineCanvas from './TimelineCanvas';
import TimelineSidebar from './TimelineSidebar';

type TimelineSubMode = 'grid' | 'canvas';

interface TimelineRange {
  start: string;
  end: string;
}

/** Produce "YYYY-MM-DD" for a Date object (local time). */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Generate an array of date strings from start to end (inclusive). */
function buildDateArray(start: string, end: string): string[] {
  const range: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    range.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return range;
}

/** Add N days to a date string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

interface TimelineViewProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  tags: Tag[];
  plotPoints: PlotPoint[];
  timelineDates: Record<string, string>;
  worldEvents: WorldEvent[];
  connections: Record<string, string[]>;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
  onWorldEventsChange: (events: WorldEvent[]) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange: (sceneId: string, tags: string[]) => void;
  onCreateTag: (name: string, category: TagCategory) => void;
  onRemoveConnection: (sourceId: string, targetId: string) => void;
}

export default function TimelineView({
  scenes,
  characters,
  characterColors,
  tags,
  plotPoints,
  timelineDates,
  worldEvents,
  connections,
  onTimelineDatesChange,
  onWorldEventsChange,
  onSceneChange,
  onTagsChange,
  onCreateTag,
  onRemoveConnection,
}: TimelineViewProps) {
  const [subMode, setSubMode] = useState<TimelineSubMode>('grid');
  const [selectedSceneKey, setSelectedSceneKey] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [labelWidth, setLabelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('braidr-timeline-label-width');
      if (saved) return Math.max(80, Math.min(300, Number(saved)));
    } catch {}
    return 140;
  });
  const handleLabelWidthChange = useCallback((w: number) => {
    const clamped = Math.max(80, Math.min(300, w));
    setLabelWidth(clamped);
    localStorage.setItem('braidr-timeline-label-width', String(clamped));
  }, []);

  const [colWidth, setColWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('braidr-timeline-col-width');
      if (saved) return Math.max(60, Math.min(300, Number(saved)));
    } catch {}
    return 140;
  });
  const handleColWidthChange = useCallback((w: number) => {
    const clamped = Math.max(60, Math.min(300, w));
    setColWidth(clamped);
    localStorage.setItem('braidr-timeline-col-width', String(clamped));
  }, []);

  // ── Timeline Range (explicit start/end, persisted) ──────────────────────
  const [timelineRange, setTimelineRange] = useState<TimelineRange | null>(() => {
    try {
      const saved = localStorage.getItem('braidr-timeline-range');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.start && parsed.end) return parsed;
      }
    } catch {}
    return null;
  });

  const updateTimelineRange = useCallback((range: TimelineRange) => {
    setTimelineRange(range);
    localStorage.setItem('braidr-timeline-range', JSON.stringify(range));
  }, []);

  // All assigned dates (scenes + events)
  const allAssignedDates = useMemo(() => {
    const dates = [
      ...Object.values(timelineDates),
      ...worldEvents.map(e => e.date),
    ].filter(Boolean).sort();
    return [...new Set(dates)];
  }, [timelineDates, worldEvents]);

  // Auto-initialize range when there are assigned dates but no range yet
  const effectiveRange = useMemo((): TimelineRange | null => {
    if (timelineRange) {
      // If we have an explicit range, extend it to include any assigned dates outside
      if (allAssignedDates.length === 0) return timelineRange;
      const earliest = allAssignedDates[0];
      const latest = allAssignedDates[allAssignedDates.length - 1];
      let { start, end } = timelineRange;
      if (earliest < start) start = earliest;
      if (latest > end) end = latest;
      if (start !== timelineRange.start || end !== timelineRange.end) {
        // Persist the auto-extended range
        const extended = { start, end };
        localStorage.setItem('braidr-timeline-range', JSON.stringify(extended));
        return extended;
      }
      return timelineRange;
    }

    // No explicit range — auto-initialize if there are assigned dates
    if (allAssignedDates.length > 0) {
      const earliest = allAssignedDates[0];
      const latest = allAssignedDates[allAssignedDates.length - 1];
      const thirtyOut = addDays(earliest, 30);
      const sevenPastLatest = addDays(latest, 7);
      const end = thirtyOut > sevenPastLatest ? thirtyOut : sevenPastLatest;
      return { start: earliest, end };
    }

    return null;
  }, [timelineRange, allAssignedDates]);

  // Sync auto-extended range back to state (needed for the "+" button logic)
  // We don't call setTimelineRange here to avoid render loops — the useMemo handles it
  // and localStorage is written inline.

  // Compute dateRange array from effectiveRange
  const dateRange = useMemo((): string[] => {
    if (!effectiveRange) return [];
    return buildDateArray(effectiveRange.start, effectiveRange.end);
  }, [effectiveRange]);

  // Toolbar date range display
  const dateRangeLabel = useMemo(() => {
    if (dateRange.length === 0) return null;
    const first = dateRange[0];
    const last = dateRange[dateRange.length - 1];
    if (first === last) return first;
    return `${first} \u2014 ${last}`;
  }, [dateRange]);

  // ── Extend range by 7 days ──────────────────────────────────────────────
  const handleExtendRange = useCallback(() => {
    if (effectiveRange) {
      updateTimelineRange({
        start: effectiveRange.start,
        end: addDays(effectiveRange.end, 7),
      });
    }
  }, [effectiveRange, updateTimelineRange]);

  // ── Setup prompt state ──────────────────────────────────────────────────
  const [setupDate, setSetupDate] = useState('');

  const handleSetupSubmit = useCallback(() => {
    if (!setupDate) return;
    updateTimelineRange({ start: setupDate, end: addDays(setupDate, 30) });
  }, [setupDate, updateTimelineRange]);

  // Show setup prompt if no range and no assigned dates
  const showSetup = !effectiveRange && allAssignedDates.length === 0;

  // ── Detail panel: selected scene data ───────────────────────────────
  const selectedScene = useMemo(() => {
    if (!selectedSceneKey) return null;
    const [charId, sceneNum] = selectedSceneKey.split(':');
    return scenes.find(
      s => s.characterId === charId && String(s.sceneNumber) === sceneNum
    ) ?? null;
  }, [selectedSceneKey, scenes]);

  const selectedCharacterName = useMemo(() => {
    if (!selectedScene) return '';
    return characters.find(c => c.id === selectedScene.characterId)?.name ?? '';
  }, [selectedScene, characters]);

  const selectedPlotPointTitle = useMemo(() => {
    if (!selectedScene?.plotPointId) return undefined;
    return plotPoints.find(p => p.id === selectedScene.plotPointId)?.title;
  }, [selectedScene, plotPoints]);

  const selectedConnectedScenes = useMemo(() => {
    if (!selectedScene) return [];
    const results: { id: string; label: string }[] = [];
    // Outgoing connections
    const outgoing = connections[selectedScene.id] || [];
    for (const targetId of outgoing) {
      const target = scenes.find(s => s.id === targetId);
      if (target) {
        const charName = characters.find(c => c.id === target.characterId)?.name ?? '?';
        results.push({ id: targetId, label: `${charName} #${target.sceneNumber}` });
      }
    }
    // Incoming connections
    for (const [sourceId, targets] of Object.entries(connections)) {
      if (targets.includes(selectedScene.id)) {
        const source = scenes.find(s => s.id === sourceId);
        if (source && !results.some(r => r.id === sourceId)) {
          const charName = characters.find(c => c.id === source.characterId)?.name ?? '?';
          results.push({ id: sourceId, label: `${charName} #${source.sceneNumber}` });
        }
      }
    }
    return results;
  }, [selectedScene, connections, scenes, characters]);

  const handleDetailClose = useCallback(() => {
    setSelectedSceneKey(null);
    setSelectedEventId(null);
  }, []);

  // ── Detail panel: selected event data & editing ─────────────────────
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return worldEvents.find(e => e.id === selectedEventId) ?? null;
  }, [selectedEventId, worldEvents]);

  const updateEvent = useCallback((id: string, patch: Partial<WorldEvent>) => {
    const updated = worldEvents.map(e =>
      e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e
    );
    onWorldEventsChange(updated);
  }, [worldEvents, onWorldEventsChange]);

  const handleDeleteEvent = useCallback((id: string) => {
    if (!window.confirm('Delete this world event?')) return;
    onWorldEventsChange(worldEvents.filter(e => e.id !== id));
    setSelectedEventId(null);
  }, [worldEvents, onWorldEventsChange]);

  const [linkDropdownOpen, setLinkDropdownOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const linkWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linkDropdownOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (linkWrapperRef.current && !linkWrapperRef.current.contains(e.target as Node)) {
        setLinkDropdownOpen(false);
        setLinkSearch('');
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [linkDropdownOpen]);

  const linkScene = useCallback((eventId: string, sceneKey: string) => {
    const event = worldEvents.find(e => e.id === eventId);
    if (!event || event.linkedSceneKeys.includes(sceneKey)) return;
    updateEvent(eventId, {
      linkedSceneKeys: [...event.linkedSceneKeys, sceneKey],
    });
    setLinkDropdownOpen(false);
    setLinkSearch('');
  }, [worldEvents, updateEvent]);

  const unlinkScene = useCallback((eventId: string, sceneKey: string) => {
    const event = worldEvents.find(e => e.id === eventId);
    if (!event) return;
    updateEvent(eventId, {
      linkedSceneKeys: event.linkedSceneKeys.filter(k => k !== sceneKey),
    });
  }, [worldEvents, updateEvent]);

  function getSceneLabel(sceneKey: string): string {
    const [charId, sceneNum] = sceneKey.split(':');
    const character = characters.find(c => c.id === charId);
    return `${character?.name ?? charId} #${sceneNum}`;
  }

  function getAvailableScenes(): { key: string; label: string }[] {
    if (!selectedEvent) return [];
    const linked = new Set(selectedEvent.linkedSceneKeys);
    const results: { key: string; label: string }[] = [];
    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      if (linked.has(key)) continue;
      const label = getSceneLabel(key);
      if (linkSearch && !label.toLowerCase().includes(linkSearch.toLowerCase())) continue;
      results.push({ key, label });
    }
    return results;
  }

  const hasDetail = !!(selectedSceneKey || selectedEventId);

  return (
    <div className="timeline-view">
      <div className="timeline-toolbar">
        <div className="timeline-sub-toggle">
          <button className={subMode === 'grid' ? 'active' : ''} onClick={() => setSubMode('grid')}>Grid</button>
          <button className={subMode === 'canvas' ? 'active' : ''} onClick={() => setSubMode('canvas')}>Canvas</button>
        </div>
        <div className="timeline-toolbar-info">
          <span className="timeline-toolbar-stat">
            {Object.keys(timelineDates).length} dated scenes
          </span>
          <span className="timeline-toolbar-divider">&middot;</span>
          <span className="timeline-toolbar-stat">
            {worldEvents.length} events
          </span>
          {dateRangeLabel && (
            <>
              <span className="timeline-toolbar-divider">&middot;</span>
              <span className="timeline-toolbar-stat timeline-toolbar-daterange">
                {dateRangeLabel}
              </span>
            </>
          )}
        </div>
      </div>
      <div className={`timeline-content${hasDetail ? ' has-detail' : ''}`}>
        <div className="timeline-main">
          {showSetup ? (
            <div className="timeline-grid">
              <div className="timeline-setup-prompt">
                <div className="tg-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <p className="timeline-setup-title">When does your story begin?</p>
                <p className="timeline-setup-desc">Pick a starting date to populate the timeline.</p>
                <div className="timeline-setup-controls">
                  <input
                    type="date"
                    value={setupDate}
                    onChange={(e) => setSetupDate(e.target.value)}
                    className="timeline-setup-date"
                  />
                  <button
                    className="timeline-setup-btn"
                    disabled={!setupDate}
                    onClick={handleSetupSubmit}
                  >
                    Set start date
                  </button>
                </div>
              </div>
            </div>
          ) : subMode === 'grid' ? (
            <TimelineGrid
              scenes={scenes}
              characters={characters}
              characterColors={characterColors}
              timelineDates={timelineDates}
              worldEvents={worldEvents}
              connections={connections}
              onTimelineDatesChange={onTimelineDatesChange}
              selectedSceneKey={selectedSceneKey}
              selectedEventId={selectedEventId}
              onSelectScene={setSelectedSceneKey}
              onSelectEvent={setSelectedEventId}
              labelWidth={labelWidth}
              onLabelWidthChange={handleLabelWidthChange}
              colWidth={colWidth}
              onColWidthChange={handleColWidthChange}
              dateRange={dateRange}
              onExtendRange={handleExtendRange}
            />
          ) : (
            <TimelineCanvas
              scenes={scenes}
              characters={characters}
              characterColors={characterColors}
              timelineDates={timelineDates}
              worldEvents={worldEvents}
              connections={connections}
              selectedSceneKey={selectedSceneKey}
              selectedEventId={selectedEventId}
              onSelectScene={setSelectedSceneKey}
              onSelectEvent={setSelectedEventId}
              labelWidth={labelWidth}
              colWidth={colWidth}
              dateRange={dateRange}
            />
          )}
        </div>
        {/* ── Detail Panel (scene or event) ──────────────────────────── */}
        {selectedScene && (
          <SceneDetailPanel
            scene={selectedScene}
            tags={tags}
            characterName={selectedCharacterName}
            plotPointTitle={selectedPlotPointTitle}
            timelineDate={selectedSceneKey ? timelineDates[selectedSceneKey] : undefined}
            connectedScenes={selectedConnectedScenes}
            onClose={handleDetailClose}
            onSceneChange={onSceneChange}
            onTagsChange={onTagsChange}
            onCreateTag={onCreateTag}
            onRemoveConnection={(targetId) =>
              onRemoveConnection(selectedScene.id, targetId)
            }
            onTimelineDateChange={(date) => {
              if (!selectedSceneKey) return;
              const updated = { ...timelineDates };
              if (date) {
                updated[selectedSceneKey] = date;
              } else {
                delete updated[selectedSceneKey];
              }
              onTimelineDatesChange(updated);
            }}
          />
        )}
        {selectedEvent && !selectedScene && (
          <div className="timeline-detail-panel">
            <div className="scene-detail-header">
              <div className="scene-detail-meta">
                <span className="scene-detail-character">World Event</span>
              </div>
              <button className="close-btn" onClick={handleDetailClose}>&times;</button>
            </div>
            <div className="scene-detail-content">
              <div className="timeline-detail-field">
                <label>Title</label>
                <input
                  type="text"
                  value={selectedEvent.title}
                  onChange={e => updateEvent(selectedEvent.id, { title: e.target.value })}
                />
              </div>
              <div className="timeline-detail-field">
                <label>Date</label>
                <input
                  type="date"
                  value={selectedEvent.date}
                  onChange={e => updateEvent(selectedEvent.id, { date: e.target.value })}
                />
              </div>
              <div className="timeline-detail-field">
                <label>Description</label>
                <textarea
                  rows={3}
                  value={selectedEvent.description}
                  onChange={e => updateEvent(selectedEvent.id, { description: e.target.value })}
                />
              </div>
              <div className="timeline-detail-field">
                <label>Tags</label>
                <input
                  type="text"
                  value={selectedEvent.tags.join(', ')}
                  placeholder="comma-separated tags"
                  onChange={e => {
                    const eventTags = e.target.value
                      .split(',')
                      .map(t => t.trim())
                      .filter(Boolean);
                    updateEvent(selectedEvent.id, { tags: eventTags });
                  }}
                />
              </div>
              <div className="timeline-linked-scenes">
                <label>Linked Scenes</label>
                <div className="timeline-scene-chips">
                  {selectedEvent.linkedSceneKeys.map(key => {
                    const [charId] = key.split(':');
                    const color = characterColors[charId] || 'var(--accent)';
                    return (
                      <span
                        key={key}
                        className="timeline-scene-chip"
                        style={{ borderColor: color }}
                      >
                        {getSceneLabel(key)}
                        <button
                          className="timeline-chip-remove"
                          onClick={() => unlinkScene(selectedEvent.id, key)}
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                </div>
                <div className="timeline-link-scene-wrapper" ref={linkWrapperRef}>
                  <button
                    className="timeline-link-scene-btn"
                    onClick={() => setLinkDropdownOpen(!linkDropdownOpen)}
                  >
                    + Link Scene
                  </button>
                  {linkDropdownOpen && (() => {
                    const available = getAvailableScenes();
                    return (
                      <div className="timeline-link-dropdown">
                        <input
                          type="text"
                          placeholder="Search scenes..."
                          value={linkSearch}
                          onChange={e => setLinkSearch(e.target.value)}
                          autoFocus
                        />
                        <div className="timeline-link-dropdown-list">
                          {available.map(({ key, label }) => (
                            <div
                              key={key}
                              className="timeline-link-dropdown-item"
                              onClick={() => linkScene(selectedEvent.id, key)}
                            >
                              {label}
                            </div>
                          ))}
                          {available.length === 0 && (
                            <div className="timeline-link-dropdown-empty">No scenes available</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <button
                className="timeline-delete-btn"
                onClick={() => handleDeleteEvent(selectedEvent.id)}
              >
                Delete Event
              </button>
            </div>
          </div>
        )}

        {/* ── Sidebar (hidden when detail panel is open) ─────────────── */}
        <TimelineSidebar
          worldEvents={worldEvents}
          scenes={scenes}
          characters={characters}
          characterColors={characterColors}
          timelineDates={timelineDates}
          selectedSceneKey={selectedSceneKey}
          selectedEventId={selectedEventId}
          onSelectScene={setSelectedSceneKey}
          onSelectEvent={setSelectedEventId}
          onWorldEventsChange={onWorldEventsChange}
          onTimelineDatesChange={onTimelineDatesChange}
        />
      </div>
    </div>
  );
}
