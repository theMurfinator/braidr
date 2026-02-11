import { Editor } from '@tiptap/react';

interface TableControlsProps {
  editor: Editor;
}

export default function TableControls({ editor }: TableControlsProps) {
  if (!editor.isActive('table')) return null;

  return (
    <div className="note-table-controls">
      <button
        className="note-table-control-btn"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Add column"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        Col
      </button>
      <button
        className="note-table-control-btn"
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Add row"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        Row
      </button>
      <div className="note-table-control-divider" />
      <button
        className="note-table-control-btn note-table-control-danger"
        onClick={() => editor.chain().focus().deleteColumn().run()}
        title="Delete column"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        Col
      </button>
      <button
        className="note-table-control-btn note-table-control-danger"
        onClick={() => editor.chain().focus().deleteRow().run()}
        title="Delete row"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        Row
      </button>
      <div className="note-table-control-divider" />
      <button
        className="note-table-control-btn note-table-control-danger"
        onClick={() => editor.chain().focus().deleteTable().run()}
        title="Delete table"
      >
        Delete Table
      </button>
    </div>
  );
}
