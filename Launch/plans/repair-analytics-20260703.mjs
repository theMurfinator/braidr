/**
 * One-off data repair for the analytics cross-project clobber of 2026-07-03.
 * See Launch/plans/analytics-clobber-fix.md for the full diagnosis and plan.
 *
 * What it does:
 *  1. Refuses to run if the Braidr Electron app is running.
 *  2. Makes timestamped .pre-repair copies of the live America America db
 *     trio and the demo db before any write.
 *  3. Recovers the pre-clobber analytics blob from the rescue WAL
 *     (Launch/rescue-20260703/America America.braidr-wal). Two strategies:
 *     (a) raw byte scan for JSON blobs (the plan's original method; fails in
 *     practice because WAL frame headers interrupt any blob larger than one
 *     4096-byte page), then (b) WAL frame replay: truncate the rescue WAL at
 *     each commit boundary, replay it against a temp copy of the rescue db,
 *     and let SQLite reconstruct the settings row at that point in time.
 *     Picks the candidate with the largest sceneSessions count among blobs
 *     containing the lost window 2026-06-27..2026-07-02.
 *  4. Merges recovered sessions into the live AA blob (union sceneSessions by
 *     id, union sessions by date preferring larger duration; everything else
 *     from the current live blob).
 *  5. Fixes dailyManuscript: latest=859 poison entries -> {44837, 44837};
 *     2026-07-03 -> {baseline: 39959, latest: 39959, rebased: true}.
 *  6. Writes the merged blob back to the live AA settings.analytics.
 *  7. Resets the demo project's stolen analytics to a fresh default blob.
 *  8. Prints before/after numbers.
 *
 * Fallback: if the WAL yields nothing usable, restores the five lost days as
 * aggregate manual sessions (sceneKey 'manual:recovered', wordsNet 0) with
 * durations taken from the launcher cache (recent-projects.json).
 *
 * Touches ONLY the settings table (key 'analytics'). Never scenes, drafts,
 * or notes.
 *
 * Uses the Node-ABI better-sqlite3 from mcp-server/node_modules (the main
 * repo's copy is compiled for Electron).
 */

import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire('/Users/brian/braidr/mcp-server/package.json');
const Database = require('better-sqlite3');

const AA_LIVE = '/Users/brian/Library/Mobile Documents/com~apple~CloudDocs/Braidr/America America/America America.braidr';
const DEMO_LIVE = '/Users/brian/braidr-backup-20260528-065303/demo-project/demo-project.braidr';
const RESCUE_WAL = '/Users/brian/braidr/Launch/rescue-20260703/America America.braidr-wal';

const LOST_START = '2026-06-27';
const LOST_END = '2026-07-02';
const REPORT_START = '2026-06-20';
const REPORT_END = '2026-07-03';

// Launcher-cache fallback durations (hours), dates 2026-06-27..2026-07-01.
const FALLBACK_DAYS = [
  { date: '2026-06-27', hours: 0.9195725 },
  { date: '2026-06-28', hours: 1.0400516666666666 },
  { date: '2026-06-29', hours: 0.14733305555555556 },
  { date: '2026-06-30', hours: 0.49405305555555556 },
  { date: '2026-07-01', hours: 0.47780361111111114 },
];

const DEFAULT_MILESTONES = [
  { id: 'ms-10k', label: '10,000 words', targetWords: 10000, achieved: false },
  { id: 'ms-25k', label: '25,000 words', targetWords: 25000, achieved: false },
  { id: 'ms-50k', label: '50,000 words (NaNoWriMo)', targetWords: 50000, achieved: false },
  { id: 'ms-80k', label: '80,000 words (novel)', targetWords: 80000, achieved: false },
  { id: 'ms-100k', label: '100,000 words', targetWords: 100000, achieved: false },
];

function freshDefaultAnalytics() {
  return {
    sessions: [],
    sceneSessions: [],
    dailyGoal: { enabled: false, target: 500 },
    weeklyGoal: { enabled: false, targetHours: 15 },
    monthlyGoal: { enabled: false, targetWords: 20000 },
    deadlineGoal: { enabled: false, targetWords: 0, deadlineDate: '' },
    milestones: DEFAULT_MILESTONES,
    currentStreak: 0,
    longestStreak: 0,
    lastWritingDate: null,
    dailyManuscript: {},
  };
}

function fail(msg) {
  console.error('ABORT: ' + msg);
  process.exit(1);
}

// ── 1. Verify the app is not running ────────────────────────────────────────
let psOut = '';
try {
  psOut = execSync('pgrep -fl "Braidr.app/Contents/MacOS" || true', { encoding: 'utf-8' }).trim();
} catch { /* pgrep exits 1 on no match; the || true covers it */ }
if (psOut) {
  fail('Braidr appears to be running:\n' + psOut);
}
console.log('App check: Braidr is not running.');

// ── 2. Timestamped backups before any write ─────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g, '-');
function backup(file) {
  if (!fs.existsSync(file)) return null;
  const dest = file + '.pre-repair-' + ts;
  fs.copyFileSync(file, dest);
  console.log('Backed up: ' + dest);
  return dest;
}
if (!fs.existsSync(AA_LIVE)) fail('Live AA db not found: ' + AA_LIVE);
if (!fs.existsSync(DEMO_LIVE)) fail('Live demo db not found: ' + DEMO_LIVE);
backup(AA_LIVE);
backup(AA_LIVE + '-wal');
backup(AA_LIVE + '-shm');
backup(DEMO_LIVE);
backup(DEMO_LIVE + '-wal');
backup(DEMO_LIVE + '-shm');

// ── 3. Scan the rescue WAL for analytics JSON blobs ─────────────────────────
// The settings value is a full analytics JSON object serialized by
// JSON.stringify; key order starts with "sessions" (DEFAULT_ANALYTICS spread
// order), so every stored blob begins with {"sessions". We scan the raw WAL
// bytes for that marker, extract a balanced-brace JSON object from each hit
// (string-aware), and parse. Failures are tolerated (partial/overwritten
// frames).
if (!fs.existsSync(RESCUE_WAL)) fail('Rescue WAL not found: ' + RESCUE_WAL);
const walBuf = fs.readFileSync(RESCUE_WAL);
const walStr = walBuf.toString('latin1'); // byte-preserving 1:1 mapping

function extractBalancedJson(str, start) {
  // Forward scan from an opening brace, tracking strings and escapes.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < str.length && i < start + 5 * 1024 * 1024; i++) {
    const ch = str[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

const MARKER = '{"sessions"';
const candidates = [];
let idx = walStr.indexOf(MARKER);
let scanned = 0;
while (idx !== -1) {
  scanned++;
  const raw = extractBalancedJson(walStr, idx);
  if (raw) {
    try {
      const blob = JSON.parse(raw);
      if (blob && Array.isArray(blob.sceneSessions)) {
        candidates.push({ offset: idx, blob });
      }
    } catch { /* tolerated: partial or overwritten frame */ }
  }
  idx = walStr.indexOf(MARKER, idx + 1);
}
console.log('WAL raw scan: ' + scanned + ' marker hits, ' + candidates.length + ' parsed blobs with sceneSessions.');

// Strategy (b): WAL frame replay. The raw scan fails when the blob spans
// multiple 4096-byte pages (24-byte frame headers interrupt the JSON), which
// is always the case for a real analytics blob. Instead, truncate the WAL at
// each commit boundary and let SQLite replay it against a temp copy of the
// rescue db; read the settings row at each commit point.
if (candidates.length === 0) {
  console.log('Raw scan found nothing usable; trying WAL frame replay.');
  const RESCUE_DB = '/Users/brian/braidr/Launch/rescue-20260703/America America.braidr';
  const TMP_DIR = fs.mkdtempSync('/private/tmp/claude-501/-Users-brian/9a274aba-dc8e-48bb-b6d2-998a467ac06b/scratchpad/braidr-walreplay-');
  const walPageSize = walBuf.readUInt32BE(8);
  const walFrameSize = 24 + walPageSize;
  const totalFrames = Math.floor((walBuf.length - 32) / walFrameSize);
  const commitFrames = [];
  for (let i = 0; i < totalFrames; i++) {
    // Frame header word 2 (offset +4) is the db size after commit; non-zero
    // marks a commit frame.
    if (walBuf.readUInt32BE(32 + i * walFrameSize + 4) !== 0) commitFrames.push(i);
  }
  console.log('WAL replay: ' + totalFrames + ' frames, ' + commitFrames.length + ' commits.');
  for (const ci of commitFrames) {
    const tmpDb = path.join(TMP_DIR, 'replay.braidr');
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(tmpDb + suffix); } catch { /* first pass */ }
    }
    fs.copyFileSync(RESCUE_DB, tmpDb);
    fs.writeFileSync(tmpDb + '-wal', walBuf.slice(0, 32 + (ci + 1) * walFrameSize));
    try {
      const db = new Database(tmpDb);
      const row = db.prepare("SELECT value FROM settings WHERE key = 'analytics'").get();
      db.close();
      if (row) {
        const blob = JSON.parse(row.value);
        if (blob && Array.isArray(blob.sceneSessions)) {
          candidates.push({ offset: 'commit-frame-' + ci, blob });
        }
      }
    } catch { /* tolerated: invalid replay point */ }
  }
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('WAL replay: ' + candidates.length + ' blobs with sceneSessions.');
}

// Among blobs whose sceneSessions include dates in the lost window, pick the
// one with the LARGEST total sceneSessions count.
let recovered = null;
for (const c of candidates) {
  const hasLost = c.blob.sceneSessions.some(s => s.date >= LOST_START && s.date <= LOST_END);
  if (!hasLost) continue;
  if (!recovered || c.blob.sceneSessions.length > recovered.blob.sceneSessions.length) {
    recovered = c;
  }
}

let recoveryMode;
if (recovered) {
  recoveryMode = 'wal';
  console.log('\nRecovered blob: offset ' + recovered.offset + ', ' + recovered.blob.sceneSessions.length + ' sceneSessions total.');
  const byDate = {};
  for (const s of recovered.blob.sceneSessions) {
    if (s.date >= LOST_START && s.date <= LOST_END) {
      byDate[s.date] = (byDate[s.date] || 0) + s.durationMs;
    }
  }
  console.log('Lost-window dates/durations in recovered blob:');
  for (const d of Object.keys(byDate).sort()) {
    console.log('  ' + d + ': ' + (byDate[d] / 60000).toFixed(1) + ' min');
  }
} else {
  recoveryMode = 'fallback';
  console.log('\nNo usable blob found in WAL; will use launcher-cache fallback (aggregate manual sessions).');
}

// ── Helpers for reporting ────────────────────────────────────────────────────
function minutesPerDay(blob, from, to) {
  const byDate = {};
  for (const s of blob.sceneSessions || []) {
    if (s.date >= from && s.date <= to) {
      byDate[s.date] = (byDate[s.date] || 0) + s.durationMs;
    }
  }
  return byDate;
}
function printMinutes(label, blob) {
  console.log(label);
  const byDate = minutesPerDay(blob, REPORT_START, REPORT_END);
  const d = new Date(REPORT_START + 'T00:00:00');
  const end = new Date(REPORT_END + 'T00:00:00');
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    const min = (byDate[key] || 0) / 60000;
    console.log('  ' + key + ': ' + min.toFixed(1) + ' min');
    d.setDate(d.getDate() + 1);
  }
}
function printDailyManuscript(label, blob, n) {
  console.log(label);
  const dm = blob.dailyManuscript || {};
  const dates = Object.keys(dm).sort().slice(-n);
  for (const day of dates) {
    const e = dm[day];
    console.log('  ' + day + ': baseline=' + e.baseline + ' latest=' + e.latest +
      ' delta=' + (e.latest - e.baseline) + (e.rebased ? ' [rebased]' : ''));
  }
}

// ── 4-6. Load live AA blob, merge, fix dailyManuscript, write back ──────────
const aaDb = new Database(AA_LIVE);
const aaRow = aaDb.prepare("SELECT value FROM settings WHERE key = 'analytics'").get();
if (!aaRow) fail('Live AA has no settings.analytics row.');
const current = JSON.parse(aaRow.value);

console.log('\n================ BEFORE (live AA) ================');
printMinutes('sceneSessions minutes per day (' + REPORT_START + '..' + REPORT_END + '):', current);
printDailyManuscript('dailyManuscript last 10 entries:', current, 10);

const merged = { ...current };

if (recoveryMode === 'wal') {
  // Union sceneSessions by id (recovered plus current; current wins on id).
  const byId = new Map();
  for (const s of recovered.blob.sceneSessions) byId.set(s.id, s);
  for (const s of current.sceneSessions || []) byId.set(s.id, s);
  merged.sceneSessions = Array.from(byId.values()).sort((a, b) => a.startTime - b.startTime);

  // Union sessions arrays by date preferring the entry with larger duration.
  const byDate = new Map();
  for (const s of recovered.blob.sessions || []) byDate.set(s.date, s);
  for (const s of current.sessions || []) {
    const prior = byDate.get(s.date);
    if (!prior || s.duration >= prior.duration) byDate.set(s.date, s);
  }
  merged.sessions = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
} else {
  // Fallback: aggregate manual sessions from the launcher cache.
  const sceneSessions = [...(current.sceneSessions || [])];
  for (const f of FALLBACK_DAYS) {
    const durationMs = Math.round(f.hours * 3600 * 1000);
    const anchor = new Date(f.date + 'T12:00:00').getTime();
    sceneSessions.push({
      id: 'manual-recovered-' + f.date,
      sceneKey: 'manual:recovered',
      date: f.date,
      startTime: anchor,
      endTime: anchor + durationMs,
      durationMs,
      wordsNet: 0,
      checkin: null,
    });
  }
  merged.sceneSessions = sceneSessions.sort((a, b) => a.startTime - b.startTime);
}

// Fix dailyManuscript on the merged blob (current blob's history, repaired).
const dm = { ...(merged.dailyManuscript || {}) };
for (const day of Object.keys(dm)) {
  if (dm[day].latest === 859) {
    console.log('Fixing poison entry ' + day + ' (latest=859) -> {44837, 44837}');
    dm[day] = { baseline: 44837, latest: 44837 };
  }
}
dm['2026-07-03'] = { baseline: 39959, latest: 39959, rebased: true };
merged.dailyManuscript = dm;

aaDb.prepare("UPDATE settings SET value = ? WHERE key = 'analytics'").run(JSON.stringify(merged));
aaDb.close();
console.log('\nWrote merged blob to live AA settings.analytics.');

console.log('\n================ AFTER (live AA) =================');
printMinutes('sceneSessions minutes per day (' + REPORT_START + '..' + REPORT_END + '):', merged);
printDailyManuscript('dailyManuscript last 10 entries:', merged, 10);

// ── 7. Demo project: replace stolen AA copy with fresh defaults ─────────────
const demoDb = new Database(DEMO_LIVE);
const demoRow = demoDb.prepare("SELECT value FROM settings WHERE key = 'analytics'").get();
console.log('\n================ DEMO PROJECT ====================');
if (demoRow) {
  const demoBlob = JSON.parse(demoRow.value);
  console.log('Before: ' + (demoBlob.sceneSessions || []).length + ' sceneSessions, ' +
    (demoBlob.sessions || []).length + ' sessions, ' +
    Object.keys(demoBlob.dailyManuscript || {}).length + ' dailyManuscript entries, ' +
    'deadlineGoal.targetWords=' + (demoBlob.deadlineGoal ? demoBlob.deadlineGoal.targetWords : 'n/a'));
} else {
  console.log('Before: no analytics row.');
}
const fresh = freshDefaultAnalytics();
demoDb.prepare("INSERT INTO settings (key, value) VALUES ('analytics', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(fresh));
demoDb.close();
console.log('After: fresh default blob (0 sessions, 0 sceneSessions, 0 dailyManuscript entries, goals disabled, default milestones).');

console.log('\nRecovery mode: ' + (recoveryMode === 'wal' ? 'granular sessions recovered from rescue WAL' : 'launcher-cache fallback (aggregate manual sessions)'));
console.log('Done.');
