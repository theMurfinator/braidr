import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../dnd';
import ScenePreviewPanel from './ScenePreviewPanel';
import { Character, Act, PlotPoint, Scene, CharacterPsychology } from '../../shared/types';

// ── Arc column model ─────────────────────────────────────────────────────────
// The arc table's content columns (everything right of the pinned Name column).
// Order + visibility are user-configurable and persisted to localStorage so the
// same column list drives the header, every row, AND the grid template — which
// keeps them aligned by construction.
type ArcRowKind = 'novel' | 'act' | 'section' | 'scene';
type ArcColKind = 'text' | 'polarity' | 'words';
interface ArcColumn {
  id: string;
  label: string;
  width: number;   // px width of this column's grid track
  kind: ArcColKind;
  field: string;   // entity field (non-novel name); the novel row uses 'novel' + Capitalized
  center?: boolean;
}
const ARC_NAME_COL_WIDTH = 240; // pinned first column (default width)
const ARC_NAME_COL_ID = '__name__'; // reserved width key for the pinned name column
const ARC_NAME_MIN_WIDTH = 140;
const ARC_COLUMNS: ArcColumn[] = [
  { id: 'beginning',    label: 'Beginning',         width: 200, kind: 'text',     field: 'startingState' },
  { id: 'ending',       label: 'Ending',            width: 200, kind: 'text',     field: 'endingState' },
  { id: 'turningPoint', label: 'Turning point',     width: 200, kind: 'text',     field: 'transformation' },
  { id: 'dilemma',      label: 'Dilemma',           width: 200, kind: 'text',     field: 'dilemma' },
  { id: 'propelling',   label: 'Propelling Action', width: 200, kind: 'text',     field: 'propellingAction' },
  { id: 'polarity',     label: 'Polarity shift',    width: 120, kind: 'polarity', field: 'polarity', center: true },
  { id: 'words',        label: 'Words',             width: 80,  kind: 'words',    field: '', center: true },
];
const ARC_COL_BY_ID: Record<string, ArcColumn> = Object.fromEntries(ARC_COLUMNS.map(c => [c.id, c]));
const ARC_COL_IDS = ARC_COLUMNS.map(c => c.id);

// Per-row-type placeholders, preserving the original wording per column.
const ARC_PLACEHOLDERS: Record<ArcRowKind, Record<string, string>> = {
  novel:   { beginning: 'Where does this character begin?', ending: 'Where does this character end?', turningPoint: 'What creates the dilemma...', dilemma: 'The central dilemma...', propelling: 'What propels the story...' },
  act:     { beginning: 'Entering this act...', ending: 'Exiting this act...', turningPoint: 'What creates the dilemma...', dilemma: "The act's dilemma...", propelling: 'What propels this act...' },
  section: { beginning: 'Entering state...', ending: 'Exiting state...', turningPoint: 'What creates the dilemma...', dilemma: "The section's dilemma...", propelling: 'What propels this section...' },
  scene:   { beginning: 'Beginning...', ending: 'Ending...', turningPoint: 'What creates the dilemma...', dilemma: 'Scene dilemma...', propelling: 'Propelling action...' },
};

const ARC_COLS_LS_KEY = 'braidr.arcColumns.v1';
const ARC_MIN_COL_WIDTH = 80;
interface ArcColPref { order: string[]; hidden: string[]; widths: Record<string, number>; }
function loadArcColPref(): ArcColPref {
  try {
    const raw = localStorage.getItem(ARC_COLS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArcColPref>;
      const known = new Set(ARC_COL_IDS);
      const order = (parsed.order ?? []).filter(id => known.has(id));
      for (const id of ARC_COL_IDS) if (!order.includes(id)) order.push(id); // append columns added since
      const hidden = (parsed.hidden ?? []).filter(id => known.has(id));
      const widths: Record<string, number> = {};
      for (const [id, w] of Object.entries(parsed.widths ?? {})) {
        // The pinned Name column persists under a reserved key that isn't in
        // ARC_COL_IDS, so allow it through the filter explicitly.
        if ((known.has(id) || id === ARC_NAME_COL_ID) && typeof w === 'number' && isFinite(w)) {
          widths[id] = Math.max(ARC_MIN_COL_WIDTH, Math.round(w));
        }
      }
      return { order, hidden, widths };
    }
  } catch { /* ignore corrupt prefs */ }
  return { order: [...ARC_COL_IDS], hidden: [], widths: {} };
}
function saveArcColPref(order: string[], hidden: Set<string>, widths: Record<string, number>) {
  try { localStorage.setItem(ARC_COLS_LS_KEY, JSON.stringify({ order, hidden: [...hidden], widths })); } catch { /* ignore */ }
}
const arcCapitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Arc view layout state (hide-acts/sections toggles + which acts/sections are
// collapsed) persists so the view reopens exactly as you left it.
const ARC_VIEW_LS_KEY = 'braidr.arcView.v1';
interface ArcViewPref { hideActs: boolean; hideSections: boolean; collapsed: string[]; }
function loadArcViewPref(): ArcViewPref {
  try {
    const raw = localStorage.getItem(ARC_VIEW_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ArcViewPref>;
      return {
        hideActs: !!p.hideActs,
        hideSections: !!p.hideSections,
        collapsed: Array.isArray(p.collapsed) ? p.collapsed.filter(x => typeof x === 'string') : [],
      };
    }
  } catch { /* ignore corrupt prefs */ }
  return { hideActs: false, hideSections: false, collapsed: [] };
}
function saveArcViewPref(pref: ArcViewPref) {
  try { localStorage.setItem(ARC_VIEW_LS_KEY, JSON.stringify(pref)); } catch { /* ignore */ }
}

const POLARITY_COLORS: Record<string, { bg: string; color: string }> = {
  '+/-':   { bg: '#fee2e2', color: '#b91c1c' },
  '-/+':   { bg: '#dcfce7', color: '#15803d' },
  '-/-':   { bg: '#fecaca', color: '#7f1d1d' },
  '+/+':   { bg: '#14532d', color: '#dcfce7' },
  '+/-/+': { bg: '#fef9c3', color: '#854d0e' },
  '-/+/-': { bg: '#ede9fe', color: '#6d28d9' },
};
const POLARITY_OPTIONS = ['+/-', '-/+', '-/-', '+/+', '+/-/+', '-/+/-'];


function emptyPsych(characterId: string): CharacterPsychology {
  return {
    characterId, novelStartingState: '', novelEndingState: '', novelPolarity: '', novelTransformation: '',
    novelDilemma: '', novelPropellingAction: '',
    wound: '', lie: '', deepestFear: '', limitingBelief: '', thorn: '', copingTool: '',
    whisperOfGrace: '', surfaceWant: '', soulsLonging: '', bitterNeed: '', capitalTTruth: '',
    arcSummary: '', theme: '', antiTheme: '', finalReaderExperience: '',
  };
}

function EditableCell({ value, placeholder, onChange, multiline = false, className }: {
  value: string; placeholder: string; onChange: (v: string) => void; multiline?: boolean; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Resize after render so full content is visible immediately on open
  useEffect(() => {
    if (editing && taRef.current) {
      autoResize(taRef.current);
      taRef.current.setSelectionRange(taRef.current.value.length, taRef.current.value.length);
    }
  }, [editing]);

  const commit = () => { setEditing(false); if (draft !== value) onChange(draft); };
  // Tab / Shift+Tab moves to the next / previous editable cell (spreadsheet-style).
  // Cells are found in DOM order via the shared `arc-nav-cell` class, which is
  // row-major — so it skips the polarity picker and read-only word-count cell.
  const handleTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const cells = Array.from(document.querySelectorAll<HTMLElement>('.arc-nav-cell'));
    const idx = cells.indexOf(e.currentTarget as HTMLElement);
    const target = cells[e.shiftKey ? idx - 1 : idx + 1];
    commit();
    if (target) requestAnimationFrame(() => target.focus());
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={taRef}
          value={draft}
          placeholder={placeholder}
          className="arc-editable-input arc-nav-cell"
          style={{ width: '100%', resize: 'none', overflow: 'hidden', minHeight: '2.4em' }}
          onChange={e => { setDraft(e.target.value); autoResize(e.target); }}
          onBlur={() => { setEditing(false); if (draft !== value) onChange(draft); }}
          onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(value); } handleTab(e); }}
          autoFocus
        />
      );
    }
    return (
      <input
        value={draft}
        placeholder={placeholder}
        className="arc-editable-input arc-nav-cell"
        style={{ width: '100%' }}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onChange(draft); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
          if (e.key === 'Enter') { setEditing(false); if (draft !== value) onChange(draft); }
          handleTab(e);
        }}
        autoFocus
      />
    );
  }

  return (
    <span
      className={`arc-editable-display arc-nav-cell${className ? ` ${className}` : ''}`}
      tabIndex={-1}
      onClick={() => { setEditing(true); setDraft(value); }}
      onFocus={() => { if (!editing) { setEditing(true); setDraft(value); } }}
      style={{ color: value ? 'inherit' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic' }}
    >
      {value || placeholder}
    </span>
  );
}

function PolarityCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const style = POLARITY_COLORS[value] ?? {};
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <span
        className="arc-pol-badge"
        onClick={() => setOpen(o => !o)}
        style={value ? { background: style.bg, color: style.color } : {}}
      >
        {value || '—'}
      </span>
      {open && (
        <div className="arc-pol-picker">
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

function EmptySectionDropZone({ sectionId }: { sectionId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-empty:${sectionId}`,
    data: { sectionId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`dnd-section-drop-placeholder ${isOver ? 'is-over' : ''}`}
      aria-label="Drop scene into this empty section"
    />
  );
}

interface ArcViewProps {
  characters: Character[];
  selectedCharacterId: string;
  onSelectCharacter: (id: string) => void;
  acts: Act[];
  plotPoints: PlotPoint[];
  scenes: Scene[];
  draftContent: Record<string, string>;
  onDraftChange: (sceneKey: string, html: string) => void;
  onGoToScene: (sceneKey: string) => void;
  previewSceneId: string | null;
  onSetPreviewScene: React.Dispatch<React.SetStateAction<string | null>>;
  characterColors: Record<string, string>;
  psychology: CharacterPsychology | null;
  onSaveAct: (act: Act) => void;
  onDeleteAct: (actId: string) => void;
  onSavePlotPointArcFields: (plotPointId: string, fields: Partial<Pick<PlotPoint, 'actId' | 'inBullpen' | 'startingState' | 'endingState' | 'polarity' | 'transformation' | 'dilemma' | 'propellingAction' | 'title' | 'description' | 'synopsis'>>) => void;
  onSaveSceneArcFields: (sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; synopsis?: string; startingState?: string; endingState?: string; title?: string }) => void;
  onSaveSceneNotes: (sceneId: string, notes: string[]) => void;
  onSendSceneToBullpen: (sceneId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onSavePsychology: (psychology: CharacterPsychology) => void;
  arcActiveId: string | null;
}

function ActContextMenu({ x, y, onDelete, onClose }: {
  x: number; y: number; onDelete: () => void; onClose: () => void;
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
      <div className="arc-context-item arc-context-danger" onClick={onDelete}>Delete Act</div>
    </div>
  );
}

function ArcSectionContextMenu({ x, y, sectionId: _sectionId, acts, onMoveToAct, onReturnToBullpen, onDelete, onClose }: {
  x: number; y: number; sectionId: string;
  acts: Act[];
  onMoveToAct: (actId: string) => void;
  onReturnToBullpen: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [showActSubmenu, setShowActSubmenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="arc-context-menu" style={{ left: x, top: y }}>
      <div className="arc-context-item" onMouseEnter={() => setShowActSubmenu(true)} onMouseLeave={() => setShowActSubmenu(false)}>
        Move to Act &#9658;
        {showActSubmenu && (
          <div className="arc-context-submenu">
            {acts.map(act => (
              <div key={act.id} className="arc-context-item" onClick={() => onMoveToAct(act.id)}>
                {act.name || 'Unnamed act'}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="arc-context-item" onClick={onReturnToBullpen}>Return to Bullpen</div>
      <div className="arc-context-divider" />
      <div className="arc-context-item arc-context-danger" onClick={onDelete}>Delete</div>
    </div>
  );
}

function SceneContextMenu({ x, y, onSendToBullpen, onClose }: {
  x: number; y: number; onSendToBullpen: () => void; onClose: () => void;
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
      <div className="arc-context-item" onClick={onSendToBullpen}>Send to Bullpen</div>
    </div>
  );
}

// Inline editable scene-text editor for the Arc preview panel.
// Mirrors EditorView's draft editor (same extensions + 800ms debounced auto-save)
// so edits here write back to the exact same draft the full editor uses.
export default function ArcView({
  characters,
  selectedCharacterId,
  acts,
  plotPoints,
  scenes,
  draftContent,
  onDraftChange,
  onGoToScene,
  previewSceneId,
  onSetPreviewScene: setPreviewSceneId,
  characterColors,
  psychology,
  onSaveAct,
  onDeleteAct,
  onSavePlotPointArcFields,
  onSaveSceneArcFields,
  onSaveSceneNotes,
  onSendSceneToBullpen,
  onDeleteSection,
  onSavePsychology,
  arcActiveId: _arcActiveId,
}: ArcViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(loadArcViewPref().collapsed));
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sectionId: string } | null>(null);
  const [actContextMenu, setActContextMenu] = useState<{ x: number; y: number; actId: string } | null>(null);
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const [hideActs, setHideActs] = useState(() => loadArcViewPref().hideActs);
  const [hideSections, setHideSections] = useState(() => loadArcViewPref().hideSections);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadArcColPref().order);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set(loadArcColPref().hidden));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => loadArcColPref().widths);
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [resizingColId, setResizingColId] = useState<string | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // Persist column layout (view preference — local to this device, all projects)
  useEffect(() => { saveArcColPref(columnOrder, hiddenCols, columnWidths); }, [columnOrder, hiddenCols, columnWidths]);
  // Persist hide-acts/sections toggles + collapsed acts/sections, so the view
  // reopens exactly as it was left.
  useEffect(() => { saveArcViewPref({ hideActs, hideSections, collapsed: [...collapsed] }); }, [hideActs, hideSections, collapsed]);
  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e: MouseEvent) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setShowColMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowColMenu(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', key); };
  }, [showColMenu]);

  const character = characters.find(c => c.id === selectedCharacterId);
  const charColor = characterColors[selectedCharacterId] || '#6366f1';

  const isCollapsed = (id: string) => collapsed.has(id);
  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const psych = psychology;
  const savePsych = (update: Partial<CharacterPsychology>) => {
    onSavePsychology({ ...(psych || emptyPsych(selectedCharacterId)), ...update });
  };

  const sortedActs = [...acts].sort((a, b) => a.order - b.order);
  // "Collapse all" targets every act and every section (plot point under an act).
  // The novel row is left expanded so collapsing reveals the act outline.
  const collapsibleIds = [
    ...sortedActs.map(a => `act-${a.id}`),
    ...plotPoints.filter(pp => pp.actId).map(pp => `sec-${pp.id}`),
  ];
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every(id => collapsed.has(id));
  const toggleCollapseAll = () => {
    // Expand-all clears everything (incl. the novel row); collapse-all collapses
    // acts + sections while leaving the novel row open.
    setCollapsed(prev => (allCollapsed ? new Set() : new Set([...prev, ...collapsibleIds])));
  };

  const sectionWc = (ppId: string) =>
    scenes.filter(s => s.plotPointId === ppId).reduce((sum, s) => sum + (s.wordCount ?? 0), 0);

  const actWc = (actId: string) => {
    const ppIds = new Set(plotPoints.filter(pp => pp.actId === actId).map(pp => pp.id));
    return scenes.filter(s => s.plotPointId && ppIds.has(s.plotPointId)).reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
  };

  const novelWc = () => scenes.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);

  const fmtWc = (n: number) => n > 0 ? n.toLocaleString() : null;

  // Visible columns in user order; drives header, rows, and the grid template.
  const visibleColumns = columnOrder
    .map(id => ARC_COL_BY_ID[id])
    .filter((c): c is ArcColumn => !!c && !hiddenCols.has(c.id));
  const colWidth = (col: ArcColumn) => columnWidths[col.id] ?? col.width;
  const nameColWidth = columnWidths[ARC_NAME_COL_ID] ?? ARC_NAME_COL_WIDTH;
  const arcGridCols = `${nameColWidth}px ${visibleColumns.map(c => `${colWidth(c)}px`).join(' ')}`;

  const moveColumn = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setColumnOrder(prev => {
      const fromIdx = prev.indexOf(fromId);
      const toIdx = prev.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const arr = prev.filter(id => id !== fromId);
      const targetIdx = arr.indexOf(toId);
      // Dragging rightward drops the column AFTER the target; leftward drops it
      // BEFORE — so dropping on a header lands the column in that header's slot
      // in both directions (and the far edges are reachable).
      const insertAt = fromIdx < toIdx ? targetIdx + 1 : targetIdx;
      arr.splice(insertAt, 0, fromId);
      return arr;
    });
  };
  const toggleColumn = (id: string) => setHiddenCols(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const resetColumns = () => { setColumnOrder([...ARC_COL_IDS]); setHiddenCols(new Set()); setColumnWidths({}); };

  // Drag the right edge of a header to resize that column (works for the pinned
  // name column too). Uses document-level listeners so the drag keeps tracking
  // even if the pointer leaves the handle.
  const onColResizeStart = (e: React.MouseEvent, id: string, startW: number, minW = ARC_MIN_COL_WIDTH) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { id, startX: e.clientX, startW };
    setResizingColId(id);
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const w = Math.max(minW, Math.round(r.startW + (ev.clientX - r.startX)));
      setColumnWidths(prev => ({ ...prev, [r.id]: w }));
    };
    const onUp = () => {
      resizeRef.current = null;
      setResizingColId(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Render the content cells (everything right of the Name column) for one row.
  const renderArcCells = (kind: ArcRowKind, entity: any) => visibleColumns.map(col => {
    if (col.kind === 'words') {
      const wc = kind === 'novel' ? novelWc()
        : kind === 'act' ? actWc(entity.id)
        : kind === 'section' ? sectionWc(entity.id)
        : (entity.wordCount ?? 0);
      return <div key={col.id} className="arc-cell arc-wc-col">{fmtWc(wc) ? <span className="arc-wc">{fmtWc(wc)}</span> : null}</div>;
    }
    const fieldName = kind === 'novel' ? `novel${arcCapitalize(col.field)}` : col.field;
    const value = (entity[fieldName] ?? '') as string;
    const onChange = (v: string) => {
      if (kind === 'scene') onSaveSceneArcFields(entity.id, { [col.field]: v } as any);
      else if (kind === 'section') onSavePlotPointArcFields(entity.id, { [col.field]: v } as any);
      else if (kind === 'act') onSaveAct({ ...entity, [col.field]: v });
      else savePsych({ [fieldName]: v } as any);
    };
    if (col.kind === 'polarity') {
      return <div key={col.id} className="arc-cell arc-pol-col"><PolarityCell value={value} onChange={onChange} /></div>;
    }
    return (
      <div key={col.id} className="arc-cell">
        <EditableCell value={value} placeholder={ARC_PLACEHOLDERS[kind][col.id] || ''} onChange={onChange} multiline />
      </div>
    );
  });

  // Draggable column headers (native DnD — self-contained, no dnd-kit context here).
  const renderArcHeaderCells = () => visibleColumns.map(col => (
    <div key={col.id}
      className={`arc-col-h${col.center ? ' arc-col-center' : ''}${dragColId === col.id ? ' arc-col-dragging' : ''}${resizingColId === col.id ? ' arc-col-resizing' : ''}`}
      draggable={resizingColId === null}
      onDragStart={() => setDragColId(col.id)}
      onDragEnd={() => setDragColId(null)}
      onDragOver={e => { e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); if (dragColId) moveColumn(dragColId, col.id); setDragColId(null); }}
      title="Drag to reorder column"
    >
      <span className="arc-col-h-label">{col.label}</span>
      <span
        className="arc-col-resize"
        onMouseDown={e => onColResizeStart(e, col.id, colWidth(col))}
        onClick={e => e.stopPropagation()}
        title="Drag to resize column"
      />
    </div>
  ));




  const renderSceneRow = (scene: Scene, sectionId: string) => (
    <SortableItem key={scene.id} id={scene.id} data={{ type: 'arc-scene', sectionId }}>
      {({ setNodeRef, style, listeners, attributes, isDragging }) => (
        <div ref={setNodeRef} style={{ ...style, opacity: isDragging ? 0.3 : 1 }}
          className="arc-row arc-scene arc-grid arc-scene-draggable"
          onContextMenu={e => { e.preventDefault(); setSceneContextMenu({ x: e.clientX, y: e.clientY, sceneId: scene.id }); }}>
          <div className="arc-name-cell" style={{ paddingLeft: 104 }}>
            <span className="arc-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠿</span>
            <div className="arc-name-inner">
              <EditableCell className="arc-scene-title" value={scene.title || ''} placeholder="Scene title..."
                onChange={v => onSaveSceneArcFields(scene.id, { title: v })} />
              <EditableCell className="arc-scene-synopsis" value={(scene.notes ?? []).join('\n')} placeholder="Add synopsis..."
                onChange={v => onSaveSceneNotes(scene.id, v.trim() ? v.split('\n') : [])} multiline />
            </div>
            <button
              className={`arc-preview-btn${previewSceneId === scene.id ? ' active' : ''}`}
              title="Preview scene text"
              onClick={() => setPreviewSceneId(id => id === scene.id ? null : scene.id)}
            >
              Preview
            </button>
          </div>
          {renderArcCells('scene', scene)}
        </div>
      )}
    </SortableItem>
  );

  const renderSection = (pp: PlotPoint) => {
    const sectionScenes = scenes
      .filter(s => s.plotPointId === pp.id)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    const coll = !hideSections && isCollapsed(`sec-${pp.id}`);
    const showScenes = hideSections || !coll;
    return (
      <div key={pp.id}>
        {!hideSections && (
          <div
            className="arc-row arc-section arc-grid"
            style={{ borderLeft: `2px solid ${charColor}` }}
            onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, sectionId: pp.id }); }}
          >
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
            {renderArcCells('section', pp)}
          </div>
        )}
        {showScenes && (
          <SortableContext items={sectionScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {sectionScenes.map(scene => renderSceneRow(scene, pp.id))}
            {sectionScenes.length === 0 && !hideSections && <EmptySectionDropZone sectionId={pp.id} />}
          </SortableContext>
        )}
      </div>
    );
  };

  const renderAct = (act: Act) => {
    const actSections = plotPoints
      .filter(pp => pp.actId === act.id && !pp.inBullpen)
      .sort((a, b) => a.order - b.order);
    const coll = !hideActs && isCollapsed(`act-${act.id}`);
    const showSections = hideActs || !coll;
    return (
      <div key={act.id}>
        {!hideActs && (
          <div className="arc-row arc-act arc-grid"
            onContextMenu={e => { e.preventDefault(); setActContextMenu({ x: e.clientX, y: e.clientY, actId: act.id }); }}>
            <div className="arc-name-cell" style={{ paddingLeft: 32 }}>
              <span className="arc-toggle" onClick={() => toggleCollapsed(`act-${act.id}`)}>
                {coll ? '▶' : '▼'}
              </span>
              <div className="arc-name-inner">
                <EditableCell value={act.name} placeholder="Act name..."
                  onChange={v => onSaveAct({ ...act, name: v })} />
              </div>
            </div>
            {renderArcCells('act', act)}
          </div>
        )}
        {showSections && actSections.map(pp => renderSection(pp))}
      </div>
    );
  };

  return (
    <div className="arc-view" style={{ position: 'relative', ['--arc-grid-cols' as any]: arcGridCols }}>
      <div className="arc-toolbar">
        <button
          className={`arc-toggle-btn${hideActs ? ' active' : ''}`}
          onClick={() => setHideActs(v => !v)}
          title={hideActs ? 'Show acts' : 'Hide acts'}
        >
          {hideActs ? 'Show Acts' : 'Hide Acts'}
        </button>
        <button
          className={`arc-toggle-btn${hideSections ? ' active' : ''}`}
          onClick={() => setHideSections(v => !v)}
          title={hideSections ? 'Show sections' : 'Hide sections'}
        >
          {hideSections ? 'Show Sections' : 'Hide Sections'}
        </button>
        <button
          className="arc-toggle-btn"
          onClick={toggleCollapseAll}
          disabled={collapsibleIds.length === 0}
          title={allCollapsed ? 'Expand all acts and sections' : 'Collapse all acts and sections'}
        >
          {allCollapsed ? 'Expand All' : 'Collapse All'}
        </button>
        <div className="arc-col-menu-wrap" ref={colMenuRef}>
          <button
            className={`arc-toggle-btn${hiddenCols.size > 0 ? ' active' : ''}`}
            onClick={() => setShowColMenu(v => !v)}
            title="Show, hide, or reorder columns (drag a header to reorder)"
          >
            Columns ▾
          </button>
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
        </div>
      </div>

      <div className="arc-scroll">
        <div className="arc-col-headers arc-grid">
          <div className={`arc-col-h arc-col-h-freeze${resizingColId === ARC_NAME_COL_ID ? ' arc-col-resizing' : ''}`}>
            <span
              className="arc-col-resize"
              onMouseDown={e => onColResizeStart(e, ARC_NAME_COL_ID, nameColWidth, ARC_NAME_MIN_WIDTH)}
              title="Drag to resize the name column"
            />
          </div>
          {renderArcHeaderCells()}
        </div>


        {/* Novel row */}
        <div className="arc-row arc-novel arc-grid">
          <div className="arc-name-cell" style={{ paddingLeft: 0 }}>
            <span className="arc-toggle" onClick={() => toggleCollapsed('novel')}>
              {isCollapsed('novel') ? '▶' : '▼'}
            </span>
            <div className="arc-name-inner">
              <span className="arc-novel-title">{character?.name || '—'}</span>
            </div>
          </div>
          {renderArcCells('novel', psych ?? {})}
        </div>

        {!isCollapsed('novel') && sortedActs.map(renderAct)}
      </div>

      {contextMenu && (
        <ArcSectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sectionId={contextMenu.sectionId}
          acts={sortedActs}
          onMoveToAct={(actId) => { onSavePlotPointArcFields(contextMenu.sectionId, { actId, inBullpen: false }); setContextMenu(null); }}
          onReturnToBullpen={() => { onSavePlotPointArcFields(contextMenu.sectionId, { inBullpen: true }); setContextMenu(null); }}
          onDelete={() => { onDeleteSection(contextMenu.sectionId); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
        />
      )}
      {actContextMenu && (
        <ActContextMenu
          x={actContextMenu.x}
          y={actContextMenu.y}
          onDelete={() => { onDeleteAct(actContextMenu.actId); setActContextMenu(null); }}
          onClose={() => setActContextMenu(null)}
        />
      )}
      {sceneContextMenu && (
        <SceneContextMenu
          x={sceneContextMenu.x}
          y={sceneContextMenu.y}
          onSendToBullpen={() => { onSendSceneToBullpen(sceneContextMenu.sceneId); setSceneContextMenu(null); }}
          onClose={() => setSceneContextMenu(null)}
        />
      )}
      <ScenePreviewPanel
        sceneId={previewSceneId}
        title={scenes.find(s => s.id === previewSceneId)?.title || ''}
        draftContent={draftContent}
        onDraftChange={onDraftChange}
        onGoToScene={onGoToScene}
        onClose={() => setPreviewSceneId(null)}
      />
    </div>
  );
}
