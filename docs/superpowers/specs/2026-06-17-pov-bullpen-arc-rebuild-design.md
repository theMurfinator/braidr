# POV Bullpen — Rebuild to Match Arc Bullpen

**Date:** 2026-06-17
**Branch:** `feature/pov-bullpen-arc-rebuild`

## Goal

Rebuild the POV view's bullpen (`BullpenPanel.tsx`) so it looks and functions like
the old arc view bullpen (`ArcBullpenPanel.tsx`): a compact, grouped, one-line-row
layout instead of the current heavy `OutlineSceneRow`-based list. Add a visible,
**persisted** "previous location" tag on each set-aside scene showing the section it
came from.

## Background

Two bullpen components exist today:

- **`ArcBullpenPanel.tsx`** (old arc view, "formatted better") — compact grouped
  layout: a **Sections** group and a **Scenes** group, each with counts; tiny
  one-line rows (drag handle + clickable label); nested scenes under expandable
  sections; right-click context menu (Assign / Delete).
- **`BullpenPanel.tsx`** (current POV) — renders each scene via the full
  `OutlineSceneRow`; per-scene **Return** button + `SectionPickerDropdown`. The
  previous-location data already exists in App's `previousPlotPointIds` state (set
  in `handleSetAside`) but is **only used inside the return dropdown, never shown as
  a tag**, and is **in-memory only** (lost on reload).

The arc view is hidden / folding into Table view, so we do **not** share a component;
we rewrite the POV panel in place and reuse the arc's CSS.

## Decisions (confirmed)

- **Return UX:** both — keep the inline Return button **and** add an arc-style
  right-click "Assign to Section" context menu.
- **Previous location:** persist to the database so the tag survives reloads.

## Design

### 1. Layout — rewrite `BullpenPanel.tsx`

Adopt the arc layout and **reuse the existing `arc-bullpen-*` CSS classes** so the
POV panel inherits the exact styling:

- Header: "Bullpen" title + collapse `»` button + resize handle (behavior already
  shared between the two panels).
- **Sections** group: set-aside (`inBullpen`) sections with a count; each section
  expandable, its nested scenes shown as compact rows.
- **Scenes** group: loose scenes (`plotPointId === null`) with a count.
- Compact one-line rows: drag handle (⠿) + clickable label (`cleanSceneTitle`).
  **Remove the `OutlineSceneRow` usage.**
- Keep the existing **"+ Add Scene"** button (POV bullpen only creates scenes).

Drag-and-drop droppable IDs and the collapse/resize wiring stay as they are today so
the existing POV drag contexts keep working.

### 2. "Previous location" tag

- Render a small pill on each loose-scene row, e.g. `was: Setup`, where the label is
  the title of the section the scene was set aside from.
- Resolve the title from `plotPoints` by `scene.previousPlotPointId`. If that section
  no longer exists, **hide the tag**.
- New `.bullpen-prev-tag` CSS class, styled like the arc tags.

### 3. Return UX (both)

- Keep the inline **Return** button + `SectionPickerDropdown`. The dropdown already
  pre-highlights the previous location via its `previousPlotPointId` prop — now fed
  from the persisted field.
- Add a right-click context menu mirroring `ArcBullpenContextMenu`:
  - **Assign to Section ▶** submenu → reuses `handleReturnFromBullpen`.
  - **Delete** → reuses the existing scene-delete handler.

### 4. Persistence (substrate-correct — no bulk-save landmine)

The previous-location pointer is structural, like `plotPointId`, so it lives as a
scenes-table column read alongside `plot_point_id` — **not** as a substrate
field_value.

1. **Scene type** (`src/shared/types.ts`): add `previousPlotPointId: string | null`.
2. **Schema** (`src/main/database.ts`): add `previous_plot_point_id TEXT` to the
   `scenes` CREATE TABLE, plus a `migrate()` guard following the existing pattern
   (`PRAGMA table_info(scenes)` → `ALTER TABLE scenes ADD COLUMN
   previous_plot_point_id TEXT`).
3. **Write — inside the `scene.move` mutation** (`src/main/mutations.ts`): in the
   same atomic `UPDATE scenes SET ...` that already runs on a move:
   - moving **to** the bullpen (`toPlotPointId === null`) **and** the scene currently
     has a `plot_point_id` → set `previous_plot_point_id` to that old id;
   - moving **out** of the bullpen (`toPlotPointId !== null`) → clear
     `previous_plot_point_id` to `null`.

   Because **every** route into the bullpen (the set-aside button *and*
   drag-to-bullpen) funnels through `scene.move`, this one change covers them all
   with no separate save and no DELETE+re-INSERT landmine.
4. **Read** (`src/main/database.ts` + `src/main/braidrIpc.ts`): add
   `previous_plot_point_id` to the `SceneRow` interface and the scene SELECT, and map
   `previousPlotPointId: row.previous_plot_point_id` where the Scene object is built.
5. **App.tsx:** replace the in-memory `previousPlotPointIds` state with the persisted
   field — derive the map (or pass `scene.previousPlotPointId` straight through) for
   both the `SectionPickerDropdown` and the new tag. Remove `setPreviousPlotPointIds`
   bookkeeping in `handleSetAside`.

No new IPC channel is required — persistence rides the existing `scene.move`
mutation.

## Out of scope

- No "+ New Section" creation in the POV bullpen.
- No arc Act-assignment.
- No Character Hub footer button.
- No changes to the (hidden) `ArcBullpenPanel.tsx`.

## Testing

- Set aside a sectioned scene → it appears in the Scenes group with a `was: <section>`
  tag.
- Restart the app / reload the project → the tag persists.
- Return via the inline button and via right-click Assign-to-Section → scene leaves
  the bullpen and lands at the end of the target section; tag data cleared.
- Drag a scene to the bullpen → same previous-location tag appears (proves the
  `scene.move` path covers drag, not just the button).
- Set aside a scene whose previous section is later deleted → tag is hidden, no crash.
- Migration: open an existing `.braidr` project created before this change → loads
  cleanly, no tags until scenes are newly set aside.
