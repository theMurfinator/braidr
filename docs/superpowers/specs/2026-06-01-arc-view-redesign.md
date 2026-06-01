# Arc View Redesign — V1

**Date:** 2026-06-01  
**Status:** Approved

## Overview

Simplify the Arc View to a clean, spreadsheet-like outline-table. Strip visual chrome (row-type label chips, toolbar), introduce a bullpen right sidebar for staging unplaced content, add a Dilemma column at every hierarchy level, and add right-click context menus for section assignment.

## Visual Changes

### Row hierarchy
Remove the colored "Novel" / "Act" / "Section" label chips from every row. Hierarchy is conveyed entirely by indentation and text weight:

| Level | Weight | Indent |
|-------|--------|--------|
| Novel (character name) | Bold, large | 0px |
| Act | Bold | 16px |
| Section | Normal | 36px |
| Scene | Dimmer / smaller | 52px |

### Styling
- Thinner row borders, tighter row padding — spreadsheet feel
- Remove the top toolbar (the "+ Act" / "+ Section" buttons); ghost rows at the bottom of each group remain
- Ghost row "+ Add act..." still creates an act inline in the table
- Ghost row "+ Add section..." now creates a section in the bullpen (not inline in the table)
- Ghost row "+ Add scene..." now creates a scene in the bullpen (not inline under a section)
- Keep the color-coded polarity badge picker exactly as-is

## Columns (V1 — fixed order)

`[Name] | Plot synopsis | Beginning | Ending | Turning point | Dilemma | Propelling Action | Polarity shift`

All 8 columns appear at every level. "Beginning" and "Ending" are blank/disabled on scene rows. "Dilemma", "Propelling Action", and "Turning point" are editable at all levels.

Column name mapping from current implementation:
- Synopsis → **Plot synopsis**
- Starting State → **Beginning**
- Ending State → **Ending**
- Transformation → **Turning point**
- *(new)* → **Dilemma**
- *(new)* → **Propelling Action**
- Polarity → **Polarity shift**

> **V2:** User-configurable column order and column picker from available scene/section/act metadata fields. Design this when V1 ships — it requires per-character (or per-project) column config stored in the DB and a drag-to-reorder columns UI.

## Bullpen Sidebar

A right-side panel, matching the POV view's bullpen pattern (`BullpenPanel.tsx`), containing unplaced sections and scenes.

### Contents
Two groups within the panel:
1. **Sections** — `PlotPoint` rows with no `actId`
2. **Scenes** — `Scene` rows with no `plotPointId`

### Placement flow
- All new sections and scenes are created in the bullpen, not in the table
- Acts are unaffected — the "+ Add act..." ghost row still creates acts directly in the table
- **Scene → table:** drag from bullpen, drop into a section slot (existing dnd-kit drag, same as POV view)
- **Section → table:** right-click in bullpen → "Assign to Act..." submenu → section moves under that act in the table

### "+ Add" actions
- "+ Add section..." ghost row → creates section in the bullpen
- "+ Add scene..." ghost row → creates scene in the bullpen
- "+ Add act..." ghost row → creates act inline in the table (unchanged)

## Context Menus

### Section row (in the table)
Right-click → context menu:
- **Move to Act...** — submenu listing all acts for this character; selecting one reassigns `actId`
- **Return to Bullpen** — sets `actId` to null; section moves to bullpen
- **Delete** — removes section and its scenes

### Section row (in the bullpen)
Right-click → context menu:
- **Assign to Act...** — submenu listing all acts; selecting one moves section into the table
- **Delete**

### Scene row (in the bullpen)
Right-click → context menu:
- **Assign to Section...** — submenu listing all sections; selecting one moves scene into the table (alternative to drag)
- **Delete**

## Data Changes

### `Scene` type + DB
Add fields: `dilemma: string`, `propellingAction: string` (default `''`)
- `scenes` table: `ALTER TABLE scenes ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''`
- `scenes` table: `ALTER TABLE scenes ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''`
- IPC: include in `saveSceneArcFields` handler

### `PlotPoint` type + DB
Add fields: `dilemma: string`, `propellingAction: string` (default `''`)
- `plot_points` table: `ALTER TABLE plot_points ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''`
- `plot_points` table: `ALTER TABLE plot_points ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''`
- IPC: include in `onSavePlotPointArcFields`

### `Act` type + DB
Add fields: `dilemma: string`, `propellingAction: string` (default `''`)
- `acts` table: `ALTER TABLE acts ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''`
- `acts` table: `ALTER TABLE acts ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''`
- IPC: include in `onSaveAct`

### `CharacterPsychology` type + DB
Add fields: `novelDilemma: string`, `novelPropellingAction: string` (default `''`)
- `character_psychology` table: `ALTER TABLE character_psychology ADD COLUMN novel_dilemma TEXT NOT NULL DEFAULT ''`
- `character_psychology` table: `ALTER TABLE character_psychology ADD COLUMN novel_propelling_action TEXT NOT NULL DEFAULT ''`
- IPC: include in psychology save handler

## Out of Scope (V1)

- Configurable column order or column picker (V2)
- Character Hub panel changes
- Any changes to the braided / POV / table views
- Scene editing within the arc table (scenes remain read-ish; polarity + turning point + dilemma are the arc-specific editable fields)
