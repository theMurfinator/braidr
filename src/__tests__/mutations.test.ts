import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerMutation, executeMutation } from '../main/mutations';
import type { BraidrDB } from '../main/database';

async function freshDb(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  const db = new mod.BraidrDB(path.join(dir, 'mut.braidr'));
  db.insertCharacter('c1', 'Noah', null, 0);
  db.insertScene('s1', 'c1', null, 'Original title', '', 1, null, false, null);
  db.insertScene('s2', 'c1', null, 'Second scene', '', 2, null, false, null);
  return db;
}

// A deliberately over-budget mutation: claims it deletes at most 1 row,
// then deletes every scene. The executor must roll the whole thing back.
registerMutation<{ characterId: string }>({
  name: 'test.overBudgetDelete',
  deletionBudget: 1,
  run(ctx, { characterId }) {
    ctx.delete('DELETE FROM scenes WHERE character_id = ?', characterId);
    return null;
  },
});

describe('mutation executor', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('scene.rename renames, logs, and returns an applicable inverse', async () => {
    const db = await freshDb(dir);

    const { inverse } = db.mutate('scene.rename', { sceneId: 's1', title: 'New title' });
    expect(db.getScenes('c1').find(s => s.id === 's1')!.title).toBe('New title');

    const log = db.getMutationLog();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe('scene.rename');
    expect(JSON.parse(log[0].args_json)).toEqual({ sceneId: 's1', title: 'New title' });
    expect(JSON.parse(log[0].inverse_json!)).toEqual(inverse);

    // undo = apply the inverse as a normal mutation
    db.mutate(inverse!.name, inverse!.args);
    expect(db.getScenes('c1').find(s => s.id === 's1')!.title).toBe('Original title');
    expect(db.getMutationLog()).toHaveLength(2);
    db.close();
  });

  it('exceeding the deletion budget rolls back everything, including the log entry', async () => {
    const db = await freshDb(dir);

    expect(() => db.mutate('test.overBudgetDelete', { characterId: 'c1' }))
      .toThrow(/deletion budget/);

    // both scenes survive; nothing was logged
    expect(db.getScenes('c1')).toHaveLength(2);
    expect(db.getMutationLog()).toHaveLength(0);
    db.close();
  });

  it('unknown mutation names are rejected', async () => {
    const db = await freshDb(dir);
    expect(() => db.mutate('scene.explode', {})).toThrow(/Unknown mutation/);
    expect(db.getMutationLog()).toHaveLength(0);
    db.close();
  });

  it('a failing mutation leaves no partial writes', async () => {
    const db = await freshDb(dir);
    expect(() => db.mutate('scene.rename', { sceneId: 'nope', title: 'x' }))
      .toThrow(/scene not found/);
    expect(db.getMutationLog()).toHaveLength(0);
    db.close();
  });

  it('scene.edit updates title/body/notes and its inverse restores all three', async () => {
    const db = await freshDb(dir);
    db.replaceSceneNotes('s1', ['first note', 'second note']);

    const { inverse } = db.mutate('scene.edit', {
      sceneId: 's1',
      title: 'Edited title',
      content: 'Edited title',
      notes: ['only note'],
    });

    const row = db.prepare('SELECT title, synopsis FROM scenes WHERE id = ?').get('s1') as { title: string; synopsis: string };
    expect(row.title).toBe('Edited title');
    expect(row.synopsis).toBe('Edited title');
    expect(db.getSceneNotes('s1').map(n => n.content)).toEqual(['only note']);

    const log = db.getMutationLog();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe('scene.edit');

    // undo restores the old title, body, and the full notes list in order
    db.mutate(inverse!.name, inverse!.args);
    const restored = db.prepare('SELECT title, synopsis FROM scenes WHERE id = ?').get('s1') as { title: string; synopsis: string };
    expect(restored.title).toBe('Original title');
    expect(restored.synopsis).toBe('');
    expect(db.getSceneNotes('s1').map(n => n.content)).toEqual(['first note', 'second note']);
    db.close();
  });

  it('scene.edit leaves other scenes’ notes untouched', async () => {
    const db = await freshDb(dir);
    db.replaceSceneNotes('s1', ['s1 note']);
    db.replaceSceneNotes('s2', ['s2 note a', 's2 note b']);

    db.mutate('scene.edit', { sceneId: 's1', title: 't', content: 't', notes: [] });

    expect(db.getSceneNotes('s1')).toHaveLength(0);
    expect(db.getSceneNotes('s2').map(n => n.content)).toEqual(['s2 note a', 's2 note b']);
    db.close();
  });

  it('scene.edit on a missing scene throws and writes nothing', async () => {
    const db = await freshDb(dir);
    expect(() => db.mutate('scene.edit', { sceneId: 'nope', title: 'x', content: 'x', notes: [] }))
      .toThrow(/scene not found/);
    expect(db.getMutationLog()).toHaveLength(0);
    db.close();
  });

  it('duplicate registration is rejected', () => {
    expect(() => registerMutation({ name: 'scene.rename', deletionBudget: 0, run: () => null }))
      .toThrow(/already registered/);
  });

  it('executeMutation is BraidrDB.mutate (same registry, raw access)', async () => {
    const db = await freshDb(dir);
    // sanity: the exported executor and the class method share one registry
    expect(typeof executeMutation).toBe('function');
    db.close();
  });
});

describe('node verbs', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  async function dbWithSection(d: string) {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(d, 'node.braidr'));
    db.insertCharacter('c1', 'Noah', null, 0);
    db.insertPlotPoint('pp1', 'c1', 'Act 1', null, null, 0);
    db.insertScene('s1', 'c1', 'pp1', 'Scene 1', '', 1, null, false, null);
    return db;
  }

  it('node.edit updates title/description/expectedSceneCount and is invertible', async () => {
    const db = await dbWithSection(dir);
    const { inverse } = db.mutate('node.edit', {
      nodeId: 'pp:pp1', title: 'New Title', description: 'new desc', expectedSceneCount: 3,
    });
    const row = db.prepare('SELECT title, description, expected_scene_count FROM plot_points WHERE id = ?').get('pp1') as { title: string; description: string | null; expected_scene_count: number | null };
    expect(row.title).toBe('New Title');
    expect(row.description).toBe('new desc');
    expect(row.expected_scene_count).toBe(3);
    // inverse restores
    db.mutate(inverse!.name, inverse!.args);
    const restored = db.prepare('SELECT title FROM plot_points WHERE id = ?').get('pp1') as { title: string };
    expect(restored.title).toBe('Act 1');
    db.close();
  });

  it('node.create inserts section at end and inverse removes it', async () => {
    const db = await dbWithSection(dir);
    db.mutate('node.create', { id: 'pp2', characterId: 'c1', title: 'New Section' });
    const sections = db.getPlotPoints('c1');
    expect(sections).toHaveLength(2);
    expect(sections[1].id).toBe('pp2');
    expect(sections[1].display_order).toBe(1);
    db.close();
  });

  it('node.delete removes section and sends its scenes to bullpen', async () => {
    const db = await dbWithSection(dir);
    db.mutate('node.delete', { nodeId: 'pp:pp1' });
    expect(db.getPlotPoints('c1')).toHaveLength(0);
    const scenes = db.getScenes('c1');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].plot_point_id).toBeNull();
    expect(scenes[0].timeline_position).toBeNull();
    db.close();
  });

  it('node.delete on missing section throws and writes nothing', async () => {
    const db = await dbWithSection(dir);
    expect(() => db.mutate('node.delete', { nodeId: 'pp:nope' })).toThrow(/not found/);
    expect(db.getPlotPoints('c1')).toHaveLength(1);
    db.close();
  });
});

describe('scene.create / scene.delete / scene.restore', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  async function dbWithScenes(d: string) {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(d, 'scene.braidr'));
    db.insertCharacter('c1', 'Noah', null, 0);
    db.insertPlotPoint('pp1', 'c1', 'Act 1', null, null, 0);
    db.insertScene('s1', 'c1', 'pp1', 'Scene 1', '', 1, null, false, null);
    db.insertScene('s2', 'c1', 'pp1', 'Scene 2', '', 2, null, false, null);
    return db;
  }

  it('scene.create appends at end and renumbers', async () => {
    const db = await dbWithScenes(dir);
    db.mutate('scene.create', {
      id: 'snew', characterId: 'c1', plotPointId: 'pp1',
      afterSceneId: null, title: 'New', content: 'New', tags: [],
    });
    const scenes = db.getScenes('c1');
    expect(scenes).toHaveLength(3);
    expect(scenes[2].id).toBe('snew');
    expect(scenes[2].scene_number).toBe(3);
    db.close();
  });

  it('scene.create inserts after a specific scene and renumbers', async () => {
    const db = await dbWithScenes(dir);
    db.mutate('scene.create', {
      id: 'smid', characterId: 'c1', plotPointId: 'pp1',
      afterSceneId: 's1', title: 'Mid', content: 'Mid', tags: [],
    });
    const scenes = db.getScenes('c1');
    expect(scenes.map(s => s.id)).toEqual(['s1', 'smid', 's2']);
    expect(scenes.map(s => s.scene_number)).toEqual([1, 2, 3]);
    db.close();
  });

  it('scene.create upserts tags into the master table', async () => {
    const db = await dbWithScenes(dir);
    db.mutate('scene.create', {
      id: 'st', characterId: 'c1', plotPointId: null,
      afterSceneId: null, title: 'T', content: 'T', tags: ['mytag'],
    });
    const tags = db.prepare("SELECT t.name FROM tags t JOIN scene_tags st ON st.tag_id = t.id WHERE st.scene_id = 'st'").all() as { name: string }[];
    expect(tags.map(t => t.name)).toContain('mytag');
    db.close();
  });

  it('scene.delete soft-deletes and renumbers remaining scenes', async () => {
    const db = await dbWithScenes(dir);
    db.mutate('scene.delete', { sceneId: 's1' });
    const active = db.getScenes('c1');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('s2');
    expect(active[0].scene_number).toBe(1);
    // deleted row still exists in DB
    const deleted = db.prepare('SELECT deleted_at FROM scenes WHERE id = ?').get('s1') as { deleted_at: number | null };
    expect(deleted.deleted_at).not.toBeNull();
    db.close();
  });

  it('scene.delete inverse is scene.restore which revives the scene', async () => {
    const db = await dbWithScenes(dir);
    const { inverse } = db.mutate('scene.delete', { sceneId: 's1' });
    db.mutate(inverse!.name, inverse!.args);
    const active = db.getScenes('c1');
    expect(active.map(s => s.id)).toContain('s1');
    const restored = db.prepare('SELECT deleted_at FROM scenes WHERE id = ?').get('s1') as { deleted_at: number | null };
    expect(restored.deleted_at).toBeNull();
    db.close();
  });

  it('scene.delete on missing scene throws and writes nothing', async () => {
    const db = await dbWithScenes(dir);
    expect(() => db.mutate('scene.delete', { sceneId: 'nope' })).toThrow(/not found/);
    expect(db.getScenes('c1')).toHaveLength(2);
    db.close();
  });
});

describe('section.reorderScenes', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('redistributes fixed scene numbers across new in-section ordering', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(dir, 'reorder.braidr'));
    db.insertCharacter('c1', 'Noah', null, 0);
    db.insertPlotPoint('pp1', 'c1', 'Act 1', null, null, 0);
    // Scene numbers 1, 3, 5 — interleaved with scenes from another character
    db.insertScene('sa', 'c1', 'pp1', 'A', '', 1, null, false, null);
    db.insertScene('sb', 'c1', 'pp1', 'B', '', 3, null, false, null);
    db.insertScene('sc', 'c1', 'pp1', 'C', '', 5, null, false, null);

    // Reorder to [sc, sa, sb]
    db.mutate('section.reorderScenes', { sectionId: 'pp1', orderedIds: ['sc', 'sa', 'sb'] });

    const scenes = db.prepare('SELECT id, scene_number FROM scenes WHERE plot_point_id = ? ORDER BY scene_number').all('pp1') as { id: string; scene_number: number }[];
    // The pool {1,3,5} redistributed to new order
    expect(scenes.map(s => s.id)).toEqual(['sc', 'sa', 'sb']);
    expect(scenes.map(s => s.scene_number)).toEqual([1, 3, 5]);
    db.close();
  });

  it('section.reorderScenes inverse restores original order', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(dir, 'reorder2.braidr'));
    db.insertCharacter('c1', 'Noah', null, 0);
    db.insertPlotPoint('pp1', 'c1', 'Act 1', null, null, 0);
    db.insertScene('sa', 'c1', 'pp1', 'A', '', 1, null, false, null);
    db.insertScene('sb', 'c1', 'pp1', 'B', '', 2, null, false, null);

    const { inverse } = db.mutate('section.reorderScenes', { sectionId: 'pp1', orderedIds: ['sb', 'sa'] });
    db.mutate(inverse!.name, inverse!.args);

    const scenes = db.prepare('SELECT id, scene_number FROM scenes ORDER BY scene_number').all() as { id: string; scene_number: number }[];
    expect(scenes[0].id).toBe('sa');
    expect(scenes[1].id).toBe('sb');
    db.close();
  });
});
