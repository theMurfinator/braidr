# dnd-kit Full Migration — Design

**Date:** 2026-05-03
**Status:** Approved design, awaiting implementation plan
**Supersedes:** `docs/plans/2026-02-27-dnd-kit-migration.md` (older incremental plan, never executed)
**Trigger:** Multiple failed attempts to fix POV view drag/drop. Decision to commit to enterprise-grade rebuild with Scrivener as the quality bar.

---

## 1. Overview

Migrate every drag-and-drop interaction in the Braidr Electron + React app from native HTML5 Drag and Drop to **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`). The migration is structured around a small set of **shared primitives** in `src/renderer/dnd/` that every view composes, so visual treatment and behavior stay uniform across all 14 drag contexts in the app.

**Phase 1 (this spec's primary deliverable) replaces the broken POV view drag/drop with a brand-new `PovOutlineView` component** built on the shared primitives. Subsequent phases migrate the other views in sequence; each phase is independently shippable.

## 2. Background — Why we're doing this

### 2.1 The proximate trigger

The POV view's drag/drop has been rebuilt several times in recent commits and remains unusable. User-reported problems:

1. **Drop targets are unclear and jumpy.** Each `PlotPointSection` instance manages its own `dropTargetIndex` state, and there are 5 different drop-zone shapes (top, between-scenes, end-of-section, empty section, scene-card-itself with `index + 0.5` semantics). Multiple drop zones can be highlighted at once across sections.
2. **Drops sometimes land in the wrong place** because of the `index + 0.5` "after this scene" hack and the racing between scene-card drop targets and slim drop zones.
3. **The "zoom out" animation is confusing.** The drop-zone CSS at `styles.css:2970-3008` makes drop zones grow from 12px → 48px on active/hover, causing layout shift that reads as zooming.
4. **No auto-scroll** when dragging near the top or bottom of the viewport, so off-screen drop targets are unreachable without releasing.
5. **Hard to see sections.** The 48px expanding drop bands overpower the section header hierarchy.

The rails view, by contrast, works well because (a) ONE owner of `dropTargetIndex` for the whole grid, (b) constant-height (4px) drop zones with absolutely-positioned `::before` indicator (zero layout shift), (c) auto-scroll wired up via `useAutoScrollOnDrag`. The rails approach proves the architecture, not the library, was the issue.

### 2.2 The wider trigger

HTML5 Drag and Drop has structural limitations unsuitable for an enterprise / public-facing product:

- **Accessibility:** Effectively no keyboard support; weak screen reader story.
- **Touch / iPad:** Native HTML5 DnD doesn't fire on touch. `RailsView.tsx` carries ~100 lines of pointer-event code (`handlePointerDown`, custom ghost div, manual `elementFromPoint` hit-testing) just to fake touch drag.
- **Cross-browser quirks:** Last commit literally references "Chromium bug 168544" and adds a `setTimeout` workaround inside `onDragStart` to make drag function correctly.
- **Drop-target clarity:** No built-in mechanism for "show where this will land" — you must build it manually with conditional drop zones, which is what got us into the current mess.

The user's quality bar for this rebuild is **Scrivener**.

## 3. Goals & Non-goals

### Goals
- POV view drag/drop becomes fluid, predictable, and visually clear ("Scrivener-grade")
- Universal visual language for drop targets across all 14 drag contexts in the app
- Accessibility (keyboard reorder, screen reader announcements) becomes default behavior
- Touch / iPad uses the same code path as mouse; no parallel pointer-event implementations
- Architecture supports adding multi-select drag later without rewriting
- Each phase is independently shippable; codebase is never in a broken half-state

### Non-goals (this spec)
- **Multi-select drag.** Architected so it can be added later; not implemented now.
- **Section dragging in POV view.** Sections continue to use ▲▼ button reorder. (`Set aside section` button is a small future enhancement, not in this spec.)
- **Cross-view dragging** (e.g., drag from rails view into POV view). The two views are never on screen simultaneously; not needed.
- **iPad SwiftUI companion app** (`BraidrIPad/`). Separate codebase, not affected.
- **Replacing the existing reorder business logic** (e.g., `handlePovSceneDrop` in `App.tsx:1871`). The new components produce the same callback inputs.

## 4. Architecture

### 4.1 Shared primitives (`src/renderer/dnd/`)

A small library every view composes:

```
src/renderer/dnd/
├── SortableList.tsx              wraps DndContext + SortableContext + sensor setup
├── SortableItem.tsx              wraps useSortable; provides drag handle binding
├── DropIndicator.tsx             slim absolutely-positioned line + circle marker
├── DragPreviewCard.tsx           generic floating drag overlay with character-color accent
├── useSortableSensors.ts         shared sensor config (PointerSensor 5px + KeyboardSensor)
├── useAutoScrollContainer.ts     replaces useAutoScrollOnDrag; wired to dnd-kit pointer events
└── index.ts                      barrel export
```

### 4.2 The contract every view uses

```tsx
<SortableList
  items={items}                              // array of objects with stable string `id`
  strategy="vertical"                        // "vertical" | "horizontal" — string mapped internally to dnd-kit's strategy object
  onReorder={(activeId, overId) => ...}      // fires on drop; consumer calculates new positions from these IDs
  renderItem={(item, dragHandleProps) => <YourRow item={item} {...dragHandleProps} />}
  renderDragOverlay={(item) => <DragPreviewCard title={...} color={...} />}
/>
```

`dragHandleProps` is the bag of `attributes` + `listeners` returned by dnd-kit's `useSortable` hook. Consumers spread it onto whichever element should be the drag handle — typically the row root, but could be a sub-element if a view ever needs an explicit handle.

That's the entire dnd-kit API surface most views need. View-specific code stays focused on rendering and business logic; nothing in a view file imports `DndContext`, `useSortable`, `closestCenter`, etc.

### 4.3 Responsibility map

- **`dnd/` primitives:** drag mechanics, animation, accessibility, sensor config, drop indicator visuals, drag overlay visuals
- **View components (`PovOutlineView`, `RailsView`, etc.):** what to render, what data to reorder, what callbacks fire on drop
- **`App.tsx`:** state ownership, persistence calls — no drag knowledge needed

### 4.4 Per-view DndContext scope

Each view that has drag is its own `<DndContext>` (created inside its top-level `<SortableList>` wrapper). Views never share a `DndContext` because cross-view drag is not a use case. Within a view, multiple `<SortableList>` instances can share the parent context (e.g., POV view contains the outline list AND the bullpen list — both inside one `DndContext`).

## 5. The new POV view (`PovOutlineView.tsx`)

### 5.1 Replaces

The `displayedPlotPoints.map(...)` block in `App.tsx` (around line 3775) that currently renders one `<PlotPointSection outlineMode={true}>` per plot point.

### 5.2 Component interface (sketch)

```tsx
<PovOutlineView
  sections={displayedPlotPoints}                 // section headers, not sortable
  scenes={displayedScenes}                       // sortable items
  bullpenScenes={...}                            // for bullpen panel rendering
  characterColor={getCharacterHexColor(selectedCharacterId)}
  synopsisModes={sectionSynopsisModes}
  hideHeaders={hideSectionHeaders[tabId]}
  onSceneReorder={(sceneId, targetSectionId, targetPositionInSection) => ...}
  onSetAside={handleSetAside}
  onSectionMoveUp={handleMoveSectionUp}
  onSectionMoveDown={handleMoveSectionDown}
  onToggleSynopsisMode={handleToggleSynopsisMode}
  onSceneChange={handleSceneChange}
  onOpenInEditor={handleOpenInEditor}
  // ... other passthrough props
/>
```

`App.tsx` continues to own all state and persistence. `PovOutlineView` is purely presentational + drag mechanics.

### 5.3 Internal structure

- A single `<DndContext>` wraps the entire POV view (outline + bullpen)
- Inside it, two `<SortableList>` instances:
  - One for the POV outline (all scenes from all sections in a single flat sortable list)
  - One for the bullpen panel
- Sections are rendered as visual-only headers between scene groups in the outline; section headers are NOT in the sortable items array (so they don't move during scene drag)
- Each section also renders a small "section drop placeholder" (a `useDroppable` zone) at the top, so a scene can be dropped into an empty section
- On drop, dnd-kit gives us `active.id` (scene being dragged) and `over.id` (scene, placeholder, or bullpen item being hovered). We derive the target section + position from the drop target's identity and call `onSceneReorder` (or set the scene aside if dropped into the bullpen list).

### 5.4 Interaction model

- **Drag handle:** the entire row is draggable — no ⋮⋮ gutter handle. Activation distance of 5px (configured in `useSortableSensors`) prevents accidental drags when clicking to edit a title or open a scene.
- **Section headers:** stay button-controlled (▲▼) — not draggable.
- **Cross-section drag:** works automatically because all scenes are in one `<SortableList>`. Drag a scene from "Hook" into "Setup" — single drop call updates `plotPointId` to the new section.
- **Bullpen drag:** drag a scene from POV → bullpen panel = same effect as clicking "Set aside." Drag bullpen → POV section = assigns scene to that section.
- **Click vs drag disambiguation:** dnd-kit's `PointerSensor` with `activationConstraint: { distance: 5 }` ensures clicks on title text, action buttons, or chevrons don't trigger drag.
- **Cancel:** Escape during drag, or drop outside any droppable, smoothly animates the dragged item back to its origin.

### 5.5 What's removed

- `PlotPointSection`'s `outlineMode={true}` branch (lines ~304-371) — POV view no longer uses `PlotPointSection`. The component itself stays alive for `MobileApp.tsx` until Phase 7.
- `OutlineSceneRow.tsx`'s `canDragRef` + `setTimeout(() => onDragStart(scene), 0)` Chromium workaround — gone. (Component itself may also be deleted in Phase 7 if `MobileApp.tsx` doesn't need it.)
- All 5 broken drop-zone shapes in `PlotPointSection`: top, between-scenes, end, empty, scene-card-itself
- The CSS at `styles.css:2970-3008` that grows drop zones 12px → 48px (the "zoom" animation)
- The `index + 0.5` "after this scene" position arithmetic

### 5.6 What stays

- Section header rendering (title, scene count, expand/collapse synopsis chevron, ▲▼ buttons, delete button)
- Synopsis editing per scene (current `OutlineSceneRow` textarea behavior, ported into the new component)
- Scene title editing
- "Set aside" button per scene (alongside the new drag-to-bullpen path)
- All existing `handlePovSceneDrop` reorder logic in `App.tsx:1871` — works as-is; just gets called with cleaner inputs

## 6. Visual & interaction details

### 6.1 Drop indicator (`DropIndicator.tsx`)

- Color: `#22c55e` (matches existing rails treatment)
- Thickness: 3px, full row width
- Plus 10px green circle marker on the left edge
- Implementation: absolutely positioned via `::before` on the slot between rows; zero layout shift
- Only ONE indicator visible at a time (state owned at the `<SortableList>` level)

Color is configurable via a single CSS variable so future tuning is one-file.

### 6.2 Slide-out-of-the-way animation

- As drag proceeds, items below the drop point translate down by the dragged item's height
- Items above the drop point stay put
- Animation: 200ms, ease-out (dnd-kit default — feels natural)
- The dragged item's original slot becomes a 30%-opacity placeholder so spatial position is preserved

### 6.3 Drag preview (`DragPreviewCard.tsx`)

- Shows scene number + title (truncated to ~40 chars)
- Border-left accent in the scene's character color
- Compact: ~280px wide, ~44px tall, slight shadow on dark background
- Follows cursor with default tiny lag — feels "grabbed," not jittery
- Used by every view's drag overlay

### 6.4 Auto-scroll (`useAutoScrollContainer.ts`)

- 150px edge zone at top and bottom of the scroll container
- Speed ramps from 3px/frame to 25px/frame as cursor approaches the edge
- Activates whenever any drag is in progress
- Replaces the existing `useAutoScrollOnDrag` hook; same edge-zone tuning, but listens to dnd-kit's drag events instead of native HTML5 events

### 6.5 Edge cases

| Case | Behavior |
|---|---|
| Drop on yourself | No-op, no state change, no flicker |
| Drop into empty section | Lands at position 0 via the section's drop placeholder |
| Cancel drag (Escape) | Smoothly animates back to origin |
| Drop outside any droppable | Same as cancel |
| Drop exactly at boundary between two sections | Drop target is whichever side dnd-kit's `closestCenter` collision detection picks (deterministic — based on cursor position relative to each side's centroid). Scene's `plotPointId` is set to the section the indicator lands in. |
| Scene card with active text editing | Click on input doesn't start drag (5px activation distance) |

## 7. Migration sequencing

Each phase ships as its own PR / auto-release. App is fully usable between phases — never in a half-broken state.

| Phase | Scope | Files touched | Notes |
|---|---|---|---|
| **1** | POV view + shared primitives | New: `src/renderer/dnd/*`, `PovOutlineView.tsx`. Modify: `App.tsx` (POV branch), `PlotPointSection.tsx` (strip outline branch). | Biggest phase: primitives and first consumer co-evolve. |
| **2** | Rails view | `RailsView.tsx`, `RailsSceneCard.tsx`, the rails inbox + rail-header reorder. | Deletes ~100 lines of custom touch pointer-event code. Validates primitives in a different shape (grid). |
| **3** | Table view | `TableView.tsx` column reorder + row reorder if applicable. | Smallest leg. |
| **4** | Notes sidebar | `NotesSidebar.tsx` note reorder. | Straightforward list. |
| **5** | Tabs | `panes/TabBar.tsx` tab reorder. | Horizontal sortable — small primitive variation. |
| **6** | Timeline + remaining | `timeline/TimelineGrid.tsx`, `timeline/TimelineSidebar.tsx`, plus `OptionEditor.tsx` and `EditorView.tsx` if they have meaningful drag (verify on entry). | Likely the second-biggest phase after POV. |
| **7** | Cleanup & mobile verify | Verify `MobileApp.tsx` works with all migrated shared components. Delete legacy: `useAutoScrollOnDrag`, `canDragRef` patterns, `setTimeout` workarounds, `OutlineSceneRow` if unused, dead CSS. | Finalize. |

**Rough effort estimate:** 9–13 implementation sessions total. Phase 1 ≈ 2–3 sessions; later phases ≈ 1–2 each.

## 8. Accessibility & cross-platform

### 8.1 Keyboard reorder (free with dnd-kit)

- Tab to focus a draggable row
- Space or Enter to "pick up"
- Arrow Up / Down to move
- Space or Enter to drop
- Escape to cancel
- `KeyboardSensor` + dnd-kit's announcer hook handles screen reader announcements ("Picked up scene 3 of 12. Use arrow keys to move.")

### 8.2 Touch / iPad

- `PointerSensor` handles mouse, pen, and touch uniformly
- `RailsView.tsx`'s ~100 lines of custom `handlePointerDown` / `handlePointerMove` / `handlePointerUp` / ghost div / `elementFromPoint` hit-testing all gets deleted in Phase 2
- iPad (Capacitor wrapper / `MobileApp.tsx`) inherits the migration via shared components — no separate touch code path

### 8.3 Reduced motion

- `prefers-reduced-motion` media query disables the slide animation; drop indicator still appears so target remains clear
- One CSS rule in `dnd/SortableItem.tsx`'s styles file

## 9. Verification protocol

This project has no test suite. Verification per phase:

1. **Build check:** `npx vite build` passes with zero errors
2. **Manual test matrix** in dev (`npm run dev`):
   - Drag a scene to start of view, middle, end, into different section, into empty section, into bullpen
   - Drag from bullpen back into a section
   - Cancel drag mid-way (Escape)
   - Drag near top/bottom edges to verify auto-scroll
   - Click scene title to edit (verify drag doesn't fire)
   - Keyboard reorder: Tab to row, Space, Arrow Down, Space (verify screen reader announces)
   - Verify on iPad context if migrated view appears in MobileApp
3. **Commit + auto-release** (per project release flow in `CLAUDE.md` — push to main triggers GitHub Actions)

## 10. Open questions / future work

- **Multi-select drag** (cmd-click multiple, drag set as one) — architected for, not implemented. Future PR.
- **Section drag** in POV view — deferred. Sections stay button-controlled.
- **"Set aside section" button** — small follow-up: button on section header that moves the section's scenes to bullpen and removes the section.
- **Drop indicator color** — `#22c55e` to start. May tune to a yellower / softer accent after seeing it in the actual app.

## 11. Glossary

- **`<DndContext>`** — dnd-kit's top-level provider for a drag-and-drop region. Owns sensor state, drag events.
- **`<SortableContext>`** — wraps a list of sortable items; provides each item with positional context for the slide animation.
- **`useSortable()`** — hook used inside each item; returns `{ attributes, listeners, setNodeRef, transform, transition }`.
- **`<DragOverlay>`** — renders the floating preview that follows the cursor during drag.
- **Sensor** — input source (`PointerSensor`, `KeyboardSensor`). `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))` requires 5px movement before drag activates, preventing accidental drags during clicks.
- **`arrayMove(arr, from, to)`** — utility to reorder an array immutably.
