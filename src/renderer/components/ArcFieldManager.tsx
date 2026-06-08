import { useState } from 'react';
import type { ArcFieldDef } from '../../shared/types';

export const ARC_FIELD_TYPES: { value: ArcFieldDef['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'rating', label: 'Rating (1–5)' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-select' },
];

// Predefined option colors (hex).
export const OPTION_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#64748b', '#a16207',
];

interface FieldForm {
  label: string;
  type: ArcFieldDef['type'];
  options: string[];
  optionColors: Record<string, string>;
  ratingMax: number;
}

function blankForm(base?: Partial<ArcFieldDef>): FieldForm {
  const opts = base?.options ?? [''];
  const labelColors = base?.optionColors ?? {};
  const optionColors: Record<string, string> = {};
  opts.forEach((label, i) => { if (labelColors[label]) optionColors[String(i)] = labelColors[label]; });
  return {
    label: base?.label ?? '',
    type: base?.type ?? 'text',
    options: opts,
    optionColors,
    ratingMax: base?.ratingMax ?? 5,
  };
}

interface ArcFieldManagerProps {
  defs: ArcFieldDef[];
  onSave: (defs: ArcFieldDef[]) => void;
  onBack: () => void;
}

export default function ArcFieldManager({ defs, onSave, onBack }: ArcFieldManagerProps) {
  const [localDefs, setLocalDefs] = useState<ArcFieldDef[]>(defs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FieldForm>(blankForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(blankForm());
    setShowForm(true);
  }

  function openEdit(def: ArcFieldDef) {
    setEditingId(def.id);
    setForm(blankForm(def));
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function commitForm() {
    if (!form.label.trim()) return;
    const isDropdownType = form.type === 'dropdown' || form.type === 'multiselect';
    const options = isDropdownType ? form.options.map(o => o.trim()).filter(Boolean) : undefined;
    const optionColors = isDropdownType
      ? Object.fromEntries(
          form.options
            .map((o, i) => [o.trim(), form.optionColors[String(i)]])
            .filter(([label, color]) => label && color)
        )
      : undefined;
    const ratingMax = form.type === 'rating' ? Math.max(1, Math.min(10, form.ratingMax)) : undefined;

    if (editingId) {
      const next = localDefs.map(d =>
        d.id === editingId
          ? { ...d, label: form.label.trim(), type: form.type, options, optionColors, ratingMax }
          : d
      );
      setLocalDefs(next);
      onSave(next);
    } else {
      const newDef: ArcFieldDef = {
        id: crypto.randomUUID(),
        label: form.label.trim(),
        type: form.type,
        options,
        optionColors,
        ratingMax,
        order: localDefs.length,
      };
      const next = [...localDefs, newDef];
      setLocalDefs(next);
      onSave(next);
    }
    setShowForm(false);
    setEditingId(null);
  }

  function deleteDef(id: string) {
    const next = localDefs.filter(d => d.id !== id).map((d, i) => ({ ...d, order: i }));
    setLocalDefs(next);
    onSave(next);
    setConfirmDeleteId(null);
  }

  function moveDef(id: string, dir: -1 | 1) {
    const idx = localDefs.findIndex(d => d.id === id);
    if (idx < 0) return;
    const next = [...localDefs];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const reordered = next.map((d, i) => ({ ...d, order: i }));
    setLocalDefs(reordered);
    onSave(reordered);
  }

  function setOption(i: number, v: string) {
    setForm(f => {
      const opts = [...f.options];
      opts[i] = v;
      return { ...f, options: opts };
    });
  }

  function addOption() {
    setForm(f => ({ ...f, options: [...f.options, ''] }));
  }

  function removeOption(i: number) {
    setForm(f => ({ ...f, options: f.options.filter((_, j) => j !== i) }));
  }

  function setOptionColor(optIdx: number, color: string) {
    setForm(f => ({ ...f, optionColors: { ...f.optionColors, [String(optIdx)]: color } }));
  }

  const isDropdownType = form.type === 'dropdown' || form.type === 'multiselect';

  return (
    <div className="arc-fm">
      <div className="arc-fm-header">
        <button className="arc-fm-back" onClick={onBack} type="button">&larr; Back</button>
        <span className="arc-fm-title">Custom Fields</span>
        <button className="arc-fm-add-btn" onClick={openAdd} type="button">+ Add field</button>
      </div>

      {showForm && (
        <div className="arc-fm-form">
          <div className="arc-fm-form-row">
            <label className="arc-fm-label">Field name</label>
            <input
              className="arc-fm-input"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Theme, Subplot, Stakes..."
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') commitForm(); if (e.key === 'Escape') cancelForm(); }}
            />
          </div>
          <div className="arc-fm-form-row">
            <label className="arc-fm-label">Type</label>
            <select
              className="arc-fm-select"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as ArcFieldDef['type'] }))}
            >
              {ARC_FIELD_TYPES.map(ft => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>
          {form.type === 'rating' && (
            <div className="arc-fm-form-row">
              <label className="arc-fm-label">Max rating</label>
              <input
                className="arc-fm-input arc-fm-input-sm"
                type="number"
                min={1}
                max={10}
                value={form.ratingMax}
                onChange={e => setForm(f => ({ ...f, ratingMax: parseInt(e.target.value, 10) || 5 }))}
              />
            </div>
          )}
          {isDropdownType && (
            <div className="arc-fm-form-row arc-fm-options-row">
              <label className="arc-fm-label">Options</label>
              <div className="arc-fm-options">
                {form.options.map((opt, i) => (
                  <div key={i} className="arc-fm-option-row">
                    <input
                      className="arc-fm-input arc-fm-option-input"
                      value={opt}
                      onChange={e => setOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                    />
                    <div className="arc-fm-color-swatches">
                      {OPTION_COLORS.map(c => (
                        <span
                          key={c}
                          className={`arc-fm-swatch${form.optionColors[String(i)] === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setOptionColor(i, form.optionColors[String(i)] === c ? '' : c)}
                        />
                      ))}
                    </div>
                    <button className="arc-fm-option-remove" onClick={() => removeOption(i)} type="button">&times;</button>
                  </div>
                ))}
                <button className="arc-fm-add-option" onClick={addOption} type="button">+ Add option</button>
              </div>
            </div>
          )}
          <div className="arc-fm-form-actions">
            <button className="arc-fm-btn-secondary" onClick={cancelForm} type="button">Cancel</button>
            <button className="arc-fm-btn-primary" onClick={commitForm} disabled={!form.label.trim()} type="button">
              {editingId ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="arc-fm-list">
        {localDefs.length === 0 && !showForm && (
          <div className="arc-fm-empty">No custom fields yet. Click &quot;+ Add field&quot; to create one.</div>
        )}
        {localDefs.map((def, idx) => (
          <div key={def.id} className={`arc-fm-def-row${editingId === def.id && showForm ? ' editing' : ''}`}>
            <div className="arc-fm-def-info">
              <span className="arc-fm-def-label">{def.label}</span>
              <span className="arc-fm-def-type">{ARC_FIELD_TYPES.find(t => t.value === def.type)?.label}</span>
            </div>
            <div className="arc-fm-def-actions">
              <button className="arc-fm-icon-btn" onClick={() => moveDef(def.id, -1)} disabled={idx === 0} type="button" title="Move up">&#8593;</button>
              <button className="arc-fm-icon-btn" onClick={() => moveDef(def.id, 1)} disabled={idx === localDefs.length - 1} type="button" title="Move down">&#8595;</button>
              <button className="arc-fm-icon-btn" onClick={() => openEdit(def)} type="button" title="Edit">&#9998;</button>
              {confirmDeleteId === def.id
                ? <>
                    <span className="arc-fm-confirm-text">Delete?</span>
                    <button className="arc-fm-icon-btn arc-fm-danger" onClick={() => deleteDef(def.id)} type="button">Yes</button>
                    <button className="arc-fm-icon-btn" onClick={() => setConfirmDeleteId(null)} type="button">No</button>
                  </>
                : <button className="arc-fm-icon-btn arc-fm-danger" onClick={() => setConfirmDeleteId(def.id)} type="button" title="Delete">&times;</button>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
