import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function tableNames(db: any): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
}

describe('branch storage schema', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-bs-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('creates branch_snapshots and branch_positions and drops branch_scene_snapshots', async () => {
    const mod = await import('../main/database');
    const db = new mod.BraidrDB(path.join(tmp, 'p.braidr'));
    const names = tableNames(db);
    expect(names).toContain('branches');
    expect(names).toContain('branch_snapshots');
    expect(names).toContain('branch_positions');
    expect(names).not.toContain('branch_scene_snapshots');
    db.close();
  });
});
