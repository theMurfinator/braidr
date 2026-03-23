# Braidr iPad UI — Goals

## What we're building

A companion iPad app for writing on the go. Not a full rebuild — the same React codebase running in a Capacitor WebView. The desktop Electron app remains the primary workspace.

## Use case

Brian travels frequently (6+ hour flights) and wants to write, review outlines, and work on notes from a 13" iPad Pro. Full round-trip sync via iCloud Drive or Dropbox — edits made on iPad show up on the Mac, and vice versa.

## What's done

- **Data layer (Phase 1):** Per-scene content extracted from timeline.json into individual files. Desktop app verified working. Sync-safe for multi-device editing.
- **CapacitorDataService:** Full DataService implementation using Capacitor Filesystem plugin. File reading/writing works.
- **Platform detection:** App correctly chooses Electron vs Capacitor DataService.

## What's NOT done (the UI)

The MobileApp shell exists but has persistent issues:

1. **Scrolling doesn't work** — iOS WebView requires every container in the height chain to have bounded heights for `overflow-y: auto` to function. The current CSS overrides haven't achieved this.
2. **Editor right sidebar cut off** — The metadata panel extends beyond the viewport.
3. **Rails drag-and-drop broken** — Touch pointer events exist but scenes don't actually move/place correctly.
4. **POV view** — PlotPointSection renders but interaction quality is poor on touch.
5. **Overall CSS approach** — Layering `!important` overrides on desktop CSS classes is fragile. May need a dedicated mobile stylesheet or a different layout strategy.

## What the iPad app should feel like

It should look and behave like the desktop app — same fonts (Lora), same light color scheme, same component structure. The four views:

- **POV:** Character selector, scrollable list of scenes grouped by plot points. Tap a scene's → button to open in Editor.
- **Editor:** Scene list sidebar (left), TipTap prose editor (center), metadata panel (right). This is the main writing view.
- **Rails:** Braided timeline with character lanes. Scene cards with drag-to-reorder.
- **Notes:** Note tree sidebar, rich text editor, backlinks panel.

Each view is a self-contained desktop component (EditorView, RailsView, NotesView). They manage their own internal layout. The MobileApp just needs to host them in a simple tab-bar + content structure and make sure scrolling/heights work on iOS.

## Next steps

The remaining work is CSS/layout — making the desktop components render correctly inside a Capacitor iOS WebView. The data layer, save handlers, auto-save, and component wiring are all in place.
