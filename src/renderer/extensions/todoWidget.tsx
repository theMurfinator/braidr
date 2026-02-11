import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useCallback, useEffect, useRef } from 'react';

export interface TodoRow {
  id: string;
  sceneKey: string; // "characterId:sceneNumber" or empty
  sceneLabel: string; // Display label like "Noah — Scene 3"
  description: string;
  done: boolean;
}

// React component for the todo widget node view
function TodoWidgetView({ node, updateAttributes }: any) {
  const [rows, setRows] = useState<TodoRow[]>(node.attrs.rows || []);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: 'sceneLabel' | 'description' } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from node attrs when they change externally
  useEffect(() => {
    setRows(node.attrs.rows || []);
  }, [node.attrs.rows]);

  const updateRows = useCallback((newRows: TodoRow[]) => {
    setRows(newRows);
    updateAttributes({ rows: newRows });
  }, [updateAttributes]);

  const addRow = () => {
    const newRow: TodoRow = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sceneKey: '',
      sceneLabel: '',
      description: '',
      done: false,
    };
    updateRows([...rows, newRow]);
    // Auto-focus the scene label cell
    setTimeout(() => setEditingCell({ rowId: newRow.id, field: 'sceneLabel' }), 50);
  };

  const removeRow = (id: string) => {
    updateRows(rows.filter(r => r.id !== id));
  };

  const toggleDone = (id: string) => {
    updateRows(rows.map(r => r.id === id ? { ...r, done: !r.done } : r));
  };

  const updateField = (id: string, field: keyof TodoRow, value: string | boolean) => {
    updateRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleCellClick = (rowId: string, field: 'sceneLabel' | 'description') => {
    setEditingCell({ rowId, field });
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, rowId: string, field: 'sceneLabel' | 'description') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (field === 'sceneLabel') {
        setEditingCell({ rowId, field: 'description' });
      } else {
        // Move to next row's scene label, or add a new row
        const idx = rows.findIndex(r => r.id === rowId);
        if (idx < rows.length - 1) {
          setEditingCell({ rowId: rows[idx + 1].id, field: 'sceneLabel' });
        } else {
          addRow();
        }
      }
    }
  };

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  return (
    <NodeViewWrapper className="todo-widget" contentEditable={false}>
      <div className="todo-widget-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
        <span className="todo-widget-title">Changes Tracker</span>
        <span className="todo-widget-count">
          {rows.filter(r => r.done).length}/{rows.length}
        </span>
      </div>
      <table className="todo-widget-table">
        <thead>
          <tr>
            <th className="todo-widget-th-num">#</th>
            <th className="todo-widget-th-done"></th>
            <th className="todo-widget-th-scene">Scene</th>
            <th className="todo-widget-th-desc">Changes Needed</th>
            <th className="todo-widget-th-actions"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={`todo-widget-row ${row.done ? 'done' : ''}`}>
              <td className="todo-widget-num">{i + 1}</td>
              <td className="todo-widget-checkbox-cell">
                <input
                  type="checkbox"
                  checked={row.done}
                  onChange={() => toggleDone(row.id)}
                  className="todo-widget-checkbox"
                />
              </td>
              <td
                className="todo-widget-scene-cell"
                onClick={() => handleCellClick(row.id, 'sceneLabel')}
              >
                {editingCell?.rowId === row.id && editingCell.field === 'sceneLabel' ? (
                  <input
                    ref={editingCell?.rowId === row.id && editingCell.field === 'sceneLabel' ? inputRef : null}
                    className="todo-widget-cell-input"
                    value={row.sceneLabel}
                    placeholder="e.g. Noah — Scene 3"
                    onChange={e => updateField(row.id, 'sceneLabel', e.target.value)}
                    onBlur={handleCellBlur}
                    onKeyDown={e => handleCellKeyDown(e, row.id, 'sceneLabel')}
                  />
                ) : (
                  <span className={`todo-widget-cell-display ${!row.sceneLabel ? 'placeholder' : ''}`}>
                    {row.sceneLabel || 'Click to set scene…'}
                  </span>
                )}
              </td>
              <td
                className="todo-widget-desc-cell"
                onClick={() => handleCellClick(row.id, 'description')}
              >
                {editingCell?.rowId === row.id && editingCell.field === 'description' ? (
                  <input
                    ref={editingCell?.rowId === row.id && editingCell.field === 'description' ? inputRef : null}
                    className="todo-widget-cell-input"
                    value={row.description}
                    placeholder="Describe the change needed…"
                    onChange={e => updateField(row.id, 'description', e.target.value)}
                    onBlur={handleCellBlur}
                    onKeyDown={e => handleCellKeyDown(e, row.id, 'description')}
                  />
                ) : (
                  <span className={`todo-widget-cell-display ${!row.description ? 'placeholder' : ''}`}>
                    {row.description || 'Click to describe…'}
                  </span>
                )}
              </td>
              <td className="todo-widget-actions-cell">
                <button className="todo-widget-remove-btn" onClick={() => removeRow(row.id)} title="Remove row">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="todo-widget-add-btn" onClick={addRow}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        Add row
      </button>
    </NodeViewWrapper>
  );
}

export const TodoWidget = Node.create({
  name: 'todoWidget',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      rows: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          try {
            return JSON.parse(element.getAttribute('data-rows') || '[]');
          } catch {
            return [];
          }
        },
        renderHTML: (attributes: any) => ({
          'data-rows': JSON.stringify(attributes.rows),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="todoWidget"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'todoWidget' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TodoWidgetView);
  },

  addCommands() {
    return {
      insertTodoWidget:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              rows: [],
            },
          });
        },
    } as any;
  },
});
