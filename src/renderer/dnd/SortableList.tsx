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
  children: (item: T, sortable: SortableItemRenderProps) => ReactNode;
}

export function SortableList<T extends { id: string }>({
  items,
  strategy = 'vertical',
  children,
}: SortableListProps<T>) {
  const strategyFn =
    strategy === 'horizontal' ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <SortableContext items={items.map(i => i.id)} strategy={strategyFn}>
      {items.map(item => (
        <SortableItem key={item.id} id={item.id}>
          {sortable => children(item, sortable)}
        </SortableItem>
      ))}
    </SortableContext>
  );
}
