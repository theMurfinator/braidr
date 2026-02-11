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
    readAnalytics: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    saveAnalytics: (projectPath: string, data: any) => Promise<{ success: boolean; error?: string }>;
  };
}
