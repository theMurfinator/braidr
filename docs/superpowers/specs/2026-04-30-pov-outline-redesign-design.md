# POV Outline Redesign

**Date:** 2026-04-30
**Status:** Draft

## Overview

Replace the current card-based POV view with a clean, Obsidian/Notion-style outline. Scenes become compact rows (number + title + character tag) with synopsis shown inline or collapsed per-section. A bullpen panel on the right replaces the TOC sidebar for parking scenes.

## Motivation

The current POV view feels chunky — 18px padding per scene card, full synopsis sections always expanded, multiple metadata rows, 48px gaps between plot point sections. Writers want the POV to feel like typing into a document, not managing a dashboard of cards.

## Design

### New Component: `OutlineSceneRow`

**File:** `src/renderer/components/OutlineSceneRow.tsx`

Replaces SceneCard in the POV view only. SceneCard remains untouched for braided view, editor, etc.

**Layout:**
- Single line: drag handle (on hover) | scene number | editable title | character tag | "Set aside" button (on hover)
- Second line: synopsis text, indented to align with title

**Title editing:** Inline contenteditable span. On blur or Enter, calls `onSceneChange` with updated content.

**Synopsis editing:** Plain text (no TipTap). The full rich editing experience stays in the Editor view. Synopsis maps to `scene.notes[0]` or a joined string of `scene.notes`.

**Synopsis visibility:** Controlled by parent via `synopsisVisible: boolean` prop. When hidden, synopsis has `max-height: 0` with CSS transition. When the parent section is in "expand" mode, clicking the scene row toggles an `expanded` state that overrides to show the synopsis.

**Drag:** Entire row is `draggable="true"`, gated by drag handle mousedown (same pattern as current `canDragPovRef`).

**Props:**
```typescript
interface OutlineSceneRowProps {
  scene: Scene;
  displayNumber?: number;
  characterName?: string;
  synopsisVisible: boolean;        // controlled by section toggle
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onSetAside: (sceneId: string) => void;
  onDragStart: (scene: Scene) => void;
  onDragEnd: () => void;
  onOpenInEditor?: (sceneKey: string) => void;
  expandMode: boolean;             // section is in click-to-expand mode
}
```

### New Component: `BullpenPanel`

**File:** `src/renderer/components/BullpenPanel.tsx`

Right sidebar replacing the POV TOC. Shows scenes where `plotPointId === null`.

**Layout:**
- Header: "Bullpen" label + scene count
- Scene list: OutlineSceneRow for each bullpen scene (no scene number, no "Set aside" button)
- Each scene has a "Return" button on hover that opens a SectionPickerDropdown
- Empty state: italic message "Drag scenes here to set them aside for later"

**Drag support:**
- Drop target: accepts scenes dragged from the outline (sets `plotPointId = null`)
- Drag source: bullpen scenes can be dragged back into outline sections

**Props:**
```typescript
interface BullpenPanelProps {
  scenes: Scene[];                 // scenes with plotPointId === null
  plotPoints: PlotPoint[];         // for the section picker dropdown
  characters: Character[];         // for character name lookup
  onReturnScene: (sceneId: string, targetPlotPointId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onSceneDrop: (sceneId: string) => void;  // scene dragged into bullpen
  draggedScene: Scene | null;
  onDragStart: (scene: Scene) => void;
  onDragEnd: () => void;
}
```

### New Component: `SectionPickerDropdown`

**File:** `src/renderer/components/SectionPickerDropdown.tsx`

Small popover triggered by "Return" button in the bullpen.

**Layout:**
- Lists all plot point sections for the current character
- Each item shows the section title
- Click selects the section and calls `onSelect(plotPointId)`
- Closes on selection or outside click

**Props:**
```typescript
interface SectionPickerDropdownProps {
  plotPoints: PlotPoint[];
  onSelect: (plotPointId: string) => void;
  onClose: () => void;
  anchorEl: HTMLElement;           // position relative to trigger button
}
```

### Modified: `PlotPointSection`

Add per-section synopsis toggle. Changes:

1. **New prop:** `synopsisMode: 'inline' | 'expand'` — controls whether synopses are visible or collapsed in this section
2. **New prop:** `onToggleSynopsisMode: (plotPointId: string) => void` — callback to toggle
3. **Section header:** Add a small chevron button next to the section label. Chevron rotates when collapsed.
4. **Scene rendering:** When in POV outline mode, render `OutlineSceneRow` instead of `SceneCard`. Controlled by a new prop `outlineMode: boolean`.
5. **Styling:** Reduce section top margin from 48px to ~20px. Remove heavyweight border-bottom on header.

Existing functionality (title editing, description, expected count, drag/drop zones, add scene button) remains unchanged.

### Modified: App.tsx POV Rendering

**Layout change:**
```
Before: .pov-layout > .pov-content + .pov-toc
After:  .pov-layout > .pov-content + .bullpen-panel
```

**State additions:**
- `sectionSynopsisModes: Record<string, 'inline' | 'expand'>` — per-section synopsis mode, keyed by plotPoint ID. Default: `'inline'` (synopses visible).

**New handlers:**
- `handleSetAside(sceneId)` — sets `scene.plotPointId = null`, saves. Scene appears in bullpen.
- `handleReturnFromBullpen(sceneId, targetPlotPointId)` — sets `scene.plotPointId = targetPlotPointId`, appends to end of section, renumbers, saves.
- `handleToggleSynopsisMode(plotPointId)` — toggles between 'inline' and 'expand' for that section.
- `handleSetAllSynopsisModes(mode)` — sets all sections to the same mode.

**Toolbar additions:**
- "Show all synopses" / "Hide all synopses" buttons in the POV view controls area.

**Floating scenes removal:**
- The block that renders scenes with `plotPointId === null` after all PlotPointSections is removed. Those scenes now appear in BullpenPanel.

### Styling

All new styles use existing CSS variables:
- `--bg-primary: #FFFFFF`, `--bg-secondary: #F8F8F8`
- `--text-primary: #1A1A1A`, `--text-secondary: #6B6B6B`, `--text-muted: #A0A0A0`
- `--border: #E8E8E8`
- `--font-body: 'Lora', Georgia, serif` (for titles and synopsis)
- `--font-ui: -apple-system, ...` (for UI elements, numbers, buttons)
- `--tag-people: #3D8B40` (for character tags)

**Key style targets:**
- Scene row: ~7px vertical padding, no borders between scenes
- Section header: 20px top margin, chevron + label + line
- Bullpen panel: 280px wide, `--bg-secondary` background, left border
- Drag handle: opacity 0 -> visible on row hover
- Synopsis: font-size 15px Lora, `--text-secondary` color, indented to align with title
- Drop indicators: 2px solid line (existing `--accent` color)

### What Stays the Same

- All data types (`Scene`, `PlotPoint`, `Character`, `Tag`)
- `SceneCard.tsx` — untouched, still used by braided view and editor
- All existing App.tsx handlers: `handleSceneChange`, `handlePovSceneDrop`, `handleDeleteScene`, `handlePlotPointChange`, etc.
- IPC layer and data persistence
- Connection system, metadata system, timeline dates

### What's Removed from POV View

- Word count display on scene rows
- TipTap editor for synopsis (plain text instead)
- Inline metadata fields
- Connection chips
- Date picker
- Movement arrows (up/down) — replaced by drag-and-drop
- TOC sidebar — replaced by bullpen panel
- Floating unassigned scenes at bottom — moved to bullpen

### Testing

- Verify scenes render correctly with numbers, titles, character tags
- Verify synopsis inline/expand toggle works per-section and globally
- Verify drag-and-drop reorder within sections
- Verify drag scene to bullpen (sets plotPointId = null)
- Verify drag scene from bullpen to section
- Verify "Return" button shows section picker and places scene correctly
- Verify "Set aside" button moves scene to bullpen
- Verify scene numbering updates after all move operations
- Verify title and synopsis editing saves correctly
- Verify "Open in editor" still works from outline rows
