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
});
