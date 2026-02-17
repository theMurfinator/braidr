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
  READ_ANALYTICS: 'read-analytics',
  SAVE_ANALYTICS: 'save-analytics',
  GET_LICENSE_STATUS: 'get-license-status',
  ACTIVATE_LICENSE: 'activate-license',
  DEACTIVATE_LICENSE: 'deactivate-license',
  OPEN_PURCHASE_URL: 'open-purchase-url',
  OPEN_BILLING_PORTAL: 'open-billing-portal',
  OPEN_FEEDBACK_EMAIL: 'open-feedback-email',
  CAPTURE_ANALYTICS_EVENT: 'capture-analytics-event',
  APP_CLOSING: 'app-closing',
  SAFE_TO_CLOSE: 'safe-to-close',
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
  // Analytics
  readAnalytics: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_ANALYTICS, projectPath),
  saveAnalytics: (projectPath: string, data: any) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_ANALYTICS, projectPath, data),
  // License
  getLicenseStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LICENSE_STATUS),
  activateLicense: (licenseKey: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVATE_LICENSE, licenseKey),
  deactivateLicense: () => ipcRenderer.invoke(IPC_CHANNELS.DEACTIVATE_LICENSE),
  openPurchaseUrl: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PURCHASE_URL),
  openBillingPortal: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_BILLING_PORTAL),
  openFeedbackEmail: (category: string, message: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FEEDBACK_EMAIL, category, message),
  // PostHog analytics
  captureAnalyticsEvent: (eventName: string, properties: Record<string, any>) =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_ANALYTICS_EVENT, eventName, properties),
  // License dialog (triggered from menu)
  onShowLicenseDialog: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('show-license-dialog', listener);
    return () => {
      ipcRenderer.removeListener('show-license-dialog', listener);
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
  onUpdateStatus: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => {
      ipcRenderer.removeListener('update-status', listener);
    };
  },
  updateDownload: () => ipcRenderer.send('update-download'),
  updateInstall: () => ipcRenderer.send('update-install'),
});
