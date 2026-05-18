import { Character, Scene, PlotPoint, ProjectData, BraidedChapter, RecentProject, ProjectTemplate, FontSettings, AllFontSettings, ArchivedScene, MetadataFieldDef, DraftVersion, NotesIndex, SceneComment, Task, TaskFieldDef, TaskViewConfig, WorldEvent, BranchIndex, BranchCompareData, SaveTimelinePayload } from '../../shared/types';
import { CapacitorDataService } from './capacitorDataService';
import { acquireLock, releaseLock, startHeartbeat, stopHeartbeat, LockData } from './projectLock';

// Data service interface - this abstraction allows swapping to a web API later
export interface DataService {
  selectProjectFolder(): Promise<string | null>;
  selectBraidrFile(): Promise<string | null>;
  loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: BraidedChapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string>; sceneComments: Record<string, SceneComment[]>; tasks: Task[]; taskFieldDefs: TaskFieldDef[]; taskViews: TaskViewConfig[]; taskColumnWidths: Record<string, number>; taskVisibleColumns?: string[]; inlineMetadataFields?: string[]; showInlineLabels?: boolean; timelineDates: Record<string, string>; worldEvents: WorldEvent[]; _migrated?: boolean }>;
  saveCharacterOutline(character: Character, plotPoints: PlotPoint[], scenes: Scene[]): Promise<void>;
  createCharacter(folderPath: string, name: string): Promise<Character>;
  saveTimeline(payload: SaveTimelinePayload): Promise<void>;
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

// Local file system implementation (Electron) — SQLite .braidr format only
class ElectronDataService implements DataService {
  private braidrPath: string | null = null;
  private deviceInfo: { deviceId: string; deviceName: string } | null = null;

  async selectProjectFolder(): Promise<string | null> {
    const path = await window.electronAPI.selectFolder();
    return path;
  }

  async selectBraidrFile(): Promise<string | null> {
    return window.electronAPI.selectBraidrFile();
  }

  async loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: BraidedChapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string>; sceneComments: Record<string, SceneComment[]>; tasks: Task[]; taskFieldDefs: TaskFieldDef[]; taskViews: TaskViewConfig[]; taskColumnWidths: Record<string, number>; taskVisibleColumns?: string[]; inlineMetadataFields?: string[]; showInlineLabels?: boolean; timelineDates: Record<string, string>; worldEvents: WorldEvent[]; _migrated?: boolean }> {
    const formatResult = await window.electronAPI.detectProjectFormat(folderPath);
    if (formatResult?.format === 'braidr' && formatResult.braidrPath) {
      this.braidrPath = formatResult.braidrPath;
      const result = await window.electronAPI.braidrLoadProject(formatResult.braidrPath);
      if (!result.success) throw new Error(result.error || 'Failed to load .braidr project');
      return result.data;
    }
    throw new Error('Not a .braidr project. Please convert your project first.');
  }

  async saveCharacterOutline(character: Character, plotPoints: PlotPoint[], scenes: Scene[]): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveCharacter(this.braidrPath, { character, plotPoints, scenes });
    if (!result.success) throw new Error(result.error || 'Failed to save character');
  }

  async createCharacter(_folderPath: string, name: string): Promise<Character> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrCreateCharacter(this.braidrPath, name);
    if (!result.success) throw new Error(result.error || 'Failed to create character');
    return result.character as Character;
  }

  async saveTimeline(payload: SaveTimelinePayload): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveTimeline(this.braidrPath, payload);
    if (!result.success) throw new Error(result.error || 'Failed to save timeline');
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
  async loadNotesIndex(_projectPath: string): Promise<NotesIndex> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrLoadNotesIndex(this.braidrPath);
    if (!result.success) throw new Error(result.error || 'Failed to load notes index');
    return result.data;
  }

  async saveNotesIndex(_projectPath: string, data: NotesIndex): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveNotesIndex(this.braidrPath, data);
    if (!result.success) throw new Error(result.error || 'Failed to save notes index');
  }

  async readNote(_projectPath: string, fileName: string): Promise<string> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrReadNote(this.braidrPath, fileName);
    if (!result.success) throw new Error(result.error || 'Failed to read note');
    return result.data;
  }

  async saveNote(_projectPath: string, fileName: string, content: string): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveNote(this.braidrPath, fileName, content);
    if (!result.success) throw new Error(result.error || 'Failed to save note');
  }

  async createNote(_projectPath: string, fileName: string): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    // fileName is the note ID in SQLite mode; title defaults to empty
    const result = await window.electronAPI.braidrCreateNote(this.braidrPath, fileName, '', null);
    if (!result.success) throw new Error(result.error || 'Failed to create note');
  }

  async deleteNote(_projectPath: string, fileName: string): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrDeleteNote(this.braidrPath, fileName);
    if (!result.success) throw new Error(result.error || 'Failed to delete note');
  }

  async renameNote(_projectPath: string, _oldFileName: string, _newFileName: string): Promise<void> {
    // Note filenames are IDs in SQLite mode; title changes go through saveNotesIndex
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
  async readDraft(_projectPath: string, sceneId: string): Promise<string> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrReadDraft(this.braidrPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read draft');
    return result.data;
  }

  async saveDraft(_projectPath: string, sceneId: string, content: string): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveDraft(this.braidrPath, sceneId, content);
    if (!result.success) throw new Error(result.error || 'Failed to save draft');
  }

  async readScratchpad(_projectPath: string, sceneId: string): Promise<string> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrReadScratchpad(this.braidrPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read scratchpad');
    return result.data;
  }

  async saveScratchpad(_projectPath: string, sceneId: string, content: string): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveScratchpad(this.braidrPath, sceneId, content);
    if (!result.success) throw new Error(result.error || 'Failed to save scratchpad');
  }

  async readDraftVersions(_projectPath: string, sceneId: string): Promise<DraftVersion[]> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrReadDraftVersions(this.braidrPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read draft versions');
    return result.data;
  }

  async saveDraftVersions(_projectPath: string, sceneId: string, versions: DraftVersion[]): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveDraftVersions(this.braidrPath, sceneId, versions);
    if (!result.success) throw new Error(result.error || 'Failed to save draft versions');
  }

  async readSceneComments(_projectPath: string, sceneId: string): Promise<SceneComment[]> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrReadSceneComments(this.braidrPath, sceneId);
    if (!result.success) throw new Error(result.error || 'Failed to read scene comments');
    return result.data;
  }

  async saveSceneComments(_projectPath: string, sceneId: string, comments: SceneComment[]): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveSceneComments(this.braidrPath, sceneId, comments);
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
