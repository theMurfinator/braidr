/**
 * Regression: the SQLite SAVE_TIMELINE handler wiped tasks + tracked hours +
 * custom-field metadata when handed an empty-but-defined payload.
 *
 * Reproduced from the 2026-06-03 "America America" incident: after the v1.5.120
 * branch-migration flow, a save fired with `tasks: []`, `sceneMetadata: {}`,
 * and `metadataFieldDefs: []`. The handler's `!== undefined` guards did not
 * protect against this, so it ran `DELETE FROM tasks` / `DELETE FROM
 * scene_metadata_values` and re-inserted nothing — destroying ~21h of
 * time_entries (cascade from tasks) and all custom metadata (cascade from
 * metadata_field_defs).
 *
 * The fix (applySaveTimeline + shouldReplace) preserves existing rows when an
 * incoming bulk-replace collection is empty.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { applySaveTimeline } from '../main/applySaveTimeline';
import type { Task, MetadataFieldDef } from '../shared/types';

const fieldDef: MetadataFieldDef = { id: 'def-1', label: 'Mood', type: 'text', order: 0 };

const taskA: Task = {
  id: 'task-1',
  title: "Maya's Character Arc",
  description: undefined,
  status: 'in-progress',
  priority: 'none',
  sceneKey: null,
  timeEstimate: null,
  dueDate: null,
  order: 0,
  tags: [],
  characterIds: [],
  customFields: {},
  createdAt: 0,
  updatedAt: 0,
  timeEntries: [
    { id: 'te-1', startedAt: 1777284569686, duration: 3069619, description: undefined },
    { id: 'te-2', startedAt: 1777284578172, duration: 7200000, description: undefined },
  ],
} as Task;

async function setupSeededProject(dir: string) {
  const braidrPath = path.join(dir, 'test-project.braidr');
  const mod = await import('../main/database');
  const db = new mod.BraidrDB(braidrPath);
  const now = Date.now();
  db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('char-1', 'Maya', 0, now);
  db.prepare('INSERT INTO scenes (id, character_id, scene_number, scene_order, title, timeline_position, word_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('scene-1', 'char-1', 1, 0, 'Opening', 1, 100, now, now);

  // Seed task-family + metadata via the real save path (also exercises populate).
  applySaveTimeline(db, {
    metadataFieldDefs: [fieldDef],
    sceneMetadata: { 'scene-1': { 'def-1': 'tense' } },
    tasks: [taskA],
  });
  return { braidrPath, db, mod };
}

function counts(db: { prepare: (s: string) => { get: () => unknown } }) {
  const n = (t: string) => (db.prepare(`SELECT count(*) AS c FROM ${t}`).get() as { c: number }).c;
  return {
    tasks: n('tasks'),
    timeEntries: n('time_entries'),
  };
}

describe('applySaveTimeline preserves task-family + metadata against empty saves', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-save-sqlite-')); });
  afterEach(async () => { (await import('../main/database')).closeAllDatabases(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('seed populates the task-family tables', async () => {
    const { db } = await setupSeededProject(tmp);
    expect(counts(db)).toEqual({ tasks: 1, timeEntries: 2 });
  });

  it('does NOT wipe when payload sends empty tasks/sceneMetadata/metadataFieldDefs (the bug)', async () => {
    const { db } = await setupSeededProject(tmp);
    applySaveTimeline(db, {
      positions: { 'scene-1': 2 },     // a normal save, but task/metadata state arrived empty
      tasks: [],
      sceneMetadata: {},
      metadataFieldDefs: [],
    });
    expect(counts(db)).toEqual({ tasks: 1, timeEntries: 2 });
  });

  it('does NOT wipe when payload omits the keys entirely', async () => {
    const { db } = await setupSeededProject(tmp);
    applySaveTimeline(db, { positions: { 'scene-1': 3 } });
    expect(counts(db)).toEqual({ tasks: 1, timeEntries: 2 });
  });

  it('still replaces when a non-empty collection is provided', async () => {
    const { db } = await setupSeededProject(tmp);
    const taskB: Task = { ...taskA, id: 'task-2', title: 'Map Kate arc', timeEntries: [] } as Task;
    applySaveTimeline(db, { tasks: [taskB] });
    expect(counts(db).tasks).toBe(1);
    expect((db.prepare('SELECT id FROM tasks').get() as { id: string }).id).toBe('task-2');
    expect(counts(db).timeEntries).toBe(0); // taskB has no time entries → replaced
  });

  it('allows an empty save on a fresh (empty) table without error', async () => {
    const braidrPath = path.join(tmp, 'fresh.braidr');
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(braidrPath);
    expect(() => applySaveTimeline(db, { tasks: [], sceneMetadata: {}, metadataFieldDefs: [] })).not.toThrow();
    expect(counts(db).tasks).toBe(0);
  });
});
