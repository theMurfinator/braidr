import { useEffect, useRef } from 'react';

/**
 * Auto-scrolls a container when dragging near its top/bottom edges.
 * @param scrollContainerRef - ref to the scrollable container element
 * @param isDragging - whether a drag operation is currently active
 * @param edgeSize - size of the scroll zone in pixels (default 80)
 */
export function useAutoScrollOnDrag(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  isDragging: boolean,
  edgeSize: number = 80,
) {
  const rafId = useRef<number | null>(null);
  const mouseY = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const handleDragOver = (e: DragEvent) => {
      mouseY.current = e.clientY;
    };

    // Listen on document so we get events even when over drop zones
    document.addEventListener('dragover', handleDragOver);

    const scrollLoop = () => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const y = mouseY.current;

      // How far into the top/bottom edge zone the cursor is
      const distFromTop = y - rect.top;
      const distFromBottom = rect.bottom - y;

      const maxSpeed = 15;
      const minSpeed = 2;

      if (distFromTop < edgeSize && distFromTop >= 0) {
        // Scroll up — faster the closer to the edge
        const ratio = 1 - distFromTop / edgeSize;
        const speed = minSpeed + ratio * (maxSpeed - minSpeed);
        el.scrollTop -= speed;
      } else if (distFromBottom < edgeSize && distFromBottom >= 0) {
        // Scroll down
        const ratio = 1 - distFromBottom / edgeSize;
        const speed = minSpeed + ratio * (maxSpeed - minSpeed);
        el.scrollTop += speed;
      }

      rafId.current = requestAnimationFrame(scrollLoop);
    };

    rafId.current = requestAnimationFrame(scrollLoop);

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [isDragging, scrollContainerRef, edgeSize]);
}
