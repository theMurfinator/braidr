import type { Task, TaskFieldDef, Character, Scene, Tag } from '../../../shared/types';

interface TaskRowProps {
  task: Task;
  characters: Character[];
  scenes: Scene[];
  tags: Tag[];
  taskFieldDefs: TaskFieldDef[];
  onTaskUpdate: (updated: Task) => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: '#9e9e9e',
  'in-progress': '#2196f3',
  done: '#4caf50',
};

const PRIORITY_COLORS: Record<string, string> = {
  none: '#9e9e9e',
  low: '#8bc34a',
  medium: '#ff9800',
  high: '#f44336',
  urgent: '#9c27b0',
};

const TAG_CATEGORY_COLORS: Record<string, string> = {
  people: '#3D8B40',
  locations: '#3A7BC8',
  arcs: '#C44D5E',
  things: '#7B4FA2',
  time: '#D4820A',
};

function formatDuration(ms: number): string {
  if (!ms) return '0m';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function TaskRow({
  task,
  characters,
  scenes,
  tags,
  taskFieldDefs,
}: TaskRowProps) {
  // Resolve tag objects
  const resolvedTags = task.tags
    .map((tagId) => tags.find((t) => t.id === tagId || t.name === tagId))
    .filter(Boolean);

  // Resolve characters
  const resolvedCharacters = task.characterIds
    .map((cId) => characters.find((c) => c.id === cId))
    .filter(Boolean);

  // Resolve scene
  let sceneLabel = '';
  if (task.sceneKey) {
    const [charId, sceneNumStr] = task.sceneKey.split(':');
    const char = characters.find((c) => c.id === charId);
    const sceneNum = parseInt(sceneNumStr, 10);
    if (char) {
      sceneLabel = `${char.name} \u2014 Scene #${sceneNum}`;
    }
  }

  // Time tracked
  const totalTime = task.timeEntries.reduce((sum, e) => sum + e.duration, 0);

  return (
    <tr>
      {/* Title */}
      <td className="task-title-cell">{task.title}</td>

      {/* Status */}
      <td>
        <span
          className="task-status-pill"
          style={{ background: STATUS_COLORS[task.status] || '#9e9e9e' }}
        >
          {task.status}
        </span>
      </td>

      {/* Priority */}
      <td>
        <span
          className="task-priority-badge"
          style={{ background: PRIORITY_COLORS[task.priority] || '#9e9e9e' }}
        >
          {task.priority}
        </span>
      </td>

      {/* Tags */}
      <td>
        {resolvedTags.map((tag) => (
          <span
            key={tag!.id}
            className="task-tag-pill"
            style={{
              background: TAG_CATEGORY_COLORS[tag!.category]
                ? `${TAG_CATEGORY_COLORS[tag!.category]}18`
                : undefined,
              color: TAG_CATEGORY_COLORS[tag!.category] || undefined,
            }}
          >
            {tag!.name}
          </span>
        ))}
      </td>

      {/* Characters */}
      <td>
        {resolvedCharacters.map((char) => (
          <span
            key={char!.id}
            className="task-character-pill"
            style={{ background: char!.color || '#666' }}
          >
            {char!.name}
          </span>
        ))}
      </td>

      {/* Scene */}
      <td>{sceneLabel}</td>

      {/* Due Date */}
      <td>
        {task.dueDate
          ? new Date(task.dueDate).toLocaleDateString()
          : ''}
      </td>

      {/* Time Tracked */}
      <td>{formatDuration(totalTime)}</td>

      {/* Time Estimate */}
      <td>{task.timeEstimate ? formatDuration(task.timeEstimate) : ''}</td>

      {/* Custom fields */}
      {taskFieldDefs.map((def) => {
        const value = task.customFields[def.id];
        return (
          <td key={def.id} style={def.type === 'number' ? { textAlign: 'right' } : undefined}>
            {renderCustomField(def, value)}
          </td>
        );
      })}
    </tr>
  );
}

function renderCustomField(def: TaskFieldDef, value: unknown) {
  if (value === undefined || value === null) return null;

  switch (def.type) {
    case 'text':
      return String(value);
    case 'number':
      return String(value);
    case 'checkbox':
      return <input type="checkbox" checked={!!value} disabled />;
    case 'dropdown':
      return String(value);
    case 'date':
      return value ? new Date(value as number | string).toLocaleDateString() : '';
    default:
      return String(value);
  }
}
