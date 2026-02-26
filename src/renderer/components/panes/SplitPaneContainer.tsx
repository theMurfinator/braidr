import { useRef, useCallback } from 'react';
import { SplitPane } from '../../../shared/paneTypes';
import { usePaneContext } from './PaneContext';
import PaneNode from './PaneNode';

interface SplitPaneContainerProps {
  pane: SplitPane;
}

export default function SplitPaneContainer({ pane }: SplitPaneContainerProps) {
  const { dispatch } = usePaneContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = pane.direction === 'horizontal' ? 'col-resize' : 'row-resize';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let ratio: number;
      if (pane.direction === 'horizontal') {
        ratio = (moveEvent.clientX - rect.left) / rect.width;
      } else {
        ratio = (moveEvent.clientY - rect.top) / rect.height;
      }
      // Clamp between 15% and 85%
      ratio = Math.max(0.15, Math.min(0.85, ratio));
      dispatch({ type: 'SET_SPLIT_RATIO', paneId: pane.id, ratio });
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [pane.id, pane.direction, dispatch]);

  const isHorizontal = pane.direction === 'horizontal';
  const firstSize = `${pane.splitRatio * 100}%`;
  const secondSize = `${(1 - pane.splitRatio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={`split-pane-container ${isHorizontal ? 'horizontal' : 'vertical'}`}
    >
      <div className="split-pane-child" style={isHorizontal ? { width: firstSize } : { height: firstSize }}>
        <PaneNode node={pane.children[0]} />
      </div>
      <div
        className={`pane-resize-handle ${isHorizontal ? 'horizontal' : 'vertical'}`}
        onMouseDown={handleMouseDown}
      />
      <div className="split-pane-child" style={isHorizontal ? { width: secondSize } : { height: secondSize }}>
        <PaneNode node={pane.children[1]} />
      </div>
    </div>
  );
}
