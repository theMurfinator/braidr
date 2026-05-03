import { useRef, useMemo } from 'react';
import { PlotPoint, Scene } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';
import {
  SortableArea,
  SortableList,
  DragPreviewCard,
  useAutoScrollContainer,
} from '../dnd';

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

function ScrollAutoBinder({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  useAutoScrollContainer(scrollRef);
  return null;
}

export default function PovOutlineView(props: PovOutlineViewProps) {
  const {
    sections,
    scenes,
    bullpenScenes,
    characterColor,
    synopsisModes,
    hideHeaders,
    onSceneReorder,
    onSetAside,
    onSectionMoveUp,
    onSectionMoveDown,
    onToggleSynopsisMode,
    onSceneChange,
    onOpenInEditor,
    onDeleteSection,
    getCharacterName,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections]
  );

  const scenesBySection = useMemo(() => {
    const map = new Map<string, Scene[]>();
    for (const scene of scenes) {
      if (!scene.plotPointId) continue;
      const list = map.get(scene.plotPointId) ?? [];
      list.push(scene);
      map.set(scene.plotPointId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sceneNumber - b.sceneNumber);
    }
    return map;
  }, [scenes]);

  // Flat list of all in-section scenes in display order — used for the SortableList
  const flatSectionScenes = useMemo(() => {
    const flat: Scene[] = [];
    for (const section of sortedSections) {
      const sectionScenes = scenesBySection.get(section.id) ?? [];
      flat.push(...sectionScenes);
    }
    return flat;
  }, [sortedSections, scenesBySection]);

  // Map sceneId -> sectionId for fast lookup on drop
  const sceneToSection = useMemo(() => {
    const map = new Map<string, string>();
    for (const scene of scenes) {
      if (scene.plotPointId) map.set(scene.id, scene.plotPointId);
    }
    return map;
  }, [scenes]);

  const sceneById = useMemo(() => {
    const map = new Map<string, Scene>();
    for (const scene of [...scenes, ...bullpenScenes]) {
      map.set(scene.id, scene);
    }
    return map;
  }, [scenes, bullpenScenes]);

  const isBullpenScene = useMemo(
    () => new Set(bullpenScenes.map(s => s.id)),
    [bullpenScenes]
  );

  const handleDragEnd = ({ activeId, overId }: { activeId: string; overId: string }) => {
    const activeIsBullpen = isBullpenScene.has(activeId);
    const overIsBullpen = isBullpenScene.has(overId) || overId === 'bullpen-zone';

    if (overIsBullpen && !activeIsBullpen) {
      // POV scene → bullpen
      props.onSceneToBullpen(activeId);
      return;
    }
    if (!overIsBullpen && activeIsBullpen) {
      // Bullpen scene → POV section
      const targetSectionId = sceneToSection.get(overId);
      if (targetSectionId) {
        props.onBullpenToSection(activeId, targetSectionId);
      }
      return;
    }
    if (!activeIsBullpen && !overIsBullpen) {
      // POV scene → POV section
      const targetSectionId = sceneToSection.get(overId);
      const overScene = sceneById.get(overId);
      if (!targetSectionId || !overScene) return;
      onSceneReorder(activeId, targetSectionId, overScene.sceneNumber);
    }
    // bullpen → bullpen reorder is a no-op for now
  };

  const renderActive = (activeId: string) => {
    const scene = sceneById.get(activeId);
    if (!scene) return null;
    return (
      <DragPreviewCard
        title={scene.title || scene.content || 'Untitled scene'}
        number={scene.sceneNumber}
        accentColor={characterColor}
      />
    );
  };

  return (
    <div className="pov-outline-view" ref={scrollRef}>
      <SortableArea onDragEnd={handleDragEnd} renderDragOverlay={renderActive}>
        <ScrollAutoBinder scrollRef={scrollRef} />

        <div className="pov-outline-main">
          <SortableList items={flatSectionScenes}>
            {(scene, sortable) => {
              const sectionId = scene.plotPointId!;
              const sectionScenes = scenesBySection.get(sectionId) ?? [];
              const isFirstInSection = sectionScenes[0]?.id === scene.id;
              const section = sortedSections.find(s => s.id === sectionId);
              const sectionIdx = sortedSections.findIndex(s => s.id === sectionId);
              const isFirstSection = sectionIdx === 0;
              const isLastSection = sectionIdx === sortedSections.length - 1;

              return (
                <>
                  {isFirstInSection && section && !hideHeaders && (
                    <div className="pov-outline-section-header" data-section-id={section.id}>
                      <button
                        className={`section-synopsis-chevron ${synopsisModes[section.id] === 'expand' ? 'collapsed' : ''}`}
                        onClick={() => onToggleSynopsisMode(section.id)}
                        title={synopsisModes[section.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                      >{'▾'}</button>
                      <div className="section-reorder-buttons">
                        <button className="section-move-btn" onClick={() => onSectionMoveUp(section.id)} disabled={isFirstSection} title="Move section up">{'▲'}</button>
                        <button className="section-move-btn" onClick={() => onSectionMoveDown(section.id)} disabled={isLastSection} title="Move section down">{'▼'}</button>
                      </div>
                      <span className="plot-point-title">{section.title || 'New Section'}</span>
                      <span className="plot-point-count">({sectionScenes.length}/{section.expectedSceneCount ?? '?'})</span>
                      {onDeleteSection && (
                        <button className="section-delete-btn" onClick={() => onDeleteSection(section.id)} title="Delete section">{'×'}</button>
                      )}
                    </div>
                  )}
                  <div
                    ref={sortable.setNodeRef}
                    style={sortable.style}
                    className={`pov-outline-row-wrapper ${sortable.isOver ? 'is-over' : ''}`}
                    data-dnd-sortable-item
                    {...sortable.attributes}
                    {...sortable.listeners}
                  >
                    <OutlineSceneRow
                      scene={scene}
                      displayNumber={scene.sceneNumber}
                      characterName={getCharacterName?.(scene.characterId)}
                      synopsisVisible={synopsisModes[sectionId] !== 'expand'}
                      onSceneChange={onSceneChange}
                      onSetAside={onSetAside}
                      onOpenInEditor={onOpenInEditor}
                      expandMode={synopsisModes[sectionId] === 'expand'}
                    />
                  </div>
                </>
              );
            }}
          </SortableList>
        </div>

        <div className="pov-outline-bullpen" data-bullpen="true">
          <div className="bullpen-header">
            <h3>Bullpen</h3>
            <span className="bullpen-count">{bullpenScenes.length}</span>
          </div>
          <SortableList items={bullpenScenes}>
            {(scene, sortable) => (
              <div
                ref={sortable.setNodeRef}
                style={sortable.style}
                className={`bullpen-scene ${sortable.isOver ? 'is-over' : ''}`}
                data-scene-id={scene.id}
                data-dnd-sortable-item
                {...sortable.attributes}
                {...sortable.listeners}
              >
                <span className="bullpen-scene-number">{scene.sceneNumber}.</span>
                <span className="bullpen-scene-title">{scene.title || scene.content || 'Untitled scene'}</span>
              </div>
            )}
          </SortableList>
        </div>
      </SortableArea>
    </div>
  );
}
