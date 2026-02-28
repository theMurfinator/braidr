import { useState, useMemo } from 'react';
import type { Scene, Character, WorldEvent } from '../../../shared/types';
import { useDraggable, useDroppable } from '@dnd-kit/core';

interface TimelineSidebarProps {
  worldEvents: WorldEvent[];
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  timelineDates: Record<string, string>;
  selectedSceneKey: string | null;
  selectedEventId: string | null;
  onSelectScene: (key: string | null) => void;
  onSelectEvent: (id: string | null) => void;
  onWorldEventsChange: (events: WorldEvent[]) => void;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
}

/** Wraps a scene card button with dnd-kit useDraggable (id = "scene:<sceneId>"). */
function DraggableSceneCard({
  sceneId,
  children,
}: {
  sceneId: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `scene:${sceneId}`,
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

/** Wraps an event item with dnd-kit useDraggable (id = "event:<eventId>"). */
function DraggableEventItem({
  eventId,
  children,
}: {
  eventId: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `event:${eventId}`,
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

/** Droppable zone for unassigning scenes/events. */
function DroppableUnassignedZone({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className || ''} ${isOver ? 'drag-over' : ''}`}>
      {children}
    </div>
  );
}

export default function TimelineSidebar({
  worldEvents,
  scenes,
  characters,
  characterColors,
  timelineDates,
  selectedSceneKey,
  selectedEventId,
  onSelectScene,
  onSelectEvent,
  onWorldEventsChange,
  onTimelineDatesChange,
}: TimelineSidebarProps) {

  // ── Unassigned scenes ──────────────────────────────────────────────────────
  type UnassignedSortMode = 'narrative' | 'character';
  const [unassignedSort, setUnassignedSort] = useState<UnassignedSortMode>('narrative');
  const [unassignedCharFilter, setUnassignedCharFilter] = useState<string>('all');

  const unassignedScenes = useMemo(() => {
    return scenes.filter(s => {
      const key = s.id;
      return !timelineDates[key];
    });
  }, [scenes, timelineDates]);

  // Narrative order: flat list sorted by timelinePosition (nulls at end)
  const unassignedNarrative = useMemo(() => {
    return [...unassignedScenes].sort((a, b) => {
      const posA = a.timelinePosition ?? Infinity;
      const posB = b.timelinePosition ?? Infinity;
      if (posA !== posB) return posA - posB;
      const charIdxA = characters.findIndex(c => c.id === a.characterId);
      const charIdxB = characters.findIndex(c => c.id === b.characterId);
      if (charIdxA !== charIdxB) return charIdxA - charIdxB;
      return a.sceneNumber - b.sceneNumber;
    });
  }, [unassignedScenes, characters]);

  // Group unassigned scenes by character
  const unassignedByCharacter = useMemo(() => {
    const groups: { character: Character; scenes: Scene[] }[] = [];
    const charMap = new Map<string, Scene[]>();
    for (const scene of unassignedScenes) {
      const existing = charMap.get(scene.characterId);
      if (existing) {
        existing.push(scene);
      } else {
        charMap.set(scene.characterId, [scene]);
      }
    }
    for (const char of characters) {
      const charScenes = charMap.get(char.id);
      if (charScenes) {
        charScenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
        groups.push({ character: char, scenes: charScenes });
      }
    }
    return groups;
  }, [unassignedScenes, characters]);

  const filteredUnassignedGroups = useMemo(() => {
    if (unassignedCharFilter === 'all') return unassignedByCharacter;
    return unassignedByCharacter.filter(g => g.character.id === unassignedCharFilter);
  }, [unassignedByCharacter, unassignedCharFilter]);

  const filteredUnassignedCount = unassignedSort === 'narrative'
    ? unassignedScenes.length
    : filteredUnassignedGroups.reduce((sum, g) => sum + g.scenes.length, 0);

  const characterById = useMemo(() => {
    const m: Record<string, Character> = {};
    for (const c of characters) m[c.id] = c;
    return m;
  }, [characters]);

  const datedEvents = worldEvents.filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
  const undatedEvents = worldEvents.filter(e => !e.date);

  // ── Create event ──────────────────────────────────────────────────────────
  function handleCreate() {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const newEvent: WorldEvent = {
      id: crypto.randomUUID(),
      title: 'New Event',
      date: today,
      description: '',
      tags: [],
      linkedSceneKeys: [],
      linkedNoteIds: [],
      createdAt: now,
      updatedAt: now,
    };
    onWorldEventsChange([...worldEvents, newEvent]);
    onSelectEvent(newEvent.id);
  }

  return (
    <div className="timeline-sidebar">
      {/* ── Top: Event List ─────────────────────────────────────────────── */}
      <div className="timeline-sidebar-header">
        <h3>World Events</h3>
        <button className="timeline-add-event-btn" onClick={handleCreate}>
          + New Event
        </button>
      </div>
      {undatedEvents.length > 0 && (
        <div className="timeline-undated-section">
          <div className="timeline-undated-divider">Needs date ({undatedEvents.length})</div>
          {undatedEvents.map(evt => (
            <DraggableEventItem key={evt.id} eventId={evt.id}>
              <div
                className={`timeline-event-item undated ${selectedEventId === evt.id ? 'selected' : ''}`}
                onClick={() => onSelectEvent(evt.id)}
              >
                <div className="timeline-event-title">{evt.title}</div>
              </div>
            </DraggableEventItem>
          ))}
        </div>
      )}
      <DroppableUnassignedZone id="timeline-unassigned-events" className="timeline-events-list">
        {worldEvents.length === 0 ? (
          <div className="timeline-empty">No world events yet</div>
        ) : (
          datedEvents.map(evt => (
            <DraggableEventItem key={evt.id} eventId={evt.id}>
              <div
                className={`timeline-event-item ${selectedEventId === evt.id ? 'selected' : ''}`}
                onClick={() => onSelectEvent(evt.id)}
              >
                <div className="timeline-event-date">{evt.date}</div>
                <div className="timeline-event-title">{evt.title}</div>
              </div>
            </DraggableEventItem>
          ))
        )}
      </DroppableUnassignedZone>

      {/* ── Unassigned Scenes ─────────────────────────────────────────────── */}
      <DroppableUnassignedZone id="timeline-unassigned-scenes" className="timeline-unassigned-sidebar">
        <div className="timeline-sidebar-header">
          <h3>Unassigned ({filteredUnassignedCount})</h3>
          <div className="timeline-unassigned-controls">
            <div className="timeline-unassigned-sort-toggle">
              <button
                className={unassignedSort === 'narrative' ? 'active' : ''}
                onClick={() => setUnassignedSort('narrative')}
                title="Narrative order"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v1.5H2zm0 4h9v1.5H2zm0 4h11v1.5H2z"/></svg>
              </button>
              <button
                className={unassignedSort === 'character' ? 'active' : ''}
                onClick={() => setUnassignedSort('character')}
                title="Group by character"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2h6v5H1zm8 0h6v2H9zm0 3h6v2H9zm-8 4h6v5H1zm8 0h6v2H9zm0 3h6v2H9z"/></svg>
              </button>
            </div>
            {unassignedSort === 'character' && unassignedByCharacter.length > 1 && (
              <select
                className="timeline-unassigned-filter"
                value={unassignedCharFilter}
                onChange={e => setUnassignedCharFilter(e.target.value)}
              >
                <option value="all">All</option>
                {unassignedByCharacter.map(g => (
                  <option key={g.character.id} value={g.character.id}>
                    {g.character.name} ({g.scenes.length})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {unassignedScenes.length === 0 ? (
          <div className="timeline-empty">Drop here to unassign</div>
        ) : unassignedSort === 'narrative' ? (
          <div className="timeline-unassigned-cards">
            {unassignedNarrative.map(scene => {
              const key = scene.id;
              const color = characterColors[scene.characterId] || '#888';
              const char = characterById[scene.characterId];
              const charName = char?.name ?? '?';
              const title = scene.title
                ? scene.title.slice(0, 24) + (scene.title.length > 24 ? '...' : '')
                : `Scene ${scene.sceneNumber}`;
              const isSelected = selectedSceneKey === key;
              return (
                <DraggableSceneCard key={key} sceneId={key}>
                  <button
                    className={`tg-scene-card${isSelected ? ' selected' : ''}`}
                    style={{ borderLeftColor: color }}
                    onClick={() => onSelectScene(isSelected ? null : key)}
                    title={`${charName} #${scene.sceneNumber}: ${scene.title || 'Untitled'}`}
                  >
                    <div className="tg-scene-card-content">
                      <div className="tg-scene-card-top">
                        <span className="tg-scene-num">{scene.sceneNumber}</span>
                        <span className="tg-scene-title">{title}</span>
                      </div>
                      <span className="tg-scene-date">{charName}</span>
                    </div>
                  </button>
                </DraggableSceneCard>
              );
            })}
          </div>
        ) : filteredUnassignedGroups.length === 0 ? (
          <div className="timeline-empty">No scenes for this character</div>
        ) : (
          <div className="timeline-unassigned-groups">
            {filteredUnassignedGroups.map(({ character, scenes: charScenes }) => {
              const color = characterColors[character.id] || '#888';
              return (
                <div key={character.id} className="timeline-unassigned-group">
                  <div className="timeline-unassigned-group-header">
                    <span className="tg-lane-color" style={{ background: color }} />
                    <span className="timeline-unassigned-group-name">{character.name}</span>
                    <span className="timeline-unassigned-group-count">{charScenes.length}</span>
                  </div>
                  <div className="timeline-unassigned-cards">
                    {charScenes.map(scene => {
                      const key = scene.id;
                      const title = scene.title
                        ? scene.title.slice(0, 30) + (scene.title.length > 30 ? '...' : '')
                        : `Scene ${scene.sceneNumber}`;
                      const isSelected = selectedSceneKey === key;
                      return (
                        <DraggableSceneCard key={key} sceneId={key}>
                          <button
                            className={`tg-scene-card${isSelected ? ' selected' : ''}`}
                            style={{ borderLeftColor: color }}
                            onClick={() => onSelectScene(isSelected ? null : key)}
                            title={scene.title || `Scene ${scene.sceneNumber}`}
                          >
                            <div className="tg-scene-card-content">
                              <div className="tg-scene-card-top">
                                <span className="tg-scene-num">{scene.sceneNumber}</span>
                                <span className="tg-scene-title">{title}</span>
                              </div>
                            </div>
                          </button>
                        </DraggableSceneCard>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DroppableUnassignedZone>
    </div>
  );
}
