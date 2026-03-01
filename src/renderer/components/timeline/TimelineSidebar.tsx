import { useState, useMemo, useCallback, type DragEvent } from 'react';
import type { Scene, Character, WorldEvent } from '../../../shared/types';

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
    return scenes.filter(s => !timelineDates[s.id]);
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

  const handleUnassignedDragStart = useCallback((e: DragEvent<HTMLButtonElement>, sceneKey: string) => {
    e.dataTransfer.setData('text/plain', sceneKey);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleUnassignedDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    (e.currentTarget as HTMLElement).classList.add('drag-over');
  }, []);

  const handleUnassignedDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  }, []);

  const handleUnassignedDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');

    // Check for world event drop
    const eventId = e.dataTransfer.getData('application/x-event-id');
    if (eventId) {
      const updated = worldEvents.map(ev =>
        ev.id === eventId ? { ...ev, date: '', updatedAt: Date.now() } : ev
      );
      onWorldEventsChange(updated);
      return;
    }

    // Scene drop
    const sceneKey = e.dataTransfer.getData('text/plain');
    if (!sceneKey) return;
    const updated = { ...timelineDates };
    delete updated[sceneKey];
    onTimelineDatesChange(updated);
  }, [timelineDates, onTimelineDatesChange, worldEvents, onWorldEventsChange]);

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
            <div
              key={evt.id}
              className={`timeline-event-item undated ${selectedEventId === evt.id ? 'selected' : ''}`}
              onClick={() => onSelectEvent(evt.id)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-event-id', evt.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <div className="timeline-event-title">{evt.title}</div>
            </div>
          ))}
        </div>
      )}
      <div
        className="timeline-events-list"
        onDragOver={handleUnassignedDragOver}
        onDragLeave={handleUnassignedDragLeave}
        onDrop={handleUnassignedDrop}
      >
        {worldEvents.length === 0 ? (
          <div className="timeline-empty">No world events yet</div>
        ) : (
          datedEvents.map(evt => (
            <div
              key={evt.id}
              className={`timeline-event-item ${selectedEventId === evt.id ? 'selected' : ''}`}
              onClick={() => onSelectEvent(evt.id)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-event-id', evt.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <div className="timeline-event-date">{evt.date}</div>
              <div className="timeline-event-title">{evt.title}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Unassigned Scenes ─────────────────────────────────────────────── */}
      <div
        className="timeline-unassigned-sidebar"
        onDragOver={handleUnassignedDragOver}
        onDragLeave={handleUnassignedDragLeave}
        onDrop={handleUnassignedDrop}
      >
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
              const color = characterColors[scene.characterId] || '#888';
              const char = characterById[scene.characterId];
              const charName = char?.name ?? '?';
              const title = scene.title
                ? scene.title.slice(0, 24) + (scene.title.length > 24 ? '...' : '')
                : `Scene ${scene.sceneNumber}`;
              const isSelected = selectedSceneKey === scene.id;
              return (
                <button
                  key={scene.id}
                  className={`tg-scene-card${isSelected ? ' selected' : ''}`}
                  style={{ borderLeftColor: color }}
                  draggable="true"
                  onDragStart={(e) => handleUnassignedDragStart(e, scene.id)}
                  onClick={() => onSelectScene(isSelected ? null : scene.id)}
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
                      const title = scene.title
                        ? scene.title.slice(0, 30) + (scene.title.length > 30 ? '...' : '')
                        : `Scene ${scene.sceneNumber}`;
                      const isSelected = selectedSceneKey === scene.id;
                      return (
                        <button
                          key={scene.id}
                          className={`tg-scene-card${isSelected ? ' selected' : ''}`}
                          style={{ borderLeftColor: color }}
                          draggable="true"
                          onDragStart={(e) => handleUnassignedDragStart(e, scene.id)}
                          onClick={() => onSelectScene(isSelected ? null : scene.id)}
                          title={scene.title || `Scene ${scene.sceneNumber}`}
                        >
                          <div className="tg-scene-card-content">
                            <div className="tg-scene-card-top">
                              <span className="tg-scene-num">{scene.sceneNumber}</span>
                              <span className="tg-scene-title">{title}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
