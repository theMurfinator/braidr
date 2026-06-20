import { useState } from 'react';
import type { Task, TaskFieldDef, Character, Scene, Tag, TimeEntry } from '../../../shared/types';
import TaskRow from './TaskRow';

interface TaskRowGroupProps {
  task: Task;
  characters: Character[];
  scenes: Scene[];
  tags: Tag[];
  taskFieldDefs: TaskFieldDef[];
  onTaskUpdate: (updated: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => void;
  onCreateSubtask: (parentId: string) => string;
  onMoveSubtask: (taskId: string, parentId: string | null, afterTaskId: string | null) => void;
  activeTimerTaskId: string | null;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onAddTimeEntry: (taskId: string, entry: TimeEntry) => void;
  onUpdateTimeEntry: (taskId: string, entryId: string, updates: Partial<Pick<TimeEntry, 'duration' | 'description'>>) => void;
  onDeleteTimeEntry: (taskId: string, entryId: string) => void;
  visibleColumns?: string[];
  onOpenTaskPanel?: (taskId: string) => void;
  activePanelTaskId?: string;
}

export default function TaskRowGroup({
  task,
  characters,
  scenes,
  tags,
  taskFieldDefs,
  onTaskUpdate,
  onDeleteTask,
  onDuplicateTask,
  onCreateSubtask,
  activeTimerTaskId,
  onStartTimer,
  onStopTimer,
  onAddTimeEntry,
  onUpdateTimeEntry,
  onDeleteTimeEntry,
  visibleColumns,
  onOpenTaskPanel,
  activePanelTaskId,
}: TaskRowGroupProps) {
  const storageKey = `task-expanded-${task.id}`;
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) !== '0'; } catch { return true; }
  });
  const [focusSubtaskId, setFocusSubtaskId] = useState<string | null>(null);

  const hasSubtasks = task.subtasks.length > 0;
  const rolledUpTime =
    task.timeEntries.reduce((s, e) => s + e.duration, 0) +
    task.subtasks.reduce((s, sub) => s + sub.timeEntries.reduce((ss, e) => ss + e.duration, 0), 0);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* ignore */ }
  }

  const sharedProps = {
    characters,
    scenes,
    tags,
    taskFieldDefs,
    onTaskUpdate,
    onDeleteTask,
    onDuplicateTask,
    activeTimerTaskId,
    onStartTimer,
    onStopTimer,
    onAddTimeEntry,
    onUpdateTimeEntry,
    onDeleteTimeEntry,
    visibleColumns,
  };

  return (
    <>
      <TaskRow
        {...sharedProps}
        task={task}
        rolledUpTime={hasSubtasks ? rolledUpTime : undefined}
        onOpenPanel={() => onOpenTaskPanel?.(task.id)}
        activePanelTaskId={activePanelTaskId}
        onCreateSubtask={() => {
          const newId = onCreateSubtask(task.id);
          setExpanded(true);
          try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
          setFocusSubtaskId(newId);
          return newId;
        }}
        expandToggle={
          hasSubtasks ? (
            <button
              className="task-expand-toggle"
              onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}
              title={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
            >
              {expanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="task-expand-toggle task-expand-toggle-placeholder" />
          )
        }
        subtaskBadge={
          !expanded && hasSubtasks ? (
            <span className="task-subtask-badge">{task.subtasks.length}</span>
          ) : undefined
        }
      />

      {expanded && task.subtasks.map((sub) => (
        <TaskRow
          key={sub.id}
          {...sharedProps}
          task={sub}
          isSubtask
          autoFocusTitle={sub.id === focusSubtaskId}
          onOpenPanel={() => onOpenTaskPanel?.(sub.id)}
          activePanelTaskId={activePanelTaskId}
        />
      ))}
    </>
  );
}
