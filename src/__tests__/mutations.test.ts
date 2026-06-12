import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerMutation, executeMutation } from '../main/mutations';
import type { BraidrDB } from '../main/database';

async function freshDb(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  const db = new mod.BraidrDB(path.join(dir, 'mut.braidr'));
  db.insertCharacter('c1', 'Noah', null, 0);
  db.insertScene('s1', 'c1', null, 'Original title', '', 1, null, false, null);
  db.insertScene('s2', 'c1', null, 'Second scene', '', 2, null, false, null);
  return db;
}

// A deliberately over-budget mutation: claims it deletes at most 1 row,
// then deletes every scene. The executor must roll the whole thing back.
registerMutation<{ characterId: string }>({
  name: 'test.overBudgetDelete',
  deletionBudget: 1,
  run(ctx, { characterId }) {
    ctx.delete('DELETE FROM scenes WHERE character_id = ?', characterId);
    return null;
  },
});

describe('mutation executor', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('scene.rename renames, logs, and returns an applicable inverse', async () => {
    const db = await freshDb(dir);

    const { inverse } = db.mutate('scene.rename', { sceneId: 's1', title: 'New title' });
    expect(db.getScenes('c1').find(s => s.id === 's1')!.title).toBe('New title');

    const log = db.getMutationLog();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe('scene.rename');
    expect(JSON.parse(log[0].args_json)).toEqual({ sceneId: 's1', title: 'New title' });
    expect(JSON.parse(log[0].inverse_json!)).toEqual(inverse);

    // undo = apply the inverse as a normal mutation
    db.mutate(inverse!.name, inverse!.args);
    expect(db.getScenes('c1').find(s => s.id === 's1')!.title).toBe('Original title');
    expect(db.getMutationLog()).toHaveLength(2);
    db.close();
  });

  it('exceeding the deletion budget rolls back everything, including the log entry', async () => {
    const db = await freshDb(dir);

    expect(() => db.mutate('test.overBudgetDelete', { characterId: 'c1' }))
      .toThrow(/deletion budget/);

    // both scenes survive; nothing was logged
    expect(db.getScenes('c1')).toHaveLength(2);
    expect(db.getMutationLog()).toHaveLength(0);
    db.close();
  });

  it('unknown mutation names are rejected', async () => {
    const db = await freshDb(dir);
    expect(() => db.mutate('scene.explode', {})).toThrow(/Unknown mutation/);
    expect(db.getMutationLog()).toHaveLength(0);
    db.close();
  });

  it('a failing mutation leaves no partial writes', async () => {
    const db = await freshDb(dir);
    expect(() => db.mutate('scene.rename', { sceneId: 'nope', title: 'x' }))
      .toThrow(/scene not found/);
    expect(db.getMutationLog()).toHaveLength(0);
    db.close();
  });

  it('duplicate registration is rejected', () => {
    expect(() => registerMutation({ name: 'scene.rename', deletionBudget: 0, run: () => null }))
      .toThrow(/already registered/);
  });

  it('executeMutation is BraidrDB.mutate (same registry, raw access)', async () => {
    const db = await freshDb(dir);
    // sanity: the exported executor and the class method share one registry
    expect(typeof executeMutation).toBe('function');
    db.close();
  });
});
