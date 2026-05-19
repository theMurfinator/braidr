# Chapters — Design Spec
_2026-05-19_

## Overview

Chapters are optional, cross-character containers that group scenes in reading order. They are a first-class concept in the braided and rails views, and are visible in the POV view as a sub-layer under plot points. Writers who don't use chapters see no change — the braided view looks identical to today.

The hierarchy across the two primary views is:

```
POV view:    Plot Point → Chapter (this character's scenes only) → Scene
Braided view:            Chapter (all characters)               → Scene
```

---

## Data Model

### New `Chapter` type (`src/shared/types.ts`)

```ts
export interface Chapter {
  id: string;
  title: string;
  order: number;        // global reading order across all chapters
  description?: string; // optional synopsis
}
```

### `Scene` additions

Two new fields on the existing `Scene` type:

```ts
chapterId: string | null;  // null = not assigned to a chapter (bullpen or unorganized)
sceneOrder: number;        // position within the chapter (0-indexed)
```

Global reading position is derived from `(chapter.order, scene.sceneOrder)` — the app manages this, writers never see the raw numbers.

### SQLite schema (`src/main/database.ts`)

New table:

```sql
CREATE TABLE IF NOT EXISTS chapters (
  id      TEXT PRIMARY KEY,
  title   TEXT NOT NULL,
  ord     INTEGER NOT NULL,
  description TEXT
);
```

Additions to `scenes` table:

```sql
ALTER TABLE scenes ADD COLUMN chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL;
ALTER TABLE scenes ADD COLUMN scene_order INTEGER NOT NULL DEFAULT 0;
```

### Migration

- The old `braided_chapters` table (position-based dividers with `before_position`) is removed.
- Legacy projects imported with no chapters: all scenes get `chapter_id = NULL`. The chapters table is empty. No migration is needed — the app handles a null `chapterId` on every scene gracefully.

---

## Braided List View

### No chapters
When a project has no chapters, the braided list looks identical to today. No chapter UI is shown.

### With chapters
Chapter headers appear as draggable containers. Scenes are indented inside their chapter.

**Layout:**
```
⠿  Chapter 1 · The Arrival          [✏️ ⋮]
     ⠿  Noah · Scene 1
     ⠿  Grace · Scene 1
     + add scene

⠿  Chapter 2 · First Contact        [✏️ ⋮]
     ⠿  Noah · Scene 2
     ⠿  Grace · Scene 2
     ⠿  Sam · Scene 1
     + add scene

+ Add chapter
```

**Drag behaviour:**
- Dragging a **chapter handle** (⠿ on the header) moves the entire chapter and all its scenes as a unit.
- Dragging a **scene handle** (⠿ on the scene row) reorders the scene within its chapter.
- Dragging a scene **onto a chapter header** moves the scene to that chapter, appended at the end.

**Chapter actions (⋮ menu):** rename, delete (scenes become unassigned), move up/down.

---

## Rails View

Chapter headers span all character columns as a full-width row.

```
┌─────────────────────────────────────────────────────┐
│ ⠿  Chapter 1 · The Arrival                          │
├───────────┬───────────┬───────────┬─────────────────┤
│           │   Noah    │   Grace   │      Sam        │
├───────────┼───────────┼───────────┼─────────────────┤
│  Row 1    │ Scene 1   │ Scene 1   │   (empty)       │
└───────────┴───────────┴───────────┴─────────────────┘
┌─────────────────────────────────────────────────────┐
│ ⠿  Chapter 2 · First Contact                        │
├───────────┬───────────┬───────────┬─────────────────┤
│  Row 2    │ Scene 2   │ Scene 2   │  Scene 1        │
└───────────┴───────────┴───────────┴─────────────────┘
```

**Drag behaviour:**
- Dragging the **chapter header** moves the entire chapter.
- Dragging a **scene card** onto a chapter header moves the scene to that chapter without moving the chapter.
- Dragging a scene card between scene cards reorders within the chapter.

---

## Table View

Chapter name renders as a group header row spanning all columns, with scenes below it. Chapters can be reordered by dragging the group header.

---

## POV View

Chapters appear as a sub-layer under plot points, filtered to show only the current character's scenes.

```
Noah's Arc

[Setup]
  [Chapter 1 · The Arrival]
    Scene 1: The chase
    Scene 2: The letter
  + add chapter

[Rising Action]
  [Chapter 3 · The Discovery]
    Scene 4: Finding the clue
  + add chapter
```

**Rules:**
- A chapter header only appears under a plot point if it has at least one scene from this character assigned to that plot point.
- In practice, a chapter fits within one plot point per character. If a character's scenes in one chapter span two plot points (edge case), the chapter header appears under each.
- "Add chapter" is available per-plot-point, creating a new global chapter placed after the last chapter in that context.
- Scenes can be reordered within a chapter from the POV view using the existing drag handle.

---

## Editor View

The current scene's chapter is shown as a label in the scene context bar (between the character name and scene number). Clicking it opens a chapter picker to reassign.

```
Noah  ·  Chapter 3 · The Discovery  ·  Scene 5
```

Editor sidebar management is deferred — tracked separately in LAUNCH_READINESS.md.

---

## Compile Modal

Updated to use `chapterId` + `scene.sceneOrder` for building the output order, replacing the old `beforePosition` model. The "include chapter headings" toggle and chapter-aware output remain unchanged in behaviour.

---

## IPC Handlers (`src/main/braidrIpc.ts`)

New channels:

| Channel | Direction | Purpose |
|---|---|---|
| `BRAIDR_GET_CHAPTERS` | renderer → main | Load all chapters for a project |
| `BRAIDR_SAVE_CHAPTER` | renderer → main | Create or update a chapter |
| `BRAIDR_DELETE_CHAPTER` | renderer → main | Delete a chapter (scenes set to `chapterId = null`) |
| `BRAIDR_REORDER_CHAPTERS` | renderer → main | Persist new chapter order after drag |
| `BRAIDR_ASSIGN_SCENE_TO_CHAPTER` | renderer → main | Move a scene to a chapter at a given `sceneOrder` |

---

## `App.tsx` state additions

```ts
const [chapters, setChapters] = useState<Chapter[]>([]);
const chaptersRef = useRef<Chapter[]>([]);
```

Handlers: `handleChaptersChange`, `handleAddChapter`, `handleDeleteChapter`, `handleReorderChapters`, `handleAssignSceneToChapter`.

---

## Out of scope (deferred)

- **Editor sidebar** — POV outline panel inside the editor for chapter/scene management while writing. Tabled; tracked in LAUNCH_READINESS.md.
- **Sections above chapters** — "Part 1 / Act 2" level groupings. Deferred; plot points already serve this purpose in the POV view. Can be added post-launch if users ask.
- **Cross-chapter drag in rails with a dedicated drop indicator** — initial implementation accepts drop onto chapter header; visual refinement is a follow-up.
