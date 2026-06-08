import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
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
                <span className="arc-dm-pill-x" onClick={e => { e.stopPropagation(); toggle(v); }}>&times;</span>
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
                {value.includes(opt) && <span className="arc-dm-check">&#10003;</span>}
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
  let control: ReactNode;
  if (r.kind === 'text') {
    control = <TextField value={field.value as string} onChange={v => field.onChange(v)} />;
  } else if (r.kind === 'number') {
    control = <NumberField value={field.value as string} onChange={v => field.onChange(v)} />;
  } else if (r.kind === 'polarity') {
    control = <PolarityField value={field.value as string} onChange={v => field.onChange(v)} />;
  } else if (r.kind === 'rating') {
    const n = parseInt(field.value as string, 10) || 0;
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
          <button className="arc-dm-close" onClick={onClose} type="button">&times;</button>
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
                <div className="arc-dm-empty">All fields are empty. Uncheck &quot;Hide empty fields&quot; to edit.</div>
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
                &#9881; Manage fields
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
