import { Editor } from '@tiptap/react';

interface NoteToolbarProps {
  editor: Editor | null;
  onInsertImage?: () => void;
}

export default function NoteToolbar({ editor, onInsertImage }: NoteToolbarProps) {
  if (!editor) return null;

  const btn = (
    label: string,
    isActive: boolean,
    onClick: () => void,
    title?: string
  ) => (
    <button
      className={`note-toolbar-btn ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title={title || label}
    >
      {label}
    </button>
  );

  return (
    <div className="note-toolbar">
      {/* Text formatting */}
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
      {btn('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Strikethrough')}

      <div className="note-toolbar-divider" />

      {/* Headings */}
      {btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'Heading 1')}
      {btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading 2')}
      {btn('H3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Heading 3')}

      <div className="note-toolbar-divider" />

      {/* Lists */}
      <button
        className={`note-toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="3" cy="4" r="1.5" fill="currentColor"/><circle cx="3" cy="8" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><path d="M7 4h7M7 8h7M7 12h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
      </button>
      <button
        className={`note-toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="1.5" y="5.5" fontSize="5" fontWeight="700" fill="currentColor">1</text><text x="1.5" y="9.5" fontSize="5" fontWeight="700" fill="currentColor">2</text><text x="1.5" y="13.5" fontSize="5" fontWeight="700" fill="currentColor">3</text><path d="M7 4h7M7 8h7M7 12h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
      </button>
      <button
        className={`note-toolbar-btn ${editor.isActive('taskList') ? 'active' : ''}`}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        title="Task List"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M2.5 4.5l1 1 2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/><rect x="1.5" y="9.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M8 4.5h6M8 11.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
      </button>

      <div className="note-toolbar-divider" />

      {/* Blocks */}
      <button
        className={`note-toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M7 5h7M7 8h5M7 11h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
      </button>
      <button
        className={`note-toolbar-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code Block"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 4L1.5 8 5 12M11 4l3.5 4-3.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <button
        className="note-toolbar-btn"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>

      <div className="note-toolbar-divider" />

      {/* Insert */}
      <button
        className="note-toolbar-btn"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insert Table"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 6h13M1.5 10h13M6 2.5v11M10.5 2.5v11" stroke="currentColor" strokeWidth="1"/></svg>
      </button>
      <button
        className="note-toolbar-btn"
        onClick={() => (editor as any).chain().focus().insertColumns(2).run()}
        title="2 Columns"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2" width="5.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="9" y="2" width="5.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
      </button>
      <button
        className="note-toolbar-btn"
        onClick={() => (editor as any).chain().focus().insertColumns(3).run()}
        title="3 Columns"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="3.5" height="12" rx="0.8" stroke="currentColor" strokeWidth="1" fill="none"/><rect x="6.25" y="2" width="3.5" height="12" rx="0.8" stroke="currentColor" strokeWidth="1" fill="none"/><rect x="11.5" y="2" width="3.5" height="12" rx="0.8" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
      </button>
      {onInsertImage && (
        <button
          className="note-toolbar-btn"
          onClick={onInsertImage}
          title="Insert Image"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1"/><path d="M1.5 11l3.5-3.5 2.5 2.5 2-1.5L14.5 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}
    </div>
  );
}
