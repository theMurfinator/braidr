import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('arc field values survive plot_points rebuild (landmine guard)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-lm-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('keeps section values when its plot_point row is deleted and re-inserted with the same id', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(dir, 'lm.braidr'));
    const now = Date.now();
    db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    db.prepare('INSERT INTO plot_points (id, character_id, title, display_order, created_at) VALUES (?,?,?,?,?)').run('pp1', 'c1', 'Setup', 0, now);

    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0 }]);
    db.replaceArcFieldValues('section', 'pp1', [{ field_def_id: 'f1', value: '"the muck"' }]);

    // Simulate the bulk plot_points rebuild (DELETE all + re-INSERT same id)
    db.prepare('DELETE FROM plot_points').run();
    db.prepare('INSERT INTO plot_points (id, character_id, title, display_order, created_at) VALUES (?,?,?,?,?)').run('pp1', 'c1', 'Setup', 0, now);

    const all = db.getAllArcFieldValues();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe('"the muck"');
  });
});

describe('arc field values survive a def-list re-save (replace-by-absence guard)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-def-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  async function setup() {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(dir, 'd.braidr'));
    const now = Date.now();
    db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    db.prepare('INSERT INTO plot_points (id, character_id, title, display_order, created_at) VALUES (?,?,?,?,?)').run('pp1', 'c1', 'Setup', 0, now);
    return db;
  }

  it('keeps values when the def list is re-saved (rename/reorder of a persisting def)', async () => {
    const db = await setup();
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);
    db.replaceArcFieldValues('section', 'pp1', [{ field_def_id: 'f1', value: '"the muck"' }]);
    expect(db.getAllArcFieldValues()).toHaveLength(1);

    // Re-save the def list with f1 renamed — the value must NOT be wiped.
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme RENAMED', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);

    const after = db.getAllArcFieldValues();
    expect(after).toHaveLength(1);
    expect(after[0].value).toBe('"the muck"');
    expect(db.getArcFieldDefs().find(d => d.id === 'f1')?.label).toBe('Theme RENAMED');
    db.close();
  });

  it('adding a new def preserves existing values for other defs', async () => {
    const db = await setup();
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);
    db.replaceArcFieldValues('section', 'pp1', [{ field_def_id: 'f1', value: '"the muck"' }]);

    // Add f2 alongside f1 (typical "add a custom field" save).
    db.replaceArcFieldDefs([
      { id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' },
      { id: 'f2', label: 'Pace', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 1, scope: 'arc' },
    ]);

    const after = db.getAllArcFieldValues();
    expect(after).toHaveLength(1);
    expect(after[0].field_def_id).toBe('f1');
    db.close();
  });

  it('removing a def DOES cascade away only that def’s values', async () => {
    const db = await setup();
    db.replaceArcFieldDefs([
      { id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' },
      { id: 'f2', label: 'Pace', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 1, scope: 'arc' },
    ]);
    db.replaceArcFieldValues('section', 'pp1', [
      { field_def_id: 'f1', value: '"the muck"' },
      { field_def_id: 'f2', value: '"brisk"' },
    ]);
    expect(db.getAllArcFieldValues()).toHaveLength(2);

    // Remove f2 — its value should cascade away, f1's must remain.
    db.replaceArcFieldDefs([{ id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);

    const after = db.getAllArcFieldValues();
    expect(after.map(v => v.field_def_id)).toEqual(['f1']);
    db.close();
  });
});
