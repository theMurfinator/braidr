import { ReactNode, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragCancelEvent,
  DragOverEvent,
  DragOverlay,
  closestCenter,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { useSortableSensors } from './useSortableSensors';

export type { DragOverEvent };

interface SortableAreaProps {
  /**
   * Fires when a drag completes successfully (drop on a valid target that is
   * not the same item). `activeId` is the dragged item; `overId` is the drop
   * target item or droppable zone. `activeData` and `overData` carry the
   * custom data attached to the draggable/droppable via `useSortable({ data })`.
   */
  onDragEnd: (event: { activeId: string; overId: string; activeData?: Record<string, unknown>; overData?: Record<string, unknown> }) => void;
  /**
   * Fires continuously as the dragged item moves over a new target.
   * Use this to update container membership for cross-container drag.
   */
  onDragOver?: (event: DragOverEvent) => void;
  /**
   * Render the floating preview that follows the cursor during drag.
   * Receives the active drag id; consumer looks up the item and returns JSX.
   */
  renderDragOverlay?: (activeId: string) => ReactNode;
  children: ReactNode;
}

export function SortableArea({ onDragEnd, onDragOver, renderDragOverlay, children }: SortableAreaProps) {
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.id !== e.over.id) {
      onDragEnd({
        activeId: String(e.active.id),
        overId: String(e.over.id),
        activeData: e.active.data.current as Record<string, unknown> | undefined,
        overData: e.over.data.current as Record<string, unknown> | undefined,
      });
    }
  };

  const handleDragCancel = (_e: DragCancelEvent) => {
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay>
        {activeId && renderDragOverlay ? renderDragOverlay(String(activeId)) : null}
      </DragOverlay>
    </DndContext>
  );
}
