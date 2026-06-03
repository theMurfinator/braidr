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
