import React, { useState, useRef, useLayoutEffect } from 'react';
import { Scene, Character, Tag, TagCategory, PlotPoint } from '../../shared/types';
import RailsSceneCard from './RailsSceneCard';
import FloatingEditor from './FloatingEditor';
import { useAutoScrollOnDrag } from '../hooks/useAutoScrollOnDrag';

interface RailsViewProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  connections: Record<string, string[]>;
  showConnections: boolean;
  showPovColors: boolean;
  tags: Tag[];
  getCharacterName: (characterId: string) => string;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange: (sceneId: string, newTags: string[]) => void;
  onCreateTag: (name: string, category: TagCategory) => void;
  onWordCountChange: (sceneId: string, wordCount: number | undefined) => void;
  isConnecting: boolean;
  connectionSource: string | null;
  onStartConnection: (sceneId: string) => void;
  onCompleteConnection: (targetId: string) => void;
  onCancelConnection: () => void;
  onRemoveConnection: (sourceId: string, targetId: string) => void;
  getConnectedScenes: (sceneId: string) => { id: string; label: string }[];
  unbraidedScenesByCharacter: Map<string, Map<string, Scene[]>>;
  allCharacters: Character[];
  plotPoints: PlotPoint[];
  onDragStart: (e: React.DragEvent, scene: Scene) => void;
  onDragEnd: () => void;
  onDropOnTimeline: (e: React.DragEvent, targetIndex: number) => void;
  onDropOnInbox: (e: React.DragEvent) => void;
  onRailReorder: (fromIndex: number, toIndex: number) => void;
  draftContent: Record<string, string>;
  onDraftChange: (sceneKey: string, html: string) => void;
  onOpenInEditor?: (sceneKey: string) => void;
  povReorderedScenes?: Set<string>;
  onInsertSceneAtPosition?: (position: number, characterId: string, plotPointId: string) => void;
}

export default function RailsView({
  scenes,
  characters,
  characterColors,
  connections,
  showConnections,
  showPovColors,
  tags,
  getCharacterName,
  onSceneChange,
  onTagsChange,
  onCreateTag,
  onWordCountChange,
  isConnecting,
  connectionSource,
  onStartConnection,
  onCompleteConnection,
  onCancelConnection,
  onRemoveConnection,
  getConnectedScenes,
  unbraidedScenesByCharacter,
  allCharacters,
  plotPoints,
  onDragStart,
  onDragEnd,
  onDropOnTimeline,
  onDropOnInbox,
  onRailReorder,
  draftContent,
  onDraftChange,
  onOpenInEditor,
  povReorderedScenes,
  onInsertSceneAtPosition,
}: RailsViewProps) {
  const [inboxCharFilter, setInboxCharFilter] = useState<string>('all');
  const [floatingEditorScene, setFloatingEditorScene] = useState<Scene | null>(null);
  const [scenePositions, setScenePositions] = useState<Record<string, { left: number; right: number; y: number }>>({});
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  const [draggedRailIndex, setDraggedRailIndex] = useState<number | null>(null);
  const [railDropTarget, setRailDropTarget] = useState<number | null>(null);
  const [insertAtPosition, setInsertAtPosition] = useState<number | null>(null);
  const [insertCharacterId, setInsertCharacterId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number>(0);
  useAutoScrollOnDrag(scrollRef, !!draggedSceneId);

  // Get hex color for a character
  const getCharacterHexColor = (characterId: string): string => {
    if (characterColors[characterId]) {
      return characterColors[characterId];
    }
    // Default colors
    const defaultColors = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#f59e0b'];
    const index = allCharacters.findIndex(c => c.id === characterId);
    return defaultColors[index % defaultColors.length];
  };

  // Get background color with low opacity
  const getCharacterBgColor = (characterId: string): string => {
    const hex = getCharacterHexColor(characterId).replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.08)`;
  };

  // Measure scene positions for connection lines
  useLayoutEffect(() => {
    if (!gridRef.current || !showConnections) return;

    const measurePositions = () => {
      const container = gridRef.current;
      if (!container) return;

      const positions: Record<string, { left: number; right: number; y: number }> = {};
      const cards = container.querySelectorAll('.rails-scene-card');
      const containerRect = container.getBoundingClientRect();

      cards.forEach((card) => {
        const sceneId = card.getAttribute('data-scene-id');
        if (sceneId) {
          const rect = card.getBoundingClientRect();
          positions[sceneId] = {
            left: rect.left - containerRect.left,
            right: rect.right - containerRect.left,
            y: rect.top - containerRect.top + rect.height / 2,
          };
        }
      });

      setScenePositions(positions);
    };

    // Initial measurement
    measurePositions();

    // Re-measure on window resize
    window.addEventListener('resize', measurePositions);

    // Re-measure on scroll within the rails-main container
    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', measurePositions);
    }

    return () => {
      window.removeEventListener('resize', measurePositions);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', measurePositions);
      }
    };
  }, [scenes, showConnections, characters]);

  // Restore scroll position after floating editor opens/closes
  useLayoutEffect(() => {
    if (floatingEditorScene && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [floatingEditorScene]);

  const handleSceneClick = (scene: Scene, e: React.MouseEvent) => {
    // If in connection mode, complete the connection
    if (isConnecting && connectionSource && connectionSource !== scene.id) {
      onCompleteConnection(scene.id);
      return;
    }

    // Save scroll position before opening editor
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    setFloatingEditorScene(scene);
  };

  const wrappedDragStart = (e: React.DragEvent, scene: Scene) => {
    setDraggedSceneId(scene.id);

    // Create a compact drag image from the scene card
    const card = (e.target as HTMLElement).closest('.rails-scene-card') as HTMLElement;
    if (card) {
      const clone = card.cloneNode(true) as HTMLElement;
      clone.style.width = `${card.offsetWidth}px`;
      clone.style.height = 'auto';
      clone.style.maxHeight = '40px';
      clone.style.overflow = 'hidden';
      clone.style.opacity = '0.9';
      clone.style.transform = 'scale(0.95)';
      clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      clone.style.background = 'var(--bg-primary, #fff)';
      clone.style.borderRadius = '4px';
      clone.style.padding = '6px 10px';
      clone.style.position = 'absolute';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, card.offsetWidth / 2, 20);
      requestAnimationFrame(() => document.body.removeChild(clone));
    }

    onDragStart(e, scene);
  };

  const wrappedDragEnd = () => {
    setDraggedSceneId(null);
    setDropTargetIndex(null);
    onDragEnd();
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the drop zone entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTargetIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetIndex(null);
    setDraggedSceneId(null);
    onDropOnTimeline(e, index);
  };

  const handleInboxDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Build grid data: each row has position and a map of characterId -> scene or null
  const gridRows = scenes.map((scene, index) => {
    const row: { position: number; scene: Scene; characterId: string } = {
      position: index + 1,
      scene,
      characterId: scene.characterId,
    };
    return row;
  });

  const numColumns = characters.length;

  // Pre-compute connector data: for each character, which row indices have their scenes
  // Then for each cell we can determine if it needs a connector line above/below
  const charSceneRows = new Map<string, number[]>();
  gridRows.forEach((row, index) => {
    const existing = charSceneRows.get(row.characterId) || [];
    existing.push(index);
    charSceneRows.set(row.characterId, existing);
  });

  // Pre-compute word gap between each pair of consecutive scenes for a character
  // Key: "charId:rowIndex" for connector-through cells → total words of other characters' scenes in the gap
  const gapWordCounts = new Map<string, number>();
  charSceneRows.forEach((rows, charId) => {
    for (let i = 0; i < rows.length - 1; i++) {
      const fromRow = rows[i];
      const toRow = rows[i + 1];
      let wordSum = 0;
      for (let r = fromRow + 1; r < toRow; r++) {
        const rowScene = gridRows[r];
        if (rowScene && rowScene.characterId !== charId) {
          wordSum += rowScene.scene.wordCount || 0;
        }
      }
      if (wordSum > 0) {
        // Store on the midpoint row of the gap
        const midRow = Math.floor((fromRow + toRow) / 2);
        gapWordCounts.set(`${charId}:${midRow}`, wordSum);
      }
    }
  });

  const formatWordGap = (words: number): string => {
    if (words >= 1000) {
      const k = words / 1000;
      return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
    }
    return String(words);
  };

  // For a given row index and character, determine connector state
  const getCellConnector = (rowIndex: number, characterId: string): 'above' | 'below' | 'both' | 'through' | null => {
    const rows = charSceneRows.get(characterId);
    if (!rows || rows.length < 2) return null;

    const isScene = gridRows[rowIndex]?.characterId === characterId;
    const posInList = rows.indexOf(rowIndex);

    if (isScene) {
      const hasAbove = posInList > 0;
      const hasBelow = posInList < rows.length - 1;
      if (hasAbove && hasBelow) return 'both';
      if (hasAbove) return 'above';
      if (hasBelow) return 'below';
      return null;
    } else {
      // Empty cell — check if this row is between two of this character's scenes
      const firstScene = rows[0];
      const lastScene = rows[rows.length - 1];
      if (rowIndex > firstScene && rowIndex < lastScene) return 'through';
      return null;
    }
  };

  // Calculate row heights based on word counts
  const minRowHeight = 44; // Minimum row height in pixels (scenes under 100 words)
  const maxRowHeight = 180; // Maximum row height in pixels (scenes 2000+ words)
  const baseWordCount = 100; // Word count that maps to min height
  const maxWordCount = 2000; // Word count that maps to max height

  const getRowHeight = (wordCount: number | undefined): number => {
    if (!wordCount || wordCount <= baseWordCount) return minRowHeight;
    if (wordCount >= maxWordCount) return maxRowHeight;
    // Linear scaling between base and max
    const ratio = (wordCount - baseWordCount) / (maxWordCount - baseWordCount);
    return minRowHeight + ratio * (maxRowHeight - minRowHeight);
  };

  return (
    <div className={`rails-view ${isConnecting ? 'is-connecting' : ''}`}>
      <div className="rails-main" ref={scrollRef}>
        {/* Connection Mode Banner */}
        {isConnecting && (
          <div className="connecting-banner">
            Click another scene to connect, or <button onClick={onCancelConnection}>cancel</button>
          </div>
        )}
        {/* Rails Header */}
        <div
          className="rails-header"
          style={{ '--rails-columns': numColumns } as React.CSSProperties}
        >
          <div className="rails-header-cell rails-row-number-header">#</div>
          {characters.map((char, index) => (
            <div
              key={char.id}
              className={`rails-header-cell draggable ${draggedRailIndex === index ? 'dragging' : ''} ${railDropTarget === index ? 'drop-target' : ''}`}
              style={{
                backgroundColor: showPovColors ? getCharacterBgColor(char.id) : undefined,
                borderBottom: `3px solid ${getCharacterHexColor(char.id)}`,
              }}
              draggable
              onDragStart={(e) => {
                setDraggedRailIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `rail-${index}`);
              }}
              onDragEnd={() => {
                setDraggedRailIndex(null);
                setRailDropTarget(null);
              }}
              onDragOver={(e) => {
                if (draggedRailIndex !== null && draggedRailIndex !== index) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setRailDropTarget(index);
                }
              }}
              onDragLeave={() => {
                setRailDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedRailIndex !== null && draggedRailIndex !== index) {
                  onRailReorder(draggedRailIndex, index);
                }
                setDraggedRailIndex(null);
                setRailDropTarget(null);
              }}
            >
              {char.name}
            </div>
          ))}
        </div>

        {/* Rails Grid */}
        <div
          className="rails-grid"
          ref={gridRef}
        >
          {/* Connection Lines SVG */}
          {showConnections && (
            <svg className="rails-connection-svg">
              {scenes.map((scene, index) => {
                const sceneConns = connections[scene.id] || [];
                const startPos = scenePositions[scene.id];
                if (!startPos) return null;

                const sourceCharIndex = characters.findIndex(c => c.id === scene.characterId);

                return sceneConns.map(connId => {
                  const targetScene = scenes.find(s => s.id === connId);
                  const targetIndex = scenes.findIndex(s => s.id === connId);
                  if (targetIndex === -1 || targetIndex <= index || !targetScene) return null;

                  const endPos = scenePositions[connId];
                  if (!endPos) return null;

                  const targetCharIndex = characters.findIndex(c => c.id === targetScene.characterId);
                  const sourceColor = getCharacterHexColor(scene.characterId);
                  const isHighlighted = scene.id === hoveredSceneId || connId === hoveredSceneId;

                  // Determine which edges to connect based on relative positions
                  let startX: number, endX: number;

                  if (sourceCharIndex < targetCharIndex) {
                    // Source is left of target - connect right edge to left edge
                    startX = startPos.right;
                    endX = endPos.left;
                  } else if (sourceCharIndex > targetCharIndex) {
                    // Source is right of target - connect left edge to right edge
                    startX = startPos.left;
                    endX = endPos.right;
                  } else {
                    // Same column - connect right edges and curve out
                    startX = startPos.right;
                    endX = endPos.right;
                  }

                  // Calculate control points for bezier curve
                  const horizontalDist = Math.abs(endX - startX);
                  const verticalDist = Math.abs(endPos.y - startPos.y);
                  const curveOffset = Math.max(40, Math.min(horizontalDist * 0.4, 100));

                  let path: string;
                  if (sourceCharIndex === targetCharIndex) {
                    // Same column - curve out to the right and back
                    const outX = startX + curveOffset;
                    path = `M ${startX} ${startPos.y}
                            C ${outX} ${startPos.y},
                              ${outX} ${endPos.y},
                              ${endX} ${endPos.y}`;
                  } else {
                    // Different columns - S-curve between them
                    const midY = (startPos.y + endPos.y) / 2;
                    path = `M ${startX} ${startPos.y}
                            C ${startX + (endX > startX ? curveOffset : -curveOffset)} ${startPos.y},
                              ${endX + (endX > startX ? -curveOffset : curveOffset)} ${endPos.y},
                              ${endX} ${endPos.y}`;
                  }

                  return (
                    <path
                      key={`${scene.id}-${connId}`}
                      d={path}
                      className={`rails-connection-line ${isHighlighted ? 'highlighted' : ''}`}
                      stroke={sourceColor}
                    />
                  );
                });
              })}
            </svg>
          )}

          {/* Empty state drop zone */}
          {scenes.length === 0 && (
            <div
              className={`rails-empty-drop ${dropTargetIndex === 0 ? 'active' : ''}`}
              onDragOver={(e) => handleDragOver(e, 0)}
              onDrop={(e) => handleDrop(e, 0)}
            >
              Drag scenes here to start braiding
            </div>
          )}

          {/* Grid rows */}
          <div
            className={`rails-grid-inner ${draggedSceneId ? 'is-dragging' : ''}`}
            style={{ '--rails-columns': numColumns } as React.CSSProperties}
          >
            {gridRows.map((row, index) => {
              const charIndex = characters.findIndex(c => c.id === row.characterId);
              const rowHeight = getRowHeight(row.scene.wordCount);

              return (
                <div
                  key={row.scene.id}
                  className="rails-row"
                  style={{ '--row-height': `${rowHeight}px` } as React.CSSProperties}
                >
                  {/* Drop zone before this row */}
                  <div
                    className={`rails-drop-zone ${dropTargetIndex === index ? 'active' : ''}`}
                    style={{ gridColumn: `1 / -1` }}
                    data-drop-index={index}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                  />

                  {/* Row number — click to insert scene at this position */}
                  <div
                    className={`rails-row-number ${onInsertSceneAtPosition ? 'clickable' : ''} ${insertAtPosition === index ? 'active' : ''}`}
                    onClick={onInsertSceneAtPosition ? () => {
                      setInsertAtPosition(insertAtPosition === index ? null : index);
                      setInsertCharacterId(null);
                    } : undefined}
                    title={onInsertSceneAtPosition ? 'Insert scene here' : undefined}
                  >
                    {row.position}
                    {insertAtPosition === index && (
                      <div className="braided-insert-popover rails-number-popover">
                        {!insertCharacterId ? (
                          <>
                            <div className="braided-insert-popover-title">Pick a character</div>
                            {allCharacters.map(char => (
                              <button
                                key={char.id}
                                className="braided-insert-popover-item"
                                onClick={(e) => { e.stopPropagation(); setInsertCharacterId(char.id); }}
                              >
                                <span className="braided-insert-color-dot" style={{ background: characterColors[char.id] || '#888' }} />
                                {char.name}
                              </button>
                            ))}
                          </>
                        ) : (
                          <>
                            <div className="braided-insert-popover-title">
                              <button className="braided-insert-back-btn" onClick={(e) => { e.stopPropagation(); setInsertCharacterId(null); }}>&larr;</button>
                              Pick a section
                            </div>
                            {plotPoints
                              .filter(p => p.characterId === insertCharacterId)
                              .sort((a, b) => a.order - b.order)
                              .map(pp => (
                                <button
                                  key={pp.id}
                                  className="braided-insert-popover-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onInsertSceneAtPosition!(index, insertCharacterId!, pp.id);
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

                  {/* Cells for each character */}
                  {characters.map((char, cellIndex) => {
                    const connector = getCellConnector(index, char.id);
                    return (
                    <div
                      key={char.id}
                      className={`rails-cell ${char.id === row.characterId ? 'has-scene' : 'empty'} ${connector ? `connector-${connector}` : ''}`}
                      style={{
                        backgroundColor: showPovColors && char.id === row.characterId
                          ? getCharacterBgColor(char.id)
                          : undefined,
                        '--connector-color': connector ? getCharacterHexColor(char.id) : undefined,
                      } as React.CSSProperties}
                    >
                      {connector === 'through' && gapWordCounts.has(`${char.id}:${index}`) && (
                        <span className="rails-gap-words">{formatWordGap(gapWordCounts.get(`${char.id}:${index}`)!)}</span>
                      )}
                      {char.id === row.characterId && (
                        <RailsSceneCard
                          scene={row.scene}
                          characterColor={getCharacterHexColor(row.characterId)}
                          onClick={(e) => handleSceneClick(row.scene, e)}
                          onMouseEnter={() => setHoveredSceneId(row.scene.id)}
                          onMouseLeave={() => setHoveredSceneId(null)}
                          isHighlighted={hoveredSceneId === row.scene.id ||
                            (connections[row.scene.id] || []).includes(hoveredSceneId || '')}
                          hasConnections={(connections[row.scene.id]?.length || 0) > 0}
                          isConnecting={isConnecting}
                          isConnectionSource={connectionSource === row.scene.id}
                          isConnectionTarget={isConnecting && connectionSource !== row.scene.id}
                          onDragStart={(e) => wrappedDragStart(e, row.scene)}
                          onDragEnd={wrappedDragEnd}
                          isDragging={draggedSceneId === row.scene.id}
                          isPovReordered={povReorderedScenes?.has(row.scene.id) || false}
                        />
                      )}
                    </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Drop zone at the end */}
            {scenes.length > 0 && (
              <div
                className={`rails-drop-zone rails-drop-zone-end ${dropTargetIndex === scenes.length ? 'active' : ''}`}
                style={{ gridColumn: `1 / -1` }}
                data-drop-index={scenes.length}
                onDragOver={(e) => handleDragOver(e, scenes.length)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, scenes.length)}
              />
            )}

            {/* Add scene at end — clickable "+" row number */}
            {scenes.length > 0 && onInsertSceneAtPosition && (
              <div className="rails-row rails-add-row">
                <div
                  className={`rails-row-number clickable ${insertAtPosition === scenes.length ? 'active' : ''}`}
                  onClick={() => {
                    setInsertAtPosition(insertAtPosition === scenes.length ? null : scenes.length);
                    setInsertCharacterId(null);
                  }}
                  title="Insert scene at end"
                >
                  +
                  {insertAtPosition === scenes.length && (
                    <div className="braided-insert-popover rails-number-popover">
                      {!insertCharacterId ? (
                        <>
                          <div className="braided-insert-popover-title">Pick a character</div>
                          {allCharacters.map(char => (
                            <button
                              key={char.id}
                              className="braided-insert-popover-item"
                              onClick={(e) => { e.stopPropagation(); setInsertCharacterId(char.id); }}
                            >
                              <span className="braided-insert-color-dot" style={{ background: characterColors[char.id] || '#888' }} />
                              {char.name}
                            </button>
                          ))}
                        </>
                      ) : (
                        <>
                          <div className="braided-insert-popover-title">
                            <button className="braided-insert-back-btn" onClick={(e) => { e.stopPropagation(); setInsertCharacterId(null); }}>&larr;</button>
                            Pick a section
                          </div>
                          {plotPoints
                            .filter(p => p.characterId === insertCharacterId)
                            .sort((a, b) => a.order - b.order)
                            .map(pp => (
                              <button
                                key={pp.id}
                                className="braided-insert-popover-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onInsertSceneAtPosition!(scenes.length, insertCharacterId!, pp.id);
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* To Braid Inbox - Right sidebar */}
      <div
        className="to-braid-inbox"
        onDragOver={handleInboxDragOver}
        onDrop={onDropOnInbox}
      >
        <div className="inbox-header">
          <h2 className="inbox-title">To Braid</h2>
          <select
            className="inbox-char-filter"
            value={inboxCharFilter}
            onChange={(e) => setInboxCharFilter(e.target.value)}
          >
            <option value="all">All Characters</option>
            {allCharacters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="inbox-characters">
          {allCharacters.filter(c => inboxCharFilter === 'all' || c.id === inboxCharFilter).map(char => {
            const charPlotPointMap = unbraidedScenesByCharacter.get(char.id);
            const charPlotPoints = plotPoints
              .filter(p => p.characterId === char.id)
              .sort((a, b) => a.order - b.order);

            // Calculate total unbraided scenes for this character
            let totalUnbraided = 0;
            if (charPlotPointMap) {
              for (const scenesArr of charPlotPointMap.values()) {
                totalUnbraided += scenesArr.length;
              }
            }

            const charColor = getCharacterHexColor(char.id);

            return (
              <div key={char.id} className="inbox-character-group">
                <div className="inbox-character-header" style={{ borderLeftColor: charColor }}>
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
                              <div
                                key={scene.id}
                                className="inbox-scene"
                                style={{ '--char-color': charColor } as React.CSSProperties}
                                draggable
                                onDragStart={(e) => wrappedDragStart(e, scene)}
                                onDragEnd={wrappedDragEnd}
                              >
                                <span className="inbox-scene-number">{scene.sceneNumber}.</span>
                                <span className="inbox-scene-title">
                                  {scene.content.replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                      {/* Scenes without plot point */}
                      {charPlotPointMap?.get('no-plot-point')?.map(scene => (
                        <div
                          key={scene.id}
                          className="inbox-scene"
                          style={{ '--char-color': charColor } as React.CSSProperties}
                          draggable
                          onDragStart={(e) => wrappedDragStart(e, scene)}
                          onDragEnd={wrappedDragEnd}
                        >
                          <span className="inbox-scene-number">{scene.sceneNumber}.</span>
                          <span className="inbox-scene-title">
                            {scene.content.replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="inbox-empty">All braided</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Slide-in Scene Panel */}
      {floatingEditorScene && (
        <FloatingEditor
          scene={floatingEditorScene}
          draftContent={draftContent[floatingEditorScene.id] || ''}
          characterName={getCharacterName(floatingEditorScene.characterId)}
          tags={tags}
          connectedScenes={getConnectedScenes(floatingEditorScene.id)}
          onClose={() => setFloatingEditorScene(null)}
          onSceneChange={onSceneChange}
          onTagsChange={onTagsChange}
          onCreateTag={onCreateTag}
          onStartConnection={() => {
            onStartConnection(floatingEditorScene.id);
            setFloatingEditorScene(null);
          }}
          onRemoveConnection={(targetId) => onRemoveConnection(floatingEditorScene.id, targetId)}
          onWordCountChange={onWordCountChange}
          onDraftChange={onDraftChange}
          onOpenInEditor={onOpenInEditor}
        />
      )}
    </div>
  );
}
