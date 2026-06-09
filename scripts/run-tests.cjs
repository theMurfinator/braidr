/**
 * Test runner wrapper: rebuilds better-sqlite3 for the current Node.js ABI
 * (dev setup keeps an Electron-compiled binary; tests need the Node.js one),
 * runs vitest, then restores the Electron binary regardless of exit code.
 *
 * Usage: node scripts/run-tests.cjs [vitest args...]
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BIN = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const BACKUP = BIN + '.electron-backup';

let hadElectronBinary = false;

function rebuild(label, cmd) {
  process.stdout.write(`\n[run-tests] rebuilding better-sqlite3 for ${label}...\n`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (e) {
    process.stderr.write(`[run-tests] ERROR: failed to rebuild for ${label}\n`);
    throw e;
  }
}

// 1. Back up Electron binary if it exists
if (fs.existsSync(BIN)) {
  fs.copyFileSync(BIN, BACKUP);
  hadElectronBinary = true;
}

// 2. Rebuild for Node.js
try {
  rebuild('Node.js', 'npm rebuild better-sqlite3');
} catch {
  if (hadElectronBinary) {
    fs.copyFileSync(BACKUP, BIN);
    fs.unlinkSync(BACKUP);
  }
  process.exit(1);
}

// 3. Run vitest
const extraArgs = process.argv.slice(2);
const vitestResult = spawnSync(
  process.execPath,
  ['node_modules/.bin/vitest', 'run', ...extraArgs],
  { stdio: 'inherit', cwd: path.join(__dirname, '..') }
);

// 4. Restore Electron binary
if (hadElectronBinary) {
  try {
    rebuild('Electron', 'node_modules/.bin/electron-rebuild -f -w better-sqlite3');
  } catch {
    process.stderr.write('[run-tests] WARNING: could not restore Electron binary; run `npm run postinstall` to fix\n');
  }
  if (fs.existsSync(BACKUP)) fs.unlinkSync(BACKUP);
}

process.exit(vitestResult.status ?? 1);
