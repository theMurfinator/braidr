import { useRef, useMemo, useState, useEffect, ReactElement } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PlotPoint, Scene, Chapter } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';
import {
  SortableItem,
  useAutoScrollContainer,
} from '../dnd';

interface PovOutlineViewProps {
  sections: PlotPoint[];
  scenes: Scene[];
  synopsisModes: Record<string, 'inline' | 'expand'>;
  hideHeaders: boolean;
  hideScenes?: boolean;
  onSetAside: (sceneId: string) => void;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onPreview?: (sceneId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
  onOpenSectionDetails?: (sectionId: string) => void;
  getCharacterName?: (characterId: string) => string;
  chapters?: Chapter[];
  onAssignSceneToChapter?: (sceneId: string, chapterId: string | null, sceneOrder: number) => void;
  povReorderedScenes?: Set<string>;
}

function ScrollAutoBinder({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  useAutoScrollContainer(scrollRef);
  return null;
}

interface SectionHeaderProps {
  section: PlotPoint;
  sceneCount: number;
  synopsisMode: 'inline' | 'expand' | undefined;
  hideScenes?: boolean;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
  onOpenDetails?: (sectionId: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

function stripHtml(html: string): string {
  if (!html || !html.includes('<')) return html;
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
}

function SectionHeader({
  section,
  sceneCount,
  synopsisMode,
  hideScenes,
  onToggleSynopsisMode,
  onSectionChange,
  onDeleteSection,
  onOpenDetails,
  dragHandleProps,
}: SectionHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCount, setIsEditingCount] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title || 'New Section');
  const [editCount, setEditCount] = useState<string>(section.expectedSceneCount?.toString() || '');
  const [editDesc, setEditDesc] = useState(() => stripHtml(section.description || ''));
  const titleInputRef = useRef<HTMLInputElement>(null);
  const countInputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setEditTitle(section.title || 'New Section'); }, [section.title]);
  useEffect(() => { setEditCount(section.expectedSceneCount?.toString() || ''); }, [section.expectedSceneCount]);
  useEffect(() => { setEditDesc(stripHtml(section.description || '')); }, [section.description]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingCount && countInputRef.current) {
      countInputRef.current.focus();
      countInputRef.current.select();
    }
  }, [isEditingCount]);

  useEffect(() => {
    if (isEditingDesc && descRef.current) {
      descRef.current.focus();
      const len = descRef.current.value.length;
      descRef.current.setSelectionRange(len, len);
    }
  }, [isEditingDesc]);

  const commitTitle = () => {
    setIsEditingTitle(false);
    if (editTitle !== section.title && onSectionChange) {
      onSectionChange(section.id, editTitle, section.description || '', section.expectedSceneCount);
    }
  };

  const commitCount = () => {
    setIsEditingCount(false);
    const trimmed = editCount.trim();
    const parsed = trimmed === '' ? null : parseInt(trimmed, 10);
    const newCount = parsed !== null && isNaN(parsed) ? null : parsed;
    if (newCount !== section.expectedSceneCount && onSectionChange) {
      onSectionChange(section.id, section.title, section.description || '', newCount);
    }
  };

  const commitDesc = () => {
    setIsEditingDesc(false);
    if (editDesc !== section.description && onSectionChange) {
      onSectionChange(section.id, section.title, editDesc, section.expectedSceneCount);
    }
  };

  const descVisible = hideScenes || synopsisMode !== 'expand';

  return (
    <div className="pov-outline-section-header-area" data-section-id={section.id}>
      <div className="pov-outline-section-header">
        {dragHandleProps && (
          <span
            className="section-drag-handle"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...(dragHandleProps as any)}
            title="Drag to reorder section"
          >⋮⋮</span>
        )}
        <button
          className={`section-synopsis-chevron ${synopsisMode === 'expand' ? 'collapsed' : ''}`}
          onClick={() => !hideScenes && onToggleSynopsisMode(section.id)}
          title={synopsisMode === 'expand' ? 'Show synopses' : 'Hide synopses'}
          disabled={!!hideScenes}
        >{'▾'}</button>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            className="plot-point-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
              else if (e.key === 'Escape') { setEditTitle(section.title || 'New Section'); setIsEditingTitle(false); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="plot-point-title" onClick={() => setIsEditingTitle(true)}>
            {editTitle}
          </span>
        )}
        <span className="plot-point-count" onClick={() => setIsEditingCount(true)} title="Click to edit expected scene count">
          {isEditingCount ? (
            <input
              ref={countInputRef}
              type="number"
              min="0"
              className="plot-point-count-input"
              value={editCount}
              onChange={(e) => setEditCount(e.target.value)}
              onBlur={commitCount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitCount(); }
                else if (e.key === 'Escape') { setEditCount(section.expectedSceneCount?.toString() || ''); setIsEditingCount(false); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>({sceneCount}/{section.expectedSceneCount ?? '?'})</>
          )}
        </span>
        {onOpenDetails && (
          <button className="section-expand-btn" onClick={(e) => { e.stopPropagation(); onOpenDetails(section.id); }} title="Open section details">{'⊞'}</button>
        )}
        {onDeleteSection && (
          <button className="section-delete-btn" onClick={() => onDeleteSection(section.id)} title="Delete section">{'×'}</button>
        )}
      </div>
      {descVisible && (
        <div
          className={`section-description-area ${isEditingDesc ? 'editing' : ''} ${!editDesc && !isEditingDesc ? 'empty' : ''}`}
          onClick={() => { if (!isEditingDesc) setIsEditingDesc(true); }}
        >
          {isEditingDesc ? (
            <textarea
              ref={descRef}
              className="section-description-input"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              onBlur={commitDesc}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditDesc(section.description || ''); setIsEditingDesc(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              rows={3}
              placeholder="Section synopsis…"
            />
          ) : (
            <div className="section-description-text">
              {editDesc || <span className="section-description-placeholder">Add synopsis…</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
    synopsisModes,
    hideHeaders,
    hideScenes,
    onSetAside,
    onToggleSynopsisMode,
    onSceneChange,
    onPreview,
    onSectionChange,
    onDeleteSection,
    onOpenSectionDetails,
    getCharacterName,
    chapters,
    povReorderedScenes,
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

  // Flat in-section scene list in display order — used for sequential numbering
  const flatSectionScenes = useMemo(() => {
    const flat: Scene[] = [];
    for (const section of sortedSections) {
      flat.push(...(scenesBySection.get(section.id) ?? []));
    }
    return flat;
  }, [sortedSections, scenesBySection]);

  return (
    <div className="pov-outline-view" ref={scrollRef}>
      <ScrollAutoBinder scrollRef={scrollRef} />
      <div className="pov-outline-main">
        {/* Outer SortableContext — sections are the top-level sortable units */}
        <SortableContext items={sortedSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {sortedSections.map(section => {
            const sectionScenes = scenesBySection.get(section.id) ?? [];
            return (
              <SortableItem key={section.id} id={section.id} data={{ type: 'section' }}>
                {(sectionSortable) => (
                  <div
                    ref={sectionSortable.setNodeRef}
                    style={sectionSortable.style}
                    className={`pov-outline-section${sectionSortable.isDragging ? ' is-dragging' : ''}`}
                  >
                    {!hideHeaders && (
                      <SectionHeader
                        section={section}
                        sceneCount={sectionScenes.length}
                        synopsisMode={synopsisModes[section.id]}
                        hideScenes={hideScenes}
                        onToggleSynopsisMode={onToggleSynopsisMode}
                        onSectionChange={onSectionChange}
                        onDeleteSection={onDeleteSection}
                        onOpenDetails={onOpenSectionDetails}
                        dragHandleProps={{ ...sectionSortable.attributes, ...sectionSortable.listeners }}
                      />
                    )}
                    {/* Inner SortableContext — scenes within this section */}
                    {(() => {
                      const hasChapters = chapters && chapters.length > 0;
                      let sceneRenderContent: ReactElement;
                      let orderedSectionIds: string[];

                      if (hasChapters) {
                        const sortedChapters = [...(chapters || [])].sort((a, b) => a.order - b.order);

                        // Build chapter groups first so we know which chapterIds have scenes here
                        const chapterGroupsInSection = sortedChapters
                          .map(ch => ({
                            chapter: ch,
                            scenes: sectionScenes
                              .filter(s => s.chapterId === ch.id)
                              .sort((a, b) => a.sceneOrder - b.sceneOrder),
                          }))
                          .filter(g => g.scenes.length > 0);

                        // Unchaptered = no chapterId, invalid chapterId, OR chapter has no scenes in THIS section
                        const renderedChapterIds = new Set(chapterGroupsInSection.map(g => g.chapter.id));
                        const unchapteredInSection = sectionScenes.filter(
                          s => !s.chapterId || !renderedChapterIds.has(s.chapterId)
                        );

                        // Items in visual order so dnd-kit computes drop targets correctly
                        orderedSectionIds = [
                          ...unchapteredInSection.map(s => s.id),
                          ...chapterGroupsInSection.flatMap(g => g.scenes.map(s => s.id)),
                        ];

                        sceneRenderContent = (
                          <>
                            {unchapteredInSection.map(scene => (
                              <SortableItem key={scene.id} id={scene.id} data={{ type: 'scene', sectionId: section.id }}>
                                {(sceneSortable) => (
                                  <div ref={sceneSortable.setNodeRef} style={sceneSortable.style}
                                    className={`pov-outline-row-wrapper${sceneSortable.isOver ? ' is-over' : ''}${povReorderedScenes?.has(scene.id) ? ' pov-reordered' : ''}`}
                                    data-section-id={section.id} data-dnd-sortable-item>
                                    <span className="pov-drag-handle" {...sceneSortable.attributes} {...sceneSortable.listeners}>⋮⋮</span>
                                    <OutlineSceneRow
                                      scene={scene}
                                      displayNumber={flatSectionScenes.findIndex(s => s.id === scene.id) + 1}
                                      characterName={getCharacterName?.(scene.characterId)}
                                      synopsisVisible={synopsisModes[section.id] !== 'expand'}
                                      onSceneChange={onSceneChange}
                                      onSetAside={onSetAside}
                                      onPreview={onPreview}
                                      expandMode={synopsisModes[section.id] === 'expand'}
                                    />
                                  </div>
                                )}
                              </SortableItem>
                            ))}
                            {chapterGroupsInSection.map(({ chapter, scenes: chScenes }) => (
                              <div key={chapter.id} className="pov-chapter-group">
                                <div className="pov-chapter-header">
                                  <span className="pov-chapter-icon">📂</span>
                                  <span>{chapter.title}</span>
                                </div>
                                {chScenes.map(scene => (
                                  <SortableItem key={scene.id} id={scene.id} data={{ type: 'scene', sectionId: section.id }}>
                                    {(sceneSortable) => (
                                      <div ref={sceneSortable.setNodeRef} style={sceneSortable.style}
                                        className={`pov-outline-row-wrapper pov-chapter-scene${sceneSortable.isOver ? ' is-over' : ''}${povReorderedScenes?.has(scene.id) ? ' pov-reordered' : ''}`}
                                        data-section-id={section.id} data-dnd-sortable-item>
                                        <span className="pov-drag-handle" {...sceneSortable.attributes} {...sceneSortable.listeners}>⋮⋮</span>
                                        <OutlineSceneRow
                                          scene={scene}
                                          displayNumber={flatSectionScenes.findIndex(s => s.id === scene.id) + 1}
                                          characterName={getCharacterName?.(scene.characterId)}
                                          synopsisVisible={synopsisModes[section.id] !== 'expand'}
                                          onSceneChange={onSceneChange}
                                          onSetAside={onSetAside}
                                          onPreview={onPreview}
                                          expandMode={synopsisModes[section.id] === 'expand'}
                                        />
                                      </div>
                                    )}
                                  </SortableItem>
                                ))}
                              </div>
                            ))}
                            {sectionScenes.length === 0 && <EmptySectionDropZone sectionId={section.id} />}
                          </>
                        );
                      } else {
                        orderedSectionIds = sectionScenes.map(s => s.id);
                        sceneRenderContent = (
                          <>
                            {sectionScenes.map(scene => (
                              <SortableItem key={scene.id} id={scene.id} data={{ type: 'scene', sectionId: section.id }}>
                                {(sceneSortable) => (
                                  <div
                                    ref={sceneSortable.setNodeRef}
                                    style={sceneSortable.style}
                                    className={`pov-outline-row-wrapper${sceneSortable.isOver ? ' is-over' : ''}${povReorderedScenes?.has(scene.id) ? ' pov-reordered' : ''}`}
                                    data-section-id={section.id}
                                    data-dnd-sortable-item
                                  >
                                    <span
                                      className="pov-drag-handle"
                                      {...sceneSortable.attributes}
                                      {...sceneSortable.listeners}
                                    >⋮⋮</span>
                                    <OutlineSceneRow
                                      scene={scene}
                                      displayNumber={flatSectionScenes.findIndex(s => s.id === scene.id) + 1}
                                      characterName={getCharacterName?.(scene.characterId)}
                                      synopsisVisible={synopsisModes[section.id] !== 'expand'}
                                      onSceneChange={onSceneChange}
                                      onSetAside={onSetAside}
                                      onPreview={onPreview}
                                      expandMode={synopsisModes[section.id] === 'expand'}
                                    />
                                  </div>
                                )}
                              </SortableItem>
                            ))}
                            {sectionScenes.length === 0 && (
                              <EmptySectionDropZone sectionId={section.id} />
                            )}
                          </>
                        );
                      }

                      return (
                        <>
                          {!hideScenes && (
                            <SortableContext items={orderedSectionIds} strategy={verticalListSortingStrategy}>
                              {sceneRenderContent}
                            </SortableContext>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </SortableItem>
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}
