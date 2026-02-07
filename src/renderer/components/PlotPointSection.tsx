import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { PlotPoint, Scene, Tag, MetadataFieldDef } from '../../shared/types';
import SceneCard from './SceneCard';

interface PlotPointSectionProps {
  plotPoint: PlotPoint;
  scenes: Scene[];
  tags: Tag[];
  onSceneChange?: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange?: (sceneId: string, tags: string[]) => void;
  onCreateTag?: (name: string, category: 'people' | 'locations' | 'arcs' | 'things' | 'time') => void;
  onPlotPointChange?: (plotPointId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
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
  // Scene dragging props
  onSceneDragStart?: (scene: Scene) => void;
  onSceneDragEnd?: () => void;
  onSceneDrop?: (targetSceneNumber: number, targetPlotPointId: string) => void;
  draggedScene?: Scene | null;
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
}

function PlotPointSection({ plotPoint, scenes, tags, onSceneChange, onTagsChange, onCreateTag, onPlotPointChange, onAddScene, onDeleteScene, onDuplicateScene, onMoveUp, onMoveDown, isFirst, isLast, forceNotesExpanded, onSceneMoveUp, onSceneMoveDown, allCharacterScenes, onSceneDragStart, onSceneDragEnd, onSceneDrop, draggedScene, hideHeader, getConnectedScenes, onStartConnection, onRemoveConnection, isConnecting, onSceneClick, onWordCountChange, getConnectableScenes, onCompleteConnection, onOpenInEditor, metadataFieldDefs, sceneMetadata, onMetadataChange, onMetadataFieldDefsChange }: PlotPointSectionProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCount, setIsEditingCount] = useState(false);
  // Ensure title always has a fallback value
  const [editTitle, setEditTitle] = useState(plotPoint.title || 'New Section');
  const [editCount, setEditCount] = useState<string>(plotPoint.expectedSceneCount?.toString() || '');
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const countInputRef = useRef<HTMLInputElement>(null);
  const plotPointRef = useRef(plotPoint);
  const editTitleRef = useRef(editTitle);
  const onPlotPointChangeRef = useRef(onPlotPointChange);
  plotPointRef.current = plotPoint;
  editTitleRef.current = editTitle;
  onPlotPointChangeRef.current = onPlotPointChange;
  // Track the last mousedown target to know if drag started from handle
  const lastMouseDownTarget = useRef<EventTarget | null>(null);
  // Track drag handle elements for scenes
  const sceneHandleRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  // Track mousedown globally to know where drag started
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      lastMouseDownTarget.current = e.target;
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, []);

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
        placeholder: 'Click to add description...',
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
      onPlotPointChange(plotPoint.id, editTitle, descriptionEditor?.getText() || '', plotPoint.expectedSceneCount);
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
      onPlotPointChange(plotPoint.id, plotPoint.title, descriptionEditor?.getText() || '', isNaN(newCount as number) ? null : newCount);
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
      {/* Drop zone at top of section - for scenes dragged from other sections */}
      {draggedScene && !sortedScenes.some(s => s.id === draggedScene.id) && (
        <div
          className={`scene-drop-zone scene-drop-zone-top ${dropTargetIndex === -1 ? 'active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDropTargetIndex(-1);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropTargetIndex(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTargetIndex(null);
            // Drop at the beginning of this section (before scene 1)
            const firstScene = sortedScenes[0];
            onSceneDrop?.(firstScene?.sceneNumber ?? 1, plotPoint.id);
          }}
        >
          {dropTargetIndex === -1 && <span className="drop-indicator">Drop here</span>}
        </div>
      )}
      <div
        className={`plot-point ${draggedScene ? 'scene-dragging' : ''}`}
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
          </div>
        )}

      {!hideHeader && (
        <div className="plot-point-description">
          <EditorContent editor={descriptionEditor} className="description-editor" />
        </div>
      )}

      {sortedScenes.map((scene, index) => (
        <div key={scene.id} className="pov-scene-wrapper" data-scene-id={scene.id}>
          {/* Drop zone before this scene */}
          {draggedScene && draggedScene.id !== scene.id && (
            <div
              className={`scene-drop-zone ${dropTargetIndex === index ? 'active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setDropTargetIndex(index);
              }}
              onDragLeave={(e) => {
                // Only clear if we're leaving the drop zone entirely
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTargetIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTargetIndex(null);
                onSceneDrop?.(scene.sceneNumber, plotPoint.id);
              }}
            >
              {dropTargetIndex === index && <span className="drop-indicator">Drop here</span>}
            </div>
          )}
          <div
            className={`pov-scene-item ${draggedScene?.id === scene.id ? 'dragging' : ''} ${isConnecting ? 'connect-target' : ''}`}
            draggable={!!onSceneDragStart}
            onDragStart={(e) => {
              if (!onSceneDragStart) return;

              // Check if drag started from the scene's drag handle
              const target = (lastMouseDownTarget.current || e.target) as Element;

              // Allow drag only if it started on or within the drag handle
              if (target?.closest?.('.scene-drag-handle')) {
                e.stopPropagation();
                onSceneDragStart(scene);
              } else {
                // Prevent accidental drags from other parts of the scene card
                e.preventDefault();
              }
            }}
            onDragEnd={() => {
              onSceneDragEnd?.();
              setDropTargetIndex(null);
              // Reset mousedown tracking to ensure next drag works
              lastMouseDownTarget.current = null;
            }}
            onDragOver={(e) => {
              // Allow dropping on scene cards - will insert after this scene
              if (draggedScene && draggedScene.id !== scene.id) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setDropTargetIndex(index + 0.5); // Use .5 to indicate "after this scene"
              }
            }}
            onDragLeave={(e) => {
              if (draggedScene && !e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropTargetIndex(null);
              }
            }}
            onDrop={(e) => {
              if (draggedScene && draggedScene.id !== scene.id) {
                e.preventDefault();
                e.stopPropagation();
                setDropTargetIndex(null);
                // Drop after this scene
                onSceneDrop?.(scene.sceneNumber + 1, plotPoint.id);
              }
            }}
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
              showDragHandle={!!onSceneDragStart}
              dragHandleRef={(el) => {
                if (el) {
                  sceneHandleRefs.current.set(scene.id, el);
                } else {
                  sceneHandleRefs.current.delete(scene.id);
                }
              }}
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
              sceneMetadata={sceneMetadata?.[`${scene.characterId}:${scene.sceneNumber}`]}
              onMetadataChange={onMetadataChange}
              onMetadataFieldDefsChange={onMetadataFieldDefsChange}
            />
          </div>
        </div>
      ))}
      {/* Drop zone at the end */}
      {draggedScene && sortedScenes.length > 0 && !sortedScenes.some(s => s.id === draggedScene.id) && (
        <div
          className={`scene-drop-zone scene-drop-zone-end ${dropTargetIndex === sortedScenes.length ? 'active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDropTargetIndex(sortedScenes.length);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropTargetIndex(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTargetIndex(null);
            const lastScene = sortedScenes[sortedScenes.length - 1];
            onSceneDrop?.(lastScene.sceneNumber + 1, plotPoint.id);
          }}
        >
          {dropTargetIndex === sortedScenes.length && <span className="drop-indicator">Drop here</span>}
        </div>
      )}
      {/* Drop zone for empty sections (when dragging from another section) */}
      {draggedScene && sortedScenes.length === 0 && (
        <div
          className={`scene-drop-zone scene-drop-zone-empty ${dropTargetIndex === 0 ? 'active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDropTargetIndex(0);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropTargetIndex(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTargetIndex(null);
            // For empty sections, use scene number 1
            onSceneDrop?.(1, plotPoint.id);
          }}
        >
          <span className="drop-indicator">Drop scene here</span>
        </div>
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
