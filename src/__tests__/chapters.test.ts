import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let dbPath: string;
let BraidrDB: any;

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `chapters-test-${Date.now()}.braidr`);
  const mod = await import('../main/database');
  BraidrDB = mod.BraidrDB;
});

afterEach(() => {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('chapters CRUD', () => {
  it('creates and retrieves chapters', () => {
    const db = new BraidrDB(dbPath);
    db.saveChapter({ id: 'ch1', title: 'Chapter 1', order: 0 });
    db.saveChapter({ id: 'ch2', title: 'Chapter 2', order: 1, description: 'The twist' });
    const chapters = db.getChapters();
    expect(chapters).toHaveLength(2);
    expect(chapters[0].id).toBe('ch1');
    expect(chapters[1].description).toBe('The twist');
  });

  it('upserts chapter on save', () => {
    const db = new BraidrDB(dbPath);
    db.saveChapter({ id: 'ch1', title: 'Old title', order: 0 });
    db.saveChapter({ id: 'ch1', title: 'New title', order: 0 });
    const chapters = db.getChapters();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('New title');
  });

  it('deletes chapter and nullifies scene chapter_id', () => {
    const db = new BraidrDB(dbPath);
    const now = Date.now();
    db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?, ?, ?, ?)').run('char1', 'Noah', 0, now);
    db.prepare('INSERT INTO scenes (id, character_id, scene_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('scene1', 'char1', 1, now, now);
    db.saveChapter({ id: 'ch1', title: 'Chapter 1', order: 0 });
    db.updateScene('scene1', { chapterId: 'ch1', sceneOrder: 0 });
    db.deleteChapter('ch1');
    const row = db.prepare('SELECT chapter_id FROM scenes WHERE id = ?').get('scene1') as any;
    expect(row.chapter_id).toBeNull();
  });

  it('reorders chapters', () => {
    const db = new BraidrDB(dbPath);
    db.saveChapter({ id: 'ch1', title: 'First', order: 0 });
    db.saveChapter({ id: 'ch2', title: 'Second', order: 1 });
    db.reorderChapters(['ch2', 'ch1']);
    const chapters = db.getChapters();
    expect(chapters[0].id).toBe('ch2');
    expect(chapters[1].id).toBe('ch1');
  });

  it('migrate adds chapter_id and scene_order columns to existing db', () => {
    const db = new BraidrDB(dbPath);
    const cols = (db.prepare('PRAGMA table_info(scenes)').all() as { name: string }[]).map(c => c.name);
    expect(cols).toContain('chapter_id');
    expect(cols).toContain('scene_order');
  });
});
