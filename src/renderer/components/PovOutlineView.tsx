import { useRef, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
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
  characterColor: string;
  synopsisModes: Record<string, 'inline' | 'expand'>;
  hideHeaders: boolean;
  onSceneReorder: (sceneId: string, targetSectionId: string, targetSceneNumber: number) => void;
  onSetAside: (sceneId: string) => void;
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

export default function PovOutlineView(props: PovOutlineViewProps) {
  const {
    sections,
    scenes,
    characterColor,
    synopsisModes,
    hideHeaders,
    onSceneReorder,
    onSetAside,
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
    for (const scene of scenes) {
      map.set(scene.id, scene);
    }
    return map;
  }, [scenes]);

  const handleDragEnd = ({ activeId, overId }: { activeId: string; overId: string }) => {
    // Empty-section drop placeholder
    if (overId.startsWith('section-empty:')) {
      const targetSectionId = overId.slice('section-empty:'.length);
      onSceneReorder(activeId, targetSectionId, 1);
      return;
    }
    // POV scene → POV scene
    const targetSectionId = sceneToSection.get(overId);
    const overScene = sceneById.get(overId);
    if (!targetSectionId || !overScene) return;
    // When dragging downward (active is above over in the flat list), the scene
    // should land AFTER over → use overScene.sceneNumber + 1. Dragging upward
    // → land BEFORE over → use overScene.sceneNumber. This matches what the
    // drop indicator visually shows (above/below the over item).
    const activeIndex = flatSectionScenes.findIndex(s => s.id === activeId);
    const overIndex = flatSectionScenes.findIndex(s => s.id === overId);
    const dropsAfterOver = activeIndex >= 0 && overIndex >= 0 && activeIndex < overIndex;
    const targetSceneNumber = dropsAfterOver
      ? overScene.sceneNumber + 1
      : overScene.sceneNumber;
    onSceneReorder(activeId, targetSectionId, targetSceneNumber);
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

              // For each section that has zero scenes AND comes BEFORE this scene's section,
              // render its header + empty drop zone here.
              const emptySectionsBefore: PlotPoint[] = [];
              if (isFirstInSection) {
                for (let i = 0; i < sectionIdx; i++) {
                  const earlierSection = sortedSections[i];
                  const earlierScenes = scenesBySection.get(earlierSection.id) ?? [];
                  if (earlierScenes.length === 0) emptySectionsBefore.push(earlierSection);
                }
              }

              return (
                <>
                  {emptySectionsBefore.map((empty) => {
                    const emptyIdx = sortedSections.findIndex(s => s.id === empty.id);
                    return (
                      <div key={`empty-${empty.id}`} className="pov-outline-section">
                        {!hideHeaders && (
                          <div className="pov-outline-section-header" data-section-id={empty.id}>
                            <button
                              className={`section-synopsis-chevron ${synopsisModes[empty.id] === 'expand' ? 'collapsed' : ''}`}
                              onClick={() => onToggleSynopsisMode(empty.id)}
                              title={synopsisModes[empty.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                            >{'▾'}</button>
                            <span className="plot-point-title">{empty.title || 'New Section'}</span>
                            <span className="plot-point-count">(0/{empty.expectedSceneCount ?? '?'})</span>
                            {onDeleteSection && (
                              <button className="section-delete-btn" onClick={() => onDeleteSection(empty.id)} title="Delete section">{'×'}</button>
                            )}
                          </div>
                        )}
                        <EmptySectionDropZone sectionId={empty.id} />
                      </div>
                    );
                  })}
                  {isFirstInSection && section && !hideHeaders && (
                    <div className="pov-outline-section-header" data-section-id={section.id}>
                      <button
                        className={`section-synopsis-chevron ${synopsisModes[section.id] === 'expand' ? 'collapsed' : ''}`}
                        onClick={() => onToggleSynopsisMode(section.id)}
                        title={synopsisModes[section.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                      >{'▾'}</button>
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
                    data-section-id={sectionId}
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
          {/* Render trailing empty sections (those that come after the last non-empty section) */}
          {(() => {
            const lastNonEmptyIdx = (() => {
              for (let i = sortedSections.length - 1; i >= 0; i--) {
                if ((scenesBySection.get(sortedSections[i].id) ?? []).length > 0) return i;
              }
              return -1;
            })();
            return sortedSections.slice(lastNonEmptyIdx + 1).map((empty) => {
              const emptyIdx = sortedSections.findIndex(s => s.id === empty.id);
              return (
                <div key={`trailing-empty-${empty.id}`} className="pov-outline-section">
                  {!hideHeaders && (
                    <div className="pov-outline-section-header" data-section-id={empty.id}>
                      <button
                        className={`section-synopsis-chevron ${synopsisModes[empty.id] === 'expand' ? 'collapsed' : ''}`}
                        onClick={() => onToggleSynopsisMode(empty.id)}
                        title={synopsisModes[empty.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                      >{'▾'}</button>
                      <span className="plot-point-title">{empty.title || 'New Section'}</span>
                      <span className="plot-point-count">(0/{empty.expectedSceneCount ?? '?'})</span>
                      {onDeleteSection && (
                        <button className="section-delete-btn" onClick={() => onDeleteSection(empty.id)} title="Delete section">{'×'}</button>
                      )}
                    </div>
                  )}
                  <EmptySectionDropZone sectionId={empty.id} />
                </div>
              );
            });
          })()}
        </div>
      </SortableArea>
    </div>
  );
}
