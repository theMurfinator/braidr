import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Underline } from '@tiptap/extension-underline';

const el = document.getElementById('editor');

const editor = new Editor({
  element: el,
  editable: true,
  extensions: [
    StarterKit,
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    Underline,
  ],
  content: '',
  onUpdate({ editor }) {
    const html = editor.getHTML();
    try { window.webkit.messageHandlers.contentChanged.postMessage(html); } catch(e) {}
  },
});

window.editorAPI = {
  setContent(html) {
    editor.commands.setContent(html, false);
  },
  getContent() {
    return editor.getHTML();
  },
  focus() {
    editor.commands.focus();
  },
  blur() {
    editor.commands.blur();
  },
  setStyle({ fontFamily, fontSize, lineHeight }) {
    const el = editor.options.element.querySelector('.tiptap');
    if (!el) return;
    if (fontFamily) el.style.fontFamily = fontFamily;
    if (fontSize) el.style.fontSize = fontSize + 'px';
    if (lineHeight) el.style.lineHeight = String(lineHeight);
  },
};

try { window.webkit.messageHandlers.editorReady.postMessage(true); } catch(e) {}
