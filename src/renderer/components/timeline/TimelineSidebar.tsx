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

export default function TimelineSidebar({
  worldEvents,
  selectedEventId,
  onSelectEvent,
}: TimelineSidebarProps) {
  return (
    <div className="timeline-sidebar">
      <div className="timeline-sidebar-header">
        <h3>World Events</h3>
        <button className="timeline-add-event-btn">+ New Event</button>
      </div>
      <div className="timeline-events-list">
        {worldEvents.length === 0 ? (
          <div className="timeline-empty">No world events yet</div>
        ) : (
          [...worldEvents]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(evt => (
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
    </div>
  );
}
