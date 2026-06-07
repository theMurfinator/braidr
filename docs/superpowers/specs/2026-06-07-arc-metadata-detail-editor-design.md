# Arc Metadata Detail Editor + Custom Fields

**Date:** 2026-06-07
**Status:** Design approved (pending spec review)

## Summary

Two related capabilities, inspired by ClickUp's task-detail metadata UI:

1. **A beautiful linear (vertical) detail editor** — a full-screen/modal view for going deep on a
   single Arc-grid item, showing all of its fields as a ClickUp-style list (icon + label left,
   editable value right). Opens for **all four** Arc row types: novel, act, section, scene.
2. **Custom metadata fields for acts/sections** — a new, addable field pool (beyond the fixed arc
   columns), mirroring the flexible metadata scenes already have. Custom fields are also selectable
   as **Arc grid columns**.

The same modal also becomes the new home for the scene metadata that currently lives in a plain
`EditorView` side panel — promoting it into the nicer UI.

## Goals

- Deep, pleasant single-item editing for acts/sections (and novel/scene), not just spreadsheet cells.
- User-definable custom fields for acts/sections, managed like scene/task field defs already are.
- Custom fields visible at-a-glance as optional Arc grid columns.
- No regression to existing scene metadata, and **no exposure to the plot-point bulk-save landmine**.

## Non-Goals (deferred)

- **Formula** and **date** custom field types (Brian's manuscript uses neither for arc-level work;
  formula needs a calc engine). Rating is in; date/formula are explicitly out of v1.
- Rollups / cross-entity aggregation.
- Reworking the scene metadata storage model (kept as-is).
- Custom fields on the Novel row (Novel shows built-in psychology fields only in v1; trivial to add
  to the arc pool later).

## Key Decisions (from brainstorming)

- **Detail UI form:** full-screen / modal detail view (not a side-by-side slide-out).
- **Custom-field pools — there are TWO, never shared:**
  - **Scene pool** = existing `metadataFieldDefs` / `sceneMetadata` (Setting, Scene Emotions, Hook,
    Scene goal, …). Unchanged.
  - **Arc pool** = new `arcFieldDefs` / `arcFieldValues`, **shared across acts + sections** (one
    definition appears on every act and every section). Novel opts out in v1.
- **Custom fields are also Arc grid columns** (toggleable via the existing `Columns ▾` menu).
- **v1 field types:** `text`, `dropdown`, `multiselect`, `number`, `rating` (1–5). Options for
  dropdown/multiselect carry **per-option colors** and the picker is **searchable** (real lists run
  47–72 options). Deferred: `date`, `formula`.
- **Open trigger:** an **expand icon on row hover**; the row name stays click-to-edit inline in the
  grid (preserves spreadsheet editing).
- **Modal scope:** opens for novel, act, section, scene. For scenes the modal **absorbs** the full
  detail editor (built-in arc fields + scene metadata + Tags + Timeline date + rich Notes +
  Connections), retiring `SceneDetailPanel`.

## Architecture

### Data model

```ts
// src/shared/types.ts — new, parallel to MetadataFieldDef (adds number + rating)
export interface ArcFieldDef {
  id: string;
  label: string;
  type: 'text' | 'dropdown' | 'multiselect' | 'number' | 'rating';
  options?: string[];                       // dropdown / multiselect
  optionColors?: Record<string, string>;    // per-option hex colors
  ratingMax?: number;                       // rating (default 5)
  order: number;
}

// TimelineData additions:
arcFieldDefs?: ArcFieldDef[];               // the shared act+section pool
// key = "act:<id>" | "section:<id>"  →  fieldId → value
arcFieldValues?: Record<string, Record<string, string | string[]>>;
```

Why a **separate** arc system rather than unifying with scene metadata or storing JSON on the
entities:

- **Avoids the plot-point bulk-save landmine** (see `project_plotpoint_bulk_save_landmine`): if
  section custom values were `plot_points` columns, `saveCharacterOutline`'s DELETE+re-INSERT could
  wipe them. Storing them in their own table, written by their own IPC, keeps them isolated — exactly
  like `scene_metadata_values`.
- **Queryable** for grid columns (a JSON blob is not).
- **No risky migration** of the working scene metadata system.

### Database (`src/main/database.ts`) — mirrors the scene-metadata methods

New tables:

```sql
arc_field_defs   (id TEXT PK, label TEXT, field_type TEXT, options TEXT,
                  option_colors TEXT, rating_max INTEGER, display_order INTEGER)
arc_field_values (entity_type TEXT, entity_id TEXT, field_def_id TEXT, value TEXT,
                  PRIMARY KEY (entity_type, entity_id, field_def_id))
```

New methods (parallel to `getMetadataFieldDefs` / `replaceMetadataFieldDefs` /
`getSceneMetadataValues` / `replaceSceneMetadataValues` / `getAllSceneMetadataValues`):

- `getArcFieldDefs()` / `replaceArcFieldDefs(defs)`
- `getArcFieldValues(entityType, entityId)` / `replaceArcFieldValues(entityType, entityId, values)`
- `getAllArcFieldValues()`
- On def delete: cascade-delete that def's rows from `arc_field_values`.

### IPC (`src/main/braidrIpc.ts`, `preload.ts`, `IPC_CHANNELS`)

- Load: include `arcFieldDefs` + `arcFieldValues` in the project load payload (alongside
  `metadataFieldDefs` / `sceneMetadata`).
- Save: dedicated handlers `replaceArcFieldDefs` and `replaceArcFieldValues(entityType, entityId,
  values)` — **per-entity writes, NEVER routed through `saveTimeline`** (same isolation pattern as
  scene metadata). This is the landmine guard.
- `dataService.ts` (interface + `ElectronDataService`): add matching methods; thread through the
  load payload type.

### The generic detail modal — `src/renderer/components/ArcDetailModal.tsx`

A **pure presentation component** driven by a field descriptor, so it knows nothing about acts vs
scenes:

```ts
type FieldRender =
  | { kind: 'text' | 'number' }
  | { kind: 'dropdown' | 'multiselect'; options: string[]; colors?: Record<string,string> }
  | { kind: 'rating'; max: number }
  | { kind: 'polarity' }       // reuse PolarityCell
  | { kind: 'tags' }           // reuse SceneDetailPanel tag picker (scene only)
  | { kind: 'richtext' }       // TipTap (scene Notes; scene only)
  | { kind: 'connections' };   // scene Connections (scene only)

interface DetailField {
  id: string; label: string; icon: ReactNode;
  render: FieldRender; value: string | string[];
  onChange: (v: string | string[]) => void;
  builtin: boolean;
}

interface ArcDetailModalProps {
  title: string;
  fields: DetailField[];
  // custom-field management (omitted for novel = built-ins only)
  fieldManager?: {
    defs: ArcFieldDef[] | MetadataFieldDef[];
    onAddDef; onUpdateDef; onDeleteDef; onReorderDefs;
  };
  onClose: () => void;
}
```

UI (ClickUp-style):
- One row per field: type icon + label (left), editable value (right).
- Colored option pills for dropdown/multiselect; **searchable** option picker for large lists.
- **"Hide empty fields"** toggle (default hide, since items can have ~30 fields).
- Footer: `+ Add field` and a ⚙ **manage fields** affordance.
- Keyboard: Esc closes; click-outside closes.

`ArcView` owns the descriptor builders (one per row kind) that map entity + field defs into
`DetailField[]` and wire `onChange` to the existing save callbacks (`onSaveAct`,
`onSavePlotPointArcFields`, `onSaveSceneArcFields`, `savePsych`) plus the new
`replaceArcFieldValues` / scene-metadata save.

### Field-definition management

A ⚙ panel mirroring `src/renderer/components/tasks/TaskFieldManager.tsx`:
- Add a field: name + type; for dropdown/multiselect, manage options with colors (reuse
  `OptionEditor.tsx` patterns); for rating, set max.
- Rename, edit options, reorder (dnd-kit), delete (confirm; delete cascades values).
- Arc pool edits go through `replaceArcFieldDefs`; scene-pool edits reuse the existing scene
  field-def flow already wired in `EditorView`.

### Dynamic Arc grid columns (`ArcView.tsx`)

- `ARC_COLUMNS` (built-ins) is concatenated with arc field defs mapped to `ArcColumn`s
  (`kind` derived from field type; new cell editors for `dropdown` / `multiselect` / `number` /
  `rating`; `text` already exists via `EditableCell`).
- The `Columns ▾` menu lists built-ins + custom; column order/visibility/width persistence
  (`braidr.arcColumns.v1` localStorage) extends to custom ids. Unknown ids (deleted fields) are
  filtered on load (the loader already does this for built-ins).
- Custom columns render values for **act/section** rows; **blank** for novel/scene rows (different
  pools).
- Per-row expand icon (hover) opens the modal.

### Retiring `SceneDetailPanel` (Phase 4)

`SceneDetailPanel` is used only in `src/renderer/components/timeline/TimelineView.tsx`. Phase 4
routes that entry point (and the Arc scene rows) to `ArcDetailModal` with the scene descriptor, then
deletes `SceneDetailPanel`.

## Phased implementation

Each phase ships working and is verified in the Electron app.

- **Phase 1 — Foundation + grid columns.** Types, DB tables/methods, IPC, dataService, dynamic Arc
  grid columns. Outcome: custom act/section fields can be created (via a minimal manager) and edited
  inline as grid columns.
- **Phase 2 — Modal for acts & sections** (the core ask). `ArcDetailModal` + full field manager,
  hover expand icon, descriptor builders for act/section. Built-in + custom fields in one list.
- **Phase 3 — Novel row** into the modal (built-in psychology fields; no custom pool).
- **Phase 4 — Scenes** into the modal: absorb scene metadata + Tags + Timeline date + rich Notes +
  Connections; route `TimelineView` + Arc scene rows to the modal; retire `SceneDetailPanel`.

## Error handling / edge cases

- Deleting a field def cascades its values (DB-level) so no orphans linger; grid drops the column.
- Renaming/retyping a def keeps existing values (best-effort; multiselect↔dropdown coercion: keep
  first value when narrowing).
- Large option lists: searchable picker, virtualized if needed.
- Unknown/stale field ids in saved column prefs are filtered on load.
- Number/rating values stored as strings (consistent with existing value columns); parsed on render.

## Testing

- **Unit (main):** arc-field DB layer — def CRUD, `replaceArcFieldValues` replace semantics,
  cascade-on-delete, `getAllArcFieldValues` shape.
- **Unit (renderer):** descriptor builders (entity + defs → `DetailField[]`), and the column-merge
  (built-ins + custom → grid template) including stale-id filtering.
- **Regression:** confirm scene metadata + `saveCharacterOutline` section save are untouched and
  arc values survive a section re-order/assign (the landmine scenario).
- **Manual:** per-phase verification in the Electron app (no visual companion, per Brian's
  preference): create fields, edit in grid + modal, hide-empty toggle, searchable pickers, colors,
  ratings.

## Affected files

- `src/shared/types.ts` — `ArcFieldDef`, `TimelineData` additions, `IPC_CHANNELS`.
- `src/main/database.ts` — tables + methods + row types.
- `src/main/braidrIpc.ts`, `src/main/preload.ts` — load payload + save handlers.
- `src/renderer/services/dataService.ts` (+ `capacitorDataService.ts` stub) — methods + payload type.
- `src/renderer/components/ArcView.tsx` — dynamic columns, hover expand, descriptor builders, modal mount.
- `src/renderer/components/ArcDetailModal.tsx` — **new**.
- Field manager (new or extracted, mirroring `tasks/TaskFieldManager.tsx`) + `OptionEditor` reuse.
- `src/renderer/components/timeline/TimelineView.tsx` — Phase 4 swap.
- `src/renderer/components/SceneDetailPanel.tsx` — Phase 4 removal.
- `docs/features.md` — document the new detail editor + custom arc fields.
