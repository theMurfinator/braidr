import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TENSION_FIELD_IDS, TENSION_FIELD_SEEDS, TENSION_SCALE_MAX, isShaperPlottable } from '../shared/types';
import type { ArcFieldDef } from '../shared/types';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'shaper.braidr'));
}

const seedRows = () => TENSION_FIELD_SEEDS.map((f, i) => ({
  id: f.id,
  label: f.label,
  field_type: 'rating',
  options: null,
  option_colors: null,
  rating_max: TENSION_SCALE_MAX,
  display_order: i,
  scope: 'arc',
}));

describe('Shaper tension fields', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaper-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('seeds two arc-scoped rating fields capped at 10', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs(seedRows());

    const defs = db.getArcFieldDefs();
    expect(defs.map(d => d.id).sort()).toEqual(
      [TENSION_FIELD_IDS.external, TENSION_FIELD_IDS.internal].sort()
    );
    for (const d of defs) {
      expect(d.field_type).toBe('rating');
      expect(d.rating_max).toBe(TENSION_SCALE_MAX);
      // arc scope is what puts the field on acts, sections AND scenes
      expect(d.scope ?? 'arc').toBe('arc');
    }
  });

  it('stores per-scene scores without disturbing section scores', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs(seedRows());

    db.replaceArcFieldValues('scene', 'scene-1', [
      { field_def_id: TENSION_FIELD_IDS.internal, value: '7' },
      { field_def_id: TENSION_FIELD_IDS.external, value: '3' },
    ]);
    db.replaceArcFieldValues('section', 'pp-1', [
      { field_def_id: TENSION_FIELD_IDS.internal, value: '9' },
    ]);
    // rescoring one scene must not touch the section's value
    db.replaceArcFieldValues('scene', 'scene-1', [
      { field_def_id: TENSION_FIELD_IDS.internal, value: '8' },
      { field_def_id: TENSION_FIELD_IDS.external, value: '3' },
    ]);

    const byKey = Object.fromEntries(
      db.getAllArcFieldValues().map(r => [`${r.entity_type}:${r.entity_id}:${r.field_def_id}`, r.value])
    );
    expect(byKey[`scene:scene-1:${TENSION_FIELD_IDS.internal}`]).toBe('8');
    expect(byKey[`scene:scene-1:${TENSION_FIELD_IDS.external}`]).toBe('3');
    expect(byKey[`section:pp-1:${TENSION_FIELD_IDS.internal}`]).toBe('9');
  });

  it('clearing a score removes the row rather than storing an empty string', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs(seedRows());
    db.replaceArcFieldValues('scene', 'scene-1', [
      { field_def_id: TENSION_FIELD_IDS.internal, value: '5' },
    ]);
    db.replaceArcFieldValues('scene', 'scene-1', []);

    const rows = db.getArcFieldValues('scene', 'scene-1');
    expect(rows).toHaveLength(0);
  });

  it('renaming a tension field keeps its scores (defs are updated, not re-inserted)', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs(seedRows());
    db.replaceArcFieldValues('scene', 'scene-1', [
      { field_def_id: TENSION_FIELD_IDS.internal, value: '6' },
    ]);

    const renamed = seedRows();
    renamed[0].label = 'Inner Conflict';
    db.replaceArcFieldDefs(renamed);

    const rows = db.getArcFieldValues('scene', 'scene-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('6');
    expect(db.getArcFieldDefs().find(d => d.id === TENSION_FIELD_IDS.internal)?.label).toBe('Inner Conflict');
  });

  it('only bounded rating fields are plottable', () => {
    const def = (type: ArcFieldDef['type']): ArcFieldDef => ({ id: 'x', label: 'x', type, order: 0 });
    expect(isShaperPlottable(def('rating'))).toBe(true);
    // an unbounded number would let one scene be scored 1-10 and another 1-100,
    // which makes a shared y axis lie
    expect(isShaperPlottable(def('number'))).toBe(false);
    expect(isShaperPlottable(def('text'))).toBe(false);
    expect(isShaperPlottable(def('dropdown'))).toBe(false);
  });
});
