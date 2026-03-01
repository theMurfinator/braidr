# Rails & Braided View Drag-and-Drop Redesign

## Problem

Drag-and-drop in the Rails view is unreliable and confusing:
1. **Accuracy:** Two competing drop detection systems (drop zone divs AND `findDropIndexFromMouse` midpoint calculation) disagree, causing scenes to land in wrong positions
2. **Clarity:** Row highlighting tries to show "insert above this row" which is inherently ambiguous — users can't tell where the scene will land
3. **Scrolling:** No auto-scroll exists in either Rails or Braided views. Moving scenes across large distances requires fighting the UI.

## Approach: Explicit Drop Zones + Insertion Line + Auto-Scroll

Single approach using native HTML5 Drag & Drop API (no new libraries).

## Design

### 1. Drop Zone Redesign (Rails View)

Remove all competing detection systems. Drop zone divs between rows become the sole source of truth.

**Remove entirely:**
- `findDropIndexFromMouse()` — no more midpoint calculation
- `handleGridDragOver` / `handleGridDrop` — no grid-level fallback handlers
- `drop-target-row` class and all row highlighting styles
- `is-dragging` class that expanded drop zones to 20px with dashed borders

**Drop zone states:**
- **Not dragging:** Invisible, 0px height
- **Dragging:** 12px height, subtle dashed border — visible but not disruptive
- **Hovered during drag:** 4px height with bold 3px solid green insertion line centered in it, plus small green circle marker on left edge. No big expanding gap — just a clean, unmistakable line.

### 2. Auto-Scroll During Drag (Both Views)

New shared hook: `useAutoScrollOnDrag(scrollContainerRef, isDragging)`

- Top/bottom 80px of scroll container are "scroll zones"
- Speed scales with proximity: ~3px/frame at 80px from edge, ~15px/frame at 10px
- Uses `requestAnimationFrame` loop, only runs while dragging
- Updates drop target index as view scrolls under cursor

Applied to:
- Rails view: `scrollRef` (.rails-main container)
- Braided view: `timelineRef` (.braided-timeline container)

### 3. Drag Visual Feedback

- Keep opacity reduction (0.4) on source card
- Set clean drag image via `e.dataTransfer.setDragImage()` — cloned card with slight scale-down and drop shadow
- Insertion line between rows is the **only** drop indicator — no row highlights, no card border changes

## Files Changed

| File | Changes |
|------|---------|
| `src/renderer/hooks/useAutoScrollOnDrag.ts` | New file — shared auto-scroll hook |
| `src/renderer/components/RailsView.tsx` | Remove `findDropIndexFromMouse`, grid-level handlers, `drop-target-row` logic. Add auto-scroll hook. Add drag image setup. |
| `src/renderer/styles.css` | New insertion line styles (green line + circle marker). Remove `drop-target-row` styles. Clean drop zone states. |
| `src/renderer/App.tsx` | Import and call auto-scroll hook for Braided view |
| `src/renderer/components/RailsSceneCard.tsx` | No changes needed |

No new dependencies.
