import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Act, PlotPoint, Scene } from '../../shared/types';

function ArcBullpenContextMenu({ x, y, type, acts, sections, onAssignToAct, onAssignToSection, onDelete, onClose }: {
  x: number; y: number;
  type: 'section' | 'scene';
  acts: Act[];
  sections: PlotPoint[];
  onAssignToAct?: (actId: string) => void;
  onAssignToSection?: (sectionId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [showSubmenu, setShowSubmenu] = useState(false);
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

  const items = type === 'section' ? acts : sections;
  const label = type === 'section' ? 'Assign to Act ▶' : 'Assign to Section ▶';
  const onAssign = type === 'section' ? onAssignToAct! : onAssignToSection!;
  const itemLabel = (item: Act | PlotPoint) => type === 'section'
    ? (item as Act).name || 'Unnamed act'
    : (item as PlotPoint).title || 'Unnamed section';

  return (
    <div ref={ref} className="arc-context-menu" style={{ left: x, top: y }}>
      <div className="arc-context-item" onMouseEnter={() => setShowSubmenu(true)} onMouseLeave={() => setShowSubmenu(false)}>
        {label}
        {showSubmenu && (
          <div className="arc-context-submenu">
            {items.length === 0 && (
              <div className="arc-context-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
                No {type === 'section' ? 'acts' : 'sections'} yet
              </div>
            )}
            {items.map(item => (
              <div key={item.id} className="arc-context-item" onClick={() => onAssign(item.id)}>
                {itemLabel(item)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="arc-context-divider" />
      <div className="arc-context-item arc-context-danger" onClick={onDelete}>Delete</div>
    </div>
  );
}

function DraggableArcScene({ scene, onContextMenu }: {
  scene: Scene;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: scene.id });
  return (
    <div
      ref={setNodeRef}
      className="arc-bullpen-row"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onContextMenu={onContextMenu}
    >
      <span className="arc-bullpen-drag" {...attributes} {...listeners}>⠿</span>
      <span className="arc-bullpen-label">{scene.title || 'Untitled scene'}</span>
    </div>
  );
}

interface ArcBullpenPanelProps {
  acts: Act[];
  sections: PlotPoint[];
  bullpenSections: PlotPoint[];
  bullpenScenes: Scene[];
  onAssignSectionToAct: (sectionId: string, actId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onAssignSceneToSection: (sceneId: string, sectionId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onAddSection: () => void;
  onAddScene: () => void;
  onOpenCharacterHub: () => void;
}

export default function ArcBullpenPanel({
  acts,
  sections,
  bullpenSections,
  bullpenScenes,
  onAssignSectionToAct,
  onDeleteSection,
  onAssignSceneToSection,
  onDeleteScene,
  onAddSection,
  onAddScene,
  onOpenCharacterHub,
}: ArcBullpenPanelProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; type: 'section' | 'scene'; id: string;
  } | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({ id: 'bullpen' });

  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setShowNewMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNewMenu]);

  const handleContextMenu = (e: React.MouseEvent, type: 'section' | 'scene', id: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  return (
    <div ref={setNodeRef} className={`arc-bullpen-panel ${isOver ? 'drag-over' : ''}`}>
      <div className="arc-bullpen-header">
        <span className="arc-bullpen-title">Bullpen</span>
        <div className="arc-bullpen-new-wrap" ref={newMenuRef}>
          <button className="arc-bullpen-new-btn" onClick={() => setShowNewMenu(o => !o)}>+ New</button>
          {showNewMenu && (
            <div className="arc-bullpen-new-menu">
              <div className="arc-bullpen-new-item" onClick={() => { onAddSection(); setShowNewMenu(false); }}>Section</div>
              <div className="arc-bullpen-new-item" onClick={() => { onAddScene(); setShowNewMenu(false); }}>Scene</div>
            </div>
          )}
        </div>
      </div>

      <div className="arc-bullpen-group">
        <div className="arc-bullpen-group-label">
          Sections
          <span className="arc-bullpen-count">{bullpenSections.length}</span>
        </div>
        {bullpenSections.map(section => (
          <div
            key={section.id}
            className="arc-bullpen-row arc-bullpen-section"
            onContextMenu={e => handleContextMenu(e, 'section', section.id)}
          >
            <span className="arc-bullpen-label">{section.title || 'Untitled section'}</span>
          </div>
        ))}
      </div>

      <div className="arc-bullpen-group">
        <div className="arc-bullpen-group-label">
          Scenes
          <span className="arc-bullpen-count">{bullpenScenes.length}</span>
        </div>
        {bullpenScenes.map(scene => (
          <DraggableArcScene
            key={scene.id}
            scene={scene}
            onContextMenu={e => handleContextMenu(e, 'scene', scene.id)}
          />
        ))}
      </div>

      <div className="arc-bullpen-footer">
        <button className="arc-bullpen-hub-btn" onClick={onOpenCharacterHub}>Character Hub</button>
      </div>

      {contextMenu && (
        <ArcBullpenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          acts={acts}
          sections={sections.filter(s => s.actId !== null)}
          onAssignToAct={actId => { onAssignSectionToAct(contextMenu.id, actId); setContextMenu(null); }}
          onAssignToSection={sectionId => { onAssignSceneToSection(contextMenu.id, sectionId); setContextMenu(null); }}
          onDelete={() => {
            if (contextMenu.type === 'section') onDeleteSection(contextMenu.id);
            else onDeleteScene(contextMenu.id);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
