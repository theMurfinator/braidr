import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Placeholder from '@tiptap/extension-placeholder';
import ArcFieldManager from './ArcFieldManager';
import type { ArcFieldDef, ArcTemplate, Scene, Character } from '../../shared/types';
import { dataService } from '../services/dataService';

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
  section?: string;
}

export interface SectionDivider { kind: 'divider'; id: string; label: string; }
type OrderedItem = DetailField | SectionDivider;
function isDivider(item: OrderedItem): item is SectionDivider { return (item as SectionDivider).kind === 'divider'; }

interface ArcDetailModalProps {
  title: string;
  subtitle?: string;
  entityType?: 'act' | 'section' | 'scene';
  fields: DetailField[];
  arcFieldDefs: ArcFieldDef[];
  onSaveDefs: (defs: ArcFieldDef[]) => void;
  onClose: () => void;
  storageKey?: string;
  hiddenBuiltinIds?: Set<string>;
  onToggleBuiltin?: (id: string) => void;
  hiddenCustomIds?: Set<string>;
  onToggleCustom?: (id: string) => void;
  fieldSections?: Record<string, string>;
  onSectionChange?: (id: string, section: string) => void;
  onSaveAllSections?: (sections: Record<string, string>) => void;
  templates?: ArcTemplate[];
  onSaveTemplate?: (template: Omit<ArcTemplate, 'id'>) => void;
  onDeleteTemplate?: (id: string) => void;
  onApplyTemplate?: (template: ArcTemplate) => void;
  scenes?: Scene[];
  bullpenScenes?: Scene[];
  characters?: Character[];
  characterColors?: Record<string, string>;
  onReorderScenes?: (orderedIds: string[]) => void;
  onAddScene?: () => void;
  onSendToBullpen?: (sceneId: string) => void;
  onPullFromBullpen?: (sceneId: string) => void;
  draftContent?: Record<string, string>;
  onDraftChange?: (sceneId: string, html: string) => void;
  onGoToScene?: (sceneId: string) => void;
  // Scene-level field detail (when scenes are shown inside section modal)
  sceneArcFieldDefs?: ArcFieldDef[];
  sceneArcFieldValues?: Record<string, Record<string, string | string[]>>;
  onSaveSceneBuiltins?: (sceneId: string, partial: Partial<Scene>) => void;
  onSaveSceneArcFields?: (sceneId: string, values: Record<string, string | string[]>) => void;
  hiddenBuiltinIds_scene?: Set<string>;
  onToggleBuiltin_scene?: (id: string) => void;
  hiddenCustomIds_scene?: Set<string>;
  onToggleCustom_scene?: (id: string) => void;
  fieldSections_scene?: Record<string, string>;
  templates_scene?: ArcTemplate[];
  onSaveTemplate_scene?: (template: Omit<ArcTemplate, 'id'>) => void;
  onDeleteTemplate_scene?: (id: string) => void;
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

// ── Rich text field (TipTap) ──────────────────────────────────────────────────
function RichTextField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const isFocused = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '—' }),
    ],
    content: value || '',
    onFocus: () => { isFocused.current = true; },
    onBlur: ({ editor: e }) => {
      isFocused.current = false;
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      const html = e.isEmpty ? '' : e.getHTML();
      onChangeRef.current(html);
    },
    onUpdate: ({ editor: e }) => {
      if (!isFocused.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const html = e.isEmpty ? '' : e.getHTML();
        onChangeRef.current(html);
      }, 800);
    },
  });

  // Flush any pending debounce and save on unmount (handles Escape / overlay-click close)
  useEffect(() => {
    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      if (editor && !editor.isDestroyed) {
        const html = editor.isEmpty ? '' : editor.getHTML();
        onChangeRef.current(html);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes only when not actively editing
  useEffect(() => {
    if (!editor || editor.isDestroyed || isFocused.current) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || '');
    }
  }, [editor, value]);

  return (
    <div className="arc-dm-rich-wrapper">
      <EditorContent editor={editor} className="arc-dm-rich-editor" />
    </div>
  );
}

// ── Number field ──────────────────────────────────────────────────────────────
function NumberField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const isFocused = useRef(false);
  // Only sync external value when not actively editing
  useEffect(() => { if (!isFocused.current) setDraft(value); }, [value]);
  return (
    <input
      className="arc-dm-number"
      type="number"
      value={draft}
      placeholder="—"
      onChange={e => setDraft(e.target.value)}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => { isFocused.current = false; if (draft !== value) onChange(draft); }}
    />
  );
}

// ── Section divider row ───────────────────────────────────────────────────────
function DividerRow({ divider, onRename, onDelete }: {
  divider: SectionDivider;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: divider.id });
  const [editing, setEditing] = useState(!divider.label);
  const [draft, setDraft] = useState(divider.label);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(divider.label); }, [divider.label]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) onRename(divider.id, trimmed);
    setEditing(false);
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="arc-dm-divider-row">
      <div className="arc-dm-drag-handle" {...attributes} {...listeners}>&#8959;</div>
      {editing ? (
        <input
          ref={inputRef}
          className="arc-dm-divider-input"
          value={draft}
          placeholder="Section name..."
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(divider.label); setEditing(false); } }}
        />
      ) : (
        <span className="arc-dm-divider-label" onClick={() => setEditing(true)} title="Click to rename">
          {divider.label || 'Unnamed section'}
        </span>
      )}
      <button className="arc-dm-divider-delete" onClick={() => onDelete(divider.id)} type="button" title="Remove section">&times;</button>
    </div>
  );
}

// ── Field row ─────────────────────────────────────────────────────────────────
function FieldRow({ field, sortable: isSortable, onHide }: { field: DetailField; sortable?: boolean; onHide?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, disabled: !isSortable });

  const r = field.render;
  let control: ReactNode;
  if (r.kind === 'text') {
    control = <RichTextField value={field.value as string} onChange={v => field.onChange(v)} />;
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

  const style: React.CSSProperties = isSortable ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  } : {};

  return (
    <div ref={isSortable ? setNodeRef : undefined} style={style} className="arc-dm-field-row">
      {isSortable && (
        <div className="arc-dm-drag-handle" {...attributes} {...listeners}>&#8959;</div>
      )}
      <div className="arc-dm-field-label">
        <span className="arc-dm-field-name">{field.label}</span>
      </div>
      <div className="arc-dm-field-value">{control}</div>
      {onHide && (
        <button className="arc-dm-hide-btn" onClick={onHide} type="button" title="Hide field">&#9673;</button>
      )}
    </div>
  );
}

// ── Bullpen drop zone (inside scenes DndContext) ──────────────────────────────
function BullpenDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'modal-bullpen' });
  return (
    <div ref={setNodeRef} className={`arc-dm-bullpen${isOver ? ' arc-dm-bullpen--over' : ''}`}>
      {children}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
function SceneRowContextMenu({ x, y, onSendToBullpen, onClose }: {
  x: number; y: number;
  onSendToBullpen?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [onClose]);
  return (
    <div ref={ref} className="arc-context-menu" style={{ left: x, top: y }}>
      {onSendToBullpen && (
        <div className="arc-context-item" onClick={onSendToBullpen}>Send to Bullpen</div>
      )}
    </div>
  );
}

function SortableSceneItem({ scene, selected, onSelect, onSendToBullpen }: {
  scene: Scene;
  selected: boolean;
  onSelect: (id: string) => void;
  onSendToBullpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <div ref={setNodeRef} style={style}
        className={`arc-bullpen-row${selected ? ' active' : ''}`}
        onClick={() => onSelect(scene.id)}
        onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
      >
        <span className="arc-bullpen-drag" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>⠿</span>
        <span className="arc-bullpen-label arc-bullpen-clickable">{scene.title || 'Untitled scene'}</span>
      </div>
      {contextMenu && (
        <SceneRowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSendToBullpen={onSendToBullpen ? () => { onSendToBullpen(); setContextMenu(null); } : undefined}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

function SceneTextPanel({ scene, draftContent, onDraftChange, onGoToScene, onBack }: {
  scene: Scene;
  draftContent: Record<string, string>;
  onDraftChange?: (sceneId: string, html: string) => void;
  onGoToScene?: (sceneId: string) => void;
  onBack: () => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ key: string; html: string } | null>(null);
  const settingContentRef = useRef(false);
  const sceneIdRef = useRef(scene.id);
  sceneIdRef.current = scene.id;

  const editor = useEditor({
    editorProps: { attributes: { spellcheck: 'true' } },
    extensions: [
      StarterKit,
      Heading.configure({ levels: [2, 3] }),
      HorizontalRule,
      Placeholder.configure({ placeholder: 'Write this scene…' }),
    ],
    content: draftContent[scene.id] || '',
    onUpdate: ({ editor: e }) => {
      if (settingContentRef.current || !onDraftChange) return;
      pendingRef.current = { key: sceneIdRef.current, html: e.getHTML() };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (pendingRef.current) { onDraftChange(pendingRef.current.key, pendingRef.current.html); pendingRef.current = null; }
      }, 800);
    },
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      if (pendingRef.current && onDraftChange) { onDraftChange(pendingRef.current.key, pendingRef.current.html); pendingRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="arc-dm-scene-text-panel">
      <div className="arc-dm-scene-text-header">
        <button className="arc-dm-scene-detail-back" onClick={onBack}>← Back</button>
        {onGoToScene && (
          <button className="arc-dm-scene-text-goto" onClick={() => onGoToScene(scene.id)}>Full Editor →</button>
        )}
      </div>
      <div className="arc-dm-scene-text-title">{scene.title || 'Untitled scene'}</div>
      <div className="arc-dm-scene-text-body">
        {editor && <EditorContent editor={editor} className="arc-dm-scene-text-editor" />}
      </div>
    </div>
  );
}

// ── Scene field panel (same ClickUp-style layout as act/section fields) ───────
function SceneFieldPanel({
  scene,
  fields,
  arcFieldDefs,
  onSaveDefs,
  hiddenBuiltinIds,
  onToggleBuiltin,
  hiddenCustomIds,
  onToggleCustom,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onBack,
  onGoToScene,
}: {
  scene: Scene;
  fields: DetailField[];
  arcFieldDefs: ArcFieldDef[];
  onSaveDefs: (defs: ArcFieldDef[]) => void;
  hiddenBuiltinIds?: Set<string>;
  onToggleBuiltin?: (id: string) => void;
  hiddenCustomIds?: Set<string>;
  onToggleCustom?: (id: string) => void;
  templates?: ArcTemplate[];
  onSaveTemplate?: (t: Omit<ArcTemplate, 'id'>) => void;
  onDeleteTemplate?: (id: string) => void;
  onBack: () => void;
  onGoToScene?: (id: string) => void;
}) {
  const SCENE_ORDER_KEY = 'arc-field-order:scene';
  const [orderedItems, setOrderedItems] = useState<OrderedItem[]>(() => {
    try {
      const savedOrder = localStorage.getItem(SCENE_ORDER_KEY);
      if (savedOrder) {
        const ids: string[] = JSON.parse(savedOrder);
        const byId = Object.fromEntries(fields.map(f => [f.id, f]));
        const ordered = ids.map(id => byId[id]).filter(Boolean) as DetailField[];
        const inOrder = new Set(ids);
        for (const f of fields) if (!inOrder.has(f.id)) ordered.push(f);
        return ordered;
      }
    } catch { /* ignore */ }
    return fields;
  });
  // Re-sync when fields identity changes (scene switches)
  useEffect(() => {
    setOrderedItems(prev => {
      const byId = Object.fromEntries(fields.map(f => [f.id, f]));
      const result = prev
        .filter(i => !isDivider(i))
        .map(i => byId[(i as DetailField).id])
        .filter(Boolean) as DetailField[];
      for (const f of fields) if (!result.find(r => r.id === f.id)) result.push(f);
      return result;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  const [showManager, setShowManager] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const builtinRefs = fields.filter(f => f.builtin).map(f => ({ id: f.id, label: f.label }));

  function saveOrder(items: OrderedItem[]) {
    const ids = items.filter(i => !isDivider(i)).map(i => (i as DetailField).id);
    try { localStorage.setItem(SCENE_ORDER_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
    dataService.setArcUiPref(SCENE_ORDER_KEY, JSON.stringify(ids)).catch(() => {});
  }

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedItems.findIndex(i => (isDivider(i) ? i.id : (i as DetailField).id) === active.id);
    const newIdx = orderedItems.findIndex(i => (isDivider(i) ? i.id : (i as DetailField).id) === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(orderedItems, oldIdx, newIdx);
    setOrderedItems(next);
    saveOrder(next);
  }

  function handleSaveCurrentAsTemplate() {
    if (!newTemplateName.trim() || !onSaveTemplate) return;
    const fieldOrder = orderedItems.filter(i => !isDivider(i)).map(i => (i as DetailField).id);
    onSaveTemplate({
      name: newTemplateName.trim(),
      entityType: 'scene',
      fieldOrder,
      hiddenBuiltinIds: [...(hiddenBuiltinIds ?? [])],
      hiddenCustomIds: [...(hiddenCustomIds ?? [])],
      dividers: [],
    });
    setNewTemplateName('');
  }

  function handleApplyTemplate(template: ArcTemplate) {
    const fieldMap = Object.fromEntries(fields.map(f => [f.id, f]));
    const ordered = template.fieldOrder.map(id => fieldMap[id]).filter(Boolean) as DetailField[];
    const inTemplate = new Set(template.fieldOrder);
    for (const f of fields) if (!inTemplate.has(f.id)) ordered.push(f);
    setOrderedItems(ordered);
    saveOrder(ordered);
    setShowTemplatePanel(false);
  }

  const visibleItems = orderedItems.filter(item => {
    if (isDivider(item)) return false;
    const f = item as DetailField;
    if (f.builtin && hiddenBuiltinIds?.has(f.id)) return false;
    if (!f.builtin && hiddenCustomIds?.has(f.id)) return false;
    return true;
  });

  return (
    <div className="arc-dm-scene-field-panel">
      <div className="arc-dm-scene-text-header">
        <button className="arc-dm-scene-detail-back" onClick={onBack}>← Back</button>
        <span className="arc-dm-scene-field-title">{scene.title || 'Untitled scene'}</span>
        {onGoToScene && (
          <button className="arc-dm-scene-text-goto" onClick={() => onGoToScene(scene.id)}>Full Editor →</button>
        )}
      </div>
      {showTemplatePanel ? (
        <div className="arc-dm-template-panel" style={{ flex: 1, overflow: 'hidden' }}>
          <div className="arc-dm-template-panel-header">
            <button className="arc-dm-back-btn" onClick={() => setShowTemplatePanel(false)} type="button">← Back</button>
            <span className="arc-dm-template-panel-title">Fields &amp; Templates</span>
          </div>
          <div className="arc-dm-field-picker-section">
            <div className="arc-dm-picker-label">VISIBLE FIELDS</div>
            {fields.map(f => (
              <label key={f.id} className="arc-dm-field-toggle">
                <input
                  type="checkbox"
                  checked={f.builtin ? !hiddenBuiltinIds?.has(f.id) : !hiddenCustomIds?.has(f.id)}
                  onChange={() => f.builtin ? onToggleBuiltin?.(f.id) : onToggleCustom?.(f.id)}
                />
                <span className="arc-dm-toggle-label">{f.label}</span>
              </label>
            ))}
          </div>
          <div className="arc-dm-template-list-section">
            <div className="arc-dm-picker-label">TEMPLATES</div>
            {(templates ?? []).filter(t => t.entityType === 'scene').length === 0 && (
              <div className="arc-dm-template-empty">No saved templates yet</div>
            )}
            {(templates ?? []).filter(t => t.entityType === 'scene').map(t => (
              <div key={t.id} className="arc-dm-template-row">
                <span className="arc-dm-template-name">{t.name}</span>
                <button className="arc-dm-template-apply-btn" onClick={() => handleApplyTemplate(t)} type="button">Apply</button>
                <button className="arc-dm-template-delete-btn" onClick={() => onDeleteTemplate?.(t.id)} type="button">&times;</button>
              </div>
            ))}
            {onSaveTemplate && (
              <div className="arc-dm-template-save-row">
                <input type="text" className="arc-dm-template-name-input" placeholder="Template name..." value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newTemplateName.trim()) handleSaveCurrentAsTemplate(); }} />
                <button className="arc-dm-template-save-btn" disabled={!newTemplateName.trim()} onClick={handleSaveCurrentAsTemplate} type="button">Save</button>
              </div>
            )}
          </div>
        </div>
      ) : showManager ? (
        <ArcFieldManager
          defs={arcFieldDefs}
          onSave={defs => onSaveDefs(defs)}
          onBack={() => setShowManager(false)}
          builtinFields={builtinRefs}
          hiddenBuiltinIds={hiddenBuiltinIds}
          onToggleBuiltin={onToggleBuiltin}
          hiddenCustomIds={hiddenCustomIds}
          onToggleCustom={onToggleCustom}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedItems.map(i => isDivider(i) ? i.id : (i as DetailField).id)} strategy={verticalListSortingStrategy}>
            <div className="arc-dm-body">
              {visibleItems.map(item => (
                <FieldRow
                  key={(item as DetailField).id}
                  field={item as DetailField}
                  sortable={true}
                  onHide={undefined}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {!showManager && !showTemplatePanel && (
        <div className="arc-dm-footer">
          <button className="arc-dm-templates-btn" onClick={() => setShowTemplatePanel(true)} type="button">&#9776; Fields &amp; Templates</button>
          <button className="arc-dm-manage-btn" onClick={() => setShowManager(true)} type="button">&#9881; Manage fields</button>
        </div>
      )}
    </div>
  );
}

export default function ArcDetailModal({
  title,
  subtitle,
  entityType,
  fields,
  arcFieldDefs,
  onSaveDefs,
  onClose,
  storageKey,
  hiddenBuiltinIds,
  onToggleBuiltin,
  hiddenCustomIds,
  onToggleCustom,
  fieldSections,
  onSectionChange: _onSectionChange,
  onSaveAllSections,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onApplyTemplate,
  scenes,
  bullpenScenes,
  characters: _characters,
  characterColors: _characterColors,
  onReorderScenes,
  onAddScene,
  onSendToBullpen,
  onPullFromBullpen,
  draftContent,
  onDraftChange,
  onGoToScene,
  sceneArcFieldDefs,
  sceneArcFieldValues,
  onSaveSceneBuiltins,
  onSaveSceneArcFields,
  hiddenBuiltinIds_scene,
  onToggleBuiltin_scene,
  hiddenCustomIds_scene,
  onToggleCustom_scene,
  fieldSections_scene,
  templates_scene,
  onSaveTemplate_scene,
  onDeleteTemplate_scene,
}: ArcDetailModalProps) {
  const [showManager, setShowManager] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const builtinRefs = fields.filter(f => f.builtin).map(f => ({ id: f.id, label: f.label }));

  const [orderedScenes, setOrderedScenes] = useState<Scene[]>(() => scenes ?? []);
  useEffect(() => { setOrderedScenes(scenes ?? []); }, [scenes]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedSceneId && !orderedScenes.find(s => s.id === selectedSceneId)) setSelectedSceneId(null);
  }, [orderedScenes, selectedSceneId]);
  const selectedScene = selectedSceneId ? orderedScenes.find(s => s.id === selectedSceneId) ?? null : null;

  function buildSceneFields(scene: Scene): DetailField[] {
    if (!sceneArcFieldDefs || !onSaveSceneBuiltins || !onSaveSceneArcFields) return [];
    const sceneValues = sceneArcFieldValues?.[`scene:${scene.id}`] ?? {};
    const builtins: DetailField[] = [
      { id: 'synopsis', label: 'Synopsis', icon: '≡', render: { kind: 'text' }, value: scene.notes?.join('\n') ?? '', onChange: v => onSaveSceneBuiltins(scene.id, { notes: (v as string).split('\n').filter(Boolean) }), builtin: true, section: fieldSections_scene?.['synopsis'] },
      { id: 'beginning', label: 'Beginning', icon: '→', render: { kind: 'text' }, value: scene.startingState ?? '', onChange: v => onSaveSceneBuiltins(scene.id, { startingState: v as string }), builtin: true, section: fieldSections_scene?.['beginning'] },
      { id: 'ending', label: 'Ending', icon: '←', render: { kind: 'text' }, value: scene.endingState ?? '', onChange: v => onSaveSceneBuiltins(scene.id, { endingState: v as string }), builtin: true, section: fieldSections_scene?.['ending'] },
      { id: 'turningPoint', label: 'Turning point', icon: '↺', render: { kind: 'text' }, value: scene.transformation ?? '', onChange: v => onSaveSceneBuiltins(scene.id, { transformation: v as string }), builtin: true, section: fieldSections_scene?.['turningPoint'] },
      { id: 'dilemma', label: 'Dilemma', icon: '?', render: { kind: 'text' }, value: scene.dilemma ?? '', onChange: v => onSaveSceneBuiltins(scene.id, { dilemma: v as string }), builtin: true, section: fieldSections_scene?.['dilemma'] },
      { id: 'propellingAction', label: 'Propelling Action', icon: '▶', render: { kind: 'text' }, value: scene.propellingAction ?? '', onChange: v => onSaveSceneBuiltins(scene.id, { propellingAction: v as string }), builtin: true, section: fieldSections_scene?.['propellingAction'] },
      { id: 'polarity', label: 'Polarity shift', icon: '±', render: { kind: 'polarity' }, value: scene.polarity ?? '', onChange: v => onSaveSceneBuiltins(scene.id, { polarity: v as string }), builtin: true, section: fieldSections_scene?.['polarity'] },
    ];
    const custom: DetailField[] = sceneArcFieldDefs.filter(d => d.scope === 'scene').map(def => {
      const renderDef = (): FieldRender => {
        if (def.type === 'dropdown') return { kind: 'dropdown', options: def.options ?? [], colors: def.optionColors };
        if (def.type === 'multiselect') return { kind: 'multiselect', options: def.options ?? [], colors: def.optionColors };
        if (def.type === 'rating') return { kind: 'rating', max: def.ratingMax ?? 5 };
        if (def.type === 'number') return { kind: 'number' };
        return { kind: 'text' };
      };
      return {
        id: def.id, label: def.label, icon: '·', render: renderDef(),
        value: sceneValues[def.id] ?? (def.type === 'multiselect' ? [] : ''),
        onChange: (v: string | string[]) => onSaveSceneArcFields(scene.id, { ...sceneValues, [def.id]: v }),
        builtin: false, section: fieldSections_scene?.[def.id],
      };
    });
    return [...builtins, ...custom];
  }

  const scenesSensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function handleScenesDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    if (String(over.id) === 'modal-bullpen') {
      onSendToBullpen?.(String(active.id));
      return;
    }
    if (active.id === over.id) return;
    const oldIdx = orderedScenes.findIndex(s => s.id === active.id);
    const newIdx = orderedScenes.findIndex(s => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(orderedScenes, oldIdx, newIdx);
    setOrderedScenes(reordered);
    onReorderScenes?.(reordered.map(s => s.id));
  }

  // ── Ordered items (fields + section dividers) ────────────────────────────
  const [orderedItems, setOrderedItems] = useState<OrderedItem[]>(() => {
    if (!storageKey) return fields;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const savedIds: string[] = JSON.parse(saved);
        const byId = Object.fromEntries(fields.map(f => [f.id, f]));
        const ordered = savedIds.map(id => byId[id]).filter(Boolean) as DetailField[];
        const savedSet = new Set(savedIds);
        for (const f of fields) if (!savedSet.has(f.id)) ordered.push(f);
        return ordered;
      }
    } catch { /* ignore */ }
    return fields;
  });

  // Load field order + dividers from SQLite (syncs across machines, overrides localStorage).
  useEffect(() => {
    if (!storageKey) return;
    Promise.all([
      dataService.getArcUiPref(`arc-field-order:${storageKey}`),
      dataService.getArcUiPref(`arc-dividers:${storageKey}`),
    ]).then(([orderRaw, dividersRaw]) => {
      setOrderedItems(prev => {
        // Apply DB field order if present
        let baseFields = prev.filter(i => !isDivider(i)) as DetailField[];
        if (orderRaw) {
          try {
            const savedIds: string[] = JSON.parse(orderRaw);
            const byId = Object.fromEntries(baseFields.map(f => [f.id, f]));
            const ordered = savedIds.map(id => byId[id]).filter(Boolean) as DetailField[];
            const savedSet = new Set(savedIds);
            for (const f of baseFields) if (!savedSet.has(f.id)) ordered.push(f);
            baseFields = ordered;
          } catch { /* ignore */ }
        }
        // Merge dividers in
        if (!dividersRaw) return baseFields;
        try {
          const saved: { id: string; label: string; afterId: string | '__start__' }[] = JSON.parse(dividersRaw);
          const result: OrderedItem[] = [];
          const dividersBefore: Record<string, SectionDivider[]> = {};
          for (const d of saved) {
            const key = d.afterId;
            if (!dividersBefore[key]) dividersBefore[key] = [];
            dividersBefore[key].push({ kind: 'divider', id: d.id, label: d.label });
          }
          for (const div of (dividersBefore['__start__'] ?? [])) result.push(div);
          for (const item of baseFields) {
            result.push(item);
            for (const div of (dividersBefore[item.id] ?? [])) result.push(div);
          }
          return result;
        } catch { /* ignore */ }
        return baseFields;
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Sync when fields prop changes
  useEffect(() => {
    setOrderedItems(prev => {
      const fieldMap = Object.fromEntries(fields.map(f => [f.id, f]));
      const updated = prev.map(item => isDivider(item) ? item : (fieldMap[item.id] ?? null)).filter(Boolean) as OrderedItem[];
      const prevFieldIds = new Set(prev.filter(i => !isDivider(i)).map(i => i.id));
      const newFields = fields.filter(f => !prevFieldIds.has(f.id));
      return [...updated, ...newFields];
    });
  }, [fields]);

  function deriveSections(items: OrderedItem[]): Record<string, string> {
    const sections: Record<string, string> = {};
    let current = '';
    for (const item of items) {
      if (isDivider(item)) { current = item.label; }
      else if (current) { sections[item.id] = current; }
    }
    return sections;
  }

  function saveItems(items: OrderedItem[]) {
    if (!storageKey) return;
    const fieldIds = items.filter(i => !isDivider(i)).map(i => i.id);
    // Persist field order to both localStorage (fast local read) and DB (cross-machine sync)
    localStorage.setItem(storageKey, JSON.stringify(fieldIds));
    dataService.setArcUiPref(`arc-field-order:${storageKey}`, JSON.stringify(fieldIds)).catch(() => {});
    // Persist divider positions in SQLite
    const divPositions: { id: string; label: string; afterId: string | '__start__' }[] = [];
    let lastFieldId: string | '__start__' = '__start__';
    for (const item of items) {
      if (isDivider(item)) {
        divPositions.push({ id: item.id, label: item.label, afterId: lastFieldId });
      } else {
        lastFieldId = item.id;
      }
    }
    dataService.setArcUiPref(`arc-dividers:${storageKey}`, JSON.stringify(divPositions));
    // Derive and save field sections
    onSaveAllSections?.(deriveSections(items));
    // Update custom field def order
    const customInOrder = items.filter(i => !isDivider(i) && !(i as DetailField).builtin) as DetailField[];
    const updatedDefs = arcFieldDefs.map(def => {
      const idx = customInOrder.findIndex(f => f.id === def.id);
      return idx >= 0 ? { ...def, order: idx } : def;
    });
    if (updatedDefs.some((d, i) => d.order !== arcFieldDefs[i]?.order)) onSaveDefs(updatedDefs);
  }

  // ── Template helpers ──────────────────────────────────────────────────────────
  function handleApplyTemplate(template: ArcTemplate) {
    const fieldMap = Object.fromEntries(fields.map(f => [f.id, f]));
    const baseFields = template.fieldOrder.map(id => fieldMap[id]).filter(Boolean) as DetailField[];
    const inTemplate = new Set(template.fieldOrder);
    for (const f of fields) if (!inTemplate.has(f.id)) baseFields.push(f);

    const divBefore: Record<string, SectionDivider[]> = {};
    for (const d of template.dividers) {
      if (!divBefore[d.afterId]) divBefore[d.afterId] = [];
      divBefore[d.afterId].push({ kind: 'divider', id: crypto.randomUUID(), label: d.label });
    }
    const result: OrderedItem[] = [];
    for (const div of (divBefore['__start__'] ?? [])) result.push(div);
    for (const f of baseFields) {
      result.push(f);
      for (const div of (divBefore[f.id] ?? [])) result.push(div);
    }
    setOrderedItems(result);
    saveItems(result);
    onApplyTemplate?.(template);
    setShowTemplatePanel(false);
  }

  function handleSaveCurrentAsTemplate() {
    if (!entityType || !newTemplateName.trim() || !onSaveTemplate) return;
    const fieldOrder = orderedItems.filter(i => !isDivider(i)).map(i => i.id);
    const dividers: ArcTemplate['dividers'] = [];
    let lastFieldId: string | '__start__' = '__start__';
    for (const item of orderedItems) {
      if (isDivider(item)) {
        dividers.push({ id: crypto.randomUUID(), label: item.label, afterId: lastFieldId });
      } else {
        lastFieldId = item.id;
      }
    }
    onSaveTemplate({
      name: newTemplateName.trim(),
      entityType,
      fieldOrder,
      hiddenBuiltinIds: [...(hiddenBuiltinIds ?? [])],
      hiddenCustomIds: [...(hiddenCustomIds ?? [])],
      dividers,
    });
    setNewTemplateName('');
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeItem = orderedItems.find(i => i.id === active.id);
    if (!activeItem) return;

    // When dragging a section divider, move the entire section block (divider + all
    // fields beneath it, up to the next divider) so fields stay grouped with their header.
    if (isDivider(activeItem)) {
      const oldIdx = orderedItems.findIndex(i => i.id === active.id);
      const targetIdx = orderedItems.findIndex(i => i.id === over.id);
      if (targetIdx < 0) return;

      // Collect the section block: this divider + fields until the next divider
      let blockEnd = oldIdx + 1;
      while (blockEnd < orderedItems.length && !isDivider(orderedItems[blockEnd])) blockEnd++;
      const sectionBlock = orderedItems.slice(oldIdx, blockEnd);

      // Build the list without the section block
      const without = [...orderedItems.slice(0, oldIdx), ...orderedItems.slice(blockEnd)];

      // Find the target item's position in the reduced list
      const overInWithout = without.findIndex(i => i.id === over.id);
      if (overInWithout < 0) return; // over.id was inside the dragged block — no-op

      // Moving down → insert after the target; moving up → insert before
      const insertPos = targetIdx > oldIdx ? overInWithout + 1 : overInWithout;
      const newOrder = [...without.slice(0, insertPos), ...sectionBlock, ...without.slice(insertPos)];
      setOrderedItems(newOrder);
      saveItems(newOrder);
    } else {
      const oldIdx = orderedItems.findIndex(i => i.id === active.id);
      const newIdx = orderedItems.findIndex(i => i.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;
      const newOrder = arrayMove(orderedItems, oldIdx, newIdx);
      setOrderedItems(newOrder);
      saveItems(newOrder);
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const hasScenes = scenes && scenes.length >= 0;
  const totalWc = scenes ? scenes.reduce((s, sc) => s + (sc.wordCount ?? 0), 0) : 0;

  return (
    <div
      className="arc-dm-overlay"
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`arc-dm-card${hasScenes ? ' arc-dm-card--with-scenes' : ''}`}>
        <div className="arc-dm-header">
          <div className="arc-dm-header-left">
            {subtitle && <span className="arc-dm-subtitle">{subtitle}</span>}
            <span className="arc-dm-title">{title}</span>
          </div>
          <button className="arc-dm-close" onClick={onClose} type="button">&times;</button>
        </div>

        <div className="arc-dm-columns">
          <div className="arc-dm-main">
            <div className="arc-dm-body">
              {showTemplatePanel ? (
                <div className="arc-dm-template-panel">
                  <div className="arc-dm-template-panel-header">
                    <button className="arc-dm-back-btn" onClick={() => setShowTemplatePanel(false)} type="button">← Back</button>
                    <span className="arc-dm-template-panel-title">Fields &amp; Templates</span>
                  </div>

                  <div className="arc-dm-field-picker-section">
                    <div className="arc-dm-picker-label">VISIBLE FIELDS</div>
                    {fields.map(f => (
                      <label key={f.id} className="arc-dm-field-toggle">
                        <input
                          type="checkbox"
                          checked={f.builtin ? !hiddenBuiltinIds?.has(f.id) : !hiddenCustomIds?.has(f.id)}
                          onChange={() => f.builtin ? onToggleBuiltin?.(f.id) : onToggleCustom?.(f.id)}
                        />
                        <span className="arc-dm-toggle-icon">{f.icon}</span>
                        <span className="arc-dm-toggle-label">{f.label}</span>
                      </label>
                    ))}
                  </div>

                  {entityType && (
                    <div className="arc-dm-template-list-section">
                      <div className="arc-dm-picker-label">TEMPLATES</div>
                      {(templates ?? []).filter(t => t.entityType === entityType).length === 0 && (
                        <div className="arc-dm-template-empty">No saved templates yet</div>
                      )}
                      {(templates ?? []).filter(t => t.entityType === entityType).map(t => (
                        <div key={t.id} className="arc-dm-template-row">
                          <span className="arc-dm-template-name">{t.name}</span>
                          <button className="arc-dm-template-apply-btn" onClick={() => handleApplyTemplate(t)} type="button">Apply</button>
                          <button className="arc-dm-template-delete-btn" onClick={() => onDeleteTemplate?.(t.id)} type="button" title="Delete template">&times;</button>
                        </div>
                      ))}
                      {onSaveTemplate && (
                        <div className="arc-dm-template-save-row">
                          <input
                            type="text"
                            className="arc-dm-template-name-input"
                            placeholder="Template name..."
                            value={newTemplateName}
                            onChange={e => setNewTemplateName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && newTemplateName.trim()) handleSaveCurrentAsTemplate(); }}
                          />
                          <button
                            className="arc-dm-template-save-btn"
                            disabled={!newTemplateName.trim()}
                            onClick={handleSaveCurrentAsTemplate}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : showManager ? (
                <ArcFieldManager
                  defs={arcFieldDefs}
                  onSave={defs => onSaveDefs(defs)}
                  onBack={() => setShowManager(false)}
                  builtinFields={builtinRefs}
                  hiddenBuiltinIds={hiddenBuiltinIds}
                  onToggleBuiltin={onToggleBuiltin}
                  hiddenCustomIds={hiddenCustomIds}
                  onToggleCustom={onToggleCustom}
                  fieldSections={fieldSections}
                  onSectionChange={_onSectionChange}
                />
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  {(() => {
                    const visibleItems = orderedItems.filter(item =>
                      isDivider(item) || (item.builtin ? !hiddenBuiltinIds?.has(item.id) : !hiddenCustomIds?.has(item.id))
                    );
                    return (
                      <SortableContext items={visibleItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        {visibleItems.map(item => isDivider(item) ? (
                          <DividerRow
                            key={item.id}
                            divider={item}
                            onRename={(id, label) => {
                              const next = orderedItems.map(i => isDivider(i) && i.id === id ? { ...i, label } : i);
                              setOrderedItems(next);
                              saveItems(next);
                            }}
                            onDelete={id => {
                              const next = orderedItems.filter(i => i.id !== id);
                              setOrderedItems(next);
                              saveItems(next);
                            }}
                          />
                        ) : (
                          <FieldRow
                            key={item.id}
                            field={item}
                            sortable
                            onHide={item.builtin
                              ? (onToggleBuiltin ? () => onToggleBuiltin(item.id) : undefined)
                              : (onToggleCustom ? () => onToggleCustom(item.id) : undefined)}
                          />
                        ))}
                      </SortableContext>
                    );
                  })()}
                </DndContext>
              )}
            </div>
            {!showManager && !showTemplatePanel && (
              <div className="arc-dm-footer">
                <button
                  className="arc-dm-add-section-btn"
                  onClick={() => {
                    const newDiv: SectionDivider = { kind: 'divider', id: crypto.randomUUID(), label: '' };
                    const next = [newDiv, ...orderedItems];
                    setOrderedItems(next);
                    saveItems(next);
                  }}
                  type="button"
                >
                  + Add section
                </button>
                <button className="arc-dm-templates-btn" onClick={() => setShowTemplatePanel(true)} type="button">
                  &#9776; Fields &amp; Templates
                </button>
                <button className="arc-dm-manage-btn" onClick={() => setShowManager(true)} type="button">
                  &#9881; Manage fields
                </button>
              </div>
            )}
          </div>

          {hasScenes && (
            <div className="arc-dm-scenes-col">
              <div className="arc-dm-scenes-header">
                <span className="arc-dm-scenes-label">Scenes</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="arc-dm-scenes-count">{orderedScenes.length}</span>
                  {onAddScene && (
                    <button className="arc-dm-scenes-add" onClick={onAddScene} title="Add new scene">+ Scene</button>
                  )}
                </div>
              </div>
              <div className="arc-dm-scenes-list">
                {selectedScene ? (
                  sceneArcFieldDefs && onSaveSceneBuiltins && onSaveSceneArcFields ? (
                    <SceneFieldPanel
                      key={selectedScene.id}
                      scene={selectedScene}
                      fields={buildSceneFields(selectedScene)}
                      arcFieldDefs={sceneArcFieldDefs}
                      onSaveDefs={arcDefs => {
                        const nonScene = arcFieldDefs.filter(d => d.scope !== 'scene');
                        onSaveDefs([...nonScene, ...arcDefs.filter(d => d.scope === 'scene')]);
                      }}
                      hiddenBuiltinIds={hiddenBuiltinIds_scene}
                      onToggleBuiltin={onToggleBuiltin_scene}
                      hiddenCustomIds={hiddenCustomIds_scene}
                      onToggleCustom={onToggleCustom_scene}
                      templates={templates_scene}
                      onSaveTemplate={onSaveTemplate_scene}
                      onDeleteTemplate={onDeleteTemplate_scene}
                      onBack={() => setSelectedSceneId(null)}
                      onGoToScene={onGoToScene}
                    />
                  ) : (
                  <SceneTextPanel
                    key={selectedScene.id}
                    scene={selectedScene}
                    draftContent={draftContent ?? {}}
                    onDraftChange={onDraftChange}
                    onGoToScene={onGoToScene}
                    onBack={() => setSelectedSceneId(null)}
                  />
                  )
                ) : (
                  <DndContext sensors={scenesSensors} collisionDetection={closestCenter} onDragEnd={handleScenesDragEnd}>
                    <SortableContext items={orderedScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      {orderedScenes.length === 0 && (
                        <div className="arc-dm-scenes-empty">No scenes yet — add one above</div>
                      )}
                      {orderedScenes.map(scene => (
                        <SortableSceneItem
                          key={scene.id}
                          scene={scene}
                          selected={selectedSceneId === scene.id}
                          onSelect={id => setSelectedSceneId(id)}
                          onSendToBullpen={onSendToBullpen ? () => onSendToBullpen(scene.id) : undefined}
                        />
                      ))}
                    </SortableContext>
                    <BullpenDropZone>
                      <div className="arc-dm-bullpen-header">
                        Bullpen
                        <span className="arc-dm-bullpen-hint">drag here or right-click</span>
                      </div>
                      {bullpenScenes && bullpenScenes.map(scene => (
                        <div key={scene.id} className="arc-bullpen-row">
                          <span className="arc-bullpen-label">{scene.title || 'Untitled scene'}</span>
                          <button
                            className="arc-dm-bullpen-pull"
                            onClick={() => onPullFromBullpen?.(scene.id)}
                            title="Pull into section"
                          >+</button>
                        </div>
                      ))}
                      {(!bullpenScenes || bullpenScenes.length === 0) && (
                        <div className="arc-dm-bullpen-empty">No scenes in bullpen</div>
                      )}
                    </BullpenDropZone>
                  </DndContext>
                )}
              </div>
              {totalWc > 0 && (
                <div className="arc-dm-scenes-footer">{totalWc.toLocaleString()} words</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
