import { useState } from 'react';
import { Scene, PlotPoint } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';
import SectionPickerDropdown from './SectionPickerDropdown';

interface BullpenPanelProps {
  scenes: Scene[];
  plotPoints: PlotPoint[];
  getCharacterName: (characterId: string) => string;
  onReturnScene: (sceneId: string, targetPlotPointId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onSceneDrop: (sceneId: string) => void;
  draggedScene: Scene | null;
  onDragStart: (scene: Scene) => void;
  onDragEnd: () => void;
  previousPlotPointIds?: Record<string, string>;
  onAddScene?: () => void;
}

function BullpenPanel({
  scenes,
  plotPoints,
  getCharacterName,
  onReturnScene,
  onSceneChange,
  onSceneDrop,
  draggedScene,
  onDragStart,
  onDragEnd,
  previousPlotPointIds,
  onAddScene,
}: BullpenPanelProps) {
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHover(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDropHover(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    if (draggedScene && draggedScene.plotPointId !== null) {
      onSceneDrop(draggedScene.id);
    }
  };

  return (
    <div
      className={`bullpen-panel ${dropHover ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        <div key={scene.id} className="bullpen-scene-wrapper">
          <OutlineSceneRow
            scene={scene}
            characterName={getCharacterName(scene.characterId)}
            synopsisVisible={false}
            onSceneChange={onSceneChange}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            expandMode={false}
          />
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
        </div>
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
