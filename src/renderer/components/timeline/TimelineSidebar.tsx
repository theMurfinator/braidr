import { useState, useRef, useEffect } from 'react';
import type { Scene, Character, WorldEvent } from '../../../shared/types';

interface TimelineSidebarProps {
  worldEvents: WorldEvent[];
  scenes: Scene[];
  characters: Character[];
  timelineDates: Record<string, string>;
  selectedSceneKey: string | null;
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  onWorldEventsChange: (events: WorldEvent[]) => void;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
}

function getSceneLabel(sceneKey: string, characters: Character[]): string {
  const [charId, sceneNum] = sceneKey.split(':');
  const character = characters.find(c => c.id === charId);
  const charName = character?.name ?? charId;
  return `${charName} #${sceneNum}`;
}

export default function TimelineSidebar({
  worldEvents,
  scenes,
  characters,
  timelineDates,
  selectedSceneKey,
  selectedEventId,
  onSelectEvent,
  onWorldEventsChange,
}: TimelineSidebarProps) {
  const [linkDropdownOpen, setLinkDropdownOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const justCreatedRef = useRef(false);
  const linkWrapperRef = useRef<HTMLDivElement>(null);

  // Focus title input when a new event is created
  useEffect(() => {
    if (justCreatedRef.current && selectedEventId && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
      justCreatedRef.current = false;
    }
  }, [selectedEventId]);

  // Close link dropdown on click outside
  useEffect(() => {
    if (!linkDropdownOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (linkWrapperRef.current && !linkWrapperRef.current.contains(e.target as Node)) {
        setLinkDropdownOpen(false);
        setLinkSearch('');
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [linkDropdownOpen]);

  const sortedEvents = [...worldEvents].sort((a, b) => a.date.localeCompare(b.date));
  const selectedEvent = selectedEventId
    ? worldEvents.find(e => e.id === selectedEventId) ?? null
    : null;

  // Build scene key for selected scene info
  const selectedSceneInfo = selectedSceneKey
    ? (() => {
        const [charId, sceneNum] = selectedSceneKey.split(':');
        const character = characters.find(c => c.id === charId);
        const scene = scenes.find(
          s => s.characterId === charId && String(s.sceneNumber) === sceneNum
        );
        const date = timelineDates[selectedSceneKey] ?? null;
        return { character, scene, date, key: selectedSceneKey };
      })()
    : null;

  // ── Create ──────────────────────────────────────────────────────────────────
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
    justCreatedRef.current = true;
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function updateEvent(id: string, patch: Partial<WorldEvent>) {
    const updated = worldEvents.map(e =>
      e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e
    );
    onWorldEventsChange(updated);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete(id: string) {
    if (!window.confirm('Delete this world event?')) return;
    onWorldEventsChange(worldEvents.filter(e => e.id !== id));
    onSelectEvent(null);
  }

  // ── Link / Unlink Scene ─────────────────────────────────────────────────────
  function linkScene(eventId: string, sceneKey: string) {
    const event = worldEvents.find(e => e.id === eventId);
    if (!event || event.linkedSceneKeys.includes(sceneKey)) return;
    updateEvent(eventId, {
      linkedSceneKeys: [...event.linkedSceneKeys, sceneKey],
    });
    setLinkDropdownOpen(false);
    setLinkSearch('');
  }

  function unlinkScene(eventId: string, sceneKey: string) {
    const event = worldEvents.find(e => e.id === eventId);
    if (!event) return;
    updateEvent(eventId, {
      linkedSceneKeys: event.linkedSceneKeys.filter(k => k !== sceneKey),
    });
  }

  // ── Available scenes for linking ────────────────────────────────────────────
  function getAvailableScenes(): { key: string; label: string }[] {
    if (!selectedEvent) return [];
    const linked = new Set(selectedEvent.linkedSceneKeys);
    const results: { key: string; label: string }[] = [];
    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      if (linked.has(key)) continue;
      const label = getSceneLabel(key, characters);
      if (linkSearch && !label.toLowerCase().includes(linkSearch.toLowerCase())) continue;
      results.push({ key, label });
    }
    return results;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="timeline-sidebar">
      {/* ── Top: Event List ─────────────────────────────────────────────── */}
      <div className="timeline-sidebar-header">
        <h3>World Events</h3>
        <button className="timeline-add-event-btn" onClick={handleCreate}>
          + New Event
        </button>
      </div>
      <div className="timeline-events-list">
        {sortedEvents.length === 0 ? (
          <div className="timeline-empty">No world events yet</div>
        ) : (
          sortedEvents.map(evt => (
            <div
              key={evt.id}
              className={`timeline-event-item ${selectedEventId === evt.id ? 'selected' : ''}`}
              onClick={() => onSelectEvent(evt.id)}
            >
              <div className="timeline-event-date">{evt.date}</div>
              <div className="timeline-event-title">{evt.title}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Bottom: Detail Panel ────────────────────────────────────────── */}
      {selectedEvent && (
        <div className="timeline-detail-panel">
          <div className="timeline-detail-field">
            <label>Title</label>
            <input
              ref={titleInputRef}
              type="text"
              value={selectedEvent.title}
              onChange={e => updateEvent(selectedEvent.id, { title: e.target.value })}
            />
          </div>

          <div className="timeline-detail-field">
            <label>Date</label>
            <input
              type="date"
              value={selectedEvent.date}
              onChange={e => updateEvent(selectedEvent.id, { date: e.target.value })}
            />
          </div>

          <div className="timeline-detail-field">
            <label>Description</label>
            <textarea
              rows={3}
              value={selectedEvent.description}
              onChange={e => updateEvent(selectedEvent.id, { description: e.target.value })}
            />
          </div>

          <div className="timeline-detail-field">
            <label>Tags</label>
            <input
              type="text"
              value={selectedEvent.tags.join(', ')}
              placeholder="comma-separated tags"
              onChange={e => {
                const tags = e.target.value
                  .split(',')
                  .map(t => t.trim())
                  .filter(Boolean);
                updateEvent(selectedEvent.id, { tags });
              }}
            />
          </div>

          {/* ── Linked Scenes ──────────────────────────────────────────── */}
          <div className="timeline-linked-scenes">
            <label>Linked Scenes</label>
            <div className="timeline-scene-chips">
              {selectedEvent.linkedSceneKeys.map(key => {
                const [charId] = key.split(':');
                const character = characters.find(c => c.id === charId);
                const color = character?.color ?? 'var(--accent)';
                return (
                  <span
                    key={key}
                    className="timeline-scene-chip"
                    style={{ borderColor: color }}
                  >
                    {getSceneLabel(key, characters)}
                    <button
                      className="timeline-chip-remove"
                      onClick={() => unlinkScene(selectedEvent.id, key)}
                    >
                      &times;
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="timeline-link-scene-wrapper" ref={linkWrapperRef}>
              <button
                className="timeline-link-scene-btn"
                onClick={() => setLinkDropdownOpen(!linkDropdownOpen)}
              >
                + Link Scene
              </button>
              {linkDropdownOpen && (() => {
                const available = getAvailableScenes();
                return (
                  <div className="timeline-link-dropdown">
                    <input
                      type="text"
                      placeholder="Search scenes..."
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      autoFocus
                    />
                    <div className="timeline-link-dropdown-list">
                      {available.map(({ key, label }) => (
                        <div
                          key={key}
                          className="timeline-link-dropdown-item"
                          onClick={() => linkScene(selectedEvent.id, key)}
                        >
                          {label}
                        </div>
                      ))}
                      {available.length === 0 && (
                        <div className="timeline-link-dropdown-empty">No scenes available</div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          <button
            className="timeline-delete-btn"
            onClick={() => handleDelete(selectedEvent.id)}
          >
            Delete Event
          </button>
        </div>
      )}

      {/* ── Scene Info (when no event selected) ─────────────────────────── */}
      {!selectedEvent && selectedSceneInfo && selectedSceneInfo.scene && (
        <div className="timeline-detail-panel">
          <div className="timeline-detail-field">
            <label>Character</label>
            <div className="timeline-detail-value">
              {selectedSceneInfo.character?.name ?? 'Unknown'}
            </div>
          </div>
          <div className="timeline-detail-field">
            <label>Scene</label>
            <div className="timeline-detail-value">
              {selectedSceneInfo.scene.title || `Scene ${selectedSceneInfo.scene.sceneNumber}`}
            </div>
          </div>
          {selectedSceneInfo.date && (
            <div className="timeline-detail-field">
              <label>Date</label>
              <div className="timeline-detail-value">{selectedSceneInfo.date}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
