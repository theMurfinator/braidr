/**
 * Phase 4e behavior-pinning tests for character.setColor and scene.setDate mutations.
 *
 * The original task-preservation tests in this file are now obsolete: the bulk-replace
 * tasks/taskFieldDefs code was removed from applySaveTimeline in Phase 4e. Tasks are
 * managed exclusively via task.create / task.setFields / task.softDelete mutations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  const db = new mod.BraidrDB(path.join(dir, 'test.braidr'));
  const now = Date.now();
  db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
  db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c2', 'Grace', 1, now);
  db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, timeline_position, word_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('s1', 'c1', 1, 0, 'Opening', 1, 100, now, now);
  return { db, mod };
}

describe('character.setColor mutation', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-color-')); });
  afterEach(async () => { (await import('../main/database')).closeAllDatabases(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('sets a character color and returns an inverse that restores the old value', async () => {
    const { db } = await freshDb(tmp);
    const { inverse } = db.mutate('character.setColor', { characterId: 'c1', color: '#ff0000' });
    const row = db.prepare('SELECT color FROM characters WHERE id = ?').get('c1') as { color: string };
    expect(row.color).toBe('#ff0000');
    expect(inverse).toMatchObject({ name: 'character.setColor', args: { characterId: 'c1', color: '' } });
    db.mutate(inverse!.name, inverse!.args);
    const restored = db.prepare('SELECT color FROM characters WHERE id = ?').get('c1') as { color: string | null };
    expect(restored.color ?? '').toBe('');
    db.close();
  });

  it('throws for an unknown characterId', async () => {
    const { db } = await freshDb(tmp);
    expect(() => db.mutate('character.setColor', { characterId: 'nope', color: '#fff' })).toThrow(/character not found/);
    db.close();
  });

  it('logs the mutation', async () => {
    const { db } = await freshDb(tmp);
    db.mutate('character.setColor', { characterId: 'c1', color: '#123456' });
    const log = db.getMutationLog();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe('character.setColor');
    db.close();
  });
});

describe('scene.setDate mutation', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-date-')); });
  afterEach(async () => { (await import('../main/database')).closeAllDatabases(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('upserts a date and returns an inverse that removes it', async () => {
    const { db } = await freshDb(tmp);
    const { inverse } = db.mutate('scene.setDate', { sceneId: 's1', startDate: '2024-01-15', endDate: null });
    const row = db.prepare('SELECT date, end_date FROM scene_dates WHERE scene_id = ?').get('s1') as { date: string; end_date: string | null } | undefined;
    expect(row?.date).toBe('2024-01-15');
    expect(row?.end_date).toBeNull();
    expect(inverse).toMatchObject({ name: 'scene.setDate', args: { sceneId: 's1', startDate: null, endDate: null } });
    db.mutate(inverse!.name, inverse!.args);
    const gone = db.prepare('SELECT date FROM scene_dates WHERE scene_id = ?').get('s1');
    expect(gone).toBeUndefined();
    db.close();
  });

  it('updates an existing date, preserving undo of old value', async () => {
    const { db } = await freshDb(tmp);
    db.mutate('scene.setDate', { sceneId: 's1', startDate: '2024-01-01', endDate: null });
    const { inverse } = db.mutate('scene.setDate', { sceneId: 's1', startDate: '2024-06-30', endDate: '2024-07-01' });
    expect(inverse).toMatchObject({ name: 'scene.setDate', args: { sceneId: 's1', startDate: '2024-01-01', endDate: null } });
    db.close();
  });

  it('removing a date (startDate null) deletes the row', async () => {
    const { db } = await freshDb(tmp);
    db.mutate('scene.setDate', { sceneId: 's1', startDate: '2024-03-10', endDate: null });
    db.mutate('scene.setDate', { sceneId: 's1', startDate: null, endDate: null });
    const row = db.prepare('SELECT 1 FROM scene_dates WHERE scene_id = ?').get('s1');
    expect(row).toBeUndefined();
    db.close();
  });

  it('removing a non-existent date is a no-op (no throw, inverse is also null/null)', async () => {
    const { db } = await freshDb(tmp);
    const { inverse } = db.mutate('scene.setDate', { sceneId: 's1', startDate: null, endDate: null });
    expect(inverse).toMatchObject({ name: 'scene.setDate', args: { sceneId: 's1', startDate: null, endDate: null } });
    db.close();
  });
});
