import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'arc.braidr'));
}

describe('arc field defs + values', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips field defs', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([
      { id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 },
      { id: 'f2', label: 'Stakes', field_type: 'rating', options: null, option_colors: null, rating_max: 5, display_order: 1 },
    ]);
    const defs = db.getArcFieldDefs();
    expect(defs.map(d => d.id)).toEqual(['f1', 'f2']);
    expect(defs[1].rating_max).toBe(5);
  });

  it('replaceArcFieldValues replaces only that entity', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 }]);
    db.replaceArcFieldValues('section', 's1', [{ field_def_id: 'f1', value: '"grief"' }]);
    db.replaceArcFieldValues('act', 'a1', [{ field_def_id: 'f1', value: '"hope"' }]);
    // Re-save s1 only; a1 untouched
    db.replaceArcFieldValues('section', 's1', [{ field_def_id: 'f1', value: '"sorrow"' }]);
    const all = db.getAllArcFieldValues();
    const byKey = Object.fromEntries(all.map(r => [`${r.entity_type}:${r.entity_id}`, r.value]));
    expect(byKey['section:s1']).toBe('"sorrow"');
    expect(byKey['act:a1']).toBe('"hope"');
  });

  it('deleting a field def cascades its values', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 }]);
    db.replaceArcFieldValues('section', 's1', [{ field_def_id: 'f1', value: '"x"' }]);
    db.replaceArcFieldDefs([]); // removes f1
    expect(db.getAllArcFieldValues()).toEqual([]);
  });
});
