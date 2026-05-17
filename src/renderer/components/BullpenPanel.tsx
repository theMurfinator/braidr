import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Scene, PlotPoint } from '../../shared/types';
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
}

function BullpenPanel({
  scenes,
  plotPoints,
  getCharacterName,
  onReturnScene,
  onSceneChange,
  previousPlotPointIds,
  onAddScene,
}: BullpenPanelProps) {
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: 'bullpen' });

  return (
    <div
      ref={setNodeRef}
      className={`bullpen-panel ${isOver ? 'drag-over' : ''}`}
    >
      <div className="bullpen-header">
        <span className="bullpen-label">Bullpen</span>
        <span className="bullpen-count">{scenes.length}</span>
      </div>

      {scenes.length === 0 && (
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
