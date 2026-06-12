import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB } from '../main/database';

async function open(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'move.braidr'));
}

/**
 * Noah: section A [s1, s2], section B [s3, s4], bullpen [s5].
 * scene_number is the per-character 1..N sequence (s1=1 … s5=5).
 */
async function seed(dir: string): Promise<BraidrDB> {
  const db = await open(dir);
  db.insertCharacter('noah', 'Noah', null, 0);
  db.insertCharacter('grace', 'Grace', null, 1);
  db.insertPlotPoint('A', 'noah', 'Section A', null, null, 0);
  db.insertPlotPoint('B', 'noah', 'Section B', null, null, 1);
  db.insertPlotPoint('G', 'grace', 'Grace section', null, null, 0);
  db.insertScene('s1', 'noah', 'A', 'one', '', 1, 10, false, null);
  db.insertScene('s2', 'noah', 'A', 'two', '', 2, 20, false, null);
  db.insertScene('s3', 'noah', 'B', 'three', '', 3, 30, false, null);
  db.insertScene('s4', 'noah', 'B', 'four', '', 4, 40, false, null);
  db.insertScene('s5', 'noah', null, 'bullpen idea', '', 5, null, false, null);
  return db;
}

interface Row { id: string; plot_point_id: string | null; scene_number: number; timeline_position: number | null; parent_node_id: string | null; outline_key: string | null }

function outline(db: BraidrDB): Row[] {
  return (db.getScenes('noah') as unknown as Row[])
    .map(({ id, plot_point_id, scene_number, timeline_position, parent_node_id, outline_key }) =>
      ({ id, plot_point_id, scene_number, timeline_position, parent_node_id, outline_key }));
}

function order(db: BraidrDB): string[] {
  return outline(db).sort((a, b) => a.scene_number - b.scene_number).map(r => r.id);
}

describe('scene.move', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('reorders within a section and keeps numbering dense', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'A', afterSceneId: 's2' });
    expect(order(db)).toEqual(['s2', 's1', 's3', 's4', 's5']);
    expect(outline(db).map(r => r.scene_number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    db.close();
  });

  it('moves across sections, updating section membership and substrate', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'B', afterSceneId: 's3' });
    const s1 = outline(db).find(r => r.id === 's1')!;
    expect(s1.plot_point_id).toBe('B');
    expect(s1.parent_node_id).toBe('pp:B');
    expect(order(db)).toEqual(['s2', 's3', 's1', 's4', 's5']);
    db.close();
  });

  it('afterSceneId null drops the scene at the head of the target section', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's4', toPlotPointId: 'A', afterSceneId: null });
    expect(order(db)).toEqual(['s4', 's1', 's2', 's3', 's5']);
    expect(outline(db).find(r => r.id === 's4')!.plot_point_id).toBe('A');
    db.close();
  });

  it('moving to the bullpen clears the braid position in the same write', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's2', toPlotPointId: null, afterSceneId: null });
    const s2 = outline(db).find(r => r.id === 's2')!;
    expect(s2.plot_point_id).toBeNull();
    expect(s2.timeline_position).toBeNull();
    expect(s2.parent_node_id).toBe('novel:noah');
    db.close();
  });

  it('the inverse restores position AND braid position after a bullpen round-trip', async () => {
    const db = await seed(dir);
    const before = outline(db);
    const { inverse } = db.mutate('scene.move', { sceneId: 's2', toPlotPointId: null, afterSceneId: null });
    db.mutate(inverse!.name, inverse!.args);
    const after = outline(db);
    expect(after.find(r => r.id === 's2')!.timeline_position).toBe(20);
    expect(order(db)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(after.map(r => ({ id: r.id, pp: r.plot_point_id, n: r.scene_number })))
      .toEqual(before.map(r => ({ id: r.id, pp: r.plot_point_id, n: r.scene_number })));
    db.close();
  });

  it('fractional keys order siblings identically to scene_number after moves', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'B', afterSceneId: 's3' });
    db.mutate('scene.move', { sceneId: 's4', toPlotPointId: 'B', afterSceneId: null });
    const inB = outline(db).filter(r => r.plot_point_id === 'B');
    const byNumber = [...inB].sort((a, b) => a.scene_number - b.scene_number).map(r => r.id);
    const byKey = [...inB].sort((a, b) => (a.outline_key! < b.outline_key! ? -1 : 1)).map(r => r.id);
    expect(byKey).toEqual(byNumber);
    db.close();
  });

  it('the substrate refresh on reopen reproduces the mutated order', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'B', afterSceneId: 's4' });
    const before = order(db);
    db.close();
    const re = await open(dir);
    expect(order(re)).toEqual(before);
    const s1 = outline(re).find(r => r.id === 's1')!;
    expect(s1.parent_node_id).toBe('pp:B');
    re.close();
  });

  it('moving into an empty section lands at the global head (renderer parity)', async () => {
    const db = await seed(dir);
    db.insertPlotPoint('C', 'noah', 'Empty section', null, null, 2);
    db.mutate('scene.move', { sceneId: 's3', toPlotPointId: 'C', afterSceneId: null });
    const s3 = outline(db).find(r => r.id === 's3')!;
    expect(s3.plot_point_id).toBe('C');
    expect(s3.scene_number).toBe(1);
    expect(order(db)).toEqual(['s3', 's1', 's2', 's4', 's5']);
    db.close();
  });

  it('rejects cross-character moves and unknown targets', async () => {
    const db = await seed(dir);
    expect(() => db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'G', afterSceneId: null }))
      .toThrow(/another character/);
    expect(() => db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'nope', afterSceneId: null }))
      .toThrow(/section not found/);
    expect(() => db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'B', afterSceneId: 's2' }))
      .toThrow(/not in the target section/);
    // nothing changed
    expect(order(db)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    db.close();
  });
});
