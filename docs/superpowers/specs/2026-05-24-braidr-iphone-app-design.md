# Braidr for iPhone — Design Spec

**Date:** 2026-05-24
**Status:** Approved

## Overview

A universal iPhone/iPad app (SwiftUI) that gives writers access to their Braidr project on the go. Two screens: a Rails view for navigating the multi-POV timeline, and a clean Editor for writing scenes. Sells for $19.99 one-time on the App Store.

No dark mode. Portrait is primary. Landscape is a bonus, not required.

## Data & File Sync

- Reads and writes the existing `.braidr` SQLite file format (same schema as the desktop app)
- Files live in iCloud Drive — user saves their `.braidr` project to iCloud from the desktop, opens it on iPhone via the Files app or a built-in file picker
- No custom sync infrastructure needed — iCloud Drive handles it
- Read/write access to the SQLite file via `better-sqlite3` equivalent on iOS (SQLite.swift or GRDB)

## Screen 1: Rails View

The primary navigation screen. A scrollable grid visualizing the multi-POV timeline.

### Layout
- **Left gutter:** Row numbers (1, 2, 3…) — sticky, stay fixed when scrolling horizontally
- **Column headers:** One column per character, colored dot + name — scroll horizontally with grid
- **Grid rows:** One row per timeline position. Exactly one scene per row (one character occupies each slot). Empty cells are blank.
- **Horizontal scroll:** Reveals additional character columns. Row numbers remain fixed.
- **Vertical scroll:** Moves through the timeline.
- **Right-edge fade gradient:** Signals more columns off-screen.

### Scene Cards
- White card, 3px left color accent bar (character color), rounded corners
- Serif font (Lora or system serif) for title
- Small word count below title
- Active scene: blue ring outline

### Per-Character Connector Lines
- Thin vertical line in each character's column, connecting that character's scenes in their narrative sequence
- Line runs through empty rows between scenes
- Gap word count label beside the line (character color, small)
- Same visual logic as the desktop Rails view

### Topbar
- Project title (serif, left)
- `+` and `···` icons (right)

### Enter/Exit Selection Mode
- Long-press any scene card → enters selection mode
- Topbar becomes: `Cancel` · `N selected` (centered)
- Scene cards show circle checkboxes (top-right corner)
- Selected: filled blue circle with checkmark; unselected: faded to 55% opacity, empty circle
- Export bar slides up from bottom (see Export below)

## Screen 2: Editor

Opens when a scene card is tapped. Full-screen writing environment.

### Topbar
- `‹` back button (blue, returns to Rails)
- Center: character name + scene number (small caps, muted) above scene title (large serif)
- `···` button (right) — opens slide-up info sheet

### Body
- Padding 22px horizontal
- Serif font (Lora), 15.5px, line-height 1.82
- Pure prose — no word count, no UI chrome
- Autosave on edit

### Slide-Up Info Sheet (triggered by `···`)
- Covers ~65% of screen, slides up from bottom
- Drag handle pill at top
- Blank space below pill
- Editable rows (blue tappable values + `›` chevron):
  - Character
  - Plot point
  - Chapter
  - Status
  - Tags
- Read-only row (gray, no chevron):
  - Words (scene word count)
- Tapping an editable field opens a picker/selector appropriate to the field type

## Export

Triggered from selection mode export bar.

- **Export bar:** shows total word count of selection + `Share ↑` button
- **Share button** opens the native iOS share sheet
- Formats offered via share sheet: PDF, DOCX, plain text
- Scene order follows timeline position (reading order)

## Navigation Flow

```
iCloud file picker → Rails view
Rails view → tap scene → Editor
Editor → ‹ → Rails view
Rails view → long-press → selection mode → Share → iOS share sheet
```

## Technical Stack

- **Language:** Swift
- **UI:** SwiftUI (universal — iPhone and iPad same codebase)
- **Database:** GRDB.swift (SQLite wrapper) — reads `.braidr` file schema
- **File access:** UIDocumentPickerViewController + security-scoped bookmarks (persists access across launches)
- **Fonts:** Lora (Google Fonts, bundled) for serif elements
- **Export:** PDFKit (PDF), custom DOCX generation or share as RTF, plain text

## What Is Not In V1

- Creating new projects (open existing only)
- Adding or deleting characters
- Reordering scenes (read + write scene content only)
- Dark mode
- Landscape-specific layout (works in landscape, not optimized)
- Offline sync / conflict resolution beyond iCloud's native handling
