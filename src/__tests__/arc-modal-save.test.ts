/**
 * Arc modal save path roundtrips.
 *
 * Every test here corresponds to a write path reachable from the arc detail
 * modal. The pattern: write → close DB → reopen → read → assert. This
 * catches silent-drop bugs where the write appears to succeed but nothing
 * actually lands in SQLite.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB, ActRow, ArcFieldDefRow } from '../main/database';

let BraidrDBClass: typeof BraidrDB;
async function freshDb(dir: string, name = 'test.braidr'): Promise<BraidrDB> {
  if (!BraidrDBClass) {
    const mod = await import('../main/database');
    BraidrDBClass = mod.BraidrDB as unknown as typeof BraidrDB;
  }
  return new (BraidrDBClass as any)(path.join(dir, name));
}

describe('arc modal save paths', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-arc-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  // ── Act fields ────────────────────────────────────────────────────────────

  it('upsertAct persists all arc text fields across DB reopen', async () => {
    const db1 = await freshDb(dir);
    db1.insertCharacter('char-1', 'Noah', null, 0);
    const act: ActRow = {
      id: 'act-1', character_id: 'char-1',
      name: 'Act One',
      synopsis: 'Overall synopsis',
      starting_state: '<p>Beginning text</p>',
      ending_state: '<p>Ending text</p>',
      polarity: '+/-',
      transformation: '<p>Turning point</p>',
      dilemma: '<p>The dilemma</p>',
      propelling_action: '<p>Propelling action</p>',
      display_order: 0,
      created_at: Date.now(),
    };
    db1.upsertAct(act);
    (db1 as any).close();

    const db2 = await freshDb(dir);
    const rows = db2.getActs('char-1');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.starting_state).toBe('<p>Beginning text</p>');
    expect(r.ending_state).toBe('<p>Ending text</p>');
    expect(r.polarity).toBe('+/-');
    expect(r.transformation).toBe('<p>Turning point</p>');
    expect(r.dilemma).toBe('<p>The dilemma</p>');
    expect(r.propelling_action).toBe('<p>Propelling action</p>');
    expect(r.synopsis).toBe('Overall synopsis');
    (db2 as any).close();
  });

  it('upsertAct UPDATE preserves all fields (no silent zeroing)', async () => {
    const db = await freshDb(dir);
    db.insertCharacter('char-1', 'Noah', null, 0);
    const base: ActRow = {
      id: 'act-1', character_id: 'char-1', name: 'Act One', synopsis: 'S',
      starting_state: 'A', ending_state: 'B', polarity: '+', transformation: 'C',
      dilemma: 'D', propelling_action: 'E', display_order: 0, created_at: Date.now(),
    };
    db.upsertAct(base);
    // Update only starting_state — other fields must not be wiped
    db.upsertAct({ ...base, starting_state: 'Updated beginning' });
    const rows = db.getActs('char-1');
    expect(rows[0].starting_state).toBe('Updated beginning');
    expect(rows[0].ending_state).toBe('B');
    expect(rows[0].dilemma).toBe('D');
    (db as any).close();
  });

  // ── PlotPoint arc fields ──────────────────────────────────────────────────

  it('updatePlotPoint persists all arc text fields', async () => {
    const db = await freshDb(dir);
    db.insertCharacter('c1', 'Noah', null, 0);
    db.insertPlotPoint('pp1', 'c1', 'Setup', null, null, 0, null, '', '', '', '', '', '', false, '');

    db.updatePlotPoint('pp1', {
      startingState: '<p>Beginning</p>',
      endingState: '<p>Ending</p>',
      transformation: '<p>Turning</p>',
      dilemma: '<p>Dilemma</p>',
      propellingAction: '<p>Propel</p>',
      polarity: '-/+',
      description: 'Synopsis text',
    });

    const rows = db.getPlotPoints('c1');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.starting_state).toBe('<p>Beginning</p>');
    expect(r.ending_state).toBe('<p>Ending</p>');
    expect(r.transformation).toBe('<p>Turning</p>');
    expect(r.dilemma).toBe('<p>Dilemma</p>');
    expect(r.propelling_action).toBe('<p>Propel</p>');
    expect(r.polarity).toBe('-/+');
    expect(r.description).toBe('Synopsis text');
    (db as any).close();
  });

  it('BRAIDR_SAVE_CHARACTER pattern (DELETE + insertPlotPoint) carries all arc fields', async () => {
    const db = await freshDb(dir);
    db.insertCharacter('c1', 'Noah', null, 0);
    db.insertPlotPoint(
      'pp1', 'c1', 'Setup', 'desc', null, 0, null,
      '<p>Begin</p>', '<p>End</p>', '+/-', '<p>Turn</p>',
      '<p>Dil</p>', '<p>Prop</p>', false, 'synopsis'
    );

    // Simulate the BRAIDR_SAVE_CHARACTER bulk replace
    db.prepare('DELETE FROM plot_points WHERE character_id = ?').run('c1');
    db.insertPlotPoint(
      'pp1', 'c1', 'Setup', 'desc', null, 0, null,
      '<p>Begin</p>', '<p>End</p>', '+/-', '<p>Turn</p>',
      '<p>Dil</p>', '<p>Prop</p>', false, 'synopsis'
    );

    const rows = db.getPlotPoints('c1');
    expect(rows[0].starting_state).toBe('<p>Begin</p>');
    expect(rows[0].ending_state).toBe('<p>End</p>');
    expect(rows[0].polarity).toBe('+/-');
    expect(rows[0].transformation).toBe('<p>Turn</p>');
    expect(rows[0].dilemma).toBe('<p>Dil</p>');
    expect(rows[0].propelling_action).toBe('<p>Prop</p>');
    expect(rows[0].description).toBe('desc');
    expect(rows[0].synopsis).toBe('synopsis');
    (db as any).close();
  });

  // ── Custom field defs ─────────────────────────────────────────────────────

  it('replaceArcFieldDefs persists all field properties across DB reopen', async () => {
    const db1 = await freshDb(dir);
    const defs: ArcFieldDefRow[] = [
      { id: 'f1', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' },
      { id: 'f2', label: 'Tension', field_type: 'rating', options: null, option_colors: null, rating_max: 7, display_order: 1, scope: 'arc' },
      { id: 'f3', label: 'Mood', field_type: 'dropdown', options: '["dark","light"]', option_colors: '{"dark":"#333"}', rating_max: null, display_order: 2, scope: 'arc' },
    ];
    db1.replaceArcFieldDefs(defs);
    (db1 as any).close();

    const db2 = await freshDb(dir);
    const rows = db2.getArcFieldDefs().filter(d => d.scope === 'arc');
    expect(rows).toHaveLength(3);
    expect(rows[1].rating_max).toBe(7);
    expect(rows[2].options).toBe('["dark","light"]');
    expect(rows[2].option_colors).toBe('{"dark":"#333"}');
    (db2 as any).close();
  });

  it('replaceArcFieldDefs scope isolation: arc save does not wipe scene defs', async () => {
    const db = await freshDb(dir);
    const arcDef: ArcFieldDefRow = { id: 'a1', label: 'Arc Field', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' };
    const sceneDef: ArcFieldDefRow = { id: 's1', label: 'Scene Field', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'scene' };

    db.replaceArcFieldDefs([arcDef]);
    db.replaceArcFieldDefs([sceneDef]);

    // Now replace arc-scope only — scene def must survive
    db.replaceArcFieldDefs([{ ...arcDef, label: 'Arc Field Updated' }]);

    const all = db.getArcFieldDefs();
    expect(all.find(d => d.id === 'a1')?.label).toBe('Arc Field Updated');
    expect(all.find(d => d.id === 's1')?.label).toBe('Scene Field');
    (db as any).close();
  });

  it('replaceArcFieldDefs scope isolation: scene save does not wipe arc defs', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([{ id: 'a1', label: 'Arc', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);
    db.replaceArcFieldDefs([{ id: 's1', label: 'Scene', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'scene' }]);

    // Replace scene-scope only
    db.replaceArcFieldDefs([{ id: 's1', label: 'Scene Updated', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'scene' }]);

    const all = db.getArcFieldDefs();
    expect(all.find(d => d.id === 'a1')?.label).toBe('Arc');
    expect(all.find(d => d.id === 's1')?.label).toBe('Scene Updated');
    (db as any).close();
  });

  // ── Custom field values ───────────────────────────────────────────────────

  it('replaceArcFieldValues persists text values across DB reopen', async () => {
    const db1 = await freshDb(dir);
    db1.replaceArcFieldDefs([{ id: 'f1', label: 'Notes', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);
    db1.replaceArcFieldValues('act', 'act-1', [{ field_def_id: 'f1', value: '"my notes"' }]);
    (db1 as any).close();

    const db2 = await freshDb(dir);
    const rows = db2.getArcFieldValues('act', 'act-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('"my notes"');
    (db2 as any).close();
  });

  it('replaceArcFieldValues persists JSON array (multiselect) across DB reopen', async () => {
    const db1 = await freshDb(dir);
    db1.replaceArcFieldDefs([{ id: 'f1', label: 'Tags', field_type: 'multiselect', options: '["A","B","C"]', option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);
    db1.replaceArcFieldValues('section', 'pp-1', [{ field_def_id: 'f1', value: '["A","C"]' }]);
    (db1 as any).close();

    const db2 = await freshDb(dir);
    const rows = db2.getArcFieldValues('section', 'pp-1');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].value)).toEqual(['A', 'C']);
    (db2 as any).close();
  });

  it('replaceArcFieldValues for one entity does not touch other entities', async () => {
    const db = await freshDb(dir);
    db.replaceArcFieldDefs([{ id: 'f1', label: 'X', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' }]);
    db.replaceArcFieldValues('act', 'act-1', [{ field_def_id: 'f1', value: '"alpha"' }]);
    db.replaceArcFieldValues('act', 'act-2', [{ field_def_id: 'f1', value: '"beta"' }]);

    // Update only act-1
    db.replaceArcFieldValues('act', 'act-1', [{ field_def_id: 'f1', value: '"updated"' }]);

    expect(db.getArcFieldValues('act', 'act-1')[0].value).toBe('"updated"');
    expect(db.getArcFieldValues('act', 'act-2')[0].value).toBe('"beta"');
    (db as any).close();
  });

  // ── Arc UI prefs (section dividers, field sections) ───────────────────────

  it('setArcUiPref persists across DB reopen', async () => {
    const db1 = await freshDb(dir);
    db1.setArcUiPref('arc-field-sections', '{"beginning":"Structure","ending":"Structure"}');
    (db1 as any).close();

    const db2 = await freshDb(dir);
    const raw = db2.getArcUiPref('arc-field-sections');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ beginning: 'Structure', ending: 'Structure' });
    (db2 as any).close();
  });

  it('setArcUiPref update replaces existing value (no duplicate rows)', async () => {
    const db = await freshDb(dir);
    db.setArcUiPref('key', 'v1');
    db.setArcUiPref('key', 'v2');
    expect(db.getArcUiPref('key')).toBe('v2');
    // No extra rows
    const count = (db as any).db.prepare('SELECT COUNT(*) as n FROM arc_ui_prefs WHERE key = ?').get('key') as { n: number };
    expect(count.n).toBe(1);
    (db as any).close();
  });

  it('setArcUiPref persists JSON divider positions across DB reopen', async () => {
    const dividers = [{ id: 'd1', label: 'Structure', afterId: '__start__' }];
    const db1 = await freshDb(dir);
    db1.setArcUiPref('arc-dividers:arc-field-order:act', JSON.stringify(dividers));
    (db1 as any).close();

    const db2 = await freshDb(dir);
    const raw = db2.getArcUiPref('arc-dividers:arc-field-order:act');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(dividers);
    (db2 as any).close();
  });
});
