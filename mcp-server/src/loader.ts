// Data loader for the Braidr MCP server.
//
// Reads a Braidr SQLite project file (a `.braidr` file) and maps the relevant
// tables into the `ProjectData` shape consumed by the MCP tools. This replaces
// the legacy markdown-folder loader (.md outline files + timeline.json + notes
// index) after the app's migration to a single SQLite file per project.

import Database from 'better-sqlite3';
import type { Character, Scene, PlotPoint } from './parser.js';
import type {
  TimelineData,
  NotesIndex,
  NoteMetadata,
  BraidedChapter,
  MetadataFieldDef,
  SceneComment,
  WorldEvent,
  ProjectData,
} from './types.js';

type DB = Database.Database;

/** Open the project DB read-only so we never touch the user's live file/WAL. */
function openDb(braidrPath: string): DB {
  return new Database(braidrPath, { readonly: true, fileMustExist: true });
}

/** Safe JSON parse with a fallback. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Project display name fallback derived from the file path. */
function basenameNoExt(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? p;
  return base.replace(/\.braidr$/i, '');
}

/** Group rows into a Map<key, value[]> via accessor functions. */
function groupBy<R, V>(
  rows: R[],
  key: (r: R) => string,
  value: (r: R) => V,
): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = map.get(k);
    if (arr) arr.push(value(r));
    else map.set(k, [value(r)]);
  }
  return map;
}

/**
 * Load an entire Braidr project from a `.braidr` SQLite file.
 *
 * Maps the SQLite schema (scenes, characters, plot_points, chapters, notes,
 * timeline metadata, etc.) into the legacy `ProjectData` structure so the MCP
 * tools can stay unchanged.
 */
export async function loadProject(braidrPath: string): Promise<ProjectData> {
  const db = openDb(braidrPath);
  try {
    // ── Project meta ──────────────────────────────────────────────────────
    const project = db
      .prepare('SELECT name, word_count_goal FROM project LIMIT 1')
      .get() as { name: string; word_count_goal: number | null } | undefined;
    const projectName = project?.name ?? basenameNoExt(braidrPath);

    // ── Characters ────────────────────────────────────────────────────────
    const charRows = db
      .prepare('SELECT id, name, color FROM characters ORDER BY display_order, name')
      .all() as Array<{ id: string; name: string; color: string | null }>;
    const characters: Character[] = charRows.map((r) => ({
      id: r.id,
      name: r.name,
      filePath: '', // SQLite-backed: there is no per-character file
      color: r.color ?? undefined,
    }));

    // ── Tag id -> lowercased name (matches legacy tag handling) ────────────
    const tagRows = db.prepare('SELECT id, name FROM tags').all() as Array<{
      id: string;
      name: string;
    }>;
    const tagName = new Map<string, string>();
    for (const t of tagRows) tagName.set(t.id, t.name.toLowerCase());

    // ── Scene tags ─────────────────────────────────────────────────────────
    const sceneTagRows = db
      .prepare('SELECT scene_id, tag_id FROM scene_tags')
      .all() as Array<{ scene_id: string; tag_id: string }>;
    const sceneTags = new Map<string, string[]>();
    for (const st of sceneTagRows) {
      const name = tagName.get(st.tag_id);
      if (!name) continue;
      const arr = sceneTags.get(st.scene_id);
      if (arr) arr.push(name);
      else sceneTags.set(st.scene_id, [name]);
    }

    // ── Scene notes (bullet notes attached to a scene) ─────────────────────
    const sceneNoteRows = db
      .prepare('SELECT scene_id, content FROM scene_notes ORDER BY display_order')
      .all() as Array<{ scene_id: string; content: string }>;
    const sceneNotes = groupBy(
      sceneNoteRows.filter((n) => n.content),
      (n) => n.scene_id,
      (n) => n.content,
    );

    // ── Scenes ─────────────────────────────────────────────────────────────
    const sceneRows = db
      .prepare(
        `SELECT id, character_id, plot_point_id, title, synopsis, scene_number,
                timeline_position, is_highlighted, word_count
           FROM scenes
          WHERE deleted_at IS NULL
          ORDER BY scene_number`,
      )
      .all() as Array<{
      id: string;
      character_id: string;
      plot_point_id: string | null;
      title: string;
      synopsis: string;
      scene_number: number;
      timeline_position: number | null;
      is_highlighted: number;
      word_count: number | null;
    }>;
    const scenes: Scene[] = sceneRows.map((r) => ({
      id: r.id,
      characterId: r.character_id,
      sceneNumber: r.scene_number,
      title: r.title,
      content: r.synopsis ?? '',
      tags: sceneTags.get(r.id) ?? [],
      timelinePosition: r.timeline_position,
      isHighlighted: !!r.is_highlighted,
      notes: sceneNotes.get(r.id) ?? [],
      plotPointId: r.plot_point_id,
      wordCount: r.word_count ?? undefined,
    }));

    // ── Plot points ────────────────────────────────────────────────────────
    const ppRows = db
      .prepare(
        `SELECT id, character_id, title, description, expected_scene_count, display_order
           FROM plot_points
          ORDER BY display_order`,
      )
      .all() as Array<{
      id: string;
      character_id: string;
      title: string;
      description: string | null;
      expected_scene_count: number | null;
      display_order: number;
    }>;
    const plotPoints: PlotPoint[] = ppRows.map((r) => ({
      id: r.id,
      characterId: r.character_id,
      title: r.title,
      expectedSceneCount: r.expected_scene_count,
      description: r.description ?? '',
      order: r.display_order,
    }));

    // ── Timeline metadata ──────────────────────────────────────────────────
    const timeline = buildTimeline(
      db,
      scenes,
      charRows,
      project?.word_count_goal ?? undefined,
    );

    // ── Notes ──────────────────────────────────────────────────────────────
    const notesIndex = buildNotesIndex(db, tagName);

    return {
      projectPath: braidrPath,
      projectName,
      characters,
      scenes,
      plotPoints,
      timeline,
      notesIndex,
    };
  } finally {
    db.close();
  }
}

/** Build the TimelineData blob from the various per-scene metadata tables. */
function buildTimeline(
  db: DB,
  scenes: Scene[],
  charRows: Array<{ id: string; color: string | null }>,
  wordCountGoal: number | undefined,
): TimelineData {
  const positions: Record<string, number> = {};
  const wordCounts: Record<string, number> = {};
  for (const s of scenes) {
    if (s.timelinePosition !== null) positions[s.id] = s.timelinePosition;
    if (s.wordCount !== undefined) wordCounts[s.id] = s.wordCount;
  }

  // Scene connections (directed: source -> [targets])
  const connections: Record<string, string[]> = {};
  const connRows = db
    .prepare('SELECT source_scene_id, target_scene_id FROM scene_connections')
    .all() as Array<{ source_scene_id: string; target_scene_id: string }>;
  for (const c of connRows) {
    (connections[c.source_scene_id] ??= []).push(c.target_scene_id);
  }

  // Chapters. The legacy braided view inserts a chapter break "before" a
  // timeline position; in the SQLite model chapters own scenes via
  // scenes.chapter_id, so derive beforePosition = the earliest braided scene in
  // the chapter. Chapters with no braided scenes sort to the end.
  const chapterRows = db
    .prepare('SELECT id, title FROM chapters ORDER BY ord')
    .all() as Array<{ id: string; title: string }>;
  const minPosRows = db
    .prepare(
      `SELECT chapter_id, MIN(timeline_position) AS mp
         FROM scenes
        WHERE chapter_id IS NOT NULL
          AND timeline_position IS NOT NULL
          AND deleted_at IS NULL
        GROUP BY chapter_id`,
    )
    .all() as Array<{ chapter_id: string; mp: number | null }>;
  const minPosByChapter = new Map<string, number>();
  for (const r of minPosRows) {
    if (r.mp !== null) minPosByChapter.set(r.chapter_id, r.mp);
  }
  const chapters: BraidedChapter[] = chapterRows.map((c) => ({
    id: c.id,
    title: c.title,
    beforePosition: minPosByChapter.get(c.id) ?? Number.MAX_SAFE_INTEGER,
  }));

  // Character colors
  const characterColors: Record<string, string> = {};
  for (const c of charRows) if (c.color) characterColors[c.id] = c.color;

  // Draft prose (current draft per scene)
  const draftContent: Record<string, string> = {};
  const draftRows = db
    .prepare('SELECT scene_id, content FROM scene_drafts')
    .all() as Array<{ scene_id: string; content: string }>;
  for (const d of draftRows) if (d.content) draftContent[d.scene_id] = d.content;

  // Custom metadata field definitions
  const fieldDefRows = db
    .prepare(
      'SELECT id, label, field_type, options FROM metadata_field_defs ORDER BY display_order',
    )
    .all() as Array<{
    id: string;
    label: string;
    field_type: string;
    options: string | null;
  }>;
  const metadataFieldDefs: MetadataFieldDef[] = fieldDefRows.map((f) => ({
    id: f.id,
    name: f.label,
    type:
      f.field_type === 'dropdown'
        ? 'select'
        : f.field_type === 'multiselect'
          ? 'multiselect'
          : 'text',
    options: parseJson<string[]>(f.options, []),
  }));

  // Custom metadata values (value column is JSON: a string or string[])
  const sceneMetadata: Record<string, Record<string, string | string[]>> = {};
  const metaRows = db
    .prepare('SELECT scene_id, field_def_id, value FROM scene_metadata_values')
    .all() as Array<{ scene_id: string; field_def_id: string; value: string }>;
  for (const m of metaRows) {
    (sceneMetadata[m.scene_id] ??= {})[m.field_def_id] = parseJson<
      string | string[]
    >(m.value, '');
  }

  // Scratchpads
  const scratchpad: Record<string, string> = {};
  const spRows = db
    .prepare('SELECT scene_id, content FROM scene_scratchpads')
    .all() as Array<{ scene_id: string; content: string }>;
  for (const s of spRows) if (s.content) scratchpad[s.scene_id] = s.content;

  // Comments
  const sceneComments: Record<string, SceneComment[]> = {};
  const cmRows = db
    .prepare(
      'SELECT id, scene_id, text, created_at FROM scene_comments ORDER BY created_at',
    )
    .all() as Array<{
    id: string;
    scene_id: string;
    text: string;
    created_at: number;
  }>;
  for (const c of cmRows) {
    (sceneComments[c.scene_id] ??= []).push({
      id: c.id,
      text: c.text,
      createdAt: c.created_at,
    });
  }

  // Scene dates
  const timelineDates: Record<string, string> = {};
  const timelineEndDates: Record<string, string> = {};
  const dateRows = db
    .prepare('SELECT scene_id, date, end_date FROM scene_dates')
    .all() as Array<{ scene_id: string; date: string; end_date: string | null }>;
  for (const d of dateRows) {
    if (d.date) timelineDates[d.scene_id] = d.date;
    if (d.end_date) timelineEndDates[d.scene_id] = d.end_date;
  }

  // World events
  const worldEvents: WorldEvent[] = (
    db
      .prepare('SELECT id, title, date, description FROM world_events ORDER BY date')
      .all() as Array<{
      id: string;
      title: string;
      date: string;
      description: string | null;
    }>
  ).map((w) => ({
    id: w.id,
    title: w.title,
    date: w.date,
    description: w.description ?? '',
  }));

  return {
    positions,
    connections,
    chapters,
    characterColors,
    wordCounts,
    draftContent,
    metadataFieldDefs,
    sceneMetadata,
    scratchpad,
    sceneComments,
    wordCountGoal,
    timelineDates,
    timelineEndDates,
    worldEvents,
  };
}

/** Build the NotesIndex from the notes tables. Returns null when there are none. */
function buildNotesIndex(db: DB, tagName: Map<string, string>): NotesIndex | null {
  const noteRows = db
    .prepare(
      'SELECT id, title, parent_id, display_order, created_at, updated_at FROM notes ORDER BY display_order',
    )
    .all() as Array<{
    id: string;
    title: string;
    parent_id: string | null;
    display_order: number;
    created_at: number;
    updated_at: number;
  }>;
  if (noteRows.length === 0) return null;

  const outgoing = groupBy(
    db
      .prepare('SELECT source_note_id, target_note_id FROM note_links')
      .all() as Array<{ source_note_id: string; target_note_id: string }>,
    (l) => l.source_note_id,
    (l) => l.target_note_id,
  );

  const sceneLinks = groupBy(
    db
      .prepare('SELECT note_id, scene_id FROM note_scene_links')
      .all() as Array<{ note_id: string; scene_id: string }>,
    (l) => l.note_id,
    (l) => l.scene_id,
  );

  const noteTagRows = db
    .prepare('SELECT note_id, tag_id FROM note_tags')
    .all() as Array<{ note_id: string; tag_id: string }>;
  const noteTags = new Map<string, string[]>();
  for (const nt of noteTagRows) {
    const name = tagName.get(nt.tag_id);
    if (!name) continue;
    const arr = noteTags.get(nt.note_id);
    if (arr) arr.push(name);
    else noteTags.set(nt.note_id, [name]);
  }

  const notes: NoteMetadata[] = noteRows.map((r) => ({
    id: r.id,
    title: r.title,
    // Content lives in the DB now, keyed by note id. `fileName` carries the id
    // so loadNoteContent() can look it up without changing the tool interface.
    fileName: r.id,
    parentId: r.parent_id,
    order: r.display_order,
    createdAt: r.created_at,
    modifiedAt: r.updated_at,
    outgoingLinks: outgoing.get(r.id) ?? [],
    sceneLinks: sceneLinks.get(r.id) ?? [],
    tags: noteTags.get(r.id) ?? [],
  }));

  return { notes };
}

/**
 * Read the HTML content of a single note from the SQLite DB.
 *
 * `fileName` is the note id (see buildNotesIndex). Returns null if not found.
 */
export async function loadNoteContent(
  braidrPath: string,
  fileName: string,
): Promise<string | null> {
  let db: DB | undefined;
  try {
    db = openDb(braidrPath);
    const row = db.prepare('SELECT content FROM notes WHERE id = ?').get(fileName) as
      | { content: string }
      | undefined;
    return row?.content ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Get draft prose content for a scene from the timeline's draftContent map.
 * Returns null if no draft exists for the given scene.
 */
export function getDraftProse(
  timeline: TimelineData,
  sceneId: string,
): string | null {
  return timeline.draftContent?.[sceneId] ?? null;
}
