import { useEffect, useRef, RefObject } from 'react';
import { useDndMonitor } from '@dnd-kit/core';

/**
 * Auto-scrolls a container when dragging near its top/bottom edges.
 * Wired to dnd-kit drag events via useDndMonitor — must be called from a
 * component inside a SortableArea.
 */
export function useAutoScrollContainer(
  scrollContainerRef: RefObject<HTMLElement | null>,
  edgeSize: number = 150,
) {
  const isDragging = useRef(false);
  const mouseY = useRef<number>(0);
  const rafId = useRef<number | null>(null);

  useDndMonitor({
    onDragStart: () => {
      isDragging.current = true;
      startScrollLoop();
    },
    onDragMove: (e) => {
      const evt = (e.activatorEvent as PointerEvent) ?? null;
      if (evt && typeof evt.clientY === 'number') {
        mouseY.current = evt.clientY;
      }
    },
    onDragEnd: stopScrollLoop,
    onDragCancel: stopScrollLoop,
  });

  function startScrollLoop() {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(loop);
  }

  function stopScrollLoop() {
    isDragging.current = false;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }

  function loop() {
    if (!isDragging.current) return;
    const el = scrollContainerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const y = mouseY.current;
      const distFromTop = y - rect.top;
      const distFromBottom = rect.bottom - y;
      const maxSpeed = 25;
      const minSpeed = 3;
      if (distFromTop < edgeSize && distFromTop >= 0) {
        const ratio = 1 - distFromTop / edgeSize;
        el.scrollTop -= minSpeed + ratio * (maxSpeed - minSpeed);
      } else if (distFromBottom < edgeSize && distFromBottom >= 0) {
        const ratio = 1 - distFromBottom / edgeSize;
        el.scrollTop += minSpeed + ratio * (maxSpeed - minSpeed);
      }
    }
    rafId.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    // Listen on document so we get pointer position even when over drop zones
    const handleMove = (e: PointerEvent) => {
      mouseY.current = e.clientY;
    };
    document.addEventListener('pointermove', handleMove);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      stopScrollLoop();
    };
  }, []);
}
