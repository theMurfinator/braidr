# Design: Aeon-Style Timeline Overhaul

**Date:** 2026-02-28

## Problem

Two bugs plus general UX shortcomings in the timeline view:

1. **Context bar slider doesn't move the canvas** — `TimelineCanvas` has no incoming `viewport` prop; it only reports viewport outward. When the context bar fires `onViewportChange`, the canvas never receives it.
2. **Next/prev scene buttons always disabled** — `SceneDetailPanel` splits `selectedSceneKey` on `:` expecting `characterId:sceneNumber` format, but keys are now `scene.id` UUIDs. `indexOf` always returns `-1`.
3. **No semantic zoom** — same card rendering at all zoom levels.
4. **Context bar is a basic slider** — no event density, no edge-drag zoom, no click-to-jump.
5. **View state resets** when switching views or restarting the app.

## Solution

Full Aeon Timeline-inspired overhaul of the calendar timeline view. Keep both canvas and grid sub-modes, fix both.

## Bug Fixes

### Context bar → canvas communication

Add a `viewport` prop (`{ start: number; end: number }`) to `TimelineCanvas`. Add a `useEffect` that translates incoming viewport fractions into `panRef`/`zoomRef` values and calls `draw()`. Reverse formula from `reportViewport`:

```
pan.x = -(startFrac * totalWidth + labelWidth * zoom)
```

For grid mode, fix `scrollLeft` math to account for the label column width.

### Next/prev scene navigation

Fix `SceneDetailPanel` to find scenes by `scenes.find(s => s.id === selectedSceneKey)` instead of splitting on `:`. Make next/prev also scroll the canvas/grid to show the target scene.

## Context Bar Upgrade

Transform from simple slider to Aeon-style minimap:

- **Event density dots** — small colored dots along the top of the bar showing scene density, colored by character
- **Draggable lens** — keep existing drag-to-scroll behavior
- **Edge-drag zoom** — drag left/right edges of the lens to widen/narrow it, zooming the main canvas
- **Click-to-jump** — click outside the lens to center the viewport there

## Semantic Zoom (3 levels)

Based on rendered column width (`colWidth * zoom`):

| Level | Column Width | Rendering |
|-------|-------------|-----------|
| Far (< 40px) | Thin | Colored dot or thin vertical bar, character color |
| Medium (40-120px) | Medium | Scene title truncated, character color border |
| Close (> 120px) | Wide | Title, character name, status badge, tags |

## Zoom Controls

- **Cmd/Ctrl + scroll wheel** on canvas — zoom centered on mouse position
- **Zoom slider** in the footer bar
- **Context bar edge-drag** — widen/narrow the lens
- **Pinch gesture** on trackpad

## Navigation

- **Next/prev scene buttons** — fixed, plus scroll canvas to target scene
- **Click on context bar** — jump to a date
- **Existing Cmd+K search** — already works project-wide

## Character Lanes

Keep existing lane rendering. Add:
- **Collapsible lane headers** — click character name to collapse/expand
- **Lane reordering** — drag character name headers to reorder

## View State Persistence

Save and restore timeline camera position:

### Between view switches (in-memory)
Store `{ pan, zoom, selectedSceneKey, subMode }` in App.tsx state/ref so navigating to notes/editor/POV and back restores the exact position.

### Between app sessions (on disk)
Persist to `timeline.json` as a new `viewState` field:
```typescript
viewState?: {
  panX: number;
  panY: number;
  zoom: number;
  selectedSceneKey: string | null;
  subMode: 'canvas' | 'grid';
}
```

Both scenarios use the same shape — difference is storage location (React state vs disk).

## Out of Scope

- Bookmarks (save/restore named camera positions)
- Split views with synchronized scroll
- Subway view (RailsView covers narrative flow)
- Calendar markers / world event improvements
