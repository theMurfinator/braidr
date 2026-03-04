// Shared types for the Braidr MCP server — timeline, notes, and project data.

export interface BraidedChapter {
  id: string;
  title: string;
  beforePosition: number;
}

export interface SceneComment {
  id: string;
  text: string;
  createdAt: number;
  resolved?: boolean;
}

export interface MetadataFieldDef {
  id: string;
  name: string;
  type: 'text' | 'select' | 'multiselect';
  options?: string[];
}

export interface WorldEvent {
  id: string;
  title: string;
  date: string;
  description?: string;
}

export interface TimelineData {
  positions: Record<string, number>;
  connections?: Record<string, string[]>;
  chapters?: BraidedChapter[];
  characterColors?: Record<string, string>;
  wordCounts?: Record<string, number>;
  draftContent?: Record<string, string>;
  metadataFieldDefs?: MetadataFieldDef[];
  sceneMetadata?: Record<string, Record<string, string | string[]>>;
  scratchpad?: Record<string, string>;
  sceneComments?: Record<string, SceneComment[]>;
  wordCountGoal?: number;
  timelineDates?: Record<string, string>;
  timelineEndDates?: Record<string, string>;
  worldEvents?: WorldEvent[];
}

export interface NoteMetadata {
  id: string;
  title: string;
  fileName: string;
  parentId: string | null;
  order: number;
  createdAt: number;
  modifiedAt: number;
  outgoingLinks: string[];
  sceneLinks: string[];
  tags?: string[];
}

export interface NotesIndex {
  notes: NoteMetadata[];
  archivedNotes?: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
  }>;
  version?: number;
}

export interface ProjectData {
  projectPath: string;
  projectName: string;
  characters: Array<import('./parser.js').Character>;
  scenes: Array<import('./parser.js').Scene>;
  plotPoints: Array<import('./parser.js').PlotPoint>;
  timeline: TimelineData;
  notesIndex: NotesIndex | null;
}
