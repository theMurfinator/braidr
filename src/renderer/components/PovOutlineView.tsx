import { useRef, useMemo, useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PlotPoint, Scene } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';
import {
  SortableList,
  useAutoScrollContainer,
} from '../dnd';

interface PovOutlineViewProps {
  sections: PlotPoint[];
  scenes: Scene[];
  synopsisModes: Record<string, 'inline' | 'expand'>;
  hideHeaders: boolean;
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

interface SectionHeaderProps {
  section: PlotPoint;
  sceneCount: number;
  synopsisMode: 'inline' | 'expand' | undefined;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
}

function SectionHeader({
  section,
  sceneCount,
  synopsisMode,
  onToggleSynopsisMode,
  onSectionChange,
  onDeleteSection,
}: SectionHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCount, setIsEditingCount] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title || 'New Section');
  const [editCount, setEditCount] = useState<string>(section.expectedSceneCount?.toString() || '');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const countInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditTitle(section.title || 'New Section');
  }, [section.title]);

  useEffect(() => {
    setEditCount(section.expectedSceneCount?.toString() || '');
  }, [section.expectedSceneCount]);

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

  return (
    <div className="pov-outline-section-header" data-section-id={section.id}>
      <button
        className={`section-synopsis-chevron ${synopsisMode === 'expand' ? 'collapsed' : ''}`}
        onClick={() => onToggleSynopsisMode(section.id)}
        title={synopsisMode === 'expand' ? 'Show synopses' : 'Hide synopses'}
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
      {onDeleteSection && (
        <button className="section-delete-btn" onClick={() => onDeleteSection(section.id)} title="Delete section">{'×'}</button>
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
    onSetAside,
    onToggleSynopsisMode,
    onSceneChange,
    onOpenInEditor,
    onSectionChange,
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

  return (
    <div className="pov-outline-view" ref={scrollRef}>
      <ScrollAutoBinder scrollRef={scrollRef} />

        <div className="pov-outline-main">
          <SortableList items={flatSectionScenes}>
            {(scene, sortable) => {
              const sectionId = scene.plotPointId!;
              const sectionScenes = scenesBySection.get(sectionId) ?? [];
              const isFirstInSection = sectionScenes[0]?.id === scene.id;
              const section = sortedSections.find(s => s.id === sectionId);
              const sectionIdx = sortedSections.findIndex(s => s.id === sectionId);

              // Render empty sections that sit immediately before this section
              // (i.e. between the previous non-empty section and this one). Walk
              // backwards and stop at the first non-empty section so a single
              // empty section doesn't get re-emitted before every later section.
              const emptySectionsBefore: PlotPoint[] = [];
              if (isFirstInSection) {
                for (let i = sectionIdx - 1; i >= 0; i--) {
                  const earlierSection = sortedSections[i];
                  const earlierScenes = scenesBySection.get(earlierSection.id) ?? [];
                  if (earlierScenes.length === 0) {
                    emptySectionsBefore.unshift(earlierSection);
                  } else {
                    break;
                  }
                }
              }

              return (
                <>
                  {emptySectionsBefore.map((empty) => {
                    return (
                      <div key={`empty-${empty.id}`} className="pov-outline-section">
                        {!hideHeaders && (
                          <SectionHeader
                            section={empty}
                            sceneCount={0}
                            synopsisMode={synopsisModes[empty.id]}
                            onToggleSynopsisMode={onToggleSynopsisMode}
                            onSectionChange={onSectionChange}
                            onDeleteSection={onDeleteSection}
                          />
                        )}
                        <EmptySectionDropZone sectionId={empty.id} />
                      </div>
                    );
                  })}
                  {isFirstInSection && section && !hideHeaders && (
                    <SectionHeader
                      section={section}
                      sceneCount={sectionScenes.length}
                      synopsisMode={synopsisModes[section.id]}
                      onToggleSynopsisMode={onToggleSynopsisMode}
                      onSectionChange={onSectionChange}
                      onDeleteSection={onDeleteSection}
                    />
                  )}
                  <div
                    ref={sortable.setNodeRef}
                    style={sortable.style}
                    className={`pov-outline-row-wrapper ${sortable.isOver ? 'is-over' : ''}`}
                    data-section-id={sectionId}
                    data-dnd-sortable-item
                  >
                    {/* Drag handle only — keeps listeners off the text inputs */}
                    <span
                      className="pov-drag-handle"
                      {...sortable.attributes}
                      {...sortable.listeners}
                    >⋮⋮</span>
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
              return (
                <div key={`trailing-empty-${empty.id}`} className="pov-outline-section">
                  {!hideHeaders && (
                    <SectionHeader
                      section={empty}
                      sceneCount={0}
                      synopsisMode={synopsisModes[empty.id]}
                      onToggleSynopsisMode={onToggleSynopsisMode}
                      onSectionChange={onSectionChange}
                      onDeleteSection={onDeleteSection}
                    />
                  )}
                  <EmptySectionDropZone sectionId={empty.id} />
                </div>
              );
            });
          })()}
        </div>
    </div>
  );
}
