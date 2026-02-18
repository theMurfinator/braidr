import { Character, Scene, PlotPoint, Tag, OutlineFile, ProjectData, TimelineData, BraidedChapter, RecentProject, ProjectTemplate, FontSettings, AllFontSettings, ArchivedScene, MetadataFieldDef, DraftVersion, NotesIndex } from '../../shared/types';
import { parseOutlineFile, serializeOutline, createTagsFromStrings, extractTags } from './parser';

// Data service interface - this abstraction allows swapping to a web API later
export interface DataService {
  selectProjectFolder(): Promise<string | null>;
  loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: BraidedChapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string> }>;
  saveCharacterOutline(character: Character, plotPoints: PlotPoint[], scenes: Scene[]): Promise<void>;
  createCharacter(folderPath: string, name: string): Promise<Character>;
  saveTimeline(positions: Record<string, number>, connections: Record<string, string[]>, chapters: BraidedChapter[], characterColors?: Record<string, string>, wordCounts?: Record<string, number>, fontSettings?: FontSettings, archivedScenes?: ArchivedScene[], draftContent?: Record<string, string>, metadataFieldDefs?: MetadataFieldDef[], sceneMetadata?: Record<string, Record<string, string | string[]>>, drafts?: Record<string, DraftVersion[]>, wordCountGoal?: number, allFontSettings?: AllFontSettings, scratchpad?: Record<string, string>): Promise<void>;
  getRecentProjects(): Promise<RecentProject[]>;
  addRecentProject(project: RecentProject): Promise<void>;
  selectSaveLocation(): Promise<string | null>;
  createProject(parentPath: string, projectName: string, template: ProjectTemplate): Promise<string | null>;
  deleteFile(filePath: string): Promise<void>;
  // Notes
  loadNotesIndex(projectPath: string): Promise<NotesIndex>;
  saveNotesIndex(projectPath: string, data: NotesIndex): Promise<void>;
  readNote(projectPath: string, fileName: string): Promise<string>;
  saveNote(projectPath: string, fileName: string, content: string): Promise<void>;
  createNote(projectPath: string, fileName: string): Promise<void>;
  deleteNote(projectPath: string, fileName: string): Promise<void>;
  renameNote(projectPath: string, oldFileName: string, newFileName: string): Promise<void>;
  // Note images
  saveNoteImage(projectPath: string, imageData: string, fileName: string): Promise<string>;
  selectNoteImage(projectPath: string): Promise<string | null>;
}

// Local file system implementation (Electron)
class ElectronDataService implements DataService {
  private projectPath: string | null = null;
  private outlineFiles: Map<string, OutlineFile> = new Map();

  async selectProjectFolder(): Promise<string | null> {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      this.projectPath = path;
    }
    return path;
  }

  async loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: BraidedChapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string> }> {
    this.projectPath = folderPath;
    const result = await window.electronAPI.readProject(folderPath);

    if (!result.success || !result.outlines) {
      throw new Error(result.error || 'Failed to load project');
    }

    // Load timeline data
    const timelineResult = await window.electronAPI.loadTimeline(folderPath);
    const timelineData: TimelineData = timelineResult.success && timelineResult.data
      ? timelineResult.data
      : { positions: {}, connections: {} };

    const characters: Character[] = [];
    const allScenes: Scene[] = [];
    const allPlotPoints: PlotPoint[] = [];
    let allTags: Tag[] = [];

    for (const { fileName, content } of result.outlines) {
      const filePath = `${folderPath}/${fileName}`;
      const outline = parseOutlineFile(content, fileName, filePath);

      this.outlineFiles.set(outline.character.id, outline);

      if (!characters.some(c => c.id === outline.character.id)) {
        characters.push(outline.character);
      }

      // Apply timeline positions and word counts from timeline.json
      for (const scene of outline.scenes) {
        const key = `${outline.character.id}:${scene.sceneNumber}`;
        const position = timelineData.positions[key];
        scene.timelinePosition = position !== undefined ? position : null;
        // Apply word count if saved
        if (timelineData.wordCounts && timelineData.wordCounts[key] !== undefined) {
          scene.wordCount = timelineData.wordCounts[key];
        }
      }

      allScenes.push(...outline.scenes);
      allPlotPoints.push(...outline.plotPoints);

      // Extract all unique tags
      const tagStrings = outline.scenes.flatMap(s => s.tags);
      const newTags = createTagsFromStrings(tagStrings, allTags);
      allTags = [...allTags, ...newTags];
    }

    // Derive project name from folder path
    const projectName = folderPath.split('/').pop() || 'Untitled';

    return {
      projectPath: folderPath,
      projectName,
      characters,
      scenes: allScenes,
      plotPoints: allPlotPoints,
      tags: allTags,
      connections: timelineData.connections || {},
      chapters: timelineData.chapters || [],
      characterColors: timelineData.characterColors || {},
      fontSettings: timelineData.fontSettings || {},
      allFontSettings: timelineData.allFontSettings,
      archivedScenes: timelineData.archivedScenes || [],
      draftContent: timelineData.draftContent || {},
      metadataFieldDefs: timelineData.metadataFieldDefs || [],
      sceneMetadata: timelineData.sceneMetadata || {},
      drafts: timelineData.drafts || {},
      wordCountGoal: timelineData.wordCountGoal || 0,
      scratchpad: timelineData.scratchpad || {},
    };
  }

  async saveCharacterOutline(character: Character, plotPoints: PlotPoint[], scenes: Scene[]): Promise<void> {
    const outline = this.outlineFiles.get(character.id);
    if (!outline) {
      throw new Error('Character outline not found');
    }

    // Update the outline with new data
    outline.character = character;
    outline.plotPoints = plotPoints.filter(p => p.characterId === character.id);
    outline.scenes = scenes.filter(s => s.characterId === character.id);

    const content = serializeOutline(outline);
    const result = await window.electronAPI.saveFile(character.filePath, content);

    if (!result.success) {
      throw new Error(result.error || 'Failed to save file');
    }

    // Update raw content
    outline.rawContent = content;
  }

  async createCharacter(folderPath: string, name: string): Promise<Character> {
    const result = await window.electronAPI.createCharacter(folderPath, name);

    if (!result.success || !result.filePath) {
      throw new Error(result.error || 'Failed to create character');
    }

    const character: Character = {
      id: Math.random().toString(36).substring(2, 11),
      name,
      filePath: result.filePath,
    };

    // Create empty outline for this character
    const outline: OutlineFile = {
      character,
      plotPoints: [{
        id: Math.random().toString(36).substring(2, 11),
        characterId: character.id,
        title: 'Act 1',
        expectedSceneCount: null,
        description: '',
        order: 0,
      }],
      scenes: [{
        id: Math.random().toString(36).substring(2, 11),
        characterId: character.id,
        sceneNumber: 1,
        title: 'First scene description here',
        content: 'First scene description here',
        tags: [],
        timelinePosition: null, // New scenes start unbraided
        isHighlighted: false,
        notes: [],
        plotPointId: null,
      }],
      rawContent: '',
    };

    this.outlineFiles.set(character.id, outline);
    return character;
  }

  async saveTimeline(positions: Record<string, number>, connections: Record<string, string[]>, chapters: BraidedChapter[], characterColors?: Record<string, string>, wordCounts?: Record<string, number>, fontSettings?: FontSettings, archivedScenes?: ArchivedScene[], draftContent?: Record<string, string>, metadataFieldDefs?: MetadataFieldDef[], sceneMetadata?: Record<string, Record<string, string | string[]>>, drafts?: Record<string, DraftVersion[]>, wordCountGoal?: number, allFontSettings?: AllFontSettings, scratchpad?: Record<string, string>): Promise<void> {
    if (!this.projectPath) {
      throw new Error('No project loaded');
    }

    const result = await window.electronAPI.saveTimeline(this.projectPath, { positions, connections, chapters, characterColors, wordCounts, fontSettings, archivedScenes, draftContent, metadataFieldDefs, sceneMetadata, drafts, wordCountGoal, allFontSettings, scratchpad });
    if (!result.success) {
      throw new Error(result.error || 'Failed to save timeline');
    }
  }

  async getRecentProjects(): Promise<RecentProject[]> {
    const result = await window.electronAPI.getRecentProjects();
    return result.projects || [];
  }

  async addRecentProject(project: RecentProject): Promise<void> {
    await window.electronAPI.addRecentProject(project);
  }

  async selectSaveLocation(): Promise<string | null> {
    return await window.electronAPI.selectSaveLocation();
  }

  async createProject(parentPath: string, projectName: string, template: ProjectTemplate): Promise<string | null> {
    const result = await window.electronAPI.createProject(parentPath, projectName, template);
    if (!result.success) {
      throw new Error(result.error || 'Failed to create project');
    }
    return result.projectPath;
  }

  async deleteFile(filePath: string): Promise<void> {
    const result = await window.electronAPI.deleteFile(filePath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete file');
    }
  }

  // Notes
  async loadNotesIndex(projectPath: string): Promise<NotesIndex> {
    const result = await window.electronAPI.loadNotesIndex(projectPath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to load notes index');
    }
    return result.data;
  }

  async saveNotesIndex(projectPath: string, data: NotesIndex): Promise<void> {
    const result = await window.electronAPI.saveNotesIndex(projectPath, data);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save notes index');
    }
  }

  async readNote(projectPath: string, fileName: string): Promise<string> {
    const result = await window.electronAPI.readNote(projectPath, fileName);
    if (!result.success) {
      throw new Error(result.error || 'Failed to read note');
    }
    return result.data;
  }

  async saveNote(projectPath: string, fileName: string, content: string): Promise<void> {
    const result = await window.electronAPI.saveNote(projectPath, fileName, content);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save note');
    }
  }

  async createNote(projectPath: string, fileName: string): Promise<void> {
    const result = await window.electronAPI.createNote(projectPath, fileName);
    if (!result.success) {
      throw new Error(result.error || 'Failed to create note');
    }
  }

  async deleteNote(projectPath: string, fileName: string): Promise<void> {
    const result = await window.electronAPI.deleteNote(projectPath, fileName);
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete note');
    }
  }

  async renameNote(projectPath: string, oldFileName: string, newFileName: string): Promise<void> {
    const result = await window.electronAPI.renameNote(projectPath, oldFileName, newFileName);
    if (!result.success) {
      throw new Error(result.error || 'Failed to rename note');
    }
  }

  // Note images
  async saveNoteImage(projectPath: string, imageData: string, fileName: string): Promise<string> {
    const result = await window.electronAPI.saveNoteImage(projectPath, imageData, fileName);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save image');
    }
    return result.data!;
  }

  async selectNoteImage(projectPath: string): Promise<string | null> {
    const result = await window.electronAPI.selectNoteImage(projectPath);
    if (!result.success) {
      if (result.error === 'cancelled') return null;
      throw new Error(result.error || 'Failed to select image');
    }
    return result.data!;
  }
}

// Export singleton instance
export const dataService: DataService = new ElectronDataService();
