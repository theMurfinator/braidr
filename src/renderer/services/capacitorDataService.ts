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
} from '../../shared/types';
import { parseOutlineFile, serializeOutline, createTagsFromStrings } from './parser';
import { migrateSceneKeys } from './migration';
import type { DataService } from './dataService';

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

// ---------------------------------------------------------------------------
// CapacitorDataService
// ---------------------------------------------------------------------------

export class CapacitorDataService implements DataService {
  private projectPath: string | null = null;
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

    // 1. List .md files in project folder (exclude CLAUDE* and README*)
    const entries = await listDir(folderPath);
    const mdFiles = entries.filter(
      e =>
        e.type === 'file' &&
        e.name.endsWith('.md') &&
        !e.name.startsWith('CLAUDE') &&
        !e.name.startsWith('README'),
    );

    // 2. Read each outline and parse
    const characters: Character[] = [];
    const allScenes: Scene[] = [];
    const allPlotPoints: PlotPoint[] = [];

    for (const file of mdFiles) {
      const filePath = `${folderPath}/${file.name}`;
      const content = await readTextFile(filePath);
      if (content === null) continue;

      const outline = parseOutlineFile(content, file.name, filePath);
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
    await writeTextFile(character.filePath, content);
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

    await writeTextFile(
      `${this.projectPath}/timeline.json`,
      JSON.stringify(data, null, 2),
    );
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
}
