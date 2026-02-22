import { useState, useEffect, useMemo } from 'react';
import type { Task, TaskFilter, TaskFieldDef, TaskViewConfig, Tag, Character, Scene, TimeEntry } from '../../../shared/types';
import TaskTable, { BUILTIN_COLUMNS } from './TaskTable';
import TaskToolbar from './TaskToolbar';
import TaskFilterBar from './TaskFilterBar';

function getFieldValue(task: Task, field: string, characters: Character[]): string | string[] | number | boolean | undefined {
  switch (field) {
    case 'title': return task.title;
    case 'status': return task.status;
    case 'priority': return task.priority;
    case 'tags': return task.tags;
    case 'characters': return task.characterIds.map(id => characters.find(c => c.id === id)?.name || id);
    case 'scene': return task.sceneKey || '';
    case 'dueDate': return task.dueDate;
    case 'timeTracked': return task.timeEntries.reduce((s, e) => s + e.duration, 0);
    case 'timeEstimate': return task.timeEstimate;
    default: return task.customFields[field] as string | string[] | number | boolean | undefined;
  }
}

function filterTasks(tasks: Task[], filters: TaskFilter[], characters: Character[]): Task[] {
  if (!filters.length) return tasks;
  return tasks.filter(task => {
    return filters.every(f => {
      const value = getFieldValue(task, f.field, characters);
      switch (f.operator) {
        case 'is':
          if (Array.isArray(value)) return Array.isArray(f.value) ? f.value.some(v => value.includes(v)) : value.includes(String(f.value));
          return String(value) === String(f.value);
        case 'is_not':
          if (Array.isArray(value)) return !Array.isArray(f.value) || !f.value.some(v => value.includes(v));
          return String(value) !== String(f.value);
        case 'contains':
          if (Array.isArray(value) && Array.isArray(f.value)) return f.value.some(v => value.includes(v));
          return String(value).toLowerCase().includes(String(f.value).toLowerCase());
        case 'is_set':
          return value != null && value !== '' && (!Array.isArray(value) || value.length > 0);
        case 'is_not_set':
          return value == null || value === '' || (Array.isArray(value) && value.length === 0);
        default: return true;
      }
    });
  });
}

interface TasksViewProps {
  tasks: Task[];
  taskFieldDefs: TaskFieldDef[];
  taskViews: TaskViewConfig[];
  tags: Tag[];
  characters: Character[];
  scenes: Scene[];
  onTasksChange: (tasks: Task[]) => void;
  onTaskFieldDefsChange: (defs: TaskFieldDef[]) => void;
  onTaskViewsChange: (views: TaskViewConfig[]) => void;
}

const defaultVisibleColumns = BUILTIN_COLUMNS.map(c => c.id);

export default function TasksView({
  tasks,
  taskFieldDefs,
  taskViews,
  tags,
  characters,
  scenes,
  onTasksChange,
  onTaskFieldDefsChange,
  onTaskViewsChange,
}: TasksViewProps) {
  const [groupBy, setGroupBy] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<TaskFilter[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);

  // Timer state
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<string | null>(null);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);

  useEffect(() => {
    if (!timerStart) return;
    const interval = setInterval(() => {
      setTimerElapsed(Date.now() - timerStart);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerStart]);

  const startTimer = (taskId: string) => {
    // If another timer is running, stop it first
    if (activeTimerTaskId) {
      stopTimer();
    }
    setActiveTimerTaskId(taskId);
    setTimerStart(Date.now());
    setTimerElapsed(0);
  };

  const stopTimer = () => {
    if (!activeTimerTaskId || !timerStart) return;
    const duration = Date.now() - timerStart;
    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      startedAt: timerStart,
      duration,
    };
    // Update the task's timeEntries
    const updated = tasks.map(t =>
      t.id === activeTimerTaskId
        ? { ...t, timeEntries: [...t.timeEntries, entry], updatedAt: Date.now() }
        : t
    );
    onTasksChange(updated);
    setActiveTimerTaskId(null);
    setTimerStart(null);
    setTimerElapsed(0);
  };

  const handleAddTimeEntry = (taskId: string, entry: TimeEntry) => {
    const updated = tasks.map(t =>
      t.id === taskId
        ? { ...t, timeEntries: [...t.timeEntries, entry], updatedAt: Date.now() }
        : t
    );
    onTasksChange(updated);
  };

  // Get active timer task title
  const activeTimerTaskTitle = activeTimerTaskId
    ? tasks.find(t => t.id === activeTimerTaskId)?.title || 'Untitled'
    : '';

  function handleSortChange(field: string | undefined, dir: 'asc' | 'desc') {
    setSortBy(field);
    setSortDir(dir);
  }

  // ── View management ────────────────────────────────────────────────────

  const handleViewSelect = (viewId: string | null) => {
    setActiveViewId(viewId);
    if (!viewId) {
      // Reset to defaults
      setGroupBy(undefined);
      setSortBy(undefined);
      setSortDir('asc');
      setFilters([]);
      setVisibleColumns(defaultVisibleColumns);
      return;
    }
    const view = taskViews.find(v => v.id === viewId);
    if (view) {
      setGroupBy(view.groupBy);
      setSortBy(view.sortBy);
      setSortDir(view.sortDir || 'asc');
      setFilters(view.filters || []);
      setVisibleColumns(view.visibleColumns || defaultVisibleColumns);
    }
  };

  const handleViewSave = () => {
    if (!activeViewId) return;
    const updated = taskViews.map(v =>
      v.id === activeViewId
        ? { ...v, groupBy, sortBy, sortDir, filters, visibleColumns }
        : v
    );
    onTaskViewsChange(updated);
  };

  const handleViewSaveAs = (name: string) => {
    const newView: TaskViewConfig = {
      id: crypto.randomUUID(),
      name,
      groupBy,
      sortBy,
      sortDir,
      filters,
      visibleColumns,
    };
    onTaskViewsChange([...taskViews, newView]);
    setActiveViewId(newView.id);
  };

  const handleViewDelete = (viewId: string) => {
    onTaskViewsChange(taskViews.filter(v => v.id !== viewId));
    if (activeViewId === viewId) {
      setActiveViewId(null);
      // Reset to defaults
      setGroupBy(undefined);
      setSortBy(undefined);
      setSortDir('asc');
      setFilters([]);
      setVisibleColumns(defaultVisibleColumns);
    }
  };

  // Detect whether the current config differs from the saved view
  const viewHasChanges = useMemo(() => {
    if (!activeViewId) return false;
    const view = taskViews.find(v => v.id === activeViewId);
    if (!view) return false;
    if (view.groupBy !== groupBy) return true;
    if (view.sortBy !== sortBy) return true;
    if ((view.sortDir || 'asc') !== sortDir) return true;
    if (JSON.stringify(view.filters || []) !== JSON.stringify(filters)) return true;
    const savedCols = view.visibleColumns || defaultVisibleColumns;
    if (JSON.stringify(savedCols) !== JSON.stringify(visibleColumns)) return true;
    return false;
  }, [activeViewId, taskViews, groupBy, sortBy, sortDir, filters, visibleColumns]);

  const filteredTasks = filterTasks(tasks, filters, characters);

  return (
    <div className="tasks-view">
      <TaskToolbar
        groupBy={groupBy}
        sortBy={sortBy}
        sortDir={sortDir}
        taskFieldDefs={taskFieldDefs}
        taskCount={filteredTasks.length}
        onGroupByChange={setGroupBy}
        onSortChange={handleSortChange}
        showFilter={showFilter}
        onToggleFilter={() => setShowFilter(!showFilter)}
        filterCount={filters.length}
        activeTimerTaskId={activeTimerTaskId}
        activeTimerTaskTitle={activeTimerTaskTitle}
        timerElapsed={timerElapsed}
        onStopTimer={stopTimer}
        taskViews={taskViews}
        activeViewId={activeViewId}
        onViewSelect={handleViewSelect}
        onViewSave={handleViewSave}
        onViewSaveAs={handleViewSaveAs}
        onViewDelete={handleViewDelete}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        viewHasChanges={viewHasChanges}
      />
      {showFilter && (
        <TaskFilterBar
          filters={filters}
          taskFieldDefs={taskFieldDefs}
          characters={characters}
          tags={tags}
          onFiltersChange={setFilters}
        />
      )}
      <div className="tasks-table-wrap">
        <TaskTable
          tasks={filteredTasks}
          characters={characters}
          scenes={scenes}
          tags={tags}
          taskFieldDefs={taskFieldDefs}
          onTasksChange={onTasksChange}
          onTaskFieldDefsChange={onTaskFieldDefsChange}
          groupBy={groupBy}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          activeTimerTaskId={activeTimerTaskId}
          onStartTimer={startTimer}
          onStopTimer={stopTimer}
          onAddTimeEntry={handleAddTimeEntry}
          visibleColumns={visibleColumns}
        />
      </div>
    </div>
  );
}
