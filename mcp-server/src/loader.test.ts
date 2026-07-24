import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProject, loadNoteContent, getDraftProse } from './loader.js';

// ── Fixture builder ─────────────────────────────────────────────────────────
//
// Builds a minimal but realistic .braidr SQLite file mirroring the columns the
// loader reads, so the tests don't depend on any real project file.

let dir: string;
let dbPath: string;

function buildFixture(p: string): void {
  const db = new Database(p);
  db.exec(`
    CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT NOT NULL, word_count_goal INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, display_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER);
    CREATE TABLE plot_points (id TEXT PRIMARY KEY, character_id TEXT, title TEXT, description TEXT, expected_scene_count INTEGER, display_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER);
    CREATE TABLE chapters (id TEXT PRIMARY KEY, title TEXT, ord INTEGER, description TEXT);
    CREATE TABLE scenes (id TEXT PRIMARY KEY, character_id TEXT, plot_point_id TEXT, title TEXT, synopsis TEXT DEFAULT '', scene_number INTEGER DEFAULT 0, timeline_position INTEGER, is_highlighted INTEGER DEFAULT 0, word_count INTEGER, chapter_id TEXT, deleted_at INTEGER);
    CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT, category TEXT DEFAULT 'things');
    CREATE TABLE scene_tags (scene_id TEXT, tag_id TEXT, PRIMARY KEY (scene_id, tag_id));
    CREATE TABLE scene_notes (id TEXT PRIMARY KEY, scene_id TEXT, content TEXT DEFAULT '', display_order INTEGER DEFAULT 0);
    CREATE TABLE scene_connections (id TEXT PRIMARY KEY, source_scene_id TEXT, target_scene_id TEXT, label TEXT);
    CREATE TABLE scene_dates (scene_id TEXT PRIMARY KEY, date TEXT, end_date TEXT);
    CREATE TABLE scene_comments (id TEXT PRIMARY KEY, scene_id TEXT, text TEXT DEFAULT '', created_at INTEGER);
    CREATE TABLE scene_scratchpads (scene_id TEXT PRIMARY KEY, content TEXT DEFAULT '', updated_at INTEGER);
    CREATE TABLE scene_drafts (id TEXT PRIMARY KEY, scene_id TEXT, content TEXT DEFAULT '', updated_at INTEGER);
    CREATE TABLE metadata_field_defs (id TEXT PRIMARY KEY, label TEXT, field_type TEXT DEFAULT 'text', options TEXT, option_colors TEXT, display_order INTEGER DEFAULT 0);
    CREATE TABLE scene_metadata_values (scene_id TEXT, field_def_id TEXT, value TEXT DEFAULT '""', PRIMARY KEY (scene_id, field_def_id));
    CREATE TABLE world_events (id TEXT PRIMARY KEY, title TEXT, date TEXT, end_date TEXT, description TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, content TEXT DEFAULT '', parent_id TEXT, display_order INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE note_tags (note_id TEXT, tag_id TEXT, PRIMARY KEY (note_id, tag_id));
    CREATE TABLE note_links (source_note_id TEXT, target_note_id TEXT, PRIMARY KEY (source_note_id, target_note_id));
    CREATE TABLE note_scene_links (note_id TEXT, scene_id TEXT, PRIMARY KEY (note_id, scene_id));
  `);

  db.prepare('INSERT INTO project VALUES (?,?,?,?,?)').run('project', 'Test Novel', 50000, 1, 1);

  db.prepare('INSERT INTO characters VALUES (?,?,?,?,?)').run('noah', 'Noah', '#ff0000', 0, 1);
  db.prepare('INSERT INTO characters VALUES (?,?,?,?,?)').run('grace', 'Grace', '#00ff00', 1, 1);

  db.prepare('INSERT INTO plot_points VALUES (?,?,?,?,?,?,?)').run('pp1', 'noah', 'Hook', 'The hook section', 1, 0, 1);

  db.prepare('INSERT INTO tags VALUES (?,?,?)').run('t_mexico', 'Mexico', 'location');

  // Scene 1: braided, tagged, highlighted, with a note + draft
  db.prepare(
    `INSERT INTO scenes (id, character_id, plot_point_id, title, synopsis, scene_number, timeline_position, is_highlighted, word_count, chapter_id, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('s1', 'noah', 'pp1', 'Noah intro', 'Noah chases Miguel through Mexico', 1, 0, 1, 1200, 'ch1', null);
  // Scene 2: unbraided
  db.prepare(
    `INSERT INTO scenes (id, character_id, plot_point_id, title, synopsis, scene_number, timeline_position, is_highlighted, word_count, chapter_id, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('s2', 'grace', null, 'Grace at the park', 'Grace meets a stranger', 1, null, 0, 800, null, null);
  // Scene 3: soft-deleted — must be excluded
  db.prepare(
    `INSERT INTO scenes (id, character_id, plot_point_id, title, synopsis, scene_number, timeline_position, is_highlighted, word_count, chapter_id, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('s3', 'noah', null, 'Deleted scene', '', 2, 5, 0, 999, null, 12345);

  db.prepare('INSERT INTO chapters VALUES (?,?,?,?)').run('ch1', 'Chapter One', 0, null);
  db.prepare('INSERT INTO scene_tags VALUES (?,?)').run('s1', 't_mexico');
  db.prepare('INSERT INTO scene_notes VALUES (?,?,?,?)').run('n1', 's1', 'Remember the rosary motif', 0);
  db.prepare('INSERT INTO scene_connections VALUES (?,?,?,?)').run('conn1', 's1', 's2', 'leads to');
  db.prepare('INSERT INTO scene_dates VALUES (?,?,?)').run('s1', '1453-05-29', '1453-05-30');
  db.prepare('INSERT INTO scene_comments VALUES (?,?,?,?)').run('cm1', 's1', 'Needs more tension', 100);
  db.prepare('INSERT INTO scene_scratchpads VALUES (?,?,?)').run('s1', 'scratch notes here', 1);
  db.prepare('INSERT INTO scene_drafts VALUES (?,?,?,?)').run('d1', 's1', '<p>The draft prose.</p>', 1);

  db.prepare('INSERT INTO metadata_field_defs VALUES (?,?,?,?,?,?)').run('_status', 'Status', 'dropdown', '["V1","V2"]', null, 0);
  db.prepare('INSERT INTO scene_metadata_values VALUES (?,?,?)').run('s1', '_status', '"V1"');

  db.prepare('INSERT INTO world_events VALUES (?,?,?,?,?,?,?)').run('we1', 'Fall of Constantinople', '1453-05-29', null, 'The city falls', 1, 1);

  db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?)').run('note1', 'Worldbuilding', '<p>Note body content</p>', null, 0, 1, 2);
  db.prepare('INSERT INTO note_tags VALUES (?,?)').run('note1', 't_mexico');
  db.prepare('INSERT INTO note_scene_links VALUES (?,?)').run('note1', 's1');

  db.close();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-mcp-test-'));
  dbPath = path.join(dir, 'Test Novel.braidr');
  buildFixture(dbPath);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('loadProject (SQLite)', () => {
  it('loads project name and word count goal', async () => {
    const data = await loadProject(dbPath);
    expect(data.projectName).toBe('Test Novel');
    expect(data.timeline.wordCountGoal).toBe(50000);
  });

  it('loads characters with colors', async () => {
    const data = await loadProject(dbPath);
    expect(data.characters).toHaveLength(2);
    const noah = data.characters.find((c) => c.id === 'noah');
    expect(noah?.name).toBe('Noah');
    expect(noah?.color).toBe('#ff0000');
  });

  it('excludes soft-deleted scenes', async () => {
    const data = await loadProject(dbPath);
    expect(data.scenes.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('maps scene fields including synopsis->content, tags, notes, highlight', async () => {
    const data = await loadProject(dbPath);
    const s1 = data.scenes.find((s) => s.id === 's1')!;
    expect(s1.content).toBe('Noah chases Miguel through Mexico');
    expect(s1.tags).toEqual(['mexico']); // lowercased
    expect(s1.notes).toEqual(['Remember the rosary motif']);
    expect(s1.isHighlighted).toBe(true);
    expect(s1.timelinePosition).toBe(0);
    expect(s1.plotPointId).toBe('pp1');
    expect(s1.wordCount).toBe(1200);
  });

  it('loads plot points', async () => {
    const data = await loadProject(dbPath);
    expect(data.plotPoints).toHaveLength(1);
    expect(data.plotPoints[0]).toMatchObject({
      id: 'pp1',
      characterId: 'noah',
      title: 'Hook',
      description: 'The hook section',
      expectedSceneCount: 1,
      order: 0,
    });
  });

  it('builds timeline positions, word counts, connections', async () => {
    const data = await loadProject(dbPath);
    expect(data.timeline.positions).toEqual({ s1: 0 });
    expect(data.timeline.wordCounts).toMatchObject({ s1: 1200, s2: 800 });
    expect(data.timeline.connections).toEqual({ s1: ['s2'] });
  });

  it('derives chapter beforePosition from earliest braided scene', async () => {
    const data = await loadProject(dbPath);
    expect(data.timeline.chapters).toEqual([
      { id: 'ch1', title: 'Chapter One', beforePosition: 0 },
    ]);
  });

  it('loads metadata defs (dropdown->select) and values', async () => {
    const data = await loadProject(dbPath);
    expect(data.timeline.metadataFieldDefs).toEqual([
      { id: '_status', name: 'Status', type: 'select', options: ['V1', 'V2'] },
    ]);
    expect(data.timeline.sceneMetadata).toEqual({ s1: { _status: 'V1' } });
  });

  it('loads dates, comments, scratchpad, world events', async () => {
    const data = await loadProject(dbPath);
    expect(data.timeline.timelineDates).toEqual({ s1: '1453-05-29' });
    expect(data.timeline.timelineEndDates).toEqual({ s1: '1453-05-30' });
    expect(data.timeline.sceneComments?.s1?.[0]?.text).toBe('Needs more tension');
    expect(data.timeline.scratchpad).toEqual({ s1: 'scratch notes here' });
    expect(data.timeline.worldEvents?.[0]?.title).toBe('Fall of Constantinople');
  });

  it('builds the notes index with tags and scene links', async () => {
    const data = await loadProject(dbPath);
    expect(data.notesIndex?.notes).toHaveLength(1);
    const note = data.notesIndex!.notes[0];
    expect(note.title).toBe('Worldbuilding');
    expect(note.fileName).toBe('note1'); // id used as lookup key
    expect(note.tags).toEqual(['mexico']);
    expect(note.sceneLinks).toEqual(['s1']);
  });
});

describe('loadNoteContent (SQLite)', () => {
  it('reads note HTML by id', async () => {
    const content = await loadNoteContent(dbPath, 'note1');
    expect(content).toBe('<p>Note body content</p>');
  });

  it('returns null for unknown id', async () => {
    expect(await loadNoteContent(dbPath, 'nope')).toBeNull();
  });
});

describe('getDraftProse', () => {
  it('returns draft content from the timeline', async () => {
    const data = await loadProject(dbPath);
    expect(getDraftProse(data.timeline, 's1')).toBe('<p>The draft prose.</p>');
    expect(getDraftProse(data.timeline, 's2')).toBeNull();
  });
});
