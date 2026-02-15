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
  sectionTitleBold?: boolean;
  sectionTitleColor?: string;
  sceneTitle?: string;
  sceneTitleSize?: number;
  sceneTitleBold?: boolean;
  sceneTitleColor?: string;
  body?: string;
  bodySize?: number;
  bodyBold?: boolean;
  bodyColor?: string;
}

export type ScreenKey = 'pov' | 'braided' | 'editor' | 'notes';

export interface AllFontSettings {
  global: FontSettings;
  screens?: Partial<Record<ScreenKey, FontSettings>>;
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

export interface TableViewConfig {
  id: string;
  name: string;
  visibleColumns: string[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filterCharacter: string; // 'all' or characterId
  filterTags: string[]; // array of tag IDs
  createdAt: number; // timestamp
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
  // Font settings (global — kept for backward compat)
  fontSettings?: FontSettings;
  // Per-screen font settings (new format)
  allFontSettings?: AllFontSettings;
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
  // Saved table view configurations
  tableViews?: TableViewConfig[];
  // Word count goal for the project
  wordCountGoal?: number;
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
  characterCount?: number;
  sceneCount?: number;
  totalWordCount?: number;
  characterNames?: string[];
  characterIds?: string[];
  characterColors?: Record<string, string>;
}

export type ProjectTemplate = 'blank' | 'three-act' | 'save-the-cat' | 'heros-journey';

// Notes types
export interface NoteMetadata {
  id: string;
  title: string;
  fileName: string;       // Flat file in notes/ directory (e.g., "abc123.html")
  parentId: string | null; // null = root note; otherwise parent note's id
  order: number;           // Sort order among siblings
  createdAt: number;
  modifiedAt: number;
  outgoingLinks: string[];  // Note IDs this note links to
  sceneLinks: string[];     // Scene keys ("characterId:sceneNumber") this note references
  tags?: string[];          // Tag names applied to this note
  // Deprecated — kept for migration from folder-based layout
  folderPath?: string;
}

export interface NotesIndex {
  notes: NoteMetadata[];
  version?: number;        // 2 = nested notes; absent/1 = legacy folder-based
}

// License types
export interface LicenseStatus {
  state: 'unlicensed' | 'licensed' | 'expired' | 'invalid';
  licenseKey?: string;
  expiresAt?: string; // ISO date string
  customerEmail?: string;
}

export interface LicenseData {
  licenseKey?: string;
  lastValidation?: string; // ISO date string
  cachedStatus?: LicenseStatus;
}

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
  // Notes
  LOAD_NOTES_INDEX: 'load-notes-index',
  SAVE_NOTES_INDEX: 'save-notes-index',
  READ_NOTE: 'read-note',
  SAVE_NOTE: 'save-note',
  CREATE_NOTE: 'create-note',
  DELETE_NOTE: 'delete-note',
  RENAME_NOTE: 'rename-note',
  SAVE_NOTE_IMAGE: 'save-note-image',
  SELECT_NOTE_IMAGE: 'select-note-image',
  // PDF export
  PRINT_TO_PDF: 'print-to-pdf',
  // Analytics
  READ_ANALYTICS: 'read-analytics',
  SAVE_ANALYTICS: 'save-analytics',
  // License
  GET_LICENSE_STATUS: 'get-license-status',
  ACTIVATE_LICENSE: 'activate-license',
  DEACTIVATE_LICENSE: 'deactivate-license',
  OPEN_PURCHASE_URL: 'open-purchase-url',
  OPEN_BILLING_PORTAL: 'open-billing-portal',
  OPEN_FEEDBACK_EMAIL: 'open-feedback-email',
} as const;
