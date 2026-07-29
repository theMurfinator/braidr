# Arc Metadata — Phase 2: Detail Modal + Field Manager + Dynamic Grid Columns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ClickUp-style detail editor modal for Arc view acts and sections, with full custom-field support — create/edit/delete/reorder fields, see them as optional Arc grid columns, and edit them in the modal.

**Architecture:** Two new components — `ArcFieldManager` (field def CRUD panel) and `ArcDetailModal` (pure presentation modal driven by `DetailField[]`). `ArcView` gains descriptor builder functions, custom column rendering (a `'custom'` ArcColKind), and a hover expand icon per act/section row. `App.tsx` gains two save handlers (`saveArcFieldDefs`, `saveArcFieldValues`) and threads the new props to `ArcView`.

**Tech Stack:** React, TypeScript, existing CSS custom properties (`--bg-primary`, `--border`, `--accent`, etc.), `src/renderer/styles.css` for all new CSS.

---

## File Map

| Status | File | Responsibility |
|--------|------|----------------|
| Create | `src/renderer/components/ArcFieldManager.tsx` | CRUD panel for arc field defs (add/edit/delete/reorder) |
| Create | `src/renderer/components/ArcDetailModal.tsx` | ClickUp-style modal; exports `DetailField`, `FieldRender` types |
| Modify | `src/renderer/App.tsx` | `handleSaveArcFieldDefs`, `handleSaveArcFieldValues`; pass props to ArcView |
| Modify | `src/renderer/components/ArcView.tsx` | new props, `'custom'` ArcColKind, `buildActDetailFields`, `buildSectionDetailFields`, hover expand icon, modal mount, column menu update |
| Modify | `src/renderer/styles.css` | CSS for modal, field manager, custom cells |

---

### Task 1: ArcFieldManager component + CSS

**Files:**
- Create: `src/renderer/components/ArcFieldManager.tsx`
- Modify: `src/renderer/styles.css` (add `.arc-fm-*` CSS at the end of the arc section)

The ArcFieldManager is a full-CRUD panel for `ArcFieldDef[]`. It is rendered inside `ArcDetailModal` when the user clicks "+ Add field" or "⚙ Manage fields". It replaces the field list in the modal's body and has its own back button.

- [ ] **Step 1: Create `ArcFieldManager.tsx`**

Create `src/renderer/components/ArcFieldManager.tsx`:

```tsx
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
  return {
    label: base?.label ?? '',
    type: base?.type ?? 'text',
    options: base?.options ?? [''],
    optionColors: base?.optionColors ?? {},
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
  const [editingId, setEditingId] = useState<string | null>(null); // null = adding new
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
    const optionColors = isDropdownType ? form.optionColors : undefined;
    const ratingMax = form.type === 'rating' ? Math.max(1, Math.min(10, form.ratingMax)) : undefined;

    if (editingId) {
      const updated = localDefs.map(d =>
        d.id === editingId
          ? { ...d, label: form.label.trim(), type: form.type, options, optionColors, ratingMax }
          : d
      );
      const next = updated;
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
    const opts = [...form.options];
    opts[i] = v;
    setForm(f => ({ ...f, options: opts }));
  }

  function addOption() {
    setForm(f => ({ ...f, options: [...f.options, ''] }));
  }

  function removeOption(i: number) {
    setForm(f => ({ ...f, options: f.options.filter((_, j) => j !== i) }));
  }

  function setOptionColor(optLabel: string, color: string) {
    setForm(f => ({ ...f, optionColors: { ...f.optionColors, [optLabel]: color } }));
  }

  const isDropdownType = form.type === 'dropdown' || form.type === 'multiselect';

  return (
    <div className="arc-fm">
      <div className="arc-fm-header">
        <button className="arc-fm-back" onClick={onBack} type="button">← Back</button>
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
                onChange={e => setForm(f => ({ ...f, ratingMax: parseInt(e.target.value) || 5 }))}
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
                          className={`arc-fm-swatch${form.optionColors[opt] === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setOptionColor(opt, form.optionColors[opt] === c ? '' : c)}
                        />
                      ))}
                    </div>
                    <button className="arc-fm-option-remove" onClick={() => removeOption(i)} type="button">×</button>
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
          <div className="arc-fm-empty">No custom fields yet. Click "+ Add field" to create one.</div>
        )}
        {localDefs.map((def, idx) => (
          <div key={def.id} className={`arc-fm-def-row${editingId === def.id && showForm ? ' editing' : ''}`}>
            <div className="arc-fm-def-info">
              <span className="arc-fm-def-label">{def.label}</span>
              <span className="arc-fm-def-type">{ARC_FIELD_TYPES.find(t => t.value === def.type)?.label}</span>
            </div>
            <div className="arc-fm-def-actions">
              <button className="arc-fm-icon-btn" onClick={() => moveDef(def.id, -1)} disabled={idx === 0} type="button" title="Move up">↑</button>
              <button className="arc-fm-icon-btn" onClick={() => moveDef(def.id, 1)} disabled={idx === localDefs.length - 1} type="button" title="Move down">↓</button>
              <button className="arc-fm-icon-btn" onClick={() => openEdit(def)} type="button" title="Edit">✎</button>
              {confirmDeleteId === def.id
                ? <>
                    <span className="arc-fm-confirm-text">Delete?</span>
                    <button className="arc-fm-icon-btn arc-fm-danger" onClick={() => deleteDef(def.id)} type="button">Yes</button>
                    <button className="arc-fm-icon-btn" onClick={() => setConfirmDeleteId(null)} type="button">No</button>
                  </>
                : <button className="arc-fm-icon-btn arc-fm-danger" onClick={() => setConfirmDeleteId(def.id)} type="button" title="Delete">✕</button>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add ArcFieldManager CSS to `styles.css`**

Search for the last `.arc-col-menu-reset` block in `styles.css` and add after it:

```css
/* ── ArcFieldManager ─────────────────────────────────────────────────────── */
.arc-fm { display: flex; flex-direction: column; gap: 12px; }
.arc-fm-header { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.arc-fm-back { background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: 13px; padding: 4px 8px; border-radius: var(--radius-sm); }
.arc-fm-back:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.arc-fm-title { flex: 1; font-size: 14px; font-weight: 600; color: var(--text-primary); }
.arc-fm-add-btn { background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); padding: 5px 12px; font-size: 13px; cursor: pointer; }
.arc-fm-add-btn:hover { opacity: 0.85; }
.arc-fm-form { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.arc-fm-form-row { display: flex; align-items: flex-start; gap: 12px; }
.arc-fm-label { width: 90px; flex-shrink: 0; font-size: 12px; color: var(--text-secondary); padding-top: 5px; }
.arc-fm-input { flex: 1; padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; background: var(--bg-primary); color: var(--text-primary); }
.arc-fm-input:focus { outline: none; border-color: var(--accent); }
.arc-fm-input-sm { width: 70px; flex: none; }
.arc-fm-select { flex: 1; padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; background: var(--bg-primary); color: var(--text-primary); }
.arc-fm-options-row { align-items: flex-start; }
.arc-fm-options { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.arc-fm-option-row { display: flex; align-items: center; gap: 6px; }
.arc-fm-option-input { flex: 1; }
.arc-fm-color-swatches { display: flex; gap: 3px; flex-wrap: wrap; max-width: 120px; }
.arc-fm-swatch { width: 14px; height: 14px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.1s; }
.arc-fm-swatch:hover { transform: scale(1.2); }
.arc-fm-swatch.selected { border-color: var(--text-primary); }
.arc-fm-option-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 0 4px; }
.arc-fm-option-remove:hover { color: #ef4444; }
.arc-fm-add-option { background: none; border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 4px 8px; font-size: 12px; color: var(--text-secondary); cursor: pointer; width: fit-content; }
.arc-fm-add-option:hover { border-color: var(--accent); color: var(--accent); }
.arc-fm-form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.arc-fm-btn-secondary { background: none; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 5px 14px; font-size: 13px; cursor: pointer; color: var(--text-secondary); }
.arc-fm-btn-secondary:hover { background: var(--bg-tertiary); }
.arc-fm-btn-primary { background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); padding: 5px 14px; font-size: 13px; cursor: pointer; }
.arc-fm-btn-primary:hover { opacity: 0.85; }
.arc-fm-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.arc-fm-list { display: flex; flex-direction: column; gap: 2px; }
.arc-fm-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px 0; }
.arc-fm-def-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid transparent; }
.arc-fm-def-row:hover { background: var(--bg-secondary); border-color: var(--border); }
.arc-fm-def-row.editing { background: var(--bg-tertiary); }
.arc-fm-def-info { display: flex; align-items: center; gap: 8px; flex: 1; }
.arc-fm-def-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.arc-fm-def-type { font-size: 11px; color: var(--text-muted); background: var(--bg-tertiary); padding: 1px 6px; border-radius: 10px; }
.arc-fm-def-actions { display: flex; align-items: center; gap: 2px; }
.arc-fm-icon-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 3px 6px; border-radius: var(--radius-sm); font-size: 13px; }
.arc-fm-icon-btn:hover:not(:disabled) { background: var(--bg-tertiary); color: var(--text-primary); }
.arc-fm-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.arc-fm-icon-btn.arc-fm-danger:hover:not(:disabled) { color: #ef4444; }
.arc-fm-confirm-text { font-size: 12px; color: #ef4444; margin-right: 4px; }
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ArcFieldManager"
```
Expected: no errors mentioning `ArcFieldManager`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ArcFieldManager.tsx src/renderer/styles.css
git commit -m "feat(arc-fields): ArcFieldManager component + CSS (Phase 2, Task 1)"
```

---

### Task 2: ArcDetailModal component + CSS

**Files:**
- Create: `src/renderer/components/ArcDetailModal.tsx`
- Modify: `src/renderer/styles.css` (add `.arc-dm-*` CSS)

A pure presentation component. It exports `DetailField` and `FieldRender` types used by ArcView's descriptor builders. The modal renders one row per `DetailField` with an editable control on the right. Contains `ArcFieldManager` for field management (toggled by state).

- [ ] **Step 1: Create `ArcDetailModal.tsx`**

Create `src/renderer/components/ArcDetailModal.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import ArcFieldManager from './ArcFieldManager';
import type { ArcFieldDef } from '../../shared/types';

// ── Public types (used by ArcView descriptor builders) ────────────────────────

export type FieldRender =
  | { kind: 'text' }
  | { kind: 'number' }
  | { kind: 'dropdown'; options: string[]; colors?: Record<string, string> }
  | { kind: 'multiselect'; options: string[]; colors?: Record<string, string> }
  | { kind: 'rating'; max: number }
  | { kind: 'polarity' };

export interface DetailField {
  id: string;
  label: string;
  icon: string;
  render: FieldRender;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  builtin: boolean;
}

interface ArcDetailModalProps {
  title: string;
  subtitle?: string;
  fields: DetailField[];
  arcFieldDefs: ArcFieldDef[];
  onSaveDefs: (defs: ArcFieldDef[]) => void;
  onClose: () => void;
}

// ── Polarity picker (mirrored from ArcView) ───────────────────────────────────
const POLARITY_COLORS: Record<string, { bg: string; color: string }> = {
  '+/-':   { bg: '#fee2e2', color: '#b91c1c' },
  '-/+':   { bg: '#dcfce7', color: '#15803d' },
  '-/-':   { bg: '#fecaca', color: '#7f1d1d' },
  '+/+':   { bg: '#14532d', color: '#dcfce7' },
  '+/-/+': { bg: '#fef9c3', color: '#854d0e' },
  '-/+/-': { bg: '#ede9fe', color: '#6d28d9' },
};
const POLARITY_OPTIONS = ['+/-', '-/+', '-/-', '+/+', '+/-/+', '-/+/-'];

function PolarityField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const style = POLARITY_COLORS[value] ?? {};
  return (
    <div ref={ref} className="arc-dm-polarity" style={{ position: 'relative' }}>
      <span
        className="arc-pol-badge"
        style={value ? { background: style.bg, color: style.color, cursor: 'pointer' } : { cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        {value || '—'}
      </span>
      {open && (
        <div className="arc-pol-picker" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
          {POLARITY_OPTIONS.map(opt => {
            const s = POLARITY_COLORS[opt];
            return (
              <span key={opt} className="arc-pol-option" onClick={() => { onChange(opt); setOpen(false); }}
                style={{ background: s.bg, color: s.color }}>
                {opt}
              </span>
            );
          })}
          <span className="arc-pol-option" style={{ color: 'var(--text-muted)' }}
            onClick={() => { onChange(''); setOpen(false); }}>clear</span>
        </div>
      )}
    </div>
  );
}

// ── Rating field ──────────────────────────────────────────────────────────────
function RatingField({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="arc-dm-rating">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`arc-dm-dot${i < value ? ' filled' : ''}`}
          onClick={() => onChange(i + 1 === value ? 0 : i + 1)}
          title={`${i + 1}/${max}`}
        />
      ))}
    </div>
  );
}

// ── Dropdown field ────────────────────────────────────────────────────────────
function DropdownField({ value, options, colors, onChange }: {
  value: string; options: string[]; colors?: Record<string, string>; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const filtered = options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase()));
  const pillStyle = value && colors?.[value] ? { background: colors[value], color: '#fff' } : {};
  return (
    <div ref={ref} className="arc-dm-dropdown">
      <div
        className={`arc-dm-pill-trigger${value ? ' has-value' : ''}`}
        style={pillStyle}
        onClick={() => { setOpen(o => !o); setSearch(''); }}
      >
        {value || 'Select...'}
      </div>
      {open && (
        <div className="arc-dm-picker">
          {options.length >= 5 && (
            <input
              className="arc-dm-picker-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          )}
          <div className="arc-dm-picker-list">
            {filtered.map(opt => (
              <div
                key={opt}
                className={`arc-dm-picker-opt${opt === value ? ' selected' : ''}`}
                style={colors?.[opt] ? { background: colors[opt], color: '#fff' } : {}}
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                {opt}
              </div>
            ))}
            {value && (
              <div className="arc-dm-picker-opt arc-dm-picker-clear" onClick={() => { onChange(''); setOpen(false); }}>
                Clear
              </div>
            )}
            {filtered.length === 0 && <div className="arc-dm-picker-empty">No match</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Multi-select field ────────────────────────────────────────────────────────
function MultiSelectField({ value, options, colors, onChange }: {
  value: string[]; options: string[]; colors?: Record<string, string>; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const filtered = options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase()));
  const toggle = (opt: string) => {
    const next = value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt];
    onChange(next);
  };
  return (
    <div ref={ref} className="arc-dm-multiselect">
      <div className="arc-dm-pills" onClick={() => { setOpen(o => !o); setSearch(''); }}>
        {value.length > 0
          ? value.map(v => (
              <span key={v} className="arc-dm-pill" style={colors?.[v] ? { background: colors[v], color: '#fff' } : {}}>
                {v}
                <span className="arc-dm-pill-x" onClick={e => { e.stopPropagation(); toggle(v); }}>×</span>
              </span>
            ))
          : <span className="arc-dm-pills-placeholder">Select...</span>}
      </div>
      {open && (
        <div className="arc-dm-picker">
          {options.length >= 5 && (
            <input
              className="arc-dm-picker-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          )}
          <div className="arc-dm-picker-list">
            {filtered.map(opt => (
              <div
                key={opt}
                className={`arc-dm-picker-opt${value.includes(opt) ? ' selected' : ''}`}
                style={colors?.[opt] ? { background: colors[opt], color: '#fff' } : {}}
                onClick={() => toggle(opt)}
              >
                {value.includes(opt) && <span className="arc-dm-check">✓</span>}
                {opt}
              </div>
            ))}
            {filtered.length === 0 && <div className="arc-dm-picker-empty">No match</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Text field ────────────────────────────────────────────────────────────────
function TextField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    if (taRef.current) autoResize(taRef.current);
  }, [draft]);
  return (
    <textarea
      ref={taRef}
      className="arc-dm-textarea"
      value={draft}
      onChange={e => { setDraft(e.target.value); autoResize(e.target); }}
      onBlur={() => { if (draft !== value) onChange(draft); }}
      rows={1}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  );
}

// ── Number field ──────────────────────────────────────────────────────────────
function NumberField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      className="arc-dm-number"
      type="number"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onChange(draft); }}
    />
  );
}

// ── Field row ─────────────────────────────────────────────────────────────────
function FieldRow({ field }: { field: DetailField }) {
  const r = field.render;
  let control: React.ReactNode;
  if (r.kind === 'text') {
    control = <TextField value={field.value as string} onChange={v => field.onChange(v)} />;
  } else if (r.kind === 'number') {
    control = <NumberField value={field.value as string} onChange={v => field.onChange(v)} />;
  } else if (r.kind === 'polarity') {
    control = <PolarityField value={field.value as string} onChange={v => field.onChange(v)} />;
  } else if (r.kind === 'rating') {
    const n = parseInt(field.value as string) || 0;
    control = <RatingField value={n} max={r.max} onChange={v => field.onChange(String(v))} />;
  } else if (r.kind === 'dropdown') {
    control = <DropdownField value={field.value as string} options={r.options} colors={r.colors} onChange={v => field.onChange(v)} />;
  } else if (r.kind === 'multiselect') {
    const vals = Array.isArray(field.value) ? field.value : [];
    control = <MultiSelectField value={vals} options={r.options} colors={r.colors} onChange={v => field.onChange(v)} />;
  } else {
    control = null;
  }

  return (
    <div className="arc-dm-field-row">
      <div className="arc-dm-field-label">
        <span className="arc-dm-field-icon">{field.icon}</span>
        <span className="arc-dm-field-name">{field.label}</span>
      </div>
      <div className="arc-dm-field-value">{control}</div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ArcDetailModal({
  title,
  subtitle,
  fields,
  arcFieldDefs,
  onSaveDefs,
  onClose,
}: ArcDetailModalProps) {
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showManager, setShowManager] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const visibleFields = hideEmpty
    ? fields.filter(f => {
        const v = f.value;
        return Array.isArray(v) ? v.length > 0 : v !== '';
      })
    : fields;

  const builtinFields = visibleFields.filter(f => f.builtin);
  const customFields = visibleFields.filter(f => !f.builtin);

  return (
    <div
      className="arc-dm-overlay"
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="arc-dm-card">
        <div className="arc-dm-header">
          <div className="arc-dm-header-left">
            {subtitle && <span className="arc-dm-subtitle">{subtitle}</span>}
            <span className="arc-dm-title">{title}</span>
          </div>
          <button className="arc-dm-close" onClick={onClose} type="button">×</button>
        </div>

        <div className="arc-dm-body">
          {showManager ? (
            <ArcFieldManager
              defs={arcFieldDefs}
              onSave={defs => onSaveDefs(defs)}
              onBack={() => setShowManager(false)}
            />
          ) : (
            <>
              {builtinFields.map(f => <FieldRow key={f.id} field={f} />)}
              {builtinFields.length > 0 && customFields.length > 0 && (
                <div className="arc-dm-section-divider">Custom</div>
              )}
              {customFields.map(f => <FieldRow key={f.id} field={f} />)}
              {visibleFields.length === 0 && (
                <div className="arc-dm-empty">All fields are empty. Uncheck "Hide empty fields" to edit.</div>
              )}
            </>
          )}
        </div>

        {!showManager && (
          <div className="arc-dm-footer">
            <label className="arc-dm-hide-toggle">
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={e => setHideEmpty(e.target.checked)}
              />
              <span>Hide empty fields</span>
            </label>
            <div className="arc-dm-footer-actions">
              <button className="arc-dm-manage-btn" onClick={() => setShowManager(true)} type="button">
                ⚙ Manage fields
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add ArcDetailModal CSS to `styles.css`**

Append after the ArcFieldManager CSS block added in Task 1:

```css
/* ── ArcDetailModal ──────────────────────────────────────────────────────── */
.arc-dm-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.arc-dm-card {
  background: var(--bg-primary); border-radius: var(--radius-lg);
  box-shadow: 0 8px 40px rgba(0,0,0,0.18);
  width: min(640px, 92vw); max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.arc-dm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.arc-dm-header-left { display: flex; flex-direction: column; gap: 2px; }
.arc-dm-subtitle { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.arc-dm-title { font-size: 17px; font-weight: 600; color: var(--text-primary); }
.arc-dm-close {
  background: none; border: none; font-size: 20px; line-height: 1; cursor: pointer;
  color: var(--text-muted); padding: 4px 8px; border-radius: var(--radius-sm);
}
.arc-dm-close:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.arc-dm-body { flex: 1; overflow-y: auto; padding: 8px 20px; }
.arc-dm-field-row {
  display: flex; align-items: flex-start; min-height: 40px;
  padding: 8px 0; border-bottom: 1px solid var(--border);
  gap: 12px;
}
.arc-dm-field-row:last-child { border-bottom: none; }
.arc-dm-field-label {
  width: 180px; flex-shrink: 0; display: flex; align-items: center;
  gap: 8px; padding-top: 2px;
}
.arc-dm-field-icon { font-size: 14px; color: var(--text-muted); width: 18px; text-align: center; }
.arc-dm-field-name { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.arc-dm-field-value { flex: 1; min-width: 0; }
.arc-dm-section-divider {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-muted); padding: 12px 0 4px;
}
.arc-dm-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px 0; }
.arc-dm-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px; border-top: 1px solid var(--border); flex-shrink: 0;
  background: var(--bg-secondary);
}
.arc-dm-hide-toggle {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  font-size: 12px; color: var(--text-secondary); user-select: none;
}
.arc-dm-footer-actions { display: flex; gap: 8px; }
.arc-dm-manage-btn {
  background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 4px 12px; font-size: 12px; color: var(--text-secondary); cursor: pointer;
}
.arc-dm-manage-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }

/* Field controls */
.arc-dm-textarea {
  width: 100%; padding: 4px 6px; border: 1px solid transparent; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--text-primary); background: transparent; line-height: 1.5;
  font-family: inherit; min-height: 24px;
}
.arc-dm-textarea:hover { border-color: var(--border); background: var(--bg-secondary); }
.arc-dm-textarea:focus { outline: none; border-color: var(--accent); background: var(--bg-primary); }
.arc-dm-number {
  padding: 4px 6px; border: 1px solid transparent; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--text-primary); background: transparent; width: 80px;
}
.arc-dm-number:hover { border-color: var(--border); background: var(--bg-secondary); }
.arc-dm-number:focus { outline: none; border-color: var(--accent); background: var(--bg-primary); }
.arc-dm-rating { display: flex; align-items: center; gap: 4px; padding-top: 4px; }
.arc-dm-dot {
  width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--border);
  cursor: pointer; transition: background 0.1s, border-color 0.1s;
}
.arc-dm-dot.filled { background: var(--accent); border-color: var(--accent); }
.arc-dm-dot:hover { border-color: var(--accent); }
.arc-dm-polarity { padding-top: 2px; }
.arc-dm-dropdown { position: relative; }
.arc-dm-pill-trigger {
  display: inline-block; padding: 3px 10px; border-radius: 12px;
  border: 1px solid var(--border); font-size: 12px; cursor: pointer;
  color: var(--text-secondary); background: var(--bg-secondary);
}
.arc-dm-pill-trigger.has-value { color: var(--text-primary); }
.arc-dm-pill-trigger:hover { border-color: var(--accent); }
.arc-dm-multiselect { position: relative; }
.arc-dm-pills {
  display: flex; flex-wrap: wrap; gap: 4px; cursor: pointer;
  min-height: 28px; align-items: center; padding: 2px 0;
}
.arc-dm-pill {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: 12px; font-size: 12px; background: var(--bg-tertiary);
  color: var(--text-primary);
}
.arc-dm-pill-x { cursor: pointer; opacity: 0.6; }
.arc-dm-pill-x:hover { opacity: 1; }
.arc-dm-pills-placeholder { font-size: 13px; color: var(--text-muted); cursor: pointer; }
.arc-dm-picker {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 20;
  background: var(--bg-primary); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  min-width: 180px; max-width: 300px;
}
.arc-dm-picker-search {
  width: 100%; padding: 8px 12px; border: none; border-bottom: 1px solid var(--border);
  font-size: 13px; background: transparent; color: var(--text-primary);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  box-sizing: border-box;
}
.arc-dm-picker-search:focus { outline: none; }
.arc-dm-picker-list { max-height: 220px; overflow-y: auto; padding: 4px; }
.arc-dm-picker-opt {
  padding: 6px 10px; border-radius: var(--radius-sm); cursor: pointer;
  font-size: 13px; display: flex; align-items: center; gap: 6px;
}
.arc-dm-picker-opt:hover { background: var(--bg-secondary); }
.arc-dm-picker-opt.selected { font-weight: 500; }
.arc-dm-picker-clear { color: var(--text-muted); border-top: 1px solid var(--border); margin-top: 4px; padding-top: 8px; }
.arc-dm-picker-empty { padding: 8px 10px; font-size: 12px; color: var(--text-muted); }
.arc-dm-check { font-size: 11px; color: inherit; }
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ArcDetailModal"
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ArcDetailModal.tsx src/renderer/styles.css
git commit -m "feat(arc-fields): ArcDetailModal component + CSS (Phase 2, Task 2)"
```

---

### Task 3: App.tsx — save handlers + prop threading

**Files:**
- Modify: `src/renderer/App.tsx`

Add `handleSaveArcFieldDefs` and `handleSaveArcFieldValues` callbacks, and pass all four new props (`arcFieldDefs`, `arcFieldValues`, `onSaveArcFieldDefs`, `onSaveArcFieldValues`) to the `<ArcView>` element.

- [ ] **Step 1: Add the two handlers**

In `App.tsx`, find `handleSaveSceneArcFields` (grep: `const handleSaveSceneArcFields`). After its closing `}, [projectData]);` line, add:

```ts
  const handleSaveArcFieldDefs = useCallback(async (defs: ArcFieldDef[]) => {
    setArcFieldDefs(defs);
    try {
      await dataService.saveArcFieldDefs(defs);
    } catch {
      addToast('Could not save field definitions');
    }
  }, []);

  const handleSaveArcFieldValues = useCallback(async (entityType: 'act' | 'section', entityId: string, values: Record<string, string | string[]>) => {
    setArcFieldValues(prev => ({ ...prev, [`${entityType}:${entityId}`]: values }));
    try {
      await dataService.saveArcFieldValues(entityType, entityId, values);
    } catch {
      addToast('Could not save field values');
    }
  }, []);
```

`ArcFieldDef` is already imported (added in Phase 1 Task 6).

- [ ] **Step 2: Pass props to `<ArcView>`**

In `App.tsx`, find the `<ArcView` element (grep: `<ArcView`). It starts with `characters={projectData.characters}`. Add four new props after the last existing prop (`arcActiveId={arcActiveId}`) and before the closing `/>`:

```tsx
                        arcFieldDefs={arcFieldDefs}
                        arcFieldValues={arcFieldValues}
                        onSaveArcFieldDefs={handleSaveArcFieldDefs}
                        onSaveArcFieldValues={handleSaveArcFieldValues}
```

The closing tag is currently `/>` on its own line after `arcActiveId`. After this change it looks like:

```tsx
                        arcActiveId={arcActiveId}
                        arcFieldDefs={arcFieldDefs}
                        arcFieldValues={arcFieldValues}
                        onSaveArcFieldDefs={handleSaveArcFieldDefs}
                        onSaveArcFieldValues={handleSaveArcFieldValues}

                        onDeleteSection={handleDeletePlotPoint}
                      />
```

(Keep `onDeleteSection` in place — it's on the line after the existing blank line.)

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "arcFieldDefs\|handleSaveArc"
```
Expected: errors about `arcFieldDefs` not existing on `ArcViewProps` (we add those in Task 4). No other new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(arc-fields): App.tsx arc field save handlers + prop threading (Phase 2, Task 3)"
```

---

### Task 4: ArcView — props, `'custom'` column kind, dynamic columns, Columns menu

**Files:**
- Modify: `src/renderer/components/ArcView.tsx`
- Modify: `src/renderer/styles.css` (add custom column cell CSS)

This task makes custom arc field defs appear as optional Arc grid columns. It adds the four new props to `ArcViewProps`, extends the column type system, maps `arcFieldDefs` to `ArcColumn[]`, renders custom cells, and updates the Columns menu.

- [ ] **Step 1: Add `ArcFieldDef` import**

At the top of `ArcView.tsx`, the current import from `'../../shared/types'` is:

```ts
import { Character, Act, PlotPoint, Scene, CharacterPsychology } from '../../shared/types';
```

Change it to:

```ts
import { Character, Act, PlotPoint, Scene, CharacterPsychology, ArcFieldDef } from '../../shared/types';
```

- [ ] **Step 2: Extend `ArcColKind` and `ArcColumn`**

Find the type definitions near line 14:

```ts
type ArcColKind = 'text' | 'polarity' | 'words';
interface ArcColumn {
  id: string;
  label: string;
  width: number;   // px width of this column's grid track
  kind: ArcColKind;
  field: string;   // entity field (non-novel name); the novel row uses 'novel' + Capitalized
  center?: boolean;
}
```

Replace with:

```ts
type ArcColKind = 'text' | 'polarity' | 'words' | 'custom';
interface ArcColumn {
  id: string;
  label: string;
  width: number;
  kind: ArcColKind;
  field: string;
  center?: boolean;
  customDef?: ArcFieldDef; // only when kind === 'custom'
}
```

- [ ] **Step 3: Add `RatingCell` and `DropdownCell` helper components**

After the `PolarityCell` component (ends around line 229), add:

```tsx
function RatingCell({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="arc-rating-cell">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`arc-rating-dot${i < value ? ' filled' : ''}`}
          onClick={() => onChange(i + 1 === value ? 0 : i + 1)}
          title={`${i + 1}/${max}`}
        />
      ))}
    </div>
  );
}

function DropdownCell({ value, options, colors, onChange }: {
  value: string; options: string[]; colors?: Record<string, string>; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const filtered = options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase()));
  const pillStyle = value && colors?.[value] ? { background: colors[value], color: '#fff' } : {};
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        className="arc-pill arc-dropdown-trigger"
        style={{ ...pillStyle, cursor: 'pointer' }}
        onClick={() => { setOpen(o => !o); setSearch(''); }}
      >
        {value || '—'}
      </span>
      {open && (
        <div className="arc-dropdown-picker">
          {options.length >= 5 && (
            <input
              className="arc-dropdown-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          )}
          <div className="arc-dropdown-list">
            {filtered.map(opt => (
              <div
                key={opt}
                className="arc-dropdown-opt"
                style={colors?.[opt] ? { background: colors[opt], color: '#fff' } : {}}
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                {opt}
              </div>
            ))}
            {value && (
              <div className="arc-dropdown-opt arc-dropdown-clear"
                onClick={() => { onChange(''); setOpen(false); }}>
                Clear
              </div>
            )}
            {filtered.length === 0 && <div className="arc-dropdown-empty">No match</div>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add new props to `ArcViewProps`**

Find the `ArcViewProps` interface (around line 245). After `arcActiveId: string | null;` add:

```ts
  arcFieldDefs: ArcFieldDef[];
  arcFieldValues: Record<string, Record<string, string | string[]>>;
  onSaveArcFieldDefs: (defs: ArcFieldDef[]) => void;
  onSaveArcFieldValues: (entityType: 'act' | 'section', entityId: string, values: Record<string, string | string[]>) => void;
```

- [ ] **Step 5: Accept props in the component signature**

Find the `export default function ArcView({` destructuring (around line 354). After `arcActiveId: _arcActiveId,` add:

```ts
  arcFieldDefs,
  arcFieldValues,
  onSaveArcFieldDefs,
  onSaveArcFieldValues,
```

- [ ] **Step 6: Compute custom columns + update all-column lookups**

Find the `const ARC_COL_BY_ID` line (near line 35):

```ts
const ARC_COL_BY_ID: Record<string, ArcColumn> = Object.fromEntries(ARC_COLUMNS.map(c => [c.id, c]));
const ARC_COL_IDS = ARC_COLUMNS.map(c => c.id);
```

These stay as-is (they are the built-in constants). Inside the component, after the `saveArcViewPref` useEffect and before `const character = ...`, add the following computed values:

```ts
  // Map arcFieldDefs → custom ArcColumns; id is prefixed 'cf:' to avoid collision
  const customColumns: ArcColumn[] = arcFieldDefs.map(def => ({
    id: `cf:${def.id}`,
    label: def.label,
    width: def.type === 'rating' ? 100 : 160,
    kind: 'custom' as const,
    field: def.id,
    center: def.type === 'rating',
    customDef: def,
  }));
  const allColumnById: Record<string, ArcColumn> = {
    ...ARC_COL_BY_ID,
    ...Object.fromEntries(customColumns.map(c => [c.id, c])),
  };
```

- [ ] **Step 7: Update `loadArcColPref` to accept all column IDs**

Find `function loadArcColPref(): ArcColPref {` (around line 49). Change its signature and body to accept all valid IDs:

```ts
function loadArcColPref(allIds: string[]): ArcColPref {
  try {
    const raw = localStorage.getItem(ARC_COLS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArcColPref>;
      const known = new Set(allIds);
      const order = (parsed.order ?? []).filter(id => known.has(id));
      for (const id of allIds) if (!order.includes(id)) order.push(id);
      const hidden = (parsed.hidden ?? []).filter(id => known.has(id));
      const widths: Record<string, number> = {};
      for (const [id, w] of Object.entries(parsed.widths ?? {})) {
        if ((known.has(id) || id === ARC_NAME_COL_ID) && typeof w === 'number' && isFinite(w)) {
          widths[id] = Math.max(ARC_MIN_COL_WIDTH, Math.round(w));
        }
      }
      return { order, hidden, widths };
    }
  } catch { /* ignore corrupt prefs */ }
  return { order: [...allIds], hidden: [], widths: {} };
}
```

- [ ] **Step 8: Update `columnOrder` / `hiddenCols` state initialization to pass all IDs**

Find the two `useState` calls for `columnOrder` and `hiddenCols` (around line 383):

```ts
const [columnOrder, setColumnOrder] = useState<string[]>(() => loadArcColPref().order);
const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set(loadArcColPref().hidden));
```

Replace with:

```ts
const [columnOrder, setColumnOrder] = useState<string[]>(() => {
  const allIds = [...ARC_COL_IDS, ...arcFieldDefs.map(d => `cf:${d.id}`)];
  return loadArcColPref(allIds).order;
});
const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
  const allIds = [...ARC_COL_IDS, ...arcFieldDefs.map(d => `cf:${d.id}`)];
  return new Set(loadArcColPref(allIds).hidden);
});
```

- [ ] **Step 9: Add a `useEffect` to sync column state when `arcFieldDefs` changes**

After the `saveArcViewPref` useEffect (around line 396), add:

```ts
  // Sync column order/hidden when arcFieldDefs changes (add new, remove deleted custom cols).
  useEffect(() => {
    const customIds = arcFieldDefs.map(d => `cf:${d.id}`);
    const validSet = new Set([...ARC_COL_IDS, ...customIds]);
    setColumnOrder(prev => {
      const cleaned = prev.filter(id => validSet.has(id));
      for (const id of customIds) if (!cleaned.includes(id)) cleaned.push(id);
      return cleaned;
    });
    setHiddenCols(prev => {
      const validCustom = new Set(customIds);
      return new Set([...prev].filter(id => !id.startsWith('cf:') || validCustom.has(id)));
    });
  }, [arcFieldDefs]);
```

- [ ] **Step 10: Replace `ARC_COL_BY_ID[id]` reference in `visibleColumns`**

Find the `visibleColumns` computation (around line 451):

```ts
  const visibleColumns = columnOrder
    .map(id => ARC_COL_BY_ID[id])
    .filter((c): c is ArcColumn => !!c && !hiddenCols.has(c.id));
```

Replace with:

```ts
  const visibleColumns = columnOrder
    .map(id => allColumnById[id])
    .filter((c): c is ArcColumn => !!c && !hiddenCols.has(c.id));
```

- [ ] **Step 11: Update `resetColumns` to include custom IDs**

Find `const resetColumns = () => { setColumnOrder([...ARC_COL_IDS]); setHiddenCols(new Set()); setColumnWidths({}); };`

Replace with:

```ts
  const resetColumns = () => {
    setColumnOrder([...ARC_COL_IDS, ...arcFieldDefs.map(d => `cf:${d.id}`)]);
    setHiddenCols(new Set());
    setColumnWidths({});
  };
```

- [ ] **Step 12: Update `moveColumn` reference in `renderArcHeaderCells`**

Find the `onDrop` handler in `renderArcHeaderCells` — it already uses `moveColumn(dragColId, col.id)` which is fine. No change needed. (The function uses `prev.indexOf` which works with any string IDs.)

- [ ] **Step 13: Add custom column cell rendering to `renderArcCells`**

Find `renderArcCells` (around line 505). The current function body starts with `if (col.kind === 'words')`. Before that `if`, add a new block at the very top of the map callback:

```ts
  const renderArcCells = (kind: ArcRowKind, entity: any) => visibleColumns.map(col => {
    // Custom columns are blank for novel and scene rows (arc pool is acts+sections only)
    if (col.kind === 'custom') {
      if (kind === 'novel' || kind === 'scene') {
        return <div key={col.id} className="arc-cell" />;
      }
      const def = col.customDef!;
      const valuesKey = `${kind}:${entity.id}`;
      const entityValues = arcFieldValues[valuesKey] ?? {};
      const rawValue = entityValues[def.id];
      const strValue = String(rawValue ?? '');
      const arrValue = Array.isArray(rawValue) ? rawValue : [];
      const onChangeCustom = (v: string | string[]) => {
        onSaveArcFieldValues(kind as 'act' | 'section', entity.id, { ...entityValues, [def.id]: v });
      };
      if (def.type === 'text' || def.type === 'number') {
        return (
          <div key={col.id} className="arc-cell">
            <EditableCell value={strValue} placeholder="" onChange={v => onChangeCustom(v)} multiline={def.type === 'text'} />
          </div>
        );
      }
      if (def.type === 'rating') {
        return (
          <div key={col.id} className="arc-cell arc-rating-col">
            <RatingCell value={parseInt(strValue) || 0} max={def.ratingMax ?? 5} onChange={v => onChangeCustom(String(v))} />
          </div>
        );
      }
      if (def.type === 'dropdown') {
        return (
          <div key={col.id} className="arc-cell arc-custom-col">
            <DropdownCell value={strValue} options={def.options ?? []} colors={def.optionColors} onChange={v => onChangeCustom(v)} />
          </div>
        );
      }
      if (def.type === 'multiselect') {
        return (
          <div key={col.id} className="arc-cell arc-custom-col">
            <div className="arc-ms-display">
              {arrValue.length > 0
                ? arrValue.map(v => (
                    <span key={v} className="arc-pill"
                      style={def.optionColors?.[v] ? { background: def.optionColors[v], color: '#fff' } : {}}>
                      {v}
                    </span>
                  ))
                : <span className="arc-cell-empty">—</span>}
            </div>
          </div>
        );
      }
      return <div key={col.id} className="arc-cell" />;
    }
    // ... (rest of the existing if (col.kind === 'words') ... etc)
```

The existing `if (col.kind === 'words')` block continues unchanged after this new block.

- [ ] **Step 14: Update the Columns menu to show custom fields**

Find the Columns menu JSX (around line 683):

```tsx
{showColMenu && (
  <div className="arc-col-menu">
    {ARC_COL_IDS.map(id => (
      <label key={id} className="arc-col-menu-item">
        <input type="checkbox" checked={!hiddenCols.has(id)} onChange={() => toggleColumn(id)} />
        <span>{ARC_COL_BY_ID[id].label}</span>
      </label>
    ))}
    <div className="arc-col-menu-divider" />
    <button className="arc-col-menu-reset" onClick={resetColumns}>Reset columns</button>
  </div>
)}
```

Replace with:

```tsx
{showColMenu && (
  <div className="arc-col-menu">
    {ARC_COL_IDS.map(id => (
      <label key={id} className="arc-col-menu-item">
        <input type="checkbox" checked={!hiddenCols.has(id)} onChange={() => toggleColumn(id)} />
        <span>{ARC_COL_BY_ID[id].label}</span>
      </label>
    ))}
    {customColumns.length > 0 && (
      <>
        <div className="arc-col-menu-divider" />
        <div className="arc-col-menu-section-label">Custom</div>
        {customColumns.map(col => (
          <label key={col.id} className="arc-col-menu-item">
            <input type="checkbox" checked={!hiddenCols.has(col.id)} onChange={() => toggleColumn(col.id)} />
            <span>{col.label}</span>
          </label>
        ))}
      </>
    )}
    <div className="arc-col-menu-divider" />
    <button className="arc-col-menu-reset" onClick={resetColumns}>Reset columns</button>
  </div>
)}
```

- [ ] **Step 15: Add custom column CSS to `styles.css`**

Append after the ArcDetailModal CSS:

```css
/* ── Arc custom column cells ─────────────────────────────────────────────── */
.arc-col-menu-section-label {
  padding: 4px 8px 2px; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
}
.arc-rating-col { justify-content: center; }
.arc-rating-cell { display: flex; align-items: center; gap: 3px; }
.arc-rating-dot {
  width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid var(--border); cursor: pointer; transition: background 0.1s;
}
.arc-rating-dot.filled { background: var(--accent); border-color: var(--accent); }
.arc-rating-dot:hover { border-color: var(--accent); }
.arc-custom-col { overflow: visible !important; }
.arc-pill {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: 11px; background: var(--bg-tertiary); color: var(--text-primary);
}
.arc-dropdown-trigger { border: 1px solid var(--border); background: var(--bg-secondary) !important; }
.arc-dropdown-trigger:hover { border-color: var(--accent) !important; }
.arc-dropdown-picker {
  position: absolute; top: calc(100% + 2px); left: 0; z-index: 50;
  background: var(--bg-primary); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  min-width: 160px; max-width: 260px;
}
.arc-dropdown-search {
  width: 100%; padding: 7px 10px; border: none; border-bottom: 1px solid var(--border);
  font-size: 12px; background: transparent; color: var(--text-primary); box-sizing: border-box;
}
.arc-dropdown-search:focus { outline: none; }
.arc-dropdown-list { max-height: 200px; overflow-y: auto; padding: 4px; }
.arc-dropdown-opt {
  padding: 5px 8px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px;
}
.arc-dropdown-opt:hover { background: var(--bg-secondary); }
.arc-dropdown-clear { color: var(--text-muted); border-top: 1px solid var(--border); margin-top: 4px; }
.arc-dropdown-empty { padding: 6px 8px; font-size: 12px; color: var(--text-muted); }
.arc-ms-display { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.arc-cell-empty { font-size: 12px; color: var(--text-muted); }
```

- [ ] **Step 16: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "TS6133\|TS2367\|TS2741\|TS2420\|TS2345\|TS2339\|TS2322"
```
Expected: no output (all errors are pre-existing ones excluded by the filter).

- [ ] **Step 17: Commit**

```bash
git add src/renderer/components/ArcView.tsx src/renderer/styles.css
git commit -m "feat(arc-fields): ArcView custom columns + Columns menu update (Phase 2, Task 4)"
```

---

### Task 5: ArcView — descriptor builders, hover expand icon, modal mount

**Files:**
- Modify: `src/renderer/components/ArcView.tsx`

Wire the modal: add `ArcDetailModal` import, descriptor builder functions, modal state, hover expand icon on act/section rows.

- [ ] **Step 1: Import `ArcDetailModal` and its types**

At the top of `ArcView.tsx`, after the existing imports, add:

```ts
import ArcDetailModal, { type DetailField, type FieldRender } from './ArcDetailModal';
```

- [ ] **Step 2: Add descriptor builder functions**

After the `arcCapitalize` helper function (around line 74), add the icon map and builder functions:

```ts
const BUILTIN_ICONS: Record<string, string> = {
  beginning: '→', ending: '←', turningPoint: '↺', dilemma: '?', propellingAction: '▶', polarity: '±', description: '≡',
};

function renderForDef(def: ArcFieldDef): FieldRender {
  if (def.type === 'dropdown') return { kind: 'dropdown', options: def.options ?? [], colors: def.optionColors };
  if (def.type === 'multiselect') return { kind: 'multiselect', options: def.options ?? [], colors: def.optionColors };
  if (def.type === 'rating') return { kind: 'rating', max: def.ratingMax ?? 5 };
  if (def.type === 'number') return { kind: 'number' };
  return { kind: 'text' };
}

function buildActDetailFields(
  act: Act,
  arcFieldDefs: ArcFieldDef[],
  arcFieldValues: Record<string, Record<string, string | string[]>>,
  onSaveAct: (act: Act) => void,
  onSaveArcFieldValues: (entityType: 'act' | 'section', entityId: string, values: Record<string, string | string[]>) => void
): DetailField[] {
  const entityValues = arcFieldValues[`act:${act.id}`] ?? {};
  const builtins: DetailField[] = [
    { id: 'beginning', label: 'Beginning', icon: BUILTIN_ICONS.beginning, render: { kind: 'text' }, value: act.startingState ?? '', onChange: v => onSaveAct({ ...act, startingState: v as string }), builtin: true },
    { id: 'ending', label: 'Ending', icon: BUILTIN_ICONS.ending, render: { kind: 'text' }, value: act.endingState ?? '', onChange: v => onSaveAct({ ...act, endingState: v as string }), builtin: true },
    { id: 'turningPoint', label: 'Turning point', icon: BUILTIN_ICONS.turningPoint, render: { kind: 'text' }, value: act.transformation ?? '', onChange: v => onSaveAct({ ...act, transformation: v as string }), builtin: true },
    { id: 'dilemma', label: 'Dilemma', icon: BUILTIN_ICONS.dilemma, render: { kind: 'text' }, value: act.dilemma ?? '', onChange: v => onSaveAct({ ...act, dilemma: v as string }), builtin: true },
    { id: 'propellingAction', label: 'Propelling Action', icon: BUILTIN_ICONS.propellingAction, render: { kind: 'text' }, value: act.propellingAction ?? '', onChange: v => onSaveAct({ ...act, propellingAction: v as string }), builtin: true },
    { id: 'polarity', label: 'Polarity shift', icon: BUILTIN_ICONS.polarity, render: { kind: 'polarity' }, value: act.polarity ?? '', onChange: v => onSaveAct({ ...act, polarity: v as string }), builtin: true },
  ];
  const custom: DetailField[] = arcFieldDefs.map(def => ({
    id: def.id,
    label: def.label,
    icon: '·',
    render: renderForDef(def),
    value: entityValues[def.id] ?? (def.type === 'multiselect' ? [] : ''),
    onChange: (v: string | string[]) => onSaveArcFieldValues('act', act.id, { ...entityValues, [def.id]: v }),
    builtin: false,
  }));
  return [...builtins, ...custom];
}

function buildSectionDetailFields(
  pp: PlotPoint,
  arcFieldDefs: ArcFieldDef[],
  arcFieldValues: Record<string, Record<string, string | string[]>>,
  onSavePlotPointArcFields: (id: string, fields: Partial<Pick<PlotPoint, 'actId' | 'inBullpen' | 'startingState' | 'endingState' | 'polarity' | 'transformation' | 'dilemma' | 'propellingAction' | 'title' | 'description' | 'synopsis'>>) => void,
  onSaveArcFieldValues: (entityType: 'act' | 'section', entityId: string, values: Record<string, string | string[]>) => void
): DetailField[] {
  const entityValues = arcFieldValues[`section:${pp.id}`] ?? {};
  const builtins: DetailField[] = [
    { id: 'description', label: 'Synopsis', icon: BUILTIN_ICONS.description, render: { kind: 'text' }, value: pp.description ?? '', onChange: v => onSavePlotPointArcFields(pp.id, { description: v as string }), builtin: true },
    { id: 'beginning', label: 'Beginning', icon: BUILTIN_ICONS.beginning, render: { kind: 'text' }, value: pp.startingState ?? '', onChange: v => onSavePlotPointArcFields(pp.id, { startingState: v as string }), builtin: true },
    { id: 'ending', label: 'Ending', icon: BUILTIN_ICONS.ending, render: { kind: 'text' }, value: pp.endingState ?? '', onChange: v => onSavePlotPointArcFields(pp.id, { endingState: v as string }), builtin: true },
    { id: 'turningPoint', label: 'Turning point', icon: BUILTIN_ICONS.turningPoint, render: { kind: 'text' }, value: pp.transformation ?? '', onChange: v => onSavePlotPointArcFields(pp.id, { transformation: v as string }), builtin: true },
    { id: 'dilemma', label: 'Dilemma', icon: BUILTIN_ICONS.dilemma, render: { kind: 'text' }, value: pp.dilemma ?? '', onChange: v => onSavePlotPointArcFields(pp.id, { dilemma: v as string }), builtin: true },
    { id: 'propellingAction', label: 'Propelling Action', icon: BUILTIN_ICONS.propellingAction, render: { kind: 'text' }, value: pp.propellingAction ?? '', onChange: v => onSavePlotPointArcFields(pp.id, { propellingAction: v as string }), builtin: true },
    { id: 'polarity', label: 'Polarity shift', icon: BUILTIN_ICONS.polarity, render: { kind: 'polarity' }, value: pp.polarity ?? '', onChange: v => onSavePlotPointArcFields(pp.id, { polarity: v as string }), builtin: true },
  ];
  const custom: DetailField[] = arcFieldDefs.map(def => ({
    id: def.id,
    label: def.label,
    icon: '·',
    render: renderForDef(def),
    value: entityValues[def.id] ?? (def.type === 'multiselect' ? [] : ''),
    onChange: (v: string | string[]) => onSaveArcFieldValues('section', pp.id, { ...entityValues, [def.id]: v }),
    builtin: false,
  }));
  return [...builtins, ...custom];
}
```

- [ ] **Step 3: Add modal state inside the component**

Inside the `ArcView` component function, after the existing state declarations (after `colMenuRef`), add:

```ts
  const [openModal, setOpenModal] = useState<{ kind: 'act' | 'section'; id: string } | null>(null);
```

- [ ] **Step 4: Add hover expand icon to act rows**

In `renderAct`, find the `<div className="arc-name-cell" style={{ paddingLeft: 32 }}>` block:

```tsx
            <div className="arc-name-cell" style={{ paddingLeft: 32 }}>
              <span className="arc-toggle" onClick={() => toggleCollapsed(`act-${act.id}`)}>
                {coll ? '▶' : '▼'}
              </span>
              <div className="arc-name-inner">
                <EditableCell value={act.name} placeholder="Act name..."
                  onChange={v => onSaveAct({ ...act, name: v })} />
              </div>
            </div>
```

Replace with:

```tsx
            <div className="arc-name-cell" style={{ paddingLeft: 32 }}>
              <span className="arc-toggle" onClick={() => toggleCollapsed(`act-${act.id}`)}>
                {coll ? '▶' : '▼'}
              </span>
              <div className="arc-name-inner">
                <EditableCell value={act.name} placeholder="Act name..."
                  onChange={v => onSaveAct({ ...act, name: v })} />
              </div>
              <button
                className="arc-expand-btn"
                onClick={e => { e.stopPropagation(); setOpenModal({ kind: 'act', id: act.id }); }}
                title="Open detail view"
              >⊞</button>
            </div>
```

- [ ] **Step 5: Add hover expand icon to section rows**

In `renderSection`, find the `<div className="arc-name-cell" style={{ paddingLeft: 72 }}>` block:

```tsx
            <div className="arc-name-cell" style={{ paddingLeft: 72 }}>
              <span className="arc-toggle" onClick={() => toggleCollapsed(`sec-${pp.id}`)}>
                {coll ? '▶' : '▼'}
              </span>
              <div className="arc-name-inner">
                <EditableCell value={pp.title} placeholder="Section name..."
                  onChange={v => onSavePlotPointArcFields(pp.id, { title: v })} />
                <EditableCell className="arc-scene-synopsis" value={pp.description || ''} placeholder="Add synopsis..."
                  onChange={v => onSavePlotPointArcFields(pp.id, { description: v })} multiline />
              </div>
            </div>
```

Replace with:

```tsx
            <div className="arc-name-cell" style={{ paddingLeft: 72 }}>
              <span className="arc-toggle" onClick={() => toggleCollapsed(`sec-${pp.id}`)}>
                {coll ? '▶' : '▼'}
              </span>
              <div className="arc-name-inner">
                <EditableCell value={pp.title} placeholder="Section name..."
                  onChange={v => onSavePlotPointArcFields(pp.id, { title: v })} />
                <EditableCell className="arc-scene-synopsis" value={pp.description || ''} placeholder="Add synopsis..."
                  onChange={v => onSavePlotPointArcFields(pp.id, { description: v })} multiline />
              </div>
              <button
                className="arc-expand-btn"
                onClick={e => { e.stopPropagation(); setOpenModal({ kind: 'section', id: pp.id }); }}
                title="Open detail view"
              >⊞</button>
            </div>
```

- [ ] **Step 6: Mount the modal in the JSX**

Find the end of the component's return statement, just before `<ScenePreviewPanel`. Add the modal render just before `<ScenePreviewPanel`:

```tsx
      {openModal && (() => {
        if (openModal.kind === 'act') {
          const act = sortedActs.find(a => a.id === openModal.id);
          if (!act) return null;
          return (
            <ArcDetailModal
              title={act.name || 'Unnamed act'}
              subtitle="Act"
              fields={buildActDetailFields(act, arcFieldDefs, arcFieldValues, onSaveAct, onSaveArcFieldValues)}
              arcFieldDefs={arcFieldDefs}
              onSaveDefs={onSaveArcFieldDefs}
              onClose={() => setOpenModal(null)}
            />
          );
        }
        if (openModal.kind === 'section') {
          const pp = plotPoints.find(p => p.id === openModal.id);
          if (!pp) return null;
          return (
            <ArcDetailModal
              title={pp.title || 'Unnamed section'}
              subtitle="Section"
              fields={buildSectionDetailFields(pp, arcFieldDefs, arcFieldValues, onSavePlotPointArcFields, onSaveArcFieldValues)}
              arcFieldDefs={arcFieldDefs}
              onSaveDefs={onSaveArcFieldDefs}
              onClose={() => setOpenModal(null)}
            />
          );
        }
        return null;
      })()}
```

- [ ] **Step 7: Add hover expand button CSS to `styles.css`**

Append to the arc custom column cells section:

```css
/* Arc expand button (hover reveals detail modal trigger) */
.arc-expand-btn {
  opacity: 0; flex-shrink: 0; background: none; border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 2px 5px; font-size: 12px;
  color: var(--text-muted); cursor: pointer; transition: opacity 0.1s;
  margin-left: 4px;
}
.arc-row:hover .arc-expand-btn { opacity: 1; }
.arc-expand-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }
```

- [ ] **Step 8: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "TS6133\|TS2367\|TS2741\|TS2420\|TS2345\|TS2339\|TS2322"
```
Expected: no output.

- [ ] **Step 9: Run tests**

```bash
npx vitest run
```
Expected: all 155 tests pass (no test files cover the renderer components).

- [ ] **Step 10: Manual smoke test in the Electron app**

```bash
npm run dev
```

Verify:
1. Arc view loads without console errors
2. Hovering over an act row shows the `⊞` button
3. Clicking `⊞` on an act opens the ArcDetailModal with the act's title and subtitle "Act"
4. All 6 built-in fields are visible (or filtered if empty) with editable controls
5. Editing a text field in the modal, then blurring, saves the value (check grid updates)
6. Polarity click-to-pick works in the modal
7. Hovering over a section row shows its `⊞` button; clicking opens the modal for that section
8. "+ ⚙ Manage fields" button opens ArcFieldManager inside the modal
9. Adding a text field creates it and it appears in the modal's field list and Columns menu
10. Enabling the custom column in Columns menu shows it in the grid
11. Editing the custom field in the grid (EditableCell) saves correctly
12. Adding a dropdown field with options; editing in modal shows the searchable picker; pill displays in grid
13. Adding a rating field; editing in modal shows the dots; dots show in grid
14. Esc and click-outside both close the modal

- [ ] **Step 11: Commit**

```bash
git add src/renderer/components/ArcView.tsx src/renderer/styles.css
git commit -m "feat(arc-fields): descriptor builders + hover expand icon + modal mount (Phase 2, Task 5)"
```

---

## Phase 2 Done — what's next

Phase 2 completes the core ask: acts and sections have a beautiful detail editor with built-in fields + custom fields, field definitions are managed in-modal, and custom fields appear as optional Arc grid columns.

**Phase 3 (separate plan):** Novel row → `ArcDetailModal` with character psychology built-in fields (wound, lie, deepest fear, etc.), no custom pool.

**Phase 4 (separate plan):** Scenes → absorb scene metadata + Tags + Timeline date + rich Notes + Connections into the modal; route `TimelineView` scene rows to it; retire `SceneDetailPanel`.

---

## Self-review

**Spec coverage:**
- ArcDetailModal + ClickUp-style layout: Task 2 ✓
- Field manager (CRUD + reorder + option colors): Task 1 ✓  
- Hover expand icon: Task 5 ✓
- Descriptor builders for act/section: Task 5 ✓
- Built-in + custom fields in one list: Task 5 (descriptor builders include both) ✓
- Dynamic Arc grid columns: Task 4 ✓
- Column menu includes custom fields: Task 4 ✓
- "Hide empty fields" toggle: Task 2 ✓
- Searchable picker for dropdown (5+ options): Tasks 2 and 4 ✓
- Option colors: Task 1 (manager) + Task 2 (modal rendering) + Task 4 (grid pills) ✓
- Rating type: Tasks 1, 2, 4 ✓
- Save via dedicated handlers (not saveTimeline): Task 3 ✓
- Landmine guard: inherited from Phase 1 (no FK on entity_id) ✓

**Placeholder scan:** No TBDs or "implement later" items. All code blocks are complete.

**Type consistency:**
- `DetailField` and `FieldRender` defined in `ArcDetailModal.tsx`, imported by `ArcView.tsx` ✓
- `ArcFieldDef` from `types.ts` used consistently throughout ✓
- `arcFieldValues` key format `"act:${id}"` / `"section:${id}"` used consistently in Task 4 (cell rendering), Task 5 (builders) ✓
- `ArcColumn.customDef` set in Task 4 Step 6, read in Task 4 Step 13 ✓
- `cf:${def.id}` prefix used consistently for custom column IDs ✓
- `onSaveArcFieldValues` signature `(entityType, entityId, values)` matches between App.tsx (Task 3), ArcViewProps (Task 4 Step 4), and builder calls (Task 5 Step 2) ✓
