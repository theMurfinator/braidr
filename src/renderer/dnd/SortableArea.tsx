import { ReactNode, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragCancelEvent,
  DragOverlay,
  closestCenter,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { useSortableSensors } from './useSortableSensors';

interface SortableAreaProps {
  /**
   * Fires when a drag completes successfully (drop on a valid target that is
   * not the same item). `activeId` is the dragged item; `overId` is the drop
   * target item or droppable zone.
   */
  onDragEnd: (event: { activeId: string; overId: string }) => void;
  /**
   * Render the floating preview that follows the cursor during drag.
   * Receives the active drag id; consumer looks up the item and returns JSX.
   */
  renderDragOverlay?: (activeId: string) => ReactNode;
  children: ReactNode;
}

export function SortableArea({ onDragEnd, renderDragOverlay, children }: SortableAreaProps) {
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.id !== e.over.id) {
      onDragEnd({ activeId: String(e.active.id), overId: String(e.over.id) });
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
