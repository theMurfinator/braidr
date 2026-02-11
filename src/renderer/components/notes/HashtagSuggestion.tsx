import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

export interface HashtagSuggestionItem {
  name: string;
  category?: string;
}

interface HashtagListProps {
  items: HashtagSuggestionItem[];
  command: (item: HashtagSuggestionItem) => void;
}

export const HashtagList = forwardRef<any, HashtagListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="hashtag-suggestion-list">
      {items.map((item, i) => (
        <button
          key={item.name}
          className={`hashtag-suggestion-item ${i === selectedIndex ? 'selected' : ''}`}
          onClick={() => command(item)}
        >
          <span className={`hashtag-suggestion-category ${item.category || ''}`}>
            {item.category || 'tag'}
          </span>
          <span className="hashtag-suggestion-label">#{item.name}</span>
        </button>
      ))}
    </div>
  );
});

HashtagList.displayName = 'HashtagList';

export function createHashtagSuggestion(
  getItems: (query: string) => HashtagSuggestionItem[]
) {
  return {
    char: '#',
    items: ({ query }: { query: string }) => getItems(query),
    render: () => {
      let component: ReactRenderer<any> | null = null;
      let popup: Instance[] | null = null;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(HashtagList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          });
        },

        onUpdate(props: any) {
          component?.updateProps(props);
          if (popup && props.clientRect) {
            popup[0]?.setProps({
              getReferenceClientRect: props.clientRect,
            });
          }
        },

        onKeyDown(props: any) {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          return (component?.ref as any)?.onKeyDown(props);
        },

        onExit() {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
    command: ({ editor, range, props }: { editor: any; range: any; props: HashtagSuggestionItem }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertHashtag({ tag: props.name })
        .run();
    },
  };
}
