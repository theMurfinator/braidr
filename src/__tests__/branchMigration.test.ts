import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { migrateFilesystemBranches } from '../main/branchMigration';

describe('filesystem branch migration', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-mig-')); });
  afterEach(async () => { (await import('../main/database')).closeAllDatabases(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('imports old branch files as snapshots, preserves active branch, archives folder', async () => {
    const mod = await import('../main/database');
    const now = Date.now();
    // main file
    const mainPath = path.join(tmp, 'proj.braidr');
    const main = new mod.BraidrDB(mainPath);
    main.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    main.prepare("INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES ('s1','c1',1,0,'Main title',?,?)").run(now, now);
    mod.closeDatabase(mainPath);
    // old branch file with a different title
    fs.mkdirSync(path.join(tmp, 'branches'), { recursive: true });
    const altPath = path.join(tmp, 'branches', 'alt.braidr');
    const alt = new mod.BraidrDB(altPath);
    alt.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
    alt.prepare("INSERT INTO scenes (id, character_id, scene_number, scene_order, title, created_at, updated_at) VALUES ('s1','c1',1,0,'Alt title',?,?)").run(now, now);
    mod.closeDatabase(altPath);
    fs.writeFileSync(path.join(tmp, 'branches', 'index.json'), JSON.stringify({ branches: [{ name: 'alt', createdAt: new Date().toISOString(), createdFrom: 'main' }], activeBranch: 'alt' }));

    migrateFilesystemBranches(tmp);

    const d = mod.openDatabase(mainPath);
    const rows = d.listBranchRows();
    expect(rows.map(r => r.name).sort()).toEqual(['alt', 'main']);
    // active was 'alt' → live tables should hold the alt title
    expect(d.getActiveBranchRow()!.name).toBe('alt');
    expect(d.getScene('s1')!.title).toBe('Alt title');
    // folder archived, not deleted
    expect(fs.existsSync(path.join(tmp, 'branches'))).toBe(false);
    expect(fs.readdirSync(tmp).some(f => f.startsWith('branches.migrated-'))).toBe(true);

    // idempotent: second run is a no-op (no throw, no duplicate branches)
    migrateFilesystemBranches(tmp);
    expect(mod.openDatabase(mainPath).listBranchRows()).toHaveLength(2);
  });
});
