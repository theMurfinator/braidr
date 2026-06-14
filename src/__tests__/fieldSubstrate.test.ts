import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB } from '../main/database';
import { fieldValuesToArcAndTaskMaps, fieldDefsToArcAndTaskDefs, deriveSceneMetadataOverlay } from '../main/substrate';

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

// Phase 5c-1 (B): field DEFINITION writes dual-write to field_defs +
// field_attachments within the session, so adding/renaming/removing a custom
// field is reflected without a reopen. Removing a def must cascade away its
// field_values (the field is gone) — mirroring the legacy FK cascade.
describe('field def dual-writes (within session)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fldd-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('replaceArcFieldDefs adds a new arc def with arc-level attachments', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);

    // replace the 'arc' scope with theme (kept) + a new 'pace' def
    re.replaceArcFieldDefs([
      { id: 'theme', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, scope: 'arc' },
      { id: 'pace', label: 'Pace', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 1, scope: 'arc' },
    ]);
    const defs = new Map(re.getFieldDefs().map(d => [d.id, d]));
    expect(defs.get('arcf:pace')).toMatchObject({ label: 'Pace', builtin: 0 });
    expect(re.getFieldAttachments('arcf:pace').map(a => a.level_key).sort()).toEqual(['arc', 'plot_point', 'scene']);
    expect(defs.has('arcf:theme')).toBe(true);
    re.close();
  });

  it('replaceArcFieldDefs removing an arc def deletes it and cascades its field_values', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBe('"grief"');

    re.replaceArcFieldDefs([]); // scope defaults to 'arc' → removes all arc-scoped defs
    const defs = new Map(re.getFieldDefs().map(d => [d.id, d]));
    expect(defs.has('arcf:theme')).toBe(false);
    expect(value(re, 'arcf:theme', 'node', 'act:a1')).toBeUndefined();
    // the scene-scoped 'mood' def (different scope) must survive
    expect(defs.has('arcf:mood')).toBe(true);
    re.close();
  });

  it('replaceTaskFieldDefs syncs task defs to field_defs', async () => {
    const db = await seed(dir);
    db.close();
    const re = await open(dir);
    expect(new Map(re.getFieldDefs().map(d => [d.id, d])).has('taskf:sprint')).toBe(true);

    re.replaceTaskFieldDefs([
      { id: 'sprint', name: 'Sprint', field_type: 'text', options: null, display_order: 0 },
      { id: 'effort', name: 'Effort', field_type: 'number', options: null, display_order: 1 },
    ]);
    const defs = new Map(re.getFieldDefs().map(d => [d.id, d]));
    expect(defs.get('taskf:effort')).toMatchObject({ label: 'Effort', builtin: 0 });
    expect(re.getFieldAttachments('taskf:effort').map(a => a.level_key)).toEqual(['task']);
    re.close();
  });
});

// Phase 5c step A (read cutover): the LOAD_PROJECT handler builds its
// arcFieldValues + task customFields maps from field_values instead of the
// legacy tables. This pure helper does the id/shape translation back to the
// renderer's expected shapes (arcf:<def>/node act:/pp: -> "act:"/"section:";
// arcf:<def>/scene -> "scene:"; taskf:<def>/task -> task map). builtin:* rows
// (the structure six) are NOT part of these maps and must be excluded.
describe('fieldValuesToArcAndTaskMaps (read-cutover mapping)', () => {
  it('reshapes arcf node/scene + taskf rows; excludes builtins', () => {
    const rows = [
      { field_id: 'arcf:theme', entity_type: 'node', entity_id: 'act:a1', value: '"grief"' },
      { field_id: 'arcf:theme', entity_type: 'node', entity_id: 'pp:p1', value: '"loss"' },
      { field_id: 'arcf:mood', entity_type: 'scene', entity_id: 's1', value: '"tense"' },
      { field_id: 'arcf:tags', entity_type: 'scene', entity_id: 's1', value: '["a","b"]' },
      { field_id: 'taskf:sprint', entity_type: 'task', entity_id: 't1', value: '"june"' },
      { field_id: 'builtin:polarity', entity_type: 'node', entity_id: 'pp:p1', value: '"+"' },
      { field_id: 'builtin:starting_state', entity_type: 'scene', entity_id: 's1', value: '"lost"' },
    ];
    const { arcFieldValues, customFieldsByTask } = fieldValuesToArcAndTaskMaps(rows);
    expect(arcFieldValues).toEqual({
      'act:a1': { theme: 'grief' },
      'section:p1': { theme: 'loss' },
      'scene:s1': { mood: 'tense', tags: ['a', 'b'] },
    });
    expect(customFieldsByTask).toEqual({ t1: { sprint: 'june' } });
  });

  it('skips malformed JSON values without crashing', () => {
    const rows = [
      { field_id: 'arcf:theme', entity_type: 'scene', entity_id: 's1', value: 'not json' },
      { field_id: 'arcf:mood', entity_type: 'scene', entity_id: 's1', value: '"ok"' },
    ];
    const { arcFieldValues } = fieldValuesToArcAndTaskMaps(rows);
    expect(arcFieldValues).toEqual({ 'scene:s1': { mood: 'ok' } });
  });
});

describe('fieldDefsToArcAndTaskDefs (def read-cutover mapping)', () => {
  it('reconstructs arc defs (scope from attachments) + task defs, excludes builtins', () => {
    const defs = [
      { id: 'arcf:theme', label: 'Theme', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, builtin: 0 },
      { id: 'arcf:mood', label: 'Mood', field_type: 'select', options: '["a"]', option_colors: '{"a":"#f00"}', rating_max: null, display_order: 1, builtin: 0 },
      { id: 'taskf:sprint', label: 'Sprint', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, builtin: 0 },
      { id: 'builtin:polarity', label: 'Polarity', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, builtin: 1 },
    ];
    const att = new Map<string, string[]>([
      ['arcf:theme', ['arc', 'plot_point', 'scene']],
      ['arcf:mood', ['scene']],
      ['taskf:sprint', ['task']],
      ['builtin:polarity', ['arc', 'novel', 'plot_point', 'scene']],
    ]);
    const { arcFieldDefs, taskFieldDefs } = fieldDefsToArcAndTaskDefs(defs, att);
    expect(arcFieldDefs).toEqual([
      { id: 'theme', label: 'Theme', type: 'text', options: undefined, optionColors: undefined, ratingMax: undefined, order: 0, scope: 'arc' },
      { id: 'mood', label: 'Mood', type: 'select', options: ['a'], optionColors: { a: '#f00' }, ratingMax: undefined, order: 1, scope: 'scene' },
    ]);
    expect(taskFieldDefs).toEqual([
      { id: 'sprint', name: 'Sprint', type: 'text', options: undefined },
    ]);
  });

  it('derives scope=arc when an arc-level attachment is present, else scene', () => {
    const defs = [
      { id: 'arcf:a', label: 'A', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 0, builtin: 0 },
      { id: 'arcf:b', label: 'B', field_type: 'text', options: null, option_colors: null, rating_max: null, display_order: 1, builtin: 0 },
    ];
    const att = new Map<string, string[]>([
      ['arcf:a', ['arc', 'plot_point', 'scene']],
      ['arcf:b', ['scene']],
    ]);
    const { arcFieldDefs } = fieldDefsToArcAndTaskDefs(defs, att);
    expect(arcFieldDefs.map(d => [d.id, d.scope])).toEqual([['a', 'arc'], ['b', 'scene']]);
  });
});

// The scene-metadata overlay (metadataFieldDefs + sceneMetadata, used by
// TableView/CompileModal/EditorView) is the SAME data as the scene-scoped arc
// fields — the renderer persists both via saveArcFieldDefs(scope:'scene') /
// saveArcFieldValues('scene',...). So it's derived from the unified arc maps,
// not the stale importer-only legacy metadata tables.
describe('deriveSceneMetadataOverlay', () => {
  it('derives metadataFieldDefs from scene-scoped arc defs (drops arc-scoped, keeps _status)', () => {
    const arcFieldDefs = [
      { id: '_status', label: 'Status', type: 'dropdown', options: ['todo'], optionColors: { todo: '#999' }, ratingMax: undefined, order: -1, scope: 'scene' as const },
      { id: 'mood', label: 'Mood', type: 'text', options: undefined, optionColors: undefined, ratingMax: undefined, order: 0, scope: 'scene' as const },
      { id: 'theme', label: 'Theme', type: 'text', options: undefined, optionColors: undefined, ratingMax: undefined, order: 1, scope: 'arc' as const },
    ];
    const { metadataFieldDefs } = deriveSceneMetadataOverlay(arcFieldDefs, {});
    expect(metadataFieldDefs).toEqual([
      { id: '_status', label: 'Status', type: 'dropdown', options: ['todo'], optionColors: { todo: '#999' }, order: -1 },
      { id: 'mood', label: 'Mood', type: 'text', options: undefined, optionColors: undefined, order: 0 },
    ]);
  });

  it('derives sceneMetadata from scene: entries of arcFieldValues only', () => {
    const arcFieldValues = {
      'scene:s1': { mood: 'tense', _status: 'todo' },
      'act:a1': { theme: 'grief' },
      'section:p1': { theme: 'loss' },
    };
    const { sceneMetadata } = deriveSceneMetadataOverlay([], arcFieldValues);
    expect(sceneMetadata).toEqual({ s1: { mood: 'tense', _status: 'todo' } });
  });
});
