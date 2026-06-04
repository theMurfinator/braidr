import { useState, useRef, useCallback } from 'react';

interface Opts { min?: number; max?: number; }

/**
 * Width state for a right-docked panel resized via a handle on its LEFT edge.
 * Dragging the handle left widens the panel; the width persists to localStorage.
 */
export function useResizableWidth(storageKey: string, defaultWidth: number, opts: Opts = {}) {
  const min = opts.min ?? 180;
  const max = opts.max ?? 640;
  const clamp = (w: number) => Math.min(max, Math.max(min, w));
  const [width, setWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(storageKey) || '', 10);
    return Number.isFinite(saved) && saved > 0 ? clamp(saved) : defaultWidth;
  });
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      const dx = ev.clientX - drag.current.startX;
      setWidth(clamp(drag.current.startW - dx)); // left-edge handle: drag left → wider
    };
    const onUp = () => {
      drag.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setWidth(w => { localStorage.setItem(storageKey, String(w)); return w; });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [width, min, max, storageKey]);

  return { width, onPointerDown };
}
