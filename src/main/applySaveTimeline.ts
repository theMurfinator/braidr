import type {
  TaskViewConfig, MetadataFieldDef,
  ArchivedScene, WorldEvent, Tag, FontSettings, AllFontSettings,
} from '../shared/types';
import type { BraidrDB } from './database';

export interface SaveTimelinePayload {
  positions?: Record<string, number>;
  clearedPositions?: string[];
  connections?: Record<string, string[]>;
  wordCounts?: Record<string, number>;
  fontSettings?: FontSettings;
  allFontSettings?: AllFontSettings;
  archivedScenes?: ArchivedScene[];
  metadataFieldDefs?: MetadataFieldDef[];
  sceneMetadata?: Record<string, Record<string, string | string[]>>;
  wordCountGoal?: number;
  taskViews?: TaskViewConfig[];
  taskColumnWidths?: Record<string, number>;
  taskVisibleColumns?: string[];
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
  worldEvents?: WorldEvent[];
  tags?: Tag[];
}

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

    // Connections are now managed via connection.add / connection.remove mutations (Phase 4b).
    // Character colors are now managed via character.setColor mutation (Phase 4e).
    // Timeline dates are now managed via scene.setDate mutation (Phase 4e).

    // Font settings
    if (payload.fontSettings !== undefined) {
      db.setSetting('fontSettings', JSON.stringify(payload.fontSettings));
    }
    if (payload.allFontSettings !== undefined) {
      db.setSetting('allFontSettings', JSON.stringify(payload.allFontSettings));
    }

    // Archived scenes are now managed via scene.delete / scene.restore mutations (Phase 4c).

    // Scene metadata is now managed via braidrSaveArcFieldDefs/braidrSaveArcFieldValues.
    // (metadataFieldDefs and sceneMetadata remain in the payload type for backward compat only.)

    // Word count goal
    if (payload.wordCountGoal !== undefined) {
      const proj = db.getProject();
      db.upsertProject(proj?.name || 'Untitled', payload.wordCountGoal);
    }

    // Tasks and task field defs are now managed via task.create / task.setFields mutations (Phase 3).

    // Task view settings
    if (payload.taskViews !== undefined) db.setSetting('taskViews', JSON.stringify(payload.taskViews));
    if (payload.taskColumnWidths !== undefined) db.setSetting('taskColumnWidths', JSON.stringify(payload.taskColumnWidths));
    if (payload.taskVisibleColumns !== undefined) db.setSetting('taskVisibleColumns', JSON.stringify(payload.taskVisibleColumns));
    if (payload.inlineMetadataFields !== undefined) db.setSetting('inlineMetadataFields', JSON.stringify(payload.inlineMetadataFields));
    if (payload.showInlineLabels !== undefined) db.setSetting('showInlineLabels', JSON.stringify(payload.showInlineLabels));

    // World events are now managed via worldEvent.create / worldEvent.update / worldEvent.delete mutations (Phase 4d).

    // Tags (upsert all known tags)
    if (payload.tags !== undefined) {
      for (const tag of payload.tags) {
        db.upsertTag(tag.id, tag.name, tag.category);
      }
    }
  });
}
