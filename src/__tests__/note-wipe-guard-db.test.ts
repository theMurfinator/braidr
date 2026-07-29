import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'wipe.braidr'));
}

// The empty doc the load/save race produced.
const EMPTY_DOC = '[{"id":"x","type":"paragraph","props":{},"content":[],"children":[]}]';
const LEGACY_HTML = '<p>Noah Connors is a Republican Intelligence operative.</p>';
const GOOD_JSON = '[{"type":"paragraph","content":[{"type":"text","text":"Noah Connors"}]}]';

describe('backupAndUpdateNoteContent — no-data-loss guard', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wipe-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('REFUSES to overwrite legacy HTML with an empty block doc (the Noah bug)', async () => {
    const db = await freshDb(dir);
    db.insertNote('n1', 'Noah', LEGACY_HTML, null, 0);

    db.backupAndUpdateNoteContent('n1', EMPTY_DOC);

    // Original content must be preserved — the empty migration is rejected.
    expect(db.getNote('n1')!.content).toBe(LEGACY_HTML);
  });

  it('STILL allows a real migration (legacy HTML -> non-empty block doc) and backs up', async () => {
    const db = await freshDb(dir);
    db.insertNote('n2', 'Noah', LEGACY_HTML, null, 0);

    db.backupAndUpdateNoteContent('n2', GOOD_JSON);

    expect(db.getNote('n2')!.content).toBe(GOOD_JSON);
    const backups = db.getNoteContentBackups('n2');
    expect(backups.length).toBe(1);
    expect(backups[0].content).toBe(LEGACY_HTML);
  });

  it('allows clearing an already-migrated (block-json) note to empty, but backs it up', async () => {
    const db = await freshDb(dir);
    db.insertNote('n3', 'Noah', GOOD_JSON, null, 0);

    db.backupAndUpdateNoteContent('n3', EMPTY_DOC);

    // old was block-json (already migrated), so an intentional clear is honored —
    // but the old content is backed up so a race-induced wipe stays recoverable.
    expect(db.getNote('n3')!.content).toBe(EMPTY_DOC);
    const backups = db.getNoteContentBackups('n3');
    expect(backups.length).toBe(1);
    expect(backups[0].content).toBe(GOOD_JSON);
  });

  it('does NOT touch or back up an already-empty note saved empty again', async () => {
    const db = await freshDb(dir);
    db.insertNote('n4', 'Noah', EMPTY_DOC, null, 0);

    db.backupAndUpdateNoteContent('n4', EMPTY_DOC);

    expect(db.getNoteContentBackups('n4').length).toBe(0);
  });
});
