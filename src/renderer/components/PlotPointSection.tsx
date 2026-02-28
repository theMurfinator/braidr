import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { PlotPoint, Scene, Tag, MetadataFieldDef } from '../../shared/types';
import SceneCard from './SceneCard';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

function SortablePovScene({
  id,
  children,
}: {
  id: string;
  children: (listeners: Record<string, unknown>) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="pov-scene-wrapper" data-scene-id={id} {...attributes}>
      {children(listeners || {})}
    </div>
  );
}

function EmptySectionDropZone({ plotPointId }: { plotPointId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `empty-section:${plotPointId}` });
  return (
    <div
      ref={setNodeRef}
      className={`scene-drop-zone scene-drop-zone-empty ${isOver ? 'active' : ''}`}
    >
      <span className="drop-indicator">Drop scene here</span>
    </div>
  );
}

interface PlotPointSectionProps {
  plotPoint: PlotPoint;
  scenes: Scene[];
  tags: Tag[];
  onSceneChange?: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange?: (sceneId: string, tags: string[]) => void;
  onCreateTag?: (name: string, category: 'people' | 'locations' | 'arcs' | 'things' | 'time') => void;
  onPlotPointChange?: (plotPointId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeletePlotPoint?: (plotPointId: string) => void;
  onAddScene?: (plotPointId: string, afterSceneNumber?: number) => void;
  onDeleteScene?: (sceneId: string) => void;
  onDuplicateScene?: (sceneId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  forceNotesExpanded?: boolean | null;
  // Scene movement props (for arrow buttons)
  onSceneMoveUp?: (sceneId: string) => void;
  onSceneMoveDown?: (sceneId: string) => void;
  allCharacterScenes?: Scene[]; // All scenes for the character to determine global boundaries
  // Scene dragging props (dnd-kit)
  activeDragSceneId?: string | null;
  hideHeader?: boolean;
  // Connection props
  getConnectedScenes?: (sceneId: string) => { id: string; label: string }[];
  onStartConnection?: (sceneId: string) => void;
  onRemoveConnection?: (sceneId: string, targetId: string) => void;
  isConnecting?: boolean;
  onSceneClick?: (sceneId: string) => void;
  onWordCountChange?: (sceneId: string, wordCount: number | undefined) => void;
  getConnectableScenes?: (sceneId: string) => { id: string; label: string }[];
  onCompleteConnection?: (sourceId: string, targetId: string) => void;
  onOpenInEditor?: (sceneKey: string) => void;
  // Metadata props
  metadataFieldDefs?: MetadataFieldDef[];
  sceneMetadata?: Record<string, Record<string, string | string[]>>;
  onMetadataChange?: (sceneId: string, fieldId: string, value: string | string[]) => void;
  onMetadataFieldDefsChange?: (defs: MetadataFieldDef[]) => void;
  // Inline metadata display
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
  // Timeline date
  timelineDates?: Record<string, string>;
  onDateChange?: (sceneId: string, date: string | undefined) => void;
}

function PlotPointSection({ plotPoint, scenes, tags, onSceneChange, onTagsChange, onCreateTag, onPlotPointChange, onDeletePlotPoint, onAddScene, onDeleteScene, onDuplicateScene, onMoveUp, onMoveDown, isFirst, isLast, forceNotesExpanded, onSceneMoveUp, onSceneMoveDown, allCharacterScenes, activeDragSceneId, hideHeader, getConnectedScenes, onStartConnection, onRemoveConnection, isConnecting, onSceneClick, onWordCountChange, getConnectableScenes, onCompleteConnection, onOpenInEditor, metadataFieldDefs, sceneMetadata, onMetadataChange, onMetadataFieldDefsChange, inlineMetadataFields, showInlineLabels, timelineDates, onDateChange }: PlotPointSectionProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCount, setIsEditingCount] = useState(false);
  // Ensure title always has a fallback value
  const [editTitle, setEditTitle] = useState(plotPoint.title || 'New Section');
  const [editCount, setEditCount] = useState<string>(plotPoint.expectedSceneCount?.toString() || '');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const countInputRef = useRef<HTMLInputElement>(null);
  const plotPointRef = useRef(plotPoint);
  const editTitleRef = useRef(editTitle);
  const onPlotPointChangeRef = useRef(onPlotPointChange);
  plotPointRef.current = plotPoint;
  editTitleRef.current = editTitle;
  onPlotPointChangeRef.current = onPlotPointChange;

  const sortedScenes = [...scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);

  // TipTap editor for description
  const descriptionEditor = useEditor({
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
    },
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '',
      }),
    ],
    content: plotPoint.description ? `<p>${plotPoint.description.replace(/\n/g, '</p><p>')}</p>` : '',
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const current = plotPointRef.current;
      if (text !== current.description && onPlotPointChangeRef.current) {
        onPlotPointChangeRef.current(current.id, editTitleRef.current, text);
      }
    },
  });

  useEffect(() => {
    setEditTitle(plotPoint.title || 'New Section');
  }, [plotPoint.title]);

  useEffect(() => {
    setEditCount(plotPoint.expectedSceneCount?.toString() || '');
  }, [plotPoint.expectedSceneCount]);

  useEffect(() => {
    if (descriptionEditor && !descriptionEditor.isFocused) {
      const newContent = plotPoint.description ? `<p>${plotPoint.description.replace(/\n/g, '</p><p>')}</p>` : '';
      if (descriptionEditor.getHTML() !== newContent) {
        descriptionEditor.commands.setContent(newContent);
      }
    }
  }, [plotPoint.description, descriptionEditor]);

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

  const handleTitleClick = () => {
    setIsEditingTitle(true);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (editTitle !== plotPoint.title && onPlotPointChange) {
      onPlotPointChange(plotPoint.id, editTitle, plotPoint.description || '', plotPoint.expectedSceneCount);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setEditTitle(plotPoint.title);
      setIsEditingTitle(false);
    }
  };

  const handleCountClick = () => {
    setIsEditingCount(true);
  };

  const handleCountBlur = () => {
    setIsEditingCount(false);
    const newCount = editCount.trim() === '' ? null : parseInt(editCount, 10);
    if (newCount !== plotPoint.expectedSceneCount && onPlotPointChange) {
      onPlotPointChange(plotPoint.id, plotPoint.title, plotPoint.description || '', isNaN(newCount as number) ? null : newCount);
    }
  };

  const handleCountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCountBlur();
    } else if (e.key === 'Escape') {
      setEditCount(plotPoint.expectedSceneCount?.toString() || '');
      setIsEditingCount(false);
    }
  };

  return (
    <>
      <div
        className={`plot-point ${activeDragSceneId ? 'scene-dragging' : ''}`}
        data-plotpoint-id={plotPoint.id}
      >
        {!hideHeader && (
          <div className="plot-point-header">
            {(onMoveUp || onMoveDown) && (
              <div className="section-reorder-buttons">
                <button
                  className="section-move-btn"
                  onClick={onMoveUp}
                  disabled={isFirst}
                  title="Move section up"
                >
                  ▲
                </button>
                <button
                  className="section-move-btn"
                  onClick={onMoveDown}
                  disabled={isLast}
                  title="Move section down"
                >
                  ▼
                </button>
              </div>
            )}
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="plot-point-title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="plot-point-title" onClick={handleTitleClick}>
                {editTitle}
              </span>
            )}
            <span className="plot-point-count" onClick={handleCountClick} title="Click to edit expected scene count">
              {isEditingCount ? (
                <input
                  ref={countInputRef}
                  type="number"
                  min="0"
                  className="plot-point-count-input"
                  value={editCount}
                  onChange={(e) => setEditCount(e.target.value)}
                  onBlur={handleCountBlur}
                  onKeyDown={handleCountKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>({sortedScenes.length}/{plotPoint.expectedSceneCount ?? '?'})</>
              )}
            </span>
            {onDeletePlotPoint && (
              <button
                className="section-delete-btn"
                onClick={() => onDeletePlotPoint(plotPoint.id)}
                title="Delete section (scenes will be kept)"
              >
                ×
              </button>
            )}
          </div>
        )}

      {!hideHeader && (
        <div className="plot-point-description">
          <EditorContent editor={descriptionEditor} className="description-editor" />
        </div>
      )}

      {sortedScenes.map((scene, index) => (
        <SortablePovScene key={scene.id} id={scene.id}>
          {(listeners) => (
            <div
              className={`pov-scene-item ${activeDragSceneId === scene.id ? 'dragging' : ''} ${isConnecting ? 'connect-target' : ''}`}
              onClick={() => {
                if (isConnecting && onSceneClick) {
                  onSceneClick(scene.id);
                }
              }}
            >
              <SceneCard
                scene={scene}
                tags={tags}
                showCharacter={false}
                onSceneChange={onSceneChange}
                onTagsChange={onTagsChange}
                onCreateTag={onCreateTag}
                onDeleteScene={onDeleteScene}
                onDuplicateScene={onDuplicateScene}
                forceNotesExpanded={forceNotesExpanded}
                showDragHandle={true}
                dragHandleListeners={listeners}
                onMoveUp={onSceneMoveUp ? () => onSceneMoveUp(scene.id) : undefined}
                onMoveDown={onSceneMoveDown ? () => onSceneMoveDown(scene.id) : undefined}
                canMoveUp={(() => {
                  if (!allCharacterScenes) return index > 0;
                  const globalSorted = [...allCharacterScenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
                  const globalIndex = globalSorted.findIndex(s => s.id === scene.id);
                  return globalIndex > 0;
                })()}
                canMoveDown={(() => {
                  if (!allCharacterScenes) return index < sortedScenes.length - 1;
                  const globalSorted = [...allCharacterScenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
                  const globalIndex = globalSorted.findIndex(s => s.id === scene.id);
                  return globalIndex < globalSorted.length - 1;
                })()}
                connectedScenes={getConnectedScenes?.(scene.id)}
                onStartConnection={onStartConnection ? () => onStartConnection(scene.id) : undefined}
                onRemoveConnection={onRemoveConnection ? (targetId) => onRemoveConnection(scene.id, targetId) : undefined}
                onWordCountChange={onWordCountChange}
                connectableScenes={getConnectableScenes?.(scene.id)}
                onCompleteConnection={onCompleteConnection ? (targetId) => onCompleteConnection(scene.id, targetId) : undefined}
                onOpenInEditor={onOpenInEditor}
                metadataFieldDefs={metadataFieldDefs}
                sceneMetadata={sceneMetadata?.[scene.id]}
                onMetadataChange={onMetadataChange}
                onMetadataFieldDefsChange={onMetadataFieldDefsChange}
                inlineMetadataFields={inlineMetadataFields}
                showInlineLabels={showInlineLabels}
                sceneDate={timelineDates?.[scene.id]}
                onDateChange={onDateChange}
              />
            </div>
          )}
        </SortablePovScene>
      ))}
      {/* Droppable zone for empty sections */}
      {sortedScenes.length === 0 && (
        <EmptySectionDropZone plotPointId={plotPoint.id} />
      )}

      {onAddScene && (
        <button className="add-scene-btn" onClick={() => {
          const lastScene = sortedScenes[sortedScenes.length - 1];
          onAddScene(plotPoint.id, lastScene?.sceneNumber);
        }}>
          + Add Scene
        </button>
      )}
      </div>
    </>
  );
}

export default PlotPointSection;
