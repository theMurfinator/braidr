/**
 * Story tables that are versioned per branch. Order is parents-before-children
 * for readability; the swap disables FK enforcement so insert order is not
 * load-bearing. Shared tables (tasks, notes, writing_sessions, tags, *_field_defs,
 * table_views, project, settings) are intentionally excluded.
 */
export const BRANCHED_TABLES: readonly string[] = [
  'characters',
  'acts',
  'plot_points',
  'character_psychology',
  'chapters',
  'scenes',
  'scene_drafts',
  'scene_draft_versions',
  'scene_scratchpads',
  'scene_notes',
  'scene_comments',
  'scene_connections',
  'scene_tags',
  'scene_metadata_values',
  'scene_dates',
  'world_events',
  'world_event_tags',
  'world_event_scene_links',
  'world_event_note_links',
  'archived_scenes',
];

export const SNAPSHOT_FORMAT_VERSION = 1;
