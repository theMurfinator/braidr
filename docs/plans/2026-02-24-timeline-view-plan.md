# Timeline View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a top-level Timeline view that organizes scenes by calendar date with character swimlanes, world events, and a canvas visualization mode.

**Architecture:** New `timeline` ViewMode with two sub-modes (grid and canvas). World events and scene dates stored in TimelineData alongside existing data. Grid mode is a horizontally-scrolling swimlane layout with a right sidebar for event management. Canvas mode is a zoomable d3 visualization.

**Tech Stack:** React, TypeScript, HTML Canvas (canvas mode), CSS Grid (grid mode). No new dependencies.

---

### Task 1: Data Model — Types and TimelineData

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add WorldEvent interface after the existing TaskFilter interface (~line 182)**

```typescript
// ── Timeline / World Events ─────────────────────────────────────────────────

export interface WorldEvent {
  id: string;
  title: string;
  date: string;                // "YYYY-MM-DD"
  description: string;
  tags: string[];
  linkedSceneKeys: string[];   // ["characterId:sceneNumber", ...]
  linkedNoteIds: string[];     // note IDs
  createdAt: number;
  updatedAt: number;
}
```

**Step 2: Add fields to TimelineData interface (after `showInlineLabels`)**

```typescript
  // Scene dates keyed by "characterId:sceneNumber"
  timelineDates?: Record<string, string>;
  // World events
  worldEvents?: WorldEvent[];
```

**Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c "error"` — count should be same as before (pre-existing errors only).

**Step 4: Commit**

```
git add src/shared/types.ts
git commit -m "feat: add WorldEvent type and timeline fields to TimelineData"
```

---

### Task 2: State Management — App.tsx Wiring

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/services/dataService.ts`

**Step 1: Add state and refs in App.tsx (after taskVisibleColumns state, ~line 252)**

```typescript
  // Timeline state
  const [timelineDates, setTimelineDates] = useState<Record<string, string>>({});
  const timelineDatesRef = useRef<Record<string, string>>({});
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const worldEventsRef = useRef<WorldEvent[]>([]);
```

Add `WorldEvent` to the import from `../../shared/types`.

**Step 2: Add mutation callbacks (after handleTaskColumnConfigChange)**

```typescript
  const handleTimelineDatesChange = useCallback((dates: Record<string, string>) => {
    setTimelineDates(dates);
    timelineDatesRef.current = dates;
    isDirtyRef.current = true;
  }, []);

  const handleWorldEventsChange = useCallback((events: WorldEvent[]) => {
    setWorldEvents(events);
    worldEventsRef.current = events;
    isDirtyRef.current = true;
  }, []);
```

**Step 3: Load timeline data on project open (after taskVisibleColumns loading, ~line 955)**

```typescript
    const loadedTimelineDates: Record<string, string> = (data as any).timelineDates || {};
    setTimelineDates(loadedTimelineDates);
    timelineDatesRef.current = loadedTimelineDates;
    const loadedWorldEvents: WorldEvent[] = (data as any).worldEvents || [];
    setWorldEvents(loadedWorldEvents);
    worldEventsRef.current = loadedWorldEvents;
```

**Step 4: Add to saveTimeline calls**

Both save calls in App.tsx pass refs to `dataService.saveTimeline()`. Append `timelineDatesRef.current, worldEventsRef.current` to both calls.

**Step 5: Update dataService.ts**

Add `timelineDates` and `worldEvents` parameters to:
- The `DataService` interface `saveTimeline` signature
- The `ElectronDataService.saveTimeline` implementation signature
- The data object passed to `window.electronAPI.saveTimeline`

Add to the `loadProject` return object:
```typescript
      timelineDates: timelineData.timelineDates || {},
      worldEvents: timelineData.worldEvents || [],
```

Update the `loadProject` return type in both the interface and implementation to include:
```typescript
timelineDates: Record<string, string>;
worldEvents: WorldEvent[];
```

**Step 6: Verify build, commit**

```
git add src/renderer/App.tsx src/renderer/services/dataService.ts
git commit -m "feat: wire up timeline dates and world events state"
```

---

### Task 3: ViewMode and Navigation

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Extend ViewMode type**

Change:
```typescript
type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'tasks' | 'analytics' | 'account';
```
To:
```typescript
type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'tasks' | 'timeline' | 'analytics' | 'account';
```

Also update the localStorage restore check (~line 947) to include `'timeline'` in the valid modes list.

**Step 2: Add sidebar navigation button**

After the Tasks button in the sidebar (search for `viewMode === 'tasks'`), add:

```tsx
<button
  className={`app-sidebar-btn ${viewMode === 'timeline' ? 'active' : ''}`}
  onClick={() => setViewMode('timeline')}
  title="Timeline"
  aria-label="Timeline view"
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="3" y1="12" x2="21" y2="12"/>
    <circle cx="7" cy="12" r="2"/>
    <circle cx="14" cy="12" r="2"/>
    <circle cx="19" cy="12" r="2"/>
  </svg>
  <span className="app-sidebar-label">Events</span>
</button>
```

**Step 3: Add placeholder render**

In the main view rendering conditional chain (where `viewMode === 'tasks'` renders `<TasksView>`), add after the tasks block:

```tsx
) : viewMode === 'timeline' ? (
  <div style={{ padding: 40, color: 'var(--text-muted)' }}>
    <h2>Timeline View</h2>
    <p>Coming soon — {worldEvents.length} world events, {Object.keys(timelineDates).length} dated scenes</p>
  </div>
```

**Step 4: Verify build, test navigation works in dev server, commit**

```
git add src/renderer/App.tsx
git commit -m "feat: add timeline view mode and sidebar navigation"
```

---

### Task 4: TimelineView Component — Grid Shell

**Files:**
- Create: `src/renderer/components/timeline/TimelineView.tsx`
- Create: `src/renderer/components/timeline/TimelineGrid.tsx`
- Create: `src/renderer/components/timeline/TimelineSidebar.tsx`
- Modify: `src/renderer/App.tsx` (replace placeholder)

**Step 1: Create TimelineView.tsx — the top-level component**

```typescript
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
        <div className="sub-view-toggle">
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
            <div className="timeline-canvas-placeholder">Canvas mode — coming in Task 8</div>
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
```

**Step 2: Create TimelineGrid.tsx — placeholder**

```typescript
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
```

**Step 3: Create TimelineSidebar.tsx — placeholder**

```typescript
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
          worldEvents
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
```

**Step 4: Replace placeholder in App.tsx**

Import `TimelineView` and replace the placeholder render with:

```tsx
) : viewMode === 'timeline' ? (
  <TimelineView
    scenes={projectData.scenes}
    characters={projectData.characters}
    characterColors={characterColors}
    tags={projectData.tags}
    timelineDates={timelineDates}
    worldEvents={worldEvents}
    connections={sceneConnections}
    onTimelineDatesChange={handleTimelineDatesChange}
    onWorldEventsChange={handleWorldEventsChange}
  />
```

**Step 5: Add base CSS**

Add to `src/renderer/styles.css`:

```css
/* ── Timeline View ─────────────────────────────────────────────── */

.timeline-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.timeline-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-shrink: 0;
}

.timeline-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.timeline-main {
  flex: 1;
  overflow: auto;
}

.timeline-sidebar {
  width: 280px;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}

.timeline-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.timeline-sidebar-header h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.timeline-add-event-btn {
  padding: 4px 10px;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.timeline-add-event-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-secondary);
}

.timeline-events-list {
  flex: 1;
  overflow-y: auto;
}

.timeline-event-item {
  padding: 10px 16px;
  border-bottom: 1px solid var(--bg-tertiary);
  cursor: pointer;
  transition: background 0.15s;
}

.timeline-event-item:hover {
  background: var(--bg-tertiary);
}

.timeline-event-item.selected {
  background: var(--bg-tertiary);
  border-left: 3px solid var(--accent);
}

.timeline-event-date {
  font-size: 11px;
  color: var(--text-muted);
}

.timeline-event-title {
  font-size: 13px;
  color: var(--text-primary);
}

.timeline-empty {
  padding: 20px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.timeline-grid {
  height: 100%;
  overflow: auto;
}
```

**Step 6: Verify build, test in dev server, commit**

```
git add src/renderer/components/timeline/ src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: add TimelineView shell with grid placeholder and sidebar"
```

---

### Task 5: World Event CRUD in Sidebar

**Files:**
- Modify: `src/renderer/components/timeline/TimelineSidebar.tsx`

**Step 1: Implement full sidebar with create, edit, delete**

The sidebar needs:
- "+ New Event" button that creates a blank event with today's date
- Click event to select → shows detail panel below the list
- Detail panel: editable title, date picker, description textarea
- Delete button with confirmation
- Scene linking: search/select scenes to link
- Note linking: search/select notes to link

This is the largest single component. Implement:
- `handleCreateEvent()` — creates event with `crypto.randomUUID()`, today's date, empty fields
- `handleUpdateEvent(id, partial)` — merges changes into the event
- `handleDeleteEvent(id)` — filters out with confirmation
- `handleLinkScene(eventId, sceneKey)` / `handleUnlinkScene(eventId, sceneKey)`
- Detail panel renders when `selectedEventId` is set, showing editable fields

**Step 2: Add detail panel CSS to styles.css**

**Step 3: Verify build, test CRUD in dev server, commit**

```
git commit -m "feat: implement world event CRUD in timeline sidebar"
```

---

### Task 6: Timeline Grid — Date Columns and Swimlanes

**Files:**
- Modify: `src/renderer/components/timeline/TimelineGrid.tsx`

**Step 1: Implement the grid layout**

Core logic:
- Derive all dates from `timelineDates` and `worldEvents`
- Fill in every day between min and max date
- Calculate column widths: base width for empty days, proportionally wider for busy days
- Render character lane labels on the left (sticky)
- Render date headers across the top (sticky)
- Render world events row below date headers
- Render scene cards in character lanes at their date column
- Render unassigned pool at the bottom

Key implementation details:
- Use CSS grid or flexbox with `overflow-x: auto` for horizontal scroll
- Character labels column: fixed width, `position: sticky; left: 0`
- Date headers row: `position: sticky; top: 0`
- Scene cards: compact display (title, character color bar)
- Click scene card → `onSelectScene(sceneKey)`
- Click world event → `onSelectEvent(eventId)`

**Step 2: Add grid CSS**

```css
.timeline-grid-container { ... }
.timeline-date-header { ... }
.timeline-lane-label { ... }
.timeline-cell { ... }
.timeline-scene-card { ... }
.timeline-world-event-card { ... }
.timeline-unassigned-pool { ... }
```

**Step 3: Verify build, test grid renders correctly, commit**

```
git commit -m "feat: implement timeline grid with date columns and character swimlanes"
```

---

### Task 7: Drag and Drop — Date Assignment

**Files:**
- Modify: `src/renderer/components/timeline/TimelineGrid.tsx`

**Step 1: Implement drag from unassigned pool to date column**

- Scene cards in unassigned pool get `draggable="true"`
- Date column cells are drop targets with `onDragOver` / `onDrop`
- On drop: call `onTimelineDatesChange` with the scene key mapped to the target date
- Visual feedback: highlight drop target column on dragover

**Step 2: Implement drag between date columns**

- Scene cards already on the grid are also draggable
- Dropping on a different date column reassigns the date
- Dropping on the unassigned pool removes the date

**Step 3: Verify drag-and-drop works in dev server, commit**

```
git commit -m "feat: add drag-and-drop date assignment in timeline grid"
```

---

### Task 8: Date Field on Scene Cards (POV/Braided Integration)

**Files:**
- Modify: `src/renderer/components/SceneCard.tsx`
- Modify: `src/renderer/App.tsx` (pass date props to SceneCard)

**Step 1: Add date props to SceneCard**

Add to SceneCardProps:
```typescript
  sceneDate?: string;
  onDateChange?: (sceneId: string, date: string | undefined) => void;
```

**Step 2: Add date button to the slim actions bar**

In the `.scene-actions-bar`, add a date button (like the Words button):
```tsx
{onDateChange && (
  isEditingDate ? (
    <input type="date" ... />
  ) : (
    <button className="scene-actions-bar-btn" onClick={...}>
      {sceneDate || 'Date'}
    </button>
  )
)}
```

**Step 3: Pass date props from App.tsx**

In both POV and Braided view SceneCard renders, pass:
```tsx
sceneDate={timelineDates[`${scene.characterId}:${scene.sceneNumber}`]}
onDateChange={(sceneId, date) => {
  const scene = projectData.scenes.find(s => s.id === sceneId);
  if (scene) {
    const key = `${scene.characterId}:${scene.sceneNumber}`;
    const updated = { ...timelineDates };
    if (date) updated[key] = date;
    else delete updated[key];
    handleTimelineDatesChange(updated);
  }
}}
```

**Step 4: Verify date shows on scene cards in POV/Braided, commit**

```
git commit -m "feat: add date field to scene card actions bar"
```

---

### Task 9: Canvas Visualization Mode

**Files:**
- Create: `src/renderer/components/timeline/TimelineCanvas.tsx`
- Modify: `src/renderer/components/timeline/TimelineView.tsx` (wire up)

**Step 1: Port the mockup canvas to a React component**

Adapt `mockups/timeline-canvas-concept.html` into a React component:
- Use `useRef` for canvas element
- Use `useEffect` for draw loop
- Read scene/event/connection data from props
- Implement pan (drag), zoom (scroll), hover (highlight connections), click (select)
- Follow the canvas lesson from memory: never put `draw` in simulation useEffect deps, use refs for transient visual state

**Step 2: Wire into TimelineView subMode toggle**

Replace the canvas placeholder with `<TimelineCanvas ... />`.

**Step 3: Verify canvas renders and interactions work, commit**

```
git commit -m "feat: add zoomable canvas visualization to timeline view"
```

---

### Task 10: Polish and Integration

**Files:**
- Various CSS and component tweaks

**Step 1: Toolbar refinements**

- Add scene count / date range display to timeline toolbar
- Add filter controls (by character, by tag) consistent with other views

**Step 2: Keyboard shortcuts**

- Escape to deselect scene/event
- Delete key to remove date from selected scene

**Step 3: Empty state**

- When no scenes have dates and no world events exist, show helpful onboarding message
- "Assign dates to your scenes to see them on the timeline"

**Step 4: Final build verification, commit**

```
git commit -m "feat: polish timeline view — toolbar, empty states, keyboard shortcuts"
```
