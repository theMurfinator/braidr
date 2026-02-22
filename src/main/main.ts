import { app, BrowserWindow, ipcMain, dialog, Menu, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { autoUpdater } from 'electron-updater';
import windowStateKeeper from 'electron-window-state';
import { IPC_CHANNELS, RecentProject, ProjectTemplate, NotesIndex, NoteMetadata } from '../shared/types';
import { getLicenseStatus, activateLicense, deactivateLicense, startTrial, openPurchaseUrl, openBillingPortal, refreshLicenseStatus, getStoredEmail, getApiBase } from './license';
import { initPostHog, captureEvent, identifyUser, aliasUser, getSessionDurationMs, shutdownPostHog } from './posthog';

let mainWindow: BrowserWindow | null = null;

function openBillingWindow(url: string) {
  const billingWindow = new BrowserWindow({
    width: 900,
    height: 700,
    parent: mainWindow || undefined,
    modal: false,
    title: 'Manage Subscription',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  billingWindow.loadURL(url);
  billingWindow.setMenuBarVisibility(false);
}

// Global crash reporting via PostHog
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  captureEvent('crash_report', {
    source: 'main_process',
    error_name: error.name,
    error_message: error.message,
    error_stack: error.stack?.substring(0, 2000),
  });
});

process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled rejection:', reason);
  captureEvent('crash_report', {
    source: 'main_process',
    error_name: 'UnhandledRejection',
    error_message: String(reason?.message || reason),
    error_stack: reason?.stack?.substring(0, 2000),
  });
});

// Register braidr-img:// as a privileged scheme (must happen before app.whenReady())
protocol.registerSchemesAsPrivileged([
  { scheme: 'braidr-img', privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true } },
]);

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
// Skip Authenticode signature verification on Windows (exe is not code-signed yet)
if (process.platform === 'win32') {
  (autoUpdater as any).verifyUpdateCodeSignature = () => Promise.resolve(null);
}

// Flag to bypass graceful quit handler when installing updates
let isInstallingUpdate = false;

// Auto-updater event handlers — send status to renderer for in-app UI
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
  mainWindow?.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  mainWindow?.webContents.send('update-status', { status: 'available', version: info.version });
});

autoUpdater.on('update-not-available', () => {
  console.log('No updates available');
  mainWindow?.webContents.send('update-status', { status: 'not-available' });
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download: ${Math.round(progressObj.percent)}%`);
  mainWindow?.webContents.send('update-status', {
    status: 'downloading',
    percent: progressObj.percent,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  captureEvent('update_downloaded', { version: info.version });
  mainWindow?.webContents.send('update-status', { status: 'downloaded', version: info.version });
});

autoUpdater.on('error', (error) => {
  console.error('Auto-updater error:', error);
  mainWindow?.webContents.send('update-status', {
    status: 'error',
    message: error?.message || 'Update check failed',
  });
});

// IPC handlers for update actions from renderer
ipcMain.on('update-download', async () => {
  console.log('update-download IPC received, starting download...');
  try {
    await autoUpdater.downloadUpdate();
  } catch (err: any) {
    console.error('downloadUpdate() failed:', err);
    mainWindow?.webContents.send('update-status', {
      status: 'error',
      message: err?.message || 'Download failed',
    });
  }
});

ipcMain.on('update-install', () => {
  // Set flag so safe-to-close handler knows to quitAndInstall
  isInstallingUpdate = true;

  if (mainWindow) {
    // Ask renderer to flush saves before installing the update
    mainWindow.webContents.send('app-closing');
    // Safety timeout: install even if renderer doesn't respond
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 3000);
  } else {
    autoUpdater.quitAndInstall(false, true);
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
          label: 'Account...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('navigate-to-account');
            }
          }
        },
        {
          label: 'Sign Out',
          click: () => {
            deactivateLicense();
            if (mainWindow) {
              mainWindow.webContents.send('show-license-dialog');
              mainWindow.reload();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: () => {
            mainWindow?.webContents.send('show-update-modal');
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
            await shell.openExternal('https://getbraider.com');
          }
        },
        ...(!isMac ? [
          { type: 'separator' as const },
          {
            label: 'Account...',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('navigate-to-account');
              }
            }
          },
          {
            label: 'Sign Out',
            click: () => {
              deactivateLicense();
              if (mainWindow) {
                mainWindow.webContents.send('show-license-dialog');
                mainWindow.reload();
              }
            }
          },
          { type: 'separator' as const },
          {
            label: 'Check for Updates...',
            click: () => {
              mainWindow?.webContents.send('show-update-modal');
              autoUpdater.checkForUpdates();
            }
          },
        ] : [])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 6, y: 14 },
  });

  mainWindowState.manage(mainWindow);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In packaged app: __dirname is dist-electron/main/, dist is at ../../dist/
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Spellcheck context menu: show suggestions on right-click
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (params.misspelledWord) {
      const menuItems: Electron.MenuItemConstructorOptions[] = [];
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuItems.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
        });
      }
      if (menuItems.length > 0) {
        menuItems.push({ type: 'separator' });
      }
      menuItems.push({
        label: 'Add to Dictionary',
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      Menu.buildFromTemplate(menuItems).popup();
    }
  });

  // Graceful quit: ask renderer to flush saves before closing
  let isReadyToClose = false;

  mainWindow.on('close', (e) => {
    // Skip graceful quit when installing an update — let quitAndInstall() proceed
    if (isInstallingUpdate) return;

    if (!isReadyToClose && mainWindow) {
      e.preventDefault();
      mainWindow.webContents.send('app-closing');
      // Safety timeout: if renderer doesn't respond within 3s, close anyway
      setTimeout(() => {
        isReadyToClose = true;
        if (mainWindow) {
          mainWindow.close();
        }
        app.quit();
      }, 3000);
    }
  });

  ipcMain.on('safe-to-close', () => {
    isReadyToClose = true;
    if (isInstallingUpdate) {
      autoUpdater.quitAndInstall(false, true);
    } else {
      if (mainWindow) {
        mainWindow.close();
      }
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates on startup and every 30 minutes (production only)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000);
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 30 * 60 * 1000);
  }
}

app.whenReady().then(() => {
  // Register custom protocol for serving note images
  // URL format: braidr-img:///path/to/project/notes/images/filename.png
  protocol.handle('braidr-img', (request) => {
    // Strip the scheme to get the file path
    const filePath = decodeURIComponent(request.url.replace('braidr-img://', ''));
    return net.fetch(`file://${filePath}`);
  });

  // Validate environment variables
  const envWarnings: string[] = [];
  if (!process.env.VITE_POSTHOG_KEY || process.env.VITE_POSTHOG_KEY === 'phc_YOUR_KEY_HERE') {
    envWarnings.push('VITE_POSTHOG_KEY is not set — analytics will be disabled');
  }
  if (envWarnings.length > 0) {
    console.warn('[Braidr] Environment warnings:\n  ' + envWarnings.join('\n  '));
  }

  initPostHog();
  createWindow();
  createMenu();

  // Capture app_opened after license check (deferred so license status is available)
  getLicenseStatus().then(status => {
    captureEvent('app_opened', { license_state: status.state });
    identifyUser(status.state, {
      trial_days_remaining: status.trialDaysRemaining,
      has_email: !!status.email,
    });
    // First ever launch = trial started
    if (status.state === 'trial' && status.trialDaysRemaining !== undefined && status.trialDaysRemaining >= 13) {
      captureEvent('trial_started', { trial_days_remaining: status.trialDaysRemaining });
    }
  }).catch(() => {});
});

app.on('window-all-closed', () => {
  captureEvent('app_closed', { session_duration_ms: getSessionDurationMs() });
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await shutdownPostHog();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// PostHog analytics event relay from renderer
ipcMain.handle(IPC_CHANNELS.CAPTURE_ANALYTICS_EVENT, async (_event, eventName: string, properties: Record<string, any>) => {
  captureEvent(eventName, properties);
  return { success: true };
});

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

    // Recursively copy all files and subdirectories (including notes/)
    const copyRecursive = (src: string, dest: string) => {
      const entries = fs.readdirSync(src);
      for (const entry of entries) {
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        const stat = fs.statSync(srcPath);
        if (stat.isFile()) {
          fs.copyFileSync(srcPath, destPath);
        } else if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        }
      }
    };
    copyRecursive(projectPath, backupDir);

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

// Stable character ID from name (must match renderer's parser.ts stableId)
function stableCharId(str: string): string {
  const s = str.toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return 'c' + Math.abs(hash).toString(36);
}

// Recent Projects
ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const projects: RecentProject[] = JSON.parse(content);
      // Filter out projects that no longer exist
      const validProjects = projects.filter(p => fs.existsSync(p.path));

      // Enrich projects that are missing stats (from before stats were added)
      let needsSave = false;
      for (const project of validProjects) {
        if (project.characterNames && project.characterNames.length > 0 && (project.totalWordCount ?? 0) > 0) continue; // already enriched
        try {
          // Read .md files to get character names and scene counts
          const files = fs.readdirSync(project.path);
          const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('CLAUDE') && !f.startsWith('README'));
          const characterNames: string[] = [];
          const characterIds: string[] = [];
          let sceneCount = 0;

          for (const file of mdFiles) {
            const filePath = path.join(project.path, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            // Extract character name from frontmatter
            const fmMatch = fileContent.match(/^---\s*\n[\s\S]*?character:\s*(.+?)\s*\n[\s\S]*?---/m);
            if (fmMatch) {
              const charName = fmMatch[1];
              characterNames.push(charName);
              characterIds.push(stableCharId(charName));
              // Count numbered scenes (lines starting with digits followed by a period)
              const sceneMatches = fileContent.match(/^\d+\.\s+/gm);
              if (sceneMatches) sceneCount += sceneMatches.length;
            }
          }

          // Read timeline.json for colors and word counts
          let characterColors: Record<string, string> = {};
          let totalWordCount = 0;
          const timelinePath = path.join(project.path, 'timeline.json');
          if (fs.existsSync(timelinePath)) {
            try {
              const timelineContent = fs.readFileSync(timelinePath, 'utf-8');
              const timeline = JSON.parse(timelineContent);
              characterColors = timeline.characterColors || {};
              if (timeline.wordCounts) {
                totalWordCount = Object.values(timeline.wordCounts as Record<string, number>).reduce((sum: number, wc: number) => sum + wc, 0);
              }
            } catch { /* ignore parse errors */ }
          }

          if (characterNames.length > 0) {
            project.characterCount = characterNames.length;
            project.sceneCount = sceneCount;
            project.totalWordCount = totalWordCount;
            project.characterNames = characterNames;
            project.characterIds = characterIds;
            project.characterColors = characterColors;
            needsSave = true;
          }
        } catch { /* skip projects that can't be read */ }
      }

      // Persist enriched data so we don't re-scan next time
      if (needsSave) {
        fs.writeFileSync(configPath, JSON.stringify(validProjects, null, 2), 'utf-8');
      }

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

// ─── Notes IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.LOAD_NOTES_INDEX, async (_event, projectPath: string) => {
  try {
    const notesDir = path.join(projectPath, 'notes');
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }
    const indexPath = path.join(notesDir, 'notes-index.json');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: true, data: { notes: [], folders: [] } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.SAVE_NOTES_INDEX, async (_event, projectPath: string, data: NotesIndex) => {
  try {
    const notesDir = path.join(projectPath, 'notes');
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }
    const indexPath = path.join(notesDir, 'notes-index.json');
    fs.writeFileSync(indexPath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.READ_NOTE, async (_event, projectPath: string, fileName: string) => {
  try {
    const filePath = path.join(projectPath, 'notes', fileName);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Note file not found' };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: content };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.SAVE_NOTE, async (_event, projectPath: string, fileName: string, content: string) => {
  try {
    const filePath = path.join(projectPath, 'notes', fileName);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.CREATE_NOTE, async (_event, projectPath: string, fileName: string) => {
  try {
    const filePath = path.join(projectPath, 'notes', fileName);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, '<p></p>', 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.DELETE_NOTE, async (_event, projectPath: string, fileName: string) => {
  try {
    const filePath = path.join(projectPath, 'notes', fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.RENAME_NOTE, async (_event, projectPath: string, oldFileName: string, newFileName: string) => {
  try {
    const oldPath = path.join(projectPath, 'notes', oldFileName);
    const newPath = path.join(projectPath, 'notes', newFileName);
    const newDir = path.dirname(newPath);
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// ─── Note Images ────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.SAVE_NOTE_IMAGE, async (_event, projectPath: string, imageData: string, originalName: string) => {
  try {
    const imagesDir = path.join(projectPath, 'notes', 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // imageData is base64 (with or without data URI prefix)
    let base64 = imageData;
    let ext = path.extname(originalName).toLowerCase() || '.png';

    if (imageData.startsWith('data:')) {
      const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        ext = '.' + match[1].replace('jpeg', 'jpg');
        base64 = match[2];
      }
    }

    // Generate unique filename: timestamp + short hash
    const hash = crypto.createHash('md5').update(base64.substring(0, 200)).digest('hex').substring(0, 8);
    const fileName = `img_${Date.now()}_${hash}${ext}`;
    const filePath = path.join(imagesDir, fileName);

    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

    // Return relative path from notes dir for embedding in HTML
    return { success: true, data: `images/${fileName}` };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.SELECT_NOTE_IMAGE, async (_event, projectPath: string) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' };
    }

    const sourcePath = result.filePaths[0];
    const imagesDir = path.join(projectPath, 'notes', 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const ext = path.extname(sourcePath).toLowerCase();
    const hash = crypto.createHash('md5').update(sourcePath).digest('hex').substring(0, 8);
    const fileName = `img_${Date.now()}_${hash}${ext}`;
    const destPath = path.join(imagesDir, fileName);

    fs.copyFileSync(sourcePath, destPath);

    return { success: true, data: `images/${fileName}` };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Analytics data (separate from timeline for clean separation)
ipcMain.handle(IPC_CHANNELS.READ_ANALYTICS, async (_event, projectPath: string) => {
  try {
    const analyticsPath = path.join(projectPath, 'analytics.json');
    if (fs.existsSync(analyticsPath)) {
      const content = fs.readFileSync(analyticsPath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.SAVE_ANALYTICS, async (_event, projectPath: string, data: any) => {
  try {
    const analyticsPath = path.join(projectPath, 'analytics.json');
    fs.writeFileSync(analyticsPath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// ─── License IPC Handlers ─────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.GET_LICENSE_STATUS, async () => {
  try {
    const status = await getLicenseStatus();
    return { success: true, data: status };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.ACTIVATE_LICENSE, async (_event, email: string) => {
  try {
    const status = await activateLicense(email);
    captureEvent('license_activated', { state: status.state });
    aliasUser(email);
    identifyUser(status.state, { has_email: true });
    return { success: true, data: status };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.START_TRIAL, async (_event, email: string) => {
  try {
    const status = await startTrial(email);
    captureEvent('trial_started', { trial_days_remaining: status.trialDaysRemaining });
    aliasUser(email);
    identifyUser(status.state, { has_email: true });
    return { success: true, data: status };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.DEACTIVATE_LICENSE, async () => {
  try {
    const status = deactivateLicense();
    captureEvent('license_deactivated');
    return { success: true, data: status };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.REFRESH_LICENSE_STATUS, async () => {
  try {
    const status = await refreshLicenseStatus();
    return { success: true, data: status };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.OPEN_PURCHASE_URL, async () => {
  try {
    captureEvent('purchase_clicked');
    openPurchaseUrl();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.OPEN_BILLING_PORTAL, async () => {
  try {
    const result = await openBillingPortal();
    console.log('[Braidr] Billing portal result:', JSON.stringify(result));
    if (result.success && result.url) {
      openBillingWindow(result.url);
    } else if (result.error) {
      console.error('[Braidr] Billing portal error:', result.error);
    }
    return result;
  } catch (error) {
    console.error('[Braidr] Billing portal exception:', error);
    return { success: false, error: String(error) };
  }
});

// ─── Subscription Management IPC Handlers ──────────────────────────────────

ipcMain.handle(IPC_CHANNELS.GET_SUBSCRIPTION_DETAILS, async () => {
  try {
    const email = getStoredEmail();
    if (!email) {
      return { success: false, error: 'No email on file' };
    }
    const response = await net.fetch(`${getApiBase()}/api/subscription?action=details&email=${encodeURIComponent(email)}`);
    if (!response.ok) {
      return { success: false, error: 'Failed to fetch subscription details' };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.CANCEL_SUBSCRIPTION, async () => {
  try {
    const email = getStoredEmail();
    if (!email) {
      return { success: false, error: 'No email on file' };
    }
    const response = await net.fetch(`${getApiBase()}/api/subscription?action=cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      return { success: false, error: 'Failed to cancel subscription' };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.REACTIVATE_SUBSCRIPTION, async () => {
  try {
    const email = getStoredEmail();
    if (!email) {
      return { success: false, error: 'No email on file' };
    }
    const response = await net.fetch(`${getApiBase()}/api/subscription?action=reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      return { success: false, error: 'Failed to reactivate subscription' };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.OPEN_FEEDBACK_EMAIL, async (_event, category: string, message: string) => {
  try {
    captureEvent('feedback_submitted', {
      category,
      message,
      appVersion: app.getVersion(),
      platform: process.platform,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Print Preview: render HTML in a hidden window, trigger native print dialog with preview
ipcMain.handle(IPC_CHANNELS.PRINT_PREVIEW, async (_event, html: string) => {
  try {
    const printWindow = new BrowserWindow({
      width: 800,
      height: 900,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await printWindow.loadURL(dataUrl);

    // Wait for content to render
    await new Promise(resolve => setTimeout(resolve, 500));

    // Open native macOS print dialog (has built-in preview sidebar)
    printWindow.webContents.print({ silent: false, printBackground: true }, () => {
      printWindow.destroy();
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// PDF Export via hidden BrowserWindow
ipcMain.handle(IPC_CHANNELS.PRINT_TO_PDF, async (_event, html: string) => {
  let pdfWindow: BrowserWindow | null = null;
  try {
    pdfWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    // Load HTML via data URL
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await pdfWindow.loadURL(dataUrl);

    // Wait for content to render
    await new Promise(resolve => setTimeout(resolve, 500));

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
    });

    return { success: true, data: Array.from(new Uint8Array(pdfBuffer)) };
  } catch (error) {
    return { success: false, error: String(error) };
  } finally {
    if (pdfWindow) {
      pdfWindow.destroy();
    }
  }
});
