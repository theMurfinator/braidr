import type { Scene, Character, WorldEvent } from '../../../shared/types';

interface TimelineGridProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  timelineDates: Record<string, string>;
  worldEvents: WorldEvent[];
  connections: Record<string, string[]>;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
  selectedSceneKey: string | null;
  selectedEventId: string | null;
  onSelectScene: (key: string | null) => void;
  onSelectEvent: (id: string | null) => void;
}

export default function TimelineGrid({
  scenes,
  characters,
  characterColors,
  timelineDates,
  worldEvents,
}: TimelineGridProps) {
  // Derive date range
  const allDates = [
    ...Object.values(timelineDates),
    ...worldEvents.map(e => e.date),
  ].filter(Boolean).sort();

  const dateCount = allDates.length;

  return (
    <div className="timeline-grid">
      <p style={{ padding: 20, color: 'var(--text-muted)' }}>
        Grid: {dateCount} dates, {scenes.length} scenes, {characters.length} characters
      </p>
    </div>
  );
}
