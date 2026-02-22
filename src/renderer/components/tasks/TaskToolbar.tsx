import { useState, useEffect, useRef } from 'react';
import type { TaskFieldDef, TaskViewConfig } from '../../../shared/types';
import { BUILTIN_COLUMNS } from './TaskTable';
import TaskTimer from './TaskTimer';

interface TaskToolbarProps {
  groupBy: string | undefined;
  sortBy: string | undefined;
  sortDir: 'asc' | 'desc';
  taskFieldDefs: TaskFieldDef[];
  taskCount: number;
  onGroupByChange: (field: string | undefined) => void;
  onSortChange: (field: string | undefined, dir: 'asc' | 'desc') => void;
  showFilter: boolean;
  onToggleFilter: () => void;
  filterCount: number;
  activeTimerTaskId: string | null;
  activeTimerTaskTitle: string;
  timerElapsed: number;
  onStopTimer: () => void;
  taskViews: TaskViewConfig[];
  activeViewId: string | null;
  onViewSelect: (viewId: string | null) => void;
  onViewSave: () => void;
  onViewSaveAs: (name: string) => void;
  onViewDelete: (viewId: string) => void;
  visibleColumns: string[];
  onVisibleColumnsChange: (columns: string[]) => void;
  viewHasChanges: boolean;
}

const GROUP_OPTIONS: { id: string; name: string }[] = [
  { id: 'status', name: 'Status' },
  { id: 'priority', name: 'Priority' },
  { id: 'characters', name: 'Character' },
  { id: 'scene', name: 'Scene' },
  { id: 'tags', name: 'Tag' },
];

export default function TaskToolbar({
  groupBy,
  sortBy,
  sortDir,
  taskFieldDefs,
  taskCount,
  onGroupByChange,
  onSortChange,
  showFilter,
  onToggleFilter,
  filterCount,
  activeTimerTaskId,
  activeTimerTaskTitle,
  timerElapsed,
  onStopTimer,
  taskViews,
  activeViewId,
  onViewSelect,
  onViewSave,
  onViewSaveAs,
  onViewDelete,
  visibleColumns,
  onVisibleColumnsChange,
  viewHasChanges,
}: TaskToolbarProps) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [saveAsMode, setSaveAsMode] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const groupRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const saveAsInputRef = useRef<HTMLInputElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setGroupOpen(false);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) {
        setViewOpen(false);
      }
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus save-as input when it appears
  useEffect(() => {
    if (saveAsMode && saveAsInputRef.current) {
      saveAsInputRef.current.focus();
    }
  }, [saveAsMode]);

  // Build the full list of group options (built-in + custom dropdown fields)
  const allGroupOptions = [
    ...GROUP_OPTIONS,
    ...taskFieldDefs
      .filter((def) => def.type === 'dropdown')
      .map((def) => ({ id: def.id, name: def.name })),
  ];

  // Build the full list of sort options (built-in columns + custom fields)
  const allSortOptions = [
    ...BUILTIN_COLUMNS.map((col) => ({ id: col.id, name: col.name })),
    ...taskFieldDefs.map((def) => ({ id: def.id, name: def.name })),
  ];

  // All columns for the columns panel
  const allColumns = [
    ...BUILTIN_COLUMNS.map((col) => ({ id: col.id, name: col.name })),
    ...taskFieldDefs.map((def) => ({ id: def.id, name: def.name })),
  ];

  // Active view name
  const activeViewName = activeViewId
    ? taskViews.find((v) => v.id === activeViewId)?.name || 'Untitled'
    : 'All Tasks';

  function handleGroupSelect(id: string | undefined) {
    onGroupByChange(id);
    setGroupOpen(false);
  }

  function handleSortSelect(id: string) {
    if (sortBy === id) {
      // Toggle direction
      onSortChange(id, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(id, 'asc');
    }
    setSortOpen(false);
  }

  function closeAllDropdowns() {
    setGroupOpen(false);
    setSortOpen(false);
    setViewOpen(false);
    setColumnsOpen(false);
  }

  function handleSaveAsSubmit() {
    const name = saveAsName.trim();
    if (!name) return;
    onViewSaveAs(name);
    setSaveAsMode(false);
    setSaveAsName('');
  }

  function handleColumnToggle(colId: string) {
    if (visibleColumns.includes(colId)) {
      // Don't allow hiding all columns
      if (visibleColumns.length <= 1) return;
      onVisibleColumnsChange(visibleColumns.filter((c) => c !== colId));
    } else {
      onVisibleColumnsChange([...visibleColumns, colId]);
    }
  }

  return (
    <div className="tasks-toolbar">
      {/* View Switcher */}
      <div className="tasks-view-switcher" ref={viewRef}>
        <button
          className="tasks-view-switcher-btn"
          onClick={() => { const next = !viewOpen; closeAllDropdowns(); setViewOpen(next); }}
        >
          {activeViewName}
          <span className="chevron">{viewOpen ? '\u25B2' : '\u25BC'}</span>
        </button>
        {viewOpen && (
          <div className="tasks-view-dropdown">
            <button
              className={`tasks-view-option${!activeViewId ? ' active' : ''}`}
              onClick={() => { onViewSelect(null); setViewOpen(false); }}
            >
              All Tasks
            </button>
            {taskViews.map((view) => (
              <button
                key={view.id}
                className={`tasks-view-option${activeViewId === view.id ? ' active' : ''}`}
                onClick={() => { onViewSelect(view.id); setViewOpen(false); }}
              >
                <span>{view.name}</span>
                <span
                  className="tasks-view-option-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDelete(view.id);
                  }}
                >
                  &times;
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Save button — visible only when an existing view is active AND config has changed */}
      {activeViewId && viewHasChanges && (
        <button className="tasks-toolbar-btn" onClick={onViewSave}>
          Save
        </button>
      )}

      {/* Save As button */}
      {saveAsMode ? (
        <div className="tasks-save-as-input">
          <input
            ref={saveAsInputRef}
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveAsSubmit();
              if (e.key === 'Escape') { setSaveAsMode(false); setSaveAsName(''); }
            }}
            placeholder="View name..."
          />
          <button className="tasks-toolbar-btn" onClick={handleSaveAsSubmit}>
            OK
          </button>
        </div>
      ) : (
        <button className="tasks-toolbar-btn" onClick={() => setSaveAsMode(true)}>
          Save As
        </button>
      )}

      <div className="tasks-toolbar-separator" />

      {/* Group By dropdown */}
      <div className="tasks-toolbar-section" ref={groupRef}>
        <button
          className={`tasks-toolbar-btn${groupBy ? ' active' : ''}`}
          onClick={() => { const next = !groupOpen; closeAllDropdowns(); setGroupOpen(next); }}
        >
          Group{groupBy ? `: ${allGroupOptions.find((o) => o.id === groupBy)?.name || groupBy}` : ''}
        </button>
        {groupOpen && (
          <div className="tasks-toolbar-dropdown">
            <button
              className={`tasks-toolbar-dropdown-option${!groupBy ? ' active' : ''}`}
              onClick={() => handleGroupSelect(undefined)}
            >
              None
            </button>
            {allGroupOptions.map((opt) => (
              <button
                key={opt.id}
                className={`tasks-toolbar-dropdown-option${groupBy === opt.id ? ' active' : ''}`}
                onClick={() => handleGroupSelect(opt.id)}
              >
                {opt.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sort dropdown */}
      <div className="tasks-toolbar-section" ref={sortRef}>
        <button
          className={`tasks-toolbar-btn${sortBy ? ' active' : ''}`}
          onClick={() => { const next = !sortOpen; closeAllDropdowns(); setSortOpen(next); }}
        >
          Sort{sortBy ? `: ${allSortOptions.find((o) => o.id === sortBy)?.name || sortBy}` : ''}
          {sortBy && (
            <span className="task-sort-indicator">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
          )}
        </button>
        {sortOpen && (
          <div className="tasks-toolbar-dropdown">
            {allSortOptions.map((opt) => (
              <button
                key={opt.id}
                className={`tasks-toolbar-dropdown-option${sortBy === opt.id ? ' active' : ''}`}
                onClick={() => handleSortSelect(opt.id)}
              >
                {opt.name}
                {sortBy === opt.id && (
                  <span className="task-sort-indicator">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter toggle button */}
      <button
        className={`tasks-toolbar-btn${showFilter || filterCount > 0 ? ' active' : ''}`}
        onClick={onToggleFilter}
      >
        Filter
        {filterCount > 0 && (
          <span className="tasks-toolbar-badge">{filterCount}</span>
        )}
      </button>

      {/* Columns button */}
      <div className="tasks-toolbar-section" ref={columnsRef}>
        <button
          className="tasks-toolbar-btn"
          onClick={() => { const next = !columnsOpen; closeAllDropdowns(); setColumnsOpen(next); }}
        >
          Columns
        </button>
        {columnsOpen && (
          <div className="tasks-columns-panel">
            {allColumns.map((col) => (
              <label key={col.id} className="tasks-column-toggle">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.id)}
                  onChange={() => handleColumnToggle(col.id)}
                />
                {col.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <span className="tasks-toolbar-count">{taskCount} tasks</span>

      <TaskTimer
        activeTaskId={activeTimerTaskId}
        activeTaskTitle={activeTimerTaskTitle}
        elapsed={timerElapsed}
        onStop={onStopTimer}
      />
    </div>
  );
}
