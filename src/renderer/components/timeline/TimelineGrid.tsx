import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Scene, Character, WorldEvent, PlotPoint } from '../../../shared/types';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';

interface TimelineGridProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  timelineDates: Record<string, string>;
  timelineEndDates: Record<string, string>;
  onTimelineEndDatesChange: (dates: Record<string, string>) => void;
  worldEvents: WorldEvent[];
  connections: Record<string, string[]>;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
  selectedSceneKey: string | null;
  selectedEventId: string | null;
  onSelectScene: (key: string | null) => void;
  onSelectEvent: (id: string | null) => void;
  labelWidth: number;
  onLabelWidthChange: (w: number) => void;
  colWidth: number;
  onColWidthChange: (w: number) => void;
  dateRange: string[];
  onExtendRange: () => void;
  onWorldEventsChange: (events: WorldEvent[]) => void;
  plotPoints?: PlotPoint[];
  onInsertScene?: (characterId: string, plotPointId: string, date: string) => Promise<string | null>;
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

/** Full date label like "03-14-2026". */
function fullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${d.getFullYear()}`;
}

/** Compute the column span for a scene that may have an end date. */
function dateSpanColumns(startDate: string, endDate: string | undefined, dateRange: string[]): number {
  if (!endDate || endDate <= startDate) return 1;
  const startIdx = dateRange.indexOf(startDate);
  const endIdx = dateRange.indexOf(endDate);
  if (startIdx < 0) return 1;
  if (endIdx < 0) return 1; // end date outside visible range
  return endIdx - startIdx + 1;
}

/* ── dnd-kit sub-components ──────────────────────────────────────────────── */

function DroppableCell({
  id,
  children,
  className,
  style,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className || ''} ${isOver ? 'drag-over' : ''}`}
      style={style}
    >
      {children}
    </div>
  );
}

function DraggableSceneCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function DraggableEventCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export default function TimelineGrid({
  scenes,
  characters,
  characterColors,
  timelineDates,
  timelineEndDates,
  onTimelineEndDatesChange,
  worldEvents,
  selectedSceneKey,
  selectedEventId,
  onSelectScene,
  onSelectEvent,
  onTimelineDatesChange,
  labelWidth,
  onLabelWidthChange,
  colWidth,
  onColWidthChange,
  dateRange,
  onExtendRange,
  onWorldEventsChange,
  plotPoints,
  onInsertScene,
}: TimelineGridProps) {
  const resizeDragRef = useRef<{ startX: number; initialWidth: number; target: 'label' | 'col' } | null>(null);
  const spanResizeRef = useRef<{ sceneKey: string; edge: 'left' | 'right'; startX: number; startDate: string; startEndDate: string | undefined } | null>(null);
  const [insertCell, setInsertCell] = useState<{ characterId: string; date: string } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Handle span resize (multi-day scene edge drag)
      const spanDrag = spanResizeRef.current;
      if (spanDrag) {
        e.preventDefault();
        const deltaCol = Math.round((e.clientX - spanDrag.startX) / colWidth);
        if (deltaCol === 0) return;
        const startIdx = dateRange.indexOf(spanDrag.startDate);
        const endIdx = spanDrag.startEndDate ? dateRange.indexOf(spanDrag.startEndDate) : startIdx;
        if (startIdx < 0) return;

        if (spanDrag.edge === 'right') {
          const newEndIdx = Math.max(startIdx, (endIdx >= 0 ? endIdx : startIdx) + deltaCol);
          if (newEndIdx < dateRange.length && newEndIdx >= startIdx) {
            const newEndDate = dateRange[newEndIdx];
            if (newEndDate !== spanDrag.startEndDate) {
              spanResizeRef.current = { ...spanDrag, startX: e.clientX, startEndDate: newEndDate === spanDrag.startDate ? undefined : newEndDate };
              const updated = { ...timelineEndDates };
              if (newEndDate === spanDrag.startDate || newEndIdx === startIdx) {
                delete updated[spanDrag.sceneKey];
              } else {
                updated[spanDrag.sceneKey] = newEndDate;
              }
              onTimelineEndDatesChange(updated);
            }
          }
        } else {
          // left edge: move start date
          const curEndIdx = endIdx >= 0 ? endIdx : startIdx;
          const newStartIdx = Math.min(curEndIdx, startIdx + deltaCol);
          if (newStartIdx >= 0 && newStartIdx < dateRange.length) {
            const newStartDate = dateRange[newStartIdx];
            if (newStartDate !== spanDrag.startDate) {
              spanResizeRef.current = { ...spanDrag, startX: e.clientX, startDate: newStartDate };
              const updatedDates = { ...timelineDates, [spanDrag.sceneKey]: newStartDate };
              onTimelineDatesChange(updatedDates);
              if (newStartIdx === curEndIdx) {
                const updatedEnd = { ...timelineEndDates };
                delete updatedEnd[spanDrag.sceneKey];
                onTimelineEndDatesChange(updatedEnd);
              }
            }
          }
        }
        return;
      }

      const drag = resizeDragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      if (drag.target === 'label') {
        onLabelWidthChange(drag.initialWidth + delta);
      } else {
        onColWidthChange(drag.initialWidth + delta);
      }
    };
    const onMouseUp = () => {
      resizeDragRef.current = null;
      spanResizeRef.current = null;
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onLabelWidthChange, onColWidthChange, colWidth, dateRange, timelineDates, timelineEndDates, onTimelineDatesChange, onTimelineEndDatesChange]);

  const handleLabelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, initialWidth: labelWidth, target: 'label' };
    document.body.style.userSelect = 'none';
  }, [labelWidth]);

  const handleColResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDragRef.current = { startX: e.clientX, initialWidth: colWidth, target: 'col' };
    document.body.style.userSelect = 'none';
  }, [colWidth]);
  // ── Build lookup: sceneKey -> date ────────────────────────────────────────
  // timelineDates is keyed by scene.id -> "YYYY-MM-DD"

  // ── Build lookup: date -> scenes per character ────────────────────────────
  const sceneDateMap = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};

    for (const scene of scenes) {
      const key = scene.id;
      const date = timelineDates[key];
      if (!date) continue;
      if (!map[date]) map[date] = {};
      if (!map[date][scene.characterId]) map[date][scene.characterId] = [];
      map[date][scene.characterId].push(key);
    }

    return map;
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


  // ── Scene lookup by key ──────────────────────────────────────────────────
  const sceneByKey = useMemo(() => {
    const m: Record<string, Scene> = {};
    for (const s of scenes) {
      m[s.id] = s;
    }
    return m;
  }, [scenes]);

  // ── dnd-kit sensors and handlers ────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (!overId.startsWith('cell:')) return;

    // Parse "cell:characterId:date" — date is everything after second colon
    const firstColon = overId.indexOf(':');
    const secondColon = overId.indexOf(':', firstColon + 1);
    const targetDate = overId.slice(secondColon + 1);

    if (activeId.startsWith('scene:')) {
      const sceneKey = activeId.replace('scene:', '');
      onTimelineDatesChange({ ...timelineDates, [sceneKey]: targetDate });
    } else if (activeId.startsWith('event:')) {
      const eventId = activeId.replace('event:', '');
      const updated = worldEvents.map(ev =>
        ev.id === eventId ? { ...ev, date: targetDate, updatedAt: Date.now() } : ev
      );
      onWorldEventsChange(updated);
    }
  }, [timelineDates, onTimelineDatesChange, worldEvents, onWorldEventsChange]);

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
    if (dateRange.length === 0) return `${labelWidth}px`;
    const cols = dateRange.map(() => `${colWidth}px`).join(' ');
    return `${labelWidth}px ${cols} 36px`;
  }, [dateRange, colWidth, labelWidth]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (dateRange.length === 0 && worldEvents.length === 0) {
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
  function renderSceneCard(sceneKey: string, gridPlacement?: { gridRow: number; gridColumn: string }) {
    const scene = sceneByKey[sceneKey];
    if (!scene) return null;
    const color = characterColors[scene.characterId] || '#888';
    const endDate = timelineEndDates[sceneKey];
    const span = dateSpanColumns(timelineDates[sceneKey], endDate, dateRange);
    const isMultiDay = span > 1;
    const title = scene.title
      ? scene.title.slice(0, isMultiDay ? 60 : 30) + (scene.title.length > (isMultiDay ? 60 : 30) ? '...' : '')
      : `Scene ${scene.sceneNumber}`;
    const isSelected = selectedSceneKey === sceneKey;
    const date = timelineDates[sceneKey];
    const dateLabel = date ? shortDate(date) : null;

    const cardStyle: React.CSSProperties = { borderLeftColor: color };
    if (gridPlacement) {
      cardStyle.gridRow = gridPlacement.gridRow;
      cardStyle.gridColumn = gridPlacement.gridColumn;
      cardStyle.zIndex = 2;
    }

    const cardContent = (
      <button
        className={`tg-scene-card${isSelected ? ' selected' : ''}${isMultiDay ? ' multi-day' : ''}`}
        style={cardStyle}
        onClick={(e) => {
          e.stopPropagation();
          onSelectScene(isSelected ? null : sceneKey);
        }}
        title={scene.title || `Scene ${scene.sceneNumber}`}
      >
        {isMultiDay && (
          <div
            className="tg-resize-handle-left"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              spanResizeRef.current = { sceneKey, edge: 'left', startX: e.clientX, startDate: date, startEndDate: endDate };
              document.body.style.userSelect = 'none';
            }}
          />
        )}
        <div className="tg-scene-card-content">
          <div className="tg-scene-card-top">
            <span className="tg-scene-num">{scene.sceneNumber}</span>
            <span className="tg-scene-title">{title}</span>
          </div>
          {dateLabel && <span className="tg-scene-date">{dateLabel}{endDate ? ` \u2013 ${shortDate(endDate)}` : ''}</span>}
        </div>
        <div
          className="tg-resize-handle-right"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            spanResizeRef.current = { sceneKey, edge: 'right', startX: e.clientX, startDate: date, startEndDate: endDate };
            document.body.style.userSelect = 'none';
          }}
        />
      </button>
    );

    return (
      <DraggableSceneCard key={sceneKey} id={`scene:${sceneKey}`}>
        {cardContent}
      </DraggableSceneCard>
    );
  }

  // ── Helper: render a world event card ────────────────────────────────────
  function renderWorldEventCard(ev: WorldEvent) {
    const isSelected = selectedEventId === ev.id;
    const title = ev.title
      ? ev.title.slice(0, 30) + (ev.title.length > 30 ? '...' : '')
      : 'Untitled Event';

    return (
      <DraggableEventCard key={ev.id} id={`event:${ev.id}`}>
        <button
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
      </DraggableEventCard>
    );
  }

  // ── Total grid rows: 1 header + 1 world-events + characters
  const totalRows = 1 + 1 + characters.length;
  const gridTemplateRows = `auto auto ${characters.map(() => 'auto').join(' ')}`;

  // ── Build overlay content for DragOverlay ─────────────────────────────────
  function renderDragOverlay() {
    if (!activeDragId) return null;

    if (activeDragId.startsWith('scene:')) {
      const sceneKey = activeDragId.replace('scene:', '');
      const scene = sceneByKey[sceneKey];
      if (!scene) return null;
      const color = characterColors[scene.characterId] || '#888';
      const title = scene.title
        ? scene.title.slice(0, 30) + (scene.title.length > 30 ? '...' : '')
        : `Scene ${scene.sceneNumber}`;
      return (
        <div className="tg-scene-card" style={{ borderLeftColor: color, opacity: 0.9 }}>
          <div className="tg-scene-card-content">
            <div className="tg-scene-card-top">
              <span className="tg-scene-num">{scene.sceneNumber}</span>
              <span className="tg-scene-title">{title}</span>
            </div>
          </div>
        </div>
      );
    }

    if (activeDragId.startsWith('event:')) {
      const eventId = activeDragId.replace('event:', '');
      const ev = worldEvents.find(e => e.id === eventId);
      if (!ev) return null;
      const title = ev.title
        ? ev.title.slice(0, 30) + (ev.title.length > 30 ? '...' : '')
        : 'Untitled Event';
      return (
        <div className="tg-world-event-card" style={{ opacity: 0.9 }}>
          <span className="tg-event-diamond">{'\u25C6'}</span>
          <span className="tg-event-label">{title}</span>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="timeline-grid">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
        {/* Label column resize handle */}
        <div
          className="tg-label-resize-handle"
          style={{ gridRow: `1 / ${totalRows + 1}`, gridColumn: 1 }}
          onMouseDown={handleLabelResizeStart}
        />

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
              <span className="tg-date-num">{fullDate(date)}</span>
              <div className="tg-col-resize-handle" onMouseDown={handleColResizeStart} />
            </div>
          );
        })}

        {/* Extend range "+" button */}
        {dateRange.length > 0 && (
          <div
            className="tg-date-header tg-extend-col"
            style={{ gridRow: 1, gridColumn: dateRange.length + 2 }}
          >
            <button
              className="tg-extend-btn"
              onClick={onExtendRange}
              title="Add 7 more days"
            >
              +
            </button>
          </div>
        )}

        {/* ── Row 2: World events ──────────────────────────────────────────── */}
        <div className="tg-lane-label tg-world-label" style={{ gridRow: 2, gridColumn: 1 }}>
          <span className="tg-lane-color" style={{ background: '#888' }} />
          <span className="tg-lane-name">World Events</span>
        </div>

        {dateRange.map((date, i) => {
          const events = worldEventsByDate[date] || [];
          return (
            <DroppableCell
              key={`we-${date}`}
              id={`cell:__world__:${date}`}
              className={`tg-cell tg-world-cell${events.length === 0 ? ' empty' : ''}`}
              style={{ gridRow: 2, gridColumn: i + 2 }}
            >
              {events.map((ev) => renderWorldEventCard(ev))}
            </DroppableCell>
          );
        })}

        {/* ── Character rows ───────────────────────────────────────────────── */}
        {characters.map((char, rowIdx) => {
          const color = characterColors[char.id] || '#888';
          const gridRow = rowIdx + 3; // 1-indexed: header=1, world=2, chars start at 3

          // Collect multi-day scenes to render as top-level grid items
          const multiDayScenes: { sceneKey: string; colStart: number; span: number }[] = [];
          const multiDayStartCols = new Set<number>();

          // Pre-scan for multi-day scenes in this character's row
          for (const [sk, date] of Object.entries(timelineDates)) {
            if (!sk.startsWith(char.id + ':')) continue;
            const endDate = timelineEndDates[sk];
            const span = dateSpanColumns(date, endDate, dateRange);
            if (span > 1) {
              const colStart = dateRange.indexOf(date);
              if (colStart >= 0) {
                multiDayScenes.push({ sceneKey: sk, colStart, span });
                for (let c = colStart; c < colStart + span; c++) multiDayStartCols.add(c);
              }
            }
          }

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
                // Filter out multi-day scenes (they're rendered as separate grid items)
                const singleDayKeys = sceneKeys.filter(sk => {
                  const endDate = timelineEndDates[sk];
                  return dateSpanColumns(timelineDates[sk], endDate, dateRange) <= 1;
                });
                // Check if this cell is covered by a multi-day scene (for styling)
                const coveredByMultiDay = multiDayStartCols.has(colIdx);
                const isInsertOpen = insertCell?.characterId === char.id && insertCell?.date === date;
                const charPlotPoints = plotPoints?.filter(p => p.characterId === char.id).sort((a, b) => a.order - b.order) || [];
                return (
                  <DroppableCell
                    key={`${char.id}-${date}`}
                    id={`cell:${char.id}:${date}`}
                    className={`tg-cell${singleDayKeys.length === 0 && !coveredByMultiDay ? ' empty' : ''}`}
                    style={{ gridRow, gridColumn: colIdx + 2 }}
                  >
                    {singleDayKeys.map((sk) => renderSceneCard(sk))}
                    {singleDayKeys.length === 0 && !coveredByMultiDay && onInsertScene && (
                      <button
                        className="tg-cell-insert-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInsertCell(isInsertOpen ? null : { characterId: char.id, date });
                        }}
                        title="Add scene here"
                      >+</button>
                    )}
                    {isInsertOpen && (
                      <div className="braided-insert-popover tg-insert-popover">
                        <div className="braided-insert-popover-title">Pick a section</div>
                        {charPlotPoints.map(pp => (
                          <button
                            key={pp.id}
                            className="braided-insert-popover-item"
                            onClick={async () => {
                              const sceneKey = await onInsertScene!(char.id, pp.id, date);
                              setInsertCell(null);
                              if (sceneKey) onSelectScene(sceneKey);
                            }}
                          >
                            {pp.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </DroppableCell>
                );
              })}
              {/* Multi-day scene cards rendered as top-level grid items */}
              {multiDayScenes.map(({ sceneKey, colStart, span }) =>
                renderSceneCard(sceneKey, {
                  gridRow,
                  gridColumn: `${colStart + 2} / span ${span}`,
                })
              )}
            </Fragment>
          );
        })}

      </div>
      <DragOverlay>{renderDragOverlay()}</DragOverlay>
      </DndContext>
    </div>
  );
}
