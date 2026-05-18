import { ReactNode, CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

export interface SortableItemRenderProps {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  isDragging: boolean;
  isOver: boolean;
  /**
   * When this item is the drop target, the side of the item where the
   * dragged item will land. `null` when this item is not the drop target.
   * Dragging downward → 'below' (other items shifted up to fill the gap);
   * dragging upward → 'above'.
   */
  dropPosition: 'above' | 'below' | null;
}

interface SortableItemProps {
  id: string;
  data?: Record<string, unknown>;
  children: (props: SortableItemRenderProps) => ReactNode;
}

export function SortableItem({ id, data, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    activeIndex,
    index,
  } = useSortable({ id, data });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    position: 'relative',
  };

  let dropPosition: 'above' | 'below' | null = null;
  if (isOver && !isDragging && activeIndex >= 0) {
    dropPosition = activeIndex < index ? 'below' : 'above';
  }

  return <>{children({ setNodeRef, style, attributes, listeners, isDragging, isOver, dropPosition })}</>;
}
