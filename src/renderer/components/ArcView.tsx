import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../dnd';
import { Character, Act, PlotPoint, Scene, CharacterPsychology } from '../../shared/types';

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

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={taRef}
          value={draft}
          placeholder={placeholder}
          className="arc-editable-input"
          style={{ width: '100%', resize: 'none', overflow: 'hidden', minHeight: '2.4em' }}
          onChange={e => { setDraft(e.target.value); autoResize(e.target); }}
          onBlur={() => { setEditing(false); if (draft !== value) onChange(draft); }}
          onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(value); } }}
          autoFocus
        />
      );
    }
    return (
      <input
        value={draft}
        placeholder={placeholder}
        className="arc-editable-input"
        style={{ width: '100%' }}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onChange(draft); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
          if (e.key === 'Enter') { setEditing(false); if (draft !== value) onChange(draft); }
        }}
        autoFocus
      />
    );
  }

  return (
    <span
      className={`arc-editable-display${className ? ` ${className}` : ''}`}
      onClick={() => { setEditing(true); setDraft(value); }}
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
  characterColors: Record<string, string>;
  psychology: CharacterPsychology | null;
  onSaveAct: (act: Act) => void;
  onDeleteAct: (actId: string) => void;
  onSavePlotPointArcFields: (plotPointId: string, fields: Partial<Pick<PlotPoint, 'actId' | 'startingState' | 'endingState' | 'polarity' | 'transformation' | 'dilemma' | 'propellingAction' | 'title' | 'description'>>) => void;
  onSaveSceneArcFields: (sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; synopsis?: string; startingState?: string; endingState?: string; title?: string }) => void;
  onSaveSceneNotes: (sceneId: string, notes: string[]) => void;
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

export default function ArcView({
  characters,
  selectedCharacterId,
  acts,
  plotPoints,
  scenes,
  characterColors,
  psychology,
  onSaveAct,
  onDeleteAct,
  onSavePlotPointArcFields,
  onSaveSceneArcFields,
  onSaveSceneNotes,
  onDeleteSection,
  onSavePsychology,
  arcActiveId: _arcActiveId,
}: ArcViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sectionId: string } | null>(null);
  const [actContextMenu, setActContextMenu] = useState<{ x: number; y: number; actId: string } | null>(null);

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

  const sectionWc = (ppId: string) =>
    scenes.filter(s => s.plotPointId === ppId).reduce((sum, s) => sum + (s.wordCount ?? 0), 0);

  const actWc = (actId: string) => {
    const ppIds = new Set(plotPoints.filter(pp => pp.actId === actId).map(pp => pp.id));
    return scenes.filter(s => s.plotPointId && ppIds.has(s.plotPointId)).reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
  };

  const novelWc = () => scenes.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);

  const fmtWc = (n: number) => n > 0 ? n.toLocaleString() : null;




  const renderSceneRow = (scene: Scene, sectionId: string) => (
    <SortableItem key={scene.id} id={scene.id} data={{ type: 'arc-scene', sectionId }}>
      {({ setNodeRef, style, listeners, attributes, isDragging }) => (
        <div ref={setNodeRef} style={{ ...style, opacity: isDragging ? 0.3 : 1 }}
          className="arc-row arc-scene arc-grid arc-scene-draggable">
          <div className="arc-name-cell" style={{ paddingLeft: 104 }}>
            <span className="arc-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠣</span>
            <div className="arc-name-inner">
              <EditableCell className="arc-scene-title" value={scene.title || ''} placeholder="Scene title..."
                onChange={v => onSaveSceneArcFields(scene.id, { title: v })} />
              <EditableCell className="arc-scene-synopsis" value={(scene.notes ?? []).join('\n')} placeholder="Add synopsis..."
                onChange={v => onSaveSceneNotes(scene.id, v.trim() ? v.split('\n') : [])} multiline />
            </div>
          </div>
          <div className="arc-cell">
            <EditableCell value={scene.startingState || ''} placeholder="Beginning..."
              onChange={v => onSaveSceneArcFields(scene.id, { startingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={scene.endingState || ''} placeholder="Ending..."
              onChange={v => onSaveSceneArcFields(scene.id, { endingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={scene.transformation || ''} placeholder="What creates the dilemma..."
              onChange={v => onSaveSceneArcFields(scene.id, { transformation: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={scene.dilemma || ''} placeholder="Scene dilemma..."
              onChange={v => onSaveSceneArcFields(scene.id, { dilemma: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={scene.propellingAction || ''} placeholder="Propelling action..."
              onChange={v => onSaveSceneArcFields(scene.id, { propellingAction: v })} multiline />
          </div>
          <div className="arc-cell arc-pol-col">
            <PolarityCell value={scene.polarity || ''} onChange={v => onSaveSceneArcFields(scene.id, { polarity: v })} />
          </div>
          <div className="arc-cell arc-wc-col">
            {scene.wordCount ? <span className="arc-wc">{scene.wordCount.toLocaleString()}</span> : null}
          </div>
        </div>
      )}
    </SortableItem>
  );

  const renderSection = (pp: PlotPoint) => {
    const sectionScenes = scenes
      .filter(s => s.plotPointId === pp.id)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    const coll = isCollapsed(`sec-${pp.id}`);
    return (
      <div key={pp.id}>
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
            </div>
          </div>
          <div className="arc-cell">
            <EditableCell value={pp.startingState} placeholder="Entering state..."
              onChange={v => onSavePlotPointArcFields(pp.id, { startingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={pp.endingState} placeholder="Exiting state..."
              onChange={v => onSavePlotPointArcFields(pp.id, { endingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={pp.transformation} placeholder="What creates the dilemma..."
              onChange={v => onSavePlotPointArcFields(pp.id, { transformation: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={pp.dilemma || ''} placeholder="The section's dilemma..."
              onChange={v => onSavePlotPointArcFields(pp.id, { dilemma: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={pp.propellingAction || ''} placeholder="What propels this section..."
              onChange={v => onSavePlotPointArcFields(pp.id, { propellingAction: v })} multiline />
          </div>
          <div className="arc-cell arc-pol-col">
            <PolarityCell value={pp.polarity} onChange={v => onSavePlotPointArcFields(pp.id, { polarity: v })} />
          </div>
          <div className="arc-cell arc-wc-col">
            {fmtWc(sectionWc(pp.id)) ? <span className="arc-wc">{fmtWc(sectionWc(pp.id))}</span> : null}
          </div>
        </div>
        {!coll && (
          <SortableContext items={sectionScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {sectionScenes.map(scene => renderSceneRow(scene, pp.id))}
            {sectionScenes.length === 0 && <EmptySectionDropZone sectionId={pp.id} />}
          </SortableContext>
        )}
      </div>
    );
  };

  const renderAct = (act: Act) => {
    const actSections = plotPoints
      .filter(pp => pp.actId === act.id)
      .sort((a, b) => a.order - b.order);
    const coll = isCollapsed(`act-${act.id}`);
    return (
      <div key={act.id}>
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
          <div className="arc-cell">
            <EditableCell value={act.startingState} placeholder="Entering this act..."
              onChange={v => onSaveAct({ ...act, startingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={act.endingState} placeholder="Exiting this act..."
              onChange={v => onSaveAct({ ...act, endingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={act.transformation} placeholder="What creates the dilemma..."
              onChange={v => onSaveAct({ ...act, transformation: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={act.dilemma} placeholder="The act's dilemma..."
              onChange={v => onSaveAct({ ...act, dilemma: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={act.propellingAction || ''} placeholder="What propels this act..."
              onChange={v => onSaveAct({ ...act, propellingAction: v })} multiline />
          </div>
          <div className="arc-cell arc-pol-col">
            <PolarityCell value={act.polarity} onChange={v => onSaveAct({ ...act, polarity: v })} />
          </div>
          <div className="arc-cell arc-wc-col">
            {fmtWc(actWc(act.id)) ? <span className="arc-wc">{fmtWc(actWc(act.id))}</span> : null}
          </div>
        </div>
        {!coll && actSections.map(pp => renderSection(pp))}
      </div>
    );
  };

  return (
    <div className="arc-view">



      <div className="arc-scroll">
        <div className="arc-col-headers arc-grid">
          <div className="arc-col-h arc-col-h-freeze"></div>
          <div className="arc-col-h">Beginning</div>
          <div className="arc-col-h">Ending</div>
          <div className="arc-col-h">Turning point</div>
          <div className="arc-col-h">Dilemma</div>
          <div className="arc-col-h">Propelling Action</div>
          <div className="arc-col-h arc-col-center">Polarity shift</div>
          <div className="arc-col-h arc-col-center">Words</div>
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
          <div className="arc-cell">
            <EditableCell value={psych?.novelStartingState || ''} placeholder="Where does this character begin?"
              onChange={v => savePsych({ novelStartingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={psych?.novelEndingState || ''} placeholder="Where does this character end?"
              onChange={v => savePsych({ novelEndingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={psych?.novelTransformation || ''} placeholder="What creates the dilemma..."
              onChange={v => savePsych({ novelTransformation: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={psych?.novelDilemma || ''} placeholder="The central dilemma..."
              onChange={v => savePsych({ novelDilemma: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={psych?.novelPropellingAction || ''} placeholder="What propels the story..."
              onChange={v => savePsych({ novelPropellingAction: v })} multiline />
          </div>
          <div className="arc-cell arc-pol-col">
            <PolarityCell value={psych?.novelPolarity || ''} onChange={v => savePsych({ novelPolarity: v })} />
          </div>
          <div className="arc-cell arc-wc-col">
            {fmtWc(novelWc()) ? <span className="arc-wc">{fmtWc(novelWc())}</span> : null}
          </div>
        </div>

        {!isCollapsed('novel') && sortedActs.map(renderAct)}
      </div>

      {contextMenu && (
        <ArcSectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sectionId={contextMenu.sectionId}
          acts={sortedActs}
          onMoveToAct={(actId) => { onSavePlotPointArcFields(contextMenu.sectionId, { actId }); setContextMenu(null); }}
          onReturnToBullpen={() => { onSavePlotPointArcFields(contextMenu.sectionId, { actId: null }); setContextMenu(null); }}
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
    </div>
  );
}
