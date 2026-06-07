# Arc Metadata — Phase 1: Persistence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the data layer for a shared act+section custom-field pool (`arcFieldDefs` + `arcFieldValues`), persisted in its own SQLite tables and saved via dedicated per-entity IPC handlers — never through `saveTimeline`.

**Architecture:** Mirror the existing scene-metadata system (`metadata_field_defs` / `scene_metadata_values`) but as a separate, parallel pair of tables. Values are keyed by `(entity_type, entity_id, field_def_id)` with **no foreign key on `entity_id`**, so a `plot_points` DELETE+re-INSERT (the bulk-save landmine) cannot cascade-wipe them. Field defs cascade-delete their values. This is the foundation; the detail modal, dynamic grid columns, and field manager are later phases.

**Tech Stack:** TypeScript, Electron (main/preload/renderer IPC), better-sqlite3, Vitest.

---

### Task 1: Types, IPC channel constants, and DB row interfaces

**Files:**
- Modify: `src/shared/types.ts` (add `ArcFieldDef`, extend `TimelineData`, add two `IPC_CHANNELS` keys near line 556)
- Modify: `src/main/database.ts` (add two row interfaces near line 1281)

- [ ] **Step 1: Add the `ArcFieldDef` type**

In `src/shared/types.ts`, immediately after the `MetadataFieldDef` interface (ends at line 84), add:

```ts
// Custom field definitions for the Arc level (shared across acts + sections).
// Parallel to MetadataFieldDef but adds 'number' and 'rating' and ratingMax.
export interface ArcFieldDef {
  id: string;
  label: string;
  type: 'text' | 'dropdown' | 'multiselect' | 'number' | 'rating';
  options?: string[];                     // dropdown / multiselect
  optionColors?: Record<string, string>;  // per-option hex colors
  ratingMax?: number;                     // rating only (default 5)
  order: number;
}
```

- [ ] **Step 2: Extend `TimelineData`**

In `src/shared/types.ts`, in the `TimelineData` interface right after the `sceneMetadata` field (line 133), add:

```ts
  // Arc-level custom field definitions (project-wide, shared by acts + sections)
  arcFieldDefs?: ArcFieldDef[];
  // Per-entity arc field values keyed by "act:<id>" | "section:<id>" -> fieldId -> value
  arcFieldValues?: Record<string, Record<string, string | string[]>>;
```

- [ ] **Step 3: Add the two IPC channel constants**

In `src/shared/types.ts`, in `IPC_CHANNELS`, after `BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS` (line 556) add:

```ts
  BRAIDR_SAVE_ARC_FIELD_DEFS: 'braidr:save-arc-field-defs',
  BRAIDR_SAVE_ARC_FIELD_VALUES: 'braidr:save-arc-field-values',
```

- [ ] **Step 4: Add DB row interfaces**

In `src/main/database.ts`, after `SceneMetadataValueRow` (line 1281) add:

```ts
export interface ArcFieldDefRow { id: string; label: string; field_type: string; options: string | null; option_colors: string | null; rating_max: number | null; display_order: number }
export interface ArcFieldValueRow { entity_type: string; entity_id: string; field_def_id: string; value: string }
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no NEW errors referencing `ArcFieldDef`, `arcFieldDefs`, `arcFieldValues`, `ArcFieldDefRow`, or `ArcFieldValueRow`. (Pre-existing unrelated errors in the codebase are expected — see project memory.)

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/database.ts
git commit -m "feat(arc-fields): add ArcFieldDef type, TimelineData fields, IPC channels, row types"
```

---

### Task 2: Database tables + methods (TDD)

**Files:**
- Modify: `src/main/database.ts` (tables in `CREATE_SCHEMA` near line 291; methods near line 861)
- Test: `src/__tests__/arc-fields-db.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/arc-fields-db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'arc.braidr'));
}

describe('arc field defs + values', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips field defs', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([
      { id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 },
      { id: 'f2', label: 'Stakes', field_type: 'rating', options: null, option_colors: null, rating_max: 5, display_order: 1 },
    ]);
    const defs = db.getArcFieldDefs();
    expect(defs.map(d => d.id)).toEqual(['f1', 'f2']);
    expect(defs[1].rating_max).toBe(5);
  });

  it('replaceArcFieldValues replaces only that entity', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 }]);
    db.replaceArcFieldValues('section', 's1', [{ field_def_id: 'f1', value: '"grief"' }]);
    db.replaceArcFieldValues('act', 'a1', [{ field_def_id: 'f1', value: '"hope"' }]);
    // Re-save s1 only; a1 untouched
    db.replaceArcFieldValues('section', 's1', [{ field_def_id: 'f1', value: '"sorrow"' }]);
    const all = db.getAllArcFieldValues();
    const byKey = Object.fromEntries(all.map(r => [`${r.entity_type}:${r.entity_id}`, r.value]));
    expect(byKey['section:s1']).toBe('"sorrow"');
    expect(byKey['act:a1']).toBe('"hope"');
  });

  it('deleting a field def cascades its values', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 }]);
    db.replaceArcFieldValues('section', 's1', [{ field_def_id: 'f1', value: '"x"' }]);
    db.replaceArcFieldDefs([]); // removes f1
    expect(db.getAllArcFieldValues()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/arc-fields-db.test.ts`
Expected: FAIL — `db.replaceArcFieldDefs is not a function`.

- [ ] **Step 3: Add the tables to `CREATE_SCHEMA`**

In `src/main/database.ts`, after the `task_custom_field_values` table block (ends line 291) add:

```ts
  CREATE TABLE IF NOT EXISTS arc_field_defs (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    options TEXT,
    option_colors TEXT,
    rating_max INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS arc_field_values (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_def_id TEXT NOT NULL REFERENCES arc_field_defs(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '""',
    PRIMARY KEY (entity_type, entity_id, field_def_id)
  );
```

Note: `entity_id` intentionally has **no** foreign key to `acts`/`plot_points`. This is what makes section values immune to the `plot_points` bulk DELETE+re-INSERT landmine. `CREATE TABLE IF NOT EXISTS` runs on every open, so existing project files get these tables automatically (same mechanism as all other tables; no `migrate()` entry needed).

- [ ] **Step 4: Add the DB methods**

In `src/main/database.ts`, after `getAllSceneMetadataValues()` (ends line 861) add:

```ts
  // ── Arc field defs + values ───────────────────────────────────────────────
  getArcFieldDefs() {
    return this.db.prepare('SELECT * FROM arc_field_defs ORDER BY display_order').all() as ArcFieldDefRow[];
  }

  replaceArcFieldDefs(defs: ArcFieldDefRow[]) {
    this.db.prepare('DELETE FROM arc_field_defs').run();
    const insert = this.db.prepare('INSERT INTO arc_field_defs (id, label, field_type, options, option_colors, rating_max, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const d of defs) insert.run(d.id, d.label, d.field_type, d.options, d.option_colors, d.rating_max, d.display_order);
  }

  getArcFieldValues(entityType: string, entityId: string) {
    return this.db.prepare('SELECT * FROM arc_field_values WHERE entity_type = ? AND entity_id = ?').all(entityType, entityId) as ArcFieldValueRow[];
  }

  replaceArcFieldValues(entityType: string, entityId: string, values: { field_def_id: string; value: string }[]) {
    this.db.prepare('DELETE FROM arc_field_values WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId);
    const insert = this.db.prepare('INSERT INTO arc_field_values (entity_type, entity_id, field_def_id, value) VALUES (?, ?, ?, ?)');
    for (const v of values) insert.run(entityType, entityId, v.field_def_id, v.value);
  }

  getAllArcFieldValues() {
    return this.db.prepare('SELECT * FROM arc_field_values').all() as ArcFieldValueRow[];
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/arc-fields-db.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/database.ts src/__tests__/arc-fields-db.test.ts
git commit -m "feat(arc-fields): arc_field_defs + arc_field_values tables and DB methods"
```

---

### Task 3: Landmine regression test

**Files:**
- Test: `src/__tests__/arc-fields-landmine.test.ts` (create)

This proves section arc values survive the `plot_points` rebuild that historically wiped data (see `project_plotpoint_bulk_save_landmine`).

- [ ] **Step 1: Write the regression test**

Create `src/__tests__/arc-fields-landmine.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('arc field values survive plot_points rebuild (landmine guard)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-lm-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('keeps section values when its plot_point row is deleted and re-inserted with the same id', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(dir, 'lm.braidr'));
    const now = Date.now();
    db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    db.prepare('INSERT INTO plot_points (id, character_id, title, display_order, created_at) VALUES (?,?,?,?,?)').run('pp1', 'c1', 'Setup', 0, now);

    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 }]);
    db.replaceArcFieldValues('section', 'pp1', [{ field_def_id: 'f1', value: '"the muck"' }]);

    // Simulate the bulk plot_points rebuild (DELETE all + re-INSERT same id)
    db.prepare('DELETE FROM plot_points').run();
    db.prepare('INSERT INTO plot_points (id, character_id, title, display_order, created_at) VALUES (?,?,?,?,?)').run('pp1', 'c1', 'Setup', 0, now);

    const all = db.getAllArcFieldValues();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe('"the muck"');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/arc-fields-landmine.test.ts`
Expected: PASS. (It passes because `arc_field_values.entity_id` has no FK to `plot_points`, so no cascade fires.)

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/arc-fields-landmine.test.ts
git commit -m "test(arc-fields): regression proving values survive plot_points rebuild"
```

---

### Task 4: IPC — load shaping + dedicated save handlers

**Files:**
- Modify: `src/main/braidrIpc.ts` (import near line 4; load shaping near line 314; payload near line 483; new handlers after the `BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS` handler near line 1005)

- [ ] **Step 1: Import the type**

In `src/main/braidrIpc.ts` line 4, add `ArcFieldDef` to the existing import from `../shared/types`:

```ts
  Character, Scene, PlotPoint, Tag, ArchivedScene, MetadataFieldDef, ArcFieldDef,
```

- [ ] **Step 2: Shape arc data in the load handler**

In `src/main/braidrIpc.ts`, after the `sceneMetadata` build loop (ends line 314) add:

```ts
    // Arc field defs
    const arcDefRows = db.getArcFieldDefs();
    const arcFieldDefs: ArcFieldDef[] = arcDefRows.map(row => ({
      id: row.id,
      label: row.label,
      type: row.field_type as ArcFieldDef['type'],
      options: row.options ? (() => { try { return JSON.parse(row.options!); } catch { return undefined; } })() : undefined,
      optionColors: row.option_colors ? (() => { try { return JSON.parse(row.option_colors!); } catch { return undefined; } })() : undefined,
      ratingMax: row.rating_max ?? undefined,
      order: row.display_order,
    }));

    // Arc field values (bulk) -> keyed by "<entity_type>:<entity_id>"
    const arcValueRows = db.getAllArcFieldValues();
    const arcFieldValues: Record<string, Record<string, string | string[]>> = {};
    for (const row of arcValueRows) {
      try {
        (arcFieldValues[`${row.entity_type}:${row.entity_id}`] ??= {})[row.field_def_id] = JSON.parse(row.value);
      } catch {
        // Malformed arc value — skip rather than crash
      }
    }
```

- [ ] **Step 3: Include them in the returned payload**

In `src/main/braidrIpc.ts`, in the load return object after `sceneMetadata,` (line 483) add:

```ts
        arcFieldDefs,
        arcFieldValues,
```

- [ ] **Step 4: Add the two dedicated save handlers**

In `src/main/braidrIpc.ts`, after the `BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS` handler closes (line 1005) add:

```ts
ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_ARC_FIELD_DEFS, (_event, braidrPath: string, defs: ArcFieldDef[]) => {
  try {
    const db = getDb(braidrPath);
    db.replaceArcFieldDefs(defs.map(d => ({
      id: d.id,
      label: d.label,
      field_type: d.type,
      options: d.options ? JSON.stringify(d.options) : null,
      option_colors: d.optionColors ? JSON.stringify(d.optionColors) : null,
      rating_max: d.ratingMax ?? null,
      display_order: d.order,
    })));
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_ARC_FIELD_VALUES, (_event, braidrPath: string, entityType: 'act' | 'section', entityId: string, values: Record<string, string | string[]>) => {
  try {
    const db = getDb(braidrPath);
    db.replaceArcFieldValues(entityType, entityId, Object.entries(values).map(([field_def_id, value]) => ({
      field_def_id,
      value: JSON.stringify(value),
    })));
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});
```

Note: confirm the DB accessor helper name used by neighbouring handlers (e.g. `getDb(braidrPath)`); if the surrounding handlers use a different name (such as `openDb`), match it exactly.

- [ ] **Step 5: Verify the handlers reference real channels and compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors. Then:
Run: `grep -n "BRAIDR_SAVE_ARC_FIELD" src/main/braidrIpc.ts`
Expected: two handler registrations printed.

- [ ] **Step 6: Commit**

```bash
git add src/main/braidrIpc.ts
git commit -m "feat(arc-fields): IPC load shaping + dedicated save handlers"
```

---

### Task 5: Preload bridge + dataService methods + load payload type

**Files:**
- Modify: `src/main/preload.ts` (near the `braidrSavePlotPointArcFields` bridge, line 319; and the `IPC_CHANNELS` mirror — see note)
- Modify: `src/renderer/services/dataService.ts` (interface near line 70; `ElectronDataService` near line 483; load payload type near lines 9 and 87)

- [ ] **Step 1: Expose the bridge methods in preload**

In `src/main/preload.ts`, after `braidrSavePlotPointArcFields` (line 319-320) add:

```ts
  braidrSaveArcFieldDefs: (braidrPath: string, defs: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_ARC_FIELD_DEFS, braidrPath, defs),
  braidrSaveArcFieldValues: (braidrPath: string, entityType: string, entityId: string, values: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_ARC_FIELD_VALUES, braidrPath, entityType, entityId, values),
```

Note (per project memory): `preload.ts` duplicates `IPC_CHANNELS` rather than importing it. Add the two new keys (`BRAIDR_SAVE_ARC_FIELD_DEFS`, `BRAIDR_SAVE_ARC_FIELD_VALUES`) to preload's local copy with the **same string values** as in `types.ts`. Grep first: `grep -n "BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS" src/main/preload.ts` — add the new keys beside it.

- [ ] **Step 2: Extend the dataService load payload type**

In `src/renderer/services/dataService.ts`, the `loadProject` return type appears twice (interface line 9, impl line 87). In **both**, after `sceneMetadata: Record<string, Record<string, string | string[]>>;` add:

```ts
 arcFieldDefs: ArcFieldDef[]; arcFieldValues: Record<string, Record<string, string | string[]>>;
```

Ensure `ArcFieldDef` is imported at the top of the file (add to the existing `../../shared/types` import).

- [ ] **Step 3: Add interface methods**

In `src/renderer/services/dataService.ts`, after `savePlotPointArcFields(...)` (interface, line 70) add:

```ts
  saveArcFieldDefs(defs: ArcFieldDef[]): Promise<void>;
  saveArcFieldValues(entityType: 'act' | 'section', entityId: string, values: Record<string, string | string[]>): Promise<void>;
```

- [ ] **Step 4: Implement them on `ElectronDataService`**

In `src/renderer/services/dataService.ts`, after the `savePlotPointArcFields` implementation (closes around line 484) add:

```ts
  async saveArcFieldDefs(defs: ArcFieldDef[]): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveArcFieldDefs(this.braidrPath, defs) as any;
    if (!result?.success) throw new Error(result?.error || 'Failed to save arc field defs');
  }

  async saveArcFieldValues(entityType: 'act' | 'section', entityId: string, values: Record<string, string | string[]>): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveArcFieldValues(this.braidrPath, entityType, entityId, values) as any;
    if (!result?.success) throw new Error(result?.error || 'Failed to save arc field values');
  }
```

If `window.electronAPI` has a TypeScript type declaration (grep `braidrSavePlotPointArcFields` in `src/renderer` / a `*.d.ts`), add matching signatures for `braidrSaveArcFieldDefs` / `braidrSaveArcFieldValues` there.

- [ ] **Step 5: Verify compile + capacitor stub**

The mobile `capacitorDataService.ts` implements the same interface. Add no-op stubs there to satisfy the interface:

```ts
  async saveArcFieldDefs(): Promise<void> { /* not supported on mobile */ }
  async saveArcFieldValues(): Promise<void> { /* not supported on mobile */ }
```
(and include `arcFieldDefs: [], arcFieldValues: {}` in whatever stub object its `loadProject` returns, if it returns a typed payload.)

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about missing `saveArcFieldDefs` / `saveArcFieldValues` / `arcFieldDefs`.

- [ ] **Step 6: Commit**

```bash
git add src/main/preload.ts src/renderer/services/dataService.ts src/renderer/services/capacitorDataService.ts
git commit -m "feat(arc-fields): preload bridge + dataService methods + load payload type"
```

---

### Task 6: Load arc data into App state (no UI yet)

**Files:**
- Modify: `src/renderer/App.tsx` (where the load payload is consumed; grep `metadataFieldDefs` and `sceneMetadata` to find the load handler and state)

This makes `arcFieldDefs` / `arcFieldValues` available in renderer state and gives the UI phases their save entry points. No visible UI change.

- [ ] **Step 1: Add state**

In `src/renderer/App.tsx`, next to the existing `metadataFieldDefs` / `sceneMetadata` state declarations (grep `useState` near those names), add:

```ts
  const [arcFieldDefs, setArcFieldDefs] = useState<ArcFieldDef[]>([]);
  const [arcFieldValues, setArcFieldValues] = useState<Record<string, Record<string, string | string[]>>>({});
```

Import `ArcFieldDef` from `../shared/types` if not already imported.

- [ ] **Step 2: Populate from the load result**

In `src/renderer/App.tsx`, where the load result sets `setMetadataFieldDefs(...)` / `setSceneMetadata(...)` (grep `setSceneMetadata`), add alongside:

```ts
      setArcFieldDefs(result.arcFieldDefs ?? []);
      setArcFieldValues(result.arcFieldValues ?? {});
```

- [ ] **Step 3: Verify compile + full test suite green**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.
Run: `npx vitest run`
Expected: all tests pass (including the two new arc-fields test files).

- [ ] **Step 4: Manual smoke test in the Electron app**

Per Brian's no-visual-companion preference, verify in the real app:
1. `npm run dev` (or the project's documented launch command).
2. Open an existing `.braidr` project.
3. Confirm it loads with no errors in the console (the new tables are created on open; `arcFieldDefs`/`arcFieldValues` load empty).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(arc-fields): load arc field defs + values into App state"
```

---

## Phase 1 Done — what's next

Foundation complete: the shared arc custom-field pool persists in isolated tables, is saved via dedicated handlers, survives the plot-point bulk-save landmine (proven by test), and is loaded into renderer state.

**Phase 2 (separate plan):** `ArcDetailModal` + field manager + dynamic Arc grid columns, wired for acts & sections — the first user-visible slice. Then Phase 3 (novel) and Phase 4 (scenes; retire `SceneDetailPanel`).

## Self-review notes (addressed)

- **Spec coverage:** Phase 1 covers the spec's Data model + Database + IPC + dataService + landmine guard sections. Modal, field manager, dynamic grid columns, novel, scenes are explicitly deferred to later phases (matches the spec's phasing).
- **Type consistency:** `ArcFieldDef` (renderer shape: `type`, `optionColors`, `ratingMax`, `order`) vs `ArcFieldDefRow` (DB shape: `field_type`, `option_colors`, `rating_max`, `display_order`) are mapped in both directions in Task 4 (load) and Task 4 Step 4 (save) — consistent with the existing `MetadataFieldDef` ↔ `MetadataFieldDefRow` mapping.
- **No FK on `entity_id`** is deliberate and is the crux of the landmine guard (Task 2 Step 3 note + Task 3 test).
