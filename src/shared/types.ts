// Core data types for the novel outlining tool

export interface Character {
  id: string;
  name: string;
  filePath: string;
  color?: string; // Custom color for braided view
}

export interface Scene {
  id: string;
  characterId: string;
  sceneNumber: number;
  title: string;
  content: string;
  tags: string[];
  timelinePosition: number | null; // null = not yet braided
  isHighlighted: boolean;
  notes: string[];
  plotPointId: string | null;
  wordCount?: number; // Optional word count for pacing visualization
}

export interface FontSettings {
  sectionTitle?: string;
  sectionTitleSize?: number;
  sceneTitle?: string;
  sceneTitleSize?: number;
  body?: string;
  bodySize?: number;
}

export interface ArchivedScene {
  id: string;
  characterId: string;
  originalSceneNumber: number;
  plotPointId: string | null;
  content: string;
  tags: string[];
  notes: string[];
  isHighlighted: boolean;
  wordCount?: number;
  archivedAt: number; // timestamp
}

export interface MetadataFieldDef {
  id: string;
  label: string;
  type: 'text' | 'dropdown' | 'multiselect';
  options?: string[];
  optionColors?: Record<string, string>;
  order: number;
}

export interface DraftVersion {
  version: number;
  content: string;
  savedAt: number; // timestamp
}

export interface TimelineData {
  // Maps "characterId:sceneNumber" to timeline position
  positions: Record<string, number>;
  // Maps "characterId:sceneNumber" to array of connected scene keys
  connections?: Record<string, string[]>;
  // Chapters in the braided timeline
  chapters?: BraidedChapter[];
  // Custom colors for characters (characterId -> color)
  characterColors?: Record<string, string>;
  // Word counts for scenes (characterId:sceneNumber -> count)
  wordCounts?: Record<string, number>;
  // Font settings for POV view
  fontSettings?: FontSettings;
  // Archived (soft-deleted) scenes
  archivedScenes?: ArchivedScene[];
  // Draft prose content keyed by "characterId:sceneNumber"
  draftContent?: Record<string, string>;
  // Metadata field definitions (project-wide)
  metadataFieldDefs?: MetadataFieldDef[];
  // Per-scene metadata values keyed by "characterId:sceneNumber"
  sceneMetadata?: Record<string, Record<string, string | string[]>>;
  // Saved draft versions keyed by "characterId:sceneNumber"
  drafts?: Record<string, DraftVersion[]>;
}

export interface BraidedChapter {
  id: string;
  title: string;
  // Chapter appears before this timeline position (1-indexed)
  beforePosition: number;
}

export interface PlotPoint {
  id: string;
  characterId: string;
  title: string;
  expectedSceneCount: number | null;
  description: string;
  order: number;
}

export interface Tag {
  id: string;
  name: string;
  category: TagCategory;
}

export type TagCategory = 'people' | 'locations' | 'arcs' | 'things' | 'time';

export interface OutlineFile {
  character: Character;
  plotPoints: PlotPoint[];
  scenes: Scene[];
  rawContent: string;
}

export interface ProjectData {
  projectPath: string;
  projectName: string;
  characters: Character[];
  scenes: Scene[];
  plotPoints: PlotPoint[];
  tags: Tag[];
}

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: number; // timestamp
}

export type ProjectTemplate = 'blank' | 'three-act' | 'save-the-cat' | 'heros-journey';

// IPC channel names
export const IPC_CHANNELS = {
  SELECT_FOLDER: 'select-folder',
  READ_PROJECT: 'read-project',
  SAVE_FILE: 'save-file',
  CREATE_CHARACTER: 'create-character',
  LOAD_TIMELINE: 'load-timeline',
  SAVE_TIMELINE: 'save-timeline',
  GET_RECENT_PROJECTS: 'get-recent-projects',
  ADD_RECENT_PROJECT: 'add-recent-project',
  CREATE_PROJECT: 'create-project',
  SELECT_SAVE_LOCATION: 'select-save-location',
  DELETE_FILE: 'delete-file',
  BACKUP_PROJECT: 'backup-project',
} as const;
