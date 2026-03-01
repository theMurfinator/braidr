import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { Scene, Character, WorldEvent } from '../../../shared/types';

interface TimelineContextBarProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  timelineDates: Record<string, string>;
  timelineEndDates: Record<string, string>;
  worldEvents: WorldEvent[];
  dateRange: string[];
  selectedSceneKey: string | null;
  selectedEventId: string | null;
  onSelectScene: (key: string | null) => void;
  viewport: { start: number; end: number }; // 0..1 fractions
  onViewportChange: (start: number, end: number) => void;
}

const BAR_HEIGHT = 44;
const VIEWPORT_MIN_FRAC = 0.02; // minimum viewport width as fraction

export default function TimelineContextBar({
  scenes,
  characters,
  characterColors,
  timelineDates,
  timelineEndDates,
  worldEvents,
  dateRange,
  selectedSceneKey,
  selectedEventId,
  onSelectScene,
  viewport,
  onViewportChange,
}: TimelineContextBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    type: 'pan' | 'resize-left' | 'resize-right';
    startX: number;
    startViewport: { start: number; end: number };
  } | null>(null);

  // Keep props in refs for event handlers
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  const dateRangeLen = dateRange.length;

  // Map a date to a fraction [0, 1] within the date range
  const dateFraction = useCallback((dateStr: string): number => {
    if (dateRangeLen <= 1) return 0;
    const idx = dateRange.indexOf(dateStr);
    if (idx < 0) return 0;
    return idx / (dateRangeLen - 1);
  }, [dateRange, dateRangeLen]);

  // Character index lookup
  const charIndex = useMemo(() => {
    const m: Record<string, number> = {};
    characters.forEach((c, i) => { m[c.id] = i; });
    return m;
  }, [characters]);

  // Draw the minimap
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (dateRangeLen === 0) return;

    const numChars = characters.length;
    const laneH = numChars > 0 ? Math.max(3, (h - 6) / numChars) : h - 6;
    const barMinW = Math.max(3, w * (1 / dateRangeLen));

    // Draw scene bars per character lane
    for (const scene of scenes) {
      const startDate = timelineDates[scene.id];
      if (!startDate) continue;

      const ci = charIndex[scene.characterId];
      if (ci === undefined) continue;

      const color = characterColors[scene.characterId] || '#888';
      const isSelected = selectedSceneKey === scene.id;

      const startFrac = dateFraction(startDate);
      const endDate = timelineEndDates[scene.id];
      const endFrac = endDate ? dateFraction(endDate) : startFrac;

      const x = startFrac * w;
      const barW = Math.max(barMinW, (endFrac - startFrac) * w + barMinW);
      const y = 3 + ci * laneH;
      const barH = Math.max(2, laneH - 1);

      ctx.globalAlpha = isSelected ? 1 : 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW, barH);

      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barW, barH);
      }
    }

    // Draw world event diamonds
    ctx.globalAlpha = 0.8;
    for (const ev of worldEvents) {
      if (!ev.date) continue;
      const frac = dateFraction(ev.date);
      const x = frac * w;
      const isSelected = selectedEventId === ev.id;

      ctx.fillStyle = isSelected ? '#D4A83A' : '#E8C84A';
      const size = 4;
      const cy = h - 4;
      ctx.beginPath();
      ctx.moveTo(x, cy - size);
      ctx.lineTo(x + size, cy);
      ctx.lineTo(x, cy + size);
      ctx.lineTo(x - size, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Draw viewport rectangle
    ctx.globalAlpha = 1;
    const vp = viewportRef.current;
    const vpX = vp.start * w;
    const vpW = Math.max(4, (vp.end - vp.start) * w);

    // Dim area outside viewport
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, vpX, h);
    ctx.fillRect(vpX + vpW, 0, w - vpX - vpW, h);

    // Viewport border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX + 0.5, 0.5, vpW - 1, h - 1);

    // Edge handles (subtle bars)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(vpX, 0, 3, h);
    ctx.fillRect(vpX + vpW - 3, 0, 3, h);
  }, [characters, characterColors, charIndex, dateRangeLen, dateFraction, scenes, timelineDates, timelineEndDates, worldEvents, selectedSceneKey, selectedEventId]);

  // Event handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    draw();

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width; // fraction
      const vp = viewportRef.current;

      const vpLeftEdge = vp.start;
      const vpRightEdge = vp.end;
      const edgeThreshold = Math.max(0.01, (vpRightEdge - vpLeftEdge) * 0.15);

      if (Math.abs(mx - vpLeftEdge) < edgeThreshold && mx < vpLeftEdge + edgeThreshold) {
        // Resize left edge
        dragRef.current = { type: 'resize-left', startX: e.clientX, startViewport: { ...vp } };
      } else if (Math.abs(mx - vpRightEdge) < edgeThreshold && mx > vpRightEdge - edgeThreshold) {
        // Resize right edge
        dragRef.current = { type: 'resize-right', startX: e.clientX, startViewport: { ...vp } };
      } else if (mx >= vpLeftEdge && mx <= vpRightEdge) {
        // Pan the viewport
        dragRef.current = { type: 'pan', startX: e.clientX, startViewport: { ...vp } };
      } else {
        // Click outside viewport — center viewport at click position
        const vpWidth = vp.end - vp.start;
        const newStart = Math.max(0, Math.min(1 - vpWidth, mx - vpWidth / 2));
        onViewportChange(newStart, newStart + vpWidth);
      }

      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        // Update cursor based on position
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const vp = viewportRef.current;
        const edgeThreshold = Math.max(0.01, (vp.end - vp.start) * 0.15);

        if (Math.abs(mx - vp.start) < edgeThreshold || Math.abs(mx - vp.end) < edgeThreshold) {
          canvas.style.cursor = 'col-resize';
        } else if (mx >= vp.start && mx <= vp.end) {
          canvas.style.cursor = 'grab';
        } else {
          canvas.style.cursor = 'pointer';
        }
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const deltaFrac = (e.clientX - drag.startX) / rect.width;

      if (drag.type === 'pan') {
        canvas.style.cursor = 'grabbing';
        const vpWidth = drag.startViewport.end - drag.startViewport.start;
        let newStart = drag.startViewport.start + deltaFrac;
        newStart = Math.max(0, Math.min(1 - vpWidth, newStart));
        onViewportChange(newStart, newStart + vpWidth);
      } else if (drag.type === 'resize-left') {
        canvas.style.cursor = 'col-resize';
        let newStart = drag.startViewport.start + deltaFrac;
        newStart = Math.max(0, Math.min(drag.startViewport.end - VIEWPORT_MIN_FRAC, newStart));
        onViewportChange(newStart, drag.startViewport.end);
      } else if (drag.type === 'resize-right') {
        canvas.style.cursor = 'col-resize';
        let newEnd = drag.startViewport.end + deltaFrac;
        newEnd = Math.max(drag.startViewport.start + VIEWPORT_MIN_FRAC, Math.min(1, newEnd));
        onViewportChange(drag.startViewport.start, newEnd);
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = '';
    };

    const handleClick = (e: MouseEvent) => {
      // Check if click was on a scene bar (for selection)
      if (dragRef.current) return; // was dragging
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = e.clientY - rect.top;

      const numChars = characters.length;
      if (numChars === 0) return;
      const laneH = Math.max(3, (rect.height - 6) / numChars);
      const barMinW = Math.max(3, 1 / dateRangeLen);

      for (const scene of scenes) {
        const startDate = timelineDates[scene.id];
        if (!startDate) continue;

        const ci = charIndex[scene.characterId];
        if (ci === undefined) continue;

        const startFrac = dateFraction(startDate);
        const endDate = timelineEndDates[scene.id];
        const endFrac = endDate ? dateFraction(endDate) : startFrac;

        const barX = startFrac;
        const barW = Math.max(barMinW, endFrac - startFrac + barMinW);
        const barY = 3 + ci * laneH;
        const barH = Math.max(2, laneH - 1);

        if (mx >= barX && mx <= barX + barW && my >= barY && my <= barY + barH) {
          onSelectScene(selectedSceneKey === scene.id ? null : scene.id);
          return;
        }
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
    };
  }, [draw, onViewportChange, characters, charIndex, dateRangeLen, dateFraction, scenes, timelineDates, timelineEndDates, selectedSceneKey, onSelectScene]);

  // Redraw when data or selection changes
  useEffect(() => {
    draw();
  }, [draw, viewport, selectedSceneKey, selectedEventId]);

  return (
    <div className="timeline-context-bar">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
