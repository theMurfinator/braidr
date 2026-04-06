# Braidr iPad App — UI Redesign

## Lessons from Scrivener and other iPad writing apps

**Scrivener iOS** uses a hierarchical drill-down (Projects → Binder → Editor) with a toggleable sidebar on iPad. The binder sidebar shows/hides alongside the editor. Corkboard is iPad-only. They explicitly chose NOT to replicate the desktop — the iOS version is its own thing.

**Ulysses** uses a three-panel layout: Library → Sheet List → Editor. This works well on iPad because each panel has clear boundaries and can collapse.

**iA Writer** goes full minimal: just the editor. No sidebar, no metadata, no buttons. Focus mode highlights the current sentence. Markdown-based.

**Key takeaway from all apps:** Don't shrink the desktop app. Build a simple, touch-native experience focused on the core writing workflow.

## What Braidr iPad needs to do

Brian is on a 6-hour flight. He wants to:
1. Open his novel project
2. Review his outline (POV view — which scenes exist, what order)
3. Write prose for a scene (Editor)
4. Check his braided timeline (Rails — where scenes fall chronologically)
5. Look at research notes (Notes)

That's it. No tag management, no analytics, no timeline canvas, no graph view.

## Proposed design: Simple, touch-native

### Navigation: Bottom tab bar

Four tabs at the bottom of the screen (standard iOS pattern):

```
┌─────────────────────────────────┐
│                                 │
│         [Full screen view]      │
│                                 │
│                                 │
├────────┬────────┬───────┬───────┤
│  POV   │ Editor │ Rails │ Notes │
└────────┴────────┴───────┴───────┘
```

No left sidebar. No toolbar. Each view gets the full screen. Bottom tab bar stays visible always (48px tall, inside safe area).

### POV tab

- Character picker at the top (horizontal scrollable pills, not a dropdown)
- Below: scrollable list of scenes grouped by plot point headers
- Each scene shows: number, title/content, tags
- Tap scene → opens in Editor tab with that scene selected
- "+" button to add scene at bottom of each section

### Editor tab

- Full-screen TipTap editor
- Scene picker: slide-in panel from the left edge (swipe right to reveal, tap outside to dismiss)
- Scene title above the editor
- No metadata sidebar — keep it simple. Word count shown inline below editor.
- Scratchpad accessible via a small pull-up panel from the bottom

### Rails tab

- The existing RailsView component, full screen
- Touch drag already partially implemented via pointer events
- No floating editor popup — tap a scene card to switch to Editor tab

### Notes tab

- The existing NotesView component, full screen
- Already self-contained with its own sidebar + editor

### Safe area

- Bottom tab bar sits above `env(safe-area-inset-bottom)`
- Content area sits below `env(safe-area-inset-top)`
- If `env()` returns 0 in simulator, use fixed fallback (24px top, 0 bottom)

## Technical approach

### Don't reuse desktop CSS

Build the mobile layout from scratch using:
- A new `MobileApp.css` (or inline styles) — no `!important` overrides
- Simple flexbox: column layout, tab bar at bottom, content fills remaining space
- Each view component rendered inside a container with `height: 100%; overflow: auto`

### Component reuse

The desktop view components (EditorView, RailsView, NotesView) are self-contained React components. They manage their own internal layout. We just need to:
1. Put them inside a container with a fixed height
2. Let their internal CSS handle the rest
3. Fix any overflow issues with targeted CSS (not `!important` blankets)

For POV, build a simple mobile-specific component instead of reusing PlotPointSection/SceneCard (which have desktop-specific drag handlers and layout assumptions). Use basic divs with the Lora font, matching the desktop's visual style without its CSS machinery.

### Development workflow

1. **Enable Capacitor live reload** — edit code, see changes instantly in simulator
2. **Use Safari Web Inspector** — connect to simulator, inspect elements, debug CSS in real time
3. **Build one tab at a time** — start with the container + tab bar, verify scrolling works with dummy content, then add real views

### File changes

- Create: `src/renderer/MobileApp.tsx` (rewrite from scratch)
- Create: `src/renderer/MobileApp.css` (mobile-only styles)
- Keep: `src/renderer/services/capacitorDataService.ts` (working)
- Keep: `src/renderer/services/conflictDetector.ts` (working)
- Keep: All desktop components unchanged
- Modify: `src/renderer/main.tsx` (already has platform detection)
