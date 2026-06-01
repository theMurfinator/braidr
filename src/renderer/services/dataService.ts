import { Character, Scene, PlotPoint, ProjectData, Chapter, RecentProject, ProjectTemplate, FontSettings, AllFontSettings, ArchivedScene, MetadataFieldDef, DraftVersion, NotesIndex, SceneComment, Task, TaskFieldDef, TaskViewConfig, TableViewConfig, WorldEvent, BranchIndex, BranchCompareData, SaveTimelinePayload, Act, CharacterPsychology } from '../../shared/types';
import { CapacitorDataService } from './capacitorDataService';
import { acquireLock, releaseLock, startHeartbeat, stopHeartbeat, LockData } from './projectLock';

// Data service interface - this abstraction allows swapping to a web API later
export interface DataService {
  selectProjectFolder(): Promise<string | null>;
  selectBraidrFile(): Promise<string | null>;
  loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: Chapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string>; sceneComments: Record<string, SceneComment[]>; tasks: Task[]; taskFieldDefs: TaskFieldDef[]; taskViews: TaskViewConfig[]; taskColumnWidths: Record<string, number>; taskVisibleColumns?: string[]; inlineMetadataFields?: string[]; showInlineLabels?: boolean; timelineDates: Record<string, string>; worldEvents: WorldEvent[]; _migrated?: boolean }>;
  saveCharacterOutline(character: Character, plotPoints: PlotPoint[], scenes: Scene[]): Promise<void>;
  createCharacter(folderPath: string, name: string): Promise<Character>;
  saveTimeline(payload: SaveTimelinePayload): Promise<void>;
  getChapters(): Promise<Chapter[]>;
  saveChapter(chapter: Chapter): Promise<void>;
  deleteChapter(chapterId: string): Promise<void>;
  reorderChapters(orderedIds: string[]): Promise<void>;
  assignSceneToChapter(sceneId: string, chapterId: string | null, sceneOrder: number): Promise<void>;
  loadTableViews(): Promise<TableViewConfig[]>;
  saveTableViews(views: TableViewConfig[]): Promise<void>;
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
  getBranchSceneDraft(projectPath: string, branchName: string | null, sceneId: string): Promise<string>;
  // Lock
  acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }>;
  releaseProjectLock(projectPath: string): Promise<void>;
  startLockHeartbeat(projectPath: string, onTakenOver: (byDeviceName: string) => void): void;
  stopLockHeartbeat(): void;
  // Acts
  loadActs(characterId: string): Promise<Act[]>;
  saveAct(act: Act): Promise<void>;
  deleteAct(actId: string): Promise<void>;
  reorderActs(characterId: string, orderedIds: string[]): Promise<void>;
  // Character psychology
  loadCharacterPsychology(characterId: string): Promise<CharacterPsychology | null>;
  saveCharacterPsychology(psychology: CharacterPsychology): Promise<void>;
  // Arc field saves
  saveSceneArcFields(sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; synopsis?: string; startingState?: string; endingState?: string }): Promise<void>;
  savePlotPointArcFields(plotPointId: string, fields: { actId?: string | null; startingState?: string; endingState?: string; polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; title?: string; description?: string }): Promise<void>;
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

  async loadProject(folderPath: string): Promise<ProjectData & { connections: Record<string, string[]>; chapters: Chapter[]; characterColors: Record<string, string>; fontSettings: FontSettings; allFontSettings?: AllFontSettings; archivedScenes: ArchivedScene[]; draftContent: Record<string, string>; metadataFieldDefs: MetadataFieldDef[]; sceneMetadata: Record<string, Record<string, string | string[]>>; drafts: Record<string, DraftVersion[]>; wordCountGoal: number; scratchpad: Record<string, string>; sceneComments: Record<string, SceneComment[]>; tasks: Task[]; taskFieldDefs: TaskFieldDef[]; taskViews: TaskViewConfig[]; taskColumnWidths: Record<string, number>; taskVisibleColumns?: string[]; inlineMetadataFields?: string[]; showInlineLabels?: boolean; timelineDates: Record<string, string>; worldEvents: WorldEvent[]; _migrated?: boolean }> {
    const formatResult = await window.electronAPI.detectProjectFormat(folderPath);
    if (formatResult?.format === 'braidr' && formatResult.braidrPath) {
      const result = await window.electronAPI.braidrLoadProject(formatResult.braidrPath);
      if (!result.success) throw new Error(result.error || 'Failed to load .braidr project');
      // Use the branch file if a branch is active; otherwise fall back to the main file
      this.braidrPath = (result.data as any).activeBraidrPath ?? formatResult.braidrPath;
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

  async getChapters(): Promise<Chapter[]> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrGetChapters(this.braidrPath);
    if (!result.success) throw new Error(result.error || 'Failed to get chapters');
    return result.chapters as Chapter[];
  }

  async saveChapter(chapter: Chapter): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveChapter(this.braidrPath, chapter);
    if (!result.success) throw new Error(result.error || 'Failed to save chapter');
  }

  async deleteChapter(chapterId: string): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrDeleteChapter(this.braidrPath, chapterId);
    if (!result.success) throw new Error(result.error || 'Failed to delete chapter');
  }

  async reorderChapters(orderedIds: string[]): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrReorderChapters(this.braidrPath, orderedIds);
    if (!result.success) throw new Error(result.error || 'Failed to reorder chapters');
  }

  async assignSceneToChapter(sceneId: string, chapterId: string | null, sceneOrder: number): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrAssignSceneToChapter(this.braidrPath, sceneId, chapterId, sceneOrder);
    if (!result.success) throw new Error(result.error || 'Failed to assign scene to chapter');
  }

  async loadTableViews(): Promise<TableViewConfig[]> {
    if (!this.braidrPath) return [];
    const result = await window.electronAPI.braidrLoadTableViews(this.braidrPath);
    if (!result?.success || !result.data) return [];
    return (result.data as Array<{ id: string; name: string; config_json: string; created_at: number }>).map(row => ({
      ...JSON.parse(row.config_json),
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    }));
  }

  async saveTableViews(views: TableViewConfig[]): Promise<void> {
    if (!this.braidrPath) return;
    const rows = views.map(v => ({
      id: v.id,
      name: v.name,
      config_json: JSON.stringify(v),
      created_at: v.createdAt,
    }));
    await window.electronAPI.braidrSaveTableViews(this.braidrPath, rows);
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

  async getBranchSceneDraft(projectPath: string, branchName: string | null, sceneId: string): Promise<string> {
    const result = await window.electronAPI.branchesGetSceneDraft(projectPath, branchName, sceneId);
    if (!result.success) return '';
    return result.data ?? '';
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

  async loadActs(characterId: string): Promise<Act[]> {
    if (!this.braidrPath) return [];
    const result = await window.electronAPI.braidrLoadActs(this.braidrPath, characterId);
    if (!result?.success || !result.data) return [];
    return (result.data as any[]).map(r => ({
      id: r.id, characterId: r.character_id, name: r.name,
      startingState: r.starting_state, endingState: r.ending_state,
      polarity: r.polarity, transformation: r.transformation, dilemma: r.dilemma, propellingAction: r.propelling_action, order: r.display_order,
    }));
  }

  async saveAct(act: Act): Promise<void> {
    if (!this.braidrPath) return;
    await window.electronAPI.braidrSaveAct(this.braidrPath, {
      id: act.id, character_id: act.characterId, name: act.name,
      starting_state: act.startingState, ending_state: act.endingState,
      polarity: act.polarity, transformation: act.transformation,
      dilemma: act.dilemma, propelling_action: act.propellingAction,
      display_order: act.order, created_at: Date.now(),
    });
  }

  async deleteAct(actId: string): Promise<void> {
    if (!this.braidrPath) return;
    await window.electronAPI.braidrDeleteAct(this.braidrPath, actId);
  }

  async reorderActs(characterId: string, orderedIds: string[]): Promise<void> {
    if (!this.braidrPath) return;
    await window.electronAPI.braidrReorderActs(this.braidrPath, characterId, orderedIds);
  }

  async loadCharacterPsychology(characterId: string): Promise<CharacterPsychology | null> {
    if (!this.braidrPath) return null;
    const result = await window.electronAPI.braidrLoadCharacterPsychology(this.braidrPath, characterId);
    if (!result?.success || !result.data) return null;
    const r = result.data as any;
    return {
      characterId: r.character_id,
      novelStartingState: r.novel_starting_state, novelEndingState: r.novel_ending_state,
      novelPolarity: r.novel_polarity, novelTransformation: r.novel_transformation,
      novelDilemma: r.novel_dilemma, novelPropellingAction: r.novel_propelling_action,
      wound: r.wound, lie: r.lie, deepestFear: r.deepest_fear,
      limitingBelief: r.limiting_belief, thorn: r.thorn, copingTool: r.coping_tool,
      whisperOfGrace: r.whisper_of_grace, surfaceWant: r.surface_want,
      soulsLonging: r.souls_longing, bitterNeed: r.bitter_need,
      capitalTTruth: r.capital_t_truth, arcSummary: r.arc_summary,
      theme: r.theme, antiTheme: r.anti_theme, finalReaderExperience: r.final_reader_experience,
    };
  }

  async saveCharacterPsychology(p: CharacterPsychology): Promise<void> {
    if (!this.braidrPath) return;
    await window.electronAPI.braidrSaveCharacterPsychology(this.braidrPath, {
      character_id: p.characterId,
      novel_starting_state: p.novelStartingState, novel_ending_state: p.novelEndingState,
      novel_polarity: p.novelPolarity, novel_transformation: p.novelTransformation,
      novel_dilemma: p.novelDilemma, novel_propelling_action: p.novelPropellingAction,
      wound: p.wound, lie: p.lie, deepest_fear: p.deepestFear,
      limiting_belief: p.limitingBelief, thorn: p.thorn, coping_tool: p.copingTool,
      whisper_of_grace: p.whisperOfGrace, surface_want: p.surfaceWant,
      souls_longing: p.soulsLonging, bitter_need: p.bitterNeed,
      capital_t_truth: p.capitalTTruth, arc_summary: p.arcSummary,
      theme: p.theme, anti_theme: p.antiTheme, final_reader_experience: p.finalReaderExperience,
    });
  }

  async saveSceneArcFields(sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; synopsis?: string; startingState?: string; endingState?: string }): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSaveSceneArcFields(this.braidrPath, sceneId, fields) as any;
    if (!result.success) throw new Error(result.error || 'Failed to save scene arc fields');
  }

  async savePlotPointArcFields(plotPointId: string, fields: { actId?: string | null; startingState?: string; endingState?: string; polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; title?: string; description?: string }): Promise<void> {
    if (!this.braidrPath) throw new Error('No project loaded');
    const result = await window.electronAPI.braidrSavePlotPointArcFields(this.braidrPath, plotPointId, fields) as any;
    if (!result.success) throw new Error(result.error || 'Failed to save plot point arc fields');
  }
}

// Export singleton instance — use CapacitorDataService on iPad, ElectronDataService on desktop
const isCapacitor = typeof (window as any).Capacitor !== 'undefined'
  && (window as any).Capacitor.isNativePlatform?.();
export const dataService: DataService = isCapacitor
  ? new CapacitorDataService()
  : new ElectronDataService();
