import type {
  Task, TaskFieldDef, TaskViewConfig, MetadataFieldDef,
  ArchivedScene, WorldEvent, Tag, FontSettings, AllFontSettings,
} from '../shared/types';
import type { BraidrDB } from './database';

function randomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** True when the table currently holds at least one row. */
function tableHasRows(db: BraidrDB, table: string): boolean {
  return !!db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
}

/**
 * A "bulk replace" save (delete-all then re-insert) must never wipe existing
 * data when the incoming collection is empty. An empty-but-defined payload is
 * almost always a partial/early save (e.g. the renderer saving before tasks or
 * metadata have been loaded into state, or a caller that omits these keys) —
 * NOT a deliberate "clear everything". Honoring it cost a user ~21h of tracked
 * hours + all tasks/custom-metadata on 2026-06-03 (and a similar incident on
 * 2026-04-20). Individual deletions still flow through the per-row delete paths,
 * so guarding the bulk path here is safe.
 *
 * Returns true when the destructive replace should proceed.
 */
function shouldReplace(db: BraidrDB, incomingCount: number, table: string): boolean {
  if (incomingCount > 0) return true;            // real data incoming → replace
  if (!tableHasRows(db, table)) return true;     // nothing to lose → fine to "replace" with empty
  console.warn(
    `[applySaveTimeline] skipping bulk replace of "${table}": incoming payload is empty ` +
    `but the table has existing rows — preserving to avoid data loss.`
  );
  return false;                                  // empty incoming + existing data → preserve
}

export interface SaveTimelinePayload {
  positions?: Record<string, number>;
  clearedPositions?: string[];
  connections?: Record<string, string[]>;
  characterColors?: Record<string, string>;
  wordCounts?: Record<string, number>;
  fontSettings?: FontSettings;
  allFontSettings?: AllFontSettings;
  archivedScenes?: ArchivedScene[];
  metadataFieldDefs?: MetadataFieldDef[];
  sceneMetadata?: Record<string, Record<string, string | string[]>>;
  wordCountGoal?: number;
  tasks?: Task[];
  taskFieldDefs?: TaskFieldDef[];
  taskViews?: TaskViewConfig[];
  taskColumnWidths?: Record<string, number>;
  taskVisibleColumns?: string[];
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
  timelineDates?: Record<string, string>;
  timelineEndDates?: Record<string, string>;
  worldEvents?: WorldEvent[];
  tags?: Tag[];
}

/**
 * Apply a timeline save payload to the database inside a single transaction.
 * Bulk "replace" collections (tasks, metadata, archived scenes, world events,
 * task field defs) are guarded so an empty payload never wipes existing data —
 * see shouldReplace().
 */
export function applySaveTimeline(db: BraidrDB, payload: SaveTimelinePayload): void {
  db.transaction(() => {
    // Scene positions + word counts
    const posNow = Date.now();
    if (payload.positions) {
      const updatePos = db.prepare('UPDATE scenes SET timeline_position = ?, updated_at = ? WHERE id = ?');
      for (const [sceneId, pos] of Object.entries(payload.positions)) {
        updatePos.run(pos, posNow, sceneId);
      }
    }
    if (payload.clearedPositions?.length) {
      const clearPos = db.prepare('UPDATE scenes SET timeline_position = NULL, updated_at = ? WHERE id = ?');
      for (const sceneId of payload.clearedPositions) {
        clearPos.run(posNow, sceneId);
      }
    }
    if (payload.wordCounts) {
      const updateWC = db.prepare('UPDATE scenes SET word_count = ?, updated_at = ? WHERE id = ?');
      const now = Date.now();
      for (const [sceneId, wc] of Object.entries(payload.wordCounts)) {
        updateWC.run(wc, now, sceneId);
      }
    }

    // Connections
    if (payload.connections) {
      const rows: { id: string; source_scene_id: string; target_scene_id: string; label: null }[] = [];
      for (const [src, targets] of Object.entries(payload.connections)) {
        for (const tgt of targets) {
          rows.push({ id: randomId(), source_scene_id: src, target_scene_id: tgt, label: null });
        }
      }
      db.replaceSceneConnections(rows);
    }

    // Character colors
    if (payload.characterColors) {
      const updateColor = db.prepare('UPDATE characters SET color = ? WHERE id = ?');
      for (const [charId, color] of Object.entries(payload.characterColors)) {
        updateColor.run(color, charId);
      }
    }

    // Font settings
    if (payload.fontSettings !== undefined) {
      db.setSetting('fontSettings', JSON.stringify(payload.fontSettings));
    }
    if (payload.allFontSettings !== undefined) {
      db.setSetting('allFontSettings', JSON.stringify(payload.allFontSettings));
    }

    // Archived scenes (bulk replace — guarded)
    if (payload.archivedScenes !== undefined && shouldReplace(db, payload.archivedScenes.length, 'archived_scenes')) {
      db.prepare('DELETE FROM archived_scenes').run();
      for (const arc of payload.archivedScenes) {
        db.insertArchivedScene({
          id: arc.id,
          character_id: arc.characterId,
          original_plot_point_id: arc.plotPointId ?? null,
          original_scene_number: arc.originalSceneNumber,
          title: arc.title,
          synopsis: arc.content,
          draft_content: arc.draftContent ?? null,
          tags: JSON.stringify(arc.tags),
          notes: JSON.stringify(arc.notes),
          is_highlighted: arc.isHighlighted ? 1 : 0,
          word_count: arc.wordCount ?? null,
          archived_at: arc.archivedAt,
        });
      }
    }

    // Metadata field defs (bulk replace — guarded; cascades to scene_metadata_values)
    if (payload.metadataFieldDefs !== undefined && shouldReplace(db, payload.metadataFieldDefs.length, 'metadata_field_defs')) {
      db.replaceMetadataFieldDefs(payload.metadataFieldDefs.map(d => ({
        id: d.id,
        label: d.label,
        field_type: d.type,
        options: d.options ? JSON.stringify(d.options) : null,
        option_colors: d.optionColors ? JSON.stringify(d.optionColors) : null,
        display_order: d.order,
      })));
    }
    // Scene metadata values (bulk replace — guarded)
    if (payload.sceneMetadata !== undefined && shouldReplace(db, Object.keys(payload.sceneMetadata).length, 'scene_metadata_values')) {
      // replaceMetadataFieldDefs cascades deletes scene_metadata_values, so re-insert
      db.prepare('DELETE FROM scene_metadata_values').run();
      const insertMV = db.prepare('INSERT INTO scene_metadata_values (scene_id, field_def_id, value) VALUES (?, ?, ?)');
      for (const [sceneId, fields] of Object.entries(payload.sceneMetadata)) {
        for (const [fieldId, value] of Object.entries(fields)) {
          insertMV.run(sceneId, fieldId, JSON.stringify(value));
        }
      }
    }

    // Word count goal
    if (payload.wordCountGoal !== undefined) {
      const proj = db.getProject();
      db.upsertProject(proj?.name || 'Untitled', payload.wordCountGoal);
    }

    // Tasks (bulk replace — guarded; cascades to time_entries/task_tags/etc.)
    if (payload.tasks !== undefined && shouldReplace(db, payload.tasks.length, 'tasks')) {
      db.prepare('DELETE FROM tasks').run();
      for (const task of payload.tasks) {
        db.insertTask(task.id, {
          title: task.title,
          description: task.description ?? null,
          status: task.status,
          priority: task.priority,
          sceneId: task.sceneKey ?? null,
          timeEstimate: task.timeEstimate ?? null,
          dueDate: task.dueDate ?? null,
          displayOrder: task.order,
        });
        // Time entries
        db.replaceTimeEntries(task.id, task.timeEntries.map(te => ({
          id: te.id,
          started_at: te.startedAt,
          duration: te.duration,
          description: te.description ?? null,
        })));
        // Task tags
        if (task.tags.length > 0) {
          const tagIds = task.tags.map(name => {
            const row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
            if (row) return row.id;
            const newId = randomId();
            db.upsertTag(newId, name, 'things');
            return newId;
          });
          db.replaceTaskTags(task.id, tagIds);
        }
        // Character links
        db.replaceTaskCharacterLinks(task.id, task.characterIds);
        // Custom fields
        db.replaceTaskCustomFieldValues(task.id, Object.entries(task.customFields).map(([fieldId, value]) => ({
          field_def_id: fieldId,
          value: JSON.stringify(value),
        })));
      }
    }

    // Task field defs (bulk replace — guarded)
    if (payload.taskFieldDefs !== undefined && shouldReplace(db, payload.taskFieldDefs.length, 'task_field_defs')) {
      db.replaceTaskFieldDefs(payload.taskFieldDefs.map(d => ({
        id: d.id,
        name: d.name,
        field_type: d.type,
        options: d.options ? JSON.stringify(d.options) : null,
        display_order: 0,
      })));
    }

    // Task view settings
    if (payload.taskViews !== undefined) db.setSetting('taskViews', JSON.stringify(payload.taskViews));
    if (payload.taskColumnWidths !== undefined) db.setSetting('taskColumnWidths', JSON.stringify(payload.taskColumnWidths));
    if (payload.taskVisibleColumns !== undefined) db.setSetting('taskVisibleColumns', JSON.stringify(payload.taskVisibleColumns));
    if (payload.inlineMetadataFields !== undefined) db.setSetting('inlineMetadataFields', JSON.stringify(payload.inlineMetadataFields));
    if (payload.showInlineLabels !== undefined) db.setSetting('showInlineLabels', JSON.stringify(payload.showInlineLabels));

    // Timeline dates
    if (payload.timelineDates !== undefined) {
      const endDates = payload.timelineEndDates || {};
      for (const [sceneId, date] of Object.entries(payload.timelineDates)) {
        db.upsertSceneDate(sceneId, date, endDates[sceneId] ?? null);
      }
    }

    // World events (bulk replace — guarded)
    if (payload.worldEvents !== undefined && shouldReplace(db, payload.worldEvents.length, 'world_events')) {
      db.prepare('DELETE FROM world_events').run();
      for (const we of payload.worldEvents) {
        db.insertWorldEvent(we.id, we.title, we.date, we.endDate ?? null, we.description);
        if (we.tags.length > 0) {
          const tagIds = we.tags.map(name => {
            const row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
            if (row) return row.id;
            const newId = randomId();
            db.upsertTag(newId, name, 'things');
            return newId;
          });
          db.replaceWorldEventTags(we.id, tagIds);
        }
        db.replaceWorldEventSceneLinks(we.id, we.linkedSceneKeys);
        db.replaceWorldEventNoteLinks(we.id, we.linkedNoteIds);
      }
    }

    // Tags (upsert all known tags)
    if (payload.tags !== undefined) {
      for (const tag of payload.tags) {
        db.upsertTag(tag.id, tag.name, tag.category);
      }
    }
  });
}
