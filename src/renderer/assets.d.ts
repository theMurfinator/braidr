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
  };
}
