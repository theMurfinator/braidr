import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB } from '../main/database';

const FILE = 'fields.braidr';

async function open(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, FILE));
}

/** Legacy data exercising all three field systems + structure-six columns. */
async function seed(dir: string): Promise<BraidrDB> {
  const db = await open(dir);
  db.insertCharacter('noah', 'Noah', null, 0);
  db.upsertAct({
    id: 'a1', character_id: 'noah', name: 'Act One', synopsis: '',
    starting_state: 'lost', ending_state: '', polarity: '', transformation: '',
    dilemma: '', propelling_action: '', display_order: 0, created_at: 1,
  });
  db.insertPlotPoint('p1', 'noah', 'Hook', null, null, 0, 'a1', '', '', '+', '');
  db.insertScene('s1', 'noah', 'p1', 'Chasing Miguel', '', 1, null, false, null);

  // arc system: one arc-scoped def with values at all three entity levels
  db.replaceArcFieldDefs([
    { id: 'theme', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' },
  ]);
  db.replaceArcFieldValues('act', 'a1', [{ field_def_id: 'theme', value: '"grief"' }]);
  db.replaceArcFieldValues('section', 'p1', [{ field_def_id: 'theme', value: '"loss"' }]);
  db.replaceArcFieldValues('scene', 's1', [{ field_def_id: 'theme', value: '"chase"' }]);

  // metadata system: a scene-only def; its value diverges from a stale arc copy
  db.replaceMetadataFieldDefs([
    { id: 'mood', label: 'Mood', field_type: 'text', options: null, option_colors: null, display_order: 0 },
  ]);
  db.replaceSceneMetadataValues('s1', [{ field_def_id: 'mood', value: '"tense"' }]);
  // replaceArcFieldDefs is scope-aware (one scope per call, like the renderer)
  db.replaceArcFieldDefs([
    { id: 'mood', label: 'Mood', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 1, scope: 'scene' },
  ]);
  db.replaceArcFieldValues('scene', 's1', [
    { field_def_id: 'theme', value: '"chase"' },
    { field_def_id: 'mood', value: '"stale copy"' },
  ]);

  // task system
  db.insertTask('t1', { title: 'Fix ch. 3', description: null, status: 'open', priority: 'none', sceneId: null, timeEstimate: null, dueDate: null, displayOrder: 0 });
  db.replaceTaskFieldDefs([
    { id: 'sprint', name: 'Sprint', field_type: 'text', options: null, display_order: 0 },
  ]);
  db.replaceTaskCustomFieldValues('t1', [{ field_def_id: 'sprint', value: '"june"' }]);

  // structure six at the novel level
  db.upsertCharacterPsychology({
    character_id: 'noah',
    novel_starting_state: 'running from God', novel_ending_state: '',
    novel_polarity: '', novel_transformation: '', novel_dilemma: '', novel_propelling_action: '',
    wound: '', lie: '', deepest_fear: '', limiting_belief: '', thorn: '', coping_tool: '',
    whisper_of_grace: '', surface_want: '', souls_longing: '', bitter_need: '', capital_t_truth: '',
    arc_summary: '', theme: '', anti_theme: '', final_reader_experience: '',
  });
  return db;
}

function value(db: BraidrDB, fieldId: string, entityType: string, entityId: string): string | undefined {
  return db.getFieldValues(entityType, entityId).find(v => v.field_id === fieldId)?.value;
}

describe('field substrate refresh', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fld-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('unifies all three def systems with deterministic ids and attachments', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);

    const defs = new Map(re.getFieldDefs().map(d => [d.id, d]));
    expect(defs.get('arcf:theme')).toMatchObject({ label: 'Theme', builtin: 0 });
    expect(defs.get('arcf:mood')).toMatchObject({ label: 'Mood' });
    expect(defs.get('taskf:sprint')).toMatchObject({ label: 'Sprint' });
    expect(defs.get('builtin:polarity')).toMatchObject({ label: 'Polarity', builtin: 1 });

    const levelsOf = (id: string) => re.getFieldAttachments(id).map(a => a.level_key).sort();
    expect(levelsOf('arcf:theme')).toEqual(['arc', 'plot_point', 'scene']);
    expect(levelsOf('arcf:mood')).toEqual(['scene']);
    expect(levelsOf('taskf:sprint')).toEqual(['task']);
    expect(levelsOf('builtin:polarity')).toEqual(['arc', 'novel', 'plot_point', 'scene']);
    re.close();
  });

  it('maps values onto nodes, scenes, and tasks', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);

    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBe('"grief"');
    expect(value(re, 'arcf:theme', 'node', 'pp:p1')).toBe('"loss"');
    expect(value(re, 'arcf:theme', 'scene', 's1')).toBe('"chase"');
    expect(value(re, 'taskf:sprint', 'task', 't1')).toBe('"june"');
    re.close();
  });

  it('scene_metadata_values wins over a stale arc copy of the same field', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'arcf:mood', 'scene', 's1')).toBe('"tense"');
    re.close();
  });

  it('structure six migrate from all four hardcoded sites, empties skipped', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);

    expect(value(re, 'builtin:starting_state', 'node', 'novel:noah')).toBe(JSON.stringify('running from God'));
    expect(value(re, 'builtin:starting_state', 'node', 'act:a1')).toBe(JSON.stringify('lost'));
    expect(value(re, 'builtin:polarity', 'node', 'pp:p1')).toBe(JSON.stringify('+'));
    // empty legacy defaults produce no rows
    expect(value(re, 'builtin:ending_state', 'node', 'novel:noah')).toBeUndefined();
    expect(value(re, 'builtin:dilemma', 'node', 'act:a1')).toBeUndefined();
    re.close();
  });

  it('rebuild is stable and reflects legacy edits on reopen', async () => {
    const db = await seed(dir);
    db.close();

    const mid = await open(dir);
    const count1 = mid.getFieldValues().length;
    mid.replaceArcFieldValues('act', 'a1', [{ field_def_id: 'theme', value: '"redemption"' }]);
    mid.close();

    const re = await open(dir);
    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBe('"redemption"');
    expect(re.getFieldValues().length).toBe(count1);
    re.close();
  });
});

// Phase 5c-1: field writes dual-write to field_values within the same session,
// so refreshFields() on open is no longer the only thing keeping field_values
// in sync. Each test opens once (refresh populates field_values), then edits via
// a legacy write path and asserts field_values reflects it WITHOUT reopening.
describe('field write dual-writes (within session)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fldw-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('replaceTaskCustomFieldValues updates field_values within the session', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'taskf:sprint', 'task', 't1')).toBe('"june"');

    re.replaceTaskCustomFieldValues('t1', [{ field_def_id: 'sprint', value: '"july"' }]);
    expect(value(re, 'taskf:sprint', 'task', 't1')).toBe('"july"');
    re.close();
  });

  it('replaceTaskCustomFieldValues removes cleared values from field_values', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'taskf:sprint', 'task', 't1')).toBe('"june"');

    re.replaceTaskCustomFieldValues('t1', []);
    expect(value(re, 'taskf:sprint', 'task', 't1')).toBeUndefined();
    re.close();
  });

  it('task.setFields mutation dual-writes custom fields to field_values', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'taskf:sprint', 'task', 't1')).toBe('"june"');

    re.mutate('task.setFields', {
      taskId: 't1', title: 'Fix ch. 3', description: null, status: 'open',
      priority: 'none', sceneId: null, timeEstimate: null, dueDate: null,
      tags: [], characterIds: [], customFields: { sprint: 'august' },
    });
    expect(value(re, 'taskf:sprint', 'task', 't1')).toBe('"august"');
    re.close();
  });

  it('replaceArcFieldValues updates act + section node field_values within the session', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBe('"grief"');
    expect(value(re, 'arcf:theme', 'node', 'pp:p1')).toBe('"loss"');

    re.replaceArcFieldValues('act', 'a1', [{ field_def_id: 'theme', value: '"war"' }]);
    re.replaceArcFieldValues('section', 'p1', [{ field_def_id: 'theme', value: '"exile"' }]);
    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBe('"war"');
    expect(value(re, 'arcf:theme', 'node', 'pp:p1')).toBe('"exile"');
    re.close();
  });

  it('replaceArcFieldValues removes cleared act values but leaves builtin node fields', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    // act:a1 carries both an arc field (theme) and a builtin (starting_state='lost')
    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBe('"grief"');
    expect(value(re, 'builtin:starting_state', 'node', 'act:a1')).toBe(JSON.stringify('lost'));

    re.replaceArcFieldValues('act', 'a1', []);
    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBeUndefined();
    // the builtin row must survive — only arcf:* rows are recomputed
    expect(value(re, 'builtin:starting_state', 'node', 'act:a1')).toBe(JSON.stringify('lost'));
    re.close();
  });

  it('replaceSceneMetadataValues updates scene field_values and wins over arc', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'arcf:mood', 'scene', 's1')).toBe('"tense"'); // metadata wins on open

    re.replaceSceneMetadataValues('s1', [{ field_def_id: 'mood', value: '"calm"' }]);
    expect(value(re, 'arcf:mood', 'scene', 's1')).toBe('"calm"');
    re.close();
  });

  it('replaceArcFieldValues(scene) does not clobber a metadata-owned field', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);

    re.replaceArcFieldValues('scene', 's1', [
      { field_def_id: 'theme', value: '"newchase"' },
      { field_def_id: 'mood', value: '"newstale"' },
    ]);
    // theme has no metadata copy → arc write shows through
    expect(value(re, 'arcf:theme', 'scene', 's1')).toBe('"newchase"');
    // mood IS owned by scene_metadata_values → metadata still wins
    expect(value(re, 'arcf:mood', 'scene', 's1')).toBe('"tense"');
    re.close();
  });

  it('clearing scene metadata reverts the field to its arc copy', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'arcf:mood', 'scene', 's1')).toBe('"tense"');

    re.replaceSceneMetadataValues('s1', []);
    // no metadata left → falls back to the arc-scene value
    expect(value(re, 'arcf:mood', 'scene', 's1')).toBe('"stale copy"');
    re.close();
  });
});
