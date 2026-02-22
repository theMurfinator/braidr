import { Fragment, useState, useRef, useCallback } from 'react';
import type { Task, TaskFieldDef, Character, Scene, Tag, TimeEntry } from '../../../shared/types';
import TaskRow from './TaskRow';
import TaskFieldManager from './TaskFieldManager';

export const BUILTIN_COLUMNS = [
  { id: 'title', name: 'Title', width: 280 },
  { id: 'status', name: 'Status', width: 120 },
  { id: 'priority', name: 'Priority', width: 100 },
  { id: 'tags', name: 'Tags', width: 160 },
  { id: 'characters', name: 'Characters', width: 160 },
  { id: 'scene', name: 'Scene', width: 180 },
  { id: 'dueDate', name: 'Due Date', width: 120 },
  { id: 'timeTracked', name: 'Time Tracked', width: 110 },
  { id: 'timeEstimate', name: 'Time Estimate', width: 110 },
] as const;

interface TaskTableProps {
  tasks: Task[];
  allTaskCount: number;
  characters: Character[];
  scenes: Scene[];
  tags: Tag[];
  taskFieldDefs: TaskFieldDef[];
  onTasksChange: (tasks: Task[]) => void;
  onTaskFieldDefsChange: (defs: TaskFieldDef[]) => void;
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (field: string | undefined, dir: 'asc' | 'desc') => void;
  activeTimerTaskId: string | null;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onAddTimeEntry: (taskId: string, entry: TimeEntry) => void;
  visibleColumns?: string[];
}

function groupTasks(
  tasks: Task[],
  groupBy: string,
  characters: Character[],
  _taskFieldDefs: TaskFieldDef[],
): { label: string; tasks: Task[] }[] {
  const groups = new Map<string, Task[]>();

  for (const task of tasks) {
    let key: string;
    switch (groupBy) {
      case 'status':
        key = task.status;
        break;
      case 'priority':
        key = task.priority;
        break;
      case 'characters': {
        const char = characters.find((c) => task.characterIds.includes(c.id));
        key = char?.name || 'Unassigned';
        break;
      }
      case 'scene':
        key = task.sceneKey || 'No scene';
        break;
      case 'tags': {
        if (task.tags.length === 0) {
          const arr = groups.get('Untagged') || [];
          arr.push(task);
          groups.set('Untagged', arr);
          continue;
        }
        for (const tag of task.tags) {
          const arr = groups.get(tag) || [];
          arr.push(task);
          groups.set(tag, arr);
        }
        continue;
      }
      default: {
        const val = String(task.customFields[groupBy] || 'Unset');
        key = val;
        break;
      }
    }
    const arr = groups.get(key) || [];
    arr.push(task);
    groups.set(key, arr);
  }

  return Array.from(groups.entries()).map(([label, tasks]) => ({ label, tasks }));
}

function sortTasks(
  tasks: Task[],
  sortBy: string,
  sortDir: 'asc' | 'desc',
  _characters: Character[],
): Task[] {
  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'status': {
        const order: Record<string, number> = { open: 0, 'in-progress': 1, done: 2 };
        cmp = (order[a.status] || 0) - (order[b.status] || 0);
        break;
      }
      case 'priority': {
        const order: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
        cmp = (order[a.priority] || 0) - (order[b.priority] || 0);
        break;
      }
      case 'dueDate':
        cmp = (a.dueDate || 0) - (b.dueDate || 0);
        break;
      case 'timeTracked': {
        const aTime = a.timeEntries.reduce((s, e) => s + e.duration, 0);
        const bTime = b.timeEntries.reduce((s, e) => s + e.duration, 0);
        cmp = aTime - bTime;
        break;
      }
      case 'timeEstimate':
        cmp = (a.timeEstimate || 0) - (b.timeEstimate || 0);
        break;
      default: {
        const aVal = String(a.customFields[sortBy] || '');
        const bVal = String(b.customFields[sortBy] || '');
        cmp = aVal.localeCompare(bVal);
        break;
      }
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

export default function TaskTable({
  tasks,
  allTaskCount,
  characters,
  scenes,
  tags,
  taskFieldDefs,
  onTasksChange,
  onTaskFieldDefsChange,
  groupBy,
  sortBy,
  sortDir = 'asc',
  onSortChange,
  activeTimerTaskId,
  onStartTimer,
  onStopTimer,
  onAddTimeEntry,
  visibleColumns,
}: TaskTableProps) {
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Column widths: keyed by column id, initialized from defaults
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    for (const col of BUILTIN_COLUMNS) widths[col.id] = col.width;
    for (const def of taskFieldDefs) widths[def.id] = def.width || 120;
    return widths;
  });
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colId] || 120;
    resizingRef.current = { colId, startX, startWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newWidth = Math.max(50, resizingRef.current.startWidth + delta);
      setColumnWidths(prev => ({ ...prev, [resizingRef.current!.colId]: newWidth }));
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths]);

  const columns = visibleColumns
    ? BUILTIN_COLUMNS.filter(c => visibleColumns.includes(c.id))
    : BUILTIN_COLUMNS;

  const visibleFieldDefs = visibleColumns
    ? taskFieldDefs.filter(d => visibleColumns.includes(d.id))
    : taskFieldDefs;

  const totalColumns = columns.length + visibleFieldDefs.length + 2;

  function handleCreateField(field: TaskFieldDef) {
    onTaskFieldDefsChange([...taskFieldDefs, field]);
    setShowFieldManager(false);
  }

  function handleAddTask() {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: '',
      status: 'open',
      priority: 'none',
      tags: [],
      characterIds: [],
      timeEntries: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: tasks.length,
      customFields: {},
    };
    onTasksChange([...tasks, newTask]);
  }

  function handleTaskUpdate(updated: Task) {
    onTasksChange(tasks.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleDeleteTask(taskId: string) {
    onTasksChange(tasks.filter(t => t.id !== taskId));
  }

  function handleDuplicateTask(taskId: string) {
    const original = tasks.find(t => t.id === taskId);
    if (!original) return;
    const duplicate: Task = {
      ...original,
      id: crypto.randomUUID(),
      title: `${original.title} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: tasks.length,
      timeEntries: [],
    };
    onTasksChange([...tasks, duplicate]);
  }

  function toggleGroupCollapse(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function handleColumnHeaderClick(columnId: string) {
    if (!onSortChange) return;
    if (sortBy === columnId) {
      onSortChange(columnId, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(columnId, 'asc');
    }
  }

  // Apply sorting
  let processedTasks = [...tasks].sort((a, b) => a.order - b.order);
  if (sortBy) {
    processedTasks = sortTasks(processedTasks, sortBy, sortDir, characters);
  }

  // Apply grouping
  const groups = groupBy
    ? groupTasks(processedTasks, groupBy, characters, taskFieldDefs)
    : null;

  // If grouped and sorted, sort within each group (already sorted above, but ensure order)
  // Since we sorted processedTasks first, and groupTasks preserves order, groups are already sorted.

  function renderSortIndicator(columnId: string) {
    if (sortBy !== columnId) return null;
    return (
      <span className="task-sort-indicator">
        {sortDir === 'asc' ? '\u25B2' : '\u25BC'}
      </span>
    );
  }

  function handleCreateFirstTask() {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: '',
      status: 'open',
      priority: 'none',
      tags: [],
      characterIds: [],
      timeEntries: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: 0,
      customFields: {},
    };
    onTasksChange([newTask]);
  }

  function renderTaskRows(taskList: Task[]) {
    return taskList.map((task) => (
      <TaskRow
        key={task.id}
        task={task}
        characters={characters}
        scenes={scenes}
        tags={tags}
        taskFieldDefs={taskFieldDefs}
        onTaskUpdate={handleTaskUpdate}
        onDeleteTask={handleDeleteTask}
        onDuplicateTask={handleDuplicateTask}
        activeTimerTaskId={activeTimerTaskId}
        onStartTimer={onStartTimer}
        onStopTimer={onStopTimer}
        onAddTimeEntry={onAddTimeEntry}
        visibleColumns={visibleColumns}
      />
    ));
  }

  // Empty state: no tasks at all
  if (tasks.length === 0 && allTaskCount === 0) {
    return (
      <div className="tasks-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <h3>No tasks yet</h3>
        <p>Create your first task to start tracking your writing work.</p>
        <button className="tasks-empty-btn" onClick={handleCreateFirstTask}>+ Create Task</button>
      </div>
    );
  }

  // Empty state: all tasks filtered out
  if (tasks.length === 0 && allTaskCount > 0) {
    return (
      <div className="tasks-empty">
        <h3>No matching tasks</h3>
        <p>Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <>
      <table className="tasks-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                style={{ width: columnWidths[col.id] || col.width, cursor: onSortChange ? 'pointer' : undefined }}
                onClick={() => handleColumnHeaderClick(col.id)}
              >
                {col.name}
                {renderSortIndicator(col.id)}
                <div
                  className="task-col-resize"
                  onMouseDown={(e) => handleResizeStart(col.id, e)}
                />
              </th>
            ))}
            {visibleFieldDefs.map((def) => (
              <th
                key={def.id}
                style={{ width: columnWidths[def.id] || def.width || 120, cursor: onSortChange ? 'pointer' : undefined }}
                onClick={() => handleColumnHeaderClick(def.id)}
              >
                {def.name}
                {renderSortIndicator(def.id)}
                <div
                  className="task-col-resize"
                  onMouseDown={(e) => handleResizeStart(def.id, e)}
                />
              </th>
            ))}
            <th style={{ width: 60 }}></th>
            <th className="task-add-field-th">
              <button
                className="task-add-field-btn"
                onClick={() => setShowFieldManager(true)}
                title="Add custom field"
              >
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.label);
                return (
                  <Fragment key={group.label}>
                    <tr
                      className="task-group-header"
                      onClick={() => toggleGroupCollapse(group.label)}
                    >
                      <td colSpan={totalColumns}>
                        {isCollapsed ? '\u25B6' : '\u25BC'} {group.label}
                        <span className="task-group-count">({group.tasks.length})</span>
                      </td>
                    </tr>
                    {!isCollapsed && renderTaskRows(group.tasks)}
                  </Fragment>
                );
              })
            : renderTaskRows(processedTasks)}
        </tbody>
        <tfoot>
          <tr>
            <td className="task-add-row" colSpan={totalColumns}>
              <button className="task-add-btn" onClick={handleAddTask}>
                + Add task
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
      {showFieldManager && (
        <TaskFieldManager
          onClose={() => setShowFieldManager(false)}
          onCreate={handleCreateField}
        />
      )}
    </>
  );
}
