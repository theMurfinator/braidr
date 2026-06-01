import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../dnd';
import { Character, Act, PlotPoint, Scene, CharacterPsychology } from '../../shared/types';
import CharacterHubPanel from './CharacterHubPanel';

const POLARITY_COLORS: Record<string, { bg: string; color: string }> = {
  '+/-':   { bg: '#fee2e2', color: '#b91c1c' },
  '-/+':   { bg: '#ede9fe', color: '#6d28d9' },
  '-/-':   { bg: '#fecaca', color: '#7f1d1d' },
  '+/+':   { bg: '#d1fae5', color: '#065f46' },
  '+/-/+': { bg: '#fef9c3', color: '#854d0e' },
};
const POLARITY_OPTIONS = ['+/-', '-/+', '-/-', '+/+', '+/-/+'];

function randomId() { return Math.random().toString(36).slice(2, 10); }

function emptyPsych(characterId: string): CharacterPsychology {
  return {
    characterId, novelStartingState: '', novelEndingState: '', novelPolarity: '', novelTransformation: '',
    novelDilemma: '', novelPropellingAction: '',
    wound: '', lie: '', deepestFear: '', limitingBelief: '', thorn: '', copingTool: '',
    whisperOfGrace: '', surfaceWant: '', soulsLonging: '', bitterNeed: '', capitalTTruth: '',
    arcSummary: '', theme: '', antiTheme: '', finalReaderExperience: '',
  };
}

function EditableCell({ value, placeholder, onChange, multiline = false }: {
  value: string; placeholder: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    const commonProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setDraft(e.target.value),
      onBlur: () => { setEditing(false); if (draft !== value) onChange(draft); },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        if (e.key === 'Enter' && !e.shiftKey && !multiline) { setEditing(false); if (draft !== value) onChange(draft); }
      },
      autoFocus: true,
      className: 'arc-editable-input',
    };
    return multiline
      ? <textarea {...commonProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>} rows={3} style={{ width: '100%' }} />
      : <input {...commonProps as React.InputHTMLAttributes<HTMLInputElement>} style={{ width: '100%' }} />;
  }

  return (
    <span
      className="arc-editable-display"
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
  onSaveSceneArcFields: (sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string }) => void;
  onDeleteSection: (sectionId: string) => void;
  onLoadPsychology: (characterId: string) => Promise<CharacterPsychology | null>;
  onSavePsychology: (psychology: CharacterPsychology) => void;
  arcActiveId: string | null;
  onCreateSection: (actId: string | null) => void;
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
  onDeleteAct: _onDeleteAct,
  onSavePlotPointArcFields,
  onSaveSceneArcFields,
  onDeleteSection,
  onLoadPsychology,
  onSavePsychology,
  arcActiveId: _arcActiveId,
  onCreateSection,
}: ArcViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showHub, setShowHub] = useState(false);
  const hubLoadedRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sectionId: string } | null>(null);

  // Reset hub cache when character changes
  useEffect(() => {
    hubLoadedRef.current = false;
    setShowHub(false);
  }, [selectedCharacterId]);

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

  const openHub = async () => {
    if (!hubLoadedRef.current) {
      await onLoadPsychology(selectedCharacterId);
      hubLoadedRef.current = true;
    }
    setShowHub(true);
  };

  const psych = psychology;
  const savePsych = (update: Partial<CharacterPsychology>) => {
    onSavePsychology({ ...(psych || emptyPsych(selectedCharacterId)), ...update });
  };

  const sortedActs = [...acts].sort((a, b) => a.order - b.order);

  const stripContent = (s: string) =>
    s.replace(/<[^>]*>/g, '')
     .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
     .replace(/#[a-zA-Z0-9_]+/g, '')
     .trim();

  const sceneTitle = (scene: Scene) =>
    scene.title?.trim() || stripContent(scene.content).slice(0, 80) || 'Untitled';

  const sceneSynopsis = (scene: Scene) =>
    stripContent(scene.content).slice(0, 150);

  const renderSceneRow = (scene: Scene, sectionId: string) => (
    <SortableItem key={scene.id} id={scene.id} data={{ type: 'arc-scene', sectionId }}>
      {({ setNodeRef, style, listeners, attributes, isDragging }) => (
        <div ref={setNodeRef} style={{ ...style, opacity: isDragging ? 0.3 : 1 }}
          className="arc-row arc-scene arc-grid arc-scene-draggable">
          <div className="arc-name-cell" style={{ paddingLeft: 52 }}>
            <span className="arc-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠣</span>
            <div className="arc-name-inner">
              <span className="arc-name-text">{sceneTitle(scene)}</span>
            </div>
          </div>
          <div className="arc-cell"><span className="arc-cell-text">{sceneSynopsis(scene)}</span></div>
          <div className="arc-cell arc-cell-dim"></div>
          <div className="arc-cell arc-cell-dim"></div>
          <div className="arc-cell">
            <EditableCell value={scene.transformation || ''} placeholder="Turning point..."
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
          onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, sectionId: pp.id }); }}
        >
          <div className="arc-name-cell" style={{ paddingLeft: 36 }}>
            <span className="arc-toggle" onClick={() => toggleCollapsed(`sec-${pp.id}`)}>
              {coll ? '▶' : '▼'}
            </span>
            <div className="arc-name-inner">
              <EditableCell value={pp.title} placeholder="Section name..."
                onChange={v => onSavePlotPointArcFields(pp.id, { title: v })} />
            </div>
          </div>
          <div className="arc-cell">
            <EditableCell value={pp.description || ''} placeholder="What happens..."
              onChange={v => onSavePlotPointArcFields(pp.id, { description: v })} multiline />
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
            <EditableCell value={pp.transformation} placeholder="What shifts..."
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
        <div className="arc-row arc-act arc-grid">
          <div className="arc-name-cell" style={{ paddingLeft: 16 }}>
            <span className="arc-toggle" onClick={() => toggleCollapsed(`act-${act.id}`)}>
              {coll ? '▶' : '▼'}
            </span>
            <div className="arc-name-inner">
              <EditableCell value={act.name} placeholder="Act name..."
                onChange={v => onSaveAct({ ...act, name: v })} />
            </div>
          </div>
          <div className="arc-cell arc-cell-dim"></div>
          <div className="arc-cell">
            <EditableCell value={act.startingState} placeholder="Entering this act..."
              onChange={v => onSaveAct({ ...act, startingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={act.endingState} placeholder="Exiting this act..."
              onChange={v => onSaveAct({ ...act, endingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={act.transformation} placeholder="What this act accomplishes..."
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
        </div>
        {!coll && actSections.map(pp => renderSection(pp))}
        {!coll && (
          <div className="arc-row arc-ghost arc-grid" style={{ cursor: 'pointer' }} onClick={() => onCreateSection(null)}>
            <div className="arc-name-cell" style={{ paddingLeft: 36 }}>
              <span className="arc-toggle" style={{ visibility: 'hidden' }}>+</span>
              <span className="arc-ghost-label">+ Add section...</span>
            </div>
            <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
            <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
            <div className="arc-cell arc-pol-col"></div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="arc-view">

      {/* Column headers */}
      <div className="arc-col-headers arc-grid">
        <div className="arc-col-h"></div>
        <div className="arc-col-h">Plot synopsis</div>
        <div className="arc-col-h">Beginning</div>
        <div className="arc-col-h">Ending</div>
        <div className="arc-col-h">Turning point</div>
        <div className="arc-col-h">Dilemma</div>
        <div className="arc-col-h">Propelling Action</div>
        <div className="arc-col-h arc-col-center">Polarity shift</div>
      </div>

      {/* Toolbar */}
      <div className="arc-toolbar">
        <button className="arc-toolbar-btn" onClick={() => onSaveAct({
          id: randomId(), characterId: selectedCharacterId, name: '',
          startingState: '', endingState: '', polarity: '', transformation: '',
          dilemma: '', propellingAction: '',
          order: acts.length,
        })}>+ Act</button>
        <button className="arc-toolbar-btn" onClick={() => onCreateSection(null)}>+ Section</button>
      </div>

      <div className="arc-scroll">
        <div style={{ height: 24 }} />

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
          <div className="arc-cell arc-cell-dim"></div>
          <div className="arc-cell">
            <EditableCell value={psych?.novelStartingState || ''} placeholder="Where does this character begin?"
              onChange={v => savePsych({ novelStartingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={psych?.novelEndingState || ''} placeholder="Where does this character end?"
              onChange={v => savePsych({ novelEndingState: v })} multiline />
          </div>
          <div className="arc-cell">
            <EditableCell value={psych?.novelTransformation || ''} placeholder="The full arc in one sentence..."
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
        </div>

        {!isCollapsed('novel') && (
          <>
            {sortedActs.map(renderAct)}

            {/* Add act */}
            <div
              className="arc-row arc-ghost arc-grid"
              style={{ cursor: 'pointer' }}
              onClick={() => onSaveAct({
                id: randomId(), characterId: selectedCharacterId, name: '',
                startingState: '', endingState: '', polarity: '', transformation: '', dilemma: '', propellingAction: '',
                order: acts.length,
              })}
            >
              <div className="arc-name-cell" style={{ paddingLeft: 16 }}>
                <span className="arc-toggle" style={{ visibility: 'hidden' }}>+</span>
                <span className="arc-ghost-label">+ Add act...</span>
              </div>
              <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
              <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
              <div className="arc-cell arc-pol-col"></div>
            </div>
          </>
        )}
      </div>

      {/* Character Hub button */}
      <button className="arc-hub-btn" onClick={openHub}>
        Character Hub
      </button>

      {/* Character Hub panel */}
      {showHub && (
        <CharacterHubPanel
          characterName={character?.name || ''}
          characterColor={charColor}
          psychology={psych}
          selectedCharacterId={selectedCharacterId}
          onSave={(p: CharacterPsychology) => onSavePsychology(p)}
          onClose={() => setShowHub(false)}
        />
      )}

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
    </div>
  );
}
