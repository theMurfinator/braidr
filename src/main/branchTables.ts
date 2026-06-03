/**
 * Story tables that are versioned per branch. Order is parents-before-children
 * for readability; the swap disables FK enforcement so insert order is not
 * load-bearing. Shared tables are intentionally excluded: tasks (+ task_*), notes
 * (+ note_*), writing_sessions, tags, metadata_field_defs, task_field_defs,
 * table_views, project, settings. Branched junction tables (scene_tags,
 * scene_metadata_values, world_event_note_links) reference these shared parents;
 * that is fine because the swap runs with foreign_keys OFF. braided_chapters is
 * vestigial (dropped in migrate()) and so is excluded.
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
