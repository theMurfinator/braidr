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
