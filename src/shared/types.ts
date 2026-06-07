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
  chapterId: string | null;  // null = not assigned to a chapter
  sceneOrder: number;        // position within the chapter (0-indexed)
  wordCount?: number; // Optional word count for pacing visualization
  stationId: string | null;
  polarity: string;
  transformation: string;
  dilemma: string;
  propellingAction: string;
  startingState: string;
  endingState: string;
}

export interface Chapter {
  id: string;
  title: string;
  order: number;        // global reading order across all chapters
  description?: string;
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
  title: string;
  content: string;
  draftContent?: string;
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

// Custom field definitions for the Arc level (shared across acts + sections).
// Parallel to MetadataFieldDef but adds 'number' and 'rating' and ratingMax.
export interface ArcFieldDef {
  id: string;
  label: string;
  type: 'text' | 'dropdown' | 'multiselect' | 'number' | 'rating';
  options?: string[];                     // dropdown / multiselect
  optionColors?: Record<string, string>;  // per-option hex colors
  ratingMax?: number;                     // rating only (default 5)
  order: number;
}

export interface DraftVersion {
  version: number;
  content: string;
  savedAt: number; // timestamp
}

export interface FilterRule {
  id: string;
  field: string;
  operator: 'is' | 'is_not' | 'is_blank' | 'is_not_blank' | 'contains';
  value: string;
}

export interface TableViewConfig {
  id: string;
  name: string;
  isDefault?: boolean;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  columnOrder: string[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filterRules: FilterRule[];
  groupBy: 'none' | 'plotPoint' | 'chapter';
  createdAt: number;
}

export interface TimelineData {
  // Maps "characterId:sceneNumber" to timeline position
  positions: Record<string, number>;
  // Maps "characterId:sceneNumber" to array of connected scene keys
  connections?: Record<string, string[]>;
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
  // Arc-level custom field definitions (project-wide, shared by acts + sections)
  arcFieldDefs?: ArcFieldDef[];
  // Per-entity arc field values keyed by "act:<id>" | "section:<id>" -> fieldId -> value
  // The composite key maps to the DB's separate entity_type / entity_id columns (split on save, joined on load)
  arcFieldValues?: Record<string, Record<string, string | string[]>>;
  // Saved draft versions keyed by "characterId:sceneNumber"
  drafts?: Record<string, DraftVersion[]>;
  // Scratchpad content keyed by "characterId:sceneNumber"
  scratchpad?: Record<string, string>;
  // Comments keyed by "characterId:sceneNumber"
  sceneComments?: Record<string, SceneComment[]>;
  // Saved table view configurations
  tableViews?: TableViewConfig[];
  // Word count goal for the project
  wordCountGoal?: number;
  // Task management
  tasks?: Task[];
  taskFieldDefs?: TaskFieldDef[];
  taskViews?: TaskViewConfig[];
  // Default task column configuration (when no view is active)
  taskColumnWidths?: Record<string, number>;
  taskVisibleColumns?: string[];
  // Inline metadata display preferences (POV view)
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
  // Scene dates keyed by "characterId:sceneNumber"
  timelineDates?: Record<string, string>;
  // Scene end dates keyed by "characterId:sceneNumber" (for multi-day scenes)
  timelineEndDates?: Record<string, string>;
  // World events
  worldEvents?: WorldEvent[];
  // Persisted tags with user-assigned categories
  tags?: Tag[];
}

// Object-argument form of saveTimeline — derived from TimelineData but with
// file-only fields removed and the three required fields made non-optional.
export type SaveTimelinePayload =
  Omit<TimelineData, 'connections' | 'draftContent' | 'drafts' | 'scratchpad' | 'sceneComments' | 'tableViews'> & {
    connections: Record<string, string[]>;
    clearedPositions?: string[]; // scene IDs whose timeline_position should be set to null
  };

// ── Task Management ──────────────────────────────────────────────────────────

export type TaskStatus = 'open' | 'in-progress' | 'done';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface TimeEntry {
  id: string;
  startedAt: number;
  duration: number;
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  characterIds: string[];
  sceneKey?: string;
  timeEntries: TimeEntry[];
  timeEstimate?: number;
  dueDate?: number;
  createdAt: number;
  updatedAt: number;
  order: number;
  customFields: Record<string, unknown>;
}

export type TaskFieldType = 'text' | 'number' | 'checkbox' | 'dropdown' | 'date';

export interface TaskFieldDef {
  id: string;
  name: string;
  type: TaskFieldType;
  options?: string[];
  width?: number;
}

export interface TaskViewConfig {
  id: string;
  name: string;
  isDefault?: boolean;
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: TaskFilter[];
  visibleColumns?: string[];
  columnWidths?: Record<string, number>;
}

export interface TaskFilter {
  field: string;
  operator: 'is' | 'is_not' | 'contains' | 'is_set' | 'is_not_set';
  value?: string | string[];
}

// ── Timeline / World Events ─────────────────────────────────────────────────

export interface WorldEvent {
  id: string;
  title: string;
  date: string;                // "YYYY-MM-DD"
  endDate?: string;            // "YYYY-MM-DD" for multi-day events
  description: string;
  tags: string[];
  linkedSceneKeys: string[];   // ["characterId:sceneNumber", ...]
  linkedNoteIds: string[];     // note IDs
  createdAt: number;
  updatedAt: number;
}

export interface SceneComment {
  id: string;
  text: string;
  createdAt: number;
}

export interface Act {
  id: string;
  characterId: string;
  name: string;
  synopsis: string;
  startingState: string;
  endingState: string;
  polarity: string;
  transformation: string;
  dilemma: string;
  propellingAction: string;
  order: number;
}

export interface CharacterPsychology {
  characterId: string;
  // Novel-level arc
  novelStartingState: string;
  novelEndingState: string;
  novelPolarity: string;
  novelTransformation: string;
  novelDilemma: string;
  novelPropellingAction: string;
  // Maass psychological fields
  wound: string;
  lie: string;
  deepestFear: string;
  limitingBelief: string;
  thorn: string;
  copingTool: string;
  whisperOfGrace: string;
  surfaceWant: string;
  soulsLonging: string;
  bitterNeed: string;
  capitalTTruth: string;
  arcSummary: string;
  theme: string;
  antiTheme: string;
  finalReaderExperience: string;
}

export interface PlotPoint {
  id: string;
  characterId: string;
  actId: string | null;
  inBullpen: boolean; // true = deliberately set aside (hidden from POV, scenes unbraided)
  title: string;
  expectedSceneCount: number | null;
  description: string;
  synopsis: string;
  order: number;
  startingState: string;
  endingState: string;
  polarity: string;
  transformation: string;
  dilemma: string;
  propellingAction: string;
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
  weeklyWords?: number;         // net words written this Sat–Fri week
  weeklyHours?: number;         // hours logged this Sat–Fri week
  weeklyPerDayWords?: number[];  // [Sat, Sun, Mon, Tue, Wed, Thu, Fri] net words
  weeklyPerDayHours?: number[];  // [Sat, Sun, Mon, Tue, Wed, Thu, Fri] hours
  weeklyDayLabels?: string[];    // ['Sat', 'Sun', ...]
  weeklyTodayIdx?: number;       // index of today (-1 if viewing a past week)
  weeklyHoursTarget?: number;    // target hours/week (0 = no target)
  weeklyWordsTarget?: number;    // target words/week (0 = no target)
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

export interface ArchivedNote {
  id: string;
  title: string;
  content: string;          // HTML stored inline so file can be deleted from disk
  parentId: string | null;
  tags: string[];
  outgoingLinks: string[];
  sceneLinks: string[];
  archivedAt: number;       // timestamp
  originalMetadata: {
    order: number;
    createdAt: number;
    modifiedAt: number;
  };
}

export interface NotesIndex {
  notes: NoteMetadata[];
  archivedNotes?: ArchivedNote[];
  version?: number;        // 2 = nested notes; absent/1 = legacy folder-based
}

// ── Draft Branches ──────────────────────────────────────────────────────────

export interface BranchInfo {
  name: string;
  description?: string;
  createdAt: string;
  createdFrom: string;
  legacy?: boolean; // true = old .md-only branch, cannot be used
}

export interface BranchIndex {
  branches: BranchInfo[];
  activeBranch: string | null;
}

export interface BranchCompareData {
  leftName: string;
  rightName: string;
  scenes: BranchSceneDiff[];
}

export interface BranchSceneDiff {
  sceneId: string;
  characterId: string;
  characterName: string;
  sceneNumber: number;
  leftTitle: string;
  rightTitle: string;
  leftPosition: number | null;
  rightPosition: number | null;
  leftSceneNumber: number | null;
  rightSceneNumber: number | null;
  leftWordCount: number | null;
  rightWordCount: number | null;
  changed: boolean;
  changeType: 'added' | 'removed' | 'modified' | 'unchanged';
}

// License types
export interface LicenseStatus {
  state: 'unlicensed' | 'licensed' | 'expired' | 'invalid' | 'trial' | 'trial_expired';
  email?: string;
  expiresAt?: string; // ISO date string
  cancelAtPeriodEnd?: boolean;
  trialDaysRemaining?: number;
}

export interface LicenseData {
  email?: string;
  licenseKey?: string; // Legacy — kept for migration detection
  lastValidation?: string; // ISO date string
  cachedStatus?: LicenseStatus;
  trialStartDate?: string; // ISO date string
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
  // Export
  PRINT_TO_PDF: 'print-to-pdf',
  PRINT_PREVIEW: 'print-preview',
  EXPORT_FILE: 'export-file',
  // Analytics
  READ_ANALYTICS: 'read-analytics',
  SAVE_ANALYTICS: 'save-analytics',
  // License
  GET_LICENSE_STATUS: 'get-license-status',
  ACTIVATE_LICENSE: 'activate-license',
  DEACTIVATE_LICENSE: 'deactivate-license',
  START_TRIAL: 'start-trial',
  OPEN_PURCHASE_URL: 'open-purchase-url',
  OPEN_BILLING_PORTAL: 'open-billing-portal',
  OPEN_FEEDBACK_EMAIL: 'open-feedback-email',
  REFRESH_LICENSE_STATUS: 'refresh-license-status',
  // Subscription management
  GET_SUBSCRIPTION_DETAILS: 'get-subscription-details',
  CANCEL_SUBSCRIPTION: 'cancel-subscription',
  REACTIVATE_SUBSCRIPTION: 'reactivate-subscription',
  // Analytics (PostHog)
  CAPTURE_ANALYTICS_EVENT: 'capture-analytics-event',
  // Per-scene content (extracted from timeline.json)
  READ_DRAFT: 'read-draft',
  SAVE_DRAFT: 'save-draft',
  READ_SCRATCHPAD: 'read-scratchpad',
  SAVE_SCRATCHPAD: 'save-scratchpad',
  READ_DRAFT_VERSIONS: 'read-draft-versions',
  SAVE_DRAFT_VERSIONS: 'save-draft-versions',
  READ_SCENE_COMMENTS: 'read-scene-comments',
  SAVE_SCENE_COMMENTS: 'save-scene-comments',
  // Bulk read for project loading
  READ_ALL_PER_SCENE_CONTENT: 'read-all-per-scene-content',
  // Branches
  BRANCHES_LIST: 'branches:list',
  BRANCHES_CREATE: 'branches:create',
  BRANCHES_SWITCH: 'branches:switch',
  BRANCHES_DELETE: 'branches:delete',
  BRANCHES_MERGE: 'branches:merge',
  BRANCHES_COMPARE: 'branches:compare',
  BRANCHES_READ_POSITIONS: 'branches:read-positions',
  BRANCHES_SAVE_POSITIONS: 'branches:save-positions',
  BRANCHES_GET_SCENE_DRAFT: 'branches:get-scene-draft',
  // Lock
  LOCK_READ: 'lock:read',
  LOCK_WRITE: 'lock:write',
  LOCK_DELETE: 'lock:delete',
  GET_DEVICE_INFO: 'get-device-info',
  // SQLite .braidr file operations
  DETECT_PROJECT_FORMAT: 'detect-project-format',
  CONVERT_TO_BRAIDR: 'convert-to-braidr',
  SELECT_BRAIDR_FILE: 'select-braidr-file',
  // .braidr SQLite read/write operations
  BRAIDR_LOAD_PROJECT: 'braidr:load-project',
  BRAIDR_SAVE_TIMELINE: 'braidr:save-timeline',
  BRAIDR_SAVE_CHARACTER: 'braidr:save-character',
  BRAIDR_CREATE_CHARACTER: 'braidr:create-character',
  BRAIDR_READ_DRAFT: 'braidr:read-draft',
  BRAIDR_SAVE_DRAFT: 'braidr:save-draft',
  BRAIDR_READ_SCRATCHPAD: 'braidr:read-scratchpad',
  BRAIDR_SAVE_SCRATCHPAD: 'braidr:save-scratchpad',
  BRAIDR_READ_DRAFT_VERSIONS: 'braidr:read-draft-versions',
  BRAIDR_SAVE_DRAFT_VERSIONS: 'braidr:save-draft-versions',
  BRAIDR_READ_SCENE_COMMENTS: 'braidr:read-scene-comments',
  BRAIDR_SAVE_SCENE_COMMENTS: 'braidr:save-scene-comments',
  BRAIDR_LOAD_NOTES_INDEX: 'braidr:load-notes-index',
  BRAIDR_SAVE_NOTES_INDEX: 'braidr:save-notes-index',
  BRAIDR_READ_NOTE: 'braidr:read-note',
  BRAIDR_SAVE_NOTE: 'braidr:save-note',
  BRAIDR_CREATE_NOTE: 'braidr:create-note',
  BRAIDR_DELETE_NOTE: 'braidr:delete-note',
  // Chapters
  BRAIDR_GET_CHAPTERS: 'braidr:get-chapters',
  BRAIDR_SAVE_CHAPTER: 'braidr:save-chapter',
  BRAIDR_DELETE_CHAPTER: 'braidr:delete-chapter',
  BRAIDR_REORDER_CHAPTERS: 'braidr:reorder-chapters',
  BRAIDR_ASSIGN_SCENE_TO_CHAPTER: 'braidr:assign-scene-to-chapter',
  BRAIDR_LOAD_TABLE_VIEWS: 'braidr:load-table-views',
  BRAIDR_SAVE_TABLE_VIEWS: 'braidr:save-table-views',
  // Arc Planning
  BRAIDR_LOAD_ACTS: 'braidr:load-acts',
  BRAIDR_SAVE_ACT: 'braidr:save-act',
  BRAIDR_SAVE_SCENE_ARC_FIELDS: 'braidr:save-scene-arc-fields',
  BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS: 'braidr:save-plot-point-arc-fields',
  BRAIDR_SAVE_ARC_FIELD_DEFS: 'braidr:save-arc-field-defs',
  BRAIDR_SAVE_ARC_FIELD_VALUES: 'braidr:save-arc-field-values',
  BRAIDR_DELETE_ACT: 'braidr:delete-act',
  BRAIDR_REORDER_ACTS: 'braidr:reorder-acts',
  BRAIDR_LOAD_CHARACTER_PSYCHOLOGY: 'braidr:load-character-psychology',
  BRAIDR_SAVE_CHARACTER_PSYCHOLOGY: 'braidr:save-character-psychology',
} as const;
