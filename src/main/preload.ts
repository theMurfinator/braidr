import { contextBridge, ipcRenderer } from 'electron';

// IPC channel names (duplicated here to avoid import issues in preload context)
const IPC_CHANNELS = {
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
  LOAD_NOTES_INDEX: 'load-notes-index',
  SAVE_NOTES_INDEX: 'save-notes-index',
  READ_NOTE: 'read-note',
  SAVE_NOTE: 'save-note',
  CREATE_NOTE: 'create-note',
  DELETE_NOTE: 'delete-note',
  RENAME_NOTE: 'rename-note',
  SAVE_NOTE_IMAGE: 'save-note-image',
  SELECT_NOTE_IMAGE: 'select-note-image',
  PRINT_TO_PDF: 'print-to-pdf',
  PRINT_PREVIEW: 'print-preview',
  EXPORT_FILE: 'export-file',
  READ_ANALYTICS: 'read-analytics',
  SAVE_ANALYTICS: 'save-analytics',
  GET_LICENSE_STATUS: 'get-license-status',
  ACTIVATE_LICENSE: 'activate-license',
  DEACTIVATE_LICENSE: 'deactivate-license',
  START_TRIAL: 'start-trial',
  OPEN_PURCHASE_URL: 'open-purchase-url',
  OPEN_BILLING_PORTAL: 'open-billing-portal',
  OPEN_FEEDBACK_EMAIL: 'open-feedback-email',
  REFRESH_LICENSE_STATUS: 'refresh-license-status',
  GET_SUBSCRIPTION_DETAILS: 'get-subscription-details',
  CANCEL_SUBSCRIPTION: 'cancel-subscription',
  REACTIVATE_SUBSCRIPTION: 'reactivate-subscription',
  CAPTURE_ANALYTICS_EVENT: 'capture-analytics-event',
  APP_CLOSING: 'app-closing',
  SAFE_TO_CLOSE: 'safe-to-close',
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
  LOCK_READ: 'lock:read',
  LOCK_WRITE: 'lock:write',
  LOCK_DELETE: 'lock:delete',
  GET_DEVICE_INFO: 'get-device-info',
  // SQLite .braidr file operations
  DETECT_PROJECT_FORMAT: 'detect-project-format',
  CONVERT_TO_BRAIDR: 'convert-to-braidr',
  SELECT_BRAIDR_FILE: 'select-braidr-file',
  BRAIDR_LOAD_PROJECT: 'braidr:load-project',
  BRAIDR_MUTATE: 'braidr:mutate',
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
  // Table views
  BRAIDR_LOAD_TABLE_VIEWS: 'braidr:load-table-views',
  BRAIDR_SAVE_TABLE_VIEWS: 'braidr:save-table-views',
  // Acts
  BRAIDR_LOAD_ACTS: 'braidr:load-acts',
  BRAIDR_SAVE_ACT: 'braidr:save-act',
  BRAIDR_SAVE_SCENE_ARC_FIELDS: 'braidr:save-scene-arc-fields',
  BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS: 'braidr:save-plot-point-arc-fields',
  BRAIDR_SAVE_ARC_FIELD_DEFS: 'braidr:save-arc-field-defs',
  BRAIDR_SAVE_ARC_FIELD_VALUES: 'braidr:save-arc-field-values',
  BRAIDR_GET_ARC_UI_PREF: 'braidr:get-arc-ui-pref',
  BRAIDR_SET_ARC_UI_PREF: 'braidr:set-arc-ui-pref',
  BRAIDR_DELETE_ACT: 'braidr:delete-act',
  BRAIDR_REORDER_ACTS: 'braidr:reorder-acts',
  // Character psychology
  BRAIDR_LOAD_CHARACTER_PSYCHOLOGY: 'braidr:load-character-psychology',
  BRAIDR_SAVE_CHARACTER_PSYCHOLOGY: 'braidr:save-character-psychology',
  // Per-scene content (extracted from timeline.json)
  READ_DRAFT: 'read-draft',
  SAVE_DRAFT: 'save-draft',
  READ_SCRATCHPAD: 'read-scratchpad',
  SAVE_SCRATCHPAD: 'save-scratchpad',
  READ_DRAFT_VERSIONS: 'read-draft-versions',
  SAVE_DRAFT_VERSIONS: 'save-draft-versions',
  READ_SCENE_COMMENTS: 'read-scene-comments',
  SAVE_SCENE_COMMENTS: 'save-scene-comments',
  READ_ALL_PER_SCENE_CONTENT: 'read-all-per-scene-content',
} as const;

// Types for preload
interface RecentProject {
  name: string;
  path: string;
  lastOpened: number;
}

type ProjectTemplate = 'blank' | 'three-act' | 'save-the-cat' | 'heros-journey';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),
  readProject: (folderPath: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_PROJECT, folderPath),
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE, filePath, content),
  createCharacter: (folderPath: string, characterName: string) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_CHARACTER, folderPath, characterName),
  loadTimeline: (folderPath: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_TIMELINE, folderPath),
  saveTimeline: (folderPath: string, data: { positions: Record<string, number> }) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_TIMELINE, folderPath, data),
  getRecentProjects: () => ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_PROJECTS),
  addRecentProject: (project: RecentProject) => ipcRenderer.invoke(IPC_CHANNELS.ADD_RECENT_PROJECT, project),
  selectSaveLocation: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_SAVE_LOCATION),
  createProject: (parentPath: string, projectName: string, template: ProjectTemplate) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PROJECT, parentPath, projectName, template),
  deleteFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_FILE, filePath),
  backupProject: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_PROJECT, projectPath),
  // Notes
  loadNotesIndex: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_NOTES_INDEX, projectPath),
  saveNotesIndex: (projectPath: string, data: any) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_NOTES_INDEX, projectPath, data),
  readNote: (projectPath: string, fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_NOTE, projectPath, fileName),
  saveNote: (projectPath: string, fileName: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_NOTE, projectPath, fileName, content),
  createNote: (projectPath: string, fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_NOTE, projectPath, fileName),
  deleteNote: (projectPath: string, fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_NOTE, projectPath, fileName),
  renameNote: (projectPath: string, oldFileName: string, newFileName: string) => ipcRenderer.invoke(IPC_CHANNELS.RENAME_NOTE, projectPath, oldFileName, newFileName),
  saveNoteImage: (projectPath: string, imageData: string, fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_NOTE_IMAGE, projectPath, imageData, fileName),
  selectNoteImage: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.SELECT_NOTE_IMAGE, projectPath),
  printToPDF: (html: string) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_TO_PDF, html),
  exportFile: (data: number[], defaultName: string, filters: { name: string; extensions: string[] }[]) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_FILE, data, defaultName, filters),
  printPreview: (html: string) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_PREVIEW, html),
  // Analytics
  readAnalytics: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_ANALYTICS, projectPath),
  saveAnalytics: (projectPath: string, data: any) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_ANALYTICS, projectPath, data),
  // License
  getLicenseStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LICENSE_STATUS),
  activateLicense: (email: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVATE_LICENSE, email),
  startTrial: (email: string) => ipcRenderer.invoke(IPC_CHANNELS.START_TRIAL, email),
  deactivateLicense: () => ipcRenderer.invoke(IPC_CHANNELS.DEACTIVATE_LICENSE),
  openPurchaseUrl: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PURCHASE_URL),
  openBillingPortal: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_BILLING_PORTAL),
  refreshLicenseStatus: () => ipcRenderer.invoke(IPC_CHANNELS.REFRESH_LICENSE_STATUS),
  openFeedbackEmail: (category: string, message: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FEEDBACK_EMAIL, category, message),
  // Subscription management
  getSubscriptionDetails: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SUBSCRIPTION_DETAILS),
  cancelSubscription: () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_SUBSCRIPTION),
  reactivateSubscription: () => ipcRenderer.invoke(IPC_CHANNELS.REACTIVATE_SUBSCRIPTION),
  // PostHog analytics
  captureAnalyticsEvent: (eventName: string, properties: Record<string, any>) =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_ANALYTICS_EVENT, eventName, properties),
  // Per-scene content
  readDraft: (folderPath: string, sceneId: string) =>
    ipcRenderer.invoke('read-draft', folderPath, sceneId),
  saveDraft: (folderPath: string, sceneId: string, content: string) =>
    ipcRenderer.invoke('save-draft', folderPath, sceneId, content),
  readScratchpad: (folderPath: string, sceneId: string) =>
    ipcRenderer.invoke('read-scratchpad', folderPath, sceneId),
  saveScratchpad: (folderPath: string, sceneId: string, content: string) =>
    ipcRenderer.invoke('save-scratchpad', folderPath, sceneId, content),
  readDraftVersions: (folderPath: string, sceneId: string) =>
    ipcRenderer.invoke('read-draft-versions', folderPath, sceneId),
  saveDraftVersions: (folderPath: string, sceneId: string, versions: string) =>
    ipcRenderer.invoke('save-draft-versions', folderPath, sceneId, versions),
  readSceneComments: (folderPath: string, sceneId: string) =>
    ipcRenderer.invoke('read-scene-comments', folderPath, sceneId),
  saveSceneComments: (folderPath: string, sceneId: string, comments: string) =>
    ipcRenderer.invoke('save-scene-comments', folderPath, sceneId, comments),
  readAllPerSceneContent: (folderPath: string) =>
    ipcRenderer.invoke('read-all-per-scene-content', folderPath),
  // Branches
  branchesList: (projectPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_LIST, projectPath),
  branchesCreate: (projectPath: string, name: string, description?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_CREATE, projectPath, name, description),
  branchesSwitch: (projectPath: string, name: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_SWITCH, projectPath, name),
  branchesDelete: (projectPath: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_DELETE, projectPath, name),
  branchesMerge: (projectPath: string, branchName: string, sceneIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_MERGE, projectPath, branchName, sceneIds),
  branchesCompare: (projectPath: string, leftBranch: string | null, rightBranch: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_COMPARE, projectPath, leftBranch, rightBranch),
  branchesReadPositions: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_READ_POSITIONS, projectPath, branchName),
  branchesSavePositions: (projectPath: string, branchName: string, positions: Record<string, number>) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_SAVE_POSITIONS, projectPath, branchName, positions),
  branchesGetSceneDraft: (projectPath: string, branchName: string | null, sceneId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_GET_SCENE_DRAFT, projectPath, branchName, sceneId),
  // Lock
  lockRead: (projectPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOCK_READ, projectPath),
  lockWrite: (projectPath: string, data: { deviceId: string; deviceName: string; timestamp: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOCK_WRITE, projectPath, data),
  lockDelete: (projectPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOCK_DELETE, projectPath),
  getDeviceInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DEVICE_INFO),
  // License dialog (triggered from menu)
  onShowLicenseDialog: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('show-license-dialog', listener);
    return () => {
      ipcRenderer.removeListener('show-license-dialog', listener);
    };
  },
  // Navigate to account view (triggered from menu)
  onNavigateToAccount: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('navigate-to-account', listener);
    return () => {
      ipcRenderer.removeListener('navigate-to-account', listener);
    };
  },
  // Graceful quit handshake
  onAppClosing: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.APP_CLOSING, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.APP_CLOSING, listener);
    };
  },
  safeToClose: () => ipcRenderer.send(IPC_CHANNELS.SAFE_TO_CLOSE),
  // Auto-updater
  onShowUpdateModal: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('show-update-modal', listener);
    return () => {
      ipcRenderer.removeListener('show-update-modal', listener);
    };
  },
  onUpdateStatus: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => {
      ipcRenderer.removeListener('update-status', listener);
    };
  },
  updateDownload: () => ipcRenderer.send('update-download'),
  updateInstall: () => ipcRenderer.send('update-install'),
  // SQLite .braidr project format
  detectProjectFormat: (folderPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DETECT_PROJECT_FORMAT, folderPath),
  convertToBraidr: (folderPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERT_TO_BRAIDR, folderPath),
  selectBraidrFile: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_BRAIDR_FILE),
  // .braidr SQLite read/write
  braidrLoadProject: (braidrPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_PROJECT, braidrPath),
  braidrSaveTimeline: (braidrPath: string, payload: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_TIMELINE, braidrPath, payload),
  braidrSaveCharacter: (braidrPath: string, payload: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER, braidrPath, payload),
  braidrCreateCharacter: (braidrPath: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_CREATE_CHARACTER, braidrPath, name),
  braidrMutate: (braidrPath: string, name: string, args: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_MUTATE, braidrPath, name, args),
  braidrReadDraft: (braidrPath: string, sceneId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_READ_DRAFT, braidrPath, sceneId),
  braidrSaveDraft: (braidrPath: string, sceneId: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_DRAFT, braidrPath, sceneId, content),
  braidrReadScratchpad: (braidrPath: string, sceneId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_READ_SCRATCHPAD, braidrPath, sceneId),
  braidrSaveScratchpad: (braidrPath: string, sceneId: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_SCRATCHPAD, braidrPath, sceneId, content),
  braidrReadDraftVersions: (braidrPath: string, sceneId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_READ_DRAFT_VERSIONS, braidrPath, sceneId),
  braidrSaveDraftVersions: (braidrPath: string, sceneId: string, versions: any[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_DRAFT_VERSIONS, braidrPath, sceneId, versions),
  braidrReadSceneComments: (braidrPath: string, sceneId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_READ_SCENE_COMMENTS, braidrPath, sceneId),
  braidrSaveSceneComments: (braidrPath: string, sceneId: string, comments: any[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_SCENE_COMMENTS, braidrPath, sceneId, comments),
  braidrLoadNotesIndex: (braidrPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_NOTES_INDEX, braidrPath),
  braidrSaveNotesIndex: (braidrPath: string, notesIndex: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_NOTES_INDEX, braidrPath, notesIndex),
  braidrReadNote: (braidrPath: string, noteId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_READ_NOTE, braidrPath, noteId),
  braidrSaveNote: (braidrPath: string, noteId: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_NOTE, braidrPath, noteId, content),
  braidrCreateNote: (braidrPath: string, noteId: string, title: string, parentId: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_CREATE_NOTE, braidrPath, noteId, title, parentId),
  braidrDeleteNote: (braidrPath: string, noteId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_DELETE_NOTE, braidrPath, noteId),
  braidrGetChapters: (braidrPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_GET_CHAPTERS, braidrPath),
  braidrLoadTableViews: (braidrPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_TABLE_VIEWS, braidrPath),
  braidrSaveTableViews: (braidrPath: string, views: unknown[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_TABLE_VIEWS, braidrPath, views),
  braidrSaveChapter: (braidrPath: string, chapter: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_CHAPTER, braidrPath, chapter),
  braidrDeleteChapter: (braidrPath: string, chapterId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_DELETE_CHAPTER, braidrPath, chapterId),
  braidrReorderChapters: (braidrPath: string, orderedIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_REORDER_CHAPTERS, braidrPath, orderedIds),
  braidrAssignSceneToChapter: (braidrPath: string, sceneId: string, chapterId: string | null, sceneOrder: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_ASSIGN_SCENE_TO_CHAPTER, braidrPath, sceneId, chapterId, sceneOrder),
  braidrLoadActs: (braidrPath: string, characterId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_ACTS, braidrPath, characterId),
  braidrSaveAct: (braidrPath: string, act: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_ACT, braidrPath, act),
  braidrSaveSceneArcFields: (braidrPath: string, sceneId: string, fields: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_SCENE_ARC_FIELDS, braidrPath, sceneId, fields),
  braidrSavePlotPointArcFields: (braidrPath: string, plotPointId: string, fields: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS, braidrPath, plotPointId, fields),
  braidrSaveArcFieldDefs: (braidrPath: string, defs: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_ARC_FIELD_DEFS, braidrPath, defs),
  braidrSaveArcFieldValues: (braidrPath: string, entityType: string, entityId: string, values: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_ARC_FIELD_VALUES, braidrPath, entityType, entityId, values),
  braidrGetArcUiPref: (braidrPath: string, key: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_GET_ARC_UI_PREF, braidrPath, key),
  braidrSetArcUiPref: (braidrPath: string, key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SET_ARC_UI_PREF, braidrPath, key, value),
  braidrDeleteAct: (braidrPath: string, actId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_DELETE_ACT, braidrPath, actId),
  braidrReorderActs: (braidrPath: string, characterId: string, orderedIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_REORDER_ACTS, braidrPath, characterId, orderedIds),
  braidrLoadCharacterPsychology: (braidrPath: string, characterId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_CHARACTER_PSYCHOLOGY, braidrPath, characterId),
  braidrSaveCharacterPsychology: (braidrPath: string, row: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER_PSYCHOLOGY, braidrPath, row),
});
