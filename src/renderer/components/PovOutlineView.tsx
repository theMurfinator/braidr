import { useRef } from 'react';
import { PlotPoint, Scene } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';

interface PovOutlineViewProps {
  sections: PlotPoint[];
  scenes: Scene[];
  bullpenScenes: Scene[];
  characterColor: string;
  synopsisModes: Record<string, 'inline' | 'expand'>;
  hideHeaders: boolean;
  onSceneReorder: (sceneId: string, targetSectionId: string, targetSceneNumber: number) => void;
  onSceneToBullpen: (sceneId: string) => void;
  onBullpenToSection: (sceneId: string, targetSectionId: string) => void;
  onSetAside: (sceneId: string) => void;
  onSectionMoveUp: (sectionId: string) => void;
  onSectionMoveDown: (sectionId: string) => void;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onOpenInEditor?: (sceneId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
  getCharacterName?: (characterId: string) => string;
}

export default function PovOutlineView({
  sections,
  scenes,
  bullpenScenes,
  synopsisModes,
  hideHeaders,
  onSetAside,
  onSectionMoveUp,
  onSectionMoveDown,
  onToggleSynopsisMode,
  onSceneChange,
  onOpenInEditor,
  onDeleteSection,
  getCharacterName,
}: PovOutlineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const scenesBySection = new Map<string, Scene[]>();
  for (const scene of scenes) {
    if (!scene.plotPointId) continue;
    const list = scenesBySection.get(scene.plotPointId) ?? [];
    list.push(scene);
    scenesBySection.set(scene.plotPointId, list);
  }
  for (const list of scenesBySection.values()) {
    list.sort((a, b) => a.sceneNumber - b.sceneNumber);
  }

  return (
    <div className="pov-outline-view" ref={scrollRef}>
      <div className="pov-outline-main">
        {sortedSections.map((section, idx) => {
          const sectionScenes = scenesBySection.get(section.id) ?? [];
          const isFirst = idx === 0;
          const isLast = idx === sortedSections.length - 1;
          return (
            <div key={section.id} className="pov-outline-section" data-section-id={section.id}>
              {!hideHeaders && (
                <div className="pov-outline-section-header">
                  <button
                    className={`section-synopsis-chevron ${synopsisModes[section.id] === 'expand' ? 'collapsed' : ''}`}
                    onClick={() => onToggleSynopsisMode(section.id)}
                    title={synopsisModes[section.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                  >
                    {'▾'}
                  </button>
                  <div className="section-reorder-buttons">
                    <button className="section-move-btn" onClick={() => onSectionMoveUp(section.id)} disabled={isFirst} title="Move section up">{'▲'}</button>
                    <button className="section-move-btn" onClick={() => onSectionMoveDown(section.id)} disabled={isLast} title="Move section down">{'▼'}</button>
                  </div>
                  <span className="plot-point-title">{section.title || 'New Section'}</span>
                  <span className="plot-point-count">({sectionScenes.length}/{section.expectedSceneCount ?? '?'})</span>
                  {onDeleteSection && (
                    <button className="section-delete-btn" onClick={() => onDeleteSection(section.id)} title="Delete section">{'×'}</button>
                  )}
                </div>
              )}
              {sectionScenes.map(scene => (
                <OutlineSceneRow
                  key={scene.id}
                  scene={scene}
                  displayNumber={scene.sceneNumber}
                  characterName={getCharacterName?.(scene.characterId)}
                  synopsisVisible={synopsisModes[section.id] !== 'expand'}
                  onSceneChange={onSceneChange}
                  onSetAside={onSetAside}
                  onOpenInEditor={onOpenInEditor}
                  expandMode={synopsisModes[section.id] === 'expand'}
                />
              ))}
            </div>
          );
        })}
      </div>

      {bullpenScenes.length > 0 && (
        <div className="pov-outline-bullpen" data-bullpen="true">
          <div className="bullpen-header">
            <h3>Bullpen</h3>
            <span className="bullpen-count">{bullpenScenes.length}</span>
          </div>
          <div className="bullpen-scenes">
            {bullpenScenes.map(scene => (
              <div key={scene.id} className="bullpen-scene" data-scene-id={scene.id}>
                <span className="bullpen-scene-number">{scene.sceneNumber}.</span>
                <span className="bullpen-scene-title">{scene.title || scene.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
