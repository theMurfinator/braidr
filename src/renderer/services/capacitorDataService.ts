import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import {
  Character,
  Scene,
  PlotPoint,
  Tag,
  OutlineFile,
  ProjectData,
  TimelineData,
  BraidedChapter,
  RecentProject,
  ProjectTemplate,
  FontSettings,
  AllFontSettings,
  ArchivedScene,
  MetadataFieldDef,
  DraftVersion,
  NotesIndex,
  SceneComment,
  Task,
  TaskFieldDef,
  TaskViewConfig,
  WorldEvent,
  BranchIndex,
  BranchInfo,
  BranchCompareData,
  BranchSceneDiff,
} from '../../shared/types';
import { parseOutlineFile, serializeOutline, createTagsFromStrings } from './parser';
import { migrateSceneKeys } from './migration';
import type { DataService } from './dataService';
import { acquireLock, releaseLock, startHeartbeat, stopHeartbeat, LockData } from './projectLock';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine if a path is absolute (starts with / or a URI scheme).
 * Absolute paths go through Filesystem without a directory enum;
 * relative paths use Directory.Documents.
 */
function fsOptions(path: string) {
  if (path.startsWith('/') || path.includes('://')) {
    return { path };
  }
  return { path, directory: Directory.Documents };
}

/** Read a UTF-8 text file; returns null when the file does not exist. */
async function readTextFile(path: string): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({ ...fsOptions(path), encoding: Encoding.UTF8 });
    return result.data as string;
  } catch (_e) {
    return null;
  }
}

/** Write a UTF-8 text file, creating parent directories as needed. */
async function writeTextFile(path: string, content: string): Promise<void> {
  await Filesystem.writeFile({
    ...fsOptions(path),
    data: content,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

/** List entries in a directory; returns an empty array if the dir is missing. */
async function listDir(path: string): Promise<{ name: string; type: 'file' | 'directory' }[]> {
  try {
    const result = await Filesystem.readdir(fsOptions(path));
    return result.files.map(f => ({ name: f.name, type: f.type }));
  } catch (_e) {
    return [];
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function parseCharacterName(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?character:\s*(.+)\n[\s\S]*?---/m);
  return match ? match[1].trim() : 'Unknown';
}

interface ParsedScene {
  sceneId: string;
  sceneNumber: number;
  title: string;
  fullLine: string;
  characterName: string;
  characterId: string;
  fileName: string;
}

async function listMdFiles(dir: string): Promise<string[]> {
  const entries = await listDir(dir);
  return entries
    .filter(e => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('CLAUDE') && !e.name.startsWith('README'))
    .map(e => e.name);
}

async function parseScenesFromDir(dir: string): Promise<ParsedScene[]> {
  const scenes: ParsedScene[] = [];
  const mdFiles = await listMdFiles(dir);

  for (const fileName of mdFiles) {
    const content = await readTextFile(`${dir}/${fileName}`);
    if (!content) continue;

    const characterName = parseCharacterName(content);
    const characterId = fileName.replace('.md', '').toLowerCase();

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      const lineMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (!lineMatch) continue;

      const sceneNumber = parseInt(lineMatch[1], 10);
      const sceneLine = lineMatch[2];

      const sidMatch = sceneLine.match(/<!--\s*sid:(\S+)\s*-->/);
      if (!sidMatch) continue;

      const sceneId = sidMatch[1];
      const title = sceneLine.replace(/\s*<!--\s*sid:\S+\s*-->/, '').trim();

      scenes.push({ sceneId, sceneNumber, title, fullLine: trimmed, characterName, characterId, fileName });
    }
  }

  return scenes;
}

async function readBranchIndex(projectPath: string): Promise<BranchIndex> {
  const content = await readTextFile(`${projectPath}/branches/index.json`);
  if (!content) return { branches: [], activeBranch: null };
  try { return JSON.parse(content); } catch { return { branches: [], activeBranch: null }; }
}

async function writeBranchIndex(projectPath: string, index: BranchIndex): Promise<void> {
  await writeTextFile(`${projectPath}/branches/index.json`, JSON.stringify(index, null, 2));
}

async function readBranchPositions(projectPath: string, branchName: string | null): Promise<Record<string, number>> {
  if (branchName === null) {
    const raw = await readTextFile(`${projectPath}/timeline.json`);
    if (!raw) return {};
    try { return (JSON.parse(raw) as any).positions ?? {}; } catch { return {}; }
  }
  const raw = await readTextFile(`${projectPath}/branches/${branchName}/positions.json`);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function branchMdDir(projectPath: string, branchName: string | null): string {
  if (branchName === null) return projectPath;
  return `${projectPath}/branches/${branchName}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getCapacitorDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
  const { value } = await Preferences.get({ key: 'deviceInfo' });
  if (value) {
    try { return JSON.parse(value); } catch { /* regenerate */ }
  }
  let deviceName = 'iPad';
  try {
    // Variable path to prevent Vite static analysis from resolving this optional dependency
    const modPath = '@capacitor/' + 'device';
    const { Device } = await import(/* @vite-ignore */ modPath);
    const info = await Device.getInfo();
    deviceName = info.name || info.model || 'iPad';
  } catch { /* fallback to 'iPad' */ }
  const info = {
    deviceId: Math.random().toString(16).substring(2, 10),
    deviceName,
  };
  await Preferences.set({ key: 'deviceInfo', value: JSON.stringify(info) });
  return info;
}

// ---------------------------------------------------------------------------
// CapacitorDataService
// ---------------------------------------------------------------------------

export class CapacitorDataService implements DataService {
  private projectPath: string | null = null;
  private activeBranch: string | null = null;
  private outlineFiles: Map<string, OutlineFile> = new Map();

  // ── Folder selection ────────────────────────────────────────────────────

  async selectProjectFolder(): Promise<string | null> {
    // Try native document picker first (Capacitor 6+).
    // Falls back to a prompt for the simulator where pickDirectory may not exist.
    try {
      const fs = Filesystem as unknown as {
        pickDirectory?: () => Promise<{ url: string }>;
      };
      if (typeof fs.pickDirectory === 'function') {
        const result = await fs.pickDirectory();
        if (result?.url) {
          this.projectPath = result.url;
          return result.url;
        }
        return null;
      }
    } catch (err) {
      console.warn('pickDirectory failed, falling back to prompt:', err);
    }

    // Fallback: prompt for path (useful in simulator / dev)
    const path = prompt('Enter project folder path (simulator fallback):');
    if (path) {
      this.projectPath = path;
      return path;
    }
    return null;
  }

  // ── Load project ────────────────────────────────────────────────────────

  async loadProject(folderPath: string): Promise<
    ProjectData & {
      connections: Record<string, string[]>;
      chapters: BraidedChapter[];
      characterColors: Record<string, string>;
      fontSettings: FontSettings;
      allFontSettings?: AllFontSettings;
      archivedScenes: ArchivedScene[];
      draftContent: Record<string, string>;
      metadataFieldDefs: MetadataFieldDef[];
      sceneMetadata: Record<string, Record<string, string | string[]>>;
      drafts: Record<string, DraftVersion[]>;
      wordCountGoal: number;
      scratchpad: Record<string, string>;
      sceneComments: Record<string, SceneComment[]>;
      tasks: Task[];
      taskFieldDefs: TaskFieldDef[];
      taskViews: TaskViewConfig[];
      taskColumnWidths: Record<string, number>;
      taskVisibleColumns?: string[];
      inlineMetadataFields?: string[];
      showInlineLabels?: boolean;
      timelineDates: Record<string, string>;
      worldEvents: WorldEvent[];
      _migrated?: boolean;
    }
  > {
    this.projectPath = folderPath;

    // Check for active branch
    const branchIndex = await readBranchIndex(folderPath);
    this.activeBranch = branchIndex.activeBranch;

    // 1. List .md files — from branch folder if active, otherwise project root
    const mdSourceDir = branchMdDir(folderPath, this.activeBranch);
    const mdFileNames = await listMdFiles(mdSourceDir);

    // 2. Read each outline and parse
    const characters: Character[] = [];
    const allScenes: Scene[] = [];
    const allPlotPoints: PlotPoint[] = [];

    for (const fileName of mdFileNames) {
      const filePath = `${mdSourceDir}/${fileName}`;
      const content = await readTextFile(filePath);
      if (content === null) continue;

      const outline = parseOutlineFile(content, fileName, filePath);
      this.outlineFiles.set(outline.character.id, outline);

      if (!characters.some(c => c.id === outline.character.id)) {
        characters.push(outline.character);
      }
      allScenes.push(...outline.scenes);
      allPlotPoints.push(...outline.plotPoints);
    }

    // 3. Read timeline.json
    const timelineRaw = await readTextFile(`${folderPath}/timeline.json`);
    let timelineData: TimelineData = timelineRaw
      ? (JSON.parse(timelineRaw) as TimelineData)
      : { positions: {}, connections: {} };

    // Override positions if on a branch
    if (this.activeBranch) {
      const branchPositions = await readBranchPositions(folderPath, this.activeBranch);
      timelineData = { ...timelineData, positions: branchPositions };
    }

    // 4. Read per-scene content from individual files
    const draftContent: Record<string, string> = {};
    const scratchpad: Record<string, string> = {};
    const drafts: Record<string, DraftVersion[]> = {};
    const sceneCommentsMap: Record<string, SceneComment[]> = {};

    const draftEntries = await listDir(`${folderPath}/drafts`);
    for (const entry of draftEntries.filter(e => e.type === 'file' && e.name.endsWith('.html'))) {
      const sceneId = entry.name.replace('.html', '');
      const text = await readTextFile(`${folderPath}/drafts/${entry.name}`);
      if (text !== null) draftContent[sceneId] = text;
    }

    const scratchEntries = await listDir(`${folderPath}/scratchpad`);
    for (const entry of scratchEntries.filter(e => e.type === 'file' && e.name.endsWith('.html'))) {
      const sceneId = entry.name.replace('.html', '');
      const text = await readTextFile(`${folderPath}/scratchpad/${entry.name}`);
      if (text !== null) scratchpad[sceneId] = text;
    }

    const draftVersionEntries = await listDir(`${folderPath}/drafts`);
    for (const entry of draftVersionEntries.filter(
      e => e.type === 'file' && e.name.endsWith('.versions.json'),
    )) {
      const sceneId = entry.name.replace('.versions.json', '');
      const text = await readTextFile(`${folderPath}/drafts/${entry.name}`);
      if (text !== null) {
        try {
          drafts[sceneId] = JSON.parse(text) as DraftVersion[];
        } catch (_e) {
          // ignore corrupt version files
        }
      }
    }

    const commentEntries = await listDir(`${folderPath}/comments`);
    for (const entry of commentEntries.filter(e => e.type === 'file' && e.name.endsWith('.json'))) {
      const sceneId = entry.name.replace('.json', '');
      const text = await readTextFile(`${folderPath}/comments/${entry.name}`);
      if (text !== null) {
        try {
          sceneCommentsMap[sceneId] = JSON.parse(text) as SceneComment[];
        } catch (_e) {
          // ignore corrupt comment files
        }
      }
    }

    // 5. Build tags: use saved categories for known tags, only infer for truly new ones
    const savedTags: Tag[] = timelineData.tags || [];
    const savedTagMap = new Map(savedTags.map(t => [t.name, t]));

    const seenNames = new Set<string>();
    const allTags: Tag[] = [];
    const allTagStrings = allScenes.flatMap(s => s.tags);
    for (const name of allTagStrings) {
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      const saved = savedTagMap.get(name);
      if (saved) {
        allTags.push(saved);
      } else {
        allTags.push(...createTagsFromStrings([name], allTags));
      }
    }

    // 6. Migrate legacy keys
    const migration = migrateSceneKeys(allScenes, timelineData);
    timelineData = migration.timelineData;

    // 7. Apply positions and word counts
    for (const scene of allScenes) {
      const position = timelineData.positions[scene.id];
      scene.timelinePosition = position !== undefined ? position : null;
      if (timelineData.wordCounts && timelineData.wordCounts[scene.id] !== undefined) {
        scene.wordCount = timelineData.wordCounts[scene.id];
      }
    }

    // 8. Derive project name from folder path
    const projectName = folderPath.split('/').pop() || 'Untitled';

    return {
      projectPath: folderPath,
      projectName,
      characters,
      scenes: allScenes,
      plotPoints: allPlotPoints,
      tags: allTags,
      connections: timelineData.connections || {},
      chapters: timelineData.chapters || [],
      characterColors: timelineData.characterColors || {},
      fontSettings: timelineData.fontSettings || {},
      allFontSettings: timelineData.allFontSettings,
      archivedScenes: timelineData.archivedScenes || [],
      draftContent: Object.keys(draftContent).length > 0
        ? draftContent
        : (timelineData.draftContent || {}),
      metadataFieldDefs: timelineData.metadataFieldDefs || [],
      sceneMetadata: timelineData.sceneMetadata || {},
      drafts: Object.keys(drafts).length > 0
        ? drafts
        : (timelineData.drafts || {}),
      wordCountGoal: timelineData.wordCountGoal || 0,
      scratchpad: Object.keys(scratchpad).length > 0
        ? scratchpad
        : (timelineData.scratchpad || {}),
      sceneComments: Object.keys(sceneCommentsMap).length > 0
        ? sceneCommentsMap
        : (timelineData.sceneComments || {}),
      tasks: timelineData.tasks || [],
      taskFieldDefs: timelineData.taskFieldDefs || [],
      taskViews: timelineData.taskViews || [],
      taskColumnWidths: timelineData.taskColumnWidths || {},
      taskVisibleColumns: timelineData.taskVisibleColumns,
      inlineMetadataFields: timelineData.inlineMetadataFields,
      showInlineLabels: timelineData.showInlineLabels,
      timelineDates: timelineData.timelineDates || {},
      worldEvents: timelineData.worldEvents || [],
      _migrated: migration.migrated,
    };
  }

  // ── Character I/O ───────────────────────────────────────────────────────

  async saveCharacterOutline(
    character: Character,
    plotPoints: PlotPoint[],
    scenes: Scene[],
  ): Promise<void> {
    const outline = this.outlineFiles.get(character.id);
    if (!outline) {
      throw new Error('Character outline not found');
    }

    outline.character = character;
    outline.plotPoints = plotPoints.filter(p => p.characterId === character.id);
    outline.scenes = scenes.filter(s => s.characterId === character.id);

    const content = serializeOutline(outline);
    let savePath = character.filePath;
    if (this.activeBranch && this.projectPath) {
      const fileName = character.filePath.split('/').pop() || '';
      savePath = `${this.projectPath}/branches/${this.activeBranch}/${fileName}`;
    }
    await writeTextFile(savePath, content);
    outline.rawContent = content;
  }

  async createCharacter(folderPath: string, name: string): Promise<Character> {
    const character: Character = {
      id: generateId(),
      name,
      filePath: `${folderPath}/${name}.md`,
    };

    // Write initial .md file with frontmatter
    const initialContent = `---\ncharacter: ${name}\n---\n\n## Act 1\n1. First scene description here\n`;
    await writeTextFile(character.filePath, initialContent);

    // Create empty outline for this character
    const outline: OutlineFile = {
      character,
      plotPoints: [
        {
          id: generateId(),
          characterId: character.id,
          title: 'Act 1',
          expectedSceneCount: null,
          description: '',
          order: 0,
        },
      ],
      scenes: [
        {
          id: generateId(),
          characterId: character.id,
          sceneNumber: 1,
          title: 'First scene description here',
          content: 'First scene description here',
          tags: [],
          timelinePosition: null,
          isHighlighted: false,
          notes: [],
          plotPointId: null,
        },
      ],
      rawContent: initialContent,
    };

    this.outlineFiles.set(character.id, outline);
    return character;
  }

  // ── Timeline I/O ───────────────────────────────────────────────────────

  async saveTimeline(
    positions: Record<string, number>,
    connections: Record<string, string[]>,
    chapters: BraidedChapter[],
    characterColors?: Record<string, string>,
    wordCounts?: Record<string, number>,
    fontSettings?: FontSettings,
    archivedScenes?: ArchivedScene[],
    metadataFieldDefs?: MetadataFieldDef[],
    sceneMetadata?: Record<string, Record<string, string | string[]>>,
    wordCountGoal?: number,
    allFontSettings?: AllFontSettings,
    tasks?: Task[],
    taskFieldDefs?: TaskFieldDef[],
    taskViews?: TaskViewConfig[],
    inlineMetadataFields?: string[],
    showInlineLabels?: boolean,
    taskColumnWidths?: Record<string, number>,
    taskVisibleColumns?: string[],
    timelineDates?: Record<string, string>,
    worldEvents?: WorldEvent[],
    timelineEndDates?: Record<string, string>,
    tags?: Tag[],
  ): Promise<void> {
    if (!this.projectPath) {
      throw new Error('No project loaded');
    }

    if (this.activeBranch) {
      await writeTextFile(
        `${this.projectPath}/branches/${this.activeBranch}/positions.json`,
        JSON.stringify(positions, null, 2),
      );
    }

    const data: TimelineData = {
      positions,
      connections,
      chapters,
      characterColors,
      wordCounts,
      fontSettings,
      archivedScenes,
      metadataFieldDefs,
      sceneMetadata,
      wordCountGoal,
      allFontSettings,
      tasks,
      taskFieldDefs,
      taskViews,
      inlineMetadataFields,
      showInlineLabels,
      taskColumnWidths,
      taskVisibleColumns,
      timelineDates,
      timelineEndDates,
      worldEvents,
      tags,
    };

    // Preserve task-family data when caller omits it — mirrors the
    // main-process saveTimelineToDisk guard (see src/main/saveTimeline.ts).
    // MobileApp.saveTimelineData passes only 5 args; without this, an iOS
    // save would wipe tasks from the iCloud-synced timeline.json.
    const timelinePath = `${this.projectPath}/timeline.json`;
    const merged: Record<string, unknown> = { ...data };
    const existingRaw = await readTextFile(timelinePath);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as Record<string, unknown>;
        const PRESERVED_KEYS = [
          'tasks',
          'taskFieldDefs',
          'taskViews',
          'taskColumnWidths',
          'archivedScenes',
          'worldEvents',
        ] as const;
        const isEmpty = (v: unknown): boolean => {
          if (v === undefined || v === null) return true;
          if (Array.isArray(v)) return v.length === 0;
          if (typeof v === 'object') return Object.keys(v as object).length === 0;
          return false;
        };
        for (const key of PRESERVED_KEYS) {
          if (merged[key] === undefined && !isEmpty(existing[key])) {
            merged[key] = existing[key];
          }
        }
      } catch {
        // Corrupt existing file — fall through and write incoming as-is.
      }
    }

    await writeTextFile(timelinePath, JSON.stringify(merged, null, 2));
  }

  // ── Recent projects ─────────────────────────────────────────────────────

  async getRecentProjects(): Promise<RecentProject[]> {
    const { value } = await Preferences.get({ key: 'recentProjects' });
    if (!value) return [];
    try {
      return JSON.parse(value) as RecentProject[];
    } catch (_e) {
      return [];
    }
  }

  async addRecentProject(project: RecentProject): Promise<void> {
    const existing = await this.getRecentProjects();
    const filtered = existing.filter(p => p.path !== project.path);
    filtered.unshift(project);
    // Keep at most 10 recent projects
    const trimmed = filtered.slice(0, 10);
    await Preferences.set({
      key: 'recentProjects',
      value: JSON.stringify(trimmed),
    });
  }

  // ── Unsupported on iPad ─────────────────────────────────────────────────

  async selectSaveLocation(): Promise<string | null> {
    return null; // Not supported on iPad
  }

  async createProject(
    _parentPath: string,
    _projectName: string,
    _template: ProjectTemplate,
  ): Promise<string | null> {
    throw new Error('Project creation is only available on desktop. Please create projects in the desktop app and sync via iCloud/Dropbox.');
  }

  // ── Delete file ─────────────────────────────────────────────────────────

  async deleteFile(filePath: string): Promise<void> {
    await Filesystem.deleteFile({ path: filePath });
  }

  // ── Notes ───────────────────────────────────────────────────────────────

  async loadNotesIndex(projectPath: string): Promise<NotesIndex> {
    const raw = await readTextFile(`${projectPath}/notes/notes-index.json`);
    if (!raw) return { notes: [] };
    try {
      return JSON.parse(raw) as NotesIndex;
    } catch (_e) {
      return { notes: [] };
    }
  }

  async saveNotesIndex(projectPath: string, data: NotesIndex): Promise<void> {
    await writeTextFile(
      `${projectPath}/notes/notes-index.json`,
      JSON.stringify(data, null, 2),
    );
  }

  async readNote(projectPath: string, fileName: string): Promise<string> {
    const raw = await readTextFile(`${projectPath}/notes/${fileName}`);
    const content = raw || '';

    // Rewrite braidr-img:// URLs to Capacitor-compatible local file URLs
    return content.replace(
      /braidr-img:\/\/([^"')\s]+)/g,
      (_match, rawPath: string) => {
        const decoded = decodeURIComponent(rawPath);
        const notesIdx = decoded.indexOf('/notes/');
        const relativePath = notesIdx >= 0 ? decoded.substring(notesIdx + 7) : decoded;
        return `capacitor://localhost/_capacitor_file_${projectPath}/notes/${relativePath}`;
      },
    );
  }

  async saveNote(projectPath: string, fileName: string, content: string): Promise<void> {
    // Reverse the Capacitor URL rewrite back to braidr-img:// for portable storage
    const portableContent = content.replace(
      /capacitor:\/\/localhost\/_capacitor_file_[^/]*\/notes\/([^"')\s]+)/g,
      (_match, relativePath: string) => {
        return `braidr-img://${projectPath}/notes/${relativePath}`;
      },
    );
    await writeTextFile(`${projectPath}/notes/${fileName}`, portableContent);
  }

  async createNote(projectPath: string, fileName: string): Promise<void> {
    await writeTextFile(`${projectPath}/notes/${fileName}`, '');
  }

  async deleteNote(projectPath: string, fileName: string): Promise<void> {
    await Filesystem.deleteFile({ path: `${projectPath}/notes/${fileName}` });
  }

  async renameNote(
    projectPath: string,
    oldFileName: string,
    newFileName: string,
  ): Promise<void> {
    await Filesystem.rename({
      from: `${projectPath}/notes/${oldFileName}`,
      to: `${projectPath}/notes/${newFileName}`,
    });
  }

  // ── Note images ─────────────────────────────────────────────────────────

  async saveNoteImage(
    projectPath: string,
    imageData: string,
    fileName: string,
  ): Promise<string> {
    const imagePath = `${projectPath}/notes/images/${fileName}`;
    // imageData is expected to be base64
    await Filesystem.writeFile({
      path: imagePath,
      data: imageData,
      recursive: true,
    });
    return `braidr-img://${imagePath}`;
  }

  async selectNoteImage(_projectPath: string): Promise<string | null> {
    // Image selection on iPad would use a camera/photo picker plugin.
    // Not yet implemented — return null.
    return null;
  }

  // ── Per-scene content ───────────────────────────────────────────────────

  async readDraft(projectPath: string, sceneId: string): Promise<string> {
    const raw = await readTextFile(`${projectPath}/drafts/${sceneId}.html`);
    return raw || '';
  }

  async saveDraft(projectPath: string, sceneId: string, content: string): Promise<void> {
    await writeTextFile(`${projectPath}/drafts/${sceneId}.html`, content);
  }

  async readScratchpad(projectPath: string, sceneId: string): Promise<string> {
    const raw = await readTextFile(`${projectPath}/scratchpad/${sceneId}.html`);
    return raw || '';
  }

  async saveScratchpad(projectPath: string, sceneId: string, content: string): Promise<void> {
    await writeTextFile(`${projectPath}/scratchpad/${sceneId}.html`, content);
  }

  async readDraftVersions(projectPath: string, sceneId: string): Promise<DraftVersion[]> {
    const raw = await readTextFile(`${projectPath}/drafts/${sceneId}.versions.json`);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as DraftVersion[];
    } catch (_e) {
      return [];
    }
  }

  async saveDraftVersions(
    projectPath: string,
    sceneId: string,
    versions: DraftVersion[],
  ): Promise<void> {
    await writeTextFile(
      `${projectPath}/drafts/${sceneId}.versions.json`,
      JSON.stringify(versions, null, 2),
    );
  }

  async readSceneComments(projectPath: string, sceneId: string): Promise<SceneComment[]> {
    const raw = await readTextFile(`${projectPath}/comments/${sceneId}.json`);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SceneComment[];
    } catch (_e) {
      return [];
    }
  }

  async saveSceneComments(
    projectPath: string,
    sceneId: string,
    comments: SceneComment[],
  ): Promise<void> {
    await writeTextFile(
      `${projectPath}/comments/${sceneId}.json`,
      JSON.stringify(comments, null, 2),
    );
  }

  // ── Conflict detection ──────────────────────────────────────────────────

  async listProjectFiles(projectPath: string): Promise<string[]> {
    const entries = await listDir(projectPath);
    return entries.filter(e => e.type === 'file').map(e => e.name);
  }

  // ── Branches ────────────────────────────────────────────────────────────

  async listBranches(projectPath: string): Promise<BranchIndex> {
    return readBranchIndex(projectPath);
  }

  async createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
    const index = await readBranchIndex(projectPath);

    const sourceLabel = index.activeBranch ?? 'main';
    const sourceDir = branchMdDir(projectPath, index.activeBranch);
    const sourcePositions = await readBranchPositions(projectPath, index.activeBranch);

    const mdFiles = await listMdFiles(sourceDir);
    const destDir = `${projectPath}/branches/${name}`;
    for (const fileName of mdFiles) {
      const content = await readTextFile(`${sourceDir}/${fileName}`);
      if (content !== null) {
        await writeTextFile(`${destDir}/${fileName}`, content);
      }
    }

    await writeTextFile(`${destDir}/positions.json`, JSON.stringify(sourcePositions, null, 2));

    const info: BranchInfo = {
      name,
      description,
      createdAt: new Date().toISOString(),
      createdFrom: sourceLabel,
    };
    index.branches.push(info);
    index.activeBranch = name;
    await writeBranchIndex(projectPath, index);

    return index;
  }

  async switchBranch(projectPath: string, name: string | null): Promise<BranchIndex> {
    const index = await readBranchIndex(projectPath);
    index.activeBranch = name;
    this.activeBranch = name;
    await writeBranchIndex(projectPath, index);
    return index;
  }

  async deleteBranch(projectPath: string, name: string): Promise<BranchIndex> {
    const index = await readBranchIndex(projectPath);

    const branchDir = `${projectPath}/branches/${name}`;
    const entries = await listDir(branchDir);
    for (const entry of entries) {
      try {
        await Filesystem.deleteFile(fsOptions(`${branchDir}/${entry.name}`));
      } catch { /* file may already be gone */ }
    }
    try {
      await Filesystem.rmdir(fsOptions(branchDir));
    } catch { /* directory may already be gone */ }

    index.branches = index.branches.filter(b => b.name !== name);
    if (index.activeBranch === name) {
      index.activeBranch = null;
      this.activeBranch = null;
    }
    await writeBranchIndex(projectPath, index);

    return index;
  }

  async mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void> {
    if (sceneIds.length === 0) return;

    const branchDir = branchMdDir(projectPath, branchName);
    const branchPositions = await readBranchPositions(projectPath, branchName);
    const branchScenes = await parseScenesFromDir(branchDir);

    const branchMap = new Map(branchScenes.map(s => [s.sceneId, s]));

    const fileUpdates = new Map<string, { sceneId: string; fullLine: string }[]>();
    for (const sid of sceneIds) {
      const branchScene = branchMap.get(sid);
      if (!branchScene) continue;
      const existing = fileUpdates.get(branchScene.fileName) ?? [];
      existing.push({ sceneId: sid, fullLine: branchScene.fullLine });
      fileUpdates.set(branchScene.fileName, existing);
    }

    for (const [fileName, updates] of fileUpdates) {
      const mainFilePath = `${projectPath}/${fileName}`;
      let content = await readTextFile(mainFilePath);
      if (!content) continue;

      for (const { sceneId, fullLine } of updates) {
        const sidPattern = new RegExp(`^(\\d+\\.\\s+.*)<!--\\s*sid:${escapeRegex(sceneId)}\\s*-->.*$`, 'm');
        content = content.replace(sidPattern, fullLine);
      }

      await writeTextFile(mainFilePath, content);
    }

    const timelineRaw = await readTextFile(`${projectPath}/timeline.json`);
    let timeline: Record<string, unknown> = { positions: {}, connections: {}, chapters: [] };
    if (timelineRaw) {
      try { timeline = JSON.parse(timelineRaw); } catch { /* use default */ }
    }

    const positions = (timeline.positions ?? {}) as Record<string, number>;
    for (const sid of sceneIds) {
      if (sid in branchPositions) {
        positions[sid] = branchPositions[sid];
      }
    }
    timeline.positions = positions;

    await writeTextFile(`${projectPath}/timeline.json`, JSON.stringify(timeline, null, 2));
  }

  async compareBranches(projectPath: string, leftBranch: string | null, rightBranch: string | null): Promise<BranchCompareData> {
    const leftDir = branchMdDir(projectPath, leftBranch);
    const rightDir = branchMdDir(projectPath, rightBranch);
    const leftPositions = await readBranchPositions(projectPath, leftBranch);
    const rightPositions = await readBranchPositions(projectPath, rightBranch);

    const leftScenes = await parseScenesFromDir(leftDir);
    const rightScenes = await parseScenesFromDir(rightDir);

    const leftMap = new Map(leftScenes.map(s => [s.sceneId, s]));
    const rightMap = new Map(rightScenes.map(s => [s.sceneId, s]));

    const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const diffs: BranchSceneDiff[] = [];

    for (const sceneId of allIds) {
      const l = leftMap.get(sceneId);
      const r = rightMap.get(sceneId);

      const leftTitle = l?.title ?? '';
      const rightTitle = r?.title ?? '';
      const leftPos = leftPositions[sceneId] ?? null;
      const rightPos = rightPositions[sceneId] ?? null;

      const changed = leftTitle !== rightTitle || leftPos !== rightPos;

      diffs.push({
        sceneId,
        characterId: (l ?? r)!.characterId,
        characterName: (l ?? r)!.characterName,
        sceneNumber: (l ?? r)!.sceneNumber,
        leftTitle,
        rightTitle,
        leftPosition: leftPos,
        rightPosition: rightPos,
        changed,
      });
    }

    return {
      leftName: leftBranch ?? 'main',
      rightName: rightBranch ?? 'main',
      scenes: diffs,
    };
  }

  async acquireProjectLock(projectPath: string, force?: boolean): Promise<{ acquired: boolean; heldBy?: string }> {
    const { deviceId, deviceName } = await getCapacitorDeviceInfo();
    const read = async (): Promise<LockData | null> => {
      const content = await readTextFile(`${projectPath}/.braidr/lock.json`);
      if (!content) return null;
      try { return JSON.parse(content); } catch { return null; }
    };
    const write = async (data: LockData): Promise<void> => {
      await writeTextFile(`${projectPath}/.braidr/lock.json`, JSON.stringify(data, null, 2));
    };
    return acquireLock(deviceId, deviceName, read, write, force);
  }

  async releaseProjectLock(projectPath: string): Promise<void> {
    stopHeartbeat();
    await releaseLock(async () => {
      try {
        await Filesystem.deleteFile(fsOptions(`${projectPath}/.braidr/lock.json`));
      } catch { /* already gone */ }
    });
  }

  startLockHeartbeat(projectPath: string, onTakenOver: (byDeviceName: string) => void): void {
    getCapacitorDeviceInfo().then(({ deviceId, deviceName }) => {
      const read = async (): Promise<LockData | null> => {
        const content = await readTextFile(`${projectPath}/.braidr/lock.json`);
        if (!content) return null;
        try { return JSON.parse(content); } catch { return null; }
      };
      const write = async (data: LockData): Promise<void> => {
        await writeTextFile(`${projectPath}/.braidr/lock.json`, JSON.stringify(data, null, 2));
      };
      startHeartbeat(deviceId, deviceName, read, write, onTakenOver);
    });
  }

  stopLockHeartbeat(): void {
    stopHeartbeat();
  }
}
