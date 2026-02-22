import type { TaskFilter, TaskFieldDef, Character, Tag, TaskFieldType } from '../../../shared/types';

interface TaskFilterBarProps {
  filters: TaskFilter[];
  taskFieldDefs: TaskFieldDef[];
  characters: Character[];
  tags: Tag[];
  onFiltersChange: (filters: TaskFilter[]) => void;
}

type FieldOption = {
  id: string;
  name: string;
  type: 'text' | 'enum' | 'multi' | 'date' | 'number' | 'checkbox';
  options?: string[];
};

const BUILTIN_FIELDS: FieldOption[] = [
  { id: 'title', name: 'Title', type: 'text' },
  { id: 'status', name: 'Status', type: 'enum', options: ['open', 'in-progress', 'done'] },
  { id: 'priority', name: 'Priority', type: 'enum', options: ['none', 'low', 'medium', 'high', 'urgent'] },
  { id: 'tags', name: 'Tags', type: 'multi' },
  { id: 'characters', name: 'Characters', type: 'multi' },
  { id: 'scene', name: 'Scene', type: 'text' },
  { id: 'dueDate', name: 'Due Date', type: 'date' },
  { id: 'timeTracked', name: 'Time Tracked', type: 'number' },
  { id: 'timeEstimate', name: 'Time Estimate', type: 'number' },
];

function customFieldType(type: TaskFieldType): FieldOption['type'] {
  switch (type) {
    case 'text': return 'text';
    case 'number': return 'number';
    case 'checkbox': return 'checkbox';
    case 'dropdown': return 'enum';
    case 'date': return 'date';
    default: return 'text';
  }
}

function getOperators(type: FieldOption['type']): { id: TaskFilter['operator']; name: string }[] {
  switch (type) {
    case 'text':
      return [
        { id: 'is', name: 'is' },
        { id: 'is_not', name: 'is not' },
        { id: 'contains', name: 'contains' },
      ];
    case 'enum':
      return [
        { id: 'is', name: 'is' },
        { id: 'is_not', name: 'is not' },
      ];
    case 'multi':
      return [
        { id: 'contains', name: 'contains' },
      ];
    case 'date':
    case 'number':
      return [
        { id: 'is', name: 'is' },
        { id: 'is_not', name: 'is not' },
        { id: 'is_set', name: 'is set' },
        { id: 'is_not_set', name: 'is not set' },
      ];
    case 'checkbox':
      return [
        { id: 'is', name: 'is' },
      ];
    default:
      return [{ id: 'is', name: 'is' }];
  }
}

function formatOperator(op: string): string {
  return op.replace(/_/g, ' ');
}

function formatValue(value: TaskFilter['value']): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export default function TaskFilterBar({
  filters,
  taskFieldDefs,
  characters,
  tags,
  onFiltersChange,
}: TaskFilterBarProps) {
  const allFields: FieldOption[] = [
    ...BUILTIN_FIELDS,
    ...taskFieldDefs.map((def) => ({
      id: def.id,
      name: def.name,
      type: customFieldType(def.type),
      options: def.options,
    })),
  ];

  function getField(fieldId: string): FieldOption {
    return allFields.find((f) => f.id === fieldId) || { id: fieldId, name: fieldId, type: 'text' };
  }

  function addFilter() {
    const newFilter: TaskFilter = { field: 'status', operator: 'is', value: '' };
    onFiltersChange([...filters, newFilter]);
  }

  function removeFilter(index: number) {
    onFiltersChange(filters.filter((_, i) => i !== index));
  }

  function updateFilter(index: number, patch: Partial<TaskFilter>) {
    const updated = filters.map((f, i) => {
      if (i !== index) return f;
      const merged = { ...f, ...patch };

      // If field changed, reset operator and value
      if (patch.field && patch.field !== f.field) {
        const fieldDef = getField(patch.field);
        const ops = getOperators(fieldDef.type);
        merged.operator = ops[0].id;
        merged.value = fieldDef.type === 'checkbox' ? 'true' : '';
      }

      // If operator changed to is_set/is_not_set, clear value
      if (patch.operator === 'is_set' || patch.operator === 'is_not_set') {
        merged.value = undefined;
      }

      return merged;
    });
    onFiltersChange(updated);
  }

  function getValueOptions(fieldId: string): string[] | null {
    const field = getField(fieldId);
    if (field.id === 'tags') return tags.map((t) => t.name);
    if (field.id === 'characters') return characters.map((c) => c.name);
    if (field.options) return field.options;
    return null;
  }

  function renderValueInput(filter: TaskFilter, index: number) {
    // No value needed for is_set / is_not_set
    if (filter.operator === 'is_set' || filter.operator === 'is_not_set') return null;

    const field = getField(filter.field);

    // Checkbox: true/false dropdown
    if (field.type === 'checkbox') {
      return (
        <select
          value={String(filter.value ?? 'true')}
          onChange={(e) => updateFilter(index, { value: e.target.value })}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    // Date input
    if (field.type === 'date') {
      return (
        <input
          type="date"
          value={String(filter.value ?? '')}
          onChange={(e) => updateFilter(index, { value: e.target.value })}
        />
      );
    }

    // Number input
    if (field.type === 'number') {
      return (
        <input
          type="number"
          value={String(filter.value ?? '')}
          onChange={(e) => updateFilter(index, { value: e.target.value })}
        />
      );
    }

    const options = getValueOptions(filter.field);

    // Multi-select fields (tags, characters) — use a multi-select dropdown
    if (field.type === 'multi' && options) {
      const selected = Array.isArray(filter.value) ? filter.value : filter.value ? [filter.value] : [];
      return (
        <select
          multiple
          value={selected}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions, (o) => o.value);
            updateFilter(index, { value: vals });
          }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    // Enum fields with options — dropdown
    if (options) {
      return (
        <select
          value={String(filter.value ?? '')}
          onChange={(e) => updateFilter(index, { value: e.target.value })}
        >
          <option value="">--</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    // Fallback: text input
    return (
      <input
        type="text"
        value={String(filter.value ?? '')}
        placeholder="Value..."
        onChange={(e) => updateFilter(index, { value: e.target.value })}
      />
    );
  }

  return (
    <div className="tasks-filter-bar">
      {/* Active filter pills */}
      {filters.length > 0 && (
        <div className="tasks-filter-pills">
          {filters.map((f, i) => (
            <span key={i} className="tasks-filter-pill">
              {getField(f.field).name} {formatOperator(f.operator)}{f.value != null && f.value !== '' ? ` ${formatValue(f.value)}` : ''}
              <button
                className="tasks-filter-pill-remove"
                onClick={() => removeFilter(i)}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Filter rows */}
      {filters.map((f, i) => (
        <div key={i} className="tasks-filter-row">
          {/* Field dropdown */}
          <select
            value={f.field}
            onChange={(e) => updateFilter(i, { field: e.target.value })}
          >
            {allFields.map((field) => (
              <option key={field.id} value={field.id}>{field.name}</option>
            ))}
          </select>

          {/* Operator dropdown */}
          <select
            value={f.operator}
            onChange={(e) => updateFilter(i, { operator: e.target.value as TaskFilter['operator'] })}
          >
            {getOperators(getField(f.field).type).map((op) => (
              <option key={op.id} value={op.id}>{op.name}</option>
            ))}
          </select>

          {/* Value input */}
          {renderValueInput(f, i)}

          {/* Remove button */}
          <button
            className="tasks-filter-remove"
            onClick={() => removeFilter(i)}
          >
            &times;
          </button>
        </div>
      ))}

      {/* Add filter button */}
      <button className="tasks-add-filter-btn" onClick={addFilter}>
        + Add filter
      </button>
    </div>
  );
}
