import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Scene, Character, MetadataFieldDef, Tag, TableViewConfig, FilterRule, Chapter } from '../../shared/types';
import TablePovSlideover from './TablePovSlideover';
import { OptionEditor } from './OptionEditor';

type FilterOperator = 'is' | 'is_not' | 'is_blank' | 'is_not_blank' | 'contains';

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
  povReorderedScenes?: Set<string>;
  chapters?: Chapter[];
  onMovePovScene: (sceneId: string, targetIndex: number, targetPlotPointId: string | null) => void;
  onAddSceneForCharacter: (characterId: string) => void;
  onReorderScenes: (orderedSceneIds: string[]) => void;
  onMetadataFieldDefsChange: (defs: MetadataFieldDef[]) => void;
}

type SortField = 'scene' | 'character' | 'status' | 'words' | 'plotPoint' | string;
type SortDirection = 'asc' | 'desc';


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
  tags: _tags,
  tableViews,
  plotPoints,
  characterColors,
  onSceneClick,
  onMetadataChange,
  onWordCountChange,
  onTableViewsChange,
  onSceneChange: _onSceneChange,
  povReorderedScenes,
  chapters,
  onMovePovScene,
  onAddSceneForCharacter,
  onReorderScenes,
  onMetadataFieldDefsChange,
}: TableViewProps) {
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField>('scene');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingCell, setEditingCell] = useState<{ sceneKey: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showNewViewDialog, setShowNewViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(['scene', 'character', 'status', 'words', 'plotPoint'])
  );

  // Column widths and order
  const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    scene: 280,
    character: 140,
    status: 130,
    words: 100,
    plotPoint: 160,
    synopsis: 200,
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...DEFAULT_COLUMN_WIDTHS });

  const [columnOrder, setColumnOrder] = useState<string[]>(['scene', 'character', 'status', 'words', 'plotPoint']);

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
    const sceneKey = scene.id;
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
        const aKey = a.id;
        const bKey = b.id;
        aVal = sceneMetadata[aKey]?.['_status'] as string || '';
        bVal = sceneMetadata[bKey]?.['_status'] as string || '';
      } else if (sortField === 'words') {
        aVal = a.wordCount ?? 0;
        bVal = b.wordCount ?? 0;
      } else if (sortField === 'plotPoint') {
        aVal = a.plotPointId || '';
        bVal = b.plotPointId || '';
      } else {
        // Custom metadata field
        const aKey = a.id;
        const bKey = b.id;
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

    const scene = scenes.find(s => s.id === editingCell.sceneKey);
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

  // Field editor modal
  const [showMetaEditor, setShowMetaEditor] = useState(false);
  const [editingFieldDefs, setEditingFieldDefs] = useState<MetadataFieldDef[]>([]);

  const openMetaEditor = () => {
    setEditingFieldDefs(metadataFieldDefs.filter(f => f.id !== '_status'));
    setShowMetaEditor(true);
    setShowColumnMenu(false);
  };

  const addField = () => {
    setEditingFieldDefs(prev => [...prev, {
      id: Math.random().toString(36).substring(2, 11),
      label: 'New Field',
      type: 'text',
      options: [],
      order: prev.length,
    }]);
  };

  const removeField = (id: string) => {
    setEditingFieldDefs(prev => prev.filter(f => f.id !== id));
  };

  const updateField = (id: string, changes: Partial<MetadataFieldDef>) => {
    setEditingFieldDefs(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f));
  };

  const saveMetaFields = () => {
    const statusDef = metadataFieldDefs.find(f => f.id === '_status');
    onMetadataFieldDefsChange(statusDef ? [statusDef, ...editingFieldDefs] : editingFieldDefs);
    setShowMetaEditor(false);
  };

  const [groupBy, setGroupBy] = useState<'none' | 'plotPoint' | 'chapter'>('none');
  const [showAddSceneMenu, setShowAddSceneMenu] = useState(false);
  const addSceneMenuRef = useRef<HTMLDivElement>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [showPovPanel, setShowPovPanel] = useState(false);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);

  useEffect(() => {
    const offset = showPovPanel ? '320px' : '0px';
    document.documentElement.style.setProperty('--pov-panel-offset', offset);
    return () => { document.documentElement.style.setProperty('--pov-panel-offset', '0px'); };
  }, [showPovPanel]);

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
  const loadView = (viewId: string) => {
    const view = tableViews.find(v => v.id === viewId);
    if (!view) return;
    setCurrentViewId(viewId);
    setVisibleColumns(new Set(view.visibleColumns));
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...view.columnWidths });
    setColumnOrder(view.columnOrder.length ? view.columnOrder : ['scene', 'character', 'status', 'words', 'plotPoint']);
    setSortField(view.sortField as SortField);
    setSortDirection(view.sortDirection);
    setFilterRules(view.filterRules || []);
    setGroupBy(view.groupBy || 'none');
    setShowOverflowMenu(false);
  };

  const saveCurrentView = () => {
    if (!newViewName.trim()) return;
    const id = `view-${Date.now()}`;
    const newView: TableViewConfig = {
      id,
      name: newViewName.trim(),
      isDefault: false,
      visibleColumns: Array.from(visibleColumns),
      columnWidths,
      columnOrder,
      sortField,
      sortDirection,
      filterRules,
      groupBy,
      createdAt: Date.now(),
    };
    onTableViewsChange([...tableViews, newView]);
    setCurrentViewId(id);
    setNewViewName('');
    setShowNewViewDialog(false);
  };

  const deleteView = (viewId: string) => {
    onTableViewsChange(tableViews.filter(v => v.id !== viewId));
    if (currentViewId === viewId) setCurrentViewId(null);
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
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);

  const MAX_VISIBLE_TABS = 5;
  const visibleTabs = tableViews.slice(0, MAX_VISIBLE_TABS);
  const overflowTabs = tableViews.slice(MAX_VISIBLE_TABS);

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

  // Close overflow menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    };
    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOverflowMenu]);

  // Load default view on first load
  useEffect(() => {
    if (tableViews.length === 0) return;
    const defaultView = tableViews.find(v => v.isDefault);
    if (defaultView) loadView(defaultView.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableViews.length > 0 ? 'loaded' : 'empty']);

  return (
    <div className="table-view">
      {/* Table Controls */}
      <div className="table-view-controls">
        <div className="table-view-controls-left">
          <span className="table-scene-count">{sortedScenes.length} scenes</span>

          <div className="table-view-group-by">
            <span className="table-control-label">Group by</span>
            <select
              className="table-control-select"
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as 'none' | 'plotPoint' | 'chapter')}
            >
              <option value="none">None</option>
              <option value="plotPoint">Section</option>
              <option value="chapter">Chapter</option>
            </select>
          </div>

          <button
            className={`table-control-btn ${filterRules.length > 0 ? 'active' : ''}`}
            onClick={() => setShowFilterBuilder(!showFilterBuilder)}
          >
            Filter{filterRules.length > 0 ? ` (${filterRules.length})` : ''}
          </button>

          {/* Inline view tabs */}
          <div className="table-views-inline-sep" />

          {visibleTabs.map(view => (
            <button
              key={view.id}
              className={`table-view-tab ${currentViewId === view.id ? 'active' : ''}`}
              onClick={() => loadView(view.id)}
            >
              <span>{view.name}</span>
              <span
                className="table-view-tab-delete"
                onClick={e => { e.stopPropagation(); deleteView(view.id); }}
                title="Delete view"
              >×</span>
            </button>
          ))}

          {overflowTabs.length > 0 && (
            <div className="table-view-dropdown" ref={overflowMenuRef}>
              <button
                className="table-view-tab table-view-tab-overflow"
                onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              >
                +{overflowTabs.length} more
              </button>
              {showOverflowMenu && (
                <div className="table-view-dropdown-menu" style={{ minWidth: '180px' }}>
                  {overflowTabs.map(view => (
                    <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px' }}>
                      <div
                        className="table-view-dropdown-item"
                        style={{ flex: 1 }}
                        onClick={() => { loadView(view.id); setShowOverflowMenu(false); }}
                      >
                        {view.name}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteView(view.id); }}
                        style={{ padding: '2px 6px', fontSize: '11px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            className="table-view-tab table-view-tab-add"
            onClick={() => setShowNewViewDialog(true)}
          >
            + View
          </button>

          <div className="table-views-inline-sep" />

          <div className="table-view-dropdown" ref={addSceneMenuRef}>
            <button
              className="table-control-btn table-control-btn-add"
              onClick={() => setShowAddSceneMenu(!showAddSceneMenu)}
            >
              + Add Scene
            </button>
            {showAddSceneMenu && (
              <div className="table-view-dropdown-menu">
                {characters.map(char => (
                  <div
                    key={char.id}
                    className="table-view-dropdown-item"
                    onClick={() => {
                      onAddSceneForCharacter(char.id);
                      setShowAddSceneMenu(false);
                    }}
                  >
                    <span
                      className="table-char-dot"
                      style={{ background: characterColors[char.id] || '#9e9e9e' }}
                    />
                    {char.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="table-view-controls-right">
          <div className="table-view-dropdown" ref={columnMenuRef}>
            <button className="table-control-btn" onClick={() => setShowColumnMenu(!showColumnMenu)}>
              Columns
            </button>
            {showColumnMenu && (
              <div className="table-view-dropdown-menu">
                {allColumns.map(col => (
                  <div key={col.id} className="table-view-dropdown-item" onClick={() => toggleColumn(col.id)}>
                    <div className={`table-view-dropdown-checkbox ${visibleColumns.has(col.id) ? 'checked' : ''}`} />
                    <span>{col.label}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <div className="table-view-dropdown-item" onClick={openMetaEditor}>
                  + Edit Properties...
                </div>
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
          <colgroup>
            {groupBy === 'none' && <col style={{ width: 28, minWidth: 28 }} />}
            {orderedColumns
              .filter(col => visibleColumns.has(col.id))
              .map(col => (
                <col
                  key={col.id}
                  style={{
                    width: columnWidths[col.id] || 'auto',
                    minWidth: columnWidths[col.id] || 120,
                  }}
                />
              ))}
          </colgroup>
          <thead>
            <tr>
              {groupBy === 'none' && <th className="table-drag-handle-cell" />}
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
        {(() => {
            const renderSceneRow = (scene: Scene) => {
            const sceneKey = scene.id;
            const character = characters.find(c => c.id === scene.characterId);
            const metadata = sceneMetadata[sceneKey] || {};
            const status = metadata['_status'] as string || '';
            const statusColor = statusField?.optionColors?.[status] || '#9e9e9e';

            const renderCell = (columnId: string) => {
              if (columnId === 'scene') {
                return (
                  <td key="scene" className="table-cell table-cell-scene">
                    <div className="table-scene-inner">
                      <span className="table-scene-number">{scene.timelinePosition}</span>
                      <span className="table-scene-content">
                        {character?.name || 'Unknown'} — {extractShortTitle(scene.content) || 'Untitled'}
                      </span>
                    </div>
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
                        onChange={(_e) => {
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

                const renderDisplay = () => {
                  if (field.type === 'multiselect' && Array.isArray(value) && value.length > 0) {
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {(value as string[]).map(opt => {
                          const color = field.optionColors?.[opt];
                          return color ? (
                            <span
                              key={opt}
                              className="table-status-pill"
                              style={{ '--status-color': color } as React.CSSProperties}
                            >
                              {opt}
                            </span>
                          ) : (
                            <span key={opt} className="table-tag-plain">{opt}</span>
                          );
                        })}
                      </div>
                    );
                  }
                  if (field.type === 'dropdown' && typeof value === 'string' && value) {
                    const color = field.optionColors?.[value];
                    return color ? (
                      <span className="table-status-pill" style={{ '--status-color': color } as React.CSSProperties}>
                        {value}
                      </span>
                    ) : (
                      <span>{value || '—'}</span>
                    );
                  }
                  const displayValue = Array.isArray(value) ? value.join(', ') : ((value as string) || '—');
                  return <span>{displayValue}</span>;
                };

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
                          const displayValue = Array.isArray(value) ? value.join(', ') : ((value as string) || '');
                          handleCellEdit(sceneKey, field.id, displayValue);
                        }}
                      >
                        {renderDisplay()}
                      </span>
                    )}
                  </td>
                );
              }

              return null;
            };

            const canDrag = groupBy === 'none';
            return (
              <tr
                key={scene.id}
                className={`table-row ${povReorderedScenes?.has(scene.id) ? 'pov-reordered' : ''} ${selectedSceneId === scene.id ? 'selected' : ''} ${dragOverRowId === scene.id && dragRowId !== scene.id ? 'drag-over' : ''} ${dragRowId === scene.id ? 'dragging' : ''}`}
                draggable={canDrag}
                onDragStart={canDrag ? (e) => { e.dataTransfer.effectAllowed = 'move'; setDragRowId(scene.id); } : undefined}
                onDragOver={canDrag ? (e) => { e.preventDefault(); setDragOverRowId(scene.id); } : undefined}
                onDragLeave={canDrag ? () => setDragOverRowId(null) : undefined}
                onDrop={canDrag ? (e) => {
                  e.preventDefault();
                  if (dragRowId && dragRowId !== scene.id) {
                    const oldIndex = sortedScenes.findIndex(s => s.id === dragRowId);
                    const newIndex = sortedScenes.findIndex(s => s.id === scene.id);
                    if (oldIndex !== -1 && newIndex !== -1) {
                      const reordered = [...sortedScenes];
                      const [moved] = reordered.splice(oldIndex, 1);
                      reordered.splice(newIndex, 0, moved);
                      onReorderScenes(reordered.map(s => s.id));
                    }
                  }
                  setDragRowId(null);
                  setDragOverRowId(null);
                } : undefined}
                onDragEnd={canDrag ? () => { setDragRowId(null); setDragOverRowId(null); } : undefined}
                onClick={() => {
                  setSelectedSceneId(scene.id);
                  onSceneClick(sceneKey);
                }}
              >
                {canDrag && (
                  <td className="table-drag-handle-cell" onClick={e => e.stopPropagation()}>⠿</td>
                )}
                {orderedColumns
                  .filter(col => visibleColumns.has(col.id))
                  .map(col => renderCell(col.id))}
              </tr>
            );
            }; // end renderSceneRow

            if (groupBy === 'plotPoint') {
              const result: React.JSX.Element[] = [];
              const groups = new Map<string, { label: string; scenes: Scene[] }>();
              for (const scene of sortedScenes) {
                const char = characters.find(c => c.id === scene.characterId);
                const pp = plotPoints.find(p => p.id === scene.plotPointId);
                const key = `${scene.characterId}::${scene.plotPointId ?? '__none__'}`;
                if (!groups.has(key)) {
                  const charName = char?.name || 'Unknown';
                  const ppTitle = pp?.title || 'No Section';
                  groups.set(key, { label: `${charName} — ${ppTitle}`, scenes: [] });
                }
                groups.get(key)!.scenes.push(scene);
              }
              for (const [key, group] of groups) {
                const sectionWords = group.scenes.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
                result.push(
                  <tbody key={key} className="chapter-tbody">
                    <tr className="table-chapter-header">
                      <td colSpan={100}>
                        {group.label}
                        {sectionWords > 0 && <span className="table-section-wordcount">{sectionWords.toLocaleString()} words</span>}
                      </td>
                    </tr>
                    {group.scenes.map(s => renderSceneRow(s))}
                  </tbody>
                );
              }
              return result;
            }

            if (groupBy === 'chapter' && chapters && chapters.length > 0) {
              const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
              const chapterMap = new Map(sortedChapters.map((ch, i) => [ch.id, { chapter: ch, chapterNum: i + 1 }]));
              const processedChapters = new Set<string>();
              const result: React.JSX.Element[] = [];

              // Walk scenes in display order; render chapter groups at position of their first scene
              for (const scene of sortedScenes) {
                if (!scene.chapterId || !chapterMap.has(scene.chapterId)) {
                  result.push(<tbody key={`s-${scene.id}`}>{renderSceneRow(scene)}</tbody>);
                } else {
                  const chId = scene.chapterId;
                  if (!processedChapters.has(chId)) {
                    processedChapters.add(chId);
                    const chInfo = chapterMap.get(chId)!;
                    const chScenes = sortedScenes.filter(s => s.chapterId === chId);
                    result.push(
                      <tbody key={`ch-${chId}`} className="chapter-tbody">
                        <tr className="table-chapter-header">
                          <td colSpan={100}><span className="table-chapter-num">Ch. {chInfo.chapterNum}</span>{chInfo.chapter.title}</td>
                        </tr>
                        {chScenes.map(s => renderSceneRow(s))}
                      </tbody>
                    );
                  }
                }
              }

              // Empty chapters at end
              sortedChapters.forEach((chapter, chIdx) => {
                if (!processedChapters.has(chapter.id)) {
                  result.push(
                    <tbody key={`ch-${chapter.id}`} className="chapter-tbody">
                      <tr className="table-chapter-header">
                        <td colSpan={100}><span className="table-chapter-num">Ch. {chIdx + 1}</span>{chapter.title}</td>
                      </tr>
                    </tbody>
                  );
                }
              });

              return result;
            }
            return <tbody>{sortedScenes.map(scene => renderSceneRow(scene))}</tbody>;
          })()}
      </table>
      {sortedScenes.length === 0 && (
        <div className="table-empty">No scenes in timeline</div>
      )}
      </div>
      {showPovPanel && selectedSceneId && (() => {
        const selScene = scenes.find(s => s.id === selectedSceneId);
        if (!selScene) return null;
        const charScenes = scenes
          .filter(s => s.characterId === selScene.characterId)
          .sort((a, b) => a.sceneNumber - b.sceneNumber);
        const charPlotPoints = plotPoints.filter(pp => pp.characterId === selScene.characterId);
        return (
          <TablePovSlideover
            characterName={characters.find(c => c.id === selScene.characterId)?.name || 'Unknown'}
            characterColor={characterColors[selScene.characterId] || '#9e9e9e'}
            scenes={charScenes}
            plotPoints={charPlotPoints}
            selectedSceneId={selectedSceneId}
            onClose={() => setShowPovPanel(false)}
            onMove={onMovePovScene}
          />
        );
      })()}

      {/* Metadata Field Editor Modal */}
      {showMetaEditor && (
        <div className="modal-overlay" onClick={() => setShowMetaEditor(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Properties</h3>
              <button className="modal-close-btn" onClick={() => setShowMetaEditor(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '16px', minWidth: '520px', overflowY: 'auto' }}>
              {editingFieldDefs.map(field => (
                <div key={field.id} className="meta-field-editor-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="meta-field-editor-label"
                      value={field.label}
                      onChange={e => updateField(field.id, { label: e.target.value })}
                      placeholder="Field name"
                    />
                    <select
                      value={field.type}
                      onChange={e => updateField(field.id, { type: e.target.value as MetadataFieldDef['type'], options: [], optionColors: {} })}
                    >
                      <option value="text">Text</option>
                      <option value="dropdown">Dropdown</option>
                      <option value="multiselect">Multiselect</option>
                    </select>
                    <button className="meta-field-editor-remove" onClick={() => removeField(field.id)}>×</button>
                  </div>
                  {(field.type === 'dropdown' || field.type === 'multiselect') && (
                    <OptionEditor
                      options={field.options || []}
                      optionColors={field.optionColors || {}}
                      onChange={(options, optionColors) => updateField(field.id, { options, optionColors })}
                    />
                  )}
                </div>
              ))}
              <button className="meta-field-editor-add" onClick={addField}>+ Add Property</button>
              <div className="meta-field-editor-actions">
                <button className="meta-field-editor-save" onClick={saveMetaFields}>Save</button>
                <button className="meta-field-editor-cancel" onClick={() => setShowMetaEditor(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
