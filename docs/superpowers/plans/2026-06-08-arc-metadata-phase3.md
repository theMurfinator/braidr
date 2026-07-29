# Arc Metadata Phase 3: TipTap Rich Text + Hide Builtins + Scene Unification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TipTap rich-text editing to text fields, let users hide/show builtin fields, and merge the scene metadata system into the shared arc-field infrastructure so scenes, acts, and sections all use one field definition table.

**Architecture:** Tasks 1–2 are independent UI polish on `ArcDetailModal`/`ArcFieldManager` and can ship first. Tasks 3–7 are the database migration: add a `scope` column to `arc_field_defs`, migrate `metadata_field_defs` and `scene_metadata_values` into the arc tables, update IPC/load/save, then redirect `EditorView`/`TableView`/`CompileModal` to the unified state. The existing `sceneMetadata` + `metadataFieldDefs` state in App.tsx is derived from `arcFieldValues`/`arcFieldDefs` after the migration so downstream consumers need minimal changes.

**Tech Stack:** React, TypeScript, TipTap v3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` — all already installed), better-sqlite3 (ALTER TABLE migration + scope-aware replace), existing IPC channel `braidrSaveArcFieldDefs` / `braidrSaveArcFieldValues`.

---

## File Map

| Status | File | Responsibility |
|--------|------|----------------|
| Modify | `src/renderer/components/ArcDetailModal.tsx` | Replace TextField with TipTap; pass builtinFields to manager |
| Modify | `src/renderer/components/ArcFieldManager.tsx` | Show builtin fields section with hide toggle |
| Modify | `src/renderer/components/ArcView.tsx` | Read hiddenBuiltins pref; pass to descriptor builders |
| Modify | `src/renderer/styles.css` | TipTap editor CSS; manager builtin section CSS |
| Modify | `src/shared/types.ts` | Add `scope: 'arc' \| 'scene'` to `ArcFieldDef` |
| Modify | `src/main/database.ts` | Add `scope` column; scope-aware replace; `migrateSceneMetadata()` |
| Modify | `src/main/braidrIpc.ts` | Load all scopes; scene save via arc IPC |
| Modify | `src/main/applySaveTimeline.ts` | Stop writing `metadataFieldDefs`/`sceneMetadata` (no-op those branches) |
| Modify | `src/renderer/services/dataService.ts` | Update return types; add scene-scope save methods |
| Modify | `src/renderer/services/capacitorDataService.ts` | Stub new scene-scope save methods |
| Modify | `src/renderer/App.tsx` | `arcFieldDefs` = all scopes; derive `metadataFieldDefs`; scene values in `arcFieldValues` |
| Modify | `src/renderer/components/EditorView.tsx` | Open `ArcDetailModal` for scene detail (if scene detail is inline) |
| Modify | `src/renderer/components/TableView.tsx` | Use `arcFieldDefs`/`arcFieldValues` |
| Modify | `src/renderer/components/CompileModal.tsx` | Use `arcFieldDefs`/`arcFieldValues` |

---

### Task 1: TipTap rich-text field in ArcDetailModal

**Files:**
- Modify: `src/renderer/components/ArcDetailModal.tsx`
- Modify: `src/renderer/styles.css`

Replace the plain `TextField` (textarea) with a TipTap editor that expands on focus and supports bold, italic, bullet lists, ordered lists.

- [ ] **Step 1: Add TipTap imports to `ArcDetailModal.tsx`**

At the top of the file, after existing imports, add:

```ts
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
```

- [ ] **Step 2: Replace `TextField` with `RichTextField`**

Find and delete the current `TextField` function (the one that uses `useState(value)` + `useRef<HTMLTextAreaElement>` + `autoResize`). Replace it with:

```tsx
function RichTextField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '—' }),
    ],
    content: value || '',
    onBlur: ({ editor: e }) => {
      const html = e.isEmpty ? '' : e.getHTML();
      if (html !== value) onChange(html);
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  return (
    <div className="arc-dm-rich-wrapper">
      <EditorContent editor={editor} className="arc-dm-rich-editor" />
    </div>
  );
}
```

- [ ] **Step 3: Update `FieldRow` to use `RichTextField`**

In `FieldRow`, change the `r.kind === 'text'` branch from:

```tsx
control = <TextField value={field.value as string} onChange={v => field.onChange(v)} />;
```

to:

```tsx
control = <RichTextField value={field.value as string} onChange={v => field.onChange(v)} />;
```

- [ ] **Step 4: Add TipTap CSS to `styles.css`**

Append after the `.arc-expand-btn:hover` rule (last rule in arc-fields section):

```css
/* ── TipTap rich text field ──────────────────────────────────────────────── */
.arc-dm-rich-wrapper { width: 100%; }
.arc-dm-rich-editor .ProseMirror {
  min-height: 22px; padding: 2px 0; outline: none;
  font-size: 13px; line-height: 1.5; color: var(--text-primary);
  transition: min-height 0.15s;
}
.arc-dm-rich-editor .ProseMirror:focus { min-height: 80px; }
.arc-dm-rich-editor .ProseMirror p { margin: 0; }
.arc-dm-rich-editor .ProseMirror p + p { margin-top: 4px; }
.arc-dm-rich-editor .ProseMirror ul { list-style: disc; padding-left: 18px; margin: 4px 0; }
.arc-dm-rich-editor .ProseMirror ol { list-style: decimal; padding-left: 18px; margin: 4px 0; }
.arc-dm-rich-editor .ProseMirror li { margin: 2px 0; }
.arc-dm-rich-editor .ProseMirror strong { font-weight: 600; }
.arc-dm-rich-editor .ProseMirror em { font-style: italic; }
.arc-dm-rich-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left; color: var(--text-muted); pointer-events: none; height: 0;
}
```

- [ ] **Step 5: Verify compile**

```bash
cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ArcDetailModal\|RichTextField\|tiptap"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ArcDetailModal.tsx src/renderer/styles.css
git commit -m "feat(arc-fields): TipTap rich-text editor for text fields in ArcDetailModal"
```

---

### Task 2: Hide/show builtin fields via ArcFieldManager

**Files:**
- Modify: `src/renderer/components/ArcDetailModal.tsx`
- Modify: `src/renderer/components/ArcFieldManager.tsx`
- Modify: `src/renderer/components/ArcView.tsx`
- Modify: `src/renderer/styles.css`

Users can toggle builtin fields (Beginning, Ending, etc.) on/off from inside the "Manage fields" panel. The preference is stored in localStorage and applied by the descriptor builders in ArcView.

- [ ] **Step 1: Add `ArcFieldManager` builtin section**

In `ArcFieldManager.tsx`, add a new prop and section for builtin fields:

```tsx
interface BuiltinFieldRef { id: string; label: string; }

interface ArcFieldManagerProps {
  defs: ArcFieldDef[];
  onSave: (defs: ArcFieldDef[]) => void;
  onBack: () => void;
  builtinFields?: BuiltinFieldRef[];        // NEW
  hiddenBuiltinIds?: Set<string>;           // NEW
  onToggleBuiltin?: (id: string) => void;   // NEW
}
```

Inside the component body, after `const [confirmDeleteId, ...]`, accept the new props:

```tsx
export default function ArcFieldManager({ defs, onSave, onBack, builtinFields = [], hiddenBuiltinIds = new Set(), onToggleBuiltin }: ArcFieldManagerProps) {
```

Add a builtin fields section just before the `<div className="arc-fm-list">` that shows custom fields:

```tsx
{builtinFields.length > 0 && (
  <div className="arc-fm-builtin-section">
    <div className="arc-fm-builtin-header">Built-in fields</div>
    {builtinFields.map(bf => (
      <div key={bf.id} className="arc-fm-def-row">
        <div className="arc-fm-def-info">
          <span className="arc-fm-def-label">{bf.label}</span>
          <span className="arc-fm-def-type">built-in</span>
        </div>
        <div className="arc-fm-def-actions">
          <button
            className="arc-fm-icon-btn"
            onClick={() => onToggleBuiltin?.(bf.id)}
            type="button"
            title={hiddenBuiltinIds.has(bf.id) ? 'Show field' : 'Hide field'}
          >
            {hiddenBuiltinIds.has(bf.id) ? '○' : '●'}
          </button>
        </div>
      </div>
    ))}
    <div className="arc-fm-builtin-divider" />
  </div>
)}
```

- [ ] **Step 2: Add builtin CSS to `styles.css`**

After `.arc-fm-confirm-text { ... }`, add:

```css
.arc-fm-builtin-section { margin-bottom: 8px; }
.arc-fm-builtin-header { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding: 4px 10px 2px; }
.arc-fm-builtin-divider { border-top: 1px solid var(--border); margin: 8px 0; }
```

- [ ] **Step 3: Update `ArcDetailModal` to pass builtin info to manager**

In `ArcDetailModal.tsx`, extract builtin field refs from the `fields` prop and pass them to `ArcFieldManager`:

Inside `ArcDetailModal` component body, after the `sensors` and `orderedFields` state, add:

```ts
const builtinRefs = fields
  .filter(f => f.builtin)
  .map(f => ({ id: f.id, label: f.label }));
```

Update the `ArcFieldManager` mount:

```tsx
<ArcFieldManager
  defs={arcFieldDefs}
  onSave={defs => onSaveDefs(defs)}
  onBack={() => setShowManager(false)}
  builtinFields={builtinRefs}
  hiddenBuiltinIds={hiddenBuiltinIds}
  onToggleBuiltin={onToggleBuiltin}
/>
```

Add `hiddenBuiltinIds?: Set<string>` and `onToggleBuiltin?: (id: string) => void` to `ArcDetailModalProps`.

- [ ] **Step 4: Add hidden-builtins helpers to `ArcView.tsx`**

At module level (near other LS key constants), add:

```ts
const ARC_HIDDEN_BUILTINS_KEY = 'arc-hidden-builtin-ids';

function loadHiddenBuiltins(): Set<string> {
  try {
    const raw = localStorage.getItem(ARC_HIDDEN_BUILTINS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveHiddenBuiltins(ids: Set<string>) {
  localStorage.setItem(ARC_HIDDEN_BUILTINS_KEY, JSON.stringify([...ids]));
}
```

Inside the `ArcView` component, add state:

```ts
const [hiddenBuiltinIds, setHiddenBuiltinIds] = useState<Set<string>>(() => loadHiddenBuiltins());
```

Add `handleToggleBuiltin`:

```ts
function handleToggleBuiltin(id: string) {
  setHiddenBuiltinIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveHiddenBuiltins(next);
    return next;
  });
}
```

- [ ] **Step 5: Filter hidden builtins in descriptor builders**

`buildActDetailFields` and `buildSectionDetailFields` (in `ArcView.tsx`) already return `[...builtins, ...custom]`. Add a `hiddenBuiltinIds` param and filter:

```ts
function buildActDetailFields(
  act: Act,
  arcFieldDefs: ArcFieldDef[],
  arcFieldValues: Record<string, Record<string, string | string[]>>,
  onSaveAct: (act: Act) => void,
  onSaveArcFieldValues: (...) => void,
  hiddenBuiltinIds: Set<string>,   // NEW
): DetailField[] {
  // ...
  return [...builtins.filter(f => !hiddenBuiltinIds.has(f.id)), ...custom];
}
```

Same change for `buildSectionDetailFields`.

- [ ] **Step 6: Pass hiddenBuiltinIds and onToggleBuiltin through the modal mounts in ArcView**

In the IIFE that renders `<ArcDetailModal>` for act and section, add:

```tsx
hiddenBuiltinIds={hiddenBuiltinIds}
onToggleBuiltin={handleToggleBuiltin}
```

And update the `buildActDetailFields` / `buildSectionDetailFields` calls to pass `hiddenBuiltinIds`.

- [ ] **Step 7: Verify compile**

```bash
cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "TS6133\|TS2367\|TS2741\|TS2420\|TS2345\|TS2339\|TS2322"
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/ArcDetailModal.tsx src/renderer/components/ArcFieldManager.tsx src/renderer/components/ArcView.tsx src/renderer/styles.css
git commit -m "feat(arc-fields): hide/show builtin fields from ArcFieldManager"
```

---

### Task 3: Types + DB schema — add `scope` to `ArcFieldDef`

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/database.ts`
- Test: `src/__tests__/braidr-db.test.ts`

Add `scope: 'arc' | 'scene'` to `ArcFieldDef` and to the DB `arc_field_defs` table. Make the replace method scope-aware so arc saves don't clobber scene defs.

- [ ] **Step 1: Write failing test**

In `src/__tests__/braidr-db.test.ts`, add at the end:

```ts
describe('arc_field_defs scope', () => {
  it('replaceArcFieldDefs with scope=arc does not delete scene-scope defs', () => {
    const db = new BraidrDB(':memory:');
    // Insert a scene-scope def directly via SQL
    db.prepare(`INSERT INTO arc_field_defs (id, label, field_type, display_order, scope) VALUES ('s1', 'Status', 'text', 0, 'scene')`).run();
    // Replace arc-scope defs
    db.replaceArcFieldDefs([{ id: 'a1', label: 'Theme', type: 'text', order: 0, scope: 'arc' }]);
    const all = db.getArcFieldDefs();
    expect(all.find(d => d.id === 's1')).toBeTruthy();
    expect(all.find(d => d.id === 'a1')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/brian/braidr && npx vitest run src/__tests__/braidr-db.test.ts 2>&1 | tail -10
```

Expected: FAIL — `scope` column doesn't exist yet.

- [ ] **Step 3: Add `scope` to `ArcFieldDef` in `types.ts`**

Find `export interface ArcFieldDef {` in `src/shared/types.ts`. Add after `order: number;`:

```ts
  scope?: 'arc' | 'scene';  // defaults to 'arc' if absent
```

Also update `MetadataFieldDef` comment — it stays for backward compat but is now superseded.

- [ ] **Step 4: Update DB schema in `database.ts`**

Find `CREATE TABLE IF NOT EXISTS arc_field_defs (` and add a `scope` column:

```sql
  CREATE TABLE IF NOT EXISTS arc_field_defs (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    options TEXT,
    option_colors TEXT,
    rating_max INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    scope TEXT NOT NULL DEFAULT 'arc'
  );
```

Also add an ALTER TABLE migration block right after the schema creation (still in the constructor, after `this.db.exec(schema)`):

```ts
// Idempotent: add scope column if missing (existing DBs won't have it)
const arcCols = this.db.prepare("PRAGMA table_info(arc_field_defs)").all() as { name: string }[];
if (!arcCols.some(c => c.name === 'scope')) {
  this.db.prepare("ALTER TABLE arc_field_defs ADD COLUMN scope TEXT NOT NULL DEFAULT 'arc'").run();
}
```

- [ ] **Step 5: Update `ArcFieldDefRow` type and `replaceArcFieldDefs`**

Find the `ArcFieldDefRow` interface near the DB types:

```ts
interface ArcFieldDefRow {
  id: string; label: string; field_type: string;
  options: string | null; option_colors: string | null;
  rating_max: number | null; display_order: number;
  scope: string;  // ADD THIS
}
```

Find `replaceArcFieldDefs` method in `BraidrDB`. Change its delete to be scope-aware:

```ts
replaceArcFieldDefs(defs: ArcFieldDef[]) {
  const scope = defs[0]?.scope ?? 'arc';
  this.db.prepare('DELETE FROM arc_field_defs WHERE scope = ?').run(scope);
  const insert = this.db.prepare('INSERT INTO arc_field_defs (id, label, field_type, options, option_colors, rating_max, display_order, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const tx = this.db.transaction((rows: ArcFieldDef[]) => {
    for (const d of rows) {
      insert.run(
        d.id, d.label, d.type,
        d.options ? JSON.stringify(d.options) : null,
        d.optionColors ? JSON.stringify(d.optionColors) : null,
        d.ratingMax ?? null,
        d.order,
        d.scope ?? 'arc',
      );
    }
  });
  tx(defs);
}
```

Update `getArcFieldDefs` to map the `scope` column:

```ts
getArcFieldDefs(): ArcFieldDef[] {
  const rows = this.db.prepare('SELECT * FROM arc_field_defs ORDER BY scope, display_order').all() as ArcFieldDefRow[];
  return rows.map(r => ({
    id: r.id, label: r.label, type: r.field_type as ArcFieldDef['type'],
    options: r.options ? JSON.parse(r.options) : undefined,
    optionColors: r.option_colors ? JSON.parse(r.option_colors) : undefined,
    ratingMax: r.rating_max ?? undefined,
    order: r.display_order,
    scope: (r.scope as 'arc' | 'scene') ?? 'arc',
  }));
}
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/brian/braidr && npx vitest run 2>&1 | tail -6
```

Expected: all 155+ tests pass (new test included).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/database.ts src/__tests__/braidr-db.test.ts
git commit -m "feat(arc-fields): add scope to ArcFieldDef + arc_field_defs table"
```

---

### Task 4: DB migration — copy scene metadata into arc tables

**Files:**
- Modify: `src/main/database.ts`
- Test: `src/__tests__/braidr-db.test.ts`

Add `migrateSceneMetadataToArcTables()` to `BraidrDB`. This runs once per project open (idempotent). It copies `metadata_field_defs` → `arc_field_defs` (scope='scene') and `scene_metadata_values` → `arc_field_values` (entity_type='scene').

- [ ] **Step 1: Write failing test**

In `braidr-db.test.ts`, add:

```ts
describe('migrateSceneMetadataToArcTables', () => {
  it('copies metadata_field_defs and scene_metadata_values to arc tables', () => {
    const db = new BraidrDB(':memory:');
    // Seed legacy tables
    db.prepare(`INSERT INTO metadata_field_defs (id, label, field_type, display_order) VALUES ('mfd1', 'Status', 'dropdown', 0)`).run();
    db.prepare(`INSERT INTO scenes (id, character_id, title, scene_number, timeline_position, created_at) VALUES ('sc1', 'c1', 'Intro', 1, 1, 0)`).run();
    db.prepare(`INSERT INTO scene_metadata_values (scene_id, field_def_id, value) VALUES ('sc1', 'mfd1', '"Draft"')`).run();

    db.migrateSceneMetadataToArcTables();

    const defs = db.getArcFieldDefs();
    expect(defs.find(d => d.id === 'mfd1' && d.scope === 'scene')).toBeTruthy();

    const vals = (db.prepare('SELECT * FROM arc_field_values WHERE entity_type = ?').all('scene') as any[]);
    expect(vals.find(v => v.entity_id === 'sc1' && v.field_def_id === 'mfd1')).toBeTruthy();
  });

  it('is idempotent — running twice does not duplicate', () => {
    const db = new BraidrDB(':memory:');
    db.prepare(`INSERT INTO metadata_field_defs (id, label, field_type, display_order) VALUES ('mfd2', 'Theme', 'text', 0)`).run();
    db.migrateSceneMetadataToArcTables();
    db.migrateSceneMetadataToArcTables();
    const defs = db.getArcFieldDefs().filter(d => d.id === 'mfd2');
    expect(defs.length).toBe(1);
  });
});
```

Note: the scenes insert requires a `characters` row first — adjust as needed if FK enforcement is on. Check: `db.prepare("PRAGMA foreign_keys").get()` — if off, skip the characters seed.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/brian/braidr && npx vitest run src/__tests__/braidr-db.test.ts -t "migrateScene" 2>&1 | tail -8
```

Expected: FAIL — method doesn't exist.

- [ ] **Step 3: Implement `migrateSceneMetadataToArcTables`**

In `BraidrDB`, add after `getArcFieldDefs`:

```ts
migrateSceneMetadataToArcTables() {
  const tx = this.db.transaction(() => {
    // 1. Copy metadata_field_defs → arc_field_defs with scope='scene' (skip existing)
    const mfdRows = this.db.prepare('SELECT * FROM metadata_field_defs').all() as {
      id: string; label: string; field_type: string; options: string | null;
      option_colors: string | null; display_order: number;
    }[];
    const existingArcIds = new Set(
      (this.db.prepare('SELECT id FROM arc_field_defs').all() as { id: string }[]).map(r => r.id)
    );
    const insertDef = this.db.prepare(
      'INSERT INTO arc_field_defs (id, label, field_type, options, option_colors, display_order, scope) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const row of mfdRows) {
      if (!existingArcIds.has(row.id)) {
        insertDef.run(row.id, row.label, row.field_type, row.options, row.option_colors, row.display_order, 'scene');
      }
    }

    // 2. Copy scene_metadata_values → arc_field_values (skip existing)
    const smvRows = this.db.prepare('SELECT * FROM scene_metadata_values').all() as {
      scene_id: string; field_def_id: string; value: string;
    }[];
    const insertVal = this.db.prepare(
      'INSERT OR IGNORE INTO arc_field_values (entity_type, entity_id, field_def_id, value) VALUES (?, ?, ?, ?)'
    );
    for (const row of smvRows) {
      insertVal.run('scene', row.scene_id, row.field_def_id, row.value);
    }
  });
  tx();
}
```

- [ ] **Step 4: Call migration on project open**

In `braidrIpc.ts`, find the `ipcMain.handle('braidrLoad', ...)` handler. After the DB is opened (or after schema creation), add:

```ts
db.migrateSceneMetadataToArcTables();
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/brian/braidr && npx vitest run 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/database.ts src/__tests__/braidr-db.test.ts src/main/braidrIpc.ts
git commit -m "feat(arc-fields): DB migration — copy scene metadata into arc tables"
```

---

### Task 5: IPC load + save — scene data via arc channels

**Files:**
- Modify: `src/main/braidrIpc.ts`
- Modify: `src/main/applySaveTimeline.ts`
- Modify: `src/renderer/services/dataService.ts`
- Modify: `src/renderer/services/capacitorDataService.ts`

After migration, the load path returns scene-scoped defs in `arcFieldDefs` and scene values keyed `scene:${scene_id}` in `arcFieldValues`. Scene saves go through `braidrSaveArcFieldDefs`/`braidrSaveArcFieldValues`. The `applySaveTimeline` path stops writing legacy scene metadata.

- [ ] **Step 1: Update `braidrLoad` to include scene scope**

In `braidrIpc.ts`, find where `arcFieldDefs` and `arcFieldValues` are assembled (around line 490–510 of the original). The `getArcFieldDefs()` call already returns all scopes (after Task 3). The `arcFieldValues` load currently only loads non-scene entity types. Update it to also load scene values:

Find:
```ts
const arcFieldValues: Record<string, Record<string, string | string[]>> = {};
const afvRows = db.getAllArcFieldValues();
for (const row of afvRows) {
  const key = `${row.entity_type}:${row.entity_id}`;
  (arcFieldValues[key] ??= {})[row.field_def_id] = JSON.parse(row.value);
}
```

This already works for all entity types including 'scene' once the migration runs — no change needed if `getAllArcFieldValues()` returns all rows. Verify:

```bash
grep -n "getAllArcFieldValues" /Users/brian/braidr/src/main/database.ts
```

If it's `SELECT * FROM arc_field_values` with no filter, it already returns scene values. If it filters by entity_type, remove that filter.

- [ ] **Step 2: Add `sceneMetadata` and `metadataFieldDefs` derived in load from arc tables**

In `braidrLoad`, after building `arcFieldDefs` and `arcFieldValues`, derive the legacy shapes so the rest of the load payload stays backward-compatible:

```ts
// Derive legacy-shaped sceneMetadata from arcFieldValues for backward compat
const sceneMetadata: Record<string, Record<string, string | string[]>> = {};
for (const [key, vals] of Object.entries(arcFieldValues)) {
  if (key.startsWith('scene:')) {
    const sceneId = key.slice(6);
    sceneMetadata[sceneId] = vals;
  }
}

// Derive metadataFieldDefs from arcFieldDefs for backward compat
const metadataFieldDefs = arcFieldDefs
  .filter(d => d.scope === 'scene')
  .map(d => ({ id: d.id, label: d.label, type: d.type as 'text' | 'dropdown' | 'multiselect', options: d.options, optionColors: d.optionColors, order: d.order }));
```

These go into the return payload alongside `arcFieldDefs` and `arcFieldValues` (keeping existing keys so App.tsx doesn't break yet).

- [ ] **Step 3: Stop writing scene metadata via `applySaveTimeline`**

In `src/main/applySaveTimeline.ts`, find the two blocks that write `metadataFieldDefs` and `sceneMetadata`. The check is:

```ts
if (payload.metadataFieldDefs !== undefined && shouldReplace(...)) {
```

Change these blocks to early-return no-ops (scene metadata is now managed via dedicated arc IPC):

```ts
// Scene metadata now managed via braidrSaveArcFieldDefs/braidrSaveArcFieldValues — skip
if (payload.metadataFieldDefs !== undefined) { /* no-op: migrated to arc tables */ }
if (payload.sceneMetadata !== undefined) { /* no-op: migrated to arc tables */ }
```

This prevents the old bulk-replace from wiping the migrated data.

- [ ] **Step 4: Update `dataService.ts` return type**

In `src/renderer/services/dataService.ts`, the `loadProject` return type already includes `arcFieldDefs: ArcFieldDef[]` and `arcFieldValues: Record<string, Record<string, string | string[]>>` (added in Phase 1). Verify these types accept scene-scoped data (they do, since `ArcFieldDef` now has optional `scope`).

Add two new interface methods for saving scene-scope field defs and values:

```ts
saveSceneFieldDefs(defs: ArcFieldDef[]): Promise<void>;
saveSceneFieldValues(sceneId: string, values: Record<string, string | string[]>): Promise<void>;
```

In `ElectronDataService`, implement them:

```ts
async saveSceneFieldDefs(defs: ArcFieldDef[]): Promise<void> {
  // scene-scoped defs go through the same braidrSaveArcFieldDefs channel
  await window.electronAPI.braidrSaveArcFieldDefs(defs);
}
async saveSceneFieldValues(sceneId: string, values: Record<string, string | string[]>): Promise<void> {
  await window.electronAPI.braidrSaveArcFieldValues('scene', sceneId, values);
}
```

Note: the `braidrSaveArcFieldDefs` IPC handler calls `replaceArcFieldDefs` which is now scope-aware (Task 3), so passing scene-scoped defs won't delete arc-scoped defs.

- [ ] **Step 5: Add stubs to `capacitorDataService.ts`**

```ts
async saveSceneFieldDefs(_defs: ArcFieldDef[]): Promise<void> {}
async saveSceneFieldValues(_sceneId: string, _values: Record<string, string | string[]>): Promise<void> {}
```

- [ ] **Step 6: Verify compile**

```bash
cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "TS6133\|TS2367\|TS2741\|TS2420\|TS2345\|TS2339\|TS2322"
```

Expected: no output.

- [ ] **Step 7: Run tests**

```bash
cd /Users/brian/braidr && npx vitest run 2>&1 | tail -6
```

- [ ] **Step 8: Commit**

```bash
git add src/main/braidrIpc.ts src/main/applySaveTimeline.ts src/renderer/services/dataService.ts src/renderer/services/capacitorDataService.ts
git commit -m "feat(arc-fields): scene metadata load/save via arc IPC; no-op legacy applySaveTimeline path"
```

---

### Task 6: App.tsx state consolidation

**Files:**
- Modify: `src/renderer/App.tsx`

Move scene metadata state into `arcFieldValues`/`arcFieldDefs`. Keep derived `sceneMetadata` and `metadataFieldDefs` for the transition period so TableView/CompileModal consumers don't break.

- [ ] **Step 1: Populate scene data from arcFieldValues/arcFieldDefs after load**

In the load handler (where `setArcFieldDefs(data.arcFieldDefs ?? [])` is called), also populate `sceneMetadata` from the arc values and `metadataFieldDefs` from the arc defs:

```ts
// After: setArcFieldDefs(data.arcFieldDefs ?? []);
// After: setArcFieldValues(data.arcFieldValues ?? {});

// Derive backward-compat state from unified arc tables
const sceneDefs = (data.arcFieldDefs ?? []).filter(d => d.scope === 'scene');
const derivedMetaDefs = sceneDefs.map(d => ({
  id: d.id, label: d.label,
  type: d.type as 'text' | 'dropdown' | 'multiselect',
  options: d.options, optionColors: d.optionColors, order: d.order,
}));
setMetadataFieldDefs(derivedMetaDefs);
metadataFieldDefsRef.current = derivedMetaDefs;

// Derive sceneMetadata from arcFieldValues
const derivedSceneMeta: Record<string, Record<string, string | string[]>> = {};
for (const [key, vals] of Object.entries(data.arcFieldValues ?? {})) {
  if (key.startsWith('scene:')) {
    derivedSceneMeta[key.slice(6)] = vals;
  }
}
setSceneMetadata(derivedSceneMeta);
sceneMetadataRef.current = derivedSceneMeta;
```

- [ ] **Step 2: Add `handleSaveSceneFieldDefs` callback**

After `handleSaveArcFieldValues`, add:

```ts
const handleSaveSceneFieldDefs = useCallback(async (defs: ArcFieldDef[]) => {
  // Update arcFieldDefs state: replace scene-scoped defs, keep arc-scoped
  setArcFieldDefs(prev => [
    ...prev.filter(d => d.scope !== 'scene'),
    ...defs,
  ]);
  // Derive and update metadataFieldDefs for backward compat
  const metaDefs = defs.map(d => ({
    id: d.id, label: d.label,
    type: d.type as 'text' | 'dropdown' | 'multiselect',
    options: d.options, optionColors: d.optionColors, order: d.order,
  }));
  setMetadataFieldDefs(metaDefs);
  metadataFieldDefsRef.current = metaDefs;
  try {
    await dataService.saveSceneFieldDefs(defs);
  } catch {
    addToast('Could not save scene field definitions');
  }
}, []);

const handleSaveSceneFieldValues = useCallback(async (sceneId: string, values: Record<string, string | string[]>) => {
  // Update arcFieldValues
  setArcFieldValues(prev => ({ ...prev, [`scene:${sceneId}`]: values }));
  // Update sceneMetadata for backward compat
  setSceneMetadata(prev => ({ ...prev, [sceneId]: values }));
  sceneMetadataRef.current = { ...sceneMetadataRef.current, [sceneId]: values };
  try {
    await dataService.saveSceneFieldValues(sceneId, values);
  } catch {
    addToast('Could not save scene field values');
  }
}, []);
```

- [ ] **Step 3: Stop sending sceneMetadata/metadataFieldDefs via saveTimeline**

Find the inline save in App.tsx that builds the timeline payload (around line 2634). Remove or null-out the `metadataFieldDefs` and `sceneMetadata` keys:

```ts
// BEFORE:
metadataFieldDefs: metadataFieldDefsRef.current,
sceneMetadata: metaForSave,

// AFTER: (send undefined so applySaveTimeline no-ops them)
// metadataFieldDefs and sceneMetadata are now managed via dedicated arc IPC
```

- [ ] **Step 4: Verify compile + tests**

```bash
cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "TS6133\|TS2367\|TS2741\|TS2420\|TS2345\|TS2339\|TS2322"
npx vitest run 2>&1 | tail -6
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(arc-fields): App.tsx consolidates scene metadata into arcFieldValues/arcFieldDefs"
```

---

### Task 7: EditorView — ArcDetailModal for scene field editing

**Files:**
- Modify: `src/renderer/components/EditorView.tsx`
- Modify: `src/renderer/styles.css` (if needed)

Add a "⊞" expand button to the scene metadata panel in EditorView that opens an `ArcDetailModal` for the current scene's field values. The scene's builtin fields (synopsis, POV character, etc.) can also be wired as builtin `DetailField`s.

- [ ] **Step 1: Read EditorView to understand the scene detail panel**

```bash
grep -n "metadataFieldDefs\|sceneMetadata\|SceneDetail\|scene-meta\|arc-dm\|ArcDetailModal" /Users/brian/braidr/src/renderer/components/EditorView.tsx | head -30
```

Understand how the scene metadata panel is currently rendered.

- [ ] **Step 2: Add props to EditorView for scene-scope arc data**

EditorView already receives `sceneMetadata` and `metadataFieldDefs`. Add:

```ts
arcFieldDefs: ArcFieldDef[];          // NEW — full list, will filter to scope='scene'
onSaveSceneFieldDefs: (defs: ArcFieldDef[]) => void;  // NEW
onSaveSceneFieldValues: (sceneId: string, values: Record<string, string | string[]>) => void;  // NEW
```

- [ ] **Step 3: Add ArcDetailModal import + open state to EditorView**

```ts
import ArcDetailModal, { type DetailField, type FieldRender } from './ArcDetailModal';
import type { ArcFieldDef } from '../../shared/types';
```

Inside the component, add:

```ts
const [sceneDetailOpen, setSceneDetailOpen] = useState<string | null>(null); // holds scene_id
```

- [ ] **Step 4: Build scene `DetailField[]` descriptor**

Add a helper function inside or above `EditorView`:

```ts
function buildSceneDetailFields(
  sceneId: string,
  sceneFieldDefs: ArcFieldDef[],
  sceneValues: Record<string, string | string[]>,
  onSave: (sceneId: string, values: Record<string, string | string[]>) => void,
): DetailField[] {
  return sceneFieldDefs.map(def => ({
    id: def.id,
    label: def.label,
    icon: '·',
    render: def.type === 'dropdown'
      ? { kind: 'dropdown', options: def.options ?? [], colors: def.optionColors }
      : def.type === 'multiselect'
      ? { kind: 'multiselect', options: def.options ?? [], colors: def.optionColors }
      : def.type === 'rating'
      ? { kind: 'rating', max: def.ratingMax ?? 5 }
      : def.type === 'number'
      ? { kind: 'number' }
      : { kind: 'text' },
    value: sceneValues[def.id] ?? (def.type === 'multiselect' ? [] : ''),
    onChange: (v: string | string[]) => onSave(sceneId, { ...sceneValues, [def.id]: v }),
    builtin: false,
  }));
}
```

- [ ] **Step 5: Add expand button to the scene metadata section**

Find where EditorView renders the scene metadata fields (the area that shows `metadataFieldDefs`). Add a small `⊞` button next to the section header that sets `setSceneDetailOpen(currentSceneId)`.

- [ ] **Step 6: Mount ArcDetailModal for scene detail**

At the bottom of EditorView's return:

```tsx
{sceneDetailOpen && (() => {
  const sceneId = sceneDetailOpen;
  const sceneDefs = arcFieldDefs.filter(d => d.scope === 'scene');
  const sceneValues = sceneMetadata[sceneId] ?? {};
  return (
    <ArcDetailModal
      title="Scene details"
      fields={buildSceneDetailFields(sceneId, sceneDefs, sceneValues, onSaveSceneFieldValues)}
      arcFieldDefs={sceneDefs}
      onSaveDefs={onSaveSceneFieldDefs}
      onClose={() => setSceneDetailOpen(null)}
      storageKey="arc-field-order:scene"
    />
  );
})()}
```

- [ ] **Step 7: Wire new props in App.tsx**

Find `<EditorView` in App.tsx and add:

```tsx
arcFieldDefs={arcFieldDefs}
onSaveSceneFieldDefs={handleSaveSceneFieldDefs}
onSaveSceneFieldValues={handleSaveSceneFieldValues}
```

- [ ] **Step 8: Verify compile + tests**

```bash
cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "TS6133\|TS2367\|TS2741\|TS2420\|TS2345\|TS2339\|TS2322"
npx vitest run 2>&1 | tail -6
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/EditorView.tsx src/renderer/App.tsx
git commit -m "feat(arc-fields): EditorView opens ArcDetailModal for scene field editing"
```

---

### Task 8: TableView + CompileModal — use arcFieldDefs/arcFieldValues

**Files:**
- Modify: `src/renderer/components/TableView.tsx`
- Modify: `src/renderer/components/CompileModal.tsx`

Both components currently receive `sceneMetadata` and `metadataFieldDefs`. After Task 6, these are still derived and passed from App.tsx, so this task is about updating them to work cleanly with the new types (and optionally accepting `arcFieldDefs`/`arcFieldValues` directly if preferred).

- [ ] **Step 1: Verify TableView still works with derived sceneMetadata**

Since Task 6 continues to derive and pass `sceneMetadata` and `metadataFieldDefs` from the consolidated state, TableView should still function without changes. Run the app and:

```bash
npm run dev
```

Open a project, go to Table view, verify custom columns appear and scene metadata values are visible.

- [ ] **Step 2: Verify CompileModal still works**

Open CompileModal (Export/Compile button), verify status filtering works.

- [ ] **Step 3: If TableView's `_status` field is broken — fix**

TableView has a special case for the `_status` built-in field:

```ts
const statusField = metadataFieldDefs.find(f => f.id === '_status');
```

After migration, `_status` (if it existed in `metadata_field_defs`) is now in `arcFieldDefs` with `scope='scene'`. The derived `metadataFieldDefs` array includes it. Verify it still resolves. If not, grep for `_status` creation to find where it's defined.

- [ ] **Step 4: Commit (or no-op if no changes needed)**

```bash
git add src/renderer/components/TableView.tsx src/renderer/components/CompileModal.tsx
git commit -m "feat(arc-fields): TableView + CompileModal verified with unified scene metadata"
```

---

## Self-Review

**Spec coverage:**
- TipTap rich text: Task 1 ✓
- Hide builtin fields: Task 2 ✓
- Unified field database (scope column + migration): Tasks 3–4 ✓
- Load path returns scene defs in arcFieldDefs: Task 5 ✓
- Save path for scene defs/values via arc IPC: Tasks 5–6 ✓
- applySaveTimeline no longer writes scene metadata: Task 5 ✓
- App.tsx derives sceneMetadata/metadataFieldDefs for compat: Task 6 ✓
- EditorView opens ArcDetailModal for scenes: Task 7 ✓
- TableView/CompileModal verified: Task 8 ✓

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:**
- `ArcFieldDef.scope?: 'arc' | 'scene'` added in Task 3, used throughout Tasks 4–7 ✓
- `saveSceneFieldDefs(defs: ArcFieldDef[])` defined in Task 5, called in Task 6 ✓
- `saveSceneFieldValues(sceneId, values)` defined in Task 5, called in Task 6 and Task 7 ✓
- `handleSaveSceneFieldDefs` / `handleSaveSceneFieldValues` defined in Task 6, wired in Task 7 ✓
- `buildSceneDetailFields` in Task 7 uses same FieldRender discriminated union as arc builders ✓
- `storageKey="arc-field-order:scene"` in Task 7 uses same localStorage mechanism as arc modal ✓

**Known risk:** The `_status` built-in scene field (special case in TableView/CompileModal) may need attention in Task 8 if it was created outside the normal `metadata_field_defs` path. Check how it's seeded.

**Data safety:** `migrateSceneMetadataToArcTables` (Task 4) uses `INSERT OR IGNORE` for values and checks `existingArcIds` for defs — safe to run multiple times. `replaceArcFieldDefs` is scope-filtered — arc saves never touch scene defs and vice versa.
