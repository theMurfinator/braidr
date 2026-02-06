import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { IPC_CHANNELS, RecentProject, ProjectTemplate } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

// Path to store recent projects
const getConfigPath = () => path.join(app.getPath('userData'), 'recent-projects.json');

// Template definitions
const TEMPLATES: Record<ProjectTemplate, { characterName: string; sections: { title: string; description: string }[] }> = {
  'blank': {
    characterName: 'Protagonist',
    sections: [
      { title: 'Act 1', description: '' }
    ]
  },
  'three-act': {
    characterName: 'Protagonist',
    sections: [
      { title: 'Act 1 - Setup', description: 'Introduce the protagonist, their world, and the inciting incident.' },
      { title: 'Act 2 - Confrontation', description: 'The protagonist faces escalating obstacles and complications.' },
      { title: 'Act 3 - Resolution', description: 'The climax and resolution of the story.' }
    ]
  },
  'save-the-cat': {
    characterName: 'Protagonist',
    sections: [
      { title: 'Opening Image', description: 'A snapshot of the protagonist before the journey.' },
      { title: 'Theme Stated', description: 'Someone states the lesson the protagonist will learn.' },
      { title: 'Setup', description: 'Introduce the protagonist\'s world and what\'s missing.' },
      { title: 'Catalyst', description: 'The inciting incident that sets the story in motion.' },
      { title: 'Debate', description: 'The protagonist hesitates before committing to the journey.' },
      { title: 'Break into Two', description: 'The protagonist enters the new world/situation.' },
      { title: 'B Story', description: 'A subplot (often romantic) that carries the theme.' },
      { title: 'Fun and Games', description: 'The promise of the premise - why we came to see this story.' },
      { title: 'Midpoint', description: 'A major twist - false victory or false defeat.' },
      { title: 'Bad Guys Close In', description: 'External pressure mounts, internal doubts grow.' },
      { title: 'All Is Lost', description: 'The lowest point - something or someone dies.' },
      { title: 'Dark Night of the Soul', description: 'The protagonist processes their loss.' },
      { title: 'Break into Three', description: 'The protagonist finds the solution.' },
      { title: 'Finale', description: 'The protagonist proves they\'ve changed and defeats the antagonist.' },
      { title: 'Final Image', description: 'A snapshot showing transformation - opposite of opening.' }
    ]
  },
  'heros-journey': {
    characterName: 'Hero',
    sections: [
      { title: 'Ordinary World', description: 'The hero\'s normal life before the adventure.' },
      { title: 'Call to Adventure', description: 'The hero is presented with a challenge or quest.' },
      { title: 'Refusal of the Call', description: 'The hero hesitates or refuses the call.' },
      { title: 'Meeting the Mentor', description: 'The hero meets a guide who provides wisdom or tools.' },
      { title: 'Crossing the Threshold', description: 'The hero commits to the adventure and enters the special world.' },
      { title: 'Tests, Allies, Enemies', description: 'The hero faces challenges and meets friends and foes.' },
      { title: 'Approach to the Inmost Cave', description: 'The hero prepares for the major challenge.' },
      { title: 'The Ordeal', description: 'The hero faces their greatest fear or challenge.' },
      { title: 'Reward', description: 'The hero gains something from surviving the ordeal.' },
      { title: 'The Road Back', description: 'The hero begins the journey home.' },
      { title: 'Resurrection', description: 'The hero faces a final test, transformed by the experience.' },
      { title: 'Return with the Elixir', description: 'The hero returns home changed, bringing something valuable.' }
    ]
  }
};

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Auto-updater configuration
autoUpdater.autoDownload = false; // Don't auto-download, let user confirm
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: 'Would you like to download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  }
});

autoUpdater.on('update-not-available', () => {
  console.log('No updates available');
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'No Updates',
      message: 'You are running the latest version of Braidr.',
      buttons: ['OK']
    });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`;
  console.log(logMessage);
  // Could send this to renderer for a progress bar
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Braidr will restart to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  }
});

autoUpdater.on('error', (error) => {
  console.error('Auto-updater error:', error);
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Error',
      message: 'An error occurred while checking for updates.',
      detail: error.message,
      buttons: ['OK']
    });
  }
});

function createMenu() {
  const isMac = process.platform === 'darwin';

  const template: any[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: () => {
            autoUpdater.checkForUpdates();
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://braidr.app');
          }
        },
        ...(!isMac ? [{
          type: 'separator' as const
        }, {
          label: 'Check for Updates...',
          click: () => {
            autoUpdater.checkForUpdates();
          }
        }] : [])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In packaged app: __dirname is dist-electron/main/, dist is at ../../dist/
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates on startup (production only)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000); // Wait 3 seconds after app loads
  }
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle(IPC_CHANNELS.READ_PROJECT, async (_event, folderPath: string) => {
  try {
    const files = fs.readdirSync(folderPath);
    const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('CLAUDE'));

    const outlines: { fileName: string; content: string }[] = [];

    for (const file of mdFiles) {
      const filePath = path.join(folderPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      outlines.push({ fileName: file, content });
    }

    return { success: true, outlines };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.SAVE_FILE, async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BACKUP_PROJECT, async (_event, projectPath: string) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Choose Backup Location',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const destFolder = result.filePaths[0];
    const projectName = path.basename(projectPath);
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const backupDir = path.join(destFolder, `${projectName} Backup ${timestamp}`);

    fs.mkdirSync(backupDir, { recursive: true });

    const files = fs.readdirSync(projectPath);
    for (const file of files) {
      const srcPath = path.join(projectPath, file);
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, path.join(backupDir, file));
      }
    }

    return { success: true, backupPath: backupDir };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.DELETE_FILE, async (_event, filePath: string) => {
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.CREATE_CHARACTER, async (_event, folderPath: string, characterName: string) => {
  try {
    const fileName = `${characterName.toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(folderPath, fileName);

    const initialContent = `---
character: ${characterName}
---

## Act 1
1. First scene description here

`;

    fs.writeFileSync(filePath, initialContent, 'utf-8');
    return { success: true, filePath, fileName };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.LOAD_TIMELINE, async (_event, folderPath: string) => {
  try {
    const timelinePath = path.join(folderPath, 'timeline.json');
    if (fs.existsSync(timelinePath)) {
      const content = fs.readFileSync(timelinePath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: true, data: { positions: {} } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.SAVE_TIMELINE, async (_event, folderPath: string, data: { positions: Record<string, number> }) => {
  try {
    const timelinePath = path.join(folderPath, 'timeline.json');
    fs.writeFileSync(timelinePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Recent Projects
ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const projects: RecentProject[] = JSON.parse(content);
      // Filter out projects that no longer exist
      const validProjects = projects.filter(p => fs.existsSync(p.path));
      return { success: true, projects: validProjects };
    }
    return { success: true, projects: [] };
  } catch (error) {
    return { success: false, error: String(error), projects: [] };
  }
});

ipcMain.handle(IPC_CHANNELS.ADD_RECENT_PROJECT, async (_event, project: RecentProject) => {
  try {
    const configPath = getConfigPath();
    let projects: RecentProject[] = [];

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      projects = JSON.parse(content);
    }

    // Remove if already exists (we'll re-add at top)
    projects = projects.filter(p => p.path !== project.path);

    // Add to beginning
    projects.unshift(project);

    // Keep only last 10
    projects = projects.slice(0, 10);

    fs.writeFileSync(configPath, JSON.stringify(projects, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.SELECT_SAVE_LOCATION, async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose where to save your novel',
    buttonLabel: 'Choose Location',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle(IPC_CHANNELS.CREATE_PROJECT, async (_event, parentPath: string, projectName: string, template: ProjectTemplate) => {
  try {
    // Create project folder
    const projectPath = path.join(parentPath, projectName);

    if (fs.existsSync(projectPath)) {
      return { success: false, error: 'A folder with this name already exists' };
    }

    fs.mkdirSync(projectPath, { recursive: true });

    // Get template
    const templateData = TEMPLATES[template];

    // Create the protagonist file with template sections
    const fileName = `${templateData.characterName.toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(projectPath, fileName);

    let content = `---
character: ${templateData.characterName}
---

`;

    let sceneNumber = 1;
    for (const section of templateData.sections) {
      content += `## ${section.title}\n`;
      if (section.description) {
        content += `${section.description}\n`;
      }
      content += `\n${sceneNumber}. First scene\n\n`;
      sceneNumber++;
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    // Create empty timeline.json
    const timelinePath = path.join(projectPath, 'timeline.json');
    fs.writeFileSync(timelinePath, JSON.stringify({ positions: {}, connections: {}, chapters: [] }, null, 2), 'utf-8');

    return { success: true, projectPath };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
