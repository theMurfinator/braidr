import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

export interface WikilinkSuggestionItem {
  id: string;
  label: string;
  type: 'note' | 'scene';
  description?: string;
}

interface WikilinkListProps {
  items: WikilinkSuggestionItem[];
  command: (item: WikilinkSuggestionItem) => void;
}

export const WikilinkList = forwardRef<any, WikilinkListProps>(({ items, command }, ref) => {
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
    return (
      <div className="wikilink-suggestion-list">
        <div className="wikilink-suggestion-empty">No results</div>
      </div>
    );
  }

  // Group by type
  const noteItems = items.filter(i => i.type === 'note');
  const sceneItems = items.filter(i => i.type === 'scene');

  let globalIndex = -1;

  return (
    <div className="wikilink-suggestion-list">
      {noteItems.length > 0 && (
        <>
          <div className="wikilink-suggestion-section">Notes</div>
          {noteItems.map((item) => {
            globalIndex++;
            const idx = globalIndex;
            return (
              <button
                key={`note-${item.id}`}
                className={`wikilink-suggestion-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => command(item)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="wikilink-suggestion-icon">
                  <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M5.5 5.5h5M5.5 8h3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                <span className="wikilink-suggestion-label">{item.label}</span>
              </button>
            );
          })}
        </>
      )}
      {sceneItems.length > 0 && (
        <>
          <div className="wikilink-suggestion-section">Scenes</div>
          {sceneItems.map((item) => {
            globalIndex++;
            const idx = globalIndex;
            return (
              <button
                key={`scene-${item.id}`}
                className={`wikilink-suggestion-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => command(item)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="wikilink-suggestion-icon">
                  <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M2 6h12" stroke="currentColor" strokeWidth="1"/>
                </svg>
                <span className="wikilink-suggestion-label">{item.label}</span>
                {item.description && <span className="wikilink-suggestion-desc">{item.description}</span>}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
});

WikilinkList.displayName = 'WikilinkList';

export function createWikilinkSuggestion(
  getItems: (query: string) => WikilinkSuggestionItem[]
) {
  return {
    char: '[[',
    items: ({ query }: { query: string }) => getItems(query),
    render: () => {
      let component: ReactRenderer<any> | null = null;
      let popup: Instance[] | null = null;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(WikilinkList, {
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
    command: ({ editor, range, props }: { editor: any; range: any; props: WikilinkSuggestionItem }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertWikilink({
          targetId: props.id,
          targetType: props.type,
          label: props.label,
        })
        .run();
    },
  };
}
