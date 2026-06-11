import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Act, PlotPoint, Scene } from '../../shared/types';
import { useResizableWidth } from '../utils/useResizableWidth';
import { cleanSceneTitle } from '../utils/sceneTitle';

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

function DraggableArcScene({ scene, onContextMenu, nested, onClick, active, sectionId }: {
  scene: Scene;
  onContextMenu: (e: React.MouseEvent) => void;
  nested?: boolean;
  onClick?: () => void;
  active?: boolean;
  sectionId?: string;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: scene.id });
  // Nested scenes (inside a section) double as reorder drop targets; the active
  // scene drops relative to them. Loose scenes have no section so stay drag-only.
  const { setNodeRef: setDropRef } = useDroppable({
    id: scene.id,
    data: { type: 'arc-scene', sectionId },
    disabled: !sectionId,
  });
  const setNodeRef = (el: HTMLElement | null) => { setDragRef(el); setDropRef(el); };
  return (
    <div
      ref={setNodeRef}
      className={`arc-bullpen-row${nested ? ' arc-bullpen-row-nested' : ''}${active ? ' active' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onContextMenu={onContextMenu}
    >
      <span className="arc-bullpen-drag" {...attributes} {...listeners}>⠿</span>
      <span className="arc-bullpen-label arc-bullpen-clickable" onClick={onClick}>{cleanSceneTitle(scene.title) || 'Untitled scene'}</span>
    </div>
  );
}

function BullpenSectionGroup({ section, secScenes, expanded, onToggle, onSectionContextMenu, onSceneContextMenu, previewSceneId, onPreviewScene }: {
  section: PlotPoint;
  secScenes: Scene[];
  expanded: boolean;
  onToggle: () => void;
  onSectionContextMenu: (e: React.MouseEvent) => void;
  onSceneContextMenu: (e: React.MouseEvent, sceneId: string) => void;
  previewSceneId?: string | null;
  onPreviewScene?: (sceneId: string | null) => void;
}) {
  // Drop target so a scene can be dragged INTO this section (joins at the end).
  const { setNodeRef, isOver } = useDroppable({ id: `bullpen-section:${section.id}`, data: { sectionId: section.id } });
  return (
    <div ref={setNodeRef} className={`arc-bullpen-section-group${isOver ? ' drag-over' : ''}`}>
      <div className="arc-bullpen-row arc-bullpen-section" onContextMenu={onSectionContextMenu}>
        <span className="arc-bullpen-sec-toggle" onClick={() => secScenes.length && onToggle()}>
          {secScenes.length ? (expanded ? '▾' : '▸') : ''}
        </span>
        <span className="arc-bullpen-label">{section.title || 'Untitled section'}</span>
        {secScenes.length > 0 && <span className="arc-bullpen-count">{secScenes.length}</span>}
      </div>
      {expanded && secScenes.map(scene => (
        <DraggableArcScene
          key={scene.id}
          scene={scene}
          sectionId={section.id}
          onContextMenu={e => onSceneContextMenu(e, scene.id)}
          nested
          active={previewSceneId === scene.id}
          onClick={() => onPreviewScene?.(previewSceneId === scene.id ? null : scene.id)}
        />
      ))}
    </div>
  );
}

interface ArcBullpenPanelProps {
  acts: Act[];
  sections: PlotPoint[];
  bullpenSections: PlotPoint[];
  bullpenScenes: Scene[];
  scenes: Scene[]; // all scenes for the character (used to nest set-aside sections' scenes)
  previewSceneId?: string | null;
  onPreviewScene?: (sceneId: string | null) => void;
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
  scenes,
  previewSceneId,
  onPreviewScene,
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('bullpen-collapsed') === '1');
  const setPanelCollapsed = (v: boolean) => { setCollapsed(v); localStorage.setItem('bullpen-collapsed', v ? '1' : '0'); };
  const { width, onPointerDown } = useResizableWidth('bullpen-width', 220, { min: 180, max: 640 });
  const newMenuRef = useRef<HTMLDivElement>(null);
  const toggleSection = (id: string) => setCollapsedSections(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

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

  if (collapsed) {
    return (
      <div ref={setNodeRef} className={`arc-bullpen-panel collapsed ${isOver ? 'drag-over' : ''}`}>
        <button className="bullpen-expand-btn" onClick={() => setPanelCollapsed(false)} title="Show bullpen">
          <span className="bullpen-expand-chev">«</span>
          <span className="bullpen-expand-label">Bullpen</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={`arc-bullpen-panel ${isOver ? 'drag-over' : ''}`} style={{ width, minWidth: width }}>
      <div className="bullpen-resize-handle" onPointerDown={onPointerDown} title="Drag to resize" />
      <div className="arc-bullpen-header">
        <span className="arc-bullpen-title">Bullpen</span>
        <button className="bullpen-collapse-btn" onClick={() => setPanelCollapsed(true)} title="Hide bullpen">»</button>
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
        {bullpenSections.map(section => {
          const secScenes = scenes
            .filter(s => s.plotPointId === section.id)
            .sort((a, b) => a.sceneNumber - b.sceneNumber);
          return (
            <BullpenSectionGroup
              key={section.id}
              section={section}
              secScenes={secScenes}
              expanded={!collapsedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              onSectionContextMenu={e => handleContextMenu(e, 'section', section.id)}
              onSceneContextMenu={(e, sceneId) => handleContextMenu(e, 'scene', sceneId)}
              previewSceneId={previewSceneId}
              onPreviewScene={onPreviewScene}
            />
          );
        })}
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
            active={previewSceneId === scene.id}
            onClick={() => onPreviewScene?.(previewSceneId === scene.id ? null : scene.id)}
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
          sections={sections.filter(s => !s.inBullpen)}
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
