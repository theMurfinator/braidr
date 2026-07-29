/**
 * Follow-up pass to repair-analytics-20260703.mjs (same incident).
 *
 * That pass restored the lost sceneSessions granularly from the rescue WAL
 * but, per the plan's merge rule, kept the current blob's dailyManuscript
 * (the stale all-scenes 44837-era history), leaving the restored week with
 * zero word deltas. The recovered pre-clobber blob also contains the TRUE
 * braided-basis dailyManuscript history. This pass restores it for
 * 2026-06-25..2026-07-03 only:
 *
 *  - entries before 2026-06-25 are NOT touched;
 *  - the first restored entry is marked rebased: true so the basis
 *    discontinuity from 06-24's all-scenes latest (44837) does not re-chain
 *    into a phantom negative on load;
 *  - later restored days chain naturally (each baseline = prior latest), so
 *    they carry their true deltas; 07-03 ends at latest 39959 and loses its
 *    previous rebased flag because its baseline is now honest;
 *  - sceneSessions and everything else in the blob are left untouched.
 *
 * Sanity check: sum of restored deltas must equal 39959 minus the first
 * restored baseline.
 */

import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire('/Users/brian/braidr/mcp-server/package.json');
const Database = require('better-sqlite3');

const AA_LIVE = '/Users/brian/Library/Mobile Documents/com~apple~CloudDocs/Braidr/America America/America America.braidr';
const RESCUE_DB = '/Users/brian/braidr/Launch/rescue-20260703/America America.braidr';
const RESCUE_WAL = '/Users/brian/braidr/Launch/rescue-20260703/America America.braidr-wal';
const SCRATCH = '/private/tmp/claude-501/-Users-brian/9a274aba-dc8e-48bb-b6d2-998a467ac06b/scratchpad';

const WINDOW_START = '2026-06-25';
const WINDOW_END = '2026-07-03';
const LOST_START = '2026-06-27';
const LOST_END = '2026-07-02';
const FINAL_LATEST = 39959;

function fail(msg) {
  console.error('ABORT: ' + msg);
  process.exit(1);
}

// 1. Verify the app is not running.
let psOut = '';
try {
  psOut = execSync('pgrep -fl "Braidr.app/Contents/MacOS" || true', { encoding: 'utf-8' }).trim();
} catch { /* no match */ }
if (psOut) fail('Braidr appears to be running:\n' + psOut);
console.log('App check: Braidr is not running.');

// 2. Fresh timestamped backup before writing.
const ts = new Date().toISOString().replace(/[:.]/g, '-');
if (!fs.existsSync(AA_LIVE)) fail('Live AA db not found: ' + AA_LIVE);
const dest = AA_LIVE + '.pre-repair-' + ts;
fs.copyFileSync(AA_LIVE, dest);
console.log('Backed up: ' + dest);

// 3. Re-derive the recovered pre-clobber blob from the rescue WAL by frame
// replay (same selection rule as the first pass: largest sceneSessions count
// among commit states containing the lost window).
const walBuf = fs.readFileSync(RESCUE_WAL);
const pageSize = walBuf.readUInt32BE(8);
const frameSize = 24 + pageSize;
const totalFrames = Math.floor((walBuf.length - 32) / frameSize);
const TMP_DIR = fs.mkdtempSync(path.join(SCRATCH, 'braidr-walreplay2-'));
let recovered = null;
let recoveredFrame = -1;
for (let i = 0; i < totalFrames; i++) {
  if (walBuf.readUInt32BE(32 + i * frameSize + 4) === 0) continue; // not a commit
  const tmpDb = path.join(TMP_DIR, 'replay.braidr');
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmpDb + suffix); } catch { /* first pass */ }
  }
  fs.copyFileSync(RESCUE_DB, tmpDb);
  fs.writeFileSync(tmpDb + '-wal', walBuf.slice(0, 32 + (i + 1) * frameSize));
  try {
    const db = new Database(tmpDb);
    const row = db.prepare("SELECT value FROM settings WHERE key = 'analytics'").get();
    db.close();
    if (!row) continue;
    const blob = JSON.parse(row.value);
    if (!blob || !Array.isArray(blob.sceneSessions)) continue;
    const hasLost = blob.sceneSessions.some(s => s.date >= LOST_START && s.date <= LOST_END);
    if (!hasLost) continue;
    if (!recovered || blob.sceneSessions.length > recovered.sceneSessions.length) {
      recovered = blob;
      recoveredFrame = i;
    }
  } catch { /* tolerated */ }
}
fs.rmSync(TMP_DIR, { recursive: true, force: true });
if (!recovered) fail('Could not re-derive the recovered blob from the rescue WAL.');
console.log('Recovered blob: commit frame ' + recoveredFrame + ', ' + recovered.sceneSessions.length + ' sceneSessions.');

const recoveredDm = recovered.dailyManuscript || {};

// 4. Load the live blob and swap in the recovered window.
const db = new Database(AA_LIVE);
const row = db.prepare("SELECT value FROM settings WHERE key = 'analytics'").get();
if (!row) fail('Live AA has no settings.analytics row.');
const live = JSON.parse(row.value);
const sceneSessionsBefore = JSON.stringify(live.sceneSessions);

function printDm(label, dm, n) {
  console.log(label);
  for (const d of Object.keys(dm).sort().slice(-n)) {
    const e = dm[d];
    console.log('  ' + d + ': baseline=' + e.baseline + ' latest=' + e.latest +
      ' delta=' + (e.latest - e.baseline) + (e.rebased ? ' [rebased]' : ''));
  }
}

console.log('\n================ BEFORE ================');
printDm('dailyManuscript last 12 entries:', live.dailyManuscript || {}, 12);

const dm = { ...(live.dailyManuscript || {}) };
const recoveredWindowDates = Object.keys(recoveredDm)
  .filter(d => d >= WINDOW_START && d <= WINDOW_END)
  .sort();
if (recoveredWindowDates.length === 0) fail('Recovered blob has no dailyManuscript entries in the window.');

// Dates currently in the live window that the recovered blob does not cover
// are left as they are (and reported).
const liveWindowDates = Object.keys(dm).filter(d => d >= WINDOW_START && d <= WINDOW_END).sort();
const uncovered = liveWindowDates.filter(d => !recoveredDm[d]);
if (uncovered.length > 0) {
  console.log('\nLive window dates NOT covered by the recovered history (left untouched): ' + uncovered.join(', '));
} else {
  console.log('\nAll live window dates are covered by the recovered history.');
}

let prevLatest = null;
let deltaSum = 0;
let firstBaseline = null;
for (let i = 0; i < recoveredWindowDates.length; i++) {
  const d = recoveredWindowDates[i];
  const e = recoveredDm[d];
  const entry = { baseline: e.baseline, latest: e.latest };
  if (i === 0) {
    // Basis discontinuity from the untouched 06-24 all-scenes latest: anchor.
    entry.rebased = true;
    firstBaseline = e.baseline;
  } else if (e.baseline !== prevLatest) {
    // Chain not honest at this point; keep an anchor so load-time repair
    // does not re-chain a phantom delta.
    entry.rebased = true;
    console.log('NOTE: ' + d + ' baseline ' + e.baseline + ' does not chain from prior latest ' + prevLatest + '; marked rebased.');
  }
  dm[d] = entry;
  deltaSum += e.latest - e.baseline;
  prevLatest = e.latest;
}

// 5. Sanity checks before writing.
if (prevLatest !== FINAL_LATEST) {
  fail('Final restored latest is ' + prevLatest + ', expected ' + FINAL_LATEST + '.');
}
const expected = FINAL_LATEST - firstBaseline;
if (deltaSum !== expected) {
  fail('Restored delta sum ' + deltaSum + ' does not equal ' + FINAL_LATEST + ' - ' + firstBaseline + ' = ' + expected + '.');
}
console.log('\nSanity check: restored delta sum ' + deltaSum + ' == ' + FINAL_LATEST + ' - ' + firstBaseline + ' == ' + expected + '. OK');

live.dailyManuscript = dm;
if (JSON.stringify(live.sceneSessions) !== sceneSessionsBefore) fail('sceneSessions changed; refusing to write.');
db.prepare("UPDATE settings SET value = ? WHERE key = 'analytics'").run(JSON.stringify(live));
db.close();
console.log('Wrote updated dailyManuscript to live AA settings.analytics. sceneSessions untouched (' + live.sceneSessions.length + ' entries, byte-identical).');

console.log('\n================ AFTER =================');
printDm('dailyManuscript last 12 entries:', dm, 12);
console.log('\nDone.');
