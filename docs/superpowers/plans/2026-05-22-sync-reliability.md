# Sync Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two cross-machine sync bugs (analytics diverging, notes/tasks not appearing) and add auto-backup for `.braidr` projects.

**Architecture:** Three independent changes: (1) switch SQLite journal mode from WAL to DELETE so the `.braidr` file is always self-contained with no companion files for iCloud to mishandle; (2) migrate `analytics.json` into the SQLite `settings` table so all project data lives in one file; (3) add periodic auto-backup of the `.braidr` file to the user's local app data directory (not in the cloud-synced folder).

**Tech Stack:** `better-sqlite3`, Electron IPC, TypeScript. No new dependencies.

---

## Root Causes Fixed

- **WAL mode** — writes go to a `*.braidr-wal` companion file. iCloud may sync the main `.braidr` before the WAL is checkpointed, so the other machine reads stale data.
- **`analytics.json`** — a flat file sibling to `.braidr`. When both machines write to it, iCloud creates conflict copies or silently discards one. Time-tracked data diverges.
- **No auto-backup** — the legacy `SAVE_TIMELINE` handler auto-backs up `timeline.json`, but `.braidr` projects use `BRAIDR_SAVE_TIMELINE` which has no backup logic.

---

## Files Changed

| File | What changes |
|------|-------------|
| `src/main/database.ts` | Change `journal_mode` WAL → DELETE; add WAL checkpoint in `migrate()` |
| `src/main/main.ts` | Replace `READ_ANALYTICS`/`SAVE_ANALYTICS` handlers: read/write SQLite settings instead of JSON file; add `findBraidrFile()` helper |
| `src/main/braidrIpc.ts` | Add auto-backup logic to `BRAIDR_SAVE_TIMELINE` handler |

No renderer changes needed for Tasks 1–3 since the IPC channel names and payloads don't change.

---

## Task 1: Switch Journal Mode WAL → DELETE

**Files:**
- Modify: `src/main/database.ts`

### Why This Works
`PRAGMA journal_mode = DELETE` keeps all data in the single `.braidr` file. No `-wal` or `-shm` companion files are created. iCloud/Dropbox syncs one file atomically. Running this pragma on an existing WAL database causes `better-sqlite3` to checkpoint the WAL (flush it into the main file) then delete the companion files.

- [ ] **Step 1: Change the journal mode pragma in `CREATE_SCHEMA`**

In `src/main/database.ts`, find the line:
```
  PRAGMA journal_mode = WAL;
```
Replace it with:
```
  PRAGMA journal_mode = DELETE;
```

The full diff:
```typescript
// Before (line 8):
  PRAGMA journal_mode = WAL;

// After:
  PRAGMA journal_mode = DELETE;
```

- [ ] **Step 2: Add a WAL checkpoint in `migrate()` for existing databases**

In `src/main/database.ts`, find the `migrate()` method and add this block at the very top, before the column-existence checks:

```typescript
  private migrate() {
    // If this database was previously opened in WAL mode, checkpoint and switch.
    // Running PRAGMA journal_mode = DELETE on a WAL db performs a full checkpoint
    // automatically, but we make it explicit here for clarity.
    const journalMode = (this.db.pragma('journal_mode') as { journal_mode: string }[])[0]?.journal_mode;
    if (journalMode === 'wal') {
      this.db.pragma('wal_checkpoint(FULL)');
    }

    const sceneColumns = (
```

- [ ] **Step 3: Verify no `-wal` or `-shm` files are created**

Start the app, open a project, make a change (edit a scene title), then in Terminal:
```bash
ls /path/to/your/project/folder/*.braidr* 2>/dev/null
```
Expected: only the `.braidr` file is listed. No `.braidr-wal` or `.braidr-shm` files.

Also verify the app still saves and reloads data correctly.

- [ ] **Step 4: Commit**

```bash
cd /Users/brian/braidr
git add src/main/database.ts
git commit -m "fix: switch SQLite journal mode from WAL to DELETE for reliable cloud sync

WAL mode creates -wal and -shm companion files that iCloud may not sync
atomically alongside the main .braidr file, causing the other machine to
read stale data. DELETE mode keeps all data in the single .braidr file."
```

---

## Task 2: Migrate `analytics.json` into SQLite

**Files:**
- Modify: `src/main/main.ts`

### Why This Works
The `settings` table (already in the schema) stores arbitrary key-value pairs. We write the entire `AnalyticsData` JSON blob under key `analytics`. The `READ_ANALYTICS` handler is updated to read from SQLite first; if nothing is found there and a legacy `analytics.json` exists, it imports the JSON file into SQLite (one-time migration) and renames the old file to `analytics.json.bak` so it's never imported again. `SAVE_ANALYTICS` writes to SQLite only.

No renderer changes needed — the IPC channel names (`read-analytics`, `save-analytics`) stay the same.

- [ ] **Step 1: Add `findBraidrFile()` helper near the top of `main.ts`**

In `src/main/main.ts`, find the `getConfigPath` / `getDeviceConfigPath` helpers near the top (around line 59). Add this helper after them:

```typescript
function findBraidrFile(folderPath: string): string | null {
  try {
    const entries = fs.readdirSync(folderPath);
    const name = entries.find(f => f.endsWith('.braidr') && !f.startsWith('.'));
    return name ? path.join(folderPath, name) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Replace the `READ_ANALYTICS` handler in `main.ts`**

Find the existing handler (around line 1411):
```typescript
ipcMain.handle(IPC_CHANNELS.READ_ANALYTICS, async (_event, projectPath: string) => {
  try {
    const analyticsPath = path.join(projectPath, 'analytics.json');
    if (fs.existsSync(analyticsPath)) {
      const content = fs.readFileSync(analyticsPath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

Replace it entirely with:
```typescript
ipcMain.handle(IPC_CHANNELS.READ_ANALYTICS, async (_event, projectPath: string) => {
  try {
    const braidrPath = findBraidrFile(projectPath);
    if (braidrPath) {
      const { openDatabase } = require('./database') as typeof import('./database');
      const db = openDatabase(braidrPath);
      const stored = db.getSetting('analytics');
      if (stored) {
        return { success: true, data: JSON.parse(stored) };
      }
      // One-time migration from analytics.json
      const legacyPath = path.join(projectPath, 'analytics.json');
      if (fs.existsSync(legacyPath)) {
        const data = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
        db.setSetting('analytics', JSON.stringify(data));
        fs.renameSync(legacyPath, legacyPath + '.bak');
        return { success: true, data };
      }
      return { success: true, data: null };
    }
    // Fallback: no .braidr file found — should not happen in practice
    const analyticsPath = path.join(projectPath, 'analytics.json');
    if (fs.existsSync(analyticsPath)) {
      return { success: true, data: JSON.parse(fs.readFileSync(analyticsPath, 'utf-8')) };
    }
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

- [ ] **Step 3: Replace the `SAVE_ANALYTICS` handler in `main.ts`**

Find the existing handler (around line 1425):
```typescript
ipcMain.handle(IPC_CHANNELS.SAVE_ANALYTICS, async (_event, projectPath: string, data: any) => {
  try {
    const analyticsPath = path.join(projectPath, 'analytics.json');
    fs.writeFileSync(analyticsPath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

Replace it entirely with:
```typescript
ipcMain.handle(IPC_CHANNELS.SAVE_ANALYTICS, async (_event, projectPath: string, data: any) => {
  try {
    const braidrPath = findBraidrFile(projectPath);
    if (braidrPath) {
      const { openDatabase } = require('./database') as typeof import('./database');
      const db = openDatabase(braidrPath);
      db.setSetting('analytics', JSON.stringify(data));
      return { success: true };
    }
    // Fallback: write JSON file if no .braidr found
    const analyticsPath = path.join(projectPath, 'analytics.json');
    fs.writeFileSync(analyticsPath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

- [ ] **Step 4: Verify analytics migration**

Start the app, open a project that has an existing `analytics.json`. Open the analytics/word count view and confirm all existing data is visible. Then check in the Terminal:
```bash
ls /path/to/project/folder/analytics*
```
Expected: `analytics.json.bak` exists (old file renamed), `analytics.json` does NOT exist.

Close and reopen the project. Confirm analytics data still loads correctly.

- [ ] **Step 5: Verify analytics saves to SQLite**

Write for a minute (or manually trigger a session end), then quit the app. Open the database with a SQLite viewer or run:
```bash
sqlite3 /path/to/project/YourProject.braidr "SELECT key, length(value) FROM settings WHERE key = 'analytics';"
```
Expected: one row with key `analytics` and a non-zero length.

- [ ] **Step 6: Commit**

```bash
cd /Users/brian/braidr
git add src/main/main.ts
git commit -m "fix: migrate analytics from analytics.json into SQLite settings table

analytics.json was a sibling file to .braidr that diverged between machines
when iCloud created conflict copies on simultaneous writes. All analytics
data now lives inside the .braidr SQLite file under settings key 'analytics'.
Existing analytics.json is imported on first open and renamed to .bak."
```

---

## Task 3: Auto-Backup for `.braidr` Projects

**Files:**
- Modify: `src/main/braidrIpc.ts`

### Why This Works
The legacy auto-backup in the `SAVE_TIMELINE` handler only backs up `timeline.json` — it never fires for `.braidr` projects (which use `BRAIDR_SAVE_TIMELINE`). We add equivalent logic to `BRAIDR_SAVE_TIMELINE`: every 5 minutes, copy the `.braidr` file to `~/Library/Application Support/braidr/backups/{projectName}/`. Storing backups in the Electron `userData` directory (not the project folder) means they are:
- Not synced to iCloud (purely local protection)
- Not included in manual backups (no bloat)
- Always available even if the project folder is renamed or moved

Max 20 backups per project are kept (pruned oldest-first).

- [ ] **Step 1: Add backup state and constants near the top of `braidrIpc.ts`**

In `src/main/braidrIpc.ts`, find the existing imports and `randomId()` function (around line 16). Add this block after them:

```typescript
const lastBraidrBackupTime: Record<string, number> = {};
const BRAIDR_BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BRAIDR_MAX_BACKUPS = 20;

function getBraidrBackupDir(braidrPath: string): string {
  const { app } = require('electron') as typeof import('electron');
  const fs = require('fs') as typeof import('fs');
  const projectName = require('path').basename(braidrPath, '.braidr');
  const dir = require('path').join(app.getPath('userData'), 'backups', projectName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function autoBackupBraidr(braidrPath: string): void {
  const now = Date.now();
  const lastBackup = lastBraidrBackupTime[braidrPath] || 0;
  if (now - lastBackup < BRAIDR_BACKUP_INTERVAL_MS) return;

  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    if (!fs.existsSync(braidrPath)) return;

    const backupDir = getBraidrBackupDir(braidrPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = path.basename(braidrPath, '.braidr');
    const backupPath = path.join(backupDir, `${projectName}-${timestamp}.braidr`);
    fs.copyFileSync(braidrPath, backupPath);
    lastBraidrBackupTime[braidrPath] = now;

    // Prune oldest backups beyond BRAIDR_MAX_BACKUPS
    const existing = fs.readdirSync(backupDir)
      .filter((f: string) => f.endsWith('.braidr'))
      .sort()
      .reverse();
    for (const old of existing.slice(BRAIDR_MAX_BACKUPS)) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  } catch (err) {
    console.error('[autoBackupBraidr] failed (non-fatal):', err);
  }
}
```

- [ ] **Step 2: Call `autoBackupBraidr` at the start of the `BRAIDR_SAVE_TIMELINE` handler**

In `src/main/braidrIpc.ts`, find the `BRAIDR_SAVE_TIMELINE` handler (line 334):
```typescript
ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_TIMELINE, (_event, braidrPath: string, payload: {
  ...
}) => {
  try {
    const db = getDb(braidrPath);
```

Insert the backup call between `try {` and `const db = getDb(braidrPath);`:
```typescript
  try {
    autoBackupBraidr(braidrPath);
    const db = getDb(braidrPath);
```

- [ ] **Step 3: Verify backup files are created**

Start the app, open a project, make a change and save. Then check:
```bash
ls ~/Library/Application\ Support/braidr/backups/
```
Expected: a subdirectory named after your project containing at least one `.braidr` file.

Make another change immediately — since the interval is 5 minutes, no new backup should appear. Wait 5 minutes (or temporarily change `BRAIDR_BACKUP_INTERVAL_MS` to `10 * 1000` for testing), make another change, and verify a second backup appears.

Verify the backup is a valid SQLite file:
```bash
sqlite3 ~/Library/Application\ Support/braidr/backups/YourProject/YourProject-*.braidr "SELECT name FROM sqlite_master WHERE type='table';" | head -5
```
Expected: table names like `scenes`, `characters`, `notes`, etc.

- [ ] **Step 4: Revert the test interval change if you made one**

If you changed `BRAIDR_BACKUP_INTERVAL_MS` to 10 seconds for testing, set it back to `5 * 60 * 1000`.

- [ ] **Step 5: Commit**

```bash
cd /Users/brian/braidr
git add src/main/braidrIpc.ts
git commit -m "feat: add auto-backup for .braidr projects

The legacy SAVE_TIMELINE auto-backup only backed up timeline.json and
never fired for .braidr projects. Now BRAIDR_SAVE_TIMELINE copies the
full .braidr file to userData/backups/{project}/ every 5 minutes, keeping
the last 20 copies. Backups are stored locally (outside the project folder)
so they don't compete with iCloud sync."
```

---

## Backup Audit Summary

After these three tasks, here is the complete backup picture:

| Backup type | Trigger | Where stored | What's included | Notes |
|-------------|---------|--------------|-----------------|-------|
| **Auto-backup** | Every 5 min during saves | `~/Library/Application Support/braidr/backups/{project}/` | Full `.braidr` SQLite file (scenes, notes, tasks, analytics, everything) | Local only, never iCloud |
| **Manual backup** | User clicks Backup in settings | User-chosen folder | Project folder contents (copies `.braidr` file + all siblings) | Skips hidden dirs, but `.braidr` file is top-level |
| **Migration backup** | Once, on first open after this change | `analytics.json.bak` in project folder | Old analytics JSON data | Safe to delete after confirming data migrated |

**Things that are NOT backed up:**
- `analytics.json.bak` — stale legacy file, not important
- The auto-backup files themselves — they're local backups; the manual backup doesn't include them (by design)
