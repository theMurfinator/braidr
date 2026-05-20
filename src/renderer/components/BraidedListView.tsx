import { useState, useRef, useEffect, CSSProperties } from 'react';
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
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Character, Scene, PlotPoint, Chapter } from '../../shared/types';
import { SortableItem, useAutoScrollContainer, DragPreviewCard, useSortableSensors } from '../dnd';
import OutlineSceneRow from './OutlineSceneRow';

interface BraidedListViewProps {
  // Keep all non-chapter props unchanged:
  displayedScenes: Scene[];
  unbraidedScenesByCharacter: Map<string, Map<string, Scene[]>>;
  characters: Character[];
  plotPoints: PlotPoint[];
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
  showAddChapterInput: boolean;
  onDismissAddChapter: () => void;
  onOpenInEditor?: (sceneId: string) => void;
  // New chapter props:
  chapters: Chapter[];
  onAddChapter: (title: string) => void;
  onUpdateChapter: (chapterId: string, updates: Partial<Pick<Chapter, 'title' | 'description'>>) => void;
  onDeleteChapter: (chapterId: string) => void;
  onReorderChapters: (orderedIds: string[]) => void;
  onAssignSceneToChapter: (sceneId: string, chapterId: string | null, sceneOrder: number) => void;
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

// ---------- AddChapterInput ----------

function AddChapterInput({ onAdd, onCancel }: { onAdd: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="add-chapter-input-container">
      <input
        autoFocus
        className="add-chapter-input"
        placeholder="Chapter title..."
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && value.trim()) onAdd(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button className="add-chapter-confirm-btn" disabled={!value.trim()} onClick={() => onAdd(value.trim())}>Add</button>
      <button className="add-chapter-cancel-btn" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ---------- SortableChapterContainer ----------

interface SortableChapterContainerProps {
  chapter: Chapter;
  scenes: Scene[];
  onUpdateChapter: (chapterId: string, updates: Partial<Pick<Chapter, 'title' | 'description'>>) => void;
  onDeleteChapter: (chapterId: string) => void;
  onSceneChange: (sceneId: string, content: string, notes: string[]) => void;
  onOpenInEditor?: (sceneId: string) => void;
  getCharacterName: (id: string) => string;
  getCharacterHexColor: (id: string) => string;
  onMoveToInbox: (sceneId: string) => void;
  synopsisVisible: boolean;
}

function SortableChapterContainer({
  chapter,
  scenes,
  onUpdateChapter,
  onDeleteChapter,
  onSceneChange,
  onOpenInEditor,
  getCharacterName,
  getCharacterHexColor,
  onMoveToInbox,
  synopsisVisible,
}: SortableChapterContainerProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
    data: { type: 'chapter' },
  });

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(chapter.title);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="chapter-container">
      <div className="chapter-header">
        <span className="chapter-drag-handle" {...attributes} {...listeners}>⠿</span>
        {isEditingTitle ? (
          <input
            autoFocus
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={() => {
              if (editTitle.trim()) onUpdateChapter(chapter.id, { title: editTitle.trim() });
              setIsEditingTitle(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setEditTitle(chapter.title); setIsEditingTitle(false); }
            }}
            className="chapter-title-input"
          />
        ) : (
          <span
            className="chapter-title"
            onDoubleClick={() => { setEditTitle(chapter.title); setIsEditingTitle(true); }}
          >
            {chapter.title}
          </span>
        )}
        <span className="chapter-scene-count">{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>
        <button
          className="delete-chapter-btn"
          title="Delete chapter"
          onClick={() => onDeleteChapter(chapter.id)}
        >×</button>
      </div>

      <div className="chapter-scenes">
        <SortableContext items={scenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {scenes.map((scene, index) => (
            <SortableItem key={scene.id} id={scene.id} data={{ type: 'chapter-scene', chapterId: chapter.id }}>
              {({ setNodeRef: sceneRef, style: sceneStyle, attributes: sceneAttrs, listeners: sceneListeners, isDragging: sceneIsDragging, dropPosition }) => (
                <div
                  ref={sceneRef}
                  style={{ ...sceneStyle, '--char-color': getCharacterHexColor(scene.characterId) } as CSSProperties}
                  className="pov-outline-row-wrapper braided-row-wrapper"
                >
                  <span className="pov-drag-handle" {...sceneAttrs} {...sceneListeners}>⋮⋮</span>
                  <OutlineSceneRow
                    scene={scene}
                    displayNumber={index + 1}
                    characterName={getCharacterName(scene.characterId)}
                    synopsisVisible={synopsisVisible}
                    onSceneChange={onSceneChange}
                    onSetAside={onMoveToInbox}
                    onOpenInEditor={onOpenInEditor}
                    expandMode={true}
                    isDragging={sceneIsDragging}
                    dropPosition={dropPosition}
                  />
                </div>
              )}
            </SortableItem>
          ))}
          {scenes.length === 0 && (
            <div className="chapter-empty-drop">Drop scenes here</div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

// ---------- BraidedTimeline ----------

interface BraidedTimelineProps {
  displayedScenes: Scene[];
  chapters: Chapter[];
  dndActiveId: string | null;
  lastMovedSceneId: string | null;
  povReorderedScenes: Set<string>;
  getCharacterName: (id: string) => string;
  getCharacterHexColor: (id: string) => string;
  synopsisVisible: boolean;
  onSceneChange: (sceneId: string, content: string, notes: string[]) => void;
  onMoveToInbox: (sceneId: string) => void;
  onUpdateChapter: (chapterId: string, updates: Partial<Pick<Chapter, 'title' | 'description'>>) => void;
  onDeleteChapter: (chapterId: string) => void;
  onOpenInEditor?: (sceneId: string) => void;
}

function BraidedTimeline({
  displayedScenes,
  chapters,
  dndActiveId,
  lastMovedSceneId,
  povReorderedScenes,
  getCharacterName,
  getCharacterHexColor,
  synopsisVisible,
  onSceneChange,
  onMoveToInbox,
  onUpdateChapter,
  onDeleteChapter,
  onOpenInEditor,
}: BraidedTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutoScrollContainer(scrollRef);

  const isDraggingAny = !!dndActiveId;

  if (chapters.length > 0) {
    const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
    const scenesByChapter = new Map<string, Scene[]>();
    sortedChapters.forEach(ch => {
      scenesByChapter.set(
        ch.id,
        displayedScenes.filter(s => s.chapterId === ch.id).sort((a, b) => a.sceneOrder - b.sceneOrder)
      );
    });
    const unchapteredScenes = displayedScenes
      .filter(s => !s.chapterId || !chapters.find(ch => ch.id === s.chapterId))
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));

    return (
      <div className={`braided-timeline${isDraggingAny ? ' is-dragging' : ''}`} ref={scrollRef}>
        <SortableContext items={sortedChapters.map(ch => ch.id)} strategy={verticalListSortingStrategy}>
          {sortedChapters.map(chapter => (
            <SortableChapterContainer
              key={chapter.id}
              chapter={chapter}
              scenes={scenesByChapter.get(chapter.id) || []}
              onUpdateChapter={onUpdateChapter}
              onDeleteChapter={onDeleteChapter}
              onSceneChange={onSceneChange}
              onOpenInEditor={onOpenInEditor}
              getCharacterName={getCharacterName}
              getCharacterHexColor={getCharacterHexColor}
              onMoveToInbox={onMoveToInbox}
              synopsisVisible={synopsisVisible}
            />
          ))}
        </SortableContext>

        {unchapteredScenes.length > 0 && (
          <div className="unchaptered-scenes">
            <div className="unchaptered-header">Unchaptered</div>
            <SortableContext items={unchapteredScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {unchapteredScenes.map((scene, index) => (
                <SortableItem key={scene.id} id={scene.id} data={{ type: 'chapter-scene', chapterId: null }}>
                  {({ setNodeRef, style, attributes, listeners, isDragging, dropPosition }) => (
                    <div
                      ref={setNodeRef}
                      style={{ ...style, '--char-color': getCharacterHexColor(scene.characterId) } as CSSProperties}
                      className="pov-outline-row-wrapper braided-row-wrapper"
                    >
                      <span className="pov-drag-handle" {...attributes} {...listeners}>⋮⋮</span>
                      <OutlineSceneRow
                        scene={scene}
                        displayNumber={index + 1}
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
              ))}
            </SortableContext>
          </div>
        )}

      </div>
    );
  }

  // No chapters: flat list
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

          return (
            <SortableItem key={scene.id} id={scene.id} data={{ type: 'timeline-scene', scene }}>
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
          );
        })}
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
  chapters,
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
  onUpdateChapter,
  onDeleteChapter,
  onReorderChapters,
  onAssignSceneToChapter,
  showAddChapterInput,
  onDismissAddChapter,
  onOpenInEditor,
}: BraidedListViewProps) {
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastMovedSceneId, setLastMovedSceneId] = useState<string | null>(null);
  const lastMovedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (lastMovedTimerRef.current) clearTimeout(lastMovedTimerRef.current); }, []);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const activeType = active.data.current?.type as string | undefined;
    const overType = over.data.current?.type as string | undefined;

    const markMoved = (id: string) => {
      if (lastMovedTimerRef.current) clearTimeout(lastMovedTimerRef.current);
      setLastMovedSceneId(id);
      lastMovedTimerRef.current = setTimeout(() => setLastMovedSceneId(null), 5000);
    };

    if (activeType === 'chapter') {
      // Reorder chapters
      const sortedChs = [...chapters].sort((a, b) => a.order - b.order);
      const oldIdx = sortedChs.findIndex(ch => ch.id === active.id);
      const newIdx = sortedChs.findIndex(ch => ch.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const reordered = arrayMove(sortedChs, oldIdx, newIdx);
        onReorderChapters(reordered.map(ch => ch.id));
      }
      return;
    }

    if (activeType === 'chapter-scene') {
      const activeChapterId = active.data.current?.chapterId as string | undefined;
      const overChapterId = over.data.current?.chapterId as string | undefined;

      const sortedChs = [...chapters].sort((a, b) => a.order - b.order);
      const scenesByChapter = new Map<string, Scene[]>();
      sortedChs.forEach(ch => {
        scenesByChapter.set(
          ch.id,
          displayedScenes.filter(s => s.chapterId === ch.id).sort((a, b) => a.sceneOrder - b.sceneOrder)
        );
      });

      if (overType === 'chapter') {
        // Dropped onto a chapter header — append to that chapter
        const targetId = String(over.id);
        const targetScenes = scenesByChapter.get(targetId) || [];
        onAssignSceneToChapter(String(active.id), targetId, targetScenes.length);
        // Renumber source chapter to close the gap
        if (activeChapterId) {
          const srcScenes = (scenesByChapter.get(activeChapterId) || []).filter(s => s.id !== active.id);
          srcScenes.forEach((s, idx) => onAssignSceneToChapter(s.id, activeChapterId, idx));
        }
        markMoved(String(active.id));
        return;
      }

      if (overType === 'chapter-scene') {
        if (activeChapterId === overChapterId && activeChapterId) {
          // Same chapter: reorder
          const chScenes = [...(scenesByChapter.get(activeChapterId) || [])];
          const oldIdx = chScenes.findIndex(s => s.id === active.id);
          const newIdx = chScenes.findIndex(s => s.id === over.id);
          if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            const reordered = arrayMove(chScenes, oldIdx, newIdx);
            reordered.forEach((s, idx) => onAssignSceneToChapter(s.id, activeChapterId, idx));
            markMoved(String(active.id));
          }
        } else if (overChapterId) {
          // Cross-chapter move
          const targetScenes = [...(scenesByChapter.get(overChapterId) || [])];
          const insertIdx = targetScenes.findIndex(s => s.id === over.id);
          const finalIdx = insertIdx === -1 ? targetScenes.length : insertIdx;

          onAssignSceneToChapter(String(active.id), overChapterId, finalIdx);

          // Renumber source chapter (excluding the moved scene)
          if (activeChapterId) {
            const srcScenes = (scenesByChapter.get(activeChapterId) || []).filter(s => s.id !== active.id);
            srcScenes.forEach((s, idx) => onAssignSceneToChapter(s.id, activeChapterId, idx));
          }

          // Renumber target chapter: shift existing scenes around the insertion point
          targetScenes.forEach((s, idx) => {
            const adjustedIdx = idx < finalIdx ? idx : idx + 1;
            onAssignSceneToChapter(s.id, overChapterId, adjustedIdx);
          });
          markMoved(String(active.id));
        }
        return;
      }
    }

    // Legacy flat timeline drag (no chapters mode)
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
        <div className="braided-main">
          {showAddChapterInput && (
            <AddChapterInput
              onAdd={(title) => { onAddChapter(title); onDismissAddChapter(); }}
              onCancel={onDismissAddChapter}
            />
          )}
          <BraidedTimeline
            displayedScenes={displayedScenes}
            chapters={chapters}
            dndActiveId={activeId}
            lastMovedSceneId={lastMovedSceneId}
            povReorderedScenes={povReorderedScenes}
            getCharacterName={getCharacterName}
            getCharacterHexColor={getCharacterHexColor}
            synopsisVisible={synopsisVisible}
            onSceneChange={onSceneChange}
            onMoveToInbox={onMoveToInbox}
            onUpdateChapter={onUpdateChapter}
            onDeleteChapter={onDeleteChapter}
            onOpenInEditor={onOpenInEditor}
          />
        </div>

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
