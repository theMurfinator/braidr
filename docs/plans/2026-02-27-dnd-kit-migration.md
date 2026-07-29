# Drag-and-Drop Migration to dnd-kit

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all 11 fragile HTML5 Drag API implementations with dnd-kit for reliable, animated, keyboard-accessible drag-and-drop across all views.

**Architecture:** Install `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`. Wrap the app in a single `<DndContext>` at the top level of each view that needs drag. Use `<SortableContext>` for list reordering. Each view migrates independently — same external behavior, much better internals. No new features (multi-select, undo, etc.) — just reliable drag.

**Tech Stack:** `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 8.0.0, `@dnd-kit/utilities` 3.2.2

**Note on TDD:** This project has no test suite. Verification is `npx vite build` (must pass with zero errors) + manual testing. Each task ends with a build check.

---

## Pre-read: Key Concepts

- **`<DndContext>`** — wraps a drag-and-drop region. Provides `onDragStart`, `onDragEnd`, `onDragOver` callbacks.
- **`<SortableContext>`** — wraps a list of sortable items. Takes `items` (array of string IDs) and a `strategy` (e.g., `verticalListSortingStrategy`).
- **`useSortable()`** — hook for each sortable item. Returns `{ attributes, listeners, setNodeRef, transform, transition }`. Spread `attributes` and `listeners` onto the drag handle element. Set `setNodeRef` on the item container.
- **`<DragOverlay>`** — renders a custom drag preview that follows the cursor. Shown during drag, hidden otherwise.
- **`arrayMove(arr, from, to)`** — utility to reorder an array immutably.
- **Sensors** — `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))` prevents accidental drags. The `distance: 5` means the user must move 5px before drag activates.

---

## Task 1: Install dnd-kit

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

```bash
cd /Users/brian/braidr
npm install @dnd-kit/core@6.3.1 @dnd-kit/sortable@8.0.0 @dnd-kit/utilities@3.2.2
```

**Step 2: Verify build**

```bash
npx vite build
```

Expected: Build succeeds (dnd-kit is tree-shaken, no effect until imported).

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities"
```

---

## Task 2: Table Column Reorder (simplest migration — proof of concept)

This is the simplest drag context in the app: reordering column headers in a flat list. Perfect proof of concept.

**Files:**
- Modify: `src/renderer/components/TableView.tsx`

**Current state (to remove):**
- State: `draggedColumn`, `dragOverColumn` (lines ~108-110)
- Handlers: `handleColumnDragStart`, `handleColumnDragOver`, `handleColumnDrop`, `handleColumnDragEnd` (lines ~320-351)
- JSX: `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd` on header cells (line ~785)
- CSS classes: `.dragging`, `.drag-over` on headers

**Step 1: Add imports at top of TableView.tsx**

```tsx
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

**Step 2: Create a SortableColumnHeader sub-component**

Add this inside TableView.tsx, above the main component:

```tsx
function SortableColumnHeader({
  id,
  children,
  ...rest
}: {
  id: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    ...rest.style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={rest.className}
      onClick={rest.onClick}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
```

**Step 3: Replace drag state and handlers**

Remove the old state variables (`draggedColumn`, `dragOverColumn`) and the four handler functions (`handleColumnDragStart`, `handleColumnDragOver`, `handleColumnDrop`, `handleColumnDragEnd`).

Add a single handler:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
);

const handleColumnDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = columnOrder.indexOf(active.id as string);
  const newIndex = columnOrder.indexOf(over.id as string);
  if (oldIndex === -1 || newIndex === -1) return;

  setColumnOrder(arrayMove(columnOrder, oldIndex, newIndex));
};
```

**Step 4: Update JSX**

Wrap the header row in `<DndContext>` and `<SortableContext>`. Replace each header `<div>` with `<SortableColumnHeader>`. Remove the old `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd` props and the `dragging`/`drag-over` class logic.

The header rendering pattern should be:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleColumnDragEnd}
>
  <SortableContext
    items={columnOrder}
    strategy={horizontalListSortingStrategy}
  >
    {/* map over columns, render <SortableColumnHeader> for each */}
  </SortableContext>
</DndContext>
```

**Step 5: Verify build**

```bash
npx vite build
```

**Step 6: Commit**

```bash
git commit -m "refactor: migrate table column drag to dnd-kit"
```

---

## Task 3: Editor Section Reorder

Similar to table columns but vertical. Sections (character panels) can be dragged to reorder in the editor view.

**Files:**
- Modify: `src/renderer/components/EditorView.tsx`

**Current state (to remove):**
- State: `dragSectionId`, `dropTargetIdx` (lines ~970-975)
- Handlers: `handleSectionDragStart`, `handleSectionDragOver`, `handleSectionDrop`, `handleSectionDragEnd` (lines ~1003-1041)
- JSX: `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd` on section containers
- Note: Has complex visible/hidden order mapping

**Step 1: Add dnd-kit imports**

Same pattern as Task 2 but with `verticalListSortingStrategy`.

**Step 2: Create SortableSection sub-component**

```tsx
function SortableSection({
  id,
  children,
  disabled,
}: {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Pass listeners to the drag handle only */}
      {children}
    </div>
  );
}
```

**Step 3: Replace handlers**

Remove old state and handlers. Add:

```tsx
const sectionSensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
);

const handleSectionDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = sectionOrder.indexOf(active.id as string);
  const newIndex = sectionOrder.indexOf(over.id as string);
  if (oldIndex === -1 || newIndex === -1) return;

  setSectionOrder(arrayMove(sectionOrder, oldIndex, newIndex));
};
```

**Step 4: Wrap in DndContext + SortableContext**

The `items` array for `SortableContext` should be `sectionOrder` (the full order, not just visible). Hidden sections are handled by `disabled` prop on `useSortable`.

**Step 5: Build check + commit**

---

## Task 4: POV Scene Reorder (most complex)

This is the hardest migration. Scenes can be dragged between plot point sections, which triggers renumbering and key remapping. The current implementation uses a `canDragPovRef` gate, `.5` float indices, and multiple fragile drop zones.

**Files:**
- Modify: `src/renderer/components/PlotPointSection.tsx`
- Modify: `src/renderer/components/SceneCard.tsx`
- Modify: `src/renderer/App.tsx` (the POV rendering section + `handlePovSceneDrop`)

**Current state (to remove from PlotPointSection.tsx):**
- `canDragPovRef` — ref gate for drag initiation (line ~60)
- `dropTargetIndex` state (line ~64)
- All `onDragStart`, `onDragEnd`, `onDragOver`, `onDragLeave`, `onDrop` handlers on scene items and drop zones
- The 5+ drop zone divs (`.scene-drop-zone`)

**Current state (to remove from App.tsx):**
- `draggedPovScene` state (line ~137)
- Props threading: `onSceneDragStart`, `onSceneDragEnd` to PlotPointSection

**Current state (to modify in SceneCard.tsx):**
- `dragHandleRef` prop — replace with dnd-kit `listeners` spread
- `showDragHandle` — keep as visual indicator, but drag activation comes from dnd-kit

**Architecture for POV:**

The tricky part: scenes live in plot point sections, and you can drag between sections. This is a **multi-container sortable** problem.

Approach:
- One `<DndContext>` wrapping all PlotPointSections in the POV column
- Each PlotPointSection gets its own `<SortableContext>` with that section's scene IDs
- `onDragOver` (fires while dragging over a different container) handles moving between sections
- `onDragEnd` finalizes the move, triggers renumbering + save
- `<DragOverlay>` renders a SceneCard clone as the drag preview

**Step 1: Create a usePovDrag hook or inline in App.tsx POV section**

The `onDragEnd` callback replaces `handlePovSceneDrop`. It needs to:
1. Determine which section the scene was dropped into (from `over.data.current.sortable.containerId`)
2. Determine the new index within that section
3. Call the existing renumbering + remapping logic
4. Save

**Step 2: Make each scene a sortable item**

In PlotPointSection, each scene item gets `useSortable({ id: scene.id })`. The drag handle (`⋮⋮`) gets `{...listeners}` spread on it instead of the old `onmousedown` ref.

This completely eliminates the `canDragPovRef` hack — dnd-kit's `PointerSensor` with `activationConstraint: { distance: 5 }` handles it natively.

**Step 3: Remove all drop zone divs**

dnd-kit handles drop positioning automatically via `SortableContext`. No more manual drop zones between items.

**Step 4: Add DragOverlay**

```tsx
<DragOverlay>
  {activeDragScene ? (
    <SceneCard
      scene={activeDragScene}
      // ... minimal props for visual preview
    />
  ) : null}
</DragOverlay>
```

**Step 5: Update handlePovSceneDrop to work with dnd-kit event shape**

The new handler receives `DragEndEvent` with `active.id` (scene ID) and `over.id` (target scene ID or section ID). Convert this to the existing renumbering logic.

**Step 6: Build check + commit**

---

## Task 5: Braided View Scene Reorder

Scenes in the braided timeline can be reordered. They can also be dragged to the "inbox" (sidebar) to remove them from the timeline.

**Files:**
- Modify: `src/renderer/App.tsx` (braided view section, ~lines 3750-4025)

**Current state (to remove):**
- `draggedScene` state (line ~83)
- `dropTargetIndex` state (line ~84)
- `handleDragStart`, `handleDragEnd`, `handleDragOverTimeline`, `handleDropOnTimeline`, `handleDropOnInbox` handlers
- All inline `draggable`, `onDragStart`, `onDragOver`, `onDrop` attributes on braided scene rows

**Architecture:**

- One `<DndContext>` wrapping the braided scene list + inbox area
- One `<SortableContext>` with all braided scene IDs in order
- The inbox is a `useDroppable()` zone (not sortable — it's just a "remove from timeline" target)
- `onDragEnd`: if dropped on a sortable item, reorder. If dropped on the inbox droppable, remove from timeline.
- `<DragOverlay>` shows a scene card preview

**Step 1: Add dnd-kit context around braided view**

```tsx
import { useDroppable } from '@dnd-kit/core';
```

The inbox area uses `useDroppable({ id: 'braided-inbox' })`.

**Step 2: Make each braided scene row sortable**

Each scene row gets `useSortable({ id: scene.id })`.

**Step 3: Handle drag end**

```tsx
const handleBraidedDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) return;

  if (over.id === 'braided-inbox') {
    // Remove from timeline
    handleDropOnInbox(active.id as string);
    return;
  }

  // Reorder
  const braidedScenes = projectData.scenes
    .filter(s => s.timelinePosition !== null)
    .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));

  const oldIndex = braidedScenes.findIndex(s => s.id === active.id);
  const newIndex = braidedScenes.findIndex(s => s.id === over.id);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

  const reordered = arrayMove(braidedScenes, oldIndex, newIndex);
  // ... renumber positions and save (same logic as current handleDropOnTimeline)
};
```

**Step 4: Build check + commit**

---

## Task 6: Braided Chapter Reorder

Chapters (dividers between scenes) can be reordered in the braided view.

**Files:**
- Modify: `src/renderer/App.tsx` (chapter drag section)

**Current state (to remove):**
- `draggedChapter` state (line ~133)
- Inline drag handlers on chapter elements

**Architecture:**

Chapters are interleaved with scenes in the braided view. They are NOT sortable items in the same context as scenes — they have their own ordering semantics (`beforePosition`).

Two options:
1. **Separate DndContext for chapters** — simpler, chapters drag independently
2. **Same DndContext, different item types** — more complex but allows cross-type interaction

**Recommendation: Option 1** — chapters rarely interact with scene drag. Use a separate, lightweight drag context for chapter reordering. Each chapter element gets `useSortable`. On drag end, update `beforePosition` values.

**Step 1: Add chapter sortable context**

Chapters are sparse (interspersed between scenes), so use `verticalListSortingStrategy` with chapter IDs only.

**Step 2: Handle chapter drag end**

On drop, compute new `beforePosition` from the chapter's new position relative to scenes.

**Step 3: Build check + commit**

---

## Task 7: Rails View Scene Reorder

Rails view reuses the braided view's drag handlers. Two things to migrate:
1. **Scene reordering within rows** — uses `handleDropOnTimeline` from App.tsx
2. **Column header reordering** — rail order

**Files:**
- Modify: `src/renderer/components/RailsView.tsx`
- Modify: `src/renderer/App.tsx` (Rails rendering section)

**Current state (to remove from RailsView.tsx):**
- `dropTargetIndex` state (line ~157)
- `handleDrop` handler (line ~170)
- Inline `onDragOver`, `onDrop` on drop zones (line ~313)
- Header drag handlers: `handleRailDragStart`, `handleRailDragOver`, `handleRailDrop` etc.

**Architecture:**

- Scene rows in Rails use the same DndContext approach as braided view (they share the same `handleDropOnTimeline` logic from App.tsx)
- Rail header columns use a separate `<DndContext>` with `<SortableContext>` + `horizontalListSortingStrategy` for column reordering
- The inbox drop zone works the same as braided

**Step 1: Migrate rail header drag**

Same pattern as Table column headers (Task 2) — `SortableContext` with `horizontalListSortingStrategy`.

**Step 2: Migrate scene row drag**

Wrap rows in `DndContext` + `SortableContext`. Pass `onDragEnd` that calls the existing `onDropOnTimeline` handler.

**Step 3: Build check + commit**

---

## Task 8: Notes Sidebar Reorder

Notes have a tree structure with three drop positions: before, inside (reparent), and after.

**Files:**
- Modify: `src/renderer/components/notes/NotesSidebar.tsx`

**Current state (to remove):**
- `draggedNoteId`, `dropTarget` state (lines ~237-238)
- `handleDragStart`, `handleDragOver`, `handleDragLeave`, `handleDrop` handlers (lines ~289-368)
- `dragend` event listener effect (lines ~370-377)

**Architecture:**

dnd-kit doesn't have built-in tree/nested support, but we can implement the before/inside/after detection using a custom collision detection strategy or by using the `onDragOver` callback with position sensing.

Approach:
- `<DndContext>` wrapping the notes list
- Each note is a `useSortable` item
- Use `onDragOver` to detect position (before/inside/after) based on cursor position relative to the note element
- On `onDragEnd`, call `onMoveNote(draggedNoteId, newParentId, newOrder)` with the computed position
- Prevent circular drops by checking descendants in `onDragOver`

The three-zone detection (top 25% = before, middle 50% = inside, bottom 25% = after) can be implemented using a custom `modifiers` or a measuring function in the `onDragOver` handler.

**Step 1: Add DndContext and make each note sortable**

**Step 2: Implement position detection**

Use `over.rect` and the pointer position from `event.activatorEvent` to determine the drop zone within the target note.

**Step 3: Add circular reference prevention**

In `onDragOver`, if the target is a descendant of the dragged note, set an `isInvalidDrop` state to show visual feedback.

**Step 4: Build check + commit**

---

## Task 9: Timeline Grid Scene Drag

Scenes in the timeline grid are dragged between date columns. This is NOT a sortable list — it's a free-form grid placement.

**Files:**
- Modify: `src/renderer/components/timeline/TimelineGrid.tsx`

**Current state (to remove):**
- `handleDragStart`, `handleDragEnd`, `handleCellDragOver`, `handleCellDragLeave`, `handleCellDrop` handlers
- `draggable` attribute on scene cards
- `.drag-over` class toggling

**Keep intact:**
- Multi-day span resize (uses mouse events, not HTML5 drag — this is separate and works fine)

**Architecture:**

Timeline grid is a placement operation, not a sorting operation. Use `<DndContext>` with `useDroppable()` on each cell, and `useDraggable()` on each scene card.

- Each cell is a droppable with `id = \`${characterId}:${date}\`` or `\`world:${date}\``
- Each scene card is a draggable with `id = sceneKey`
- World event cards are also draggable with `id = \`event:${eventId}\``
- On `onDragEnd`, update `timelineDates[sceneKey]` with the new date from the droppable ID
- `<DragOverlay>` shows the scene card being dragged

```tsx
import { useDraggable, useDroppable } from '@dnd-kit/core';
```

**Step 1: Make cells droppable**

Each `tg-cell` div gets:
```tsx
const { setNodeRef, isOver } = useDroppable({ id: `${charId}:${date}` });
```

Replace the old `onDragOver`/`onDragLeave`/`onDrop` with ref + `isOver` for styling.

**Step 2: Make scene cards draggable**

Each scene card gets:
```tsx
const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: sceneKey });
```

**Step 3: Handle drag end**

Parse the `over.id` to extract the target date, update `timelineDates`.

**Step 4: Handle world event drag**

Same approach — world event cards are draggable, cells are droppable, `onDragEnd` updates the event date.

**Step 5: Build check + commit**

---

## Task 10: CSS Cleanup

Remove all HTML5-drag-specific CSS that is no longer needed and ensure dnd-kit transforms look correct.

**Files:**
- Modify: `src/renderer/styles.css`

**Step 1: Find and update drag-related styles**

Search for:
- `.dragging` classes — some can be removed (dnd-kit handles opacity via inline style), some may need updating
- `.drag-over` classes — replaced by `isOver` prop from `useDroppable`
- `.scene-drop-zone` — remove entirely (dnd-kit doesn't need explicit drop zone elements)
- `cursor: grab` / `cursor: grabbing` — keep on drag handles

**Step 2: Add dnd-kit-friendly styles**

```css
/* Ensure sortable items don't break layout during transform */
[data-dnd-sortable] {
  touch-action: none;
}
```

**Step 3: Build check + commit**

---

## Task 11: Final Integration Testing & Cleanup

**Files:**
- All modified files

**Step 1: Full build verification**

```bash
npx vite build
```

**Step 2: Manual test checklist**

- [ ] POV view: drag scene between sections, within section, to first/last position
- [ ] POV view: drag handle only (clicking scene card content should NOT start drag)
- [ ] Braided view: drag scene to reorder, drag to inbox to remove
- [ ] Braided view: drag chapter to reorder
- [ ] Rails view: drag rail headers to reorder columns
- [ ] Rails view: drag scene rows to reorder
- [ ] Timeline grid: drag scene card to different date cell
- [ ] Timeline grid: drag world event to different date
- [ ] Timeline grid: multi-day resize still works (this uses mouse events, not drag)
- [ ] Table view: drag column headers to reorder
- [ ] Editor view: drag section handles to reorder panels
- [ ] Notes sidebar: drag note before/after another note
- [ ] Notes sidebar: drag note inside another note (reparent)
- [ ] Notes sidebar: cannot drag note into its own descendant
- [ ] All views: 5px activation constraint prevents accidental drags

**Step 3: Remove any unused imports**

Search for leftover HTML5 drag types (`DragEvent`) that are no longer used.

**Step 4: Final commit**

```bash
git commit -m "refactor: complete dnd-kit migration, remove HTML5 drag API usage"
```

---

## Execution Order & Dependencies

```
Task 1 (install) ─────────────────────────────────────────────┐
Task 2 (table columns) ── easiest, proof of concept           │
Task 3 (editor sections) ── similar to Task 2                 │
Task 4 (POV scenes) ── hardest, multi-container               │ independent
Task 5 (braided scenes) ── medium complexity                   │ (after Task 1)
Task 6 (braided chapters) ── depends on Task 5 layout         │
Task 7 (rails) ── depends on Task 5 handlers                  │
Task 8 (notes sidebar) ── independent tree drag               │
Task 9 (timeline grid) ── uses draggable/droppable, not sort  │
Task 10 (CSS) ── after all views migrated ─────────────────────┘
Task 11 (final) ── after everything
```

Tasks 2-3 are quick wins. Task 4 is the hardest. Tasks 5-9 are medium. Task 4 should be done carefully and committed before moving on.

## Risk Notes

- **POV renumbering logic** (`buildKeyMapBeforeRenumber` / `applyKeyRemapAfterRenumber`) is NOT changing — we're only changing how drag events are detected and routed, not what happens after the drop.
- **Multi-day span resize** in TimelineGrid uses mouse events, not HTML5 drag. It is NOT being migrated and should continue working untouched.
- **TipTap drag handle** (ProseMirror extension) is NOT being migrated — it lives inside the editor and uses ProseMirror's internal drag system.
- **Canvas view** has no drag-and-drop (only pan/zoom). Not affected.
