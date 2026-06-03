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
});
