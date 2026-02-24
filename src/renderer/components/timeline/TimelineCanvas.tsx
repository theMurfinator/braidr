import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { Scene, Character, WorldEvent } from '../../../shared/types';

// ── Layout constants ──────────────────────────────────────────────────────────
const LANE_HEIGHT = 90;
const DAY_WIDTH = 130;
const CARD_W = 115;
const CARD_H = 44;
const EVENT_HEIGHT = 32;
const LANE_GAP = 8;
const TOP_MARGIN = 50;
const LABEL_WIDTH = 80;

// ── Light-theme color palette ─────────────────────────────────────────────────
const COLORS = {
  background: '#FAFAFA',
  dayColumnActive: 'rgba(0, 0, 0, 0.03)',
  laneStripeEven: 'rgba(0, 0, 0, 0.02)',
  laneStripeOdd: 'transparent',
  cardFill: '#FFFFFF',
  cardText: '#1A1A1A',
  cardStroke: '#E8E8E8',
  dayLabelText: '#A0A0A0',
  dayLabelMuted: '#CCCCCC',
  connectionLine: 'rgba(0, 0, 0, 0.15)',
  connectionHighlight: 'rgba(0, 0, 0, 0.45)',
  worldEventFill: '#FFF8E0',
  worldEventStroke: '#D4A83A',
  worldEventText: '#8B7000',
  worldEventDashDefault: 'rgba(180, 150, 50, 0.2)',
  worldEventDashSelected: 'rgba(180, 150, 50, 0.5)',
  selectedGlow: 'rgba(0, 0, 0, 0.08)',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface TimelineCanvasProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  timelineDates: Record<string, string>;
  worldEvents: WorldEvent[];
  connections: Record<string, string[]>;
  selectedSceneKey: string | null;
  selectedEventId: string | null;
  onSelectScene: (key: string | null) => void;
  onSelectEvent: (id: string | null) => void;
}

interface HitResult {
  type: 'scene' | 'event';
  id: string;       // sceneId or eventId
  key?: string;      // sceneKey for scenes
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Truncate text to fit a given pixel width. */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxW) {
    t = t.slice(0, -1);
  }
  return t + '\u2026';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimelineCanvas({
  scenes,
  characters,
  characterColors,
  timelineDates,
  worldEvents,
  connections,
  selectedSceneKey,
  selectedEventId,
  onSelectScene,
  onSelectEvent,
}: TimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Transient interaction state — refs to avoid re-renders
  const panRef = useRef({ x: LABEL_WIDTH + 20, y: 20 });
  const zoomRef = useRef(1);
  const hoverRef = useRef<HitResult | null>(null);
  const dragRef = useRef({
    isDragging: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Keep selected state in refs so draw() can read them without being a dep
  const selectedSceneRef = useRef(selectedSceneKey);
  const selectedEventRef = useRef(selectedEventId);
  useEffect(() => { selectedSceneRef.current = selectedSceneKey; }, [selectedSceneKey]);
  useEffect(() => { selectedEventRef.current = selectedEventId; }, [selectedEventId]);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Build the full date range (fill gaps between min and max)
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
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const day = String(cur.getDate()).padStart(2, '0');
      range.push(`${y}-${m}-${day}`);
      cur.setDate(cur.getDate() + 1);
    }
    return range;
  }, [timelineDates, worldEvents]);

  // sceneKey -> Scene lookup
  const sceneByKey = useMemo(() => {
    const m: Record<string, Scene> = {};
    for (const s of scenes) {
      m[`${s.characterId}:${s.sceneNumber}`] = s;
    }
    return m;
  }, [scenes]);

  // sceneId -> sceneKey lookup
  const keyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of scenes) {
      m[s.id] = `${s.characterId}:${s.sceneNumber}`;
    }
    return m;
  }, [scenes]);

  // sceneKey -> Scene lookup by id (for connection lookups)
  const sceneById = useMemo(() => {
    const m: Record<string, Scene> = {};
    for (const s of scenes) {
      m[s.id] = s;
    }
    return m;
  }, [scenes]);

  // date -> sceneKeys per character
  const sceneDateMap = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};
    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      const date = timelineDates[key];
      if (!date) continue;
      if (!map[date]) map[date] = {};
      if (!map[date][scene.characterId]) map[date][scene.characterId] = [];
      map[date][scene.characterId].push(key);
    }
    return map;
  }, [scenes, timelineDates]);

  // date -> world events
  const worldEventsByDate = useMemo(() => {
    const map: Record<string, WorldEvent[]> = {};
    for (const ev of worldEvents) {
      if (!ev.date) continue;
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [worldEvents]);

  // ── Position helpers ────────────────────────────────────────────────────────

  const dayX = useCallback((dateStr: string): number => {
    const idx = dateRange.indexOf(dateStr);
    return LABEL_WIDTH + (idx >= 0 ? idx : 0) * DAY_WIDTH;
  }, [dateRange]);

  const laneY = useCallback((charIndex: number): number => {
    return TOP_MARGIN + EVENT_HEIGHT + LANE_GAP + charIndex * LANE_HEIGHT;
  }, []);

  /** Get the rect for a scene card, handling stacking within the same day & character lane. */
  const sceneRect = useCallback((sceneKey: string): Rect | null => {
    const scene = sceneByKey[sceneKey];
    if (!scene) return null;
    const date = timelineDates[sceneKey];
    if (!date) return null;
    const charIdx = characters.findIndex(c => c.id === scene.characterId);
    if (charIdx < 0) return null;

    // Find this scene's order within its character+date cell
    const cellScenes = sceneDateMap[date]?.[scene.characterId] || [];
    const order = cellScenes.indexOf(sceneKey);

    const x = dayX(date) + (order >= 0 ? order : 0) * (CARD_W + 6);
    const y = laneY(charIdx) + (LANE_HEIGHT - CARD_H) / 2;
    return { x, y, w: CARD_W, h: CARD_H };
  }, [sceneByKey, timelineDates, characters, sceneDateMap, dayX, laneY]);

  const eventRect = useCallback((ev: WorldEvent): Rect | null => {
    if (!ev.date) return null;
    const x = dayX(ev.date);
    const y = TOP_MARGIN;
    return { x, y, w: CARD_W, h: EVENT_HEIGHT };
  }, [dayX]);

  // ── Hit testing ─────────────────────────────────────────────────────────────

  const hitTest = useCallback((canvasX: number, canvasY: number): HitResult | null => {
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const x = (canvasX - pan.x) / zoom;
    const y = (canvasY - pan.y) / zoom;

    // Check scenes
    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      const r = sceneRect(key);
      if (!r) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { type: 'scene', id: scene.id, key };
      }
    }

    // Check world events
    for (const ev of worldEvents) {
      const r = eventRect(ev);
      if (!r) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { type: 'event', id: ev.id };
      }
    }

    return null;
  }, [scenes, worldEvents, sceneRect, eventRect]);

  // ── Draw function ───────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Resize canvas if needed
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    const zoom = zoomRef.current;
    const pan = panRef.current;
    const hover = hoverRef.current;
    const selScene = selectedSceneRef.current;
    const selEvent = selectedEventRef.current;

    // Convert selected scene key to sceneId for comparison
    const selSceneId = selScene ? sceneByKey[selScene]?.id ?? null : null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // 2. Save, translate, scale
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const totalLaneHeight = characters.length * LANE_HEIGHT;

    // 3. Day column backgrounds
    for (const date of dateRange) {
      const charMap = sceneDateMap[date] || {};
      const hasScenes = Object.keys(charMap).length > 0;
      const hasEvent = (worldEventsByDate[date] || []).length > 0;
      if (hasScenes || hasEvent) {
        const x = dayX(date);
        ctx.fillStyle = COLORS.dayColumnActive;
        ctx.fillRect(
          x - 8,
          TOP_MARGIN - 10,
          DAY_WIDTH - 10,
          totalLaneHeight + EVENT_HEIGHT + LANE_GAP + 20,
        );
      }
    }

    // 4. Day labels at top
    ctx.textAlign = 'center';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    for (const date of dateRange) {
      const x = dayX(date);
      const charMap = sceneDateMap[date] || {};
      const hasScenes = Object.keys(charMap).length > 0;

      ctx.fillStyle = hasScenes ? COLORS.dayLabelText : COLORS.dayLabelMuted;
      // Short date label: "3/14"
      const d = new Date(date + 'T00:00:00');
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      ctx.fillText(label, x + CARD_W / 2, TOP_MARGIN - 16);

      // Tick mark
      ctx.strokeStyle = hasScenes ? COLORS.dayLabelText : COLORS.dayLabelMuted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + CARD_W / 2, TOP_MARGIN - 8);
      ctx.lineTo(x + CARD_W / 2, TOP_MARGIN - 2);
      ctx.stroke();
    }

    // 5. Character lane stripes (alternating)
    for (let i = 0; i < characters.length; i++) {
      const y = laneY(i);
      ctx.fillStyle = i % 2 === 0 ? COLORS.laneStripeEven : COLORS.laneStripeOdd;
      ctx.fillRect(
        -20,
        y,
        dateRange.length * DAY_WIDTH + LABEL_WIDTH + 40,
        LANE_HEIGHT,
      );
    }

    // 6. Character lane labels (left side)
    ctx.textAlign = 'right';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const color = characterColors[char.id] || '#888';
      const y = laneY(i);
      // 60% opacity: append '99' (hex for ~60%)
      ctx.fillStyle = color + '99';
      ctx.fillText(char.name, LABEL_WIDTH - 12, y + LANE_HEIGHT / 2 + 4);
    }

    // 7. World events row label
    ctx.fillStyle = COLORS.worldEventStroke + '99';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('World', LABEL_WIDTH - 12, TOP_MARGIN + EVENT_HEIGHT / 2 + 4);

    // 8. Connection lines (Bezier curves between connected scenes)
    ctx.setLineDash([]);
    for (const [sourceId, targetIds] of Object.entries(connections)) {
      const sourceKey = keyById[sourceId];
      if (!sourceKey) continue;
      const p1 = sceneRect(sourceKey);
      if (!p1) continue;

      for (const targetId of targetIds) {
        const targetKey = keyById[targetId];
        if (!targetKey) continue;
        const p2 = sceneRect(targetKey);
        if (!p2) continue;

        const x1 = p1.x + p1.w / 2;
        const y1 = p1.y + p1.h / 2;
        const x2 = p2.x + p2.w / 2;
        const y2 = p2.y + p2.h / 2;

        const isHovered = hover && (
          (hover.type === 'scene' && (hover.id === sourceId || hover.id === targetId))
        );

        ctx.strokeStyle = isHovered ? COLORS.connectionHighlight : COLORS.connectionLine;
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.setLineDash(isHovered ? [] : [4, 4]);
        ctx.beginPath();

        const cpx1 = x1 + (x2 - x1) * 0.4;
        const cpx2 = x1 + (x2 - x1) * 0.6;
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cpx1, y1, cpx2, y2, x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 9. World event -> scene dashed lines
    for (const ev of worldEvents) {
      const ep = eventRect(ev);
      if (!ep) continue;
      const isSelected = selEvent === ev.id;

      for (const linkedKey of ev.linkedSceneKeys) {
        const sr = sceneRect(linkedKey);
        if (!sr) continue;

        ctx.strokeStyle = isSelected
          ? COLORS.worldEventDashSelected
          : COLORS.worldEventDashDefault;
        ctx.lineWidth = isSelected ? 1.5 : 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(ep.x + ep.w / 2, ep.y + ep.h);
        ctx.lineTo(sr.x + sr.w / 2, sr.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 10. Scene cards
    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      const r = sceneRect(key);
      if (!r) continue;

      const color = characterColors[scene.characterId] || '#888';
      const isHovered = hover?.type === 'scene' && hover.id === scene.id;
      const isSelected = selSceneId === scene.id;

      // Check if connected to hovered node
      const isConnected = hover?.type === 'scene' && hover.id !== scene.id && (
        (connections[hover.id] || []).includes(scene.id) ||
        (connections[scene.id] || []).includes(hover.id)
      );

      // Check if linked to selected event
      const isEventLinked = selEvent != null && worldEvents.some(
        e => e.id === selEvent && e.linkedSceneKeys.includes(key),
      );

      // Glow
      if (isHovered || isSelected) {
        ctx.shadowColor = color + '40';
        ctx.shadowBlur = 12;
      }

      // Card background
      ctx.fillStyle = isSelected
        ? color + '15'
        : isHovered
          ? color + '10'
          : COLORS.cardFill;

      // Stroke
      ctx.strokeStyle = isEventLinked
        ? COLORS.worldEventStroke
        : isConnected
          ? COLORS.connectionHighlight
          : isSelected
            ? color
            : isHovered
              ? color + '80'
              : COLORS.cardStroke;
      ctx.lineWidth = isSelected || isEventLinked ? 2 : 1;

      roundRect(ctx, r.x, r.y, r.w, r.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Left color bar
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, 5, r.h);
      ctx.clip();
      ctx.fillStyle = color;
      roundRect(ctx, r.x, r.y, 10, r.h, 6);
      ctx.fill();
      ctx.restore();

      // Scene number
      ctx.fillStyle = color + '99';
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`#${scene.sceneNumber}`, r.x + 10, r.y + 14);

      // Scene title
      ctx.fillStyle = isHovered || isSelected ? COLORS.cardText : '#555555';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
      const title = scene.title || `Scene ${scene.sceneNumber}`;
      const displayTitle = truncateText(ctx, title, r.w - 16);
      ctx.fillText(displayTitle, r.x + 10, r.y + 32);

      // Connection dot indicator
      const hasConnection = (connections[scene.id] && connections[scene.id].length > 0) ||
        Object.values(connections).some(targets => targets.includes(scene.id));
      if (hasConnection) {
        ctx.fillStyle = COLORS.connectionHighlight;
        ctx.beginPath();
        ctx.arc(r.x + r.w - 8, r.y + 10, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 11. World event cards (diamond icon style)
    for (const ev of worldEvents) {
      const r = eventRect(ev);
      if (!r) continue;

      const isHovered = hover?.type === 'event' && hover.id === ev.id;
      const isSelected = selEvent === ev.id;

      // Card background
      ctx.fillStyle = isSelected
        ? '#FFF0C0'
        : isHovered
          ? '#FFF4D8'
          : COLORS.worldEventFill;
      ctx.strokeStyle = isSelected
        ? COLORS.worldEventStroke
        : isHovered
          ? COLORS.worldEventStroke + 'CC'
          : COLORS.worldEventStroke + '80';
      ctx.lineWidth = isSelected ? 2 : 1;

      roundRect(ctx, r.x, r.y, r.w, r.h, 4);
      ctx.fill();
      ctx.stroke();

      // Diamond icon
      ctx.fillStyle = COLORS.worldEventStroke;
      ctx.save();
      ctx.translate(r.x + 10, r.y + r.h / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();

      // Title
      ctx.fillStyle = isHovered || isSelected
        ? COLORS.worldEventText
        : COLORS.worldEventText + 'CC';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
      ctx.textAlign = 'left';
      const evTitle = truncateText(ctx, ev.title, r.w - 28);
      ctx.fillText(evTitle, r.x + 22, r.y + r.h / 2 + 4);
    }

    // 12. Hover highlight — draw glow outline on hovered card and connected cards
    if (hover) {
      if (hover.type === 'scene' && hover.key) {
        const r = sceneRect(hover.key);
        if (r) {
          const color = characterColors[sceneById[hover.id]?.characterId] || '#888';
          ctx.shadowColor = color + '60';
          ctx.shadowBlur = 16;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          roundRect(ctx, r.x, r.y, r.w, r.h, 6);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
        }
      } else if (hover.type === 'event') {
        const ev = worldEvents.find(e => e.id === hover.id);
        if (ev) {
          const r = eventRect(ev);
          if (r) {
            ctx.shadowColor = COLORS.worldEventStroke + '60';
            ctx.shadowBlur = 16;
            ctx.strokeStyle = COLORS.worldEventStroke;
            ctx.lineWidth = 2;
            roundRect(ctx, r.x, r.y, r.w, r.h, 4);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
          }
        }
      }
    }

    // 13. Restore context
    ctx.restore();
  }, [
    characters,
    characterColors,
    dateRange,
    sceneDateMap,
    worldEventsByDate,
    worldEvents,
    scenes,
    connections,
    sceneByKey,
    sceneById,
    keyById,
    dayX,
    laneY,
    sceneRect,
    eventRect,
  ]);

  // ── Event handling & animation loop ─────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial draw
    draw();

    // ── Resize observer ──────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      draw();
    });
    resizeObserver.observe(canvas);

    // ── Mouse handlers ───────────────────────────────────────────────────────

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      dragRef.current = {
        isDragging: true,
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panRef.current.x,
        startPanY: panRef.current.y,
      };

      // Pre-check hit so we know if this is a click on a node
      const hit = hitTest(mx, my);
      if (hit) {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = 'grabbing';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const drag = dragRef.current;

      if (drag.isDragging) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          drag.hasMoved = true;
        }
        if (drag.hasMoved) {
          panRef.current = {
            x: drag.startPanX + dx,
            y: drag.startPanY + dy,
          };
          canvas.style.cursor = 'grabbing';
          draw();
        }
        return;
      }

      // Hover hit test
      const hit = hitTest(mx, my);
      const prevHover = hoverRef.current;
      const changed = (hit?.id !== prevHover?.id) || (hit?.type !== prevHover?.type);
      if (changed) {
        hoverRef.current = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        draw();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      const wasDragging = drag.isDragging;
      drag.isDragging = false;

      if (wasDragging && !drag.hasMoved) {
        // This was a click
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = hitTest(mx, my);

        if (hit) {
          if (hit.type === 'scene' && hit.key) {
            onSelectScene(selectedSceneRef.current === hit.key ? null : hit.key);
            onSelectEvent(null);
          } else if (hit.type === 'event') {
            onSelectEvent(selectedEventRef.current === hit.id ? null : hit.id);
            onSelectScene(null);
          }
        } else {
          // Click on empty space — deselect
          onSelectScene(null);
          onSelectEvent(null);
        }
        draw();
      }

      canvas.style.cursor = hoverRef.current ? 'pointer' : 'grab';
    };

    const handleMouseLeave = () => {
      dragRef.current.isDragging = false;
      if (hoverRef.current) {
        hoverRef.current = null;
        draw();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const oldZoom = zoomRef.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.3, Math.min(3, oldZoom * delta));
      zoomRef.current = newZoom;

      // Zoom toward cursor
      panRef.current = {
        x: mx - (mx - panRef.current.x) * (newZoom / oldZoom),
        y: my - (my - panRef.current.y) * (newZoom / oldZoom),
      };

      draw();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [draw, hitTest, onSelectScene, onSelectEvent]);

  // Redraw when selection changes from outside (e.g. sidebar click)
  useEffect(() => {
    draw();
  }, [selectedSceneKey, selectedEventId, draw]);

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (dateRange.length === 0 && worldEvents.length === 0) {
    return (
      <div className="timeline-canvas-placeholder">
        Assign dates to your scenes to see the canvas visualization.
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="timeline-canvas"
    />
  );
}
