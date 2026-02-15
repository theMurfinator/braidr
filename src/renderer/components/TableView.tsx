import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Scene, Character, MetadataFieldDef, Tag, TableViewConfig } from '../../shared/types';

type FilterOperator = 'is' | 'is_not' | 'is_blank' | 'is_not_blank' | 'contains';

interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

interface TableViewProps {
  scenes: Scene[];
  characters: Character[];
  metadataFieldDefs: MetadataFieldDef[];
  sceneMetadata: Record<string, Record<string, string | string[]>>;
  tags: Tag[];
  tableViews: TableViewConfig[];
  plotPoints: any[];
  characterColors: Record<string, string>;
  onSceneClick: (sceneKey: string) => void;
  onMetadataChange: (sceneKey: string, fieldId: string, value: string | string[]) => void;
  onWordCountChange: (sceneId: string, wordCount: number | undefined) => void;
  onTableViewsChange: (views: TableViewConfig[]) => void;
  onSceneChange?: (sceneId: string, content: string, notes: string[]) => void;
}

type SortField = 'scene' | 'character' | 'status' | 'words' | 'plotPoint' | string;
type SortDirection = 'asc' | 'desc';

function getSceneKey(scene: Scene): string {
  return `${scene.characterId}:${scene.sceneNumber}`;
}

function cleanContent(text: string): string {
  return text
    .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
}

function extractShortTitle(content: string): string {
  // Try to extract highlighted title: ==**...**==
  const match = content.match(/==\*\*(.+?)\*\*==/);
  if (match) return match[1].replace(/#[a-zA-Z0-9_]+/g, '').trim();
  // Fall back to cleaned first portion
  const cleaned = cleanContent(content);
  if (cleaned.length > 60) return cleaned.substring(0, 57).trim() + '\u2026';
  return cleaned;
}

export default function TableView({
  scenes,
  characters,
  metadataFieldDefs,
  sceneMetadata,
  tags,
  tableViews: _tableViews,
  plotPoints,
  characterColors,
  onSceneClick,
  onMetadataChange,
  onWordCountChange,
  onTableViewsChange: _onTableViewsChange,
  onSceneChange,
}: TableViewProps) {
  // Use localStorage for now instead of props
  const [savedViews, setSavedViews] = useState<TableViewConfig[]>(() => {
    const saved = localStorage.getItem('table-saved-views');
    return saved ? JSON.parse(saved) : [];
  });

  const [currentViewId, setCurrentViewId] = useState<string | null>(() => {
    const saved = localStorage.getItem('table-current-view');
    return saved || null;
  });

  const [sortField, setSortField] = useState<SortField>('scene');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingCell, setEditingCell] = useState<{ sceneKey: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showNewViewDialog, setShowNewViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('table-visible-columns');
    return saved ? new Set(JSON.parse(saved)) : new Set(['scene', 'character', 'status', 'words', 'plotPoint']);
  });

  // Column widths and order
  const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    scene: 280,
    character: 140,
    status: 130,
    words: 100,
    plotPoint: 160,
    synopsis: 200,
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('table-column-widths');
    return saved ? { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) } : { ...DEFAULT_COLUMN_WIDTHS };
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('table-column-order');
    return saved ? JSON.parse(saved) : ['scene', 'character', 'status', 'words', 'plotPoint'];
  });

  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Get status field definition
  const statusField = metadataFieldDefs.find(f => f.id === '_status');
  const statusOptions = statusField ? (statusField.options || []) : [];

  // Helper to get a scene's field value as a string for filtering
  const getFieldValue = useCallback((scene: Scene, fieldId: string): string => {
    const sceneKey = getSceneKey(scene);
    const metadata = sceneMetadata[sceneKey] || {};

    if (fieldId === 'character') {
      return characters.find(c => c.id === scene.characterId)?.name || '';
    }
    if (fieldId === 'status') {
      return (metadata['_status'] as string) || '';
    }
    if (fieldId === 'plotPoint') {
      const pp = plotPoints.find(p => p.id === scene.plotPointId);
      return pp?.title || '';
    }
    if (fieldId === 'words') {
      return scene.wordCount?.toString() || '';
    }
    if (fieldId === 'synopsis') {
      const note = scene.notes.length > 0 ? scene.notes[0] : '';
      return note.replace(/<[^>]*>/g, '').trim();
    }
    if (fieldId === 'scene') {
      return cleanContent(scene.content);
    }
    // Custom metadata
    const val = metadata[fieldId];
    if (Array.isArray(val)) return val.join(', ');
    return (val as string) || '';
  }, [characters, sceneMetadata, plotPoints]);

  // Filter and sort scenes
  const sortedScenes = useMemo(() => {
    let filtered = [...scenes].filter(s => s.timelinePosition !== null);

    // Apply filter rules
    for (const rule of filterRules) {
      filtered = filtered.filter(scene => {
        const val = getFieldValue(scene, rule.field);
        switch (rule.operator) {
          case 'is':
            return val.toLowerCase() === rule.value.toLowerCase();
          case 'is_not':
            return val.toLowerCase() !== rule.value.toLowerCase();
          case 'is_blank':
            return !val || val === '—';
          case 'is_not_blank':
            return !!val && val !== '—';
          case 'contains':
            return val.toLowerCase().includes(rule.value.toLowerCase());
          default:
            return true;
        }
      });
    }

    const sorted = filtered;

    sorted.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortField === 'scene') {
        aVal = a.timelinePosition ?? 0;
        bVal = b.timelinePosition ?? 0;
      } else if (sortField === 'character') {
        aVal = characters.find(c => c.id === a.characterId)?.name || '';
        bVal = characters.find(c => c.id === b.characterId)?.name || '';
      } else if (sortField === 'status') {
        const aKey = getSceneKey(a);
        const bKey = getSceneKey(b);
        aVal = sceneMetadata[aKey]?.['_status'] as string || '';
        bVal = sceneMetadata[bKey]?.['_status'] as string || '';
      } else if (sortField === 'words') {
        aVal = a.wordCount ?? 0;
        bVal = b.wordCount ?? 0;
      } else if (sortField === 'plotPoint') {
        aVal = a.plotPoint || '';
        bVal = b.plotPoint || '';
      } else {
        // Custom metadata field
        const aKey = getSceneKey(a);
        const bKey = getSceneKey(b);
        aVal = sceneMetadata[aKey]?.[sortField] as string || '';
        bVal = sceneMetadata[bKey]?.[sortField] as string || '';
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [scenes, sortField, sortDirection, characters, sceneMetadata, filterRules, getFieldValue]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleCellEdit = (sceneKey: string, field: string, currentValue: string) => {
    setEditingCell({ sceneKey, field });
    setEditValue(currentValue);
  };

  const handleCellSave = () => {
    if (!editingCell) return;

    const scene = scenes.find(s => getSceneKey(s) === editingCell.sceneKey);
    if (!scene) return;

    if (editingCell.field === 'words') {
      const val = editValue.trim() === '' ? undefined : parseInt(editValue, 10);
      if (!isNaN(val as number) || val === undefined) {
        onWordCountChange(scene.id, val);
      }
    } else {
      onMetadataChange(editingCell.sceneKey, editingCell.field, editValue);
    }

    setEditingCell(null);
    setEditValue('');
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Persist visible columns
  useEffect(() => {
    localStorage.setItem('table-visible-columns', JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns]);

  // Persist saved views
  useEffect(() => {
    localStorage.setItem('table-saved-views', JSON.stringify(savedViews));
  }, [savedViews]);

  // Persist current view
  useEffect(() => {
    if (currentViewId) {
      localStorage.setItem('table-current-view', currentViewId);
    } else {
      localStorage.removeItem('table-current-view');
    }
  }, [currentViewId]);

  // Persist column widths and order
  useEffect(() => {
    localStorage.setItem('table-column-widths', JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    localStorage.setItem('table-column-order', JSON.stringify(columnOrder));
  }, [columnOrder]);

  // Column resize handlers
  const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnId);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnId] || 150;
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(100, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  // Column drag handlers
  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    setDraggedColumn(columnId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (draggedColumn && draggedColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleColumnDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetColumnId) return;

    const newOrder = [...columnOrder];
    const draggedIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(targetColumnId);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedColumn);

    setColumnOrder(newOrder);
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const handleColumnDragEnd = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  // View management functions
  const saveCurrentView = () => {
    if (!newViewName.trim()) return;

    const newView: TableViewConfig = {
      id: Date.now().toString(),
      name: newViewName.trim(),
      visibleColumns: Array.from(visibleColumns),
      sortField,
      sortDirection,
      filterCharacter,
      filterTags: Array.from(filterTags),
      createdAt: Date.now(),
    };

    setSavedViews(prev => [...prev, newView]);
    setNewViewName('');
    setShowNewViewDialog(false);
    setCurrentViewId(newView.id);
  };

  const loadView = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (!view) return;

    setVisibleColumns(new Set(view.visibleColumns));
    setSortField(view.sortField as SortField);
    setSortDirection(view.sortDirection);
    setFilterCharacter(view.filterCharacter);
    setFilterTags(new Set(view.filterTags));
    setCurrentViewId(viewId);
    setShowViewMenu(false);
  };

  const deleteView = (viewId: string) => {
    setSavedViews(prev => prev.filter(v => v.id !== viewId));
    if (currentViewId === viewId) {
      setCurrentViewId(null);
    }
  };

  const resetToDefault = () => {
    setVisibleColumns(new Set(['scene', 'character', 'status', 'words', 'plotPoint']));
    setSortField('scene');
    setSortDirection('asc');
    setFilterRules([]);
    setCurrentViewId(null);
    setShowViewMenu(false);
  };

  // Filter builder helpers
  const addFilterRule = () => {
    setFilterRules(prev => [...prev, {
      id: Date.now().toString(),
      field: 'character',
      operator: 'is',
      value: '',
    }]);
  };

  const updateFilterRule = (id: string, updates: Partial<FilterRule>) => {
    setFilterRules(prev => prev.map(r =>
      r.id === id ? { ...r, ...updates } : r
    ));
  };

  const removeFilterRule = (id: string) => {
    setFilterRules(prev => prev.filter(r => r.id !== id));
  };

  // Get possible values for a field (for the value dropdown)
  const getFieldOptions = useCallback((fieldId: string): string[] => {
    if (fieldId === 'character') {
      return characters.map(c => c.name);
    }
    if (fieldId === 'status') {
      return statusOptions;
    }
    if (fieldId === 'plotPoint') {
      return [...new Set(plotPoints.map(pp => pp.title))];
    }
    // Custom metadata dropdown/multiselect
    const fieldDef = metadataFieldDefs.find(f => f.id === fieldId);
    if (fieldDef?.options) {
      return fieldDef.options;
    }
    return [];
  }, [characters, statusOptions, plotPoints, metadataFieldDefs]);

  // Filterable fields
  const filterableFields = useMemo(() => {
    const base = [
      { id: 'character', label: 'Character' },
      { id: 'status', label: 'Status' },
      { id: 'plotPoint', label: 'Section' },
      { id: 'words', label: 'Words' },
      { id: 'synopsis', label: 'Synopsis' },
      { id: 'scene', label: 'Scene' },
    ];
    const custom = metadataFieldDefs
      .filter(f => f.id !== '_status')
      .sort((a, b) => a.order - b.order)
      .map(f => ({ id: f.id, label: f.label }));
    return [...base, ...custom];
  }, [metadataFieldDefs]);

  const toggleColumn = (columnId: string) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnId)) {
        newSet.delete(columnId);
      } else {
        newSet.add(columnId);
      }
      return newSet;
    });
  };

  // All available columns
  const allColumns = useMemo(() => {
    const baseColumns = [
      { id: 'scene', label: 'Scene' },
      { id: 'character', label: 'Character' },
      { id: 'status', label: 'Status' },
      { id: 'words', label: 'Words' },
      { id: 'plotPoint', label: 'Section' },
      { id: 'synopsis', label: 'Synopsis' },
    ];
    const customColumns = metadataFieldDefs
      .filter(f => f.id !== '_status')
      .sort((a, b) => a.order - b.order)
      .map(f => ({ id: f.id, label: f.label }));
    return [...baseColumns, ...customColumns];
  }, [metadataFieldDefs]);

  // Ordered columns based on columnOrder state
  const orderedColumns = useMemo(() => {
    // Start with current order
    const ordered = columnOrder
      .map(id => allColumns.find(col => col.id === id))
      .filter((col): col is { id: string; label: string } => col !== undefined);

    // Add any new columns that aren't in the order yet
    const existingIds = new Set(ordered.map(c => c.id));
    const newColumns = allColumns.filter(col => !existingIds.has(col.id));

    return [...ordered, ...newColumns];
  }, [columnOrder, allColumns]);

  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Close column menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    if (showColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColumnMenu]);

  return (
    <div className="table-view">
      {/* Table Controls */}
      <div className="table-view-controls">
        <div className="table-view-controls-left">
          {/* View Selector */}
          {currentViewId && savedViews.find(v => v.id === currentViewId) && (
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginRight: '12px' }}>
              {savedViews.find(v => v.id === currentViewId)?.name}
            </span>
          )}
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {sortedScenes.length} scenes
          </span>

          {/* Filter Toggle */}
          <button
            className={`table-control-btn ${filterRules.length > 0 ? 'active' : ''}`}
            onClick={() => setShowFilterBuilder(!showFilterBuilder)}
          >
            Filter{filterRules.length > 0 ? ` (${filterRules.length})` : ''}
          </button>
        </div>
        <div className="table-view-controls-right">
          {/* View Menu */}
          <div className="table-view-dropdown">
            <button
              className="table-control-btn"
              onClick={() => setShowViewMenu(!showViewMenu)}
            >
              Views
            </button>
            {showViewMenu && (
              <div className="table-view-dropdown-menu" style={{ minWidth: '220px' }}>
              {savedViews.map(view => (
                <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px' }}>
                  <div
                    className="table-view-dropdown-item"
                    style={{ flex: 1, padding: '8px' }}
                    onClick={() => loadView(view.id)}
                  >
                    {view.name}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteView(view.id);
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {savedViews.length > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />}
              <div
                className="table-view-dropdown-item"
                onClick={() => {
                  setShowViewMenu(false);
                  setShowNewViewDialog(true);
                }}
              >
                + Save Current View
              </div>
              <div className="table-view-dropdown-item" onClick={resetToDefault}>
                Reset to Default
              </div>
              </div>
            )}
          </div>

          {/* Columns Menu */}
          <div className="table-view-dropdown" ref={columnMenuRef}>
            <button
              className="table-control-btn"
              onClick={() => setShowColumnMenu(!showColumnMenu)}
            >
              Columns
            </button>
            {showColumnMenu && (
              <div className="table-view-dropdown-menu">
                {allColumns.map(col => (
                  <div
                    key={col.id}
                    className="table-view-dropdown-item"
                    onClick={() => toggleColumn(col.id)}
                  >
                    <div className={`table-view-dropdown-checkbox ${visibleColumns.has(col.id) ? 'checked' : ''}`} />
                    <span>{col.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New View Dialog */}
      {showNewViewDialog && (
        <div className="modal-overlay" onClick={() => setShowNewViewDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontFamily: 'var(--font-ui)', fontSize: '18px' }}>Save Table View</h3>
            <input
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="View name..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCurrentView();
                if (e.key === 'Escape') setShowNewViewDialog(false);
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontFamily: 'var(--font-ui)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                marginBottom: '16px',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewViewDialog(false)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-ui)',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentView}
                disabled={!newViewName.trim()}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-ui)',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: newViewName.trim() ? 'pointer' : 'not-allowed',
                  opacity: newViewName.trim() ? 1 : 0.5,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Builder */}
      {showFilterBuilder && (
        <div className="table-filter-builder">
          {filterRules.map((rule, index) => {
            const options = getFieldOptions(rule.field);
            const needsValue = rule.operator === 'is' || rule.operator === 'is_not' || rule.operator === 'contains';

            return (
              <div key={rule.id} className="table-filter-rule">
                {index === 0 ? (
                  <span className="table-filter-label">Where</span>
                ) : (
                  <span className="table-filter-label">and</span>
                )}

                <select
                  className="table-filter-select"
                  value={rule.field}
                  onChange={(e) => updateFilterRule(rule.id, { field: e.target.value, value: '' })}
                >
                  {filterableFields.map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>

                <select
                  className="table-filter-select"
                  value={rule.operator}
                  onChange={(e) => updateFilterRule(rule.id, { operator: e.target.value as FilterOperator })}
                >
                  <option value="is">is</option>
                  <option value="is_not">is not</option>
                  <option value="contains">contains</option>
                  <option value="is_blank">is blank</option>
                  <option value="is_not_blank">is not blank</option>
                </select>

                {needsValue && (
                  options.length > 0 ? (
                    <select
                      className="table-filter-select table-filter-value"
                      value={rule.value}
                      onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="table-filter-input"
                      type="text"
                      value={rule.value}
                      placeholder="Value..."
                      onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                    />
                  )
                )}

                <button
                  className="table-filter-remove"
                  onClick={() => removeFilterRule(rule.id)}
                >
                  ×
                </button>
              </div>
            );
          })}

          <button className="table-filter-add" onClick={addFilterRule}>
            + Add filter
          </button>
        </div>
      )}

      {/* Table */}
      <div className="table-view-wrapper">
        <table className="table-view-table">
          <thead>
            <tr>
              {orderedColumns
                .filter(col => visibleColumns.has(col.id))
                .map(col => (
                  <th
                    key={col.id}
                    className={`table-header ${draggedColumn === col.id ? 'dragging' : ''} ${dragOverColumn === col.id ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleColumnDragStart(e, col.id)}
                    onDragOver={(e) => handleColumnDragOver(e, col.id)}
                    onDrop={(e) => handleColumnDrop(e, col.id)}
                    onDragEnd={handleColumnDragEnd}
                    style={{
                      width: columnWidths[col.id] || 'auto',
                      minWidth: columnWidths[col.id] || 120,
                      cursor: draggedColumn ? 'grabbing' : 'grab',
                    }}
                  >
                    <div
                      className="table-header-content"
                      onClick={() => handleSort(col.id as SortField)}
                    >
                      <span>{col.label}</span>
                      {sortField === col.id && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                    <div
                      className={`resize-handle ${resizingColumn === col.id ? 'resizing' : ''}`}
                      onMouseDown={(e) => handleResizeStart(e, col.id)}
                    />
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {sortedScenes.map(scene => {
            const sceneKey = getSceneKey(scene);
            const character = characters.find(c => c.id === scene.characterId);
            const metadata = sceneMetadata[sceneKey] || {};
            const status = metadata['_status'] as string || '';
            const statusColor = statusField?.optionColors?.[status] || '#9e9e9e';

            const renderCell = (columnId: string) => {
              if (columnId === 'scene') {
                return (
                  <td key="scene" className="table-cell table-cell-scene">
                    <span className="table-scene-number">{scene.timelinePosition}</span>
                    <span className="table-scene-content">
                      {character?.name || 'Unknown'} — {extractShortTitle(scene.content) || 'Untitled'}
                    </span>
                  </td>
                );
              }

              if (columnId === 'character') {
                const charColor = characterColors[scene.characterId] || '#9e9e9e';
                return (
                  <td key="character" className="table-cell">
                    <span
                      className="table-character-pill"
                      style={{ '--char-color': charColor } as React.CSSProperties}
                    >
                      {character?.name || 'Unknown'}
                    </span>
                  </td>
                );
              }

              if (columnId === 'status') {
                return (
                  <td key="status" className="table-cell" onClick={(e) => e.stopPropagation()}>
                    {editingCell?.sceneKey === sceneKey && editingCell.field === '_status' ? (
                      <select
                        className="table-cell-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleCellSave}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCellSave();
                          if (e.key === 'Escape') handleCellCancel();
                        }}
                        autoFocus
                      >
                        <option value="">No status</option>
                        {statusOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="table-status-pill"
                        style={{ '--status-color': statusColor } as React.CSSProperties}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCellEdit(sceneKey, '_status', status);
                        }}
                      >
                        {status || '—'}
                      </span>
                    )}
                  </td>
                );
              }

              if (columnId === 'words') {
                return (
                  <td key="words" className="table-cell" onClick={(e) => e.stopPropagation()}>
                    {editingCell?.sceneKey === sceneKey && editingCell.field === 'words' ? (
                      <input
                        type="number"
                        className="table-cell-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleCellSave}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCellSave();
                          if (e.key === 'Escape') handleCellCancel();
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="table-cell-editable"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCellEdit(sceneKey, 'words', scene.wordCount?.toString() || '');
                        }}
                      >
                        {scene.wordCount !== undefined ? scene.wordCount.toLocaleString() : '—'}
                      </span>
                    )}
                  </td>
                );
              }

              if (columnId === 'plotPoint') {
                const scenePlotPoint = plotPoints.find(pp => pp.id === scene.plotPointId);
                const characterPlotPoints = plotPoints.filter(pp => pp.characterId === scene.characterId);

                return (
                  <td key="plotPoint" className="table-cell" onClick={(e) => e.stopPropagation()}>
                    {editingCell?.sceneKey === sceneKey && editingCell.field === 'plotPoint' ? (
                      <select
                        className="table-cell-input"
                        value={scene.plotPointId || ''}
                        onChange={(e) => {
                          // Handle plot point change here
                          // This would need a new handler passed from App.tsx
                          setEditingCell(null);
                        }}
                        onBlur={() => setEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') handleCellCancel();
                        }}
                        autoFocus
                      >
                        <option value="">No section</option>
                        {characterPlotPoints.map(pp => (
                          <option key={pp.id} value={pp.id}>{pp.title}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="table-cell-editable"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCellEdit(sceneKey, 'plotPoint', '');
                        }}
                      >
                        {scenePlotPoint?.title || '—'}
                      </span>
                    )}
                  </td>
                );
              }

              if (columnId === 'synopsis') {
                const synopsis = scene.notes.length > 0 ? scene.notes[0] : '';
                const cleanSynopsis = synopsis.replace(/<[^>]*>/g, '').trim();

                return (
                  <td key="synopsis" className="table-cell">
                    {cleanSynopsis || '—'}
                  </td>
                );
              }

              // Custom metadata fields
              const field = metadataFieldDefs.find(f => f.id === columnId);
              if (field) {
                const value = metadata[field.id];
                const displayValue = Array.isArray(value) ? value.join(', ') : (value || '—');

                return (
                  <td key={field.id} className="table-cell" onClick={(e) => e.stopPropagation()}>
                    {editingCell?.sceneKey === sceneKey && editingCell.field === field.id ? (
                      field.type === 'dropdown' ? (
                        <select
                          className="table-cell-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellSave}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCellSave();
                            if (e.key === 'Escape') handleCellCancel();
                          }}
                          autoFocus
                        >
                          <option value="">—</option>
                          {field.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <textarea
                          className="table-cell-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellSave}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCellSave(); }
                            if (e.key === 'Escape') handleCellCancel();
                          }}
                          autoFocus
                          rows={1}
                          onInput={(e) => {
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = el.scrollHeight + 'px';
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = el.scrollHeight + 'px';
                            }
                          }}
                        />
                      )
                    ) : (
                      <span
                        className="table-cell-editable"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCellEdit(sceneKey, field.id, displayValue.toString());
                        }}
                      >
                        {displayValue}
                      </span>
                    )}
                  </td>
                );
              }

              return null;
            };

            return (
              <tr key={scene.id} className="table-row" onClick={() => onSceneClick(sceneKey)}>
                {orderedColumns
                  .filter(col => visibleColumns.has(col.id))
                  .map(col => renderCell(col.id))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sortedScenes.length === 0 && (
        <div className="table-empty">No scenes in timeline</div>
      )}
      </div>
    </div>
  );
}
