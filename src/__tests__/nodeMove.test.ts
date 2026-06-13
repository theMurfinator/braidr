import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB } from '../main/database';

async function open(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'node.braidr'));
}

/** Noah with sections A, B, C at display_order 0, 1, 2.
 *
 * Close+reopen after inserting legacy data so the second open triggers the
 * full substrate rebuild with all three plot points present in structure_nodes.
 * (Phase 5a: first open seeds an empty tree; the seeded-but-empty guard causes
 * the second open to re-seed from legacy tables.) */
async function seed(dir: string): Promise<BraidrDB> {
  const setup = await open(dir);
  setup.insertCharacter('noah', 'Noah', null, 0);
  setup.insertPlotPoint('A', 'noah', 'Section A', null, null, 0);
  setup.insertPlotPoint('B', 'noah', 'Section B', null, null, 1);
  setup.insertPlotPoint('C', 'noah', 'Section C', null, null, 2);
  setup.close();
  return open(dir);
}

function sectionOrder(db: BraidrDB): string[] {
  return (db.getPlotPoints('noah') as unknown as { id: string; display_order: number }[])
    .sort((a, b) => a.display_order - b.display_order)
    .map(p => p.id);
}

describe('node.move (sections)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('moves a section after another, renumbering dense from 0', async () => {
    const db = await seed(dir);
    db.mutate('node.move', { nodeId: 'pp:A', afterNodeId: 'pp:B' });
    expect(sectionOrder(db)).toEqual(['B', 'A', 'C']);
    const orders = (db.getPlotPoints('noah') as unknown as { display_order: number }[])
      .map(p => p.display_order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2]);
    db.close();
  });

  it('afterNodeId null moves to the front', async () => {
    const db = await seed(dir);
    db.mutate('node.move', { nodeId: 'pp:C', afterNodeId: null });
    expect(sectionOrder(db)).toEqual(['C', 'A', 'B']);
    db.close();
  });

  it('the inverse restores the original order', async () => {
    const db = await seed(dir);
    const { inverse } = db.mutate('node.move', { nodeId: 'pp:A', afterNodeId: 'pp:C' });
    expect(sectionOrder(db)).toEqual(['B', 'C', 'A']);
    db.mutate(inverse!.name, inverse!.args);
    expect(sectionOrder(db)).toEqual(['A', 'B', 'C']);
    db.close();
  });

  it('substrate refresh on reopen reproduces the mutated order', async () => {
    const db = await seed(dir);
    db.mutate('node.move', { nodeId: 'pp:B', afterNodeId: null });
    db.close();
    const re = await open(dir);
    expect(sectionOrder(re)).toEqual(['B', 'A', 'C']);
    const nodes = re.getStructureNodes('noah')
      .filter(n => n.level_key === 'plot_point')
      .sort((a, b) => (a.order_key < b.order_key ? -1 : 1))
      .map(n => n.id);
    expect(nodes).toEqual(['pp:B', 'pp:A', 'pp:C']);
    re.close();
  });

  it('rejects unknown nodes and non-sibling afterNodes', async () => {
    const db = await seed(dir);
    expect(() => db.mutate('node.move', { nodeId: 'pp:nope', afterNodeId: null })).toThrow(/section not found/);
    expect(() => db.mutate('node.move', { nodeId: 'act:A', afterNodeId: null })).toThrow(/only plot_point/);
    expect(() => db.mutate('node.move', { nodeId: 'pp:A', afterNodeId: 'pp:zzz' })).toThrow(/not found among siblings/);
    expect(sectionOrder(db)).toEqual(['A', 'B', 'C']);
    db.close();
  });
});
