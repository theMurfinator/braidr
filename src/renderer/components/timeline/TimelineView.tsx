import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Scene, Character, WorldEvent, Tag, PlotPoint, TagCategory, TimelineViewState } from '../../../shared/types';
import SceneDetailPanel from '../SceneDetailPanel';
import TimelineGrid from './TimelineGrid';
import TimelineCanvas from './TimelineCanvas';
import TimelineSidebar from './TimelineSidebar';
import TimelineContextBar from './TimelineContextBar';

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

/** Generate an array of date strings from start to end (inclusive). Capped at MAX_DAYS to prevent memory exhaustion. */
function buildDateArray(start: string, end: string): string[] {
  const MAX_DAYS = 730; // 2 years max
  const range: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  let count = 0;
  while (cur <= last && count < MAX_DAYS) {
    range.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
    count++;
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
  timelineEndDates: Record<string, string>;
  worldEvents: WorldEvent[];
  connections: Record<string, string[]>;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
  onTimelineEndDatesChange: (dates: Record<string, string>) => void;
  onWorldEventsChange: (events: WorldEvent[]) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange: (sceneId: string, tags: string[]) => void;
  onCreateTag: (name: string, category: TagCategory) => void;
  onRemoveConnection: (sourceId: string, targetId: string) => void;
  onInsertScene?: (characterId: string, plotPointId: string, date: string) => Promise<string | null>;
  onOpenInEditor?: (sceneKey: string) => void;
  viewState?: TimelineViewState;
  onViewStateChange?: (state: TimelineViewState) => void;
}

export default function TimelineView({
  scenes,
  characters,
  characterColors,
  tags,
  plotPoints,
  timelineDates,
  timelineEndDates,
  worldEvents,
  connections,
  onTimelineDatesChange,
  onTimelineEndDatesChange,
  onWorldEventsChange,
  onSceneChange,
  onTagsChange,
  onCreateTag,
  onRemoveConnection,
  onInsertScene,
  onOpenInEditor,
  viewState,
  onViewStateChange,
}: TimelineViewProps) {
  const [subMode, setSubMode] = useState<TimelineSubMode>(() => viewState?.subMode ?? 'grid');
  const [selectedSceneKey, setSelectedSceneKey] = useState<string | null>(() => viewState?.selectedSceneKey ?? null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const timelineMainRef = useRef<HTMLDivElement>(null);

  // Collapsible character lanes
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());

  const toggleLaneCollapse = useCallback((characterId: string) => {
    setCollapsedLanes(prev => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  }, []);

  // Context bar viewport (0..1 fractions)
  const [contextBarViewport, setContextBarViewport] = useState<{ start: number; end: number }>({ start: 0, end: 1 });

  // Canvas zoom level (synced bidirectionally with TimelineCanvas)
  const [canvasZoom, setCanvasZoom] = useState(() => viewState?.zoom ?? 1);

  // Report view state changes to parent (debounced to avoid excessive saves)
  const onViewStateChangeRef = useRef(onViewStateChange);
  useEffect(() => { onViewStateChangeRef.current = onViewStateChange; }, [onViewStateChange]);

  const viewStateChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!onViewStateChangeRef.current) return;
    if (viewStateChangeTimerRef.current) clearTimeout(viewStateChangeTimerRef.current);
    viewStateChangeTimerRef.current = setTimeout(() => {
      onViewStateChangeRef.current?.({
        panX: 0,
        panY: 0,
        zoom: canvasZoom,
        selectedSceneKey,
        subMode,
      });
    }, 300);
    return () => {
      if (viewStateChangeTimerRef.current) clearTimeout(viewStateChangeTimerRef.current);
    };
  }, [canvasZoom, selectedSceneKey, subMode]);

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
        if (parsed && parsed.start && parsed.end) {
          // Validate years to prevent extreme ranges from crashing the grid
          const startYear = new Date(parsed.start + 'T00:00:00').getFullYear();
          const endYear = new Date(parsed.end + 'T00:00:00').getFullYear();
          if (isNaN(startYear) || isNaN(endYear) || startYear < 1 || endYear > 2200) {
            localStorage.removeItem('braidr-timeline-range');
            return null;
          }
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const updateTimelineRange = useCallback((range: TimelineRange) => {
    const startYear = new Date(range.start + 'T00:00:00').getFullYear();
    const endYear = new Date(range.end + 'T00:00:00').getFullYear();
    if (isNaN(startYear) || isNaN(endYear) || startYear < 1 || endYear > 2200) return;
    setTimelineRange(range);
    localStorage.setItem('braidr-timeline-range', JSON.stringify(range));
  }, []);

  // All assigned dates (scenes + events + end dates), filtering out extreme years
  const allAssignedDates = useMemo(() => {
    const dates = [
      ...Object.values(timelineDates),
      ...Object.values(timelineEndDates),
      ...worldEvents.map(e => e.date),
      ...worldEvents.map(e => e.endDate).filter((d): d is string => !!d),
    ].filter(d => {
      if (!d) return false;
      const year = new Date(d + 'T00:00:00').getFullYear();
      return !isNaN(year) && year >= 1 && year <= 2200;
    }).sort();
    return [...new Set(dates)];
  }, [timelineDates, timelineEndDates, worldEvents]);

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
        // Validate before persisting auto-extended range
        const sYear = new Date(start + 'T00:00:00').getFullYear();
        const eYear = new Date(end + 'T00:00:00').getFullYear();
        if (!isNaN(sYear) && !isNaN(eYear) && sYear >= 1 && eYear <= 2200) {
          const extended = { start, end };
          localStorage.setItem('braidr-timeline-range', JSON.stringify(extended));
          return extended;
        }
        return timelineRange;
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

  // ── Snap to first scene ────────────────────────────────────────────────
  const handleSnapToFirstScene = useCallback(() => {
    if (!timelineMainRef.current || allAssignedDates.length === 0 || dateRange.length === 0) return;
    const firstDate = allAssignedDates[0];
    const colIndex = dateRange.indexOf(firstDate);
    if (colIndex === -1) return;
    const scrollX = Math.max(0, colIndex * colWidth - 20);
    timelineMainRef.current.scrollTo({ left: scrollX, behavior: 'smooth' });
  }, [allAssignedDates, dateRange, colWidth]);

  // Auto-scroll to first scene on initial load
  const hasSnappedRef = useRef(false);
  useEffect(() => {
    if (!hasSnappedRef.current && timelineMainRef.current && allAssignedDates.length > 0 && dateRange.length > 0) {
      hasSnappedRef.current = true;
      const firstDate = allAssignedDates[0];
      const colIndex = dateRange.indexOf(firstDate);
      if (colIndex > 0) {
        const scrollX = Math.max(0, colIndex * colWidth - 20);
        timelineMainRef.current.scrollTo({ left: scrollX });
      }
    }
  }, [allAssignedDates, dateRange, colWidth]);

  // ── Context bar: track grid scroll → viewport ──────────────────────────
  useEffect(() => {
    if (subMode !== 'grid') return;
    const el = timelineMainRef.current;
    if (!el) return;

    const updateViewport = () => {
      const scrollW = el.scrollWidth - el.clientWidth;
      if (scrollW <= 0) {
        setContextBarViewport({ start: 0, end: 1 });
        return;
      }
      const visibleFrac = el.clientWidth / el.scrollWidth;
      const startFrac = el.scrollLeft / el.scrollWidth;
      setContextBarViewport({ start: startFrac, end: startFrac + visibleFrac });
    };

    updateViewport();
    el.addEventListener('scroll', updateViewport, { passive: true });
    const ro = new ResizeObserver(updateViewport);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateViewport);
      ro.disconnect();
    };
  }, [subMode, dateRange.length, colWidth]);

  // Context bar → drive grid scroll
  const handleContextBarViewportChange = useCallback((start: number, end: number) => {
    setContextBarViewport({ start, end });
    if (subMode === 'grid' && timelineMainRef.current) {
      const el = timelineMainRef.current;
      el.scrollLeft = start * el.scrollWidth;
    }
    // Canvas mode: we set viewport state, canvas reads it via prop
  }, [subMode]);

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
    return scenes.find(s => s.id === selectedSceneKey) ?? null;
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

  // ── Prev/Next scene navigation ──────────────────────────────────────
  const sortedDatedSceneKeys = useMemo(() => {
    return Object.entries(timelineDates)
      .sort(([, dateA], [, dateB]) => dateA.localeCompare(dateB))
      .map(([key]) => key);
  }, [timelineDates]);

  const selectedSceneIndex = useMemo(() => {
    if (!selectedSceneKey) return -1;
    return sortedDatedSceneKeys.indexOf(selectedSceneKey);
  }, [selectedSceneKey, sortedDatedSceneKeys]);

  const navigateToScene = useCallback((sceneKey: string) => {
    setSelectedSceneKey(sceneKey);
    const date = timelineDates[sceneKey];
    if (!date || dateRange.length === 0) return;
    const idx = dateRange.indexOf(date);
    if (idx < 0) return;
    const dateFrac = dateRange.length === 1 ? 0 : idx / (dateRange.length - 1);
    const vpWidth = contextBarViewport.end - contextBarViewport.start;
    const newStart = Math.max(0, Math.min(1 - vpWidth, dateFrac - vpWidth / 2));
    handleContextBarViewportChange(newStart, newStart + vpWidth);
  }, [timelineDates, dateRange, contextBarViewport, handleContextBarViewportChange]);

  const handlePrevScene = useMemo(() => {
    if (selectedSceneIndex <= 0) return undefined;
    return () => navigateToScene(sortedDatedSceneKeys[selectedSceneIndex - 1]);
  }, [selectedSceneIndex, sortedDatedSceneKeys, navigateToScene]);

  const handleNextScene = useMemo(() => {
    if (selectedSceneIndex < 0 || selectedSceneIndex >= sortedDatedSceneKeys.length - 1) return undefined;
    return () => navigateToScene(sortedDatedSceneKeys[selectedSceneIndex + 1]);
  }, [selectedSceneIndex, sortedDatedSceneKeys, navigateToScene]);

  // ── Detail panel: selected event data & editing ─────────────────────
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return worldEvents.find(e => e.id === selectedEventId) ?? null;
  }, [selectedEventId, worldEvents]);

  const updateEvent = useCallback((id: string, patch: Partial<WorldEvent>) => {
    // Validate date to prevent extreme years from crashing the timeline grid
    if (patch.date) {
      const year = new Date(patch.date + 'T00:00:00').getFullYear();
      if (isNaN(year) || year < 1 || year > 2200) return;
    }
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
    const scene = scenes.find(s => s.id === sceneKey);
    if (!scene) return sceneKey;
    const character = characters.find(c => c.id === scene.characterId);
    return `${character?.name ?? '?'} #${scene.sceneNumber}`;
  }

  function getAvailableScenes(): { key: string; label: string }[] {
    if (!selectedEvent) return [];
    const linked = new Set(selectedEvent.linkedSceneKeys);
    const results: { key: string; label: string }[] = [];
    for (const scene of scenes) {
      const key = scene.id;
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
          {allAssignedDates.length > 0 && (
            <button
              className="timeline-snap-btn"
              onClick={handleSnapToFirstScene}
              title="Scroll to first scene"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Go to scenes
            </button>
          )}
        </div>
      </div>
      <div className={`timeline-content${hasDetail ? ' has-detail' : ''}`}>
        <div className="timeline-main" ref={timelineMainRef}>
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
                    min="0001-01-01"
                    max="2200-12-31"
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
              timelineEndDates={timelineEndDates}
              onTimelineEndDatesChange={onTimelineEndDatesChange}
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
              onWorldEventsChange={onWorldEventsChange}
              plotPoints={plotPoints}
              onInsertScene={onInsertScene}
              collapsedLanes={collapsedLanes}
              onToggleLane={toggleLaneCollapse}
            />
          ) : (
            <TimelineCanvas
              scenes={scenes}
              characters={characters}
              characterColors={characterColors}
              timelineDates={timelineDates}
              timelineEndDates={timelineEndDates}
              worldEvents={worldEvents}
              connections={connections}
              selectedSceneKey={selectedSceneKey}
              selectedEventId={selectedEventId}
              onSelectScene={setSelectedSceneKey}
              onSelectEvent={setSelectedEventId}
              labelWidth={labelWidth}
              colWidth={colWidth}
              dateRange={dateRange}
              onViewportChange={(vp) => setContextBarViewport(vp)}
              viewport={contextBarViewport}
              zoom={canvasZoom}
              onZoomChange={setCanvasZoom}
              collapsedLanes={collapsedLanes}
              onToggleLane={toggleLaneCollapse}
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
            onOpenInEditor={onOpenInEditor && selectedSceneKey ? () => onOpenInEditor(selectedSceneKey) : undefined}
            onPrevScene={handlePrevScene}
            onNextScene={handleNextScene}
            timelineEndDate={selectedSceneKey ? timelineEndDates[selectedSceneKey] : undefined}
            onTimelineEndDateChange={selectedSceneKey ? (date: string) => {
              const updated = { ...timelineEndDates };
              if (date) {
                updated[selectedSceneKey] = date;
              } else {
                delete updated[selectedSceneKey];
              }
              onTimelineEndDatesChange(updated);
            } : undefined}
            onTimelineDateChange={(date) => {
              if (!selectedSceneKey) return;
              if (date) {
                const year = new Date(date + 'T00:00:00').getFullYear();
                if (isNaN(year) || year < 1 || year > 2200) return;
              }
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
                <div className="timeline-detail-date-row">
                  <input
                    type="date"
                    min="0001-01-01"
                    max="2200-12-31"
                    value={selectedEvent.date}
                    onChange={e => updateEvent(selectedEvent.id, { date: e.target.value })}
                  />
                  {selectedEvent.date && (
                    <button
                      className="timeline-detail-clear-btn"
                      onClick={() => updateEvent(selectedEvent.id, { date: '' })}
                      title="Clear date"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {selectedEvent.date && (
                  <>
                    <label className="scene-detail-sub-label">End Date</label>
                    <div className="timeline-detail-date-row">
                      <input
                        type="date"
                        min={selectedEvent.date}
                        max="2200-12-31"
                        value={selectedEvent.endDate || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val && selectedEvent.date && val < selectedEvent.date) return;
                          updateEvent(selectedEvent.id, { endDate: val || undefined });
                        }}
                      />
                      {selectedEvent.endDate && (
                        <button
                          className="timeline-detail-clear-btn"
                          onClick={() => updateEvent(selectedEvent.id, { endDate: undefined })}
                          title="Clear end date"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </>
                )}
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
                    const linkedScene = scenes.find(s => s.id === key);
                    const color = linkedScene ? (characterColors[linkedScene.characterId] || 'var(--accent)') : 'var(--accent)';
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
      {dateRange.length > 0 && (
        <TimelineContextBar
          scenes={scenes}
          characters={characters}
          characterColors={characterColors}
          timelineDates={timelineDates}
          timelineEndDates={timelineEndDates}
          worldEvents={worldEvents}
          dateRange={dateRange}
          selectedSceneKey={selectedSceneKey}
          selectedEventId={selectedEventId}
          onSelectScene={setSelectedSceneKey}
          viewport={contextBarViewport}
          onViewportChange={handleContextBarViewportChange}
        />
      )}
      {subMode === 'canvas' && (
        <div className="timeline-zoom-slider">
          <span className="zoom-label">-</span>
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.1"
            value={canvasZoom}
            onChange={(e) => setCanvasZoom(parseFloat(e.target.value))}
          />
          <span className="zoom-label">+</span>
          <span className="zoom-value">{Math.round(canvasZoom * 100)}%</span>
        </div>
      )}
    </div>
  );
}
