# Arc View Drag-and-Drop Design

**Date:** 2026-05-31
**Status:** Approved

## Goal

Add drag-and-drop for scenes in the Arc view: reorder within a section, move between sections, and drag to the bullpen. Add a dropdown to assign sections to acts. No schema changes required.

## Scope

| Feature | Mechanism |
|---|---|
| Reorder scenes within a section | dnd-kit drag |
| Move scene to a different section | dnd-kit drag (cross-section) |
| Drag scene to bullpen | dnd-kit drag |
| Assign section to an act | `<select>` dropdown inline in section row |
| Reorder sections | Not in scope |
| Reorder acts | Not in scope |

## Approach

Mirror the existing POV outline view pattern (Option A). A new `DndContext` block is added in App.tsx wrapping `<ArcView>`, with a parallel `handleArcDndEnd` handler. No new abstractions or files beyond what the POV view already established.

## App.tsx Changes

### New state and sensors
```
arcSensors = useSortableSensors()
arcActiveId: string | null  (useState)
```

### handleArcDndStart
Sets `arcActiveId` from `e.active.id`.

### handleArcDndEnd
Dispatches on `active.data.current.type`:

- **`'arc-scene'` → same section:** `arrayMove` on the section's scenes, reassign `sceneNumber` 1…n, call `saveCharacterOutline`.
- **`'arc-scene'` → different section:** update `plotPointId` to target section id, assign `sceneNumber` = end of target section's list, call `saveCharacterOutline`.
- **`'arc-scene'` → `'bullpen'`:** call existing `handleSetAside(activeId)`.

Cross-section target resolution: if `over.data.current.type === 'arc-scene'`, use `over.data.current.sectionId`. If `over.id` starts with `section-empty:`, slice to get the section id.

### DndContext block
Wraps `<ArcView>` with `sensors={arcSensors}`, `collisionDetection={closestCenter}`, `onDragStart`, `onDragEnd`. `DragOverlay` renders `<DragPreviewCard>` with the active scene title.

## ArcView Component Changes

### New props
- `arcActiveId: string | null` — used to suppress the overlay row while dragging
- `acts: Act[]` — already present, needed by the dropdown (already passed)

### renderSceneRow
Wrap each scene row in `<SortableItem id={scene.id} data={{ type: 'arc-scene', sectionId: pp.id }}>`. Add a `⠿` drag handle on the left edge, visible on hover, using the same `dragHandleProps` pattern as POV outline rows.

### renderSection — empty drop zone
Add a `useDroppable({ id: 'section-empty:' + pp.id })` zone rendered when a section has no scenes, so dragging a scene onto an empty section works.

### renderSection — act dropdown
Add a `<select>` in the section name cell (after the "Section" tag, before the editable title). Options: `"— Unassigned —"` (value `""`) followed by each act name (value = `act.id`). `onChange` calls `onSavePlotPointArcFields(pp.id, { actId: value || null })`.

The dropdown is small (`font-size: 11px`, `opacity: 0.7`) so it doesn't compete with the section title.

## Persistence

No schema changes. All existing fields are used:

| Field | Table | Updated by |
|---|---|---|
| `sceneNumber` | `scenes` | `saveCharacterOutline` |
| `plotPointId` | `scenes` | `saveCharacterOutline` |
| `actId` | `plot_points` | `onSavePlotPointArcFields` (existing IPC) |

## What Is Not Changing

- Section reorder (not in scope)
- Act reorder (not in scope)
- Bullpen implementation (reuses existing `handleSetAside`)
- All IPC handlers and SQLite schema (unchanged)
- `SortableArea`, `SortableItem`, `SortableList`, `DragPreviewCard` (unchanged)
