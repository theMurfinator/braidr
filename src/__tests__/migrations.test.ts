import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { LATEST_VERSION } from '../main/migrations';

async function openBraidrDb(file: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(file);
}

function inspect(file: string) {
  const raw = new Database(file, { readonly: true });
  const userVersion = raw.pragma('user_version', { simple: true }) as number;
  const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
    .map(t => t.name);
  raw.close();
  return { userVersion, tables };
}

function bakFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter(f => f.includes('.pre-v') && f.endsWith('.bak'));
}

describe('versioned migrations', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migr-'));
    file = path.join(dir, 'test.braidr');
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('fresh database lands on LATEST_VERSION with mutation_log, no checkpoint file', async () => {
    const db = await openBraidrDb(file);
    db.close();
    const { userVersion, tables } = inspect(file);
    expect(userVersion).toBe(LATEST_VERSION);
    expect(tables).toContain('mutation_log');
    expect(bakFiles(dir)).toEqual([]);
  });

  it('pre-versioned database is stamped baseline then upgraded, with checkpoint', async () => {
    // Build a current DB, then rewind it to look pre-versioned: user_version 0,
    // no mutation_log — i.e. a real project from before this feature.
    const db = await openBraidrDb(file);
    db.close();
    const raw = new Database(file);
    raw.exec('DROP TABLE mutation_log');
    raw.exec('UPDATE scenes SET parent_node_id = NULL');
    raw.exec('ALTER TABLE scenes DROP COLUMN parent_node_id');
    raw.exec('DROP TABLE structure_nodes');
    raw.exec('DROP TABLE structure_levels');
    raw.pragma('user_version = 0');
    raw.prepare("INSERT INTO characters (id, name, color, display_order, created_at) VALUES ('c1', 'Noah', '', 0, 0)").run();
    raw.close();

    const reopened = await openBraidrDb(file);
    reopened.close();

    const { userVersion, tables } = inspect(file);
    expect(userVersion).toBe(LATEST_VERSION);
    expect(tables).toContain('mutation_log');
    // existing data untouched
    const raw2 = new Database(file, { readonly: true });
    const c = raw2.prepare("SELECT name FROM characters WHERE id = 'c1'").get() as { name: string };
    raw2.close();
    expect(c.name).toBe('Noah');
    // an existing project does not migrate without a checkpoint
    expect(bakFiles(dir).length).toBe(1);
  });

  it('reopening at LATEST_VERSION is a no-op: no new checkpoint, log rows survive', async () => {
    const db = await openBraidrDb(file);
    db.close();

    const raw = new Database(file);
    raw.prepare("INSERT INTO mutation_log (ts, name, args_json) VALUES (1, 'scene.rename', '{}')").run();
    raw.close();

    const reopened = await openBraidrDb(file);
    reopened.close();

    const raw2 = new Database(file, { readonly: true });
    const count = (raw2.prepare('SELECT count(*) AS n FROM mutation_log').get() as { n: number }).n;
    raw2.close();
    expect(count).toBe(1);
    expect(bakFiles(dir)).toEqual([]);
    expect(inspect(file).userVersion).toBe(LATEST_VERSION);
  });
});
