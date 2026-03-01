import { Scene, TimelineData, Task, WorldEvent, NotesIndex, NoteMetadata } from '../../shared/types';

/**
 * Check if a key is in the old format (contains ':').
 * New stable IDs never contain ':'.
 */
function isLegacyKey(key: string): boolean {
  return key.includes(':');
}

/**
 * Build a mapping from old "characterId:sceneNumber" keys to new stable scene IDs.
 * Only builds entries for scenes whose old key actually exists in the data.
 */
function buildKeyMap(scenes: Scene[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const scene of scenes) {
    const oldKey = `${scene.characterId}:${scene.sceneNumber}`;
    if (oldKey !== scene.id) {
      map[oldKey] = scene.id;
    }
  }
  return map;
}

/**
 * Remap keys in a Record using the key map, preserving entries not in the map.
 */
function remapRecord<T>(source: Record<string, T>, keyMap: Record<string, string>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key in keyMap) {
      result[keyMap[key]] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface MigrationResult {
  migrated: boolean;
  timelineData: TimelineData;
}

/**
 * Migrate all scene-keyed data from "characterId:sceneNumber" format to stable scene IDs.
 * Idempotent: if keys don't contain ':', assumes already migrated.
 */
export function migrateSceneKeys(scenes: Scene[], timelineData: TimelineData): MigrationResult {
  // Check if any keys need migration
  const allKeys = [
    ...Object.keys(timelineData.positions || {}),
    ...Object.keys(timelineData.wordCounts || {}),
    ...Object.keys(timelineData.draftContent || {}),
    ...Object.keys(timelineData.sceneMetadata || {}),
    ...Object.keys(timelineData.scratchpad || {}),
    ...Object.keys(timelineData.sceneComments || {}),
    ...Object.keys(timelineData.timelineDates || {}),
    ...Object.keys(timelineData.timelineEndDates || {}),
    ...Object.keys(timelineData.drafts || {}),
    ...Object.keys(timelineData.connections || {}),
  ];

  const hasLegacyKeys = allKeys.some(isLegacyKey);
  if (!hasLegacyKeys) {
    return { migrated: false, timelineData };
  }

  const keyMap = buildKeyMap(scenes);

  const migrated: TimelineData = { ...timelineData };

  // Remap all keyed data
  if (migrated.positions) {
    migrated.positions = remapRecord(migrated.positions, keyMap);
  }
  if (migrated.wordCounts) {
    migrated.wordCounts = remapRecord(migrated.wordCounts, keyMap);
  }
  if (migrated.draftContent) {
    migrated.draftContent = remapRecord(migrated.draftContent, keyMap);
  }
  if (migrated.sceneMetadata) {
    migrated.sceneMetadata = remapRecord(migrated.sceneMetadata, keyMap);
  }
  if (migrated.scratchpad) {
    migrated.scratchpad = remapRecord(migrated.scratchpad, keyMap);
  }
  if (migrated.sceneComments) {
    migrated.sceneComments = remapRecord(migrated.sceneComments, keyMap);
  }
  if (migrated.timelineDates) {
    migrated.timelineDates = remapRecord(migrated.timelineDates, keyMap);
  }
  if (migrated.timelineEndDates) {
    migrated.timelineEndDates = remapRecord(migrated.timelineEndDates, keyMap);
  }
  if (migrated.drafts) {
    migrated.drafts = remapRecord(migrated.drafts, keyMap);
  }

  // Connections: remap both keys AND values
  if (migrated.connections) {
    const newConnections: Record<string, string[]> = {};
    for (const [key, targets] of Object.entries(migrated.connections)) {
      const newKey = keyMap[key] || key;
      const newTargets = targets.map(t => keyMap[t] || t);
      newConnections[newKey] = newTargets;
    }
    migrated.connections = newConnections;
  }

  // Tasks: remap sceneKey field and characterIds
  if (migrated.tasks) {
    migrated.tasks = migrated.tasks.map((task: Task) => {
      if (task.sceneKey && isLegacyKey(task.sceneKey)) {
        const newKey = keyMap[task.sceneKey] || task.sceneKey;
        // Derive characterId from scene lookup instead of splitting old key
        const scene = scenes.find(s => s.id === newKey);
        return {
          ...task,
          sceneKey: newKey,
          characterIds: scene ? [scene.characterId] : task.characterIds,
        };
      }
      return task;
    });
  }

  // World events: remap linkedSceneKeys
  if (migrated.worldEvents) {
    migrated.worldEvents = migrated.worldEvents.map((event: WorldEvent) => ({
      ...event,
      linkedSceneKeys: event.linkedSceneKeys.map(k => keyMap[k] || k),
    }));
  }

  return { migrated: true, timelineData: migrated };
}

/**
 * Migrate notes-index.json sceneLinks from old "characterId:sceneNumber" format to stable scene IDs.
 * Returns { migrated, notesIndex } — only mutates if legacy keys found.
 */
export function migrateNotesSceneLinks(
  scenes: Scene[],
  notesIndex: NotesIndex
): { migrated: boolean; notesIndex: NotesIndex } {
  const keyMap = buildKeyMap(scenes);
  let changed = false;

  const migratedNotes = notesIndex.notes.map((note: NoteMetadata) => {
    if (!note.sceneLinks || note.sceneLinks.length === 0) return note;
    const hasLegacy = note.sceneLinks.some(isLegacyKey);
    if (!hasLegacy) return note;
    changed = true;
    return {
      ...note,
      sceneLinks: note.sceneLinks.map(k => keyMap[k] || k),
    };
  });

  if (!changed) return { migrated: false, notesIndex };
  return { migrated: true, notesIndex: { ...notesIndex, notes: migratedNotes } };
}
