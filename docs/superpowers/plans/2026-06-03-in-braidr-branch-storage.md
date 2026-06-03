# In-`.braidr` Branch Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move draft branches from per-branch `.braidr` files in a `branches/` folder into the single `.braidr` SQLite file, so branches sync atomically across machines and stop corrupting over iCloud.

**Architecture:** The normal tables always hold the *active* branch (existing CRUD untouched). A new `branch_snapshots` table stores a serialized JSON document of the branched (story) tables per branch. Switching swaps the live branched tables for the target snapshot inside one transaction with foreign keys disabled (so cascades can't delete shared rows). A one-time migration imports any existing filesystem branches.

**Tech stack:** Electron main process, `better-sqlite3` (lazy-loaded), Vitest. Spec: `docs/superpowers/specs/2026-06-03-in-braidr-branch-storage-design.md`.

**Key references:**
- `src/main/database.ts` — `BraidrDB` class, `CREATE_SCHEMA`, `migrate()`, `openDatabase`/`closeDatabase`, `checkpoint()`.
- `src/main/branches.ts` — current filesystem branch ops (to be replaced).
- `src/main/braidrIpc.ts:120-140` — `BRAIDR_LOAD_PROJECT` active-branch redirect (to be removed).
- `src/main/main.ts:966-1043` — `branches:*` IPC handlers (incl. positions handlers at 1017-1037).
- `src/__tests__/branches.test.ts` — existing tests (to be rewritten for the new model).

**Critical correctness note (read before Task 2):** Several *shared* tables have `ON DELETE CASCADE`/`SET NULL` FKs into *branched* tables — `writing_sessions.character_id → characters`, `task_character_links.character_id → characters`, `note_scene_links.scene_id → scenes`, `tasks.scene_id → scenes`. If the swap deletes branched rows with foreign keys enabled, SQLite will cascade-delete or null these shared rows (including weekly-hours data). The restore MUST run with `PRAGMA foreign_keys = OFF`, set *outside* the transaction (SQLite ignores `foreign_keys` changes inside a transaction).

---

## Task 1: Generalized snapshot schema

**Files:**
- Modify: `src/main/database.ts` (the `CREATE_SCHEMA` string near lines 331-355, and `migrate()` near line 380)
- Test: `src/__tests__/branchStorage.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/branchStorage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function tableNames(db: any): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
}

describe('branch storage schema', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-bs-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('creates branch_snapshots and branch_positions and drops branch_scene_snapshots', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(tmp, 'p.braidr'));
    const names = tableNames(db);
    expect(names).toContain('branches');
    expect(names).toContain('branch_snapshots');
    expect(names).toContain('branch_positions');
    expect(names).not.toContain('branch_scene_snapshots');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/branchStorage.test.ts -t 'creates branch_snapshots'`
Expected: FAIL — `branch_snapshots` missing / `branch_scene_snapshots` present.

- [ ] **Step 3: Update the schema**

In `src/main/database.ts`, replace the `branch_scene_snapshots` `CREATE TABLE` block (starts line ~340) with:

```sql
  CREATE TABLE IF NOT EXISTS branch_snapshots (
    branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
    format_version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS branch_positions (
    branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
    positions_json TEXT NOT NULL DEFAULT '{}'
  );
```

Then in `migrate()` (after the existing `DROP TABLE IF EXISTS braided_chapters;` line ~397) add:

```ts
    // Retire the unused scene-only branch snapshot table (superseded by branch_snapshots)
    this.db.exec('DROP TABLE IF EXISTS branch_scene_snapshots');
```

Also remove the now-unused `getBranchSnapshots`/`insertBranchSnapshot`/`clearBranchSnapshots` methods and the `BranchSceneSnapshotRow` interface (lines ~1145-1157, ~1215) — they reference the dropped table.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/branchStorage.test.ts -t 'creates branch_snapshots'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/database.ts src/__tests__/branchStorage.test.ts
git commit -m "feat(branches): generalized branch_snapshots + branch_positions schema"
```

---

## Task 2: Serialize / restore branched tables (cascade-safe swap)

**Files:**
- Create: `src/main/branchTables.ts`
- Modify: `src/main/database.ts` (add two methods to `BraidrDB`)
- Test: `src/__tests__/branchStorage.test.ts`

- [ ] **Step 1: Create the branched-table list**

```ts
// src/main/branchTables.ts
/**
 * Story tables that are versioned per branch. Order is parents-before-children
 * for readability; the swap disables FK enforcement so insert order is not
 * load-bearing. Shared tables (tasks, notes, writing_sessions, tags, *_field_defs,
 * table_views, project, settings) are intentionally excluded.
 */
export const BRANCHED_TABLES: readonly string[] = [
  'characters',
  'acts',
  'plot_points',
  'character_psychology',
  'chapters',
  'scenes',
  'scene_drafts',
  'scene_draft_versions',
  'scene_scratchpads',
  'scene_notes',
  'scene_comments',
  'scene_connections',
  'scene_tags',
  'scene_metadata_values',
  'scene_dates',
  'world_events',
  'world_event_tags',
  'world_event_scene_links',
  'world_event_note_links',
  'archived_scenes',
];

export const SNAPSHOT_FORMAT_VERSION = 1;
```

- [ ] **Step 2: Write the failing test (round-trip + shared-data survival)**

Add to `src/__tests__/branchStorage.test.ts`:

```ts
describe('serialize/restore branched tables', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-sr-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('round-trips branched data and preserves shared rows across a restore', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(tmp, 'p.braidr'));
    const now = Date.now();
    // branched: a character + scene
    db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run('s1', 'c1', 1, 0, 'Original', now, now);
    // shared rows that FK into branched ones (would cascade-delete if FK left on)
    db.prepare('INSERT INTO writing_sessions (id, scene_id, character_id, date, duration, word_count_delta, created_at) VALUES (?,?,?,?,?,?,?)').run('ws1', 's1', 'c1', '2026-06-01', 600, 250, now);
    db.prepare('INSERT INTO tasks (id, title, created_at, updated_at) VALUES (?,?,?,?)').run('t1', 'Revise', now, now);
    db.prepare('INSERT INTO task_character_links (task_id, character_id) VALUES (?,?)').run('t1', 'c1');

    const snapshot = db.serializeBranchedTables();

    // mutate live branched state
    db.prepare('UPDATE scenes SET title = ? WHERE id = ?').run('Changed', 's1');
    db.prepare("INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES ('s2','c1',2,1,'Extra',?,?)").run(now, now);

    // restore original snapshot
    db.restoreBranchedTables(snapshot);

    const scenes = db.prepare('SELECT * FROM scenes ORDER BY id').all() as any[];
    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe('Original');

    // shared rows untouched
    expect((db.prepare('SELECT COUNT(*) n FROM writing_sessions').get() as any).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM task_character_links').get() as any).n).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/branchStorage.test.ts -t 'round-trips branched data'`
Expected: FAIL — `serializeBranchedTables is not a function`.

- [ ] **Step 4: Implement the two methods**

In `src/main/database.ts`, add `import { BRANCHED_TABLES, SNAPSHOT_FORMAT_VERSION } from './branchTables';` at the top, and add these methods to the `BraidrDB` class (near the other generic helpers like `prepare`/`exec`):

```ts
  /** Serialize all branched (story) tables into a versioned JSON document. */
  serializeBranchedTables(): string {
    const tables: Record<string, unknown[]> = {};
    for (const t of BRANCHED_TABLES) {
      tables[t] = this.db.prepare(`SELECT * FROM ${t}`).all();
    }
    return JSON.stringify({ formatVersion: SNAPSHOT_FORMAT_VERSION, tables });
  }

  /**
   * Replace all branched-table rows with the contents of a snapshot document.
   * Runs with foreign_keys OFF so deleting branched parents does NOT cascade
   * into shared tables (writing_sessions, task_character_links, note_scene_links,
   * tasks.scene_id). foreign_keys must be toggled outside the transaction.
   */
  restoreBranchedTables(json: string): void {
    const snap = JSON.parse(json) as { tables: Record<string, Record<string, unknown>[]> };
    this.db.pragma('foreign_keys = OFF');
    const run = this.db.transaction(() => {
      for (const t of [...BRANCHED_TABLES].reverse()) {
        this.db.prepare(`DELETE FROM ${t}`).run();
      }
      for (const t of BRANCHED_TABLES) {
        const rows = snap.tables[t] ?? [];
        for (const row of rows) {
          const cols = Object.keys(row);
          if (cols.length === 0) continue;
          const placeholders = cols.map(() => '?').join(', ');
          this.db
            .prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`)
            .run(...cols.map(c => row[c] as never));
        }
      }
    });
    try {
      run();
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/branchStorage.test.ts -t 'round-trips branched data'`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/branchTables.ts src/main/database.ts src/__tests__/branchStorage.test.ts
git commit -m "feat(branches): cascade-safe serialize/restore of branched tables"
```

---

## Task 3: Branch model methods on BraidrDB

**Files:**
- Modify: `src/main/database.ts` (replace the existing branch methods near 1122-1142)
- Test: `src/__tests__/branchStorage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('branch model methods', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-bm-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('ensureMainBranch creates exactly one active main row, idempotently', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(tmp, 'p.braidr'));
    const main1 = db.ensureMainBranch();
    const main2 = db.ensureMainBranch();
    expect(main1.id).toBe(main2.id);
    expect(main1.name).toBe('main');
    expect(main1.is_active).toBe(1);
    const rows = db.listBranchRows();
    expect(rows.filter(r => r.name === 'main')).toHaveLength(1);
    db.close();
  });

  it('saveSnapshot then getSnapshot returns the stored document', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(tmp, 'p.braidr'));
    const main = db.ensureMainBranch();
    db.saveSnapshot(main.id, '{"formatVersion":1,"tables":{}}');
    expect(db.getSnapshot(main.id)).toBe('{"formatVersion":1,"tables":{}}');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/branchStorage.test.ts -t 'ensureMainBranch'`
Expected: FAIL — `ensureMainBranch is not a function`.

- [ ] **Step 3: Replace the branch methods**

In `src/main/database.ts`, replace the existing `// ── Branches ──` block (`getBranches`/`getActiveBranch`/`insertBranch`/`setActiveBranch`/`deleteBranch` near lines 1122-1142) with:

```ts
  // ── Branches (in-file model) ───────────────────────────────────────────────

  ensureMainBranch(): BranchRow {
    let main = this.db.prepare("SELECT * FROM branches WHERE name = 'main'").get() as BranchRow | undefined;
    if (!main) {
      const id = randomId();
      const anyActive = this.db.prepare('SELECT 1 FROM branches WHERE is_active = 1').get();
      this.db
        .prepare('INSERT INTO branches (id, name, description, created_from, created_at, is_active) VALUES (?, ?, NULL, NULL, ?, ?)')
        .run(id, 'main', Date.now(), anyActive ? 0 : 1);
      main = this.db.prepare('SELECT * FROM branches WHERE id = ?').get(id) as BranchRow;
    }
    return main;
  }

  listBranchRows(): BranchRow[] {
    return this.db.prepare('SELECT * FROM branches ORDER BY created_at').all() as BranchRow[];
  }

  getActiveBranchRow(): BranchRow | undefined {
    return this.db.prepare('SELECT * FROM branches WHERE is_active = 1').get() as BranchRow | undefined;
  }

  getBranchByName(name: string): BranchRow | undefined {
    return this.db.prepare('SELECT * FROM branches WHERE name = ?').get(name) as BranchRow | undefined;
  }

  setActiveBranchRow(id: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE branches SET is_active = 0').run();
      this.db.prepare('UPDATE branches SET is_active = 1 WHERE id = ?').run(id);
    });
    tx();
  }

  insertBranchRow(id: string, name: string, description: string | null, createdFrom: string | null): void {
    this.db
      .prepare('INSERT INTO branches (id, name, description, created_from, created_at, is_active) VALUES (?, ?, ?, ?, ?, 0)')
      .run(id, name, description, createdFrom, Date.now());
  }

  deleteBranchRow(id: string): void {
    // branch_snapshots / branch_positions cascade via FK
    this.db.prepare('DELETE FROM branches WHERE id = ?').run(id);
  }

  saveSnapshot(branchId: string, data: string): void {
    this.db
      .prepare(`INSERT INTO branch_snapshots (branch_id, format_version, updated_at, data)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(branch_id) DO UPDATE SET format_version = excluded.format_version, updated_at = excluded.updated_at, data = excluded.data`)
      .run(branchId, 1, Date.now(), data);
  }

  getSnapshot(branchId: string): string | null {
    const row = this.db.prepare('SELECT data FROM branch_snapshots WHERE branch_id = ?').get(branchId) as { data: string } | undefined;
    return row?.data ?? null;
  }
```

Keep the existing `export interface BranchRow { ... }` (line ~1214). Confirm `randomId()` is in scope (module-level function at line ~1218 — it is).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/branchStorage.test.ts -t 'branch model methods'`
Expected: PASS (both cases)

- [ ] **Step 5: Commit**

```bash
git add src/main/database.ts src/__tests__/branchStorage.test.ts
git commit -m "feat(branches): in-file branch row + snapshot DB methods"
```

---

## Task 4: Rewrite `branches.ts` against the DB

**Files:**
- Rewrite: `src/main/branches.ts`
- Rewrite: `src/__tests__/branches.test.ts`

The exported function signatures stay identical so IPC handlers and the renderer are unchanged: `listBranches(projectPath)`, `createBranch(projectPath, name, description?)`, `switchBranch(projectPath, name|null)`, `deleteBranch(projectPath, name)`, `compareBranches(projectPath, left, right)`, `mergeBranch(projectPath, branchName, sceneIds)`, `getBranchSceneDraft(projectPath, branchName|null, sceneId)`. `name === null`/`activeBranch === null` continues to mean "main".

- [ ] **Step 1: Rewrite the test file for the in-file model**

Replace the whole body of `src/__tests__/branches.test.ts` with tests that assert on DB state instead of files. `setupProject` stays the same (it seeds characters + scenes). New core tests:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listBranches, createBranch, switchBranch, deleteBranch, mergeBranch, compareBranches } from '../main/branches';

async function setupProject(dir: string): Promise<string> {
  const braidrPath = path.join(dir, 'test-project.braidr');
  const mod = await import('../main/database');
  const db = new mod.BraidrDB(braidrPath);
  const now = Date.now();
  db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('char-noah', 'Noah', 0, now);
  db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, timeline_position, word_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('noah-1', 'char-noah', 1, 0, 'Noah wakes up', 1, 100, now, now);
  mod.closeDatabase(braidrPath); // flush so branches.ts re-opens cleanly
  return braidrPath;
}

describe('in-file branch operations', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-br-')); });
  afterEach(async () => { (await import('../main/database')).closeAllDatabases(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('lists only main when no branches created', async () => {
    await setupProject(tmp);
    const idx = listBranches(tmp);
    expect(idx.branches).toEqual([]);
    expect(idx.activeBranch).toBeNull();
  });

  it('create makes a branch active and round-trips edits across switch', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'alt', 'an alt take');
    expect(listBranches(tmp).activeBranch).toBe('alt');

    const mod = await import('../main/database');
    const dbPath = path.join(tmp, 'test-project.braidr');
    // edit on the alt branch (live tables)
    mod.openDatabase(dbPath).prepare("UPDATE scenes SET title='Noah screams' WHERE id='noah-1'").run();

    switchBranch(tmp, null); // to main
    expect(mod.openDatabase(dbPath).getScene('noah-1')!.title).toBe('Noah wakes up');

    switchBranch(tmp, 'alt'); // back to alt
    expect(mod.openDatabase(dbPath).getScene('noah-1')!.title).toBe('Noah screams');
  });

  it('delete removes a non-active branch', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'alt');
    switchBranch(tmp, null);
    const idx = deleteBranch(tmp, 'alt');
    expect(idx.branches.map(b => b.name)).not.toContain('alt');
  });

  it('compare detects a title change between main and branch', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'alt');
    const mod = await import('../main/database');
    mod.openDatabase(path.join(tmp, 'test-project.braidr')).prepare("UPDATE scenes SET title='Noah screams' WHERE id='noah-1'").run();
    const diff = await compareBranches(tmp, null, 'alt');
    const noah1 = diff.scenes.find(s => s.sceneId === 'noah-1');
    expect(noah1?.changeType).toBe('modified');
    expect(noah1?.leftTitle).toBe('Noah wakes up');
    expect(noah1?.rightTitle).toBe('Noah screams');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/branches.test.ts`
Expected: FAIL — the rewritten `branches.ts` does not exist yet (still the filesystem version, signatures changed semantics).

- [ ] **Step 3: Rewrite `src/main/branches.ts`**

```ts
/**
 * Draft branch operations — in-.braidr-file implementation.
 *
 * A branch is a row in the `branches` table plus a serialized snapshot of the
 * story tables in `branch_snapshots`. The ACTIVE branch always lives in the
 * normal tables; other branches live in their snapshots. "main" is a real row.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { BranchIndex, BranchInfo, BranchCompareData, BranchSceneDiff } from '../shared/types';
import type { BraidrDB, SceneRow } from './database';

function findMainBraidrFile(projectPath: string): string {
  const files = fs.readdirSync(projectPath).filter(f =>
    f.endsWith('.braidr') && fs.statSync(path.join(projectPath, f)).isFile()
  );
  if (files.length === 0) throw new Error(`No .braidr file in "${projectPath}"`);
  if (files.length > 1) throw new Error(`Multiple .braidr files in "${projectPath}": ${files.join(', ')}`);
  return path.join(projectPath, files[0]);
}

function db(projectPath: string): BraidrDB {
  const { openDatabase } = require('./database') as typeof import('./database');
  const d = openDatabase(findMainBraidrFile(projectPath));
  d.ensureMainBranch();
  return d;
}

function toIndex(d: BraidrDB): BranchIndex {
  const rows = d.listBranchRows();
  const active = d.getActiveBranchRow();
  const branches: BranchInfo[] = rows
    .filter(r => r.name !== 'main')
    .map(r => ({
      name: r.name,
      description: r.description ?? undefined,
      createdAt: new Date(r.created_at).toISOString(),
      createdFrom: rows.find(x => x.id === r.created_from)?.name ?? 'main',
    }));
  return { branches, activeBranch: active && active.name !== 'main' ? active.name : null };
}

/** Persist current live tables into the active branch's snapshot. */
function persistActiveBranch(d: BraidrDB): void {
  const active = d.getActiveBranchRow() ?? d.ensureMainBranch();
  d.saveSnapshot(active.id, d.serializeBranchedTables());
}

export function listBranches(projectPath: string): BranchIndex {
  return toIndex(db(projectPath));
}

export async function createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
  const d = db(projectPath);
  if (d.getBranchByName(name)) throw new Error(`Branch "${name}" already exists`);
  const active = d.getActiveBranchRow() ?? d.ensureMainBranch();
  persistActiveBranch(d);
  const id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  d.insertBranchRow(id, name, description ?? null, active.id);
  d.saveSnapshot(id, d.serializeBranchedTables()); // new branch starts as a copy of current state
  d.setActiveBranchRow(id);
  d.checkpoint();
  return toIndex(d);
}

export function switchBranch(projectPath: string, name: string | null): BranchIndex {
  const d = db(projectPath);
  const target = name === null ? d.ensureMainBranch() : d.getBranchByName(name);
  if (!target) throw new Error(`Branch "${name}" does not exist`);
  persistActiveBranch(d);
  const snap = d.getSnapshot(target.id);
  if (snap) d.restoreBranchedTables(snap);
  d.setActiveBranchRow(target.id);
  d.checkpoint();
  return toIndex(d);
}

export function deleteBranch(projectPath: string, name: string): BranchIndex {
  const d = db(projectPath);
  const target = d.getBranchByName(name);
  if (target) {
    const active = d.getActiveBranchRow();
    if (active?.id === target.id) {
      // switch to main before deleting the active branch
      const main = d.ensureMainBranch();
      const snap = d.getSnapshot(main.id);
      if (snap) d.restoreBranchedTables(snap);
      d.setActiveBranchRow(main.id);
    }
    d.deleteBranchRow(target.id);
    d.checkpoint();
  }
  return toIndex(d);
}

/** Read a branch's scenes — from live tables if active, else from its snapshot. */
function branchScenes(d: BraidrDB, name: string | null): { scenes: SceneRow[]; drafts: Map<string, string> } {
  const branch = name === null ? d.ensureMainBranch() : d.getBranchByName(name);
  if (!branch) throw new Error(`Branch "${name ?? 'main'}" not found`);
  const active = d.getActiveBranchRow();
  if (active?.id === branch.id) {
    const scenes = d.getScenes() as SceneRow[];
    const drafts = new Map<string, string>();
    for (const s of scenes) { const dr = d.getDraft(s.id); if (dr) drafts.set(s.id, dr.content); }
    return { scenes, drafts };
  }
  const snap = JSON.parse(d.getSnapshot(branch.id) ?? '{"tables":{}}') as { tables: Record<string, any[]> };
  const scenes = (snap.tables.scenes ?? []) as SceneRow[];
  const drafts = new Map<string, string>();
  for (const dr of (snap.tables.scene_drafts ?? [])) drafts.set(dr.scene_id, dr.content);
  return { scenes, drafts };
}

export async function compareBranches(projectPath: string, leftBranch: string | null, rightBranch: string | null): Promise<BranchCompareData> {
  const d = db(projectPath);
  const left = branchScenes(d, leftBranch);
  const right = branchScenes(d, rightBranch);
  const leftMap = new Map(left.scenes.map(s => [s.id, s] as const));
  const rightMap = new Map(right.scenes.map(s => [s.id, s] as const));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const diffs: BranchSceneDiff[] = [];
  for (const sceneId of allIds) {
    const l = leftMap.get(sceneId);
    const r = rightMap.get(sceneId);
    const base = (l ?? r)!;
    const leftTitle = l?.title ?? '';
    const rightTitle = r?.title ?? '';
    const leftPosition = l?.timeline_position ?? null;
    const rightPosition = r?.timeline_position ?? null;
    const leftSceneNumber = l?.scene_number ?? null;
    const rightSceneNumber = r?.scene_number ?? null;
    let changeType: BranchSceneDiff['changeType'];
    if (!l) changeType = 'added';
    else if (!r) changeType = 'removed';
    else if (leftTitle !== rightTitle || leftPosition !== rightPosition || leftSceneNumber !== rightSceneNumber || (left.drafts.get(sceneId) ?? '') !== (right.drafts.get(sceneId) ?? '')) changeType = 'modified';
    else changeType = 'unchanged';
    diffs.push({
      sceneId, characterId: base.character_id, characterName: '',
      sceneNumber: base.scene_number,
      leftTitle, rightTitle, leftPosition, rightPosition, leftSceneNumber, rightSceneNumber,
      leftWordCount: l?.word_count ?? null, rightWordCount: r?.word_count ?? null,
      changed: changeType !== 'unchanged', changeType,
    });
  }
  return { leftName: leftBranch ?? 'main', rightName: rightBranch ?? 'main', scenes: diffs };
}

export async function mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void> {
  if (sceneIds.length === 0) return;
  const d = db(projectPath);
  const source = branchScenes(d, branchName);
  const main = d.ensureMainBranch();
  const active = d.getActiveBranchRow();
  const sourceMap = new Map(source.scenes.map(s => [s.id, s] as const));

  const applyToLive = active?.id === main.id;
  if (applyToLive) {
    for (const sid of sceneIds) {
      const s = sourceMap.get(sid);
      if (!s || !d.getScene(sid)) continue;
      d.updateScene(sid, {
        title: s.title, synopsis: s.synopsis,
        timelinePosition: s.timeline_position ?? undefined,
        sceneNumber: s.scene_number, sceneOrder: (s as any).scene_order,
        wordCount: s.word_count ?? undefined,
      });
      const draft = source.drafts.get(sid);
      if (draft !== undefined) d.upsertDraft(sid, draft);
    }
  } else {
    // main is not active: edit its snapshot document in place
    const snap = JSON.parse(d.getSnapshot(main.id) ?? '{"formatVersion":1,"tables":{}}');
    const mainScenes: any[] = snap.tables.scenes ?? [];
    const mainDrafts: any[] = snap.tables.scene_drafts ?? (snap.tables.scene_drafts = []);
    for (const sid of sceneIds) {
      const s = sourceMap.get(sid);
      const target = mainScenes.find(x => x.id === sid);
      if (!s || !target) continue;
      Object.assign(target, { title: s.title, synopsis: s.synopsis, timeline_position: s.timeline_position, scene_number: s.scene_number, scene_order: (s as any).scene_order, word_count: s.word_count });
      const draft = source.drafts.get(sid);
      if (draft !== undefined) {
        const dr = mainDrafts.find(x => x.scene_id === sid);
        if (dr) dr.content = draft;
      }
    }
    d.saveSnapshot(main.id, JSON.stringify(snap));
  }
  d.checkpoint();
}

export async function getBranchSceneDraft(projectPath: string, branchName: string | null, sceneId: string): Promise<string> {
  const d = db(projectPath);
  const { drafts } = branchScenes(d, branchName);
  return drafts.get(sceneId) ?? '';
}
```

> Note: `characterName` is left `''` here (the renderer's compare view colors by `characterId`); wiring names is part of the deferred compare/merge rework and out of scope.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/branches.test.ts`
Expected: PASS (all in-file branch tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/branches.ts src/__tests__/branches.test.ts
git commit -m "feat(branches): rewrite branch ops against in-file snapshots"
```

---

## Task 5: One-time migration from filesystem branches

**Files:**
- Create: `src/main/branchMigration.ts`
- Test: `src/__tests__/branchMigration.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/branchMigration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { migrateFilesystemBranches } from '../main/branchMigration';

describe('filesystem branch migration', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-mig-')); });
  afterEach(async () => { (await import('../main/database')).closeAllDatabases(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('imports old branch files as snapshots, preserves active branch, archives folder', async () => {
    const mod = await import('../main/database');
    const now = Date.now();
    // main file
    const mainPath = path.join(tmp, 'proj.braidr');
    const main = new mod.BraidrDB(mainPath);
    main.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    main.prepare("INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES ('s1','c1',1,0,'Main title',?,?)").run(now, now);
    mod.closeDatabase(mainPath);
    // old branch file with a different title
    fs.mkdirSync(path.join(tmp, 'branches'), { recursive: true });
    const altPath = path.join(tmp, 'branches', 'alt.braidr');
    const alt = new mod.BraidrDB(altPath);
    alt.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    alt.prepare("INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES ('s1','c1',1,0,'Alt title',?,?)").run(now, now);
    mod.closeDatabase(altPath);
    fs.writeFileSync(path.join(tmp, 'branches', 'index.json'), JSON.stringify({ branches: [{ name: 'alt', createdAt: new Date().toISOString(), createdFrom: 'main' }], activeBranch: 'alt' }));

    migrateFilesystemBranches(tmp);

    const d = mod.openDatabase(mainPath);
    const rows = d.listBranchRows();
    expect(rows.map(r => r.name).sort()).toEqual(['alt', 'main']);
    // active was 'alt' → live tables should hold the alt title
    expect(d.getActiveBranchRow()!.name).toBe('alt');
    expect(d.getScene('s1')!.title).toBe('Alt title');
    // folder archived, not deleted
    expect(fs.existsSync(path.join(tmp, 'branches'))).toBe(false);
    expect(fs.readdirSync(tmp).some(f => f.startsWith('branches.migrated-'))).toBe(true);

    // idempotent: second run is a no-op (no throw, no duplicate branches)
    migrateFilesystemBranches(tmp);
    expect(mod.openDatabase(mainPath).listBranchRows()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/branchMigration.test.ts`
Expected: FAIL — `migrateFilesystemBranches` not found.

- [ ] **Step 3: Implement the migration**

```ts
// src/main/branchMigration.ts
import * as fs from 'fs';
import * as path from 'path';
import type { BraidrDB } from './database';

function findMainBraidrFile(projectPath: string): string | null {
  const files = fs.readdirSync(projectPath).filter(f =>
    f.endsWith('.braidr') && fs.statSync(path.join(projectPath, f)).isFile()
  );
  return files.length === 1 ? path.join(projectPath, files[0]) : (files[0] ? path.join(projectPath, files[0]) : null);
}

/**
 * One-time, idempotent migration of legacy filesystem branches
 * (branches/index.json + branches/<name>.braidr) into the main .braidr file.
 * Archives the branches/ folder afterward (kept as a dated backup).
 */
export function migrateFilesystemBranches(projectPath: string): void {
  const branchesDir = path.join(projectPath, 'branches');
  const indexPath = path.join(branchesDir, 'index.json');
  if (!fs.existsSync(indexPath)) return; // nothing to migrate / already migrated

  const mainPath = findMainBraidrFile(projectPath);
  if (!mainPath) return;

  const { openDatabase, closeDatabase, BraidrDB } = require('./database') as typeof import('./database');
  const main = openDatabase(mainPath);
  main.ensureMainBranch();

  let index: { branches: { name: string; description?: string; createdAt?: string }[]; activeBranch: string | null };
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); }
  catch { return; }

  // 1. snapshot main's current live tables
  const mainRow = main.ensureMainBranch();
  main.saveSnapshot(mainRow.id, main.serializeBranchedTables());

  // 2. import each old branch file as a snapshot
  let activeBranchId: string | null = null;
  for (const b of index.branches) {
    if (main.getBranchByName(b.name)) continue; // already imported
    const branchFile = path.join(branchesDir, `${b.name}.braidr`);
    if (!fs.existsSync(branchFile)) continue; // skip missing/corrupt branch (folder kept as backup)
    const id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    main.insertBranchRow(id, b.name, b.description ?? null, mainRow.id);
    let branchDb: BraidrDB | null = null;
    try {
      branchDb = openDatabase(branchFile);
      main.saveSnapshot(id, branchDb.serializeBranchedTables());
    } catch {
      // corrupt branch file — leave the row with no usable snapshot; backup folder retains the file
    } finally {
      if (branchDb) closeDatabase(branchFile);
    }
    if (index.activeBranch === b.name) activeBranchId = id;
  }

  // 3. restore the previously-active branch into the live tables
  if (activeBranchId) {
    const snap = main.getSnapshot(activeBranchId);
    if (snap) main.restoreBranchedTables(snap);
    main.setActiveBranchRow(activeBranchId);
  } else {
    main.setActiveBranchRow(mainRow.id);
  }
  main.checkpoint();

  // 4. archive the old folder (never delete)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(branchesDir, path.join(projectPath, `branches.migrated-${stamp}`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/branchMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/branchMigration.ts src/__tests__/branchMigration.test.ts
git commit -m "feat(branches): one-time migration of filesystem branches into .braidr"
```

---

## Task 6: Wire migration into load + remove the redirect + rewrite positions handlers

**Files:**
- Modify: `src/main/braidrIpc.ts:120-140` (BRAIDR_LOAD_PROJECT)
- Modify: `src/main/main.ts:1017-1037` (positions handlers)

- [ ] **Step 1: Replace the active-branch redirect with migration**

In `src/main/braidrIpc.ts`, replace lines 125-140 (the `const folderPath = ...` through the redirect block) with:

```ts
    const folderPath = pathMod.dirname(braidrPath);

    // Migrate any legacy filesystem branches into this .braidr (idempotent no-op otherwise).
    try {
      const { migrateFilesystemBranches } = require('./branchMigration') as typeof import('./branchMigration');
      migrateFilesystemBranches(folderPath);
    } catch (e) { console.error('[BRAIDR_LOAD_PROJECT] branch migration failed (non-fatal)', e); }

    // The active branch now lives in the main file's live tables — no redirect.
    const activeBraidrPath = braidrPath;
```

Leave the rest of the handler (everything downstream that uses `activeBraidrPath`) unchanged.

- [ ] **Step 2: Rewrite the positions handlers to use the DB**

In `src/main/main.ts`, replace the `BRANCHES_READ_POSITIONS` and `BRANCHES_SAVE_POSITIONS` handler bodies (1017-1037) with DB-backed versions keyed by branch name. The `branch_positions` table is keyed by `branch_id`; resolve the branch by name (null/"main" → main row):

```ts
ipcMain.handle(IPC_CHANNELS.BRANCHES_READ_POSITIONS, async (_event, projectPath: string, branchName: string) => {
  try {
    const { openDatabase } = require('./database') as typeof import('./database');
    const branches = require('./branches') as typeof import('./branches');
    const mainPath = branches.findMainBraidrFile(projectPath);
    const d = openDatabase(mainPath);
    const branch = (branchName && branchName !== 'main') ? d.getBranchByName(branchName) : d.ensureMainBranch();
    if (!branch) return { success: true, data: {} };
    const row = d.prepare('SELECT positions_json FROM branch_positions WHERE branch_id = ?').get(branch.id) as { positions_json: string } | undefined;
    return { success: true, data: row ? JSON.parse(row.positions_json) : {} };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRANCHES_SAVE_POSITIONS, async (_event, projectPath: string, branchName: string, positions: Record<string, number>) => {
  try {
    const { openDatabase } = require('./database') as typeof import('./database');
    const branches = require('./branches') as typeof import('./branches');
    const mainPath = branches.findMainBraidrFile(projectPath);
    const d = openDatabase(mainPath);
    const branch = (branchName && branchName !== 'main') ? d.getBranchByName(branchName) : d.ensureMainBranch();
    if (!branch) return { success: true };
    d.prepare(`INSERT INTO branch_positions (branch_id, positions_json) VALUES (?, ?)
               ON CONFLICT(branch_id) DO UPDATE SET positions_json = excluded.positions_json`).run(branch.id, JSON.stringify(positions));
    d.checkpoint();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

This requires `findMainBraidrFile` to be exported from `branches.ts` — in Task 4's `branches.ts`, change `function findMainBraidrFile` to `export function findMainBraidrFile`.

- [ ] **Step 3: Verify the full suite still passes**

Run: `npx vitest run src/__tests__/branches.test.ts src/__tests__/branchStorage.test.ts src/__tests__/branchMigration.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/braidrIpc.ts src/main/main.ts src/main/branches.ts
git commit -m "feat(branches): migrate on load, drop redirect, DB-backed positions"
```

---

## Task 7: Importer + typecheck + docs

**Files:**
- Modify: `src/main/importer.ts:581-630` (it writes the dropped `branch_scene_snapshots` table)
- Modify: `docs/features.md`

- [ ] **Step 1: Fix the importer's branch writes**

`importer.ts` currently calls `db.insertBranch(...)`, `db.insertBranchSnapshot(...)`, `db.getBranches()`, `db.setActiveBranch(...)` (removed in Tasks 1/3). Replace those calls with the new API: insert a `main` row via `db.ensureMainBranch()`, and for each legacy branch use `db.insertBranchRow(id, name, desc, mainId)` + `db.saveSnapshot(id, db.serializeBranchedTables())` after loading that branch's data, then `db.setActiveBranchRow(activeId)`. If the importer's per-branch data is not readily available as live tables at that point, insert the branch rows only and let the first load populate snapshots; at minimum the file MUST compile and not reference removed methods.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'branches|branchTables|branchMigration|database|importer|braidrIpc' || echo 'no errors in changed files'`
Expected: `no errors in changed files` (pre-existing unrelated errors elsewhere are acceptable per project notes).

- [ ] **Step 3: Full test run**

Run: `npx vitest run`
Expected: PASS (no regressions)

- [ ] **Step 4: Update feature docs**

In `docs/features.md`, update the Draft Branches section to state that branches are stored inside the `.braidr` file (scenes, drafts, characters, plot points, arcs, timeline are versioned; tasks, notes, writing sessions are shared) and that legacy filesystem branches are migrated automatically on first open, with the old `branches/` folder kept as a dated backup.

- [ ] **Step 5: Commit**

```bash
git add src/main/importer.ts docs/features.md
git commit -m "chore(branches): port importer to in-file branches; update feature docs"
```

---

## Self-review notes (spec coverage)

- Spec §1 branched/shared boundary → `BRANCHED_TABLES` (Task 2), shared survival test (Task 2 Step 2).
- Spec §2 storage (`branch_snapshots`, main as a real row, retire `branch_scene_snapshots`) → Tasks 1, 3.
- Spec §3 operations (create/switch/delete + transactional, FK-safe swap) → Tasks 2, 4.
- Spec §3 compare/merge "preserve behavior" → Task 4 (ported, names deferred).
- Spec §4 migration (snapshot main, import branches, restore active, archive folder, idempotent, skip corrupt) → Task 5.
- Spec §5 surface (no renderer change, remove redirect, DB-backed) → Tasks 4, 6; positions moved into the file (loose end surfaced during planning) → Tasks 1, 6.
- Spec §6 testing → Tasks 2, 4, 5 plus full-suite run Task 7.
```
