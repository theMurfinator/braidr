// src/__tests__/scene-outline-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'outline.braidr'));
}

function seedScene(db: any, sceneId: string, sceneNumber = 1) {
  db.insertCharacter('c1', 'Anna', '#ff0000', 0);
  db.insertScene(sceneId, 'c1', null, 'Anna finds the letter', 'She reads it twice', sceneNumber, sceneNumber, false, 0);
}

describe('scene outlines', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('returns undefined for a scene with no outline yet (a hole)', async () => {
    const db = await freshDb(dir);
    seedScene(db, 's1');
    expect(db.getOutline('s1')).toBeUndefined();
  });

  it('upserts and reads back outline content', async () => {
    const db = await freshDb(dir);
    seedScene(db, 's1');

    db.upsertOutline('s1', 'She comes home late, still angry. The letter is on the counter.');
    expect(db.getOutline('s1')!.content).toBe('She comes home late, still angry. The letter is on the counter.');

    db.upsertOutline('s1', 'Revised: she reads it, then calls her sister.');
    expect(db.getOutline('s1')!.content).toBe('Revised: she reads it, then calls her sister.');
  });

  it('bulk getAllOutlines returns only scenes that have outline text, keyed by scene id', async () => {
    const db = await freshDb(dir);
    db.insertCharacter('c1', 'Anna', '#ff0000', 0);
    db.insertScene('s1', 'c1', null, 'One', '', 1, 1, false, 0);
    db.insertScene('s2', 'c1', null, 'Two', '', 2, 2, false, 0);
    db.upsertOutline('s1', 'first beat');

    const all = db.getAllOutlines();
    expect(all).toEqual({ s1: 'first beat' });
  });

  it('cascades: deleting a scene removes its outline', async () => {
    const db = await freshDb(dir);
    seedScene(db, 's1');
    db.upsertOutline('s1', 'some beat');

    db.deleteScene('s1');
    expect(db.getOutline('s1')).toBeUndefined();
    expect(db.getAllOutlines()).toEqual({});
  });
});
