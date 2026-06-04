import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type {
  Character, Scene, PlotPoint, Tag, ArchivedScene, MetadataFieldDef,
  DraftVersion, SceneComment, Task, TaskFieldDef, TaskViewConfig,
  WorldEvent, NotesIndex, NoteMetadata, Chapter, FontSettings,
  AllFontSettings,
} from '../shared/types';
import type { BraidrDB, ChapterRow, TableViewRow, ActRow, CharacterPsychologyRow } from './database';
import { applySaveTimeline, type SaveTimelinePayload } from './applySaveTimeline';

function getDb(braidrPath: string): BraidrDB {
  const { openDatabase } = require('./database') as typeof import('./database');
  return openDatabase(braidrPath);
}

function randomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const lastBraidrBackupTime: Record<string, number> = {};
const BRAIDR_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const BRAIDR_MAX_BACKUPS = 20;

function autoBackupBraidr(braidrPath: string, db: import('./database').BraidrDB): void {
  const now = Date.now();
  if (now - (lastBraidrBackupTime[braidrPath] || 0) < BRAIDR_BACKUP_INTERVAL_MS) return;
  lastBraidrBackupTime[braidrPath] = now;

  const fs = require('fs') as typeof import('fs');
  const pathMod = require('path') as typeof import('path');
  const { app } = require('electron') as typeof import('electron');

  if (!fs.existsSync(braidrPath)) return;

  const projectName = pathMod.basename(braidrPath, '.braidr');
  const backupDir = pathMod.join(app.getPath('userData'), 'backups', projectName);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = pathMod.join(backupDir, `${projectName}-${timestamp}.braidr`);

  // Use SQLite online backup API so WAL frames are included in the snapshot.
  db.backup(backupPath)
    .then(() => {
      // Prune oldest backups beyond BRAIDR_MAX_BACKUPS
      try {
        const existing = fs.readdirSync(backupDir)
          .filter((f: string) => f.endsWith('.braidr'))
          .sort()
          .reverse();
        for (const old of existing.slice(BRAIDR_MAX_BACKUPS)) {
          fs.unlinkSync(pathMod.join(backupDir, old));
        }
      } catch { /* non-fatal */ }
    })
    .catch((err: unknown) => {
      console.error('[autoBackupBraidr] failed (non-fatal):', err);
    });
}

/**
 * Attempts to recover a corrupted .braidr file by restoring the newest healthy
 * backup. The corrupt file is quarantined (renamed .corrupt-<ts>) rather than
 * deleted, and its -wal/-shm sidecars are removed. Returns the reopened db and
 * the backup filename it restored from, or null if no healthy backup was found.
 */
function attemptBraidrRecovery(
  activeBraidrPath: string
): { db: BraidrDB; recoveredFrom: string } | null {
  const fs = require('fs') as typeof import('fs');
  const pathMod = require('path') as typeof import('path');
  const { app } = require('electron') as typeof import('electron');
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const { closeDatabase, openDatabase } = require('./database') as typeof import('./database');

  // Release the corrupt connection so the file can be replaced.
  try { closeDatabase(activeBraidrPath); } catch { /* ignore */ }

  const projectName = pathMod.basename(activeBraidrPath, '.braidr');
  const backupDir = pathMod.join(app.getPath('userData'), 'backups', projectName);
  if (!fs.existsSync(backupDir)) return null;

  // ISO-timestamped names sort lexicographically, so reverse() = newest first.
  const candidates = fs.readdirSync(backupDir)
    .filter((f: string) => f.endsWith('.braidr'))
    .sort()
    .reverse();

  for (const name of candidates) {
    const candidatePath = pathMod.join(backupDir, name);
    let healthy = false;
    try {
      const test = new Database(candidatePath, { readonly: true });
      healthy = test.pragma('quick_check', { simple: true }) === 'ok';
      test.close();
    } catch { healthy = false; }
    if (!healthy) continue;

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const p = activeBraidrPath + suffix;
        if (!fs.existsSync(p)) continue;
        if (suffix === '') fs.renameSync(p, `${activeBraidrPath}.corrupt-${ts}`);
        else fs.unlinkSync(p);
      }
      fs.copyFileSync(candidatePath, activeBraidrPath);
    } catch (err) {
      console.error('[braidr recovery] failed to restore backup:', err);
      return null;
    }
    console.warn(`[braidr recovery] restored "${activeBraidrPath}" from backup "${name}"`);
    return { db: openDatabase(activeBraidrPath), recoveredFrom: name };
  }
  return null;
}

// ── Load project ─────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_PROJECT, (_event, braidrPath: string) => {
  try {
    const fsMod = require('fs') as typeof import('fs');
    const pathMod = require('path') as typeof import('path');

    const folderPath = pathMod.dirname(braidrPath);

    // Migrate any legacy filesystem branches into this .braidr (idempotent no-op otherwise).
    try {
      const { migrateFilesystemBranches } = require('./branchMigration') as typeof import('./branchMigration');
      migrateFilesystemBranches(folderPath);
    } catch (e) { console.error('[BRAIDR_LOAD_PROJECT] branch migration failed (non-fatal)', e); }

    // The active branch now lives in the main file's live tables — no redirect.
    const activeBraidrPath = braidrPath;

    let db = getDb(activeBraidrPath);
    let recoveredFromBackup: string | null = null;

    // Detect corruption before attempting any reads.
    let healthy = false;
    try {
      const checkResult = (db.prepare('PRAGMA quick_check').all() as { quick_check: string }[]);
      healthy = checkResult[0]?.quick_check === 'ok';
    } catch { healthy = false; }

    if (!healthy) {
      // Self-heal: restore the newest healthy backup instead of dead-ending.
      const recovery = attemptBraidrRecovery(activeBraidrPath);
      if (recovery) {
        db = recovery.db;
        recoveredFromBackup = recovery.recoveredFrom;
      } else {
        const { app } = require('electron') as typeof import('electron');
        const pathMod = require('path') as typeof import('path');
        const projectName = pathMod.basename(braidrPath, '.braidr');
        const backupDir = pathMod.join(app.getPath('userData'), 'backups', projectName);
        return { success: false, error: `Your project file is corrupted. Please restore a backup from: ${backupDir}` };
      }
    }

    // Characters
    const charRows = db.getCharacters();
    const characterColors: Record<string, string> = {};
    const characters: Character[] = charRows.map((row, i) => {
      if (row.color) characterColors[row.id] = row.color;
      return { id: row.id, name: row.name, filePath: `__braidr__::${row.id}`, color: row.color || undefined };
    });

    // Plot points
    const ppRows = db.getPlotPoints();
    const plotPoints: PlotPoint[] = ppRows.map(row => ({
      id: row.id,
      characterId: row.character_id,
      actId: (row as any).act_id ?? null,
      inBullpen: !!(row as any).in_bullpen,
      title: row.title,
      expectedSceneCount: row.expected_scene_count,
      description: row.description || '',
      order: row.display_order,
      startingState: (row as any).starting_state ?? '',
      endingState: (row as any).ending_state ?? '',
      polarity: (row as any).polarity ?? '',
      transformation: (row as any).transformation ?? '',
      dilemma: (row as any).dilemma ?? '',
      propellingAction: (row as any).propelling_action ?? '',
    }));

    // Tags
    const tagRows = db.getTags();
    const tags: Tag[] = tagRows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category as Tag['category'],
    }));

    // Scene tags (bulk)
    const allSceneTagRows = db.prepare(`
      SELECT st.scene_id, t.name FROM scene_tags st JOIN tags t ON t.id = st.tag_id
    `).all() as { scene_id: string; name: string }[];
    const sceneTags: Record<string, string[]> = {};
    for (const row of allSceneTagRows) {
      (sceneTags[row.scene_id] ??= []).push(row.name);
    }

    // Scene notes (bulk)
    const allSceneNoteRows = db.prepare(
      'SELECT scene_id, content FROM scene_notes ORDER BY scene_id, display_order'
    ).all() as { scene_id: string; content: string }[];
    const sceneNotes: Record<string, string[]> = {};
    for (const row of allSceneNoteRows) {
      (sceneNotes[row.scene_id] ??= []).push(row.content);
    }

    // Scenes
    const sceneRows = db.getScenes();
    const scenes: Scene[] = sceneRows.map(row => ({
      id: row.id,
      characterId: row.character_id,
      sceneNumber: row.scene_number,
      title: row.title,
      content: row.synopsis,
      tags: sceneTags[row.id] || [],
      timelinePosition: row.timeline_position,
      isHighlighted: row.is_highlighted === 1,
      notes: sceneNotes[row.id] || [],
      plotPointId: row.plot_point_id,
      wordCount: row.word_count ?? undefined,
      chapterId: row.chapter_id,
      sceneOrder: row.scene_order,
      stationId: null,
      polarity: (row as any).polarity ?? '',
      transformation: (row as any).transformation ?? '',
      dilemma: (row as any).dilemma ?? '',
      propellingAction: (row as any).propelling_action ?? '',
      startingState: (row as any).starting_state ?? '',
      endingState: (row as any).ending_state ?? '',
    }));

    // Connections
    const connRows = db.getSceneConnections();
    const connections: Record<string, string[]> = {};
    for (const row of connRows) {
      (connections[row.source_scene_id] ??= []).push(row.target_scene_id);
    }

    // Chapters
    const chapterRows = db.getChapters();
    const chapters: Chapter[] = chapterRows.map((row: ChapterRow) => ({
      id: row.id,
      title: row.title,
      order: row.ord,
      description: row.description ?? undefined,
    }));

    // Font settings
    let fontSettings: FontSettings = {};
    try { fontSettings = JSON.parse(db.getSetting('fontSettings') || '{}'); } catch { /* malformed — use empty */ }
    const rawAllFont = db.getSetting('allFontSettings');
    let allFontSettings: AllFontSettings | undefined;
    try { allFontSettings = rawAllFont ? JSON.parse(rawAllFont) : undefined; } catch { /* malformed — skip */ }

    // Archived scenes
    const archivedRows = db.getArchivedScenes();
    const archivedScenes: ArchivedScene[] = archivedRows.map(row => {
      let tags: string[] = [];
      let notes: string[] = [];
      try { tags = JSON.parse(row.tags); } catch { /* malformed — skip */ }
      try { notes = JSON.parse(row.notes); } catch { /* malformed — skip */ }
      return {
        id: row.id,
        characterId: row.character_id,
        originalSceneNumber: row.original_scene_number,
        plotPointId: row.original_plot_point_id,
        title: row.title,
        content: row.synopsis,
        draftContent: row.draft_content ?? undefined,
        tags,
        notes,
        isHighlighted: row.is_highlighted === 1,
        wordCount: row.word_count ?? undefined,
        archivedAt: row.archived_at,
      };
    });

    // Draft content (all scenes, bulk)
    const draftRows = db.prepare('SELECT scene_id, content FROM scene_drafts').all() as { scene_id: string; content: string }[];
    const draftContent: Record<string, string> = {};
    for (const row of draftRows) {
      if (row.content) draftContent[row.scene_id] = row.content;
    }

    // Metadata field defs
    const mfdRows = db.getMetadataFieldDefs();
    const metadataFieldDefs: MetadataFieldDef[] = mfdRows.map(row => ({
      id: row.id,
      label: row.label,
      type: row.field_type as MetadataFieldDef['type'],
      options: row.options ? (() => { try { return JSON.parse(row.options!); } catch { return undefined; } })() : undefined,
      optionColors: row.option_colors ? (() => { try { return JSON.parse(row.option_colors!); } catch { return undefined; } })() : undefined,
      order: row.display_order,
    }));

    // Scene metadata values (bulk)
    const metaValueRows = db.getAllSceneMetadataValues();
    const sceneMetadata: Record<string, Record<string, string | string[]>> = {};
    for (const row of metaValueRows) {
      try {
        (sceneMetadata[row.scene_id] ??= {})[row.field_def_id] = JSON.parse(row.value);
      } catch {
        // Malformed metadata value — skip rather than crash
      }
    }

    // Draft versions (bulk)
    const dvRows = db.prepare(
      'SELECT * FROM scene_draft_versions ORDER BY scene_id, version DESC'
    ).all() as { id: string; scene_id: string; version: number; content: string; saved_at: number }[];
    const drafts: Record<string, DraftVersion[]> = {};
    for (const row of dvRows) {
      (drafts[row.scene_id] ??= []).push({ version: row.version, content: row.content, savedAt: row.saved_at });
    }

    // Project settings
    const projectRow = db.getProject();
    const wordCountGoal = projectRow?.word_count_goal || 0;

    // Scratchpad (bulk)
    const spRows = db.prepare('SELECT scene_id, content FROM scene_scratchpads').all() as { scene_id: string; content: string }[];
    const scratchpad: Record<string, string> = {};
    for (const row of spRows) {
      if (row.content) scratchpad[row.scene_id] = row.content;
    }

    // Scene comments (bulk)
    const scRows = db.prepare(
      'SELECT * FROM scene_comments ORDER BY scene_id, created_at'
    ).all() as { id: string; scene_id: string; text: string; created_at: number }[];
    const sceneComments: Record<string, SceneComment[]> = {};
    for (const row of scRows) {
      (sceneComments[row.scene_id] ??= []).push({ id: row.id, text: row.text, createdAt: row.created_at });
    }

    // Tasks
    const taskRows = db.getTasks();
    const allTCFV = db.getAllTaskCustomFieldValues();
    const customFieldsByTask: Record<string, Record<string, unknown>> = {};
    for (const v of allTCFV) {
      try {
        (customFieldsByTask[v.task_id] ??= {})[v.field_def_id] = JSON.parse(v.value);
      } catch {
        // Malformed custom field value — skip
      }
    }
    const taskTagRows = db.prepare(`
      SELECT tt.task_id, t.name FROM task_tags tt JOIN tags t ON t.id = tt.tag_id
    `).all() as { task_id: string; name: string }[];
    const taskTagsByTask: Record<string, string[]> = {};
    for (const row of taskTagRows) {
      (taskTagsByTask[row.task_id] ??= []).push(row.name);
    }
    const taskCharRows = db.prepare(
      'SELECT task_id, character_id FROM task_character_links'
    ).all() as { task_id: string; character_id: string }[];
    const taskCharsByTask: Record<string, string[]> = {};
    for (const row of taskCharRows) {
      (taskCharsByTask[row.task_id] ??= []).push(row.character_id);
    }
    const timeEntryRows = db.prepare(
      'SELECT * FROM time_entries ORDER BY task_id, started_at'
    ).all() as { id: string; task_id: string; started_at: number; duration: number; description: string | null }[];
    const timeEntriesByTask: Record<string, { id: string; startedAt: number; duration: number; description?: string }[]> = {};
    for (const row of timeEntryRows) {
      (timeEntriesByTask[row.task_id] ??= []).push({ id: row.id, startedAt: row.started_at, duration: row.duration, description: row.description ?? undefined });
    }
    const tasks: Task[] = taskRows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as Task['status'],
      priority: row.priority as Task['priority'],
      tags: taskTagsByTask[row.id] || [],
      characterIds: taskCharsByTask[row.id] || [],
      sceneKey: row.scene_id ?? undefined,
      timeEntries: timeEntriesByTask[row.id] || [],
      timeEstimate: row.time_estimate ?? undefined,
      dueDate: row.due_date ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      order: row.display_order,
      customFields: customFieldsByTask[row.id] || {},
    }));

    // Task field defs
    const tfdRows = db.getTaskFieldDefs();
    const taskFieldDefs: TaskFieldDef[] = tfdRows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.field_type as TaskFieldDef['type'],
      options: row.options ? (() => { try { return JSON.parse(row.options!); } catch { return undefined; } })() : undefined,
    }));

    // Settings
    let taskViews: TaskViewConfig[] = [];
    try { taskViews = JSON.parse(db.getSetting('taskViews') || '[]'); } catch { /* malformed — use empty */ }
    let taskColumnWidths: Record<string, number> = {};
    try { taskColumnWidths = JSON.parse(db.getSetting('taskColumnWidths') || '{}'); } catch { /* malformed — use empty */ }
    const rawTVC = db.getSetting('taskVisibleColumns');
    let taskVisibleColumns: string[] | undefined;
    try { taskVisibleColumns = rawTVC ? JSON.parse(rawTVC) : undefined; } catch { /* malformed — skip */ }
    const rawIMF = db.getSetting('inlineMetadataFields');
    let inlineMetadataFields: string[] | undefined;
    try { inlineMetadataFields = rawIMF ? JSON.parse(rawIMF) : undefined; } catch { /* malformed — skip */ }
    const rawSIL = db.getSetting('showInlineLabels');
    let showInlineLabels: boolean | undefined;
    try { showInlineLabels = rawSIL !== null ? JSON.parse(rawSIL) : undefined; } catch { /* malformed — skip */ }

    // Timeline dates
    const sceneDateRows = db.getAllSceneDates();
    const timelineDates: Record<string, string> = {};
    for (const row of sceneDateRows) {
      timelineDates[row.scene_id] = row.date;
    }

    // World events
    const weRows = db.getWorldEvents();
    const weTagRows = db.prepare(`
      SELECT wet.event_id, t.name FROM world_event_tags wet JOIN tags t ON t.id = wet.tag_id
    `).all() as { event_id: string; name: string }[];
    const weTagsByEvent: Record<string, string[]> = {};
    for (const row of weTagRows) {
      (weTagsByEvent[row.event_id] ??= []).push(row.name);
    }
    const weSceneRows = db.prepare(
      'SELECT event_id, scene_id FROM world_event_scene_links'
    ).all() as { event_id: string; scene_id: string }[];
    const weScenesByEvent: Record<string, string[]> = {};
    for (const row of weSceneRows) {
      (weScenesByEvent[row.event_id] ??= []).push(row.scene_id);
    }
    const weNoteRows = db.prepare(
      'SELECT event_id, note_id FROM world_event_note_links'
    ).all() as { event_id: string; note_id: string }[];
    const weNotesByEvent: Record<string, string[]> = {};
    for (const row of weNoteRows) {
      (weNotesByEvent[row.event_id] ??= []).push(row.note_id);
    }
    const worldEvents: WorldEvent[] = weRows.map(row => ({
      id: row.id,
      title: row.title,
      date: row.date,
      endDate: row.end_date ?? undefined,
      description: row.description,
      tags: weTagsByEvent[row.id] || [],
      linkedSceneKeys: weScenesByEvent[row.id] || [],
      linkedNoteIds: weNotesByEvent[row.id] || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const projectName = projectRow?.name || braidrPath.split('/').pop()?.replace('.braidr', '') || 'Untitled';

    return {
      success: true,
      data: {
        activeBraidrPath,
        recoveredFromBackup,
        projectPath: folderPath,
        projectName,
        characters,
        scenes,
        plotPoints,
        tags,
        connections,
        chapters,
        characterColors,
        fontSettings,
        allFontSettings,
        archivedScenes,
        draftContent,
        metadataFieldDefs,
        sceneMetadata,
        drafts,
        wordCountGoal,
        scratchpad,
        sceneComments,
        tasks,
        taskFieldDefs,
        taskViews,
        taskColumnWidths,
        taskVisibleColumns,
        inlineMetadataFields,
        showInlineLabels,
        timelineDates,
        worldEvents,
        acts: db.getAllActs(),
        _migrated: false,
      },
    };
  } catch (error) {
    console.error('[BRAIDR_LOAD_PROJECT]', error);
    return { success: false, error: String(error) };
  }
});

// ── Save timeline ─────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_TIMELINE, (_event, braidrPath: string, payload: SaveTimelinePayload) => {
  try {
    const db = getDb(braidrPath);
    autoBackupBraidr(braidrPath, db);
    applySaveTimeline(db, payload);
    return { success: true };
  } catch (error) {
    console.error('[BRAIDR_SAVE_TIMELINE]', error);
    return { success: false, error: String(error) };
  }
});

// ── Save character outline ────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER, (_event, braidrPath: string, payload: {
  character: Character;
  plotPoints: PlotPoint[];
  scenes: Scene[];
}) => {
  try {
    const db = getDb(braidrPath);
    const { character, plotPoints, scenes } = payload;

    db.transaction(() => {
      // Update character (name, color)
      db.updateCharacter(character.id, character.name, character.color ?? null, 0);

      // Replace plot points for this character
      db.prepare('DELETE FROM plot_points WHERE character_id = ?').run(character.id);
      for (const pp of plotPoints) {
        db.insertPlotPoint(
          pp.id, pp.characterId, pp.title, pp.description || null,
          pp.expectedSceneCount, pp.order, pp.actId ?? null,
          pp.startingState, pp.endingState, pp.polarity, pp.transformation,
          pp.dilemma, pp.propellingAction, pp.inBullpen ?? false
        );
      }

      // Get existing scene IDs for this character (to detect deletions)
      const existingSceneIds = new Set(
        (db.prepare('SELECT id FROM scenes WHERE character_id = ?').all(character.id) as { id: string }[]).map(r => r.id)
      );
      const incomingSceneIds = new Set(scenes.map(s => s.id));

      // Delete scenes no longer present (user removed them from outline)
      for (const existingId of existingSceneIds) {
        if (!incomingSceneIds.has(existingId)) {
          db.deleteScene(existingId);
        }
      }

      // Upsert each scene
      for (const scene of scenes) {
        if (existingSceneIds.has(scene.id)) {
          db.updateScene(scene.id, {
            title: scene.title,
            synopsis: scene.content,
            sceneNumber: scene.sceneNumber,
            isHighlighted: scene.isHighlighted,
            wordCount: scene.wordCount ?? null,
            plotPointId: scene.plotPointId,
          });
        } else {
          db.insertScene(
            scene.id, scene.characterId, scene.plotPointId,
            scene.title, scene.content, scene.sceneNumber,
            scene.timelinePosition, scene.isHighlighted, scene.wordCount ?? null
          );
        }

        // Replace scene tags
        if (scene.tags.length > 0) {
          const tagIds = scene.tags.map(name => {
            const row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
            if (row) return row.id;
            const newId = randomId();
            db.upsertTag(newId, name, 'things');
            return newId;
          });
          db.replaceSceneTags(scene.id, tagIds);
        } else {
          db.replaceSceneTags(scene.id, []);
        }

        // Replace scene notes
        db.replaceSceneNotes(scene.id, scene.notes);
      }
    });

    return { success: true };
  } catch (error) {
    console.error('[BRAIDR_SAVE_CHARACTER]', error);
    return { success: false, error: String(error) };
  }
});

// ── Create character ──────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_CREATE_CHARACTER, (_event, braidrPath: string, name: string) => {
  try {
    const db = getDb(braidrPath);
    const charId = randomId();
    const ppId = randomId();
    const sceneId = randomId();

    db.transaction(() => {
      const order = db.getCharacters().length;
      db.insertCharacter(charId, name, null, order);
      db.insertPlotPoint(ppId, charId, 'Act 1', null, null, 0);
      db.insertScene(sceneId, charId, ppId, 'First scene description here', 'First scene description here', 1, null, false, null);
    });

    return {
      success: true,
      character: { id: charId, name, filePath: `__braidr__::${charId}` } as Character,
      plotPoint: { id: ppId, characterId: charId, title: 'Act 1', expectedSceneCount: null, description: '', order: 0 } as PlotPoint,
      scene: {
        id: sceneId, characterId: charId, sceneNumber: 1,
        title: 'First scene description here', content: 'First scene description here',
        tags: [], timelinePosition: null, isHighlighted: false, notes: [], plotPointId: ppId,
        chapterId: null, sceneOrder: 0, stationId: null, polarity: '', transformation: '',
        dilemma: '', propellingAction: '', startingState: '', endingState: '',
      } as Scene,
    };
  } catch (error) {
    console.error('[BRAIDR_CREATE_CHARACTER]', error);
    return { success: false, error: String(error) };
  }
});

// ── Per-scene content ─────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_READ_DRAFT, (_event, braidrPath: string, sceneId: string) => {
  try {
    const db = getDb(braidrPath);
    const row = db.getDraft(sceneId);
    return { success: true, data: row?.content || '' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_DRAFT, (_event, braidrPath: string, sceneId: string, content: string) => {
  try {
    const db = getDb(braidrPath);
    db.upsertDraft(sceneId, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_READ_SCRATCHPAD, (_event, braidrPath: string, sceneId: string) => {
  try {
    const db = getDb(braidrPath);
    const row = db.getScratchpad(sceneId);
    return { success: true, data: row?.content || '' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_SCRATCHPAD, (_event, braidrPath: string, sceneId: string, content: string) => {
  try {
    const db = getDb(braidrPath);
    db.upsertScratchpad(sceneId, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_READ_DRAFT_VERSIONS, (_event, braidrPath: string, sceneId: string) => {
  try {
    const db = getDb(braidrPath);
    const rows = db.getDraftVersions(sceneId);
    const versions: DraftVersion[] = rows.map(r => ({ version: r.version, content: r.content, savedAt: r.saved_at }));
    return { success: true, data: versions };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_DRAFT_VERSIONS, (_event, braidrPath: string, sceneId: string, versions: DraftVersion[]) => {
  try {
    const db = getDb(braidrPath);
    db.replaceDraftVersions(sceneId, versions.map(v => ({
      id: randomId(),
      version: v.version,
      content: v.content,
      saved_at: v.savedAt,
    })));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_READ_SCENE_COMMENTS, (_event, braidrPath: string, sceneId: string) => {
  try {
    const db = getDb(braidrPath);
    const rows = db.getSceneComments(sceneId);
    const comments: SceneComment[] = rows.map(r => ({ id: r.id, text: r.text, createdAt: r.created_at }));
    return { success: true, data: comments };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_SCENE_COMMENTS, (_event, braidrPath: string, sceneId: string, comments: SceneComment[]) => {
  try {
    const db = getDb(braidrPath);
    db.replaceSceneComments(sceneId, comments.map(c => ({ id: c.id, text: c.text, created_at: c.createdAt })));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// ── Notes ─────────────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_NOTES_INDEX, (_event, braidrPath: string) => {
  try {
    const db = getDb(braidrPath);
    const noteRows = db.getNotes();

    const noteLinkRows = db.prepare(
      'SELECT source_note_id, target_note_id FROM note_links'
    ).all() as { source_note_id: string; target_note_id: string }[];
    const outgoingLinksByNote: Record<string, string[]> = {};
    for (const row of noteLinkRows) {
      (outgoingLinksByNote[row.source_note_id] ??= []).push(row.target_note_id);
    }

    const noteSceneLinkRows = db.prepare(
      'SELECT note_id, scene_id FROM note_scene_links'
    ).all() as { note_id: string; scene_id: string }[];
    const sceneLinksbyNote: Record<string, string[]> = {};
    for (const row of noteSceneLinkRows) {
      (sceneLinksbyNote[row.note_id] ??= []).push(row.scene_id);
    }

    const noteTagRows = db.prepare(`
      SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
    `).all() as { note_id: string; name: string }[];
    const tagsByNote: Record<string, string[]> = {};
    for (const row of noteTagRows) {
      (tagsByNote[row.note_id] ??= []).push(row.name);
    }

    const notes: NoteMetadata[] = noteRows.map(row => ({
      id: row.id,
      title: row.title,
      fileName: row.id,
      parentId: row.parent_id,
      order: row.display_order,
      createdAt: row.created_at,
      modifiedAt: row.updated_at,
      outgoingLinks: outgoingLinksByNote[row.id] || [],
      sceneLinks: sceneLinksbyNote[row.id] || [],
      tags: tagsByNote[row.id] || [],
    }));

    // Archived notes
    const archivedNoteRows = db.getArchivedNotes();

    const notesIndex: NotesIndex = { notes, version: 2 };
    if (archivedNoteRows.length > 0) {
      notesIndex.archivedNotes = archivedNoteRows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        parentId: row.parent_id,
        tags: JSON.parse(row.tags),
        outgoingLinks: [],
        sceneLinks: [],
        archivedAt: row.archived_at,
        originalMetadata: { order: 0, createdAt: row.archived_at, modifiedAt: row.archived_at },
      }));
    }

    return { success: true, data: notesIndex };
  } catch (error) {
    console.error('[BRAIDR_LOAD_NOTES_INDEX]', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_NOTES_INDEX, (_event, braidrPath: string, notesIndex: NotesIndex) => {
  try {
    const db = getDb(braidrPath);

    db.transaction(() => {
      for (const meta of notesIndex.notes) {
        const existing = db.getNote(meta.id);
        if (existing) {
          db.updateNote(meta.id, {
            title: meta.title,
            parentId: meta.parentId,
            displayOrder: meta.order,
          });
        }
        // Outgoing links
        db.replaceNoteLinks(meta.id, meta.outgoingLinks);
        // Scene links
        db.replaceNoteSceneLinks(meta.id, meta.sceneLinks);
        // Tags
        if (meta.tags && meta.tags.length > 0) {
          const tagIds = meta.tags.map(name => {
            const row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
            if (row) return row.id;
            const newId = randomId();
            db.upsertTag(newId, name, 'things');
            return newId;
          });
          db.replaceNoteTags(meta.id, tagIds);
        } else {
          db.replaceNoteTags(meta.id, []);
        }
      }
    });

    db.checkpoint();
    return { success: true };
  } catch (error) {
    console.error('[BRAIDR_SAVE_NOTES_INDEX]', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_READ_NOTE, (_event, braidrPath: string, noteId: string) => {
  try {
    const db = getDb(braidrPath);
    const row = db.getNote(noteId);
    return { success: true, data: row?.content || '' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_NOTE, (_event, braidrPath: string, noteId: string, content: string) => {
  try {
    const db = getDb(braidrPath);
    db.updateNote(noteId, { content });
    db.checkpoint();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_CREATE_NOTE, (_event, braidrPath: string, noteId: string, title: string, parentId: string | null) => {
  try {
    const db = getDb(braidrPath);
    const order = db.getNotes().filter(n => n.parent_id === parentId).length;
    db.insertNote(noteId, title, '', parentId, order);
    db.checkpoint();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_DELETE_NOTE, (_event, braidrPath: string, noteId: string) => {
  try {
    const db = getDb(braidrPath);
    db.deleteNote(noteId);
    db.checkpoint();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// ── Chapter handlers ─────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_GET_CHAPTERS, (_event, braidrPath: string) => {
  try {
    const db = getDb(braidrPath);
    const rows = db.getChapters();
    const chapters: Chapter[] = rows.map((row: ChapterRow) => ({
      id: row.id,
      title: row.title,
      order: row.ord,
      description: row.description ?? undefined,
    }));
    return { success: true, chapters };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_CHAPTER, (_event, braidrPath: string, chapter: Chapter) => {
  try {
    const db = getDb(braidrPath);
    db.saveChapter(chapter);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_DELETE_CHAPTER, (_event, braidrPath: string, chapterId: string) => {
  try {
    const db = getDb(braidrPath);
    db.deleteChapter(chapterId);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_REORDER_CHAPTERS, (_event, braidrPath: string, orderedIds: string[]) => {
  try {
    const db = getDb(braidrPath);
    db.reorderChapters(orderedIds);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// ── Table view handlers ───────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_TABLE_VIEWS, (_event, braidrPath: string) => {
  try {
    const db = getDb(braidrPath);
    const rows = db.getTableViews();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_TABLE_VIEWS, (_event, braidrPath: string, views: TableViewRow[]) => {
  try {
    const db = getDb(braidrPath);
    db.saveTableViews(views);
    db.checkpoint();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_ASSIGN_SCENE_TO_CHAPTER, (
  _event,
  braidrPath: string,
  sceneId: string,
  chapterId: string | null,
  sceneOrder: number
) => {
  try {
    const db = getDb(braidrPath);
    db.updateScene(sceneId, { chapterId, sceneOrder });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// ── Acts ──────────────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_ACTS, (_event, braidrPath: string, characterId: string) => {
  try {
    const db = getDb(braidrPath);
    return { success: true, data: db.getActs(characterId) };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_ACT, (_event, braidrPath: string, act: ActRow) => {
  try {
    const db = getDb(braidrPath);
    db.upsertAct(act);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_SCENE_ARC_FIELDS, (_event, braidrPath: string, sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; synopsis?: string; startingState?: string; endingState?: string; title?: string }) => {
  try {
    const db = getDb(braidrPath);
    db.updateScene(sceneId, fields);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS, (_event, braidrPath: string, plotPointId: string, fields: { actId?: string | null; inBullpen?: boolean; startingState?: string; endingState?: string; polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; title?: string; description?: string }) => {
  try {
    const db = getDb(braidrPath);
    db.updatePlotPoint(plotPointId, fields);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_DELETE_ACT, (_event, braidrPath: string, actId: string) => {
  try {
    const db = getDb(braidrPath);
    db.deleteAct(actId);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_REORDER_ACTS, (_event, braidrPath: string, characterId: string, orderedIds: string[]) => {
  try {
    const db = getDb(braidrPath);
    db.reorderActs(characterId, orderedIds);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

// ── Character Psychology ───────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_CHARACTER_PSYCHOLOGY, (_event, braidrPath: string, characterId: string) => {
  try {
    const db = getDb(braidrPath);
    return { success: true, data: db.getCharacterPsychology(characterId) ?? null };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER_PSYCHOLOGY, (_event, braidrPath: string, row: CharacterPsychologyRow) => {
  try {
    const db = getDb(braidrPath);
    db.upsertCharacterPsychology(row);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});
