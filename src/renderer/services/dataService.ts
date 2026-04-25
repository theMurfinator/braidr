import { Character, Scene, PlotPoint, Tag, OutlineFile, ProjectData, TimelineData, BraidedChapter, RecentProject, ProjectTemplate, FontSettings, AllFontSettings, ArchivedScene, MetadataFieldDef, DraftVersion, NotesIndex, SceneComment, Task, TaskFieldDef, TaskViewConfig, WorldEvent, BranchIndex, BranchCompareData } from '../../shared/types';
import { parseOutlineFile, serializeOutline, createTagsFromStrings } from './parser';
import { migrateSceneKeys } from './migration';
import { CapacitorDataService } from './capacitorDataService';
import { acquireLock, releaseLock, startHeartbeat, stopHeartbeat, LockData } from './projectLock';

// Data service interface - this abstraction allows swapping to a web API later
export interface DataService {
  selectProjectFolder(): Promise<string | null>;
  loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: BraidedChapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string>; sceneComments: Record<string, SceneComment[]>; tasks: Task[]; taskFieldDefs: TaskFieldDef[]; taskViews: TaskViewConfig[]; taskColumnWidths: Record<string, number>; taskVisibleColumns?: string[]; inlineMetadataFields?: string[]; showInlineLabels?: boolean; timelineDates: Record<string, string>; worldEvents: WorldEvent[]; _migrated?: boolean }>;
  saveCharacterOutline(character: Character, plotPoints: PlotPoint[], scenes: Scene[]): Promise<void>;
  createCharacter(folderPath: string, name: string): Promise<Character>;
  saveTimeline(positions: Record<string, number>, connections: Record<string, string[]>, chapters: BraidedChapter[], characterColors?: Record<string, string>, wordCounts?: Record<string, number>, fontSettings?: FontSettings, archivedScenes?: ArchivedScene[], metadataFieldDefs?: MetadataFieldDef[], sceneMetadata?: Record<string, Record<string, string | string[]>>, wordCountGoal?: number, allFontSettings?: AllFontSettings, tasks?: Task[], taskFieldDefs?: TaskFieldDef[], taskViews?: TaskViewConfig[], inlineMetadataFields?: string[], showInlineLabels?: boolean, taskColumnWidths?: Record<string, number>, taskVisibleColumns?: string[], timelineDates?: Record<string, string>, worldEvents?: WorldEvent[], timelineEndDates?: Record<string, string>, tags?: Tag[]): Promise<void>;
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
  // Per-scene content (extracted from timeline.json)
  readDraft(projectPath: string, sceneId: string): Promise<string>;
  saveDraft(projectPath: string, sceneId: string, content: string): Promise<void>;
  readScratchpad(projectPath: string, sceneId: string): Promise<string>;
  saveScratchpad(projectPath: string, sceneId: string, content: string): Promise<void>;
  readDraftVersions(projectPath: string, sceneId: string): Promise<DraftVersion[]>;
  saveDraftVersions(projectPath: string, sceneId: string, versions: DraftVersion[]): Promise<void>;
  readSceneComments(projectPath: string, sceneId: string): Promise<SceneComment[]>;
  saveSceneComments(projectPath: string, sceneId: string, comments: SceneComment[]): Promise<void>;
  // Conflict detection (iPad companion)
  listProjectFiles?(projectPath: string): Promise<string[]>;
  // Branches
  listBranches(projectPath: string): Promise<BranchIndex>;
  createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex>;
  switchBranch(projectPath: string, name: string | null): Promise<BranchIndex>;
  deleteBranch(projectPath: string, name: string): Promise<BranchIndex>;
  mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void>;
  compareBranches(projectPath: string, leftBranch: string | null, rightBranch: string | null): Promise<BranchCompareData>;
  // Lock
  acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }>;
  releaseProjectLock(projectPath: string): Promise<void>;
  startLockHeartbeat(projectPath: string, onTakenOver: (byDeviceName: string) => void): void;
  stopLockHeartbeat(): void;
}

// Local file system implementation (Electron)
class ElectronDataService implements DataService {
  private projectPath: string | null = null;
  private activeBranch: string | null = null;
  private outlineFiles: Map<string, OutlineFile> = new Map();
  private deviceInfo: { deviceId: string; deviceName: string } | null = null;

  async selectProjectFolder(): Promise<string | null> {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      this.projectPath = path;
    }
    return path;
  }

  async loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: BraidedChapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string>; sceneComments: Record<string, SceneComment[]>; tasks: Task[]; taskFieldDefs: TaskFieldDef[]; taskViews: TaskViewConfig[]; taskColumnWidths: Record<string, number>; taskVisibleColumns?: string[]; inlineMetadataFields?: string[]; showInlineLabels?: boolean; timelineDates: Record<string, string>; worldEvents: WorldEvent[]; _migrated?: boolean }> {
    this.projectPath = folderPath;
    const branchIndex = await this.listBranches(folderPath);
    this.activeBranch = branchIndex.activeBranch;

    const result = await window.electronAPI.readProject(folderPath);

    if (!result.success || !result.outlines) {
      throw new Error(result.error || 'Failed to load project');
    }

    // If a branch is active, re-read outlines from the branch folder
    if (this.activeBranch) {
      const branchOutlines = await window.electronAPI.readProject(
        folderPath + '/branches/' + this.activeBranch
      );
      if (branchOutlines.success && branchOutlines.outlines) {
        result.outlines = branchOutlines.outlines;
      }
    }

    // Load timeline data
    const timelineResult = await window.electronAPI.loadTimeline(folderPath);
    let timelineData: TimelineData = timelineResult.success && timelineResult.data
      ? timelineResult.data
      : { positions: {}, connections: {} };

    // Override positions if on a branch
    if (this.activeBranch) {
      const branchPosResult = await window.electronAPI.branchesReadPositions(folderPath, this.activeBranch);
      if (branchPosResult.success && branchPosResult.data) {
        timelineData = { ...timelineData, positions: branchPosResult.data };
      }
    }

    // Load per-scene content from individual files
    const perSceneResult = await window.electronAPI.readAllPerSceneContent(folderPath);
    const perSceneContent = perSceneResult.success && perSceneResult.data
      ? perSceneResult.data
      : { draftContent: {}, scratchpad: {}, drafts: {}, sceneComments: {} };

    const characters: Character[] = [];
    const allScenes: Scene[] = [];
    const allPlotPoints: PlotPoint[] = [];

    // Load saved tags from timeline.json (preserves user-assigned categories)
    const savedTags: Tag[] = timelineData.tags || [];
    const savedTagMap = new Map(savedTags.map(t => [t.name, t]));

    for (const { fileName, content } of result.outlines) {
      const filePath = `${folderPath}/${fileName}`;
      const outline = parseOutlineFile(content, fileName, filePath);

      this.outlineFiles.set(outline.character.id, outline);

      if (!characters.some(c => c.id === outline.character.id)) {
        characters.push(outline.character);
      }

      allScenes.push(...outline.scenes);
      allPlotPoints.push(...outline.plotPoints);
    }

    // Build tags: use saved categories for known tags, only infer for truly new ones
    const seenNames = new Set<string>();
    let allTags: Tag[] = [];
    const allTagStrings = allScenes.flatMap(s => s.tags);
    for (const name of allTagStrings) {
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      const saved = savedTagMap.get(name);
      if (saved) {
        allTags.push(saved);
      } else {
        allTags.push(...createTagsFromStrings([name], allTags));
      }
    }

    // Migrate legacy keys (characterId:sceneNumber) to stable scene IDs
    const migration = migrateSceneKeys(allScenes, timelineData);
    timelineData = migration.timelineData;

    // Apply timeline positions and word counts using scene.id as key
    for (const scene of allScenes) {
      const position = timelineData.positions[scene.id];
      scene.timelinePosition = position !== undefined ? position : null;
      if (timelineData.wordCounts && timelineData.wordCounts[scene.id] !== undefined) {
        scene.wordCount = timelineData.wordCounts[scene.id];
      }
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
      draftContent: Object.keys(perSceneContent.draftContent).length > 0
        ? perSceneContent.draftContent
        : (timelineData.draftContent || {}),
      metadataFieldDefs: timelineData.metadataFieldDefs || [],
      sceneMetadata: timelineData.sceneMetadata || {},
      drafts: Object.keys(perSceneContent.drafts).length > 0
        ? perSceneContent.drafts
        : (timelineData.drafts || {}),
      wordCountGoal: timelineData.wordCountGoal || 0,
      scratchpad: Object.keys(perSceneContent.scratchpad).length > 0
        ? perSceneContent.scratchpad
        : (timelineData.scratchpad || {}),
      sceneComments: Object.keys(perSceneContent.sceneComments).length > 0
        ? perSceneContent.sceneComments
        : (timelineData.sceneComments || {}),
      tasks: timelineData.tasks || [],
      taskFieldDefs: timelineData.taskFieldDefs || [],
      taskViews: timelineData.taskViews || [],
      taskColumnWidths: timelineData.taskColumnWidths || {},
      taskVisibleColumns: timelineData.taskVisibleColumns,
      inlineMetadataFields: timelineData.inlineMetadataFields,
      showInlineLabels: timelineData.showInlineLabels,
      timelineDates: timelineData.timelineDates || {},
      worldEvents: timelineData.worldEvents || [],
      _migrated: migration.migrated,
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
    let savePath = character.filePath;
    if (this.activeBranch && this.projectPath) {
      const fileName = character.filePath.split('/').pop() || character.filePath.split('\\').pop() || '';
      savePath = this.projectPath + '/branches/' + this.activeBranch + '/' + fileName;
    }
    const result = await window.electronAPI.saveFile(savePath, content);

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

  async saveTimeline(positions: Record<string, number>, connections: Record<string, string[]>, chapters: BraidedChapter[], characterColors?: Record<string, string>, wordCounts?: Record<string, number>, fontSettings?: FontSettings, archivedScenes?: ArchivedScene[], metadataFieldDefs?: MetadataFieldDef[], sceneMetadata?: Record<string, Record<string, string | string[]>>, wordCountGoal?: number, allFontSettings?: AllFontSettings, tasks?: Task[], taskFieldDefs?: TaskFieldDef[], taskViews?: TaskViewConfig[], inlineMetadataFields?: string[], showInlineLabels?: boolean, taskColumnWidths?: Record<string, number>, taskVisibleColumns?: string[], timelineDates?: Record<string, string>, worldEvents?: WorldEvent[], timelineEndDates?: Record<string, string>, tags?: Tag[]): Promise<void> {
    if (!this.projectPath) {
      throw new Error('No project loaded');
    }

    // Save positions to branch positions.json when a branch is active
    if (this.activeBranch) {
      await window.electronAPI.branchesSavePositions(this.projectPath, this.activeBranch, positions);
    }

    const result = await window.electronAPI.saveTimeline(this.projectPath, { positions, connections, chapters, characterColors, wordCounts, fontSettings, archivedScenes, metadataFieldDefs, sceneMetadata, wordCountGoal, allFontSettings, tasks, taskFieldDefs, taskViews, inlineMetadataFields, showInlineLabels, taskColumnWidths, taskVisibleColumns, timelineDates, worldEvents, timelineEndDates, tags });
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

  // Per-scene content
  async readDraft(projectPath: string, sceneId: string): Promise<string> {
    const result = await window.electronAPI.readDraft(projectPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read draft');
    return result.data;
  }

  async saveDraft(projectPath: string, sceneId: string, content: string): Promise<void> {
    const result = await window.electronAPI.saveDraft(projectPath, sceneId, content);
    if (!result.success) throw new Error(result.error || 'Failed to save draft');
  }

  async readScratchpad(projectPath: string, sceneId: string): Promise<string> {
    const result = await window.electronAPI.readScratchpad(projectPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read scratchpad');
    return result.data;
  }

  async saveScratchpad(projectPath: string, sceneId: string, content: string): Promise<void> {
    const result = await window.electronAPI.saveScratchpad(projectPath, sceneId, content);
    if (!result.success) throw new Error(result.error || 'Failed to save scratchpad');
  }

  async readDraftVersions(projectPath: string, sceneId: string): Promise<DraftVersion[]> {
    const result = await window.electronAPI.readDraftVersions(projectPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read draft versions');
    return result.data;
  }

  async saveDraftVersions(projectPath: string, sceneId: string, versions: DraftVersion[]): Promise<void> {
    const result = await window.electronAPI.saveDraftVersions(
      projectPath, sceneId, JSON.stringify(versions, null, 2)
    );
    if (!result.success) throw new Error(result.error || 'Failed to save draft versions');
  }

  async readSceneComments(projectPath: string, sceneId: string): Promise<SceneComment[]> {
    const result = await window.electronAPI.readSceneComments(projectPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read scene comments');
    return result.data;
  }

  async saveSceneComments(projectPath: string, sceneId: string, comments: SceneComment[]): Promise<void> {
    const result = await window.electronAPI.saveSceneComments(
      projectPath, sceneId, JSON.stringify(comments, null, 2)
    );
    if (!result.success) throw new Error(result.error || 'Failed to save scene comments');
  }

  async listProjectFiles(_projectPath: string): Promise<string[]> {
    return []; // Conflict detection is iPad-only for now
  }

  async listBranches(projectPath: string): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesList(projectPath);
    if (!result.success) throw new Error(result.error || 'Failed to list branches');
    return result.data;
  }

  async createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesCreate(projectPath, name, description);
    if (!result.success) throw new Error(result.error || 'Failed to create branch');
    return result.data;
  }

  async switchBranch(projectPath: string, name: string | null): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesSwitch(projectPath, name);
    if (!result.success) throw new Error(result.error || 'Failed to switch branch');
    this.activeBranch = name;
    return result.data;
  }

  async deleteBranch(projectPath: string, name: string): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesDelete(projectPath, name);
    if (!result.success) throw new Error(result.error || 'Failed to delete branch');
    return result.data;
  }

  async mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void> {
    const result = await window.electronAPI.branchesMerge(projectPath, branchName, sceneIds);
    if (!result.success) throw new Error(result.error || 'Failed to merge branch');
  }

  async compareBranches(projectPath: string, leftBranch: string | null, rightBranch: string | null): Promise<BranchCompareData> {
    const result = await window.electronAPI.branchesCompare(projectPath, leftBranch, rightBranch);
    if (!result.success) throw new Error(result.error || 'Failed to compare branches');
    return result.data;
  }

  private async getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
    if (this.deviceInfo) return this.deviceInfo;
    const result = await window.electronAPI.getDeviceInfo();
    if (!result.success) throw new Error('Failed to get device info');
    this.deviceInfo = result.data;
    return result.data;
  }

  private readLock(projectPath: string): () => Promise<LockData | null> {
    return async () => {
      const result = await window.electronAPI.lockRead(projectPath);
      return result.success ? result.data : null;
    };
  }

  private writeLock(projectPath: string): (data: LockData) => Promise<void> {
    return async (data: LockData) => {
      const result = await window.electronAPI.lockWrite(projectPath, data);
      if (!result.success) throw new Error(result.error || 'Failed to write lock');
    };
  }

  private deleteLock(projectPath: string): () => Promise<void> {
    return async () => {
      await window.electronAPI.lockDelete(projectPath);
    };
  }

  async acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }> {
    const { deviceId, deviceName } = await this.getDeviceInfo();
    return acquireLock(deviceId, deviceName, this.readLock(projectPath), this.writeLock(projectPath), force);
  }

  async releaseProjectLock(projectPath: string): Promise<void> {
    stopHeartbeat();
    await releaseLock(this.deleteLock(projectPath));
  }

  startLockHeartbeat(projectPath: string, onTakenOver: (byDeviceName: string) => void): void {
    this.getDeviceInfo().then(({ deviceId, deviceName }) => {
      startHeartbeat(deviceId, deviceName, this.readLock(projectPath), this.writeLock(projectPath), onTakenOver);
    });
  }

  stopLockHeartbeat(): void {
    stopHeartbeat();
  }
}

// Export singleton instance — use CapacitorDataService on iPad, ElectronDataService on desktop
const isCapacitor = typeof (window as any).Capacitor !== 'undefined'
  && (window as any).Capacitor.isNativePlatform?.();
export const dataService: DataService = isCapacitor
  ? new CapacitorDataService()
  : new ElectronDataService();
