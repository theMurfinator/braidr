import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';

export interface HashtagOptions {
  suggestion: Partial<SuggestionOptions>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hashtag: {
      insertHashtag: (attrs: { tag: string }) => ReturnType;
    };
  }
}

export const Hashtag = Node.create<HashtagOptions>({
  name: 'hashtag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      suggestion: {
        char: '#',
        pluginKey: new PluginKey('hashtagSuggestion'),
      },
    };
  },

  addAttributes() {
    return {
      tag: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="hashtag"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            tag: el.getAttribute('data-tag') || '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'hashtag',
        'data-tag': node.attrs.tag,
        class: 'inline-hashtag',
      }),
      `#${node.attrs.tag}`,
    ];
  },

  addCommands() {
    return {
      insertHashtag:
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
        'data-type': 'hashtag',
        'data-tag': node.attrs.tag,
        class: 'inline-hashtag',
      });
      Object.entries(attrs).forEach(([key, value]) => {
        span.setAttribute(key, value as string);
      });
      span.textContent = `#${node.attrs.tag}`;
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

export default Hashtag;
