import type {
  TaskViewConfig, Tag, FontSettings, AllFontSettings,
} from '../shared/types';
import type { BraidrDB } from './database';

export interface SaveTimelinePayload {
  fontSettings?: FontSettings;
  allFontSettings?: AllFontSettings;
  wordCountGoal?: number;
  taskViews?: TaskViewConfig[];
  taskColumnWidths?: Record<string, number>;
  taskVisibleColumns?: string[];
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
  tags?: Tag[];
}

export function applySaveTimeline(db: BraidrDB, payload: SaveTimelinePayload): void {
  db.transaction(() => {
    // Scene positions, word counts, character colors, and timeline dates are now
    // managed via mutations (Phase 4f/4e): scenes.setBraidedPositions,
    // scene.setWordCount, character.setColor, scene.setDate.

    // Font settings
    if (payload.fontSettings !== undefined) {
      db.setSetting('fontSettings', JSON.stringify(payload.fontSettings));
    }
    if (payload.allFontSettings !== undefined) {
      db.setSetting('allFontSettings', JSON.stringify(payload.allFontSettings));
    }

    // Word count goal
    if (payload.wordCountGoal !== undefined) {
      const proj = db.getProject();
      db.upsertProject(proj?.name || 'Untitled', payload.wordCountGoal);
    }

    // Task view settings
    if (payload.taskViews !== undefined) db.setSetting('taskViews', JSON.stringify(payload.taskViews));
    if (payload.taskColumnWidths !== undefined) db.setSetting('taskColumnWidths', JSON.stringify(payload.taskColumnWidths));
    if (payload.taskVisibleColumns !== undefined) db.setSetting('taskVisibleColumns', JSON.stringify(payload.taskVisibleColumns));
    if (payload.inlineMetadataFields !== undefined) db.setSetting('inlineMetadataFields', JSON.stringify(payload.inlineMetadataFields));
    if (payload.showInlineLabels !== undefined) db.setSetting('showInlineLabels', JSON.stringify(payload.showInlineLabels));

    // Tags (upsert all known tags)
    if (payload.tags !== undefined) {
      for (const tag of payload.tags) {
        db.upsertTag(tag.id, tag.name, tag.category);
      }
    }
  });
}
