/**
 * Tests for draft branch operations — SQLite-based implementation.
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
  getBranchSceneDraft,
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

  it('returns empty index when no branches exist', async () => {
    await setupProject(tmp);
    const idx = listBranches(tmp);
    expect(idx.branches).toEqual([]);
    expect(idx.activeBranch).toBeNull();
  });

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
    expect(scenes.find((s: any) => s.id === 'noah-1')?.title).toBe('Noah wakes up');
  });

  it('creates a branch from another branch when one is active', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const draft1Db = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    draft1Db.updateScene('noah-1', { title: 'Noah wakes up in a sweat' });

    const idx = await createBranch(tmp, 'draft-2');
    expect(idx.branches[1].createdFrom).toBe('draft-1');

    const draft2Db = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-2.braidr'));
    const noah1 = draft2Db.getScene('noah-1') as any;
    expect(noah1?.title).toBe('Noah wakes up in a sweat');
  });

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
    const idx = deleteBranch(tmp, 'draft-1');
    expect(idx.activeBranch).toBeNull();
  });

  it('detects title change between main and branch', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.updateScene('noah-1', { title: 'Noah wakes up screaming' });

    const diff = await compareBranches(tmp, null, 'draft-1');
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

    const diff = await compareBranches(tmp, null, 'draft-1');
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

    const diff = await compareBranches(tmp, null, 'draft-1');
    const noah3 = diff.scenes.find(s => s.sceneId === 'noah-3');
    expect(noah3?.changeType).toBe('added');
    expect(noah3?.changed).toBe(true);
    expect(noah3?.leftTitle).toBe('');
    expect(noah3?.rightTitle).toBe('New scene');
  });

  it('marks unchanged scenes correctly', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const diff = await compareBranches(tmp, null, 'draft-1');
    const noah2 = diff.scenes.find(s => s.sceneId === 'noah-2');
    expect(noah2?.changeType).toBe('unchanged');
    expect(noah2?.changed).toBe(false);
  });

  it('selectively copies scene changes from branch to main', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.updateScene('noah-1', { title: 'Noah wakes up in a cold sweat', timelinePosition: 10 });
    branchDb.updateScene('sally-1', { timelinePosition: 20 });

    await mergeBranch(tmp, 'draft-1', ['noah-1']);

    const mainDb = new mod.BraidrDB(path.join(tmp, 'test-project.braidr'));
    const noah1 = mainDb.getScene('noah-1') as any;
    expect(noah1?.title).toBe('Noah wakes up in a cold sweat');
    expect(noah1?.timeline_position).toBe(10);

    const sally1 = mainDb.getScene('sally-1') as any;
    expect(sally1?.timeline_position).toBe(2);
  });

  it('merges draft content from branch to main', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.upsertDraft('noah-1', '<p>Branch draft content</p>');

    await mergeBranch(tmp, 'draft-1', ['noah-1']);

    const mainDb = new mod.BraidrDB(path.join(tmp, 'test-project.braidr'));
    const draft = mainDb.getDraft('noah-1');
    expect(draft?.content).toBe('<p>Branch draft content</p>');
  });

  it('marks branches with no .braidr file as legacy', async () => {
    await setupProject(tmp);
    const legacyDir = path.join(tmp, 'branches', 'old-branch');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'Noah.md'), '---\ncharacter: Noah\n---\n1. Noah walks <!-- sid:abc -->\n');
    const indexFile = path.join(tmp, 'branches', 'index.json');
    fs.writeFileSync(indexFile, JSON.stringify({
      branches: [{ name: 'old-branch', createdAt: new Date().toISOString(), createdFrom: 'main' }],
      activeBranch: null,
    }));

    const idx = listBranches(tmp);
    expect(idx.branches).toHaveLength(1);
    expect(idx.branches[0].legacy).toBe(true);
  });

  it('getBranchSceneDraft returns empty string when no draft', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const content = await getBranchSceneDraft(tmp, 'draft-1', 'noah-1');
    expect(content).toBe('');
  });

  it('getBranchSceneDraft returns draft content after upsert', async () => {
    await setupProject(tmp);
    await createBranch(tmp, 'draft-1');

    const mod = await import('../main/database');
    const branchDb = new mod.BraidrDB(path.join(tmp, 'branches', 'draft-1.braidr'));
    branchDb.upsertDraft('noah-1', '<p>Hello world</p>');

    const content = await getBranchSceneDraft(tmp, 'draft-1', 'noah-1');
    expect(content).toBe('<p>Hello world</p>');
  });
});
