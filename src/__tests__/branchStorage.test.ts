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

describe('serialize/restore branched tables', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-sr-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('round-trips branched data and preserves shared rows across a restore', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(tmp, 'p.braidr'));
    const now = Date.now();
    db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run('s1', 'c1', 1, 0, 'Original', now, now);
    db.prepare('INSERT INTO writing_sessions (id, scene_id, character_id, date, duration, word_count_delta, created_at) VALUES (?,?,?,?,?,?,?)').run('ws1', 's1', 'c1', '2026-06-01', 600, 250, now);
    db.prepare('INSERT INTO tasks (id, title, created_at, updated_at) VALUES (?,?,?,?)').run('t1', 'Revise', now, now);
    db.prepare('INSERT INTO task_character_links (task_id, character_id) VALUES (?,?)').run('t1', 'c1');

    const snapshot = db.serializeBranchedTables();

    db.prepare('UPDATE scenes SET title = ? WHERE id = ?').run('Changed', 's1');
    db.prepare("INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES ('s2','c1',2,1,'Extra',?,?)").run(now, now);

    db.restoreBranchedTables(snapshot);

    const scenes = db.prepare('SELECT * FROM scenes ORDER BY id').all() as any[];
    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe('Original');
    expect((db.prepare('SELECT COUNT(*) n FROM writing_sessions').get() as any).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM task_character_links').get() as any).n).toBe(1);
    db.close();
  });

  it('round-trips chapters and per-scene chapter assignments (Launch/plans/chapters-first-class.md Phase 2 verification)', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(tmp, 'chapters.braidr'));
    const now = Date.now();
    db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    db.saveChapter({ id: 'ch1', title: 'Chapter One', order: 0, description: 'The opening' });
    db.saveChapter({ id: 'ch2', title: 'Chapter Two', order: 1 });
    db.prepare(
      'INSERT INTO scenes (id, character_id, scene_number, scene_order, chapter_id, timeline_position, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('s1', 'c1', 1, 0, 'ch1', 1, 'Opening', now, now);
    db.prepare(
      'INSERT INTO scenes (id, character_id, scene_number, scene_order, chapter_id, timeline_position, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('s2', 'c1', 2, 0, 'ch2', 2, 'Turn', now, now);

    const snapshot = db.serializeBranchedTables();

    // Mutate after the snapshot: reassign s1 to ch2, delete ch1 entirely,
    // add a third chapter — none of this should survive the restore.
    db.prepare('UPDATE scenes SET chapter_id = ? WHERE id = ?').run('ch2', 's1');
    db.deleteChapter('ch1');
    db.saveChapter({ id: 'ch3', title: 'Chapter Three', order: 2 });

    db.restoreBranchedTables(snapshot);

    const chapters = db.getChapters();
    expect(chapters.map(c => c.id)).toEqual(['ch1', 'ch2']);
    expect(chapters[0].description).toBe('The opening');

    const sceneRows = db.prepare('SELECT id, chapter_id FROM scenes ORDER BY id').all() as { id: string; chapter_id: string | null }[];
    expect(sceneRows).toEqual([
      { id: 's1', chapter_id: 'ch1' },
      { id: 's2', chapter_id: 'ch2' },
    ]);
    db.close();
  });
});

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
