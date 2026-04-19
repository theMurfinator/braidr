# iPad Rails View — Design

**Date:** 2026-04-19
**Branch target:** `feature/ipad-rails` (off `main`)
**Predecessor:** `docs/superpowers/specs/2026-03-21-ipad-companion-app-design.md`

## Problem

The native iPad app (`BraidrIPad/`) ships four tabs: Outline, Editor, Timeline, Notes. The **Rails** view was in the redesign plan (POV | Editor | Rails | Notes) but never ported — `TimelineTab.swift` is a 92-line flat list, not the character-laned grid with drag-drop that the desktop `RailsView.tsx` (957 lines) provides.

Without Rails, Brian can't **place** unbraided scenes into the reading order while on a flight. The inbox-to-grid workflow is the missing loop.

## Scope

**In (v1):**
- Full-parity grid: sticky row numbers + header, scene cards per (character, timeline-position) cell
- Collapsible left Inbox drawer with per-character filter
- Drag-and-drop from drag handle: inbox → grid, grid ↔ grid (reorder), grid → inbox (unbraid)
- Inline card editing (title, tags, notes list) — matches desktop
- Tap card body → modal sheet for full-detail edit
- Insert-at-position: tap a row number → picks a character → inserts a new scene there
- Connection count badge (`🔗 n`) + tap-for-popover list of linked scenes

**Out (v2+):**
- Drawn connection lines across columns (badge-only in v1)
- Rails sub-mode toggles (list/table)
- Cross-device drag (UIDragInteraction across apps)
- Auto-scroll during horizontal pan while dragging (v1 scrolls vertical only during drag)

## Decisions (from brainstorm)

| # | Decision |
|---|---|
| 1 | Full parity with desktop Rails (minus drawn connection lines) |
| 2 | Pure SwiftUI port — no WKWebView, no hybrid bridge |
| 3 | Grid columns: `minmax(200pt, 1fr)` — fill when possible, pan horizontally when not |
| 4 | Inbox = collapsible left drawer, default collapsed |
| 5 | Tap card body = modal `.sheet` with full-detail editor |
| 6 | Connection lines deferred to v2; v1 ships a `🔗 n` badge + popover |
| 7 | Full inline card editing (user has iPad keyboard) |
| 8 | Drag initiated from dedicated `⋮⋮` handle, not long-press on card body |

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [☰ Inbox] [⚙ Settings]                  [Filter: All Chars] │  ← toolbar
├─────────────────────────────────────────────────────────────┤
│   # │  Noah        │  Maya        │  Kate        │  …      │  ← sticky header row
├─────┼──────────────┼──────────────┼──────────────┼─────────┤
│  1  │ [SceneCard]  │              │              │         │
│  2  │              │ [SceneCard]  │              │         │  ← grid body
│  3  │ [SceneCard]  │              │ [SceneCard]  │         │    (scrolls X+Y)
│  …  │              │              │              │         │
└─────────────────────────────────────────────────────────────┘
```

- The `#` column (row numbers) and character header row are sticky — they stay pinned while the body scrolls in either axis.
- Columns: `max(200pt, viewportWidth / characterCount)`. Viewport-fit when it can, min-width + horizontal pan when it can't.
- When the Inbox drawer opens, it slides in from the left and narrows the grid viewport (doesn't overlay). Toggled via toolbar button. Collapse state persists across launches.

## Components (new SwiftUI files under `Views/Rails/`)

```
Views/Rails/
├── RailsTab.swift              ← replaces TimelineTab; top-level tab view
├── RailsGridView.swift         ← the 2-axis scrollable grid
├── RailsHeaderRow.swift        ← sticky character header
├── RailsRowNumber.swift        ← sticky row-number cell + insert-at-position tap
├── RailsSceneCard.swift        ← inline-editable card
├── RailsInboxDrawer.swift      ← collapsible drawer + character filter
├── RailsInboxCard.swift        ← smaller card used inside drawer
├── SceneDetailSheet.swift      ← modal edit sheet (tap card body)
├── ConnectionBadge.swift       ← 🔗 n pill + popover
└── DragState.swift             ← @Observable global drag state (current scene, ghost pos, drop target)
```

`RailsTab` replaces `TimelineTab.swift` in `BraidrApp.swift`'s `TabView`. `TimelineTab.swift` is deleted (its flat-list view was a stopgap and is superseded).

## Data model / ViewModel

Add to `ProjectViewModel`:

```swift
// Scenes in the left drawer: for the current character filter, scenes with no timelinePosition.
func inboxScenes(filter: String /* "all" or characterId */) -> [Scene]

// Move an inbox scene to timeline position `target`, shifting other scenes down.
func placeSceneInBraid(sceneId: String, at target: Int)

// Remove a scene from the braid (nil out its timelinePosition), pushing it back to inbox.
func unbraidScene(sceneId: String)

// Reorder within the braid.
func moveBraidedScene(from: Int, to: Int)

// Insert a new empty scene at row `target` for the given character.
func insertNewScene(at target: Int, characterId: String) -> String  // returns new scene ID

// Connection queries (for badge count / popover).
func connections(for sceneId: String) -> [Scene]
```

All mutation calls follow the existing pattern (edit `project.timelineData`, then `saveTimelineInBackground()`).

Connection data already exists in `timelineData.connections` (`Record<sceneKey, sceneKey[]>`). Wire it through to `Scene.connectionCount` — add a computed property on the model.

## Drag-and-drop (SwiftUI, custom gesture)

Native `.draggable()` / `.dropDestination()` is too limited for our needs (ghost control, hit-testing across a scrolling grid, inbox ↔ grid transitions). Use a **custom DragGesture** feeding a shared `@Observable DragState`:

```swift
@Observable class DragState {
    var scene: Scene?                 // currently dragged
    var ghostPosition: CGPoint = .zero
    var dropTarget: DropTarget?       // .row(Int), .inbox, nil
}
```

- **Drag handle** on each card attaches `DragGesture(minimumDistance: 0)` with a haptic on lift.
- On drag start: set `scene`, show a floating ghost view (`ZStack` overlay at root of `RailsTab`) that follows `ghostPosition`.
- On drag update: translate the ghost, hit-test drop targets by comparing `value.location` against row frames captured via `.onGeometryChange` / `GeometryReader` preference keys.
- On drag end: dispatch to `placeSceneInBraid` / `moveBraidedScene` / `unbraidScene` based on `dropTarget`.
- **Vertical auto-scroll** while dragging near top/bottom edge (within 80pt): tick a timer that nudges the `ScrollViewReader`. Horizontal auto-scroll deferred to v2.

## Persistence

All reorder / place / unbraid / insert-new operations mutate `project.timelineData` and trigger the existing `saveTimelineInBackground()` (300ms debounce). Zero new file format; writes the same `timeline.json` the desktop app reads.

Inline-card edits to title/tags/notes go through the same per-scene `.md` write path the Outline tab already uses (`FileProjectService.writeCharacterOutline`), *not* timeline.json.

## Risks

1. **Sticky headers in two-axis scroll** — SwiftUI's native ScrollView doesn't directly support sticky headers in both axes. Likely needs a nested scroll setup (outer scroll = Y, inner scroll = X) or a `LazyVGrid` inside a single 2-axis `ScrollView` with manually-offset sticky overlays. Budget one spike day up front to prove the scrolling model before building cards.
2. **Drag frame capture** — `onGeometryChange` on 50+ cells may be expensive. Measure; fall back to a flat `rowFrames: [Int: CGRect]` dictionary computed once per layout.
3. **Keyboard + sheet + drag-ghost overlay** — layering order matters. The ghost must render above the sheet dimming but below any alerts. Verify with a smoke test scene.

## Build order (phased, each phase testable)

1. **Spike: 2-axis scroll with sticky headers + row numbers** — empty cells. Confirms the scroll model works before we invest in cards.
2. **Static grid rendering** — read-only scene cards in cells. No drag, no inbox, no edit. Just see the braid.
3. **Inbox drawer + character filter** — read-only. Drag deferred.
4. **Scene card inline editing** — title, tags, notes. Tap body → sheet (sheet can start stubbed).
5. **Drag-and-drop** — drag handle, ghost, drop targets, auto-scroll, all three flows (inbox → grid, grid ↔ grid, grid → inbox).
6. **Insert-at-position** — tap row number → character picker → new scene.
7. **Connection badge + popover** — read-only; counts wired to `timelineData.connections`.
8. **Polish pass** — haptics, animations, dark mode audit, accessibility labels.
9. **Delete `TimelineTab.swift`** and rewire `BraidrApp.swift` tabs.

Phases 1–2 prove technical feasibility. If phase 1 reveals a blocker, we re-evaluate (possibly fall back to hybrid WKWebView for just the grid). Each phase should ship a working build to device.

## Rollback

If the spike (phase 1) reveals SwiftUI can't do 2-axis sticky headers cleanly, fall back to approach C (hybrid): keep native tab/inbox/sheet, WKWebView for the grid only. The spec already has the pieces; the only change is `RailsGridView.swift` becomes a `UIViewRepresentable` hosting a trimmed `RailsView.tsx`. Document the decision in the plan.
