import { Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';

interface TableContextMenuProps {
  editor: Editor;
  x: number;
  y: number;
  onClose: () => void;
}

const ROW_COLORS = [
  { name: 'None', value: '' },
  { name: 'Light Red', value: 'rgba(255, 200, 200, 0.35)' },
  { name: 'Light Orange', value: 'rgba(255, 224, 178, 0.4)' },
  { name: 'Light Yellow', value: 'rgba(255, 249, 196, 0.4)' },
  { name: 'Light Green', value: 'rgba(200, 240, 200, 0.35)' },
  { name: 'Light Blue', value: 'rgba(187, 222, 251, 0.35)' },
  { name: 'Light Purple', value: 'rgba(225, 190, 231, 0.3)' },
  { name: 'Light Gray', value: 'rgba(0, 0, 0, 0.04)' },
];

export default function TableContextMenu({ editor, x, y, onClose }: TableContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  };

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const setRowColor = (color: string) => {
    // Get the current selection and find the table row
    const { state } = editor;
    const { $from } = state.selection;

    // Walk up to find the tableRow node
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === 'tableRow') {
        const pos = $from.before(depth);
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              backgroundColor: color || null,
            });
            return true;
          })
          .run();
        break;
      }
    }
    onClose();
  };

  return (
    <div ref={menuRef} className="table-context-menu" style={style}>
      <button className="table-context-item" onClick={() => run(() => editor.chain().focus().addRowBefore().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        Insert Row Above
      </button>
      <button className="table-context-item" onClick={() => run(() => editor.chain().focus().addRowAfter().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
        Insert Row Below
      </button>
      <div className="table-context-divider" />
      <button className="table-context-item" onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Insert Column Left
      </button>
      <button className="table-context-item" onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 19l7-7-7-7"/></svg>
        Insert Column Right
      </button>
      <div className="table-context-divider" />
      <div className="table-context-submenu">
        <div className="table-context-label">Row Color</div>
        <div className="table-context-colors">
          {ROW_COLORS.map((c) => (
            <button
              key={c.name}
              className="table-context-color-swatch"
              title={c.name}
              style={{ background: c.value || 'var(--bg-primary)', border: c.value ? 'none' : '1px solid var(--border)' }}
              onClick={() => setRowColor(c.value)}
            >
              {!c.value && (
                <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="9" x2="9" y2="1" stroke="var(--text-muted)" strokeWidth="1.2"/></svg>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="table-context-divider" />
      <button className="table-context-item table-context-danger" onClick={() => run(() => editor.chain().focus().deleteRow().run())}>
        Delete Row
      </button>
      <button className="table-context-item table-context-danger" onClick={() => run(() => editor.chain().focus().deleteColumn().run())}>
        Delete Column
      </button>
      <button className="table-context-item table-context-danger" onClick={() => run(() => editor.chain().focus().deleteTable().run())}>
        Delete Table
      </button>
    </div>
  );
}
