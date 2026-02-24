# Timeline View Design

## Overview

A new top-level view for organizing scenes by calendar date and managing world events. Two sub-modes: Grid (structured editing) and Canvas (zoomable visualization).

## Problem

Multi-POV novels need temporal awareness. Writers need to see what's happening simultaneously across characters, catch continuity errors (character in two places on the same day), and track world events that affect multiple storylines. The existing braided view shows reading order but not chronological order.

## Data Model

### Scene Dates

Stored as a parallel map in `TimelineData`, following the existing pattern for connections, metadata, and word counts:

```typescript
timelineDates?: Record<string, string>  // "characterId:sceneNumber" -> "2024-03-14"
```

ISO date strings (`YYYY-MM-DD`). Day-level precision — no hours/minutes.

### World Events

New entity type stored in `TimelineData`:

```typescript
interface WorldEvent {
  id: string
  title: string
  date: string                // "YYYY-MM-DD"
  description: string
  tags: string[]
  linkedSceneKeys: string[]   // ["characterId:sceneNumber", ...]
  linkedNoteIds: string[]     // note IDs
  createdAt: number
  updatedAt: number
}
```

Stored as `worldEvents?: WorldEvent[]` in `TimelineData`.

### Date Range

Derived automatically from the earliest and latest dates across all scenes and world events. Every day in the range is rendered, including empty days.

## View Layout — Grid Mode (Primary)

- **Top-level view** alongside POV, Braided, Editor, Notes, Tasks
- **Toolbar**: Sub-mode toggle (Grid | Canvas), zoom, filters, date range info
- **Date columns** along the horizontal axis. Empty days narrow but visible and droppable. Busy days widen proportionally (2x for 2+ scenes stacked in any lane).
- **Character swimlanes** as rows, labeled on the left with character color.
- **World events row** pinned at the top above character lanes. Events shown as compact cards with diamond icon.
- **Scene cards** placed in character lane on assigned date. Multiple scenes on same day stack vertically.
- **Unassigned pool** at the bottom for scenes without dates.
- **Right sidebar**: Top half is chronological list of world events (create, edit, delete). Bottom half is context-sensitive detail panel — click a scene or event on the grid and details appear here.

## View Layout — Canvas Mode (Visualization)

Zoomable d3-based canvas (see mockup at `mockups/timeline-canvas-concept.html`):

- Same data as Grid mode, rendered as interactive nodes
- Character swimlanes with scene cards as nodes
- World events as diamond nodes in a top row
- Bezier curves show scene-to-scene connections
- Dashed lines show world event-to-scene links
- Click to select, hover to highlight connections
- Pan and zoom controls
- Read-only overview — switch to Grid to edit

## Interactions

### Setting dates on scenes
- Click date field on scene card (in any view)
- Drag scene from unassigned pool onto a day column
- Drag scene between day columns to reassign

### World event management
- Create via "+ New Event" in sidebar
- Edit title, date, description in detail panel
- Link to scenes: search/select scenes from event detail panel
- Link to notes: search/select notes from event detail panel
- Delete with confirmation

### Detail panel (right sidebar)
- Click scene on grid: shows scene details, linked events, connections
- Click event on grid or sidebar: shows event details, description, linked scenes/notes

## Integration with Existing Views

- Scene cards in POV and Braided views show date in the slim actions bar (alongside Connect, Words, Status) when assigned
- Date is settable from scene cards in POV/Braided views directly
- World events linkable from Notes view via wikilinks
- World events searchable/filterable by tags

## World Event Properties

Medium richness: title + date + description + tags + links to scenes/notes. For extended writing about a world event, link to a note.
