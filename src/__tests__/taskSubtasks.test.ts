import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BraidrDB } from '../main/database';

async function open(dir: string): Promise<BraidrDB> {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'sub.braidr'));
}

// parent p1 with subtasks s1, s2; standalone top-level t1
async function seed(dir: string): Promise<BraidrDB> {
  const db = await open(dir);
  const now = Date.now();
  db.prepare(`INSERT INTO tasks (id, title, status, priority, display_order, created_at, updated_at)
    VALUES ('p1','Parent','open','none',0,?,?)`).run(now, now);
  db.prepare(`INSERT INTO tasks (id, title, status, priority, display_order, parent_task_id, order_key, created_at, updated_at)
    VALUES ('s1','Subtask1','open','none',1,'p1','a',?,?)`).run(now, now);
  db.prepare(`INSERT INTO tasks (id, title, status, priority, display_order, parent_task_id, order_key, created_at, updated_at)
    VALUES ('s2','Subtask2','open','none',2,'p1','b',?,?)`).run(now, now);
  db.prepare(`INSERT INTO tasks (id, title, status, priority, display_order, created_at, updated_at)
    VALUES ('t1','Standalone','open','none',3,?,?)`).run(now, now);
  return db;
}

function getTask(db: BraidrDB, id: string) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as {
    id: string; deleted_at: number | null; parent_task_id: string | null; order_key: string | null;
  } | undefined;
}

describe('task.softDelete cascade', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('soft-deletes subtasks when parent is deleted', async () => {
    const db = await seed(dir);
    db.mutate('task.softDelete', { taskId: 'p1' });
    expect(getTask(db, 'p1')!.deleted_at).not.toBeNull();
    expect(getTask(db, 's1')!.deleted_at).not.toBeNull();
    expect(getTask(db, 's2')!.deleted_at).not.toBeNull();
  });

  it('does not affect other top-level tasks', async () => {
    const db = await seed(dir);
    db.mutate('task.softDelete', { taskId: 'p1' });
    expect(getTask(db, 't1')!.deleted_at).toBeNull();
  });

  it('restoring parent does NOT restore subtasks', async () => {
    const db = await seed(dir);
    db.mutate('task.softDelete', { taskId: 'p1' });
    db.mutate('task.restore', { taskId: 'p1' });
    expect(getTask(db, 'p1')!.deleted_at).toBeNull();
    expect(getTask(db, 's1')!.deleted_at).not.toBeNull(); // still deleted
  });

  it('soft-deleting a standalone task works as before', async () => {
    const db = await seed(dir);
    db.mutate('task.softDelete', { taskId: 't1' });
    expect(getTask(db, 't1')!.deleted_at).not.toBeNull();
    db.close();
  });
});

describe('task.move', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('moves s1 after s2 within the same parent', async () => {
    const db = await seed(dir);
    db.mutate('task.move', { taskId: 's1', parentId: 'p1', afterTaskId: 's2' });
    const s1 = getTask(db, 's1')!;
    const s2 = getTask(db, 's2')!;
    expect(s1.order_key! > s2.order_key!).toBe(true);
    db.close();
  });

  it('promotes a subtask to top-level (parentId null)', async () => {
    const db = await seed(dir);
    db.mutate('task.move', { taskId: 's1', parentId: null, afterTaskId: null });
    expect(getTask(db, 's1')!.parent_task_id).toBeNull();
    db.close();
  });

  it('demotes a top-level task to subtask', async () => {
    const db = await seed(dir);
    db.mutate('task.move', { taskId: 't1', parentId: 'p1', afterTaskId: 's2' });
    expect(getTask(db, 't1')!.parent_task_id).toBe('p1');
    db.close();
  });

  it('rejects moving a parent task under another task (one-level guard)', async () => {
    const db = await seed(dir);
    // p1 has subtasks -- it cannot itself become a subtask
    expect(() => db.mutate('task.move', { taskId: 'p1', parentId: 't1', afterTaskId: null }))
      .toThrow('one-level');
    db.close();
  });

  it('inverse is a task.move back to original position', async () => {
    const db = await seed(dir);
    const { inverse } = db.mutate('task.move', { taskId: 's1', parentId: 'p1', afterTaskId: 's2' });
    expect(inverse).not.toBeNull();
    expect(inverse!.name).toBe('task.move');
    db.close();
  });
});
