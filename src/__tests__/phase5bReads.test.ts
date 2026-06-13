import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB } from '../main/database';

const FILE = 'p5b.braidr';

async function open(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, FILE));
}

/**
 * Noah, 2 acts, sections contiguous within each act, plus one act-less section
 * at the end — the shape real projects actually have. Insert legacy data, then
 * close+reopen so the second open runs the full substrate seed with data
 * present (Phase 5a seeds an empty tree on the very first open).
 *
 *   a1: p1(0) p2(1)
 *   a2: p3(2) p4(3)
 *   (root): p5(4)
 */
async function seed(dir: string): Promise<BraidrDB> {
  const s = await open(dir);
  s.insertCharacter('noah', 'Noah', null, 0);
  s.upsertAct({ id: 'a1', character_id: 'noah', name: 'Act One', synopsis: '', starting_state: '', ending_state: '', polarity: '', transformation: '', dilemma: '', propelling_action: '', display_order: 0, created_at: 1 });
  s.upsertAct({ id: 'a2', character_id: 'noah', name: 'Act Two', synopsis: '', starting_state: '', ending_state: '', polarity: '', transformation: '', dilemma: '', propelling_action: '', display_order: 1, created_at: 2 });
  s.insertPlotPoint('p1', 'noah', 'P1', null, null, 0, 'a1');
  s.insertPlotPoint('p2', 'noah', 'P2', null, null, 1, 'a1');
  s.insertPlotPoint('p3', 'noah', 'P3', null, null, 2, 'a2');
  s.insertPlotPoint('p4', 'noah', 'P4', null, null, 3, 'a2');
  s.insertPlotPoint('p5', 'noah', 'P5', null, null, 4, null);
  s.close();
  return open(dir);
}

const flat = (db: BraidrDB): string[] => db.getPlotPointsOrdered('noah').map(p => p.id);
const actOf = (db: BraidrDB, id: string): string | null =>
  (db.getPlotPoints('noah').find(p => p.id === id) as unknown as { act_id: string | null }).act_id;

describe('Phase 5b — substrate is the read authority', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p5b-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('seeds root-level siblings (acts + act-less section) with a total order — no collisions', async () => {
    const db = await seed(dir);
    const rootChildren = db.getStructureNodes('noah').filter(n => n.parent_id === 'novel:noah');
    const keys = rootChildren.map(n => n.order_key);
    expect(new Set(keys).size).toBe(keys.length); // every sibling key is distinct
    // act nodes + the act-less section all live under the root
    expect(rootChildren.map(n => n.id).sort()).toEqual(['act:a1', 'act:a2', 'pp:p5']);
    db.close();
  });

  it('derived flat order reproduces the legacy display_order on contiguous data', async () => {
    const db = await seed(dir);
    expect(flat(db)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    // display_order is stamped from the tree walk: dense 0..N
    expect(db.getPlotPointsOrdered('noah').map(p => p.display_order)).toEqual([0, 1, 2, 3, 4]);
    db.close();
  });

  it('getActsOrdered returns acts in tree order', async () => {
    const db = await seed(dir);
    expect(db.getActsOrdered('noah').map(a => a.id)).toEqual(['a1', 'a2']);
    db.close();
  });

  it('move within an act keeps membership and reorders', async () => {
    const db = await seed(dir);
    db.mutate('node.move', { nodeId: 'pp:p2', afterNodeId: null }); // p2 to front
    // p2 lands before p1 — both in a1, p2 still in a1
    expect(actOf(db, 'p2')).toBe('a1');
    expect(flat(db)).toEqual(['p2', 'p1', 'p3', 'p4', 'p5']);
    db.close();
  });

  it('dragging a section into another act reparents it (containment = position)', async () => {
    const db = await seed(dir);
    db.mutate('node.move', { nodeId: 'pp:p4', afterNodeId: 'pp:p1' }); // p4 (a2) -> after p1 (a1)
    expect(actOf(db, 'p4')).toBe('a1');
    expect(flat(db)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    db.close();
  });

  it('a cross-act move survives a reopen (substrate is authoritative, not re-derived)', async () => {
    const db = await seed(dir);
    db.mutate('node.move', { nodeId: 'pp:p4', afterNodeId: 'pp:p1' });
    db.close();
    const re = await open(dir);
    expect(flat(re)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    expect(actOf(re, 'p4')).toBe('a1');
    re.close();
  });

  it('the inverse of a cross-act move restores order and membership', async () => {
    const db = await seed(dir);
    const { inverse } = db.mutate('node.move', { nodeId: 'pp:p4', afterNodeId: 'pp:p1' });
    expect(flat(db)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    db.mutate(inverse!.name, inverse!.args);
    expect(flat(db)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(actOf(db, 'p4')).toBe('a2');
    db.close();
  });
});

describe('Phase 5b — act-less character (the common real-data shape)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p5b2-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  async function seedFlat(): Promise<BraidrDB> {
    const s = await open(dir);
    s.insertCharacter('kate', 'Kate', null, 0);
    s.insertPlotPoint('k1', 'kate', 'K1', null, null, 0, null);
    s.insertPlotPoint('k2', 'kate', 'K2', null, null, 1, null);
    s.insertPlotPoint('k3', 'kate', 'K3', null, null, 2, null);
    s.close();
    return open(dir);
  }

  it('reorders among root children without inventing act membership', async () => {
    const db = await seedFlat();
    db.mutate('node.move', { nodeId: 'pp:k1', afterNodeId: 'pp:k3' });
    expect(db.getPlotPointsOrdered('kate').map(p => p.id)).toEqual(['k2', 'k3', 'k1']);
    expect((db.getPlotPoints('kate') as unknown as { act_id: string | null }[]).every(p => p.act_id === null)).toBe(true);
    db.close();
  });
});
