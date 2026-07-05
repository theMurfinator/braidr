/**
 * Regression guard for the chapters feature (Launch/plans/chapters-first-class.md
 * Phase 2 risk check): the plot-points bulk DELETE+re-INSERT landmine (memory
 * `project_plotpoint_bulk_save_landmine`) has a documented "sibling risk" for
 * scenes — a bulk timeline save must never wipe a scene's chapter_id.
 *
 * As of Phase 4g, `applySaveTimeline` is a confirmed no-op (all scene writes
 * — including chapter assignment — now go through named mutations fired at
 * the point of change: scenes.setBraidedPositions, scene.move, etc.). This
 * test locks that in: even a legacy-shaped bulk payload must leave chapter_id
 * (and the chapters table) completely untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  const db = new mod.BraidrDB(path.join(dir, 'test.braidr'));
  const now = Date.now();
  db.prepare('INSERT INTO characters (id, name, display_order, created_at) VALUES (?,?,?,?)').run('c1', 'Noah', 0, now);
  db.saveChapter({ id: 'ch1', title: 'Chapter One', order: 0 });
  db.prepare(
    'INSERT INTO scenes (id, character_id, scene_number, scene_order, chapter_id, title, timeline_position, word_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run('s1', 'c1', 1, 0, 'ch1', 'Opening', 1, 100, now, now);
  return { db, mod };
}

describe('applySaveTimeline never touches chapter assignments (bulk-save landmine regression)', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-chapters-savetl-')); });
  afterEach(async () => { (await import('../main/database')).closeAllDatabases(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('leaves scene.chapter_id untouched even with a legacy-shaped bulk payload', async () => {
    const { db, mod } = await freshDb(tmp);
    const { applySaveTimeline } = await import('../main/applySaveTimeline');

    // Simulate what an old bulk save might have sent: scenes with chapterId
    // stripped/undefined, as if the caller "forgot" chapters existed.
    applySaveTimeline(db as unknown as InstanceType<typeof mod.BraidrDB>, {
      scenes: [{ id: 's1', chapterId: null, sceneOrder: 0 }],
      chapters: [],
    });

    const row = db.prepare('SELECT chapter_id FROM scenes WHERE id = ?').get('s1') as { chapter_id: string | null };
    expect(row.chapter_id).toBe('ch1');

    const chapters = db.getChapters();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].id).toBe('ch1');
    db.close();
  });
});
