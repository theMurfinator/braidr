# Tasks View Design

## Overview

A ClickUp-style task management screen for Braidr. Table view with inline-editable cells, custom columns, grouping, filtering, saved views, time tracking, and character/scene linking. Replaces and upgrades the existing scene todo system.

## Data Model

### Core Types

```typescript
export type TaskStatus = 'open' | 'in-progress' | 'done';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface TimeEntry {
  id: string;
  startedAt: number;       // timestamp
  duration: number;         // milliseconds
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];            // reuses existing Tag system names
  characterIds: string[];    // assigned characters
  sceneKey?: string;         // optional "characterId:sceneNumber" link
  timeEntries: TimeEntry[];
  timeEstimate?: number;     // milliseconds
  dueDate?: number;          // timestamp
  createdAt: number;
  updatedAt: number;
  order: number;             // sort position within the flat list
  customFields: Record<string, unknown>;  // fieldDef.id -> value
}
```

### Custom Field Definitions

```typescript
export type TaskFieldType = 'text' | 'number' | 'checkbox' | 'dropdown' | 'date';

export interface TaskFieldDef {
  id: string;
  name: string;
  type: TaskFieldType;
  options?: string[];        // for dropdown type
  width?: number;            // column pixel width
}
```

### Saved View Configuration

```typescript
export interface TaskViewConfig {
  id: string;
  name: string;
  groupBy?: string;          // field key: 'status', 'priority', 'character', custom field id
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: TaskFilter[];
  visibleColumns?: string[];
}

export interface TaskFilter {
  field: string;
  operator: 'is' | 'is_not' | 'contains' | 'is_set' | 'is_not_set';
  value?: string | string[];
}
```

### Storage

All task data stored in `timeline.json` as new keys on `TimelineData`:

- `tasks?: Task[]`
- `taskFieldDefs?: TaskFieldDef[]`
- `taskViews?: TaskViewConfig[]`

No new IPC channels. No new DataService methods. Piggybacks on existing `saveTimeline()`.

## UI Design

### Layout

- New top-level view accessed from left sidebar (checklist icon, between Notes and Analytics)
- ViewMode addition: `'tasks'` added to the union type
- Toolbar at top: view name dropdown, "Group by", "Filter", "Sort", "+ New Field"
- Table fills remaining space

### Built-in Columns

| Column | Cell render | Edit interaction |
|--------|-----------|-----------------|
| Title | Bold text | Click to inline edit |
| Status | Color-coded pill | Click for dropdown |
| Priority | Flag icon, color-coded | Click for dropdown |
| Tags | Colored tag pills | Click for tag picker (reuses existing tag system) |
| Characters | Character name pills with colors | Click for multi-select |
| Scene | "Character - Scene #" label | Click for scene picker |
| Due Date | Formatted date | Click for date picker |
| Time Tracked | "2h 15m" summary | Click to expand time entries |
| Time Estimate | "4h" | Click to inline edit |

### Custom Columns (user-created)

| Type | Cell render | Edit interaction |
|------|-----------|-----------------|
| Text | Plain text | Click to inline edit |
| Number | Right-aligned number | Click to inline edit |
| Checkbox | Checkbox toggle | Click to toggle |
| Dropdown | Selected value pill | Click for dropdown |
| Date | Formatted date | Click for date picker |

### Grouping

- Collapsible section headers spanning full width
- Group by: status, priority, character, scene, tag, or any custom dropdown field
- Tasks within groups sorted by `order` or active sort field
- Group headers show count: "Status: In Progress (12)"

### Timer

- Persistent timer widget in toolbar area
- Play button on each task row starts timing for that task
- Active timer shows in toolbar: task name + elapsed time + stop button
- Stopping saves a `TimeEntry` on the task

### Saved Views

- Dropdown in toolbar shows current view name (default: "All Tasks")
- Each view stores: visible columns + order, grouping, sort, filters
- "Save View" persists current config; "Save As New View" for variants
- Stored in `taskViews[]` in `timeline.json`

### Filtering

- Filter bar opens below toolbar
- Add filter rows: field -> operator -> value(s)
- Multiple filters combined with AND logic
- Active filters shown as dismissible pills
- Filter state is part of saved view config

### Sorting

- Click column header to sort (toggle asc/desc)
- Arrow indicator in header
- When grouped, sort applies within each group

## Scene Todo Migration

### Automatic one-time migration

On project load, if `tasks` is undefined but `_inlineTodos` exist in `sceneMetadata`:

- Convert each `SceneTodo` to a `Task`:
  - `title` <- `SceneTodo.description`
  - `status` <- `done ? 'done' : 'open'`
  - `sceneKey` <- `SceneTodo.sceneKey`
  - `characterIds` <- derived from sceneKey's characterId
  - Defaults for everything else
- Old `_inlineTodos` data left untouched (non-destructive)
- Sidebar reads from `tasks` array going forward

### Editor Sidebar Integration

- Existing "Tasks" section in editor right sidebar becomes a filtered view of `tasks` (filtered to current scene's `sceneKey`)
- Checkboxes toggle `task.status` between `open` and `done`
- "+ Add task" creates a new task pre-linked to current scene
- Clicking task title navigates to Tasks view with that task highlighted

## Component Architecture

### New files

```
src/renderer/components/tasks/
  TasksView.tsx          - top-level view container (toolbar + table)
  TaskTable.tsx          - table: headers, rows, grouping, inline editing
  TaskRow.tsx            - single row with cell renderers per column type
  TaskToolbar.tsx        - view switcher, group/filter/sort controls, timer
  TaskFilterBar.tsx      - active filter pills and filter row builder
  TaskTimer.tsx          - global timer widget (start/stop/display)
  TaskCellEditors.tsx    - inline cell editors: text input, dropdown, date picker, tag picker
  TaskFieldManager.tsx   - "Add Field" dialog: pick type, name, configure options
```

### Props flow

- `App.tsx` holds `tasks`, `taskFieldDefs`, `taskViews` in state
- `TasksView` receives these as props plus mutation callbacks
- Auto-save via existing `saveTimeline()` debounce
- Same pattern as NotesView

### App.tsx changes

- Add `'tasks'` to `ViewMode` type
- Add sidebar button with checklist icon
- Add render conditional for `TasksView`
- Add state for `tasks`, `taskFieldDefs`, `taskViews`
- Include in `saveTimeline()` payload
