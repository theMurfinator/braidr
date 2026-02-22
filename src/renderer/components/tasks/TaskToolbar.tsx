import { useState, useEffect, useRef } from 'react';
import type { TaskFieldDef } from '../../../shared/types';
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
}: TaskToolbarProps) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setGroupOpen(false);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  return (
    <div className="tasks-toolbar">
      <h2 className="tasks-toolbar-title">Tasks</h2>

      <div className="tasks-toolbar-separator" />

      {/* Group By dropdown */}
      <div className="tasks-toolbar-section" ref={groupRef}>
        <button
          className={`tasks-toolbar-btn${groupBy ? ' active' : ''}`}
          onClick={() => { setGroupOpen(!groupOpen); setSortOpen(false); }}
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
          onClick={() => { setSortOpen(!sortOpen); setGroupOpen(false); }}
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
