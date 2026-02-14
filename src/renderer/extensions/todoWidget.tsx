import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface TodoRow {
  id: string;
  sceneKey: string; // "characterId:sceneNumber" or empty
  sceneLabel: string; // Display label like "Noah — 3 — Intro scene"
  description: string;
  done: boolean;
}

interface SceneOption {
  key: string;   // "characterId:sceneNumber"
  label: string; // "Noah — 3 — Scene title"
}

// Strip markdown tags (#tag_name) from scene titles
function cleanSceneTitle(text: string): string {
  return text.replace(/#[a-zA-Z0-9_]+/g, '').replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '').replace(/\s+/g, ' ').trim();
}

// React component for the todo widget node view
function TodoWidgetView({ node, updateAttributes, editor }: any) {
  const [rows, setRows] = useState<TodoRow[]>(node.attrs.rows || []);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: 'sceneLabel' | 'description' } | null>(null);
  const [sceneSearch, setSceneSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get scenes and characters from editor storage
  const scenes = editor?.storage?.todoWidget?.scenes || [];
  const characters = editor?.storage?.todoWidget?.characters || [];

  // Build scene options list
  const sceneOptions: SceneOption[] = useMemo(() => {
    return scenes.map((s: any) => {
      const charName = characters.find((c: any) => c.id === s.characterId)?.name || '?';
      const title = s.title ? ` — ${cleanSceneTitle(s.title)}` : '';
      return {
        key: `${s.characterId}:${s.sceneNumber}`,
        label: `${charName} — ${s.sceneNumber}${title}`,
      };
    });
  }, [scenes, characters]);

  // Filter scene options by search
  const filteredSceneOptions = useMemo(() => {
    if (!sceneSearch.trim()) return sceneOptions;
    const q = sceneSearch.toLowerCase();
    return sceneOptions.filter(o => o.label.toLowerCase().includes(q));
  }, [sceneOptions, sceneSearch]);

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
    // Auto-focus the scene picker
    setTimeout(() => {
      setEditingCell({ rowId: newRow.id, field: 'sceneLabel' });
      setSceneSearch('');
    }, 50);
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

  const selectScene = (rowId: string, option: SceneOption) => {
    updateRows(rows.map(r => r.id === rowId ? { ...r, sceneKey: option.key, sceneLabel: option.label } : r));
    setEditingCell(null);
    setSceneSearch('');
  };

  const clearScene = (rowId: string) => {
    updateRows(rows.map(r => r.id === rowId ? { ...r, sceneKey: '', sceneLabel: '' } : r));
  };

  const handleCellClick = (rowId: string, field: 'sceneLabel' | 'description') => {
    setEditingCell({ rowId, field });
    if (field === 'sceneLabel') {
      setSceneSearch('');
    }
  };

  const handleCellBlur = (e: React.FocusEvent) => {
    // Don't blur if clicking within the dropdown
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget && dropdownRef.current?.contains(relatedTarget)) return;
    // Small delay to allow click on dropdown option
    setTimeout(() => setEditingCell(null), 150);
  };

  const handleDescBlur = () => {
    setEditingCell(null);
  };

  const handleDescKeyDown = (e: React.KeyboardEvent, rowId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Move to next row's scene label, or add a new row
      const idx = rows.findIndex(r => r.id === rowId);
      if (idx < rows.length - 1) {
        setEditingCell({ rowId: rows[idx + 1].id, field: 'sceneLabel' });
        setSceneSearch('');
      } else {
        addRow();
      }
    }
  };

  const handleSceneKeyDown = (e: React.KeyboardEvent, rowId: string) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
      setSceneSearch('');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setEditingCell({ rowId, field: 'description' });
      setSceneSearch('');
    } else if (e.key === 'Enter' && filteredSceneOptions.length > 0) {
      e.preventDefault();
      selectScene(rowId, filteredSceneOptions[0]);
    }
  };

  useEffect(() => {
    if (editingCell?.field === 'description' && inputRef.current) {
      inputRef.current.focus();
    }
    if (editingCell?.field === 'sceneLabel' && sceneInputRef.current) {
      sceneInputRef.current.focus();
      // Compute dropdown position from the input's bounding rect
      const rect = sceneInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 280) });
    } else if (!editingCell || editingCell.field !== 'sceneLabel') {
      setDropdownPos(null);
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
                onClick={() => {
                  if (!(editingCell?.rowId === row.id && editingCell.field === 'sceneLabel')) {
                    handleCellClick(row.id, 'sceneLabel');
                  }
                }}
              >
                {editingCell?.rowId === row.id && editingCell.field === 'sceneLabel' ? (
                  <div className="todo-widget-scene-picker">
                    <input
                      ref={sceneInputRef}
                      className="todo-widget-cell-input"
                      value={sceneSearch}
                      placeholder="Search scenes…"
                      onChange={e => setSceneSearch(e.target.value)}
                      onBlur={handleCellBlur}
                      onKeyDown={e => handleSceneKeyDown(e, row.id)}
                    />
                    {dropdownPos && createPortal(
                      <div
                        className="todo-widget-scene-dropdown"
                        ref={dropdownRef}
                        style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
                      >
                        {filteredSceneOptions.length > 0 ? (
                          filteredSceneOptions.slice(0, 12).map(opt => (
                            <button
                              key={opt.key}
                              className={`todo-widget-scene-option ${opt.key === row.sceneKey ? 'selected' : ''}`}
                              onMouseDown={e => { e.preventDefault(); selectScene(row.id, opt); }}
                            >
                              {opt.label}
                            </button>
                          ))
                        ) : (
                          <div className="todo-widget-scene-empty">No scenes found</div>
                        )}
                      </div>,
                      document.body
                    )}
                  </div>
                ) : (
                  <span className={`todo-widget-cell-display ${!row.sceneLabel ? 'placeholder' : ''}`}>
                    {row.sceneLabel || 'Select scene…'}
                    {row.sceneLabel && (
                      <button
                        className="todo-widget-scene-clear"
                        onClick={e => { e.stopPropagation(); clearScene(row.id); }}
                        title="Clear scene"
                      >
                        ×
                      </button>
                    )}
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
                    onBlur={handleDescBlur}
                    onKeyDown={e => handleDescKeyDown(e, row.id)}
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

  addStorage() {
    return {
      scenes: [] as any[],
      characters: [] as any[],
    };
  },

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
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'todoWidget' })];
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
