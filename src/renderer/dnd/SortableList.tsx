import { ReactNode } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem, SortableItemRenderProps } from './SortableItem';

interface SortableListProps<T extends { id: string }> {
  items: T[];
  strategy?: 'vertical' | 'horizontal';
  renderItem: (item: T, sortable: SortableItemRenderProps) => ReactNode;
  /**
   * Optional content rendered inside the SortableContext after the items
   * (e.g., section drop placeholders, "add at end" zone).
   */
  children?: ReactNode;
}

export function SortableList<T extends { id: string }>({
  items,
  strategy = 'vertical',
  renderItem,
  children,
}: SortableListProps<T>) {
  const strategyFn =
    strategy === 'horizontal' ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <SortableContext items={items.map(i => i.id)} strategy={strategyFn}>
      {items.map(item => (
        <SortableItem key={item.id} id={item.id}>
          {sortable => renderItem(item, sortable)}
        </SortableItem>
      ))}
      {children}
    </SortableContext>
  );
}
