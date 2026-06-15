// src/__tests__/note-content-backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'notes.braidr'));
}

describe('backupAndUpdateNoteContent', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('backs up legacy HTML before the first JSON write', async () => {
    const db = await freshDb(dir);
    db.insertNote('n1', 'Title', '<p>legacy <strong>html</strong></p>', null, 0);

    db.backupAndUpdateNoteContent('n1', '[{"type":"paragraph","content":[]}]');

    expect(db.getNote('n1')!.content).toBe('[{"type":"paragraph","content":[]}]');
    const backups = db.getNoteContentBackups('n1');
    expect(backups.length).toBe(1);
    expect(backups[0].content).toBe('<p>legacy <strong>html</strong></p>');
  });

  it('does NOT back up on a JSON-to-JSON save', async () => {
    const db = await freshDb(dir);
    db.insertNote('n1', 'Title', '[{"type":"paragraph","content":[]}]', null, 0);

    db.backupAndUpdateNoteContent('n1', '[{"type":"heading","content":[]}]');

    expect(db.getNoteContentBackups('n1').length).toBe(0);
    expect(db.getNote('n1')!.content).toBe('[{"type":"heading","content":[]}]');
  });

  it('does NOT back up an empty legacy note', async () => {
    const db = await freshDb(dir);
    db.insertNote('n1', 'Title', '', null, 0);

    db.backupAndUpdateNoteContent('n1', '[]');

    expect(db.getNoteContentBackups('n1').length).toBe(0);
  });
});
