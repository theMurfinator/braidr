import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Scene, PlotPoint } from '../../shared/types';
import { useResizableWidth } from '../utils/useResizableWidth';
import OutlineSceneRow from './OutlineSceneRow';
import SectionPickerDropdown from './SectionPickerDropdown';

interface DraggableBullpenRowProps {
  scene: Scene;
  characterName: string;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  children: React.ReactNode;
}

function DraggableBullpenRow({ scene, characterName, onSceneChange, children }: DraggableBullpenRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: scene.id });
  return (
    <div ref={setNodeRef} className="bullpen-scene-wrapper" style={{ opacity: isDragging ? 0.3 : 1 }}>
      <span className="pov-drag-handle bullpen-drag-handle" {...attributes} {...listeners}>⋮⋮</span>
      <OutlineSceneRow
        scene={scene}
        characterName={characterName}
        synopsisVisible={false}
        onSceneChange={onSceneChange}
        expandMode={false}
      />
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
  bullpenSections?: PlotPoint[];   // sections set aside (inBullpen), shown with their scenes nested
  sectionScenes?: Scene[];         // scenes belonging to those set-aside sections
}

function BullpenPanel({
  scenes,
  plotPoints,
  getCharacterName,
  onReturnScene,
  onSceneChange,
  previousPlotPointIds,
  onAddScene,
  bullpenSections = [],
  sectionScenes = [],
}: BullpenPanelProps) {
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('bullpen-collapsed') === '1');
  const setPanelCollapsed = (v: boolean) => { setCollapsed(v); localStorage.setItem('bullpen-collapsed', v ? '1' : '0'); };
  const { width, onPointerDown } = useResizableWidth('bullpen-width', 280, { min: 180, max: 640 });
  const { setNodeRef, isOver } = useDroppable({ id: 'bullpen' });
  const toggleSection = (id: string) => setCollapsedSections(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

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
    <div
      ref={setNodeRef}
      className={`bullpen-panel ${isOver ? 'drag-over' : ''}`}
      style={{ width, minWidth: width }}
    >
      <div className="bullpen-resize-handle" onPointerDown={onPointerDown} title="Drag to resize" />
      <div className="bullpen-header">
        <span className="bullpen-label">Bullpen</span>
        <span className="bullpen-count">{scenes.length}</span>
        <button className="bullpen-collapse-btn" onClick={() => setPanelCollapsed(true)} title="Hide bullpen">»</button>
      </div>

      {bullpenSections.length > 0 && (
        <div className="bullpen-sections-group">
          {bullpenSections.map(sec => {
            const secScenes = sectionScenes.filter(s => s.plotPointId === sec.id);
            const expanded = !collapsedSections.has(sec.id);
            return (
              <div key={sec.id} className="bullpen-section-group">
                <div className="bullpen-section-header" onClick={() => secScenes.length && toggleSection(sec.id)}>
                  <span className="bullpen-sec-toggle">{secScenes.length ? (expanded ? '▾' : '▸') : ''}</span>
                  <span className="bullpen-section-title">{sec.title || 'Untitled section'}</span>
                  {secScenes.length > 0 && <span className="bullpen-count">{secScenes.length}</span>}
                </div>
                {expanded && secScenes.map(s => (
                  <div key={s.id} className="bullpen-section-scene">{s.title || 'Untitled scene'}</div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {scenes.length === 0 && bullpenSections.length === 0 && (
        <div className="bullpen-empty">
          Scenes you set aside or create here will appear in this list.
        </div>
      )}
      {scenes.map((scene) => (
        <DraggableBullpenRow
          key={scene.id}
          scene={scene}
          characterName={getCharacterName(scene.characterId)}
          onSceneChange={onSceneChange}
        >
          <span className="bullpen-scene-actions">
            <button
              className="outline-scene-action-btn bullpen-return-btn"
              onClick={() => setPickerSceneId(pickerSceneId === scene.id ? null : scene.id)}
            >
              Return
            </button>
            {pickerSceneId === scene.id && (
              <SectionPickerDropdown
                plotPoints={plotPoints}
                previousPlotPointId={previousPlotPointIds?.[scene.id]}
                onSelect={(plotPointId) => {
                  onReturnScene(scene.id, plotPointId);
                  setPickerSceneId(null);
                }}
                onClose={() => setPickerSceneId(null)}
              />
            )}
          </span>
        </DraggableBullpenRow>
      ))}
      {onAddScene && (
        <button className="bullpen-add-scene-btn" onClick={onAddScene}>
          + Add Scene
        </button>
      )}
    </div>
  );
}

export default BullpenPanel;
