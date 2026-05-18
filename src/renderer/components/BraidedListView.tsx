import { useState, useRef, useEffect, CSSProperties, Fragment } from 'react';
import {
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
  CollisionDetection,
  closestCenter,
  pointerWithin,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Character, Scene, PlotPoint, BraidedChapter } from '../../shared/types';
import { SortableItem, useAutoScrollContainer, DragPreviewCard, useSortableSensors } from '../dnd';
import OutlineSceneRow from './OutlineSceneRow';

interface BraidedListViewProps {
  displayedScenes: Scene[];
  unbraidedScenesByCharacter: Map<string, Map<string, Scene[]>>;
  characters: Character[];
  plotPoints: PlotPoint[];
  braidedChapters: BraidedChapter[];
  characterColors: Record<string, string>;
  getCharacterName: (id: string) => string;
  getCharacterHexColor: (id: string) => string;
  povReorderedScenes: Set<string>;
  inboxCharFilter: string;
  onInboxCharFilterChange: (value: string) => void;
  synopsisVisible: boolean;
  onSceneChange: (sceneId: string, content: string, notes: string[]) => void;
  onReorderTimeline: (activeId: string, overId: string) => void;
  onMoveToInbox: (sceneId: string) => void;
  onMoveFromInbox: (sceneId: string, overId: string) => void;
  onAddChapter: (title: string, beforePosition: number) => void;
  onMoveChapter: (chapterId: string, newBeforePosition: number) => void;
  onUpdateChapter: (chapterId: string, newTitle: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onInsertSceneAtPosition: (position: number, characterId: string, plotPointId: string) => void;
  onOpenInEditor?: (sceneId: string) => void;
}

// ---------- InboxSceneItem ----------

interface InboxSceneItemProps {
  scene: Scene;
  charColor: string;
}

function InboxSceneItem({ scene, charColor }: InboxSceneItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: scene.id,
    data: { type: 'inbox-scene', scene },
  });

  const title = scene.content
    .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '');

  return (
    <div
      ref={setNodeRef}
      className={`inbox-scene${isDragging ? ' dragging' : ''}`}
      style={{ '--char-color': charColor } as CSSProperties}
      {...attributes}
      {...listeners}
    >
      <span className="inbox-scene-number">{scene.sceneNumber}.</span>
      <span className="inbox-scene-title">{title}</span>
    </div>
  );
}

// ---------- InboxDropZone ----------

interface InboxDropZoneProps {
  children: React.ReactNode;
  charFilter: string;
  onCharFilterChange: (v: string) => void;
  characters: Character[];
}

function InboxDropZone({ children, charFilter, onCharFilterChange, characters }: InboxDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'braided-inbox' });
  return (
    <div ref={setNodeRef} className={`to-braid-inbox${isOver ? ' dnd-inbox-over' : ''}`}>
      <div className="inbox-header">
        <h2 className="inbox-title">To Braid</h2>
        <select
          className="inbox-char-filter"
          value={charFilter}
          onChange={(e) => onCharFilterChange(e.target.value)}
        >
          <option value="all">All Characters</option>
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="inbox-characters">
        {children}
      </div>
    </div>
  );
}

// ---------- InsertPopover ----------

interface InsertPopoverProps {
  index: number;
  displayPosition: number;
  displayedScenesLength: number;
  characters: Character[];
  plotPoints: PlotPoint[];
  braidedChapters: BraidedChapter[];
  characterColors: Record<string, string>;
  insertAtPosition: number | null;
  setInsertAtPosition: (pos: number | null) => void;
  insertCharacterId: string | null;
  setInsertCharacterId: (id: string | null) => void;
  addingChapterAtPosition: number | null;
  setAddingChapterAtPosition: (pos: number | null) => void;
  onInsertSceneAtPosition: (position: number, characterId: string, plotPointId: string) => void;
  onAddChapter: (title: string, beforePosition: number) => void;
}

function InsertPopover({
  index,
  displayPosition,
  displayedScenesLength,
  characters,
  plotPoints,
  braidedChapters,
  characterColors,
  insertAtPosition,
  setInsertAtPosition,
  insertCharacterId,
  setInsertCharacterId,
  addingChapterAtPosition,
  setAddingChapterAtPosition,
  onInsertSceneAtPosition,
  onAddChapter,
}: InsertPopoverProps) {
  const isEndZone = index === displayedScenesLength;

  const handleChapterInputBlur = (value: string) => {
    if (value.trim()) {
      if (isEndZone) {
        const existingPositions = braidedChapters.map(ch => ch.beforePosition);
        let newPosition = displayedScenesLength + 1;
        while (existingPositions.includes(newPosition)) newPosition++;
        onAddChapter(value.trim(), newPosition);
      } else {
        onAddChapter(value.trim(), displayPosition);
      }
    }
    setAddingChapterAtPosition(null);
    setInsertAtPosition(null);
  };

  const handleChapterAddClick = () => {
    setAddingChapterAtPosition(isEndZone ? displayedScenesLength + 1 : displayPosition);
  };

  return (
    <div className="braided-insert-zone">
      <button
        className="braided-insert-btn"
        onClick={() => {
          setInsertAtPosition(insertAtPosition === index ? null : index);
          setInsertCharacterId(null);
          setAddingChapterAtPosition(null);
        }}
        title="Insert here"
      >+</button>
      {insertAtPosition === index && (
        <div className="braided-insert-popover">
          {addingChapterAtPosition !== null ? (
            <div className="braided-insert-chapter-input">
              <input
                type="text"
                className="add-chapter-input"
                placeholder="Chapter title..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleChapterInputBlur((e.target as HTMLInputElement).value);
                  } else if (e.key === 'Escape') {
                    setAddingChapterAtPosition(null);
                  }
                }}
                onBlur={(e) => handleChapterInputBlur(e.target.value)}
              />
            </div>
          ) : !insertCharacterId ? (
            <>
              <button
                className="braided-insert-popover-item braided-insert-chapter-option"
                onClick={handleChapterAddClick}
              >
                + Chapter
              </button>
              <div className="braided-insert-divider" />
              <div className="braided-insert-popover-title">Insert scene</div>
              {characters.map(char => (
                <button
                  key={char.id}
                  className="braided-insert-popover-item"
                  onClick={() => setInsertCharacterId(char.id)}
                >
                  <span className="braided-insert-color-dot" style={{ background: characterColors[char.id] || '#888' }} />
                  {char.name}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="braided-insert-popover-title">
                <button className="braided-insert-back-btn" onClick={() => setInsertCharacterId(null)}>&larr;</button>
                Pick a section
              </div>
              {plotPoints
                .filter(p => p.characterId === insertCharacterId)
                .sort((a, b) => a.order - b.order)
                .map(pp => (
                  <button
                    key={pp.id}
                    className="braided-insert-popover-item"
                    onClick={() => {
                      onInsertSceneAtPosition(index, insertCharacterId!, pp.id);
                      setInsertAtPosition(null);
                      setInsertCharacterId(null);
                    }}
                  >
                    {pp.title}
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- BraidedTimeline ----------

interface BraidedTimelineProps {
  displayedScenes: Scene[];
  braidedChapters: BraidedChapter[];
  dndActiveId: string | null;
  lastMovedSceneId: string | null;
  povReorderedScenes: Set<string>;
  characters: Character[];
  plotPoints: PlotPoint[];
  characterColors: Record<string, string>;
  getCharacterName: (id: string) => string;
  getCharacterHexColor: (id: string) => string;
  synopsisVisible: boolean;
  insertAtPosition: number | null;
  setInsertAtPosition: (pos: number | null) => void;
  insertCharacterId: string | null;
  setInsertCharacterId: (id: string | null) => void;
  addingChapterAtPosition: number | null;
  setAddingChapterAtPosition: (pos: number | null) => void;
  draggedChapter: BraidedChapter | null;
  setDraggedChapter: (ch: BraidedChapter | null) => void;
  onSceneChange: (sceneId: string, content: string, notes: string[]) => void;
  onMoveToInbox: (sceneId: string) => void;
  onMoveChapter: (chapterId: string, newBeforePosition: number) => void;
  onUpdateChapter: (chapterId: string, newTitle: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onAddChapter: (title: string, beforePosition: number) => void;
  onInsertSceneAtPosition: (position: number, characterId: string, plotPointId: string) => void;
  onOpenInEditor?: (sceneId: string) => void;
}

function BraidedTimeline({
  displayedScenes,
  braidedChapters,
  dndActiveId,
  lastMovedSceneId,
  povReorderedScenes,
  characters,
  plotPoints,
  characterColors,
  getCharacterName,
  getCharacterHexColor,
  synopsisVisible,
  insertAtPosition,
  setInsertAtPosition,
  insertCharacterId,
  setInsertCharacterId,
  addingChapterAtPosition,
  setAddingChapterAtPosition,
  draggedChapter,
  setDraggedChapter,
  onSceneChange,
  onMoveToInbox,
  onMoveChapter,
  onUpdateChapter,
  onDeleteChapter,
  onAddChapter,
  onInsertSceneAtPosition,
  onOpenInEditor,
}: BraidedTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutoScrollContainer(scrollRef);

  const isDraggingAny = !!dndActiveId || !!draggedChapter;

  return (
    <div className={`braided-timeline${isDraggingAny ? ' is-dragging' : ''}`} ref={scrollRef}>
      <SortableContext items={displayedScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
        {displayedScenes.length === 0 && (
          <div className="drop-zone empty-timeline">
            Drag scenes here to start braiding
          </div>
        )}

        {displayedScenes.map((scene, index) => {
          const displayPosition = index + 1;
          const chapterBefore = braidedChapters.find(ch => ch.beforePosition === displayPosition);

          return (
            <Fragment key={scene.id}>
              {chapterBefore && (
                <div
                  className={`braided-chapter${draggedChapter?.id === chapterBefore.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    setDraggedChapter(chapterBefore);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', chapterBefore.id);
                  }}
                  onDragEnd={() => setDraggedChapter(null)}
                >
                  <span className="chapter-drag-handle">&#8942;&#8942;</span>
                  <input
                    type="text"
                    className="braided-chapter-title"
                    defaultValue={chapterBefore.title}
                    onBlur={(e) => {
                      if (e.target.value !== chapterBefore.title) {
                        onUpdateChapter(chapterBefore.id, e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className="delete-chapter-btn"
                    onClick={() => onDeleteChapter(chapterBefore.id)}
                    title="Delete chapter"
                  >&#215;</button>
                </div>
              )}

              {!chapterBefore && draggedChapter && (
                <div
                  className="chapter-drop-zone"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedChapter) {
                      onMoveChapter(draggedChapter.id, displayPosition);
                      setDraggedChapter(null);
                    }
                  }}
                >
                  Move chapter here
                </div>
              )}

              <InsertPopover
                index={index}
                displayPosition={displayPosition}
                displayedScenesLength={displayedScenes.length}
                characters={characters}
                plotPoints={plotPoints}
                braidedChapters={braidedChapters}
                characterColors={characterColors}
                insertAtPosition={insertAtPosition}
                setInsertAtPosition={setInsertAtPosition}
                insertCharacterId={insertCharacterId}
                setInsertCharacterId={setInsertCharacterId}
                addingChapterAtPosition={addingChapterAtPosition}
                setAddingChapterAtPosition={setAddingChapterAtPosition}
                onInsertSceneAtPosition={onInsertSceneAtPosition}
                onAddChapter={onAddChapter}
              />

              <SortableItem id={scene.id} data={{ type: 'timeline-scene', scene }}>
                {({ setNodeRef, style, attributes, listeners, isDragging, dropPosition }) => (
                  <div
                    ref={setNodeRef}
                    style={{ ...style, '--char-color': getCharacterHexColor(scene.characterId) } as CSSProperties}
                    className={`pov-outline-row-wrapper braided-row-wrapper${povReorderedScenes.has(scene.id) ? ' pov-reordered' : ''}${lastMovedSceneId === scene.id ? ' just-moved' : ''}`}
                  >
                    <span className="pov-drag-handle" {...attributes} {...listeners}>⋮⋮</span>
                    <OutlineSceneRow
                      scene={scene}
                      displayNumber={displayPosition}
                      characterName={getCharacterName(scene.characterId)}
                      synopsisVisible={synopsisVisible}
                      onSceneChange={onSceneChange}
                      onSetAside={onMoveToInbox}
                      onOpenInEditor={onOpenInEditor}
                      expandMode={true}
                      isDragging={isDragging}
                      dropPosition={dropPosition}
                    />
                  </div>
                )}
              </SortableItem>
            </Fragment>
          );
        })}

        {/* End insert zone */}
        {displayedScenes.length > 0 && (
          <InsertPopover
            index={displayedScenes.length}
            displayPosition={displayedScenes.length + 1}
            displayedScenesLength={displayedScenes.length}
            characters={characters}
            plotPoints={plotPoints}
            braidedChapters={braidedChapters}
            characterColors={characterColors}
            insertAtPosition={insertAtPosition}
            setInsertAtPosition={setInsertAtPosition}
            insertCharacterId={insertCharacterId}
            setInsertCharacterId={setInsertCharacterId}
            addingChapterAtPosition={addingChapterAtPosition}
            setAddingChapterAtPosition={setAddingChapterAtPosition}
            onInsertSceneAtPosition={onInsertSceneAtPosition}
            onAddChapter={onAddChapter}
          />
        )}
      </SortableContext>
    </div>
  );
}

// ---------- BraidedListView ----------

const collisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === 'timeline-scene') {
    const inboxCollisions = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter(c => c.id === 'braided-inbox'),
    });
    if (inboxCollisions.length > 0) return inboxCollisions;
  }
  return closestCenter(args);
};

export default function BraidedListView({
  displayedScenes,
  unbraidedScenesByCharacter,
  characters,
  plotPoints,
  braidedChapters,
  characterColors,
  getCharacterName,
  getCharacterHexColor,
  povReorderedScenes,
  inboxCharFilter,
  onInboxCharFilterChange,
  synopsisVisible,
  onSceneChange,
  onReorderTimeline,
  onMoveToInbox,
  onMoveFromInbox,
  onAddChapter,
  onMoveChapter,
  onUpdateChapter,
  onDeleteChapter,
  onInsertSceneAtPosition,
  onOpenInEditor,
}: BraidedListViewProps) {
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedChapter, setDraggedChapter] = useState<BraidedChapter | null>(null);
  const [insertAtPosition, setInsertAtPosition] = useState<number | null>(null);
  const [insertCharacterId, setInsertCharacterId] = useState<string | null>(null);
  const [addingChapterAtPosition, setAddingChapterAtPosition] = useState<number | null>(null);
  const [lastMovedSceneId, setLastMovedSceneId] = useState<string | null>(null);
  const lastMovedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (lastMovedTimerRef.current) clearTimeout(lastMovedTimerRef.current); }, []);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setInsertAtPosition(null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const activeType = active.data.current?.type as string | undefined;

    const markMoved = (id: string) => {
      if (lastMovedTimerRef.current) clearTimeout(lastMovedTimerRef.current);
      setLastMovedSceneId(id);
      lastMovedTimerRef.current = setTimeout(() => setLastMovedSceneId(null), 5000);
    };

    if (activeType === 'timeline-scene') {
      if (over.id === 'braided-inbox') {
        onMoveToInbox(String(active.id));
      } else if (active.id !== over.id) {
        onReorderTimeline(String(active.id), String(over.id));
        markMoved(String(active.id));
      }
    } else if (activeType === 'inbox-scene') {
      if (over.id !== 'braided-inbox') {
        onMoveFromInbox(String(active.id), String(over.id));
        markMoved(String(active.id));
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  // Build drag overlay content
  const getDragOverlayContent = () => {
    if (!activeId) return null;
    const timelineScene = displayedScenes.find(s => s.id === activeId);
    if (timelineScene) {
      const num = displayedScenes.indexOf(timelineScene) + 1;
      return (
        <DragPreviewCard
          title={timelineScene.title || timelineScene.content}
          number={num}
          accentColor={getCharacterHexColor(timelineScene.characterId)}
        />
      );
    }
    // Inbox scene
    for (const [charId, ppMap] of unbraidedScenesByCharacter) {
      for (const [, scenes] of ppMap) {
        const found = scenes.find(s => s.id === activeId);
        if (found) {
          return (
            <DragPreviewCard
              title={found.title || found.content}
              number={found.sceneNumber}
              accentColor={getCharacterHexColor(charId)}
            />
          );
        }
      }
    }
    return null;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={`braided-layout${activeId ? ' is-dragging' : ''}`}>
        <BraidedTimeline
          displayedScenes={displayedScenes}
          braidedChapters={braidedChapters}
          dndActiveId={activeId}
          lastMovedSceneId={lastMovedSceneId}
          povReorderedScenes={povReorderedScenes}
          characters={characters}
          plotPoints={plotPoints}
          characterColors={characterColors}
          getCharacterName={getCharacterName}
          getCharacterHexColor={getCharacterHexColor}
          synopsisVisible={synopsisVisible}
          insertAtPosition={insertAtPosition}
          setInsertAtPosition={setInsertAtPosition}
          insertCharacterId={insertCharacterId}
          setInsertCharacterId={setInsertCharacterId}
          addingChapterAtPosition={addingChapterAtPosition}
          setAddingChapterAtPosition={setAddingChapterAtPosition}
          draggedChapter={draggedChapter}
          setDraggedChapter={setDraggedChapter}
          onSceneChange={onSceneChange}
          onMoveToInbox={onMoveToInbox}
          onMoveChapter={onMoveChapter}
          onUpdateChapter={onUpdateChapter}
          onDeleteChapter={onDeleteChapter}
          onAddChapter={onAddChapter}
          onInsertSceneAtPosition={onInsertSceneAtPosition}
          onOpenInEditor={onOpenInEditor}
        />

        <InboxDropZone
          charFilter={inboxCharFilter}
          onCharFilterChange={onInboxCharFilterChange}
          characters={characters}
        >
          {characters
            .filter(c => inboxCharFilter === 'all' || c.id === inboxCharFilter)
            .map(char => {
              const charPlotPointMap = unbraidedScenesByCharacter.get(char.id);
              const charPlotPoints = plotPoints
                .filter(p => p.characterId === char.id)
                .sort((a, b) => a.order - b.order);
              let totalUnbraided = 0;
              if (charPlotPointMap) {
                for (const scenes of charPlotPointMap.values()) {
                  totalUnbraided += scenes.length;
                }
              }
              const charColor = getCharacterHexColor(char.id);
              return (
                <div key={char.id} className="inbox-character-group">
                  <div className="inbox-character-header">
                    <div className="inbox-character-color" style={{ backgroundColor: charColor }} />
                    <h3 className="inbox-character-name">{char.name}</h3>
                    {totalUnbraided > 0 && (
                      <span className="inbox-character-count">{totalUnbraided}</span>
                    )}
                  </div>
                  <div className="inbox-scenes">
                    {totalUnbraided > 0 ? (
                      <>
                        {charPlotPoints.map(plotPoint => {
                          const plotPointScenes = charPlotPointMap?.get(plotPoint.id);
                          if (!plotPointScenes || plotPointScenes.length === 0) return null;
                          return (
                            <div key={plotPoint.id} className="inbox-plot-point-group">
                              <div className="inbox-plot-point-header">{plotPoint.title}</div>
                              {plotPointScenes.map(scene => (
                                <InboxSceneItem
                                  key={scene.id}
                                  scene={scene}
                                  charColor={charColor}
                                />
                              ))}
                            </div>
                          );
                        })}
                        {charPlotPointMap?.get('no-plot-point')?.map(scene => (
                          <InboxSceneItem
                            key={scene.id}
                            scene={scene}
                            charColor={charColor}
                          />
                        ))}
                      </>
                    ) : (
                      <div className="inbox-empty">All braided</div>
                    )}
                  </div>
                </div>
              );
            })}
        </InboxDropZone>
      </div>

      <DragOverlay dropAnimation={null}>
        {getDragOverlayContent()}
      </DragOverlay>
    </DndContext>
  );
}
