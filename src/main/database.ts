import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const SCHEMA_VERSION = 1;

const CREATE_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY DEFAULT 'project',
    name TEXT NOT NULL,
    word_count_goal INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plot_points (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    expected_scene_count INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS acts (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    starting_state TEXT NOT NULL DEFAULT '',
    ending_state TEXT NOT NULL DEFAULT '',
    polarity TEXT NOT NULL DEFAULT '',
    transformation TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS character_psychology (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    novel_starting_state TEXT NOT NULL DEFAULT '',
    novel_ending_state TEXT NOT NULL DEFAULT '',
    novel_polarity TEXT NOT NULL DEFAULT '',
    novel_transformation TEXT NOT NULL DEFAULT '',
    wound TEXT NOT NULL DEFAULT '',
    lie TEXT NOT NULL DEFAULT '',
    deepest_fear TEXT NOT NULL DEFAULT '',
    limiting_belief TEXT NOT NULL DEFAULT '',
    thorn TEXT NOT NULL DEFAULT '',
    coping_tool TEXT NOT NULL DEFAULT '',
    whisper_of_grace TEXT NOT NULL DEFAULT '',
    surface_want TEXT NOT NULL DEFAULT '',
    souls_longing TEXT NOT NULL DEFAULT '',
    bitter_need TEXT NOT NULL DEFAULT '',
    capital_t_truth TEXT NOT NULL DEFAULT '',
    arc_summary TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT '',
    anti_theme TEXT NOT NULL DEFAULT '',
    final_reader_experience TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    plot_point_id TEXT REFERENCES plot_points(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT '',
    synopsis TEXT NOT NULL DEFAULT '',
    scene_number INTEGER NOT NULL DEFAULT 0,
    timeline_position INTEGER,
    is_highlighted INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    scene_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scene_drafts (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL UNIQUE REFERENCES scenes(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scene_draft_versions (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    saved_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scene_scratchpads (
    scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scene_notes (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scene_comments (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scene_connections (
    id TEXT PRIMARY KEY,
    source_scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    target_scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    label TEXT
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    ord         INTEGER NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS braided_chapters (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    before_position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'things'
  );

  CREATE TABLE IF NOT EXISTS scene_tags (
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (scene_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS metadata_field_defs (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    options TEXT,
    option_colors TEXT,
    display_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scene_metadata_values (
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    field_def_id TEXT NOT NULL REFERENCES metadata_field_defs(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '""',
    PRIMARY KEY (scene_id, field_def_id)
  );

  CREATE TABLE IF NOT EXISTS scene_dates (
    scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    end_date TEXT
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    parent_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS note_links (
    source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_note_id, target_note_id)
  );

  CREATE TABLE IF NOT EXISTS note_scene_links (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, scene_id)
  );

  CREATE TABLE IF NOT EXISTS world_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    end_date TEXT,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS world_event_tags (
    event_id TEXT NOT NULL REFERENCES world_events(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS world_event_scene_links (
    event_id TEXT NOT NULL REFERENCES world_events(id) ON DELETE CASCADE,
    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, scene_id)
  );

  CREATE TABLE IF NOT EXISTS world_event_note_links (
    event_id TEXT NOT NULL REFERENCES world_events(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, note_id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'none',
    scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
    time_estimate INTEGER,
    due_date INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS task_character_links (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, character_id)
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS task_field_defs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    options TEXT,
    display_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS task_custom_field_values (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    field_def_id TEXT NOT NULL REFERENCES task_field_defs(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '""',
    PRIMARY KEY (task_id, field_def_id)
  );

  CREATE TABLE IF NOT EXISTS writing_sessions (
    id TEXT PRIMARY KEY,
    scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    word_count_delta INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS archived_scenes (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    original_plot_point_id TEXT,
    original_scene_number INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    synopsis TEXT NOT NULL DEFAULT '',
    draft_content TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '[]',
    is_highlighted INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER,
    archived_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS archived_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    parent_id TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    archived_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS table_views (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_from TEXT REFERENCES branches(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS branch_scene_snapshots (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    scene_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    plot_point_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    synopsis TEXT NOT NULL DEFAULT '',
    draft_content TEXT,
    scene_number INTEGER NOT NULL DEFAULT 0,
    timeline_position INTEGER,
    is_highlighted INTEGER NOT NULL DEFAULT 0
  );
`;

export class BraidrDB {
  private db: Database.Database;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.db = new Database(filePath);
    this.initialize();
  }

  private initialize() {
    // WAL mode gives crash safety (main file is never written mid-transaction).
    // We checkpoint after every save so iCloud always sees the main file as current.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(CREATE_SCHEMA);
    this.migrate();

    const row = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
    if (!row) {
      this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    }
  }

  private migrate() {
    const sceneColumns = (
      this.db.prepare('PRAGMA table_info(scenes)').all() as { name: string }[]
    ).map(c => c.name);

    if (!sceneColumns.includes('chapter_id')) {
      this.db.exec(
        'ALTER TABLE scenes ADD COLUMN chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL'
      );
    }
    if (!sceneColumns.includes('scene_order')) {
      this.db.exec(
        'ALTER TABLE scenes ADD COLUMN scene_order INTEGER NOT NULL DEFAULT 0'
      );
    }

    // Drop legacy positional chapters table — no data is migrated
    this.db.exec('DROP TABLE IF EXISTS braided_chapters');

    // Arc fields on plot_points
    const ppColumns = (
      this.db.prepare('PRAGMA table_info(plot_points)').all() as { name: string }[]
    ).map(c => c.name);
    if (!ppColumns.includes('act_id')) {
      this.db.exec('ALTER TABLE plot_points ADD COLUMN act_id TEXT REFERENCES acts(id) ON DELETE SET NULL');
    }
    if (!ppColumns.includes('starting_state')) {
      this.db.exec("ALTER TABLE plot_points ADD COLUMN starting_state TEXT NOT NULL DEFAULT ''");
    }
    if (!ppColumns.includes('ending_state')) {
      this.db.exec("ALTER TABLE plot_points ADD COLUMN ending_state TEXT NOT NULL DEFAULT ''");
    }
    if (!ppColumns.includes('polarity')) {
      this.db.exec("ALTER TABLE plot_points ADD COLUMN polarity TEXT NOT NULL DEFAULT ''");
    }
    if (!ppColumns.includes('transformation')) {
      this.db.exec("ALTER TABLE plot_points ADD COLUMN transformation TEXT NOT NULL DEFAULT ''");
    }

    // Arc fields on scenes
    if (!sceneColumns.includes('polarity')) {
      this.db.exec("ALTER TABLE scenes ADD COLUMN polarity TEXT NOT NULL DEFAULT ''");
    }
    if (!sceneColumns.includes('transformation')) {
      this.db.exec("ALTER TABLE scenes ADD COLUMN transformation TEXT NOT NULL DEFAULT ''");
    }

    // Dilemma + Propelling Action fields
    if (!ppColumns.includes('dilemma')) {
      this.db.exec("ALTER TABLE plot_points ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''");
    }
    if (!ppColumns.includes('propelling_action')) {
      this.db.exec("ALTER TABLE plot_points ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''");
    }
    const actColumns = (
      this.db.prepare('PRAGMA table_info(acts)').all() as { name: string }[]
    ).map(c => c.name);
    if (!actColumns.includes('dilemma')) {
      this.db.exec("ALTER TABLE acts ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''");
    }
    if (!actColumns.includes('propelling_action')) {
      this.db.exec("ALTER TABLE acts ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''");
    }
    const psychColumns = (
      this.db.prepare('PRAGMA table_info(character_psychology)').all() as { name: string }[]
    ).map(c => c.name);
    if (!psychColumns.includes('novel_dilemma')) {
      this.db.exec("ALTER TABLE character_psychology ADD COLUMN novel_dilemma TEXT NOT NULL DEFAULT ''");
    }
    if (!psychColumns.includes('novel_propelling_action')) {
      this.db.exec("ALTER TABLE character_psychology ADD COLUMN novel_propelling_action TEXT NOT NULL DEFAULT ''");
    }
    if (!sceneColumns.includes('dilemma')) {
      this.db.exec("ALTER TABLE scenes ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''");
    }
    if (!sceneColumns.includes('propelling_action')) {
      this.db.exec("ALTER TABLE scenes ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''");
    }
    if (!sceneColumns.includes('starting_state')) {
      this.db.exec("ALTER TABLE scenes ADD COLUMN starting_state TEXT NOT NULL DEFAULT ''");
    }
    if (!sceneColumns.includes('ending_state')) {
      this.db.exec("ALTER TABLE scenes ADD COLUMN ending_state TEXT NOT NULL DEFAULT ''");
    }
  }

  get path() { return this.filePath; }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  checkpoint() {
    this.db.pragma('wal_checkpoint(FULL)');
  }

  backup(destPath: string): Promise<unknown> {
    return this.db.backup(destPath);
  }

  close() {
    // Switch back to DELETE mode, which forces a full WAL checkpoint and removes
    // the -wal/-shm files, so iCloud only needs to sync the single .braidr file.
    try { this.db.pragma('journal_mode = DELETE'); } catch { /* non-fatal */ }
    this.db.close();
  }

  // ── Project ──────────────────────────────────────────────────────────────

  getProject() {
    return this.db.prepare('SELECT * FROM project WHERE id = ?').get('project') as ProjectRow | undefined;
  }

  upsertProject(name: string, wordCountGoal: number | null) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO project (id, name, word_count_goal, created_at, updated_at)
      VALUES ('project', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name,
        word_count_goal = excluded.word_count_goal, updated_at = excluded.updated_at
    `).run(name, wordCountGoal, now, now);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string) {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  // ── Characters ────────────────────────────────────────────────────────────

  getCharacters() {
    return this.db.prepare('SELECT * FROM characters ORDER BY display_order').all() as CharacterRow[];
  }

  insertCharacter(id: string, name: string, color: string | null, displayOrder: number) {
    this.db.prepare('INSERT INTO characters (id, name, color, display_order, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, color, displayOrder, Date.now());
  }

  updateCharacter(id: string, name: string, color: string | null, displayOrder: number) {
    this.db.prepare('UPDATE characters SET name = ?, color = ?, display_order = ? WHERE id = ?').run(name, color, displayOrder, id);
  }

  deleteCharacter(id: string) {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  }

  // ── Plot Points ───────────────────────────────────────────────────────────

  getPlotPoints(characterId?: string) {
    if (characterId) {
      return this.db.prepare('SELECT * FROM plot_points WHERE character_id = ? ORDER BY display_order').all(characterId) as PlotPointRow[];
    }
    return this.db.prepare('SELECT * FROM plot_points ORDER BY display_order').all() as PlotPointRow[];
  }

  insertPlotPoint(id: string, characterId: string, title: string, description: string | null, expectedSceneCount: number | null, displayOrder: number, actId: string | null = null, startingState = '', endingState = '', polarity = '', transformation = '', dilemma = '', propellingAction = '') {
    this.db.prepare(`
      INSERT INTO plot_points (id, character_id, title, description, expected_scene_count, display_order, act_id, starting_state, ending_state, polarity, transformation, dilemma, propelling_action, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, characterId, title, description, expectedSceneCount, displayOrder, actId, startingState, endingState, polarity, transformation, dilemma, propellingAction, Date.now());
  }

  updatePlotPoint(id: string, fields: Partial<{ title: string; description: string | null; expectedSceneCount: number | null; displayOrder: number; actId: string | null; startingState: string; endingState: string; polarity: string; transformation: string; dilemma: string; propellingAction: string }>) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if ('title' in fields)             { updates.push('title = ?');              values.push(fields.title); }
    if ('description' in fields)       { updates.push('description = ?');        values.push(fields.description); }
    if ('expectedSceneCount' in fields){ updates.push('expected_scene_count = ?'); values.push(fields.expectedSceneCount); }
    if ('displayOrder' in fields)      { updates.push('display_order = ?');      values.push(fields.displayOrder); }
    if ('actId' in fields)             { updates.push('act_id = ?');             values.push(fields.actId); }
    if ('startingState' in fields)     { updates.push('starting_state = ?');     values.push(fields.startingState); }
    if ('endingState' in fields)       { updates.push('ending_state = ?');       values.push(fields.endingState); }
    if ('polarity' in fields)          { updates.push('polarity = ?');           values.push(fields.polarity); }
    if ('transformation' in fields)    { updates.push('transformation = ?');     values.push(fields.transformation); }
    if ('dilemma' in fields)           { updates.push('dilemma = ?');            values.push(fields.dilemma); }
    if ('propellingAction' in fields)  { updates.push('propelling_action = ?');  values.push(fields.propellingAction); }
    if (updates.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE plot_points SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  deletePlotPoint(id: string) {
    this.db.prepare('DELETE FROM plot_points WHERE id = ?').run(id);
  }

  // ── Scenes ────────────────────────────────────────────────────────────────

  getScenes(characterId?: string) {
    if (characterId) {
      return this.db.prepare('SELECT * FROM scenes WHERE character_id = ? ORDER BY scene_number').all(characterId) as SceneRow[];
    }
    return this.db.prepare('SELECT * FROM scenes ORDER BY scene_number').all() as SceneRow[];
  }

  getScene(id: string) {
    return this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as SceneRow | undefined;
  }

  insertScene(id: string, characterId: string, plotPointId: string | null, title: string, synopsis: string, sceneNumber: number, timelinePosition: number | null, isHighlighted: boolean, wordCount: number | null) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO scenes (id, character_id, plot_point_id, title, synopsis, scene_number, timeline_position, is_highlighted, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, characterId, plotPointId, title, synopsis, sceneNumber, timelinePosition, isHighlighted ? 1 : 0, wordCount, now, now);
    this.db.prepare('INSERT INTO scene_drafts (id, scene_id, content, updated_at) VALUES (?, ?, ?, ?)').run(randomId(), id, '', now);
  }

  updateScene(id: string, fields: Partial<{
    title: string; synopsis: string; sceneNumber: number;
    timelinePosition: number | null; isHighlighted: boolean;
    wordCount: number | null; plotPointId: string | null;
    chapterId: string | null; sceneOrder: number;
    polarity: string; transformation: string; dilemma: string; propellingAction: string;
    startingState: string; endingState: string;
  }>) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if ('title' in fields)             { updates.push('title = ?');              values.push(fields.title); }
    if ('synopsis' in fields)          { updates.push('synopsis = ?');           values.push(fields.synopsis); }
    if ('sceneNumber' in fields)       { updates.push('scene_number = ?');       values.push(fields.sceneNumber); }
    if ('timelinePosition' in fields)  { updates.push('timeline_position = ?');  values.push(fields.timelinePosition); }
    if ('isHighlighted' in fields)     { updates.push('is_highlighted = ?');     values.push(fields.isHighlighted ? 1 : 0); }
    if ('wordCount' in fields)         { updates.push('word_count = ?');         values.push(fields.wordCount); }
    if ('plotPointId' in fields)       { updates.push('plot_point_id = ?');      values.push(fields.plotPointId); }
    if ('chapterId' in fields)         { updates.push('chapter_id = ?');         values.push(fields.chapterId); }
    if ('sceneOrder' in fields)        { updates.push('scene_order = ?');        values.push(fields.sceneOrder); }
    if ('polarity' in fields)          { updates.push('polarity = ?');           values.push(fields.polarity); }
    if ('transformation' in fields)    { updates.push('transformation = ?');     values.push(fields.transformation); }
    if ('dilemma' in fields)           { updates.push('dilemma = ?');            values.push(fields.dilemma); }
    if ('propellingAction' in fields)  { updates.push('propelling_action = ?');  values.push(fields.propellingAction); }
    if ('startingState' in fields)     { updates.push('starting_state = ?');     values.push(fields.startingState); }
    if ('endingState' in fields)       { updates.push('ending_state = ?');       values.push(fields.endingState); }
    if (updates.length === 0) return;
    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    this.db.prepare(`UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteScene(id: string) {
    this.db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  }

  // ── Scene Drafts ──────────────────────────────────────────────────────────

  getDraft(sceneId: string) {
    return this.db.prepare('SELECT content FROM scene_drafts WHERE scene_id = ?').get(sceneId) as { content: string } | undefined;
  }

  upsertDraft(sceneId: string, content: string) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO scene_drafts (id, scene_id, content, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(scene_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(randomId(), sceneId, content, now);
  }

  // ── Scene Draft Versions ──────────────────────────────────────────────────

  getDraftVersions(sceneId: string) {
    return this.db.prepare('SELECT * FROM scene_draft_versions WHERE scene_id = ? ORDER BY version DESC').all(sceneId) as DraftVersionRow[];
  }

  insertDraftVersion(sceneId: string, content: string) {
    const last = this.db.prepare('SELECT MAX(version) as v FROM scene_draft_versions WHERE scene_id = ?').get(sceneId) as { v: number | null };
    const version = (last.v ?? 0) + 1;
    this.db.prepare('INSERT INTO scene_draft_versions (id, scene_id, version, content, saved_at) VALUES (?, ?, ?, ?, ?)').run(randomId(), sceneId, version, content, Date.now());
    return version;
  }

  replaceDraftVersions(sceneId: string, versions: { id: string; version: number; content: string; saved_at: number }[]) {
    this.db.prepare('DELETE FROM scene_draft_versions WHERE scene_id = ?').run(sceneId);
    const insert = this.db.prepare('INSERT INTO scene_draft_versions (id, scene_id, version, content, saved_at) VALUES (?, ?, ?, ?, ?)');
    for (const v of versions) {
      insert.run(v.id, sceneId, v.version, v.content, v.saved_at);
    }
  }

  // ── Scratchpads ───────────────────────────────────────────────────────────

  getScratchpad(sceneId: string) {
    return this.db.prepare('SELECT content FROM scene_scratchpads WHERE scene_id = ?').get(sceneId) as { content: string } | undefined;
  }

  upsertScratchpad(sceneId: string, content: string) {
    this.db.prepare(`
      INSERT INTO scene_scratchpads (scene_id, content, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(scene_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(sceneId, content, Date.now());
  }

  // ── Scene Notes ───────────────────────────────────────────────────────────

  getSceneNotes(sceneId: string) {
    return this.db.prepare('SELECT * FROM scene_notes WHERE scene_id = ? ORDER BY display_order').all(sceneId) as SceneNoteRow[];
  }

  replaceSceneNotes(sceneId: string, notes: string[]) {
    this.db.prepare('DELETE FROM scene_notes WHERE scene_id = ?').run(sceneId);
    const insert = this.db.prepare('INSERT INTO scene_notes (id, scene_id, content, display_order) VALUES (?, ?, ?, ?)');
    notes.forEach((content, i) => insert.run(randomId(), sceneId, content, i));
  }

  // ── Scene Comments ────────────────────────────────────────────────────────

  getSceneComments(sceneId: string) {
    return this.db.prepare('SELECT * FROM scene_comments WHERE scene_id = ? ORDER BY created_at').all(sceneId) as SceneCommentRow[];
  }

  replaceSceneComments(sceneId: string, comments: { id: string; text: string; created_at: number }[]) {
    this.db.prepare('DELETE FROM scene_comments WHERE scene_id = ?').run(sceneId);
    const insert = this.db.prepare('INSERT INTO scene_comments (id, scene_id, text, created_at) VALUES (?, ?, ?, ?)');
    for (const c of comments) insert.run(c.id, sceneId, c.text, c.created_at);
  }

  // ── Scene Connections ─────────────────────────────────────────────────────

  getSceneConnections() {
    return this.db.prepare('SELECT * FROM scene_connections').all() as SceneConnectionRow[];
  }

  replaceSceneConnections(connections: { id: string; source_scene_id: string; target_scene_id: string; label: string | null }[]) {
    this.db.prepare('DELETE FROM scene_connections').run();
    const insert = this.db.prepare('INSERT INTO scene_connections (id, source_scene_id, target_scene_id, label) VALUES (?, ?, ?, ?)');
    for (const c of connections) insert.run(c.id, c.source_scene_id, c.target_scene_id, c.label);
  }

  // ── Chapters ──────────────────────────────────────────────────────────────

  getChapters() {
    return this.db.prepare('SELECT * FROM chapters ORDER BY ord').all() as ChapterRow[];
  }

  saveChapter(chapter: { id: string; title: string; order: number; description?: string }) {
    this.db.prepare(`
      INSERT INTO chapters (id, title, ord, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        ord   = excluded.ord,
        description = excluded.description
    `).run(chapter.id, chapter.title, chapter.order, chapter.description ?? null);
  }

  deleteChapter(id: string) {
    // scenes.chapter_id → NULL via ON DELETE SET NULL FK
    this.db.prepare('DELETE FROM chapters WHERE id = ?').run(id);
  }

  reorderChapters(orderedIds: string[]) {
    const update = this.db.prepare('UPDATE chapters SET ord = ? WHERE id = ?');
    this.db.transaction(() => {
      orderedIds.forEach((id, idx) => update.run(idx, id));
    })();
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  getTags() {
    return this.db.prepare('SELECT * FROM tags ORDER BY name').all() as TagRow[];
  }

  upsertTag(id: string, name: string, category: string) {
    this.db.prepare('INSERT INTO tags (id, name, category) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET category = excluded.category').run(id, name, category);
    return (this.db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string }).id;
  }

  getSceneTags(sceneId: string) {
    return this.db.prepare('SELECT t.* FROM tags t JOIN scene_tags st ON st.tag_id = t.id WHERE st.scene_id = ?').all(sceneId) as TagRow[];
  }

  replaceSceneTags(sceneId: string, tagIds: string[]) {
    this.db.prepare('DELETE FROM scene_tags WHERE scene_id = ?').run(sceneId);
    const insert = this.db.prepare('INSERT INTO scene_tags (scene_id, tag_id) VALUES (?, ?)');
    for (const tid of tagIds) insert.run(sceneId, tid);
  }

  // ── Metadata Field Defs ───────────────────────────────────────────────────

  getMetadataFieldDefs() {
    return this.db.prepare('SELECT * FROM metadata_field_defs ORDER BY display_order').all() as MetadataFieldDefRow[];
  }

  replaceMetadataFieldDefs(defs: MetadataFieldDefRow[]) {
    this.db.prepare('DELETE FROM metadata_field_defs').run();
    const insert = this.db.prepare('INSERT INTO metadata_field_defs (id, label, field_type, options, option_colors, display_order) VALUES (?, ?, ?, ?, ?, ?)');
    for (const d of defs) insert.run(d.id, d.label, d.field_type, d.options, d.option_colors, d.display_order);
  }

  getSceneMetadataValues(sceneId: string) {
    return this.db.prepare('SELECT * FROM scene_metadata_values WHERE scene_id = ?').all(sceneId) as SceneMetadataValueRow[];
  }

  replaceSceneMetadataValues(sceneId: string, values: { field_def_id: string; value: string }[]) {
    this.db.prepare('DELETE FROM scene_metadata_values WHERE scene_id = ?').run(sceneId);
    const insert = this.db.prepare('INSERT INTO scene_metadata_values (scene_id, field_def_id, value) VALUES (?, ?, ?)');
    for (const v of values) insert.run(sceneId, v.field_def_id, v.value);
  }

  getAllSceneMetadataValues() {
    return this.db.prepare('SELECT * FROM scene_metadata_values').all() as SceneMetadataValueRow[];
  }

  // ── Table Views ───────────────────────────────────────────────────────────

  getTableViews(): TableViewRow[] {
    return this.db.prepare('SELECT * FROM table_views ORDER BY created_at ASC').all() as TableViewRow[];
  }

  saveTableViews(views: TableViewRow[]) {
    this.db.prepare('DELETE FROM table_views').run();
    const insert = this.db.prepare('INSERT INTO table_views (id, name, config_json, created_at) VALUES (?, ?, ?, ?)');
    for (const v of views) insert.run(v.id, v.name, v.config_json, v.created_at);
  }

  // ── Acts ─────────────────────────────────────────────────────────────────────

  getActs(characterId: string): ActRow[] {
    return this.db.prepare('SELECT * FROM acts WHERE character_id = ? ORDER BY display_order').all(characterId) as ActRow[];
  }

  getAllActs(): ActRow[] {
    return this.db.prepare('SELECT * FROM acts ORDER BY character_id, display_order').all() as ActRow[];
  }

  upsertAct(row: ActRow) {
    this.db.prepare(`
      INSERT INTO acts (id, character_id, name, starting_state, ending_state, polarity, transformation, dilemma, propelling_action, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, starting_state = excluded.starting_state,
        ending_state = excluded.ending_state, polarity = excluded.polarity,
        transformation = excluded.transformation, dilemma = excluded.dilemma,
        propelling_action = excluded.propelling_action, display_order = excluded.display_order
    `).run(row.id, row.character_id, row.name, row.starting_state, row.ending_state, row.polarity, row.transformation, row.dilemma, row.propelling_action, row.display_order, row.created_at);
  }

  deleteAct(id: string) {
    this.db.prepare('DELETE FROM acts WHERE id = ?').run(id);
  }

  reorderActs(characterId: string, orderedIds: string[]) {
    const update = this.db.prepare('UPDATE acts SET display_order = ? WHERE id = ?');
    orderedIds.forEach((id, i) => update.run(i, id));
  }

  // ── Character Psychology ──────────────────────────────────────────────────────

  getCharacterPsychology(characterId: string): CharacterPsychologyRow | undefined {
    return this.db.prepare('SELECT * FROM character_psychology WHERE character_id = ?').get(characterId) as CharacterPsychologyRow | undefined;
  }

  upsertCharacterPsychology(row: CharacterPsychologyRow) {
    this.db.prepare(`
      INSERT INTO character_psychology (character_id, novel_starting_state, novel_ending_state, novel_polarity, novel_transformation, novel_dilemma, novel_propelling_action, wound, lie, deepest_fear, limiting_belief, thorn, coping_tool, whisper_of_grace, surface_want, souls_longing, bitter_need, capital_t_truth, arc_summary, theme, anti_theme, final_reader_experience)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(character_id) DO UPDATE SET
        novel_starting_state = excluded.novel_starting_state, novel_ending_state = excluded.novel_ending_state,
        novel_polarity = excluded.novel_polarity, novel_transformation = excluded.novel_transformation,
        novel_dilemma = excluded.novel_dilemma, novel_propelling_action = excluded.novel_propelling_action,
        wound = excluded.wound, lie = excluded.lie, deepest_fear = excluded.deepest_fear,
        limiting_belief = excluded.limiting_belief, thorn = excluded.thorn, coping_tool = excluded.coping_tool,
        whisper_of_grace = excluded.whisper_of_grace, surface_want = excluded.surface_want,
        souls_longing = excluded.souls_longing, bitter_need = excluded.bitter_need,
        capital_t_truth = excluded.capital_t_truth, arc_summary = excluded.arc_summary,
        theme = excluded.theme, anti_theme = excluded.anti_theme,
        final_reader_experience = excluded.final_reader_experience
    `).run(
      row.character_id, row.novel_starting_state, row.novel_ending_state, row.novel_polarity, row.novel_transformation, row.novel_dilemma, row.novel_propelling_action,
      row.wound, row.lie, row.deepest_fear, row.limiting_belief, row.thorn, row.coping_tool,
      row.whisper_of_grace, row.surface_want, row.souls_longing, row.bitter_need,
      row.capital_t_truth, row.arc_summary, row.theme, row.anti_theme, row.final_reader_experience
    );
  }

  // ── Scene Dates ───────────────────────────────────────────────────────────

  getSceneDate(sceneId: string) {
    return this.db.prepare('SELECT * FROM scene_dates WHERE scene_id = ?').get(sceneId) as SceneDateRow | undefined;
  }

  getAllSceneDates() {
    return this.db.prepare('SELECT * FROM scene_dates').all() as SceneDateRow[];
  }

  upsertSceneDate(sceneId: string, date: string, endDate: string | null) {
    this.db.prepare(`
      INSERT INTO scene_dates (scene_id, date, end_date) VALUES (?, ?, ?)
      ON CONFLICT(scene_id) DO UPDATE SET date = excluded.date, end_date = excluded.end_date
    `).run(sceneId, date, endDate);
  }

  deleteSceneDate(sceneId: string) {
    this.db.prepare('DELETE FROM scene_dates WHERE scene_id = ?').run(sceneId);
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  getNotes() {
    return this.db.prepare('SELECT * FROM notes ORDER BY display_order').all() as NoteRow[];
  }

  getNote(id: string) {
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
  }

  insertNote(id: string, title: string, content: string, parentId: string | null, displayOrder: number) {
    const now = Date.now();
    this.db.prepare('INSERT INTO notes (id, title, content, parent_id, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, title, content, parentId, displayOrder, now, now);
  }

  updateNote(id: string, fields: Partial<{ title: string; content: string; parentId: string | null; displayOrder: number }>) {
    const updates: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];
    if ('title' in fields) { updates.push('title = ?'); values.push(fields.title); }
    if ('content' in fields) { updates.push('content = ?'); values.push(fields.content); }
    if ('parentId' in fields) { updates.push('parent_id = ?'); values.push(fields.parentId); }
    if ('displayOrder' in fields) { updates.push('display_order = ?'); values.push(fields.displayOrder); }
    values.push(id);
    this.db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteNote(id: string) {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }

  getNoteTags(noteId: string) {
    return this.db.prepare('SELECT t.* FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?').all(noteId) as TagRow[];
  }

  replaceNoteTags(noteId: string, tagIds: string[]) {
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
    const insert = this.db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)');
    for (const tid of tagIds) insert.run(noteId, tid);
  }

  getNoteLinks(noteId: string) {
    return this.db.prepare('SELECT target_note_id FROM note_links WHERE source_note_id = ?').all(noteId) as { target_note_id: string }[];
  }

  replaceNoteLinks(noteId: string, targetIds: string[]) {
    this.db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(noteId);
    const insert = this.db.prepare('INSERT OR IGNORE INTO note_links (source_note_id, target_note_id) VALUES (?, ?)');
    for (const tid of targetIds) insert.run(noteId, tid);
  }

  getNoteSceneLinks(noteId: string) {
    return this.db.prepare('SELECT scene_id FROM note_scene_links WHERE note_id = ?').all(noteId) as { scene_id: string }[];
  }

  replaceNoteSceneLinks(noteId: string, sceneIds: string[]) {
    this.db.prepare('DELETE FROM note_scene_links WHERE note_id = ?').run(noteId);
    const insert = this.db.prepare('INSERT OR IGNORE INTO note_scene_links (note_id, scene_id) VALUES (?, ?)');
    for (const sid of sceneIds) insert.run(noteId, sid);
  }

  // ── World Events ──────────────────────────────────────────────────────────

  getWorldEvents() {
    return this.db.prepare('SELECT * FROM world_events ORDER BY date').all() as WorldEventRow[];
  }

  insertWorldEvent(id: string, title: string, date: string, endDate: string | null, description: string) {
    const now = Date.now();
    this.db.prepare('INSERT INTO world_events (id, title, date, end_date, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, title, date, endDate, description, now, now);
  }

  updateWorldEvent(id: string, fields: Partial<{ title: string; date: string; endDate: string | null; description: string }>) {
    const updates: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];
    if ('title' in fields) { updates.push('title = ?'); values.push(fields.title); }
    if ('date' in fields) { updates.push('date = ?'); values.push(fields.date); }
    if ('endDate' in fields) { updates.push('end_date = ?'); values.push(fields.endDate); }
    if ('description' in fields) { updates.push('description = ?'); values.push(fields.description); }
    values.push(id);
    this.db.prepare(`UPDATE world_events SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteWorldEvent(id: string) {
    this.db.prepare('DELETE FROM world_events WHERE id = ?').run(id);
  }

  replaceWorldEventTags(eventId: string, tagIds: string[]) {
    this.db.prepare('DELETE FROM world_event_tags WHERE event_id = ?').run(eventId);
    const insert = this.db.prepare('INSERT OR IGNORE INTO world_event_tags (event_id, tag_id) VALUES (?, ?)');
    for (const tid of tagIds) insert.run(eventId, tid);
  }

  replaceWorldEventSceneLinks(eventId: string, sceneIds: string[]) {
    this.db.prepare('DELETE FROM world_event_scene_links WHERE event_id = ?').run(eventId);
    const insert = this.db.prepare('INSERT OR IGNORE INTO world_event_scene_links (event_id, scene_id) VALUES (?, ?)');
    for (const sid of sceneIds) insert.run(eventId, sid);
  }

  replaceWorldEventNoteLinks(eventId: string, noteIds: string[]) {
    this.db.prepare('DELETE FROM world_event_note_links WHERE event_id = ?').run(eventId);
    const insert = this.db.prepare('INSERT OR IGNORE INTO world_event_note_links (event_id, note_id) VALUES (?, ?)');
    for (const nid of noteIds) insert.run(eventId, nid);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  getTasks() {
    return this.db.prepare('SELECT * FROM tasks ORDER BY display_order').all() as TaskRow[];
  }

  insertTask(id: string, fields: {
    title: string; description: string | null; status: string; priority: string;
    sceneId: string | null; timeEstimate: number | null; dueDate: number | null; displayOrder: number;
  }) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, scene_id, time_estimate, due_date, display_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, fields.title, fields.description, fields.status, fields.priority, fields.sceneId, fields.timeEstimate, fields.dueDate, fields.displayOrder, now, now);
  }

  updateTask(id: string, fields: Partial<{
    title: string; description: string | null; status: string; priority: string;
    sceneId: string | null; timeEstimate: number | null; dueDate: number | null; displayOrder: number;
  }>) {
    const updates: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];
    if ('title' in fields) { updates.push('title = ?'); values.push(fields.title); }
    if ('description' in fields) { updates.push('description = ?'); values.push(fields.description); }
    if ('status' in fields) { updates.push('status = ?'); values.push(fields.status); }
    if ('priority' in fields) { updates.push('priority = ?'); values.push(fields.priority); }
    if ('sceneId' in fields) { updates.push('scene_id = ?'); values.push(fields.sceneId); }
    if ('timeEstimate' in fields) { updates.push('time_estimate = ?'); values.push(fields.timeEstimate); }
    if ('dueDate' in fields) { updates.push('due_date = ?'); values.push(fields.dueDate); }
    if ('displayOrder' in fields) { updates.push('display_order = ?'); values.push(fields.displayOrder); }
    values.push(id);
    this.db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteTask(id: string) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  replaceTaskTags(taskId: string, tagIds: string[]) {
    this.db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);
    const insert = this.db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
    for (const tid of tagIds) insert.run(taskId, tid);
  }

  replaceTaskCharacterLinks(taskId: string, characterIds: string[]) {
    this.db.prepare('DELETE FROM task_character_links WHERE task_id = ?').run(taskId);
    const insert = this.db.prepare('INSERT OR IGNORE INTO task_character_links (task_id, character_id) VALUES (?, ?)');
    for (const cid of characterIds) insert.run(taskId, cid);
  }

  getTimeEntries(taskId: string) {
    return this.db.prepare('SELECT * FROM time_entries WHERE task_id = ? ORDER BY started_at').all(taskId) as TimeEntryRow[];
  }

  replaceTimeEntries(taskId: string, entries: { id: string; started_at: number; duration: number; description: string | null }[]) {
    this.db.prepare('DELETE FROM time_entries WHERE task_id = ?').run(taskId);
    const insert = this.db.prepare('INSERT INTO time_entries (id, task_id, started_at, duration, description) VALUES (?, ?, ?, ?, ?)');
    for (const e of entries) insert.run(e.id, taskId, e.started_at, e.duration, e.description);
  }

  getTaskFieldDefs() {
    return this.db.prepare('SELECT * FROM task_field_defs ORDER BY display_order').all() as TaskFieldDefRow[];
  }

  replaceTaskFieldDefs(defs: TaskFieldDefRow[]) {
    this.db.prepare('DELETE FROM task_field_defs').run();
    const insert = this.db.prepare('INSERT INTO task_field_defs (id, name, field_type, options, display_order) VALUES (?, ?, ?, ?, ?)');
    for (const d of defs) insert.run(d.id, d.name, d.field_type, d.options, d.display_order);
  }

  getAllTaskCustomFieldValues() {
    return this.db.prepare('SELECT * FROM task_custom_field_values').all() as TaskCustomFieldValueRow[];
  }

  replaceTaskCustomFieldValues(taskId: string, values: { field_def_id: string; value: string }[]) {
    this.db.prepare('DELETE FROM task_custom_field_values WHERE task_id = ?').run(taskId);
    const insert = this.db.prepare('INSERT INTO task_custom_field_values (task_id, field_def_id, value) VALUES (?, ?, ?)');
    for (const v of values) insert.run(taskId, v.field_def_id, v.value);
  }

  // ── Writing Sessions ──────────────────────────────────────────────────────

  getWritingSessions() {
    return this.db.prepare('SELECT * FROM writing_sessions ORDER BY created_at DESC').all() as WritingSessionRow[];
  }

  insertWritingSession(id: string, sceneId: string | null, characterId: string, date: string, duration: number, wordCountDelta: number) {
    this.db.prepare('INSERT INTO writing_sessions (id, scene_id, character_id, date, duration, word_count_delta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, sceneId, characterId, date, duration, wordCountDelta, Date.now());
  }

  // ── Archived Scenes ───────────────────────────────────────────────────────

  getArchivedScenes() {
    return this.db.prepare('SELECT * FROM archived_scenes ORDER BY archived_at DESC').all() as ArchivedSceneRow[];
  }

  insertArchivedScene(row: ArchivedSceneRow) {
    this.db.prepare(`
      INSERT INTO archived_scenes (id, character_id, original_plot_point_id, original_scene_number, title, synopsis, draft_content, tags, notes, is_highlighted, word_count, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.character_id, row.original_plot_point_id, row.original_scene_number, row.title, row.synopsis, row.draft_content, row.tags, row.notes, row.is_highlighted, row.word_count, row.archived_at);
  }

  deleteArchivedScene(id: string) {
    this.db.prepare('DELETE FROM archived_scenes WHERE id = ?').run(id);
  }

  // ── Archived Notes ────────────────────────────────────────────────────────

  getArchivedNotes() {
    return this.db.prepare('SELECT * FROM archived_notes ORDER BY archived_at DESC').all() as ArchivedNoteRow[];
  }

  insertArchivedNote(row: ArchivedNoteRow) {
    this.db.prepare('INSERT INTO archived_notes (id, title, content, parent_id, tags, archived_at) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, row.title, row.content, row.parent_id, row.tags, row.archived_at);
  }

  // ── Branches ──────────────────────────────────────────────────────────────

  getBranches() {
    return this.db.prepare('SELECT * FROM branches ORDER BY created_at').all() as BranchRow[];
  }

  getActiveBranch() {
    return this.db.prepare('SELECT * FROM branches WHERE is_active = 1').get() as BranchRow | undefined;
  }

  insertBranch(id: string, name: string, description: string | null, createdFrom: string | null) {
    this.db.prepare('INSERT INTO branches (id, name, description, created_from, created_at, is_active) VALUES (?, ?, ?, ?, ?, 0)').run(id, name, description, createdFrom, Date.now());
  }

  setActiveBranch(id: string | null) {
    this.db.prepare('UPDATE branches SET is_active = 0').run();
    if (id) this.db.prepare('UPDATE branches SET is_active = 1 WHERE id = ?').run(id);
  }

  deleteBranch(id: string) {
    this.db.prepare('DELETE FROM branches WHERE id = ?').run(id);
  }

  getBranchSnapshots(branchId: string) {
    return this.db.prepare('SELECT * FROM branch_scene_snapshots WHERE branch_id = ?').all(branchId) as BranchSceneSnapshotRow[];
  }

  insertBranchSnapshot(row: BranchSceneSnapshotRow) {
    this.db.prepare(`
      INSERT INTO branch_scene_snapshots (id, branch_id, scene_id, character_id, plot_point_id, title, synopsis, draft_content, scene_number, timeline_position, is_highlighted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.branch_id, row.scene_id, row.character_id, row.plot_point_id, row.title, row.synopsis, row.draft_content, row.scene_number, row.timeline_position, row.is_highlighted);
  }

  clearBranchSnapshots(branchId: string) {
    this.db.prepare('DELETE FROM branch_scene_snapshots WHERE branch_id = ?').run(branchId);
  }
}

// ── Row types ─────────────────────────────────────────────────────────────────

export interface ProjectRow { id: string; name: string; word_count_goal: number | null; created_at: number; updated_at: number }
export interface CharacterRow { id: string; name: string; color: string | null; display_order: number; created_at: number }
export interface PlotPointRow {
  id: string; character_id: string; title: string; description: string | null;
  expected_scene_count: number | null; display_order: number; created_at: number;
  act_id: string | null;
  starting_state: string; ending_state: string; polarity: string; transformation: string; dilemma: string; propelling_action: string;
}
export interface ActRow {
  id: string; character_id: string; name: string;
  starting_state: string; ending_state: string; polarity: string; transformation: string; dilemma: string; propelling_action: string;
  display_order: number; created_at: number;
}

export interface CharacterPsychologyRow {
  character_id: string;
  novel_starting_state: string; novel_ending_state: string;
  novel_polarity: string; novel_transformation: string; novel_dilemma: string; novel_propelling_action: string;
  wound: string; lie: string; deepest_fear: string; limiting_belief: string;
  thorn: string; coping_tool: string; whisper_of_grace: string; surface_want: string;
  souls_longing: string; bitter_need: string; capital_t_truth: string;
  arc_summary: string; theme: string; anti_theme: string; final_reader_experience: string;
}

export interface ChapterRow { id: string; title: string; ord: number; description: string | null }
export interface SceneRow {
  id: string; character_id: string; plot_point_id: string | null;
  title: string; synopsis: string; scene_number: number;
  timeline_position: number | null; is_highlighted: number; word_count: number | null;
  chapter_id: string | null; scene_order: number;
  polarity: string; transformation: string; dilemma: string; propelling_action: string;
  starting_state: string; ending_state: string;
  created_at: number; updated_at: number
}
export interface DraftVersionRow { id: string; scene_id: string; version: number; content: string; saved_at: number }
export interface SceneNoteRow { id: string; scene_id: string; content: string; display_order: number }
export interface SceneCommentRow { id: string; scene_id: string; text: string; created_at: number }
export interface SceneConnectionRow { id: string; source_scene_id: string; target_scene_id: string; label: string | null }
export interface TagRow { id: string; name: string; category: string }
export interface MetadataFieldDefRow { id: string; label: string; field_type: string; options: string | null; option_colors: string | null; display_order: number }
export interface SceneMetadataValueRow { scene_id: string; field_def_id: string; value: string }
export interface SceneDateRow { scene_id: string; date: string; end_date: string | null }
export interface NoteRow { id: string; title: string; content: string; parent_id: string | null; display_order: number; created_at: number; updated_at: number }
export interface WorldEventRow { id: string; title: string; date: string; end_date: string | null; description: string; created_at: number; updated_at: number }
export interface TaskRow { id: string; title: string; description: string | null; status: string; priority: string; scene_id: string | null; time_estimate: number | null; due_date: number | null; display_order: number; created_at: number; updated_at: number }
export interface TimeEntryRow { id: string; task_id: string; started_at: number; duration: number; description: string | null }
export interface TaskFieldDefRow { id: string; name: string; field_type: string; options: string | null; display_order: number }
export interface TaskCustomFieldValueRow { task_id: string; field_def_id: string; value: string }
export interface WritingSessionRow { id: string; scene_id: string | null; character_id: string; date: string; duration: number; word_count_delta: number; created_at: number }
export interface ArchivedSceneRow { id: string; character_id: string; original_plot_point_id: string | null; original_scene_number: number; title: string; synopsis: string; draft_content: string | null; tags: string; notes: string; is_highlighted: number; word_count: number | null; archived_at: number }
export interface ArchivedNoteRow { id: string; title: string; content: string; parent_id: string | null; tags: string; archived_at: number }
export interface BranchRow { id: string; name: string; description: string | null; created_from: string | null; created_at: number; is_active: number }
export interface BranchSceneSnapshotRow { id: string; branch_id: string; scene_id: string; character_id: string; plot_point_id: string | null; title: string; synopsis: string; draft_content: string | null; scene_number: number; timeline_position: number | null; is_highlighted: number }
export interface TableViewRow { id: string; name: string; config_json: string; created_at: number }

function randomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// ── Module-level instance management ──────────────────────────────────────────

let openDbs = new Map<string, BraidrDB>();

export function openDatabase(filePath: string): BraidrDB {
  const existing = openDbs.get(filePath);
  if (existing) return existing;
  const db = new BraidrDB(filePath);
  openDbs.set(filePath, db);
  return db;
}

export function closeDatabase(filePath: string) {
  const db = openDbs.get(filePath);
  if (db) {
    db.close();
    openDbs.delete(filePath);
  }
}

export function closeAllDatabases() {
  for (const db of openDbs.values()) db.close();
  openDbs.clear();
}
