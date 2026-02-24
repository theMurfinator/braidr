import { useState } from 'react';
import type { Scene, Character, WorldEvent, Tag } from '../../../shared/types';
import TimelineGrid from './TimelineGrid';
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

  return (
    <div className="timeline-view">
      <div className="timeline-toolbar">
        <div className="timeline-sub-toggle">
          <button className={subMode === 'grid' ? 'active' : ''} onClick={() => setSubMode('grid')}>Grid</button>
          <button className={subMode === 'canvas' ? 'active' : ''} onClick={() => setSubMode('canvas')}>Canvas</button>
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
            <div className="timeline-canvas-placeholder">Canvas mode — coming in Task 9</div>
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
