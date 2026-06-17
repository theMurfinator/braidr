import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Scene, PlotPoint } from '../../shared/types';
import { useResizableWidth } from '../utils/useResizableWidth';
import { cleanSceneTitle } from '../utils/sceneTitle';
import SectionPickerDropdown from './SectionPickerDropdown';

// Right-click menu mirroring ArcBullpenPanel's: Assign to Section ▶ / Delete.
function BullpenContextMenu({ x, y, sections, onAssignToSection, onDelete, onClose }: {
  x: number; y: number;
  sections: PlotPoint[];
  onAssignToSection: (sectionId: string) => void;
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
  return (
    <div ref={ref} className="arc-context-menu" style={{ left: x, top: y }}>
      <div className="arc-context-item" onMouseEnter={() => setShowSubmenu(true)} onMouseLeave={() => setShowSubmenu(false)}>
        Assign to Section ▶
        {showSubmenu && (
          <div className="arc-context-submenu">
            {sections.length === 0 && (
              <div className="arc-context-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>No sections yet</div>
            )}
            {sections.map(s => (
              <div key={s.id} className="arc-context-item" onClick={() => onAssignToSection(s.id)}>
                {s.title || 'Unnamed section'}
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

function DraggableBullpenScene({ scene, prevSectionTitle, onContextMenu, children }: {
  scene: Scene;
  prevSectionTitle?: string | null;
  onContextMenu: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
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
      <span className="arc-bullpen-label">{cleanSceneTitle(scene.title) || 'Untitled scene'}</span>
      {prevSectionTitle && <span className="bullpen-prev-tag" title="Previous location">was: {prevSectionTitle}</span>}
      {children}
    </div>
  );
}

interface BullpenPanelProps {
  scenes: Scene[];
  plotPoints: PlotPoint[];
  getCharacterName: (characterId: string) => string;
  onReturnScene: (sceneId: string, targetPlotPointId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  previousPlotPointIds?: Record<string, string>;
  onAddScene?: () => void;
  onDeleteScene?: (sceneId: string) => void;
  bullpenSections?: PlotPoint[];
  sectionScenes?: Scene[];
}

function BullpenPanel({
  scenes,
  plotPoints,
  onReturnScene,
  previousPlotPointIds,
  onAddScene,
  onDeleteScene,
  bullpenSections = [],
  sectionScenes = [],
}: BullpenPanelProps) {
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('bullpen-collapsed') === '1');
  const setPanelCollapsed = (v: boolean) => { setCollapsed(v); localStorage.setItem('bullpen-collapsed', v ? '1' : '0'); };
  const { width, onPointerDown } = useResizableWidth('bullpen-width', 280, { min: 180, max: 640 });
  const { setNodeRef, isOver } = useDroppable({ id: 'bullpen' });
  const toggleSection = (id: string) => setCollapsedSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const sectionTitle = (id?: string): string | null => {
    if (!id) return null;
    const pp = plotPoints.find(p => p.id === id);
    return pp ? (pp.title || 'Untitled section') : null;
  };

  if (collapsed) {
    return (
      <div ref={setNodeRef} className={`bullpen-panel collapsed ${isOver ? 'drag-over' : ''}`}>
        <button className="bullpen-expand-btn" onClick={() => setPanelCollapsed(false)} title="Show bullpen">
          <span className="bullpen-expand-chev">«</span>
          <span className="bullpen-expand-label">Bullpen</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={`bullpen-panel ${isOver ? 'drag-over' : ''}`} style={{ width, minWidth: width }}>
      <div className="bullpen-resize-handle" onPointerDown={onPointerDown} title="Drag to resize" />
      <div className="arc-bullpen-header">
        <span className="arc-bullpen-title">Bullpen</span>
        <button className="bullpen-collapse-btn" onClick={() => setPanelCollapsed(true)} title="Hide bullpen">»</button>
      </div>

      {bullpenSections.length > 0 && (
        <div className="arc-bullpen-group">
          <div className="arc-bullpen-group-label">Sections<span className="arc-bullpen-count">{bullpenSections.length}</span></div>
          {bullpenSections.map(sec => {
            const secScenes = sectionScenes.filter(s => s.plotPointId === sec.id);
            const expanded = !collapsedSections.has(sec.id);
            return (
              <div key={sec.id} className="arc-bullpen-section-group">
                <div className="arc-bullpen-row arc-bullpen-section" onClick={() => secScenes.length && toggleSection(sec.id)}>
                  <span className="arc-bullpen-sec-toggle">{secScenes.length ? (expanded ? '▾' : '▸') : ''}</span>
                  <span className="arc-bullpen-label">{sec.title || 'Untitled section'}</span>
                  {secScenes.length > 0 && <span className="arc-bullpen-count">{secScenes.length}</span>}
                </div>
                {expanded && secScenes.map(s => (
                  <div key={s.id} className="arc-bullpen-row arc-bullpen-row-nested">
                    <span className="arc-bullpen-label">{cleanSceneTitle(s.title) || 'Untitled scene'}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="arc-bullpen-group">
        <div className="arc-bullpen-group-label">Scenes<span className="arc-bullpen-count">{scenes.length}</span></div>
        {scenes.length === 0 && bullpenSections.length === 0 && (
          <div className="bullpen-empty">Scenes you set aside or create here will appear in this list.</div>
        )}
        {scenes.map(scene => (
          <DraggableBullpenScene
            key={scene.id}
            scene={scene}
            prevSectionTitle={sectionTitle(previousPlotPointIds?.[scene.id])}
            onContextMenu={e => { e.preventDefault(); setPickerSceneId(null); setContextMenu({ x: e.clientX, y: e.clientY, sceneId: scene.id }); }}
          >
            <span className="bullpen-scene-actions">
              <button
                className="outline-scene-action-btn bullpen-return-btn"
                onClick={() => { setContextMenu(null); setPickerSceneId(pickerSceneId === scene.id ? null : scene.id); }}
              >
                Return
              </button>
              {pickerSceneId === scene.id && (
                <SectionPickerDropdown
                  plotPoints={plotPoints}
                  previousPlotPointId={previousPlotPointIds?.[scene.id]}
                  onSelect={(plotPointId) => { onReturnScene(scene.id, plotPointId); setPickerSceneId(null); }}
                  onClose={() => setPickerSceneId(null)}
                />
              )}
            </span>
          </DraggableBullpenScene>
        ))}
      </div>

      {onAddScene && (
        <button className="bullpen-add-scene-btn" onClick={onAddScene}>+ Add Scene</button>
      )}

      {contextMenu && (
        <BullpenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sections={plotPoints.filter(p => !p.inBullpen)}
          onAssignToSection={(sectionId) => { onReturnScene(contextMenu.sceneId, sectionId); setContextMenu(null); }}
          onDelete={() => { onDeleteScene?.(contextMenu.sceneId); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default BullpenPanel;
