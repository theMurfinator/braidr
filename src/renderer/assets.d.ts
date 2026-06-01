declare const __APP_VERSION__: string;

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

interface Window {
  electronAPI: {
    selectFolder: () => Promise<any>;
    readProject: (folderPath: string) => Promise<any>;
    saveFile: (filePath: string, content: string) => Promise<any>;
    createCharacter: (folderPath: string, characterName: string) => Promise<any>;
    loadTimeline: (folderPath: string) => Promise<any>;
    saveTimeline: (folderPath: string, data: any) => Promise<any>;
    getRecentProjects: () => Promise<any>;
    addRecentProject: (project: any) => Promise<any>;
    selectSaveLocation: () => Promise<any>;
    createProject: (parentPath: string, projectName: string, template: any) => Promise<any>;
    deleteFile: (filePath: string) => Promise<any>;
    backupProject: (projectPath: string) => Promise<any>;
    loadNotesIndex: (projectPath: string) => Promise<any>;
    saveNotesIndex: (projectPath: string, data: any) => Promise<any>;
    readNote: (projectPath: string, fileName: string) => Promise<any>;
    saveNote: (projectPath: string, fileName: string, content: string) => Promise<any>;
    createNote: (projectPath: string, fileName: string) => Promise<any>;
    deleteNote: (projectPath: string, fileName: string) => Promise<any>;
    renameNote: (projectPath: string, oldFileName: string, newFileName: string) => Promise<any>;
    createNotesFolder: (projectPath: string, folderPath: string) => Promise<any>;
    deleteNotesFolder: (projectPath: string, folderPath: string) => Promise<any>;
    saveNoteImage: (projectPath: string, imageData: string, fileName: string) => Promise<{ success: boolean; data?: string; error?: string }>;
    selectNoteImage: (projectPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
    printToPDF: (html: string) => Promise<{ success: boolean; data?: number[]; error?: string }>;
    exportFile: (data: number[], defaultName: string, filters: { name: string; extensions: string[] }[]) => Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }>;
    readAnalytics: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    saveAnalytics: (projectPath: string, data: any) => Promise<{ success: boolean; error?: string }>;
    openFeedbackEmail: (category: string, message: string) => Promise<{ success: boolean; error?: string }>;
    // License
    getLicenseStatus: () => Promise<any>;
    activateLicense: (email: string) => Promise<any>;
    startTrial: (email: string) => Promise<any>;
    deactivateLicense: () => Promise<any>;
    openPurchaseUrl: () => Promise<any>;
    openBillingPortal: () => Promise<any>;
    refreshLicenseStatus: () => Promise<any>;
    // Subscription
    getSubscriptionDetails: () => Promise<any>;
    cancelSubscription: () => Promise<any>;
    reactivateSubscription: () => Promise<any>;
    // Analytics event
    captureAnalyticsEvent: (eventName: string, properties: Record<string, any>) => Promise<any>;
    // Print
    printPreview: (html: string) => Promise<any>;
    // Event listeners
    onShowLicenseDialog: (callback: () => void) => () => void;
    onNavigateToAccount: (callback: () => void) => () => void;
    onAppClosing: (callback: () => void) => () => void;
    onShowUpdateModal: (callback: () => void) => () => void;
    safeToClose: () => void;
    // Auto-updater
    onUpdateStatus: (callback: (data: any) => void) => () => void;
    updateDownload: () => void;
    updateInstall: () => void;
    // Branches
    branchesList: (projectPath: string) => Promise<any>;
    branchesCreate: (projectPath: string, name: string, description?: string) => Promise<any>;
    branchesSwitch: (projectPath: string, name: string | null) => Promise<any>;
    branchesDelete: (projectPath: string, name: string) => Promise<any>;
    branchesMerge: (projectPath: string, branchName: string, sceneIds: string[]) => Promise<any>;
    branchesCompare: (projectPath: string, leftBranch: string | null, rightBranch: string | null) => Promise<any>;
    branchesReadPositions: (projectPath: string, branchName: string) => Promise<any>;
    branchesSavePositions: (projectPath: string, branchName: string, positions: Record<string, number>) => Promise<any>;
    // Lock
    lockRead: (projectPath: string) => Promise<any>;
    lockWrite: (projectPath: string, data: { deviceId: string; deviceName: string; timestamp: number }) => Promise<any>;
    lockDelete: (projectPath: string) => Promise<any>;
    getDeviceInfo: () => Promise<any>;
    // Per-scene content
    readDraft: (projectPath: string, sceneId: string) => Promise<any>;
    saveDraft: (projectPath: string, sceneId: string, content: string) => Promise<any>;
    readScratchpad: (projectPath: string, sceneId: string) => Promise<any>;
    saveScratchpad: (projectPath: string, sceneId: string, content: string) => Promise<any>;
    readDraftVersions: (projectPath: string, sceneId: string) => Promise<any>;
    saveDraftVersions: (projectPath: string, sceneId: string, content: string) => Promise<any>;
    readSceneComments: (projectPath: string, sceneId: string) => Promise<any>;
    saveSceneComments: (projectPath: string, sceneId: string, content: string) => Promise<any>;
    readAllPerSceneContent: (projectPath: string) => Promise<any>;
    // SQLite .braidr project format
    detectProjectFormat: (folderPath: string) => Promise<any>;
    convertToBraidr: (folderPath: string) => Promise<any>;
    selectBraidrFile: () => Promise<any>;
    braidrLoadProject: (braidrPath: string) => Promise<any>;
    braidrSaveTimeline: (braidrPath: string, payload: any) => Promise<any>;
    braidrSaveCharacter: (braidrPath: string, payload: any) => Promise<any>;
    braidrCreateCharacter: (braidrPath: string, name: string) => Promise<any>;
    braidrReadDraft: (braidrPath: string, sceneId: string) => Promise<any>;
    braidrSaveDraft: (braidrPath: string, sceneId: string, content: string) => Promise<any>;
    braidrReadScratchpad: (braidrPath: string, sceneId: string) => Promise<any>;
    braidrSaveScratchpad: (braidrPath: string, sceneId: string, content: string) => Promise<any>;
    braidrReadDraftVersions: (braidrPath: string, sceneId: string) => Promise<any>;
    braidrSaveDraftVersions: (braidrPath: string, sceneId: string, versions: any[]) => Promise<any>;
    braidrReadSceneComments: (braidrPath: string, sceneId: string) => Promise<any>;
    braidrSaveSceneComments: (braidrPath: string, sceneId: string, comments: any[]) => Promise<any>;
    braidrLoadNotesIndex: (braidrPath: string) => Promise<any>;
    braidrSaveNotesIndex: (braidrPath: string, notesIndex: any) => Promise<any>;
    braidrReadNote: (braidrPath: string, noteId: string) => Promise<any>;
    braidrSaveNote: (braidrPath: string, noteId: string, content: string) => Promise<any>;
    braidrCreateNote: (braidrPath: string, noteId: string, title: string, parentId: string | null) => Promise<any>;
    braidrDeleteNote: (braidrPath: string, noteId: string) => Promise<any>;
    braidrGetChapters: (braidrPath: string) => Promise<any>;
    braidrSaveChapter: (braidrPath: string, chapter: any) => Promise<any>;
    braidrDeleteChapter: (braidrPath: string, chapterId: string) => Promise<any>;
    braidrReorderChapters: (braidrPath: string, orderedIds: string[]) => Promise<any>;
    braidrAssignSceneToChapter: (braidrPath: string, sceneId: string, chapterId: string | null, sceneOrder: number) => Promise<any>;
    braidrLoadTableViews: (braidrPath: string) => Promise<any>;
    braidrSaveTableViews: (braidrPath: string, views: unknown[]) => Promise<any>;
    braidrLoadActs: (braidrPath: string, characterId: string) => Promise<any>;
    braidrSaveAct: (braidrPath: string, act: unknown) => Promise<any>;
    braidrDeleteAct: (braidrPath: string, actId: string) => Promise<any>;
    braidrReorderActs: (braidrPath: string, characterId: string, orderedIds: string[]) => Promise<any>;
    braidrLoadCharacterPsychology: (braidrPath: string, characterId: string) => Promise<any>;
    braidrSaveCharacterPsychology: (braidrPath: string, row: unknown) => Promise<any>;
    braidrSaveSceneArcFields: (braidrPath: string, sceneId: string, fields: unknown) => Promise<unknown>;
    braidrSavePlotPointArcFields: (braidrPath: string, plotPointId: string, fields: unknown) => Promise<unknown>;
  };
}
