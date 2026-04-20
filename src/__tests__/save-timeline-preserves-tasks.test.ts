/**
 * Regression: tasks disappeared from timeline.json after an incoming save
 * with `tasks`/`taskFieldDefs`/`taskViews` undefined clobbered the file.
 *
 * Reproduced from the on-disk evidence in "My life is over" project on
 * 2026-04-20: a save at 05:30 wrote a timeline.json with the entire
 * task-family of keys absent (JSON.stringify drops undefined keys). The
 * main-process SAVE_TIMELINE handler had no guard against this.
 *
 * The fix extracts the write logic into a pure `saveTimelineToDisk`
 * function that preserves existing task-family fields when incoming
 * values are undefined and existing values are non-empty.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { saveTimelineToDisk } from '../main/saveTimeline';

const existingTasks = [
  {
    id: 'task-1',
    title: "Maya's Character Arc",
    status: 'in-progress',
    priority: 'none',
    tags: [],
    characterIds: [],
    timeEntries: [],
    createdAt: 0,
    updatedAt: 0,
    order: 0,
    customFields: {},
  },
  {
    id: 'task-2',
    title: 'Map Kate arc',
    status: 'open',
    priority: 'none',
    tags: [],
    characterIds: [],
    timeEntries: [],
    createdAt: 0,
    updatedAt: 0,
    order: 1,
    customFields: {},
  },
];

const existingTaskFieldDefs = [{ id: 'f1', name: 'Extra', type: 'text' }];
const existingTaskViews = [{ id: 'v1', name: 'My view' }];

function makeExistingFile(folder: string) {
  const existing = {
    positions: { sceneA: 1, sceneB: 2 },
    connections: {},
    chapters: [],
    tasks: existingTasks,
    taskFieldDefs: existingTaskFieldDefs,
    taskViews: existingTaskViews,
    taskColumnWidths: { title: 280 },
    archivedScenes: [{ id: 'a1', characterId: 'c1', content: 'archived' }],
    worldEvents: [{ id: 'w1', title: 'The war' }],
  };
  fs.writeFileSync(path.join(folder, 'timeline.json'), JSON.stringify(existing, null, 2));
  return existing;
}

function readTimeline(folder: string) {
  return JSON.parse(fs.readFileSync(path.join(folder, 'timeline.json'), 'utf-8'));
}

describe('saveTimelineToDisk preserves task data against partial saves', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-save-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('preserves existing tasks when incoming save omits the tasks key', () => {
    makeExistingFile(tmp);

    // Simulates the MobileApp bug: saveTimeline(positions, connections, chapters,
    // characterColors, wordCounts) — every task-family field is undefined.
    saveTimelineToDisk(tmp, {
      positions: { sceneA: 1, sceneB: 2 },
      connections: {},
      chapters: [],
      // tasks, taskFieldDefs, taskViews, etc all absent
    });

    const after = readTimeline(tmp);
    expect(after.tasks).toEqual(existingTasks);
    expect(after.taskFieldDefs).toEqual(existingTaskFieldDefs);
    expect(after.taskViews).toEqual(existingTaskViews);
  });

  it('preserves existing archivedScenes and worldEvents against undefined incoming', () => {
    makeExistingFile(tmp);

    saveTimelineToDisk(tmp, {
      positions: { sceneA: 1, sceneB: 2 },
      connections: {},
      chapters: [],
    });

    const after = readTimeline(tmp);
    expect(after.archivedScenes).toHaveLength(1);
    expect(after.worldEvents).toHaveLength(1);
  });

  it('writes an empty tasks array when caller explicitly passes []', () => {
    // Explicit [] means "user deleted all their tasks" — respect it.
    makeExistingFile(tmp);

    saveTimelineToDisk(tmp, {
      positions: {},
      connections: {},
      chapters: [],
      tasks: [],
    });

    const after = readTimeline(tmp);
    expect(after.tasks).toEqual([]);
  });

  it('writes new tasks when caller passes a populated array', () => {
    makeExistingFile(tmp);
    const newTasks = [{ ...existingTasks[0], title: 'Renamed' }];

    saveTimelineToDisk(tmp, {
      positions: {},
      connections: {},
      chapters: [],
      tasks: newTasks,
    });

    const after = readTimeline(tmp);
    expect(after.tasks).toEqual(newTasks);
  });

  it('creates the file fresh when no existing timeline.json is present', () => {
    saveTimelineToDisk(tmp, {
      positions: { s1: 1 },
      connections: {},
      chapters: [],
      tasks: [],
    });

    const after = readTimeline(tmp);
    expect(after.positions).toEqual({ s1: 1 });
    expect(after.tasks).toEqual([]);
  });
});
