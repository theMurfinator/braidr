import { Fragment, useState } from 'react';
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

  const columns = visibleColumns
    ? BUILTIN_COLUMNS.filter(c => visibleColumns.includes(c.id))
    : BUILTIN_COLUMNS;

  const visibleFieldDefs = visibleColumns
    ? taskFieldDefs.filter(d => visibleColumns.includes(d.id))
    : taskFieldDefs;

  const totalColumns = columns.length + visibleFieldDefs.length + 1;

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
        activeTimerTaskId={activeTimerTaskId}
        onStartTimer={onStartTimer}
        onStopTimer={onStopTimer}
        onAddTimeEntry={onAddTimeEntry}
        visibleColumns={visibleColumns}
      />
    ));
  }

  return (
    <>
      <table className="tasks-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                style={{ width: col.width, cursor: onSortChange ? 'pointer' : undefined }}
                onClick={() => handleColumnHeaderClick(col.id)}
              >
                {col.name}
                {renderSortIndicator(col.id)}
              </th>
            ))}
            {visibleFieldDefs.map((def) => (
              <th
                key={def.id}
                style={{ width: def.width || 120, cursor: onSortChange ? 'pointer' : undefined }}
                onClick={() => handleColumnHeaderClick(def.id)}
              >
                {def.name}
                {renderSortIndicator(def.id)}
              </th>
            ))}
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
