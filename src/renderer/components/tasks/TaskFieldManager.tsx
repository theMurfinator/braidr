import { useState } from 'react';
import type { TaskFieldDef, TaskFieldType } from '../../../shared/types';

interface TaskFieldManagerProps {
  onClose: () => void;
  onCreate: (field: TaskFieldDef) => void;
}

const FIELD_TYPES: { value: TaskFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
];

export default function TaskFieldManager({ onClose, onCreate }: TaskFieldManagerProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<TaskFieldType>('text');
  const [options, setOptions] = useState<string[]>(['']);

  function handleCreate() {
    if (!name.trim()) return;

    const field: TaskFieldDef = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
    };

    if (type === 'dropdown') {
      field.options = options.map((o) => o.trim()).filter(Boolean);
    }

    onCreate(field);
  }

  function handleAddOption() {
    setOptions([...options, '']);
  }

  function handleRemoveOption(index: number) {
    setOptions(options.filter((_, i) => i !== index));
  }

  function handleOptionChange(index: number, value: string) {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="task-field-manager-overlay" onClick={handleOverlayClick}>
      <div className="task-field-manager">
        <h3>Add Custom Field</h3>

        <div className="task-field-manager-row">
          <label>Field Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sprint, Estimate, Category..."
            autoFocus
          />
        </div>

        <div className="task-field-manager-row">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as TaskFieldType)}>
            {FIELD_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {ft.label}
              </option>
            ))}
          </select>
        </div>

        {type === 'dropdown' && (
          <div className="task-field-manager-row">
            <label>Options</label>
            <div className="task-field-manager-options">
              {options.map((opt, i) => (
                <div key={i} className="task-field-manager-option-row">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                  />
                  <button
                    className="task-field-manager-option-remove"
                    onClick={() => handleRemoveOption(i)}
                    type="button"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                className="task-field-manager-add-option"
                onClick={handleAddOption}
                type="button"
              >
                + Add option
              </button>
            </div>
          </div>
        )}

        <div className="task-field-manager-actions">
          <button className="secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary"
            onClick={handleCreate}
            disabled={!name.trim()}
            type="button"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
