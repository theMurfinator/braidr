import { useState, useMemo } from 'react';
import type { Scene, Character, WorldEvent, Tag } from '../../../shared/types';
import TimelineGrid from './TimelineGrid';
import TimelineCanvas from './TimelineCanvas';
import TimelineSidebar from './TimelineSidebar';

type TimelineSubMode = 'grid' | 'canvas';

interface TimelineViewProps {
  scenes: Scene[];
  characters: Character[];
  characterColors: Record<string, string>;
  tags: Tag[];
  timelineDates: Record<string, string>;
  worldEvents: WorldEvent[];
  connections: Record<string, string[]>;
  onTimelineDatesChange: (dates: Record<string, string>) => void;
  onWorldEventsChange: (events: WorldEvent[]) => void;
}

export default function TimelineView({
  scenes,
  characters,
  characterColors,
  tags,
  timelineDates,
  worldEvents,
  connections,
  onTimelineDatesChange,
  onWorldEventsChange,
}: TimelineViewProps) {
  const [subMode, setSubMode] = useState<TimelineSubMode>('grid');
  const [selectedSceneKey, setSelectedSceneKey] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    const allDates = [
      ...Object.values(timelineDates),
      ...worldEvents.map(e => e.date),
    ].filter(Boolean).sort();
    if (allDates.length === 0) return null;
    const first = allDates[0];
    const last = allDates[allDates.length - 1];
    if (first === last) return first;
    return `${first} \u2014 ${last}`;
  }, [timelineDates, worldEvents]);

  return (
    <div className="timeline-view">
      <div className="timeline-toolbar">
        <div className="timeline-sub-toggle">
          <button className={subMode === 'grid' ? 'active' : ''} onClick={() => setSubMode('grid')}>Grid</button>
          <button className={subMode === 'canvas' ? 'active' : ''} onClick={() => setSubMode('canvas')}>Canvas</button>
        </div>
        <div className="timeline-toolbar-info">
          <span className="timeline-toolbar-stat">
            {Object.keys(timelineDates).length} dated scenes
          </span>
          <span className="timeline-toolbar-divider">&middot;</span>
          <span className="timeline-toolbar-stat">
            {worldEvents.length} events
          </span>
          {dateRange && (
            <>
              <span className="timeline-toolbar-divider">&middot;</span>
              <span className="timeline-toolbar-stat timeline-toolbar-daterange">
                {dateRange}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="timeline-content">
        <div className="timeline-main">
          {subMode === 'grid' ? (
            <TimelineGrid
              scenes={scenes}
              characters={characters}
              characterColors={characterColors}
              timelineDates={timelineDates}
              worldEvents={worldEvents}
              connections={connections}
              onTimelineDatesChange={onTimelineDatesChange}
              selectedSceneKey={selectedSceneKey}
              selectedEventId={selectedEventId}
              onSelectScene={setSelectedSceneKey}
              onSelectEvent={setSelectedEventId}
            />
          ) : (
            <TimelineCanvas
              scenes={scenes}
              characters={characters}
              characterColors={characterColors}
              timelineDates={timelineDates}
              worldEvents={worldEvents}
              connections={connections}
              selectedSceneKey={selectedSceneKey}
              selectedEventId={selectedEventId}
              onSelectScene={setSelectedSceneKey}
              onSelectEvent={setSelectedEventId}
            />
          )}
        </div>
        <TimelineSidebar
          worldEvents={worldEvents}
          scenes={scenes}
          characters={characters}
          timelineDates={timelineDates}
          selectedSceneKey={selectedSceneKey}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
          onWorldEventsChange={onWorldEventsChange}
          onTimelineDatesChange={onTimelineDatesChange}
        />
      </div>
    </div>
  );
}
