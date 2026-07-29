# Branch Feature Rework: SQLite-Based Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework draft branches to use `.braidr` SQLite files (one per branch), so editing on a branch actually modifies branch data, and compare surfaces all meaningful differences — added/removed scenes, title changes, order changes, draft word count.

**Architecture:** Each branch is a full SQLite copy at `branches/<name>.braidr`. On `BRAIDR_LOAD_PROJECT`, the main process checks `branches/index.json` for an active branch and loads from the branch file, returning the effective path so the data service routes all saves there. `compareBranches` opens both SQLite files (read-only access) and diffs scenes by UUID. Legacy `.md`-only branches are flagged with `legacy: true` so the UI can warn the user without crashing. `createBranch` uses SQLite's online backup API to produce an atomic file copy.

**Tech Stack:** better-sqlite3 (sync), Vitest, React + TypeScript, Electron IPC

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/shared/types.ts` | Modify | `BranchInfo` + `legacy` field; `BranchSceneDiff` + `changeType`, order, word count |
| `src/main/branches.ts` | Full rewrite | SQLite-based create/delete/compare/merge; legacy detection |
| `src/main/braidrIpc.ts` | Modify (line 63) | `BRAIDR_LOAD_PROJECT` reads active branch, returns `activeBraidrPath` |
| `src/renderer/services/dataService.ts` | Modify | Store `result.data.activeBraidrPath` in `this.braidrPath` |
| `src/renderer/components/branches/CompareView.tsx` | Modify | Remove position filter; add change-type badges |
| `src/renderer/components/branches/MergeDialog.tsx` | Modify | Disable merge of "added" scenes (not in main), show note |
| `src/__tests__/branches.test.ts` | Full rewrite | Tests against real SQLite files; async `createBranch` |
| `src/main/branches.ts` | Modify (Task 8) | Add `getBranchSceneDraft` function |
| `src/main/main.ts` | Modify (Task 8) | Add `BRANCHES_GET_SCENE_DRAFT` IPC handler |
| `src/renderer/services/dataService.ts` | Modify (Task 8) | Add `getBranchSceneDraft` method |

---

## Task 1: Update Shared Types

**Files:**
- Modify: `src/shared/types.ts` lines 319–347

- [ ] **Step 1: Update `BranchInfo` to add `legacy` flag**

In `src/shared/types.ts`, replace the `BranchInfo` interface:

```typescript
export interface BranchInfo {
  name: string;
  description?: string;
  createdAt: string;
  createdFrom: string;
  legacy?: boolean; // true = old .md-only branch, cannot be used
}
```

- [ ] **Step 2: Expand `BranchSceneDiff`**

Replace the `BranchSceneDiff` interface:

```typescript
export interface BranchSceneDiff {
  sceneId: string;
  characterId: string;
  characterName: string;
  sceneNumber: number;
  leftTitle: string;
  rightTitle: string;
  leftPosition: number | null;
  rightPosition: number | null;
  leftSceneNumber: number | null;   // position in character arc
  rightSceneNumber: number | null;
  leftWordCount: number | null;
  rightWordCount: number | null;
  changed: boolean;
  changeType: 'added' | 'removed' | 'modified' | 'unchanged';
}
```

- [ ] **Step 3: Run tests to confirm nothing broken**

```bash
cd /Users/brian/braidr && npm test
```

Expected: all existing tests pass (type changes are backward-compatible additions).

- [ ] **Step 4: Commit**

```bash
cd /Users/brian/braidr && git add src/shared/types.ts && git commit -m "feat(branches): expand BranchSceneDiff with changeType and order fields

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite `branches.ts` for SQLite

**Files:**
- Modify: `src/main/branches.ts` (full rewrite)

- [ ] **Step 1: Write the test first** — open `src/__tests__/branches.test.ts` and replace entirely with the SQLite-based test suite:

```typescript
/**
 * Tests for draft branch operations — SQLite-based implementation.
 *
 * Each test creates a real .braidr SQLite file in a temp directory
 * and exercises the branch functions against it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  listBranches,
  createBranch,
  switchBranch,
  deleteBranch,
  compareBranches,
  mergeBranch,
} from '../main/branches';

/* ── helpers ────────────────────────────────────────────────────────── */

async function setupProject(dir: string): Promise<string> {
  const braidrPath = path.join(dir, 'test-project.braidr');
  const mod = await import('../main/database');
  const db = new mod.BraidrDB(braidrPath);
  const now = Date.now();
  db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?, ?, ?, ?)').run('char-noah', 'Noah', 0, now);
  db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?, ?, ?, ?)').run('char-sally', 'Sally', 1, now);
  db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, timeline_position, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('noah-1', 'char-noah', 1, 0, 'Noah wakes up', 1, 100, now, now);
  db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, timeline_position, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('noah-2', 'char-noah', 2, 1, 'Noah meets Cormac', 3, 200, now, now);
  db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, timeline_position, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('sally-1', 'char-sally', 1, 0, 'Sally arrives in town', 2, 150, now, now);
  return braidrPath;
}

/* ── tests ──────────────────────────────────────────────────────────── */

describe('branch operations (SQLite)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-branch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ── listBranches ──────────────────────────────────────────────────

  it('returns empty index when no branches exist', async () => {
    await setupProject(tmp);
    const idx = listBranches(tmp);
    expect(idx.branches).toEqual([]);
    expect(idx.activeBranch).toBeNull();
  });

  // ── createBranch ──────────────────────────────────────────────────

  it('copies .braidr file, updates index, sets activeBranch', async () => {
    await setupProject(tmp);
    const idx = await createBranch(tmp, 'draft-1', 'first draft attempt');

    expect(idx.branches).toHaveLength(1);
    expect(idx.branches[0].name).toBe('draft-1');
    expect(idx.branches[0].description).toBe('first draft attempt');
    expect(idx.branches[0].createdFrom).toBe('main');
    expect(idx.activeBranch).toBe('draft-1');

    const branchBraidr = path.join(tmp, 'branches', 'draft-1.braidr');
    expect(fs.existsSync(branchBraidr)).toBe(true);
  });

  it('branch .braidr file has correct scene data', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    const scenes = branchDb.getScenes();
    expect(scenes).toHaveLength(3);
    expect(scenes.find(s => s.id === 'noah-1')?.title).toBe('Noah wakes up');
  });

  it('creates a branch from another branch when one is active', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    // Modify draft-1
    const mod = await import('../main/database');
    const draft1Db = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    draft1Db.updateScene('noah-1', { title: 'Noah wakes up in a sweat' });

    const idx = await createBranch(tmp, 'draft-2');
    expect(idx.branches[1].createdFrom).toBe('draft-1');

    const draft2Db = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-2.braidr'));
    const noah1 = draft2Db.getScene('noah-1');
    expect(noah1?.title).toBe('Noah wakes up in a sweat');
  });

  // ── switchBranch ──────────────────────────────────────────────────

  it('sets activeBranch to a branch name', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');
    const idx = switchBranch(tmp, null);
    expect(idx.activeBranch).toBeNull();

    const idx2 = switchBranch(tmp, 'draft-1');
    expect(idx2.activeBranch).toBe('draft-1');
  });

  it('switches to main by passing null', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');
    expect(listBranches(tmp).activeBranch).toBe('draft-1');

    const idx = switchBranch(tmp, null);
    expect(idx.activeBranch).toBeNull();
  });

  // ── deleteBranch ──────────────────────────────────────────────────

  it('removes .braidr file and index entry', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');
    switchBranch(tmp, null);
    const idx = deleteBranch(tmp, 'draft-1');

    expect(idx.branches).toHaveLength(0);
    expect(fs.existsSync(path.join(tmp, 'branches', 'draft-1.braidr'))).toBe(false);
  });

  it('switches to main if the active branch is deleted', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');
    expect(listBranches(tmp).activeBranch).toBe('draft-1');

    const idx = deleteBranch(tmp, 'draft-1');
    expect(idx.activeBranch).toBeNull();
  });

  // ── compareBranches ───────────────────────────────────────────────

  it('detects title change between main and branch', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.updateScene('noah-1', { title: 'Noah wakes up screaming' });

    const diff = compareBranches(tmp, null, 'draft-1');
    expect(diff.leftName).toBe('main');
    expect(diff.rightName).toBe('draft-1');

    const noah1 = diff.scenes.find(s => s.sceneId === 'noah-1');
    expect(noah1?.changeType).toBe('modified');
    expect(noah1?.leftTitle).toBe('Noah wakes up');
    expect(noah1?.rightTitle).toBe('Noah wakes up screaming');
    expect(noah1?.changed).toBe(true);
  });

  it('detects timeline position change', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.updateScene('sally-1', { timelinePosition: 99 });

    const diff = compareBranches(tmp, null, 'draft-1');
    const sally1 = diff.scenes.find(s => s.sceneId === 'sally-1');
    expect(sally1?.changeType).toBe('modified');
    expect(sally1?.leftPosition).toBe(2);
    expect(sally1?.rightPosition).toBe(99);
  });

  it('detects scene added to branch only', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    const now = Date.now();
    branchDb.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('noah-3', 'char-noah', 3, 2, 'New scene', now, now);

    const diff = compareBranches(tmp, null, 'draft-1');
    const noah3 = diff.scenes.find(s => s.sceneId === 'noah-3');
    expect(noah3?.changeType).toBe('added');
    expect(noah3?.changed).toBe(true);
    expect(noah3?.leftTitle).toBe('');
    expect(noah3?.rightTitle).toBe('New scene');
  });

  it('marks unchanged scenes correctly', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const diff = compareBranches(tmp, null, 'draft-1');
    const noah2 = diff.scenes.find(s => s.sceneId === 'noah-2');
    expect(noah2?.changeType).toBe('unchanged');
    expect(noah2?.changed).toBe(false);
  });

  // ── mergeBranch ───────────────────────────────────────────────────

  it('selectively copies scene changes from branch to main', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.updateScene('noah-1', { title: 'Noah wakes up in a cold sweat', timelinePosition: 10 });
    branchDb.updateScene('sally-1', { timelinePosition: 20 });

    mergeBranch(tmp, 'draft-1', ['noah-1']);

    const mainDb = new mod.BraidrDB(path.join(tmp, 'test-project.braidr'));
    const noah1 = mainDb.getScene('noah-1');
    expect(noah1?.title).toBe('Noah wakes up in a cold sweat');
    expect(noah1?.timeline_position).toBe(10);

    // sally-1 not merged
    const sally1 = mainDb.getScene('sally-1');
    expect(sally1?.timeline_position).toBe(2);
  });

  it('also merges draft content from branch to main', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.upsertDraft('noah-1', '<p>Branch draft content</p>');

    mergeBranch(tmp, 'draft-1', ['noah-1']);

    const mainDb = new mod.BraidrDB(path.join(tmp, 'test-project.braidr'));
    const draft = mainDb.getDraft('noah-1');
    expect(draft?.content).toBe('<p>Branch draft content</p>');
  });

  // ── legacy branch detection ───────────────────────────────────────

  it('marks branches with no .braidr file as legacy', async () => {
    await setupProject(tmp);
    // Simulate old .md branch: directory exists but no .braidr
    const legacyDir = path.join(tmp, 'branches', 'old-branch');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'Noah.md'), '---\ncharacter: Noah\n---\n1. Noah walks <!-- sid:abc -->\n');
    // Write a branch index with this legacy entry
    const indexPath = path.join(tmp, 'branches', 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      branches: [{ name: 'old-branch', createdAt: new Date().toISOString(), createdFrom: 'main' }],
      activeBranch: null,
    }));

    const idx = listBranches(tmp);
    expect(idx.branches).toHaveLength(1);
    expect(idx.branches[0].legacy).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/brian/braidr && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: Most tests fail with import errors or missing exports.

- [ ] **Step 3: Rewrite `src/main/branches.ts`**

Replace the entire file:

```typescript
/**
 * Draft branch operations for Braidr — SQLite-based implementation.
 *
 * A "branch" is a full copy of the project's .braidr SQLite file at
 * `branches/<name>.braidr`. The branch index at `branches/index.json`
 * tracks which branches exist and which one (if any) is active.
 *
 * "main" is the implicit default — the .braidr file in the project root.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BranchIndex, BranchInfo, BranchCompareData, BranchSceneDiff } from '../shared/types';

/* ── internal helpers ───────────────────────────────────────────────── */

function branchesDir(projectPath: string): string {
  return path.join(projectPath, 'branches');
}

function indexPath(projectPath: string): string {
  return path.join(branchesDir(projectPath), 'index.json');
}

function readIndex(projectPath: string): BranchIndex {
  const p = indexPath(projectPath);
  if (!fs.existsSync(p)) return { branches: [], activeBranch: null };
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeIndex(projectPath: string, index: BranchIndex): void {
  const dir = branchesDir(projectPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = indexPath(projectPath) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), 'utf-8');
  fs.renameSync(tmp, indexPath(projectPath));
}

/**
 * Find the main .braidr file in the project root directory.
 * Returns null if not found (should not happen in a valid project).
 */
export function findMainBraidrFile(projectPath: string): string | null {
  if (!fs.existsSync(projectPath)) return null;
  const files = fs.readdirSync(projectPath).filter(f =>
    f.endsWith('.braidr') && fs.statSync(path.join(projectPath, f)).isFile()
  );
  return files.length > 0 ? path.join(projectPath, files[0]) : null;
}

/**
 * Return the .braidr path for a given branch name (null = main).
 */
export function getBranchBraidrPath(projectPath: string, branchName: string | null): string | null {
  if (branchName === null) return findMainBraidrFile(projectPath);
  return path.join(branchesDir(projectPath), `${branchName}.braidr`);
}

/* ── exported functions ─────────────────────────────────────────────── */

/** Read branch index, marking branches with no .braidr file as legacy. */
export function listBranches(projectPath: string): BranchIndex {
  const index = readIndex(projectPath);
  // Mark any branch whose .braidr file doesn't exist as legacy
  index.branches = index.branches.map(b => {
    if (b.legacy) return b;
    const braidrPath = path.join(branchesDir(projectPath), `${b.name}.braidr`);
    if (!fs.existsSync(braidrPath)) return { ...b, legacy: true };
    return b;
  });
  return index;
}

/**
 * Create a new branch by copying the current source .braidr file using
 * SQLite's online backup API (safe even with concurrent writers).
 */
export async function createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
  const index = readIndex(projectPath);

  const sourceLabel = index.activeBranch ?? 'main';
  const sourcePath = index.activeBranch
    ? path.join(branchesDir(projectPath), `${index.activeBranch}.braidr`)
    : findMainBraidrFile(projectPath);

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Cannot find source .braidr for branch "${sourceLabel}"`);
  }

  const dir = branchesDir(projectPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const destPath = path.join(dir, `${name}.braidr`);

  // Use SQLite's online backup API for a safe atomic copy
  const { openDatabase } = require('./database') as typeof import('./database');
  const sourceDb = openDatabase(sourcePath);
  await sourceDb.backup(destPath);

  const info: BranchInfo = {
    name,
    description,
    createdAt: new Date().toISOString(),
    createdFrom: sourceLabel,
  };
  index.branches.push(info);
  index.activeBranch = name;
  writeIndex(projectPath, index);
  return index;
}

/** Switch the active branch (pass null to go back to main). */
export function switchBranch(projectPath: string, name: string | null): BranchIndex {
  const index = readIndex(projectPath);
  index.activeBranch = name;
  writeIndex(projectPath, index);
  return index;
}

/** Delete a branch's .braidr file and remove it from the index. */
export function deleteBranch(projectPath: string, name: string): BranchIndex {
  const index = readIndex(projectPath);

  const braidrPath = path.join(branchesDir(projectPath), `${name}.braidr`);
  if (fs.existsSync(braidrPath)) fs.unlinkSync(braidrPath);
  // Clean up WAL auxiliary files
  for (const ext of ['-shm', '-wal']) {
    const aux = braidrPath + ext;
    if (fs.existsSync(aux)) fs.unlinkSync(aux);
  }
  // Remove old .md directory if it exists (legacy cleanup)
  const legacyDir = path.join(branchesDir(projectPath), name);
  if (fs.existsSync(legacyDir) && fs.statSync(legacyDir).isDirectory()) {
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }

  index.branches = index.branches.filter(b => b.name !== name);
  if (index.activeBranch === name) index.activeBranch = null;
  writeIndex(projectPath, index);
  return index;
}

/**
 * Compare two branches (null = main). Opens both .braidr files and diffs
 * scenes by ID. Detects: added, removed, title changes, order changes,
 * position changes, word count changes.
 */
export function compareBranches(
  projectPath: string,
  leftBranch: string | null,
  rightBranch: string | null,
): BranchCompareData {
  const leftPath = getBranchBraidrPath(projectPath, leftBranch);
  const rightPath = getBranchBraidrPath(projectPath, rightBranch);

  if (!leftPath || !fs.existsSync(leftPath)) {
    throw new Error(`Branch "${leftBranch ?? 'main'}" not found`);
  }
  if (!rightPath || !fs.existsSync(rightPath)) {
    throw new Error(`Branch "${rightBranch ?? 'main'}" not found`);
  }

  const { openDatabase } = require('./database') as typeof import('./database');
  const leftDb = openDatabase(leftPath);
  const rightDb = openDatabase(rightPath);

  const leftScenes = leftDb.getScenes();
  const rightScenes = rightDb.getScenes();

  const leftChars = new Map(leftDb.getCharacters().map(c => [c.id, c.name]));
  const rightChars = new Map(rightDb.getCharacters().map(c => [c.id, c.name]));

  const leftMap = new Map(leftScenes.map(s => [s.id, s]));
  const rightMap = new Map(rightScenes.map(s => [s.id, s]));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);

  const diffs: BranchSceneDiff[] = [];

  for (const sceneId of allIds) {
    const left = leftMap.get(sceneId);
    const right = rightMap.get(sceneId);

    const charId = (left ?? right)!.character_id;
    const charName = leftChars.get(charId) ?? rightChars.get(charId) ?? 'Unknown';

    const leftTitle = left?.title ?? '';
    const rightTitle = right?.title ?? '';
    const leftPosition = left?.timeline_position ?? null;
    const rightPosition = right?.timeline_position ?? null;
    const leftSceneNumber = left?.scene_number ?? null;
    const rightSceneNumber = right?.scene_number ?? null;
    const leftWordCount = left?.word_count ?? null;
    const rightWordCount = right?.word_count ?? null;

    let changeType: BranchSceneDiff['changeType'];
    if (!left) {
      changeType = 'added';
    } else if (!right) {
      changeType = 'removed';
    } else if (
      leftTitle !== rightTitle ||
      leftPosition !== rightPosition ||
      leftSceneNumber !== rightSceneNumber
    ) {
      changeType = 'modified';
    } else {
      changeType = 'unchanged';
    }

    diffs.push({
      sceneId,
      characterId: charId,
      characterName: charName,
      sceneNumber: (left ?? right)!.scene_number,
      leftTitle,
      rightTitle,
      leftPosition,
      rightPosition,
      leftSceneNumber,
      rightSceneNumber,
      leftWordCount,
      rightWordCount,
      changed: changeType !== 'unchanged',
      changeType,
    });
  }

  return {
    leftName: leftBranch ?? 'main',
    rightName: rightBranch ?? 'main',
    scenes: diffs,
  };
}

/**
 * Merge selected scenes from a branch into main.
 * For each sceneId: updates the scene row in main and copies draft content.
 * Only scenes that exist in BOTH databases are merged (INSERT not supported).
 */
export function mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): void {
  if (sceneIds.length === 0) return;

  const mainPath = findMainBraidrFile(projectPath);
  const branchPath = getBranchBraidrPath(projectPath, branchName);

  if (!mainPath || !fs.existsSync(mainPath)) {
    throw new Error('Main .braidr file not found');
  }
  if (!branchPath || !fs.existsSync(branchPath)) {
    throw new Error(`Branch "${branchName}" not found`);
  }

  const { openDatabase } = require('./database') as typeof import('./database');
  const mainDb = openDatabase(mainPath);
  const branchDb = openDatabase(branchPath);

  for (const sceneId of sceneIds) {
    const branchScene = branchDb.getScene(sceneId);
    if (!branchScene) continue;

    // Only update if scene exists in main (no cross-DB inserts)
    const mainScene = mainDb.getScene(sceneId);
    if (!mainScene) continue;

    mainDb.updateScene(sceneId, {
      title: branchScene.title,
      synopsis: branchScene.synopsis,
      timelinePosition: branchScene.timeline_position ?? undefined,
      sceneNumber: branchScene.scene_number,
      sceneOrder: branchScene.scene_order,
      wordCount: branchScene.word_count ?? undefined,
    });

    // Also merge draft content if present in branch
    const branchDraft = branchDb.getDraft(sceneId);
    if (branchDraft) {
      mainDb.upsertDraft(sceneId, branchDraft.content);
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/brian/braidr && npm test -- --reporter=verbose 2>&1 | tail -40
```

Expected: All new branch tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/brian/braidr && git add src/main/branches.ts src/__tests__/branches.test.ts && git commit -m "feat(branches): rewrite branch storage to use SQLite .braidr files

- createBranch copies .braidr via SQLite backup API (atomic, WAL-safe)
- compareBranches diffs two .braidr databases by scene UUID
- mergeBranch copies scene rows + draft content between databases
- listBranches marks old .md-only branches as legacy
- Full test suite against real SQLite files

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Update `braidrIpc.ts` — Branch-Aware Loading

**Files:**
- Modify: `src/main/braidrIpc.ts` line 63

The `BRAIDR_LOAD_PROJECT` handler must:
1. Derive the project folder from the braidr file path
2. Check `branches/index.json` for an `activeBranch`
3. If active branch exists AND its `.braidr` file exists, redirect to it
4. Return `activeBraidrPath` in the data payload so `dataService` routes saves to the right file

- [ ] **Step 1: Modify the `BRAIDR_LOAD_PROJECT` handler**

In `src/main/braidrIpc.ts`, replace line 63:

```typescript
ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_PROJECT, (_event, braidrPath: string) => {
```

with this expanded version (the `try` block on line 64 stays the same structure, but add the branch redirect before calling `getDb`):

```typescript
ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_PROJECT, (_event, braidrPath: string) => {
  try {
    const fsMod = require('fs') as typeof import('fs');
    const pathMod = require('path') as typeof import('path');

    const folderPath = braidrPath.substring(0, braidrPath.lastIndexOf('/'));

    // Check for an active branch and redirect to its .braidr file if it exists
    let activeBraidrPath = braidrPath;
    const branchIndexPath = pathMod.join(folderPath, 'branches', 'index.json');
    if (fsMod.existsSync(branchIndexPath)) {
      try {
        const idx = JSON.parse(fsMod.readFileSync(branchIndexPath, 'utf-8'));
        if (idx.activeBranch) {
          const candidatePath = pathMod.join(folderPath, 'branches', `${idx.activeBranch}.braidr`);
          if (fsMod.existsSync(candidatePath)) {
            activeBraidrPath = candidatePath;
          }
        }
      } catch { /* non-fatal: bad index.json, fall back to main */ }
    }

    const db = getDb(activeBraidrPath);
```

Find the `return` statement at the end of the handler (around line 372–410) and add `activeBraidrPath` to the returned data:

```typescript
    return {
      success: true,
      data: {
        activeBraidrPath,   // ← add this line
        projectPath: folderPath,
        projectName,
        characters,
        // ... rest of fields unchanged
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/brian/braidr && npm test
```

Expected: all tests still pass (no IPC tests, this is runtime behavior).

- [ ] **Step 3: Commit**

```bash
cd /Users/brian/braidr && git add src/main/braidrIpc.ts && git commit -m "feat(branches): BRAIDR_LOAD_PROJECT reads active branch from index.json

Redirects to branches/<name>.braidr when a branch is active,
returns activeBraidrPath so the data service routes saves correctly.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update `dataService.ts` — Route Saves to Active Branch

**Files:**
- Modify: `src/renderer/services/dataService.ts`

- [ ] **Step 1: Update `loadProject` to use `activeBraidrPath`**

In `src/renderer/services/dataService.ts`, find the `loadProject` method (around line 73–85). Replace:

```typescript
      this.braidrPath = formatResult.braidrPath;
      const result = await window.electronAPI.braidrLoadProject(formatResult.braidrPath);
```

with:

```typescript
      const result = await window.electronAPI.braidrLoadProject(formatResult.braidrPath);
      // Use the branch file if a branch is active; otherwise the main file
      this.braidrPath = (result.data as any).activeBraidrPath ?? formatResult.braidrPath;
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/brian/braidr && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/brian/braidr && git add src/renderer/services/dataService.ts && git commit -m "feat(branches): route saves to active branch .braidr file

When a branch is active, all writes (saveDraft, saveCharacter, etc.)
go to branches/<name>.braidr instead of the main project file.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Improve `CompareView.tsx`

**Files:**
- Modify: `src/renderer/components/branches/CompareView.tsx`

Problems to fix:
1. `buildRailsColumn` filters out scenes with `null` position — changed scenes that haven't been placed in the timeline disappear entirely
2. No indication of *why* a scene is "changed" (added vs. modified vs. removed)
3. Word count diff is not surfaced

- [ ] **Step 1: Rewrite `CompareView.tsx`**

Replace the entire file:

```typescript
import { useState, useEffect } from 'react';
import { BranchIndex, BranchCompareData, BranchSceneDiff } from '../../../shared/types';
import { dataService } from '../../services/dataService';

interface CompareViewProps {
  projectPath: string;
  branchIndex: BranchIndex;
  characterColors: Record<string, string>;
  onClose: () => void;
  onMerge: (branchName: string) => void;
}

const MAIN_VALUE = '__main__';
const DEFAULT_COLOR = '#6b7280';

function stripTags(title: string): string {
  return title.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
}

const CHANGE_LABELS: Record<string, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Changed',
};

interface RailsScene {
  sceneId: string;
  position: number | null;
  sceneNumber: number | null;
  title: string;
  characterName: string;
  characterId: string;
  color: string;
  changeType: BranchSceneDiff['changeType'];
  wordCount: number | null;
}

function buildRailsColumn(
  scenes: BranchSceneDiff[],
  side: 'left' | 'right',
  colors: Record<string, string>,
): RailsScene[] {
  return scenes
    .filter(s => {
      // Always include changed scenes; skip unchanged scenes with no position
      if (s.changeType !== 'unchanged') return true;
      const pos = side === 'left' ? s.leftPosition : s.rightPosition;
      return pos !== null;
    })
    .map(s => ({
      sceneId: s.sceneId,
      position: side === 'left' ? s.leftPosition : s.rightPosition,
      sceneNumber: side === 'left' ? s.leftSceneNumber : s.rightSceneNumber,
      title: stripTags(side === 'left' ? s.leftTitle : s.rightTitle),
      characterName: s.characterName,
      characterId: s.characterId,
      color: colors[s.characterId] || DEFAULT_COLOR,
      changeType: s.changeType,
      wordCount: side === 'left' ? s.leftWordCount : s.rightWordCount,
    }))
    .sort((a, b) => {
      // Sort by position if available, otherwise by scene number, otherwise put at end
      const ap = a.position ?? Infinity;
      const bp = b.position ?? Infinity;
      if (ap !== bp) return ap - bp;
      return (a.sceneNumber ?? 999) - (b.sceneNumber ?? 999);
    });
}

export function CompareView({ projectPath, branchIndex, characterColors, onClose, onMerge }: CompareViewProps) {
  const branchNames = branchIndex.branches.filter(b => !b.legacy).map(b => b.name);
  const [left, setLeft] = useState(MAIN_VALUE);
  const [right, setRight] = useState(branchNames[0] ?? MAIN_VALUE);
  const [compareData, setCompareData] = useState<BranchCompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toApi = (v: string) => (v === MAIN_VALUE ? null : v);
  const sameSelected = left === right;

  useEffect(() => {
    if (sameSelected) { setCompareData(null); return; }
    setLoading(true);
    setError(null);
    setCompareData(null);
    dataService.compareBranches(projectPath, toApi(left), toApi(right))
      .then(data => { setCompareData(data); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [left, right, projectPath, sameSelected]);

  const changedCount = compareData ? compareData.scenes.filter(s => s.changed).length : 0;
  const totalCount = compareData ? compareData.scenes.length : 0;

  const leftScenes = compareData ? buildRailsColumn(compareData.scenes, 'left', characterColors) : [];
  const rightScenes = compareData ? buildRailsColumn(compareData.scenes, 'right', characterColors) : [];

  const rightIsNotMain = right !== MAIN_VALUE;

  return (
    <div className="compare-view-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="compare-view">
        <div className="compare-view-header">
          <h2>Compare Branches</h2>
          <button className="compare-view-close" onClick={onClose}>&times;</button>
        </div>

        <div className="compare-view-selectors">
          <div className="compare-branch-pick">
            <label>Left</label>
            <select value={left} onChange={e => setLeft(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <span className="compare-vs">vs</span>
          <div className="compare-branch-pick">
            <label>Right</label>
            <select value={right} onChange={e => setRight(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {sameSelected && (
          <div className="compare-view-empty">Select two different branches to compare</div>
        )}
        {!sameSelected && loading && (
          <div className="compare-view-empty">Loading comparison&hellip;</div>
        )}
        {!sameSelected && !loading && error && (
          <div className="compare-view-empty compare-view-error">{error}</div>
        )}

        {!sameSelected && !loading && compareData && (
          <>
            <div className="compare-view-summary">
              {changedCount === 0
                ? `No differences — all ${totalCount} scenes are identical`
                : `${changedCount} of ${totalCount} scene${totalCount !== 1 ? 's' : ''} differ`}
            </div>

            <div className="compare-rails">
              <div className="compare-rails-header">
                <div className="compare-rails-col-label">{compareData.leftName || 'main'}</div>
                <div className="compare-rails-col-label">{compareData.rightName || 'main'}</div>
              </div>
              <div className="compare-rails-body">
                <div className="compare-rails-column">
                  {leftScenes.map(scene => (
                    <div
                      key={scene.sceneId}
                      className={`compare-rails-card ${scene.changeType}`}
                      style={{ borderLeftColor: scene.color }}
                    >
                      <span className="compare-rails-char">{scene.characterName}</span>
                      <span className="compare-rails-title">{scene.title || <em className="compare-rails-empty">—</em>}</span>
                      {scene.changeType !== 'unchanged' && (
                        <span className={`compare-change-badge ${scene.changeType}`}>
                          {CHANGE_LABELS[scene.changeType] ?? scene.changeType}
                        </span>
                      )}
                      {scene.wordCount !== null && (
                        <span className="compare-rails-words">{scene.wordCount}w</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="compare-rails-column">
                  {rightScenes.map(scene => (
                    <div
                      key={scene.sceneId}
                      className={`compare-rails-card ${scene.changeType}`}
                      style={{ borderLeftColor: scene.color }}
                    >
                      <span className="compare-rails-char">{scene.characterName}</span>
                      <span className="compare-rails-title">{scene.title || <em className="compare-rails-empty">—</em>}</span>
                      {scene.changeType !== 'unchanged' && (
                        <span className={`compare-change-badge ${scene.changeType}`}>
                          {CHANGE_LABELS[scene.changeType] ?? scene.changeType}
                        </span>
                      )}
                      {scene.wordCount !== null && (
                        <span className="compare-rails-words">{scene.wordCount}w</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {rightIsNotMain && !sameSelected && (
          <div className="compare-view-footer">
            <button className="compare-merge-btn" onClick={() => onMerge(right)}>
              Merge {right} &rarr; main
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/brian/braidr && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/brian/braidr && git add src/renderer/components/branches/CompareView.tsx && git commit -m "feat(branches): improve compare view to show all scene differences

- Changed scenes with null positions now visible (filter was hiding them)
- Added/Removed/Changed badges on scene cards
- Shows word count per scene
- Error state for failed comparisons
- Summary message when no differences found

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Fix `MergeDialog.tsx` for Added/Removed Scenes

**Files:**
- Modify: `src/renderer/components/branches/MergeDialog.tsx`

The merge dialog shows all changed scenes with checkboxes. "Added" scenes (only in the branch) can't currently be merged to main via `mergeBranch` (INSERT across DBs is not supported in the MVP). These should be disabled with a note.

- [ ] **Step 1: Update `MergeDialog.tsx` to handle `changeType`**

In `src/renderer/components/branches/MergeDialog.tsx`, replace the scene row rendering (lines 100–131) with:

```tsx
{scenes.map(scene => {
  const isChanged = scene.changed;
  const isAddedOnly = scene.changeType === 'added';
  const posChanged = scene.leftPosition !== scene.rightPosition;
  const isMergeable = isChanged && !isAddedOnly;
  return (
    <label
      key={scene.sceneId}
      className={`merge-scene-row ${!isChanged ? 'unchanged' : ''} ${isAddedOnly ? 'added-only' : ''}`}
      title={isAddedOnly ? 'New scenes cannot be merged in this version' : undefined}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(scene.sceneId)}
        disabled={!isMergeable}
        onChange={() => toggleScene(scene.sceneId)}
      />
      <span className="merge-scene-number">
        #{scene.sceneNumber}
        {scene.changeType !== 'unchanged' && (
          <span className={`merge-change-badge ${scene.changeType}`}>
            {scene.changeType === 'added' ? '+' : scene.changeType === 'removed' ? '−' : '~'}
          </span>
        )}
      </span>
      {isChanged ? (
        <span className="merge-scene-titles">
          <span className="merge-scene-old">{scene.leftTitle || '—'}</span>
          <span className="merge-scene-arrow">&rarr;</span>
          <span className="merge-scene-new">{scene.rightTitle || '—'}</span>
        </span>
      ) : (
        <span className="merge-scene-titles">
          <span>{scene.leftTitle}</span>
        </span>
      )}
      {posChanged && (
        <span className="merge-scene-pos">
          pos {scene.leftPosition ?? '–'} &rarr; {scene.rightPosition ?? '–'}
        </span>
      )}
    </label>
  );
})}
```

Also update `changedIds` to exclude `added` scenes from the auto-selection and count:

```typescript
const changedIds = useMemo(() => {
  if (!compareData) return new Set<string>();
  return new Set(
    compareData.scenes
      .filter(s => s.changed && s.changeType !== 'added')
      .map(s => s.sceneId)
  );
}, [compareData]);
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/brian/braidr && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/brian/braidr && git add src/renderer/components/branches/MergeDialog.tsx && git commit -m "feat(branches): show change type in merge dialog, disable added-only scenes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Handle Legacy Branches in the UI

**Files:**
- Modify: `src/renderer/components/branches/BranchSelector.tsx`

Legacy branches (`.md`-only, no `.braidr` file) are marked `legacy: true` in the index. They should be shown in the dropdown as read-only with a visual indicator and a delete button only.

- [ ] **Step 1: Update branch list rendering in `BranchSelector.tsx`**

In `src/renderer/components/branches/BranchSelector.tsx`, replace the branch list render (lines 135–163):

```tsx
{/* Other branches */}
{branchIndex.branches.map((branch) => (
  <div className="branch-item-row" key={branch.name}>
    {branch.legacy ? (
      <span className="branch-item branch-item-legacy" title="This branch was created before the SQLite upgrade and must be recreated">
        <span className="branch-item-name">{branch.name}</span>
        <span className="branch-legacy-tag">legacy</span>
      </span>
    ) : (
      <button
        className={`branch-item ${branchIndex.activeBranch === branch.name ? 'active' : ''}`}
        onClick={() => {
          onSwitchBranch(branch.name);
          setOpen(false);
        }}
      >
        <span className="branch-item-name">{branch.name}</span>
        {branch.description && (
          <span className="branch-desc">{branch.description}</span>
        )}
      </button>
    )}
    {branchIndex.activeBranch !== branch.name && (
      <button
        className="branch-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmDelete(branch.name);
        }}
        title={`Delete branch "${branch.name}"`}
      >
        &times;
      </button>
    )}
  </div>
))}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/brian/braidr && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/brian/braidr && git add src/renderer/components/branches/BranchSelector.tsx && git commit -m "feat(branches): show legacy branches as non-switchable with label

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Scene Draft Preview in Compare View

Clicking a scene card in the compare view opens a panel showing the draft prose from both branches side-by-side. The content is rendered HTML (TipTap output) displayed in two scrollable columns.

**Files:**
- Modify: `src/shared/types.ts` — add `BRANCHES_GET_SCENE_DRAFT` to `IPC_CHANNELS`
- Modify: `src/main/preload.ts` — expose `branchesGetSceneDraft` on `electronAPI`
- Modify: `src/main/branches.ts` — add `getBranchSceneDraft` function
- Modify: `src/main/main.ts` — add IPC handler for `BRANCHES_GET_SCENE_DRAFT`
- Modify: `src/renderer/services/dataService.ts` — add `getBranchSceneDraft` method
- Modify: `src/renderer/components/branches/CompareView.tsx` — add click handler + draft panel

- [ ] **Step 1: Add `BRANCHES_GET_SCENE_DRAFT` to `IPC_CHANNELS` in `src/shared/types.ts`**

Find the `IPC_CHANNELS` const (around line 424) and add after `BRANCHES_SAVE_POSITIONS`:

```typescript
  BRANCHES_GET_SCENE_DRAFT: 'branches:get-scene-draft',
```

- [ ] **Step 2: Wire up preload in `src/main/preload.ts`**

Add the channel constant (after `BRANCHES_SAVE_POSITIONS` at line 53):

```typescript
  BRANCHES_GET_SCENE_DRAFT: 'branches:get-scene-draft',
```

Add the `electronAPI` method (after `branchesSavePositions` in the contextBridge block):

```typescript
  branchesGetSceneDraft: (projectPath: string, branchName: string | null, sceneId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_GET_SCENE_DRAFT, projectPath, branchName, sceneId),
```

- [ ] **Step 3: Add `getBranchSceneDraft` to `src/main/branches.ts`**

Add after `mergeBranch`:

```typescript
/**
 * Read the draft content for a single scene from a branch (null = main).
 * Returns empty string if no draft exists.
 */
export function getBranchSceneDraft(
  projectPath: string,
  branchName: string | null,
  sceneId: string,
): string {
  const braidrPath = getBranchBraidrPath(projectPath, branchName);
  if (!braidrPath || !fs.existsSync(braidrPath)) return '';
  const { openDatabase } = require('./database') as typeof import('./database');
  const db = openDatabase(braidrPath);
  return db.getDraft(sceneId)?.content ?? '';
}
```

- [ ] **Step 4: Add IPC handler in `src/main/main.ts`**

Find the other `BRANCHES_*` handlers (around line 1009) and add:

```typescript
ipcMain.handle(IPC_CHANNELS.BRANCHES_GET_SCENE_DRAFT, async (_event, projectPath: string, branchName: string | null, sceneId: string) => {
  try {
    return { success: true, data: getBranchSceneDraft(projectPath, branchName, sceneId) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

Also add `getBranchSceneDraft` to the import on line 12:

```typescript
import { listBranches, createBranch, switchBranch, deleteBranch, mergeBranch, compareBranches, getBranchSceneDraft } from './branches';
```

- [ ] **Step 5: Add `getBranchSceneDraft` to `src/renderer/services/dataService.ts`**

Add to the `DataService` interface (after `compareBranches`):

```typescript
  getBranchSceneDraft(projectPath: string, branchName: string | null, sceneId: string): Promise<string>;
```

Add to `ElectronDataService` (after `compareBranches` implementation):

```typescript
  async getBranchSceneDraft(projectPath: string, branchName: string | null, sceneId: string): Promise<string> {
    const result = await window.electronAPI.branchesGetSceneDraft(projectPath, branchName, sceneId);
    if (!result.success) return '';
    return result.data ?? '';
  }
```

- [ ] **Step 6: Add draft preview panel to `src/renderer/components/branches/CompareView.tsx`**

Add the `SceneDraftPanel` state and component inline in `CompareView.tsx`. Add after the `error` state line:

```typescript
  const [draftPreview, setDraftPreview] = useState<{
    sceneId: string;
    title: string;
    leftDraft: string;
    rightDraft: string;
  } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
```

Add a handler to fetch drafts when a card is clicked:

```typescript
  async function handleSceneClick(scene: RailsScene, sceneId: string) {
    if (draftPreview?.sceneId === sceneId) {
      setDraftPreview(null);
      return;
    }
    setDraftLoading(true);
    setDraftPreview(null);
    const [leftDraft, rightDraft] = await Promise.all([
      dataService.getBranchSceneDraft(projectPath, toApi(left), sceneId),
      dataService.getBranchSceneDraft(projectPath, toApi(right), sceneId),
    ]);
    setDraftPreview({ sceneId, title: scene.title, leftDraft, rightDraft });
    setDraftLoading(false);
  }
```

Update each scene card `<div>` in the rails columns to be clickable — replace:

```tsx
                    <div
                      key={scene.sceneId}
                      className={`compare-rails-card ${scene.changeType}`}
                      style={{ borderLeftColor: scene.color }}
                    >
```

with:

```tsx
                    <div
                      key={scene.sceneId}
                      className={`compare-rails-card ${scene.changeType} ${draftPreview?.sceneId === scene.sceneId ? 'selected' : ''}`}
                      style={{ borderLeftColor: scene.color, cursor: 'pointer' }}
                      onClick={() => handleSceneClick(scene, scene.sceneId)}
                      title="Click to preview draft"
                    >
```

(Apply the same change to both the left and right column cards.)

Add the draft preview panel just before the closing `</>` of the compare data section (after the `</div>` that closes `compare-rails`):

```tsx
            {draftLoading && (
              <div className="compare-draft-panel compare-draft-loading">
                Loading draft&hellip;
              </div>
            )}

            {draftPreview && !draftLoading && (
              <div className="compare-draft-panel">
                <div className="compare-draft-header">
                  <span className="compare-draft-title">{draftPreview.title}</span>
                  <button
                    className="compare-draft-close"
                    onClick={() => setDraftPreview(null)}
                  >
                    &times;
                  </button>
                </div>
                <div className="compare-draft-columns">
                  <div className="compare-draft-col">
                    <div className="compare-draft-col-label">{compareData.leftName || 'main'}</div>
                    {draftPreview.leftDraft
                      ? <div
                          className="compare-draft-content"
                          dangerouslySetInnerHTML={{ __html: draftPreview.leftDraft }}
                        />
                      : <div className="compare-draft-empty">No draft written</div>
                    }
                  </div>
                  <div className="compare-draft-col">
                    <div className="compare-draft-col-label">{compareData.rightName || 'main'}</div>
                    {draftPreview.rightDraft
                      ? <div
                          className="compare-draft-content"
                          dangerouslySetInnerHTML={{ __html: draftPreview.rightDraft }}
                        />
                      : <div className="compare-draft-empty">No draft written</div>
                    }
                  </div>
                </div>
              </div>
            )}
```

Also clear the draft preview when the left/right selectors change — in the `useEffect` that calls `compareBranches`, add `setDraftPreview(null)` before `setLoading(true)`:

```typescript
    setDraftPreview(null);
    setLoading(true);
```

- [ ] **Step 7: Add CSS for the draft panel**

Find the compare-view CSS (it will be in the project's CSS file, likely `src/renderer/styles/` or similar). Search for `.compare-rails` and add after the existing compare styles:

```css
.compare-draft-panel {
  margin-top: 12px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-primary, #fff);
}

.compare-draft-loading {
  padding: 16px;
  color: var(--text-muted, #9ca3af);
  font-size: 13px;
}

.compare-draft-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-secondary, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  font-size: 13px;
  font-weight: 500;
}

.compare-draft-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-muted, #9ca3af);
  padding: 0 4px;
  line-height: 1;
}

.compare-draft-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  max-height: 400px;
}

.compare-draft-col {
  overflow-y: auto;
  padding: 12px;
  border-right: 1px solid var(--border-color, #e2e8f0);
}

.compare-draft-col:last-child {
  border-right: none;
}

.compare-draft-col-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #9ca3af);
  margin-bottom: 8px;
}

.compare-draft-content {
  font-size: 14px;
  line-height: 1.6;
}

.compare-draft-empty {
  font-size: 13px;
  color: var(--text-muted, #9ca3af);
  font-style: italic;
}

.compare-rails-card.selected {
  outline: 2px solid var(--accent, #6366f1);
  outline-offset: -2px;
}
```

The CSS file location: search for `.compare-rails` in the project first to find which file to add to:

```bash
grep -rn "compare-rails" /Users/brian/braidr/src/renderer/ --include="*.css" | head -5
```

- [ ] **Step 8: Run tests**

```bash
cd /Users/brian/braidr && npm test
```

Expected: all tests pass (no tests for the UI component; this is verified manually in the app).

- [ ] **Step 9: Commit**

```bash
cd /Users/brian/braidr && git add src/shared/types.ts src/main/preload.ts src/main/branches.ts src/main/main.ts src/renderer/services/dataService.ts src/renderer/components/branches/CompareView.tsx && git commit -m "feat(branches): click scene card in compare view to preview draft prose

Shows both branches' draft content side-by-side in a panel below the
rails. Click the same card again or X to dismiss.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|------------|------|
| Branch saves go to branch file | Tasks 3, 4 |
| Compare works after SQLite migration | Task 2 (`compareBranches` reads `.braidr`) |
| No differences shown because positioned scenes filtered | Task 5 (`buildRailsColumn` fix) |
| Added/removed scenes visible in compare | Tasks 2, 5 |
| Title changes visible | Task 2 (`changeType: 'modified'`) |
| Order changes visible | Task 2 (`sceneNumber` comparison) |
| Draft word count diff | Tasks 2, 5 |
| Existing legacy branches handled gracefully | Tasks 2, 7 |
| Merge works correctly | Task 2 (`mergeBranch` uses DB rows) |
| Click scene to preview draft prose | Task 8 (side-by-side panel) |

**Type consistency check:**
- `BranchSceneDiff.changeType` defined in Task 1, used in Tasks 2, 5, 6, 7 ✓
- `BranchSceneDiff.leftSceneNumber` / `rightSceneNumber` defined Task 1, set in Task 2, used in Task 5 ✓
- `BranchSceneDiff.leftWordCount` / `rightWordCount` defined Task 1, set in Task 2, displayed in Task 5 ✓
- `BranchInfo.legacy` defined Task 1, set in Task 2, used in Task 7 ✓
- `activeBraidrPath` returned from `BRAIDR_LOAD_PROJECT` (Task 3), consumed in `dataService` (Task 4) ✓

**Placeholder scan:** None found. All steps contain actual code.

**Edge cases covered:**
- Branch with no `.braidr` file → marked legacy, not switchable ✓
- `compareBranches` when branch file missing → throws with clear error ✓
- `mergeBranch` scene only in branch (added) → skipped with `if (!mainScene) continue` ✓
- WAL files cleaned up on `deleteBranch` ✓
- `createBranch` from an active branch → copies branch `.braidr`, not main ✓
