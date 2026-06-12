import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB } from '../main/database';

const FILE = 'sub.braidr';

async function open(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, FILE));
}

/** Two characters; Noah has acts + plot points + scenes, Grace is bare. */
async function seed(dir: string): Promise<BraidrDB> {
  const db = await open(dir);
  db.insertCharacter('noah', 'Noah', null, 0);
  db.insertCharacter('grace', 'Grace', null, 1);
  db.upsertAct({
    id: 'a1', character_id: 'noah', name: 'Act One', synopsis: '',
    starting_state: '', ending_state: '', polarity: '', transformation: '',
    dilemma: '', propelling_action: '', display_order: 0, created_at: 1,
  });
  db.upsertAct({
    id: 'a2', character_id: 'noah', name: 'Act Two', synopsis: '',
    starting_state: '', ending_state: '', polarity: '', transformation: '',
    dilemma: '', propelling_action: '', display_order: 1, created_at: 2,
  });
  db.insertPlotPoint('p1', 'noah', 'Hook', null, null, 0, 'a1');
  db.insertPlotPoint('p2', 'noah', 'Setup', null, null, 1, 'a1');
  db.insertPlotPoint('p3', 'noah', 'Loose ideas', null, null, 2, null, '', '', '', '', '', '', true);
  db.insertScene('s1', 'noah', 'p1', 'Chasing Miguel', '', 1, null, false, null);
  db.insertScene('s2', 'noah', null, 'Unplaced idea', '', 2, null, false, null);
  return db;
}

function sceneParent(db: BraidrDB, sceneId: string): string | null {
  return (db.getScene(sceneId) as unknown as { parent_node_id: string | null }).parent_node_id;
}

describe('structure substrate refresh', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('mirrors characters/acts/plot points as a tree on reopen', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);

    const byId = new Map(re.getStructureNodes().map(n => [n.id, n]));
    expect(byId.get('novel:noah')).toMatchObject({ level_key: 'novel', parent_id: null, title: 'Noah' });
    expect(byId.get('novel:grace')).toMatchObject({ level_key: 'novel', parent_id: null, title: 'Grace' });
    expect(byId.get('act:a1')).toMatchObject({ level_key: 'arc', parent_id: 'novel:noah', title: 'Act One' });
    expect(byId.get('pp:p1')).toMatchObject({ level_key: 'plot_point', parent_id: 'act:a1', title: 'Hook' });
    expect(byId.get('pp:p2')).toMatchObject({ parent_id: 'act:a1' });
    // actless/bullpen section hangs off the root
    expect(byId.get('pp:p3')).toMatchObject({ parent_id: 'novel:noah' });
    re.close();
  });

  it('order_keys reproduce display_order under lexicographic sort', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);

    const ppsUnderA1 = re.getStructureNodes('noah')
      .filter(n => n.parent_id === 'act:a1')
      .sort((a, b) => (a.order_key < b.order_key ? -1 : 1))
      .map(n => n.id);
    expect(ppsUnderA1).toEqual(['pp:p1', 'pp:p2']);

    const roots = re.getStructureNodes()
      .filter(n => n.parent_id === null)
      .sort((a, b) => (a.order_key < b.order_key ? -1 : 1))
      .map(n => n.id);
    expect(roots).toEqual(['novel:noah', 'novel:grace']);
    re.close();
  });

  it('scenes attach to their plot-point node; unplaced scenes to the root (bullpen)', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(sceneParent(re, 's1')).toBe('pp:p1');
    expect(sceneParent(re, 's2')).toBe('novel:noah');
    re.close();
  });

  it('rebuild is stable: same ids, no duplicates across reopens', async () => {
    const db = await seed(dir);
    db.close();
    const first = await open(dir);
    const ids1 = first.getStructureNodes().map(n => n.id).sort();
    first.close();
    const second = await open(dir);
    const ids2 = second.getStructureNodes().map(n => n.id).sort();
    expect(ids2).toEqual(ids1);
    expect(new Set(ids2).size).toBe(ids2.length);
    second.close();
  });

  it('legacy edits are reflected after reopen (legacy stays authoritative)', async () => {
    const db = await seed(dir);
    db.close();
    const mid = await open(dir);
    mid.updatePlotPoint('p2', { actId: null });
    mid.close();
    const re = await open(dir);
    expect(re.getStructureNodes().find(n => n.id === 'pp:p2')!.parent_id).toBe('novel:noah');
    re.close();
  });

  it('levels reflect what the project uses; chapter stays disabled for now', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    const levels = Object.fromEntries(re.getStructureLevels().map(l => [l.level_key, l.enabled]));
    expect(levels).toEqual({ novel: 1, arc: 1, plot_point: 1, chapter: 0 });
    re.close();
  });
});
