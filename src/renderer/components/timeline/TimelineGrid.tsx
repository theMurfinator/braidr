import { Fragment, useCallback, useEffect, useMemo, type DragEvent } from 'react';
import type { Scene, Character, WorldEvent } from '../../../shared/types';

interface TimelineGridProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  timelineDates: Record<string, string>;
  worldEvents: WorldEvent[];
  connections: Record<string, string[]>;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
  selectedSceneKey: string | null;
  selectedEventId: string | null;
  onSelectScene: (key: string | null) => void;
  onSelectEvent: (id: string | null) => void;
}

/** Produce "YYYY-MM-DD" for a Date object (local time). */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Short weekday abbreviation from a date string. */
function dayAbbr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/** Short date label like "3/14". */
function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const BASE_COL_WIDTH = 40;
const BUSY_COL_WIDTH = 100;
const LABEL_COL_WIDTH = 120;

export default function TimelineGrid({
  scenes,
  characters,
  characterColors,
  timelineDates,
  worldEvents,
  selectedSceneKey,
  selectedEventId,
  onSelectScene,
  onSelectEvent,
  onTimelineDatesChange,
}: TimelineGridProps) {
  // ── Derive sorted date range (fill gaps) ─────────────────────────────────
  const dateRange = useMemo(() => {
    const dateSet = new Set<string>();
    for (const d of Object.values(timelineDates)) {
      if (d) dateSet.add(d);
    }
    for (const ev of worldEvents) {
      if (ev.date) dateSet.add(ev.date);
    }
    if (dateSet.size === 0) return [];

    const sorted = [...dateSet].sort();
    const minDate = new Date(sorted[0] + 'T00:00:00');
    const maxDate = new Date(sorted[sorted.length - 1] + 'T00:00:00');

    const range: string[] = [];
    const cur = new Date(minDate);
    while (cur <= maxDate) {
      range.push(toDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return range;
  }, [timelineDates, worldEvents]);

  // ── Build lookup: sceneKey -> date ────────────────────────────────────────
  // timelineDates is keyed "characterId:sceneNumber" -> "YYYY-MM-DD"

  // ── Build lookup: date -> scenes per character ────────────────────────────
  const { sceneDateMap, unassignedScenes } = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};
    const unassigned: string[] = [];

    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      const date = timelineDates[key];
      if (!date) {
        unassigned.push(key);
        continue;
      }
      if (!map[date]) map[date] = {};
      if (!map[date][scene.characterId]) map[date][scene.characterId] = [];
      map[date][scene.characterId].push(key);
    }

    return { sceneDateMap: map, unassignedScenes: unassigned };
  }, [scenes, timelineDates]);

  // ── Build lookup: date -> world events ────────────────────────────────────
  const worldEventsByDate = useMemo(() => {
    const map: Record<string, WorldEvent[]> = {};
    for (const ev of worldEvents) {
      if (!ev.date) continue;
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [worldEvents]);

  // ── Column widths ────────────────────────────────────────────────────────
  const columnWidths = useMemo(() => {
    return dateRange.map((date) => {
      const charMap = sceneDateMap[date] || {};
      const evCount = (worldEventsByDate[date] || []).length;
      // Max scenes stacked in any one lane
      let maxStack = 0;
      for (const keys of Object.values(charMap)) {
        if (keys.length > maxStack) maxStack = keys.length;
      }
      maxStack = Math.max(maxStack, evCount);
      return maxStack >= 2 ? BUSY_COL_WIDTH : BASE_COL_WIDTH;
    });
  }, [dateRange, sceneDateMap, worldEventsByDate]);

  // ── Scene lookup by key ──────────────────────────────────────────────────
  const sceneByKey = useMemo(() => {
    const m: Record<string, Scene> = {};
    for (const s of scenes) {
      m[`${s.characterId}:${s.sceneNumber}`] = s;
    }
    return m;
  }, [scenes]);

  // ── Drag-and-drop handlers ──────────────────────────────────────────────
  const handleDragStart = useCallback((e: DragEvent<HTMLButtonElement>, sceneKey: string) => {
    e.dataTransfer.setData('text/plain', sceneKey);
    e.dataTransfer.effectAllowed = 'move';
    // Add dragging class after a tick so the drag image captures normal state
    requestAnimationFrame(() => {
      (e.target as HTMLElement).classList.add('dragging');
    });
  }, []);

  const handleDragEnd = useCallback((e: DragEvent<HTMLButtonElement>) => {
    (e.target as HTMLElement).classList.remove('dragging');
  }, []);

  const handleCellDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    (e.currentTarget as HTMLElement).classList.add('drag-over');
  }, []);

  const handleCellDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  }, []);

  const handleCellDrop = useCallback((e: DragEvent<HTMLDivElement>, date: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
    const sceneKey = e.dataTransfer.getData('text/plain');
    if (!sceneKey) return;
    const updated = { ...timelineDates, [sceneKey]: date };
    onTimelineDatesChange(updated);
  }, [timelineDates, onTimelineDatesChange]);

  const handleUnassignedDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    (e.currentTarget as HTMLElement).classList.add('drag-over');
  }, []);

  const handleUnassignedDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  }, []);

  const handleUnassignedDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
    const sceneKey = e.dataTransfer.getData('text/plain');
    if (!sceneKey) return;
    const updated = { ...timelineDates };
    delete updated[sceneKey];
    onTimelineDatesChange(updated);
  }, [timelineDates, onTimelineDatesChange]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onSelectScene(null);
        onSelectEvent(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSceneKey && selectedSceneKey in timelineDates) {
        // Only if not in an input/textarea
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        const updated = { ...timelineDates };
        delete updated[selectedSceneKey];
        onTimelineDatesChange(updated);
        onSelectScene(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSceneKey, onSelectScene, onSelectEvent, timelineDates, onTimelineDatesChange]);

  // ── Grid template columns ────────────────────────────────────────────────
  const gridTemplateCols = useMemo(() => {
    if (dateRange.length === 0) return `${LABEL_COL_WIDTH}px`;
    return `${LABEL_COL_WIDTH}px ${columnWidths.map((w) => `${w}px`).join(' ')}`;
  }, [dateRange, columnWidths]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (dateRange.length === 0 && unassignedScenes.length === 0 && worldEvents.length === 0) {
    return (
      <div className="timeline-grid">
        <div className="tg-empty-state">
          <div className="tg-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p>Assign dates to your scenes to see them on the timeline.</p>
          <p>Create world events in the sidebar.</p>
        </div>
      </div>
    );
  }

  // ── Helper: render a scene card ──────────────────────────────────────────
  function renderSceneCard(sceneKey: string) {
    const scene = sceneByKey[sceneKey];
    if (!scene) return null;
    const color = characterColors[scene.characterId] || '#888';
    const title = scene.title
      ? scene.title.slice(0, 30) + (scene.title.length > 30 ? '...' : '')
      : `Scene ${scene.sceneNumber}`;
    const isSelected = selectedSceneKey === sceneKey;

    return (
      <button
        key={sceneKey}
        className={`tg-scene-card${isSelected ? ' selected' : ''}`}
        style={{ borderLeftColor: color }}
        draggable="true"
        onDragStart={(e) => handleDragStart(e, sceneKey)}
        onDragEnd={handleDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          onSelectScene(isSelected ? null : sceneKey);
        }}
        title={scene.title || `Scene ${scene.sceneNumber}`}
      >
        <span className="tg-scene-num">{scene.sceneNumber}</span>
        <span className="tg-scene-title">{title}</span>
      </button>
    );
  }

  // ── Helper: render a world event card ────────────────────────────────────
  function renderWorldEventCard(ev: WorldEvent) {
    const isSelected = selectedEventId === ev.id;
    const title = ev.title
      ? ev.title.slice(0, 30) + (ev.title.length > 30 ? '...' : '')
      : 'Untitled Event';

    return (
      <button
        key={ev.id}
        className={`tg-world-event-card${isSelected ? ' selected' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelectEvent(isSelected ? null : ev.id);
        }}
        title={ev.title}
      >
        <span className="tg-event-diamond">{'\u25C6'}</span>
        <span className="tg-event-label">{title}</span>
      </button>
    );
  }

  // ── Total grid rows: 1 header + 1 world-events + characters + 1 unassigned
  // Always include the unassigned row so it's available as a drop target
  const totalRows = 1 + 1 + characters.length + 1;
  const gridTemplateRows = `auto auto ${characters.map(() => 'auto').join(' ')} auto`;

  return (
    <div className="timeline-grid">
      <div
        className="timeline-grid-table"
        style={{
          display: 'grid',
          gridTemplateColumns: gridTemplateCols,
          gridTemplateRows,
        }}
      >
        {/* ── Row 1: Date headers ──────────────────────────────────────────── */}
        {/* Corner cell */}
        <div className="tg-corner" style={{ gridRow: 1, gridColumn: 1 }} />

        {dateRange.map((date, i) => {
          const isWeekend = (() => {
            const d = new Date(date + 'T00:00:00');
            const day = d.getDay();
            return day === 0 || day === 6;
          })();
          return (
            <div
              key={date}
              className={`tg-date-header${isWeekend ? ' weekend' : ''}`}
              style={{ gridRow: 1, gridColumn: i + 2 }}
            >
              <span className="tg-date-day">{dayAbbr(date)}</span>
              <span className="tg-date-num">{shortDate(date)}</span>
            </div>
          );
        })}

        {/* ── Row 2: World events ──────────────────────────────────────────── */}
        <div className="tg-lane-label tg-world-label" style={{ gridRow: 2, gridColumn: 1 }}>
          <span className="tg-lane-color" style={{ background: '#888' }} />
          <span className="tg-lane-name">World Events</span>
        </div>

        {dateRange.map((date, i) => {
          const events = worldEventsByDate[date] || [];
          return (
            <div
              key={`we-${date}`}
              className={`tg-cell tg-world-cell${events.length === 0 ? ' empty' : ''}`}
              style={{ gridRow: 2, gridColumn: i + 2 }}
            >
              {events.map((ev) => renderWorldEventCard(ev))}
            </div>
          );
        })}

        {/* ── Character rows ───────────────────────────────────────────────── */}
        {characters.map((char, rowIdx) => {
          const color = characterColors[char.id] || '#888';
          const gridRow = rowIdx + 3; // 1-indexed: header=1, world=2, chars start at 3

          return (
            <Fragment key={char.id}>
              <div
                className="tg-lane-label"
                style={{ gridRow, gridColumn: 1 }}
              >
                <span className="tg-lane-color" style={{ background: color }} />
                <span className="tg-lane-name">{char.name}</span>
              </div>
              {dateRange.map((date, colIdx) => {
                const sceneKeys = sceneDateMap[date]?.[char.id] || [];
                return (
                  <div
                    key={`${char.id}-${date}`}
                    className={`tg-cell${sceneKeys.length === 0 ? ' empty' : ''}`}
                    style={{ gridRow, gridColumn: colIdx + 2 }}
                    onDragOver={handleCellDragOver}
                    onDragLeave={handleCellDragLeave}
                    onDrop={(e) => handleCellDrop(e, date)}
                  >
                    {sceneKeys.map((sk) => renderSceneCard(sk))}
                  </div>
                );
              })}
            </Fragment>
          );
        })}

        {/* ── Unassigned pool ──────────────────────────────────────────────── */}
        {/* Always show unassigned pool as a drop target */}
        <div
          className="tg-unassigned"
          style={{
            gridRow: totalRows,
            gridColumn: `1 / -1`,
          }}
          onDragOver={handleUnassignedDragOver}
          onDragLeave={handleUnassignedDragLeave}
          onDrop={handleUnassignedDrop}
        >
          <div className="tg-unassigned-label">
            {unassignedScenes.length > 0 ? 'Unassigned Scenes' : 'Drop here to unassign'}
          </div>
          {unassignedScenes.length > 0 && (
            <div className="tg-unassigned-cards">
              {unassignedScenes.map((sk) => renderSceneCard(sk))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
