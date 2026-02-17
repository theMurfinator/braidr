import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';

export interface WikilinkOptions {
  suggestion: Partial<SuggestionOptions>;
  onNavigate?: (targetId: string, targetType: 'note' | 'scene') => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikilink: {
      insertWikilink: (attrs: { targetId: string; targetType: 'note' | 'scene'; label: string }) => ReturnType;
    };
  }
}

export const Wikilink = Node.create<WikilinkOptions>({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      suggestion: {
        char: '[[',
        allowSpaces: true,
        pluginKey: new PluginKey('wikilinkSuggestion'),
      },
      onNavigate: undefined,
    };
  },

  addAttributes() {
    return {
      targetId: { default: '' },
      targetType: { default: 'note' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="wikilink"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            targetId: el.getAttribute('data-target-id') || '',
            targetType: el.getAttribute('data-target-type') || 'note',
            label: el.textContent || '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'wikilink',
        'data-target-id': node.attrs.targetId,
        'data-target-type': node.attrs.targetType,
        class: `wikilink wikilink-${node.attrs.targetType}`,
      }),
      node.attrs.label,
    ];
  },

  addCommands() {
    return {
      insertWikilink:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const span = document.createElement('span');
      const attrs = mergeAttributes(HTMLAttributes, {
        'data-type': 'wikilink',
        'data-target-id': node.attrs.targetId,
        'data-target-type': node.attrs.targetType,
        class: `wikilink wikilink-${node.attrs.targetType}`,
      });
      Object.entries(attrs).forEach(([key, value]) => {
        span.setAttribute(key, value as string);
      });
      span.textContent = node.attrs.label;
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => {
        this.options.onNavigate?.(node.attrs.targetId, node.attrs.targetType);
      });
      return { dom: span };
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export default Wikilink;
