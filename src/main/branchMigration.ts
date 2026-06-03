/**
 * One-time, idempotent migration of legacy filesystem branches
 * (branches/index.json + branches/<name>.braidr) into the main .braidr file.
 * Archives the branches/ folder afterward (kept as a dated backup, never deleted).
 */
import * as fs from 'fs';
import * as path from 'path';
import { openDatabase, closeDatabase, type BraidrDB } from './database';

function findMainBraidrFile(projectPath: string): string | null {
  const files = fs.readdirSync(projectPath).filter(f =>
    f.endsWith('.braidr') && fs.statSync(path.join(projectPath, f)).isFile()
  );
  return files[0] ? path.join(projectPath, files[0]) : null;
}

export function migrateFilesystemBranches(projectPath: string): void {
  const branchesDir = path.join(projectPath, 'branches');
  const indexPath = path.join(branchesDir, 'index.json');
  if (!fs.existsSync(indexPath)) return; // nothing to migrate / already migrated

  const mainPath = findMainBraidrFile(projectPath);
  if (!mainPath) return;

  const main = openDatabase(mainPath);
  const mainRow = main.ensureMainBranch();

  let index: { branches: { name: string; description?: string; createdAt?: string }[]; activeBranch: string | null };
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); }
  catch { return; }

  // 1. snapshot main's current live tables
  main.saveSnapshot(mainRow.id, main.serializeBranchedTables());

  // 2. import each old branch file as a snapshot
  let activeBranchId: string | null = null;
  for (const b of index.branches) {
    if (b.name === 'main') continue;
    if (main.getBranchByName(b.name)) continue; // already imported
    const branchFile = path.join(branchesDir, `${b.name}.braidr`);
    if (!fs.existsSync(branchFile)) continue; // skip missing/legacy-md branch (folder kept as backup)
    const id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    main.insertBranchRow(id, b.name, b.description ?? null, mainRow.id);
    let branchDb: BraidrDB | null = null;
    try {
      branchDb = openDatabase(branchFile);
      main.saveSnapshot(id, branchDb.serializeBranchedTables());
    } catch {
      // corrupt branch file — leave the row with no usable snapshot; backup folder retains the file
    } finally {
      if (branchDb) closeDatabase(branchFile);
    }
    if (index.activeBranch === b.name) activeBranchId = id;
  }

  // 3. restore the previously-active branch into the live tables
  if (activeBranchId) {
    const snap = main.getSnapshot(activeBranchId);
    if (snap) main.restoreBranchedTables(snap);
    main.setActiveBranchRow(activeBranchId);
  } else {
    main.setActiveBranchRow(mainRow.id);
  }
  main.checkpoint();

  // 4. archive the old folder (never delete)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(branchesDir, path.join(projectPath, `branches.migrated-${stamp}`));
}
