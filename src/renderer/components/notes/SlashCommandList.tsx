import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';
import { SlashCommandItem, getSlashCommandItems } from '../../extensions/slashCommand';

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandList = forwardRef<any, SlashCommandListProps>(({ items, command }, ref) => {
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
      <div className="slash-command-list">
        <div className="slash-command-empty">No matching commands</div>
      </div>
    );
  }

  return (
    <div className="slash-command-list">
      {items.map((item, index) => (
        <button
          key={item.title}
          className={`slash-command-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => command(item)}
        >
          <span className="slash-command-icon">{item.icon}</span>
          <div className="slash-command-text">
            <span className="slash-command-title">{item.title}</span>
            <span className="slash-command-desc">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';

export function createSlashCommandSuggestion() {
  const allItems = getSlashCommandItems();

  return {
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      return allItems.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    },
    render: () => {
      let component: ReactRenderer<any> | null = null;
      let popup: Instance[] | null = null;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(SlashCommandList, {
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
    command: ({ editor, range, props }: { editor: any; range: any; props: SlashCommandItem }) => {
      editor.chain().focus().deleteRange(range).run();
      props.command(editor);
    },
  };
}
