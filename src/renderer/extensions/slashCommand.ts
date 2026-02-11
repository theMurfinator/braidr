import { Extension } from '@tiptap/core';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  command: (editor: any) => void;
}

export interface SlashCommandOptions {
  suggestion: Partial<SuggestionOptions>;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: new PluginKey('slashCommandSuggestion'),
        startOfLine: false,
      },
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

export function getSlashCommandItems(): SlashCommandItem[] {
  return [
    {
      title: 'Heading 1',
      description: 'Large section heading',
      icon: 'H1',
      command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: 'H2',
      command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: 'H3',
      command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: 'Table',
      description: 'Insert a 3x3 table',
      icon: 'TBL',
      command: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: '2 Columns',
      description: 'Side-by-side content blocks',
      icon: '||',
      command: (editor) => editor.chain().focus().insertColumns(2).run(),
    },
    {
      title: '3 Columns',
      description: 'Three content blocks',
      icon: '|||',
      command: (editor) => editor.chain().focus().insertColumns(3).run(),
    },
    {
      title: 'Divider',
      description: 'Horizontal separator',
      icon: '—',
      command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      title: 'Bullet List',
      description: 'Unordered bullet list',
      icon: '•',
      command: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: 'Ordered List',
      description: 'Numbered list',
      icon: '1.',
      command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: 'Task List',
      description: 'Checklist with checkboxes',
      icon: '☑',
      command: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      title: 'Blockquote',
      description: 'Quote block',
      icon: '"',
      command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: 'Code Block',
      description: 'Code snippet',
      icon: '<>',
      command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      title: 'Image',
      description: 'Insert an image from file',
      icon: '🖼',
      command: () => {
        // Dispatch custom event — NoteEditor listens for this
        window.dispatchEvent(new CustomEvent('braidr-insert-image'));
      },
    },
    {
      title: 'Changes Tracker',
      description: 'Track scene changes needed',
      icon: '✓',
      command: (editor) => editor.chain().focus().insertTodoWidget().run(),
    },
  ];
}

export default SlashCommand;
