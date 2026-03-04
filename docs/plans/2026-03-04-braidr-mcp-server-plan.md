# Braidr MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a read-only MCP server that exposes Braidr novel project data (scenes, characters, braid, prose, notes) to Claude Desktop.

**Architecture:** A stdio-based MCP server in TypeScript at `braidr/mcp-server/`. It takes a project path as a CLI argument, reads `.md` outlines + `timeline.json` + `notes/` on every tool call, and returns formatted text. Uses `@modelcontextprotocol/server` v2 SDK with `zod/v4`.

**Tech Stack:** TypeScript, `@modelcontextprotocol/server`, `zod/v4`, Node.js

---

### Task 1: Project Scaffolding

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/src/index.ts` (placeholder)

**Step 1: Create directory and package.json**

```bash
cd /Users/brian/braidr
mkdir -p mcp-server/src
```

```json
// mcp-server/package.json
{
  "name": "braidr-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
// mcp-server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create placeholder index.ts**

```typescript
// mcp-server/src/index.ts
console.error('braidr-mcp starting...');
```

**Step 4: Install dependencies**

```bash
cd /Users/brian/braidr/mcp-server && npm install
```

**Step 5: Verify build**

```bash
cd /Users/brian/braidr/mcp-server && npm run build
```

**Step 6: Commit**

```bash
cd /Users/brian/braidr
git add mcp-server/package.json mcp-server/tsconfig.json mcp-server/src/index.ts mcp-server/package-lock.json
git commit -m "feat(mcp): scaffold braidr-mcp project"
```

---

### Task 2: Markdown Parser

Replicate Braidr's parser from `src/renderer/services/parser.ts`. Standalone module, no Electron dependencies.

**Files:**
- Create: `mcp-server/src/parser.ts`
- Create: `mcp-server/src/parser.test.ts`

**Step 1: Write parser tests**

```typescript
// mcp-server/src/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseOutlineFile, extractTags, stableId } from './parser.js';

describe('stableId', () => {
  it('generates consistent IDs from character names', () => {
    expect(stableId('frodo')).toBe(stableId('frodo'));
    expect(stableId('frodo')).toMatch(/^c[a-z0-9]+$/);
  });

  it('is case-insensitive via caller convention', () => {
    expect(stableId('noah')).toBe(stableId('noah'));
  });
});

describe('extractTags', () => {
  it('extracts hashtags from text', () => {
    expect(extractTags('meets #cormac at #thane_hq')).toEqual(['cormac', 'thane_hq']);
  });

  it('deduplicates tags', () => {
    expect(extractTags('#foo #bar #foo')).toEqual(['foo', 'bar']);
  });

  it('lowercases tags', () => {
    expect(extractTags('#Brooklyn #NYC')).toEqual(['brooklyn', 'nyc']);
  });
});

describe('parseOutlineFile', () => {
  const sampleOutline = `---
character: Noah
---

## Act 1 - Setup (6)
Noah's ordinary world.

1. ==**Opening Scene**== Noah at home #brooklyn <!-- sid:abc123 -->
\t1. - First note
\t1. - Second note

2. Meeting Grace #grace #park <!-- sid:def456 -->

## Act 2 - Confrontation (8)

3. The conflict begins #antagonist <!-- sid:ghi789 -->
`;

  it('parses character from frontmatter', () => {
    const result = parseOutlineFile(sampleOutline, 'noah.md', '/project/noah.md');
    expect(result.character.name).toBe('Noah');
    expect(result.character.id).toBe(stableId('noah'));
    expect(result.character.filePath).toBe('/project/noah.md');
  });

  it('parses plot points with expected counts', () => {
    const result = parseOutlineFile(sampleOutline, 'noah.md', '/project/noah.md');
    expect(result.plotPoints).toHaveLength(2);
    expect(result.plotPoints[0].title).toBe('Act 1 - Setup');
    expect(result.plotPoints[0].expectedSceneCount).toBe(6);
    expect(result.plotPoints[0].description).toBe("Noah's ordinary world.");
    expect(result.plotPoints[1].title).toBe('Act 2 - Confrontation');
    expect(result.plotPoints[1].expectedSceneCount).toBe(8);
  });

  it('parses scenes with stable IDs', () => {
    const result = parseOutlineFile(sampleOutline, 'noah.md', '/project/noah.md');
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[0].id).toBe('abc123');
    expect(result.scenes[0].sceneNumber).toBe(1);
    expect(result.scenes[0].isHighlighted).toBe(true);
    expect(result.scenes[0].tags).toContain('brooklyn');
    expect(result.scenes[0].tags).toContain('noah');
  });

  it('parses sub-notes', () => {
    const result = parseOutlineFile(sampleOutline, 'noah.md', '/project/noah.md');
    expect(result.scenes[0].notes).toEqual(['First note', 'Second note']);
  });

  it('handles missing frontmatter', () => {
    const noFrontmatter = '1. A scene <!-- sid:x1 -->';
    const result = parseOutlineFile(noFrontmatter, 'some-character.md', '/p/some-character.md');
    expect(result.character.name).toBe('Some Character');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/brian/braidr/mcp-server && npx vitest run src/parser.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement parser**

```typescript
// mcp-server/src/parser.ts

// --- Types ---

export interface Character {
  id: string;
  name: string;
  filePath: string;
  color?: string;
}

export interface Scene {
  id: string;
  characterId: string;
  sceneNumber: number;
  title: string;
  content: string;
  tags: string[];
  timelinePosition: number | null;
  isHighlighted: boolean;
  notes: string[];
  plotPointId: string | null;
  wordCount?: number;
}

export interface PlotPoint {
  id: string;
  characterId: string;
  title: string;
  expectedSceneCount: number | null;
  description: string;
  order: number;
}

export interface OutlineFile {
  character: Character;
  plotPoints: PlotPoint[];
  scenes: Scene[];
  rawContent: string;
}

// --- Utilities ---

export function stableId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'c' + Math.abs(hash).toString(36);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function extractTags(text: string): string[] {
  const tagRegex = /#([a-zA-Z0-9_]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1].toLowerCase());
  }
  return [...new Set(tags)];
}

// --- Parsing ---

function parseCharacterFromFrontmatter(content: string, fileName: string): {
  character: string;
  contentAfterFrontmatter: string;
  fileNameTag: string;
} {
  const fileNameWithoutExt = fileName.replace('.md', '');
  const fileNameTag = fileNameWithoutExt.toLowerCase().replace(/[\s-]+/g, '_');

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const characterMatch = frontmatter.match(/character:\s*(.+)/);
    const character = characterMatch ? characterMatch[1].trim() : fileNameWithoutExt;
    const contentAfterFrontmatter = content.slice(frontmatterMatch[0].length);
    return { character, contentAfterFrontmatter, fileNameTag };
  }

  return {
    character: fileNameWithoutExt.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    contentAfterFrontmatter: content,
    fileNameTag,
  };
}

function isPlotPointHeader(line: string): boolean {
  return /^##\s+.+/.test(line.trim());
}

function parsePlotPointHeader(line: string): { title: string; expectedCount: number | null } {
  const match = line.match(/^##\s+(.+?)(?:\s*\((\d+)\))?$/);
  if (match) {
    return { title: match[1].trim(), expectedCount: match[2] ? parseInt(match[2], 10) : null };
  }
  return { title: line.replace(/^##\s+/, '').trim(), expectedCount: null };
}

function isSceneLine(line: string): boolean {
  return /^\d+\.\s/.test(line);
}

function parseSceneLine(line: string): {
  sceneNumber: number;
  content: string;
  isHighlighted: boolean;
  stableId: string | null;
} {
  const match = line.match(/^(\d+)\.\s+(.+)$/);
  if (!match) return { sceneNumber: 0, content: line, isHighlighted: false, stableId: null };

  const sceneNumber = parseInt(match[1], 10);
  let content = match[2];

  let sid: string | null = null;
  const sidMatch = content.match(/<!--\s*sid:(\S+)\s*-->/);
  if (sidMatch) {
    sid = sidMatch[1];
    content = content.replace(/\s*<!--\s*sid:\S+\s*-->/, '').trim();
  }

  const isHighlighted = /==\*\*.*\*\*==/.test(content);
  return { sceneNumber, content, isHighlighted, stableId: sid };
}

function isSubNote(line: string): boolean {
  return /^\s+[\d\-*]\.?\s/.test(line) || /^\s+\d+\.\s/.test(line);
}

export function parseOutlineFile(content: string, fileName: string, filePath: string): OutlineFile {
  const { character: characterName, contentAfterFrontmatter, fileNameTag } =
    parseCharacterFromFrontmatter(content, fileName);

  const character: Character = {
    id: stableId(characterName.toLowerCase()),
    name: characterName,
    filePath,
  };

  const properCharacterTag = characterName.toLowerCase().replace(/\s+/g, '_');
  const lines = contentAfterFrontmatter.split('\n');
  const plotPoints: PlotPoint[] = [];
  const scenes: Scene[] = [];

  let currentPlotPoint: PlotPoint | null = null;
  let currentPlotPointDescription: string[] = [];
  let currentScene: Scene | null = null;
  let currentSceneNotes: string[] = [];
  let plotPointOrder = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;

    if (isPlotPointHeader(line)) {
      if (currentScene) {
        currentScene.notes = currentSceneNotes;
        scenes.push(currentScene);
        currentScene = null;
        currentSceneNotes = [];
      }
      if (currentPlotPoint && currentPlotPointDescription.length > 0) {
        currentPlotPoint.description = currentPlotPointDescription.join('\n').trim();
        currentPlotPointDescription = [];
      }

      const { title, expectedCount } = parsePlotPointHeader(trimmedLine);
      currentPlotPoint = {
        id: generateId(),
        characterId: character.id,
        title,
        expectedSceneCount: expectedCount,
        description: '',
        order: plotPointOrder++,
      };
      plotPoints.push(currentPlotPoint);
      continue;
    }

    if (isSceneLine(line)) {
      if (currentScene) {
        currentScene.notes = currentSceneNotes;
        scenes.push(currentScene);
        currentSceneNotes = [];
      }
      if (currentPlotPoint && currentPlotPointDescription.length > 0) {
        currentPlotPoint.description = currentPlotPointDescription.join('\n').trim();
        currentPlotPointDescription = [];
      }

      const { sceneNumber, content: sceneContent, isHighlighted, stableId: parsedSid } =
        parseSceneLine(trimmedLine);

      let tags = extractTags(sceneContent);
      if (fileNameTag !== properCharacterTag) {
        tags = tags.filter(t => t !== fileNameTag);
      }
      if (!tags.includes(properCharacterTag)) {
        tags.push(properCharacterTag);
      }

      currentScene = {
        id: parsedSid || generateId(),
        characterId: character.id,
        sceneNumber,
        title: sceneContent,
        content: sceneContent,
        tags,
        timelinePosition: null,
        isHighlighted,
        notes: [],
        plotPointId: currentPlotPoint?.id || null,
      };
      continue;
    }

    if (isSubNote(line) && currentScene) {
      currentSceneNotes.push(trimmedLine.replace(/^\s*[\d\-*]+\.?\s*/, ''));
      continue;
    }

    if (currentPlotPoint && !currentScene) {
      currentPlotPointDescription.push(trimmedLine);
    } else if (currentScene) {
      currentSceneNotes.push(trimmedLine);
    }
  }

  if (currentScene) {
    currentScene.notes = currentSceneNotes;
    scenes.push(currentScene);
  }
  if (currentPlotPoint && currentPlotPointDescription.length > 0) {
    currentPlotPoint.description = currentPlotPointDescription.join('\n').trim();
  }

  return { character, plotPoints, scenes, rawContent: content };
}
```

**Step 4: Run tests**

```bash
cd /Users/brian/braidr/mcp-server && npx vitest run src/parser.test.ts
```
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/brian/braidr
git add mcp-server/src/parser.ts mcp-server/src/parser.test.ts
git commit -m "feat(mcp): add markdown outline parser with tests"
```

---

### Task 3: Data Loader

Module that reads all project data from disk — characters, timeline, notes.

**Files:**
- Create: `mcp-server/src/loader.ts`
- Create: `mcp-server/src/loader.test.ts`
- Create: `mcp-server/src/types.ts`

**Step 1: Create shared types**

```typescript
// mcp-server/src/types.ts

export interface BraidedChapter {
  id: string;
  title: string;
  beforePosition: number;
}

export interface SceneComment {
  id: string;
  text: string;
  createdAt: number;
  resolved?: boolean;
}

export interface MetadataFieldDef {
  id: string;
  name: string;
  type: 'text' | 'select' | 'multiselect';
  options?: string[];
}

export interface WorldEvent {
  id: string;
  title: string;
  date: string;
  description?: string;
}

export interface TimelineData {
  positions: Record<string, number>;
  connections?: Record<string, string[]>;
  chapters?: BraidedChapter[];
  characterColors?: Record<string, string>;
  wordCounts?: Record<string, number>;
  draftContent?: Record<string, string>;
  metadataFieldDefs?: MetadataFieldDef[];
  sceneMetadata?: Record<string, Record<string, string | string[]>>;
  scratchpad?: Record<string, string>;
  sceneComments?: Record<string, SceneComment[]>;
  wordCountGoal?: number;
  timelineDates?: Record<string, string>;
  timelineEndDates?: Record<string, string>;
  worldEvents?: WorldEvent[];
}

export interface NoteMetadata {
  id: string;
  title: string;
  fileName: string;
  parentId: string | null;
  order: number;
  createdAt: number;
  modifiedAt: number;
  outgoingLinks: string[];
  sceneLinks: string[];
  tags?: string[];
}

export interface NotesIndex {
  notes: NoteMetadata[];
  archivedNotes?: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
  }>;
  version?: number;
}

export interface ProjectData {
  projectPath: string;
  projectName: string;
  characters: Array<import('./parser.js').Character>;
  scenes: Array<import('./parser.js').Scene>;
  plotPoints: Array<import('./parser.js').PlotPoint>;
  timeline: TimelineData;
  notesIndex: NotesIndex | null;
}
```

**Step 2: Write loader tests**

```typescript
// mcp-server/src/loader.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProject, loadNoteContent } from './loader.js';

describe('loadProject', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-test-'));

    // Create a character file
    fs.writeFileSync(path.join(tmpDir, 'noah.md'), `---
character: Noah
---

## Act 1 (2)

1. Opening scene #brooklyn <!-- sid:scene1 -->
\t1. - A note

2. Second scene #grace <!-- sid:scene2 -->
`);

    // Create timeline.json
    fs.writeFileSync(path.join(tmpDir, 'timeline.json'), JSON.stringify({
      positions: { scene1: 1, scene2: 2 },
      characterColors: {},
      wordCounts: { scene1: 500, scene2: 300 },
      draftContent: { scene1: '<p>The night was dark.</p>' },
      chapters: [{ id: 'ch1', title: 'Chapter 1', beforePosition: 1 }],
    }));

    // Create notes
    fs.mkdirSync(path.join(tmpDir, 'notes'));
    fs.writeFileSync(path.join(tmpDir, 'notes', 'notes-index.json'), JSON.stringify({
      notes: [{
        id: 'note1',
        title: 'World Building',
        fileName: 'note1.html',
        parentId: null,
        order: 0,
        createdAt: 1000,
        modifiedAt: 2000,
        outgoingLinks: [],
        sceneLinks: ['scene1'],
        tags: ['worldbuilding'],
      }],
      version: 2,
    }));
    fs.writeFileSync(path.join(tmpDir, 'notes', 'note1.html'), '<p>Magic system rules</p>');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('loads characters and scenes', async () => {
    const data = await loadProject(tmpDir);
    expect(data.characters).toHaveLength(1);
    expect(data.characters[0].name).toBe('Noah');
    expect(data.scenes).toHaveLength(2);
  });

  it('merges timeline positions into scenes', async () => {
    const data = await loadProject(tmpDir);
    const scene1 = data.scenes.find(s => s.id === 'scene1');
    expect(scene1?.timelinePosition).toBe(1);
    expect(scene1?.wordCount).toBe(500);
  });

  it('loads notes index', async () => {
    const data = await loadProject(tmpDir);
    expect(data.notesIndex?.notes).toHaveLength(1);
    expect(data.notesIndex?.notes[0].title).toBe('World Building');
  });

  it('loads note content', async () => {
    const content = await loadNoteContent(tmpDir, 'note1.html');
    expect(content).toBe('<p>Magic system rules</p>');
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
cd /Users/brian/braidr/mcp-server && npx vitest run src/loader.test.ts
```
Expected: FAIL — module not found

**Step 4: Implement loader**

```typescript
// mcp-server/src/loader.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseOutlineFile } from './parser.js';
import type { Character, Scene, PlotPoint } from './parser.js';
import type { TimelineData, NotesIndex, ProjectData } from './types.js';

export async function loadProject(projectPath: string): Promise<ProjectData> {
  const projectName = path.basename(projectPath);

  // Load all .md character files
  const files = fs.readdirSync(projectPath).filter(f => f.endsWith('.md'));
  const characters: Character[] = [];
  const scenes: Scene[] = [];
  const plotPoints: PlotPoint[] = [];

  for (const file of files) {
    const filePath = path.join(projectPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const outline = parseOutlineFile(content, file, filePath);
    characters.push(outline.character);
    scenes.push(...outline.scenes);
    plotPoints.push(...outline.plotPoints);
  }

  // Load timeline
  const timeline = loadTimeline(projectPath);

  // Apply timeline data to scenes
  for (const scene of scenes) {
    const position = timeline.positions[scene.id];
    scene.timelinePosition = position !== undefined ? position : null;
    if (timeline.wordCounts?.[scene.id] !== undefined) {
      scene.wordCount = timeline.wordCounts[scene.id];
    }
  }

  // Apply character colors
  if (timeline.characterColors) {
    for (const char of characters) {
      if (timeline.characterColors[char.id]) {
        char.color = timeline.characterColors[char.id];
      }
    }
  }

  // Load notes index
  const notesIndex = loadNotesIndex(projectPath);

  return { projectPath, projectName, characters, scenes, plotPoints, timeline, notesIndex };
}

function loadTimeline(projectPath: string): TimelineData {
  const timelinePath = path.join(projectPath, 'timeline.json');
  if (fs.existsSync(timelinePath)) {
    const content = fs.readFileSync(timelinePath, 'utf-8');
    return JSON.parse(content);
  }
  return { positions: {} };
}

function loadNotesIndex(projectPath: string): NotesIndex | null {
  const indexPath = path.join(projectPath, 'notes', 'notes-index.json');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(content);
  }
  return null;
}

export async function loadNoteContent(projectPath: string, fileName: string): Promise<string | null> {
  const notePath = path.join(projectPath, 'notes', fileName);
  if (fs.existsSync(notePath)) {
    return fs.readFileSync(notePath, 'utf-8');
  }
  return null;
}

export function getDraftProse(timeline: TimelineData, sceneId: string): string | null {
  return timeline.draftContent?.[sceneId] ?? null;
}
```

**Step 5: Run tests**

```bash
cd /Users/brian/braidr/mcp-server && npx vitest run src/loader.test.ts
```
Expected: ALL PASS

**Step 6: Commit**

```bash
cd /Users/brian/braidr
git add mcp-server/src/types.ts mcp-server/src/loader.ts mcp-server/src/loader.test.ts
git commit -m "feat(mcp): add project data loader with tests"
```

---

### Task 4: MCP Server with All Tools

Wire up the MCP server entry point with all 11 tools.

**Files:**
- Modify: `mcp-server/src/index.ts`

**Step 1: Implement the full server**

```typescript
// mcp-server/src/index.ts
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { loadProject, loadNoteContent, getDraftProse } from './loader.js';
import type { Scene } from './parser.js';
import type { ProjectData } from './types.js';

const projectPath = process.argv[2];
if (!projectPath) {
  console.error('Usage: braidr-mcp <project-path>');
  process.exit(1);
}

const server = new McpServer({
  name: 'braidr',
  version: '1.0.0',
});

// Helper: strip HTML tags for readable output
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Helper: format a scene for output
function formatScene(scene: Scene, data: ProjectData): string {
  const char = data.characters.find(c => c.id === scene.characterId);
  const charName = char?.name ?? 'Unknown';
  const pos = scene.timelinePosition !== null ? `Braid position: ${scene.timelinePosition}` : 'Not yet braided';
  const wc = scene.wordCount ? `Word count: ${scene.wordCount}` : '';
  const tags = scene.tags.length > 0 ? `Tags: ${scene.tags.map(t => '#' + t).join(' ')}` : '';
  const notes = scene.notes.length > 0 ? `Notes:\n${scene.notes.map(n => '  - ' + n).join('\n')}` : '';
  const highlighted = scene.isHighlighted ? ' [HIGHLIGHTED]' : '';

  return [
    `Scene ${scene.sceneNumber} (${charName})${highlighted}`,
    `ID: ${scene.id}`,
    scene.title,
    pos,
    wc,
    tags,
    notes,
  ].filter(Boolean).join('\n');
}

// --- Tools ---

// 1. get_project_summary
server.registerTool(
  'get_project_summary',
  {
    title: 'Get Project Summary',
    description: 'Overview of the novel project: characters, scene counts, word counts, chapters',
    inputSchema: z.object({}),
  },
  async () => {
    const data = await loadProject(projectPath);
    const totalWords = data.scenes.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
    const braidedCount = data.scenes.filter(s => s.timelinePosition !== null).length;
    const unbraidedCount = data.scenes.length - braidedCount;
    const chapters = data.timeline.chapters ?? [];
    const noteCount = data.notesIndex?.notes.length ?? 0;

    const charSummaries = data.characters.map(c => {
      const charScenes = data.scenes.filter(s => s.characterId === c.id);
      const charWords = charScenes.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
      return `  ${c.name}: ${charScenes.length} scenes, ${charWords.toLocaleString()} words`;
    });

    const text = [
      `Project: ${data.projectName}`,
      `Characters: ${data.characters.length}`,
      `Total scenes: ${data.scenes.length} (${braidedCount} braided, ${unbraidedCount} unbraided)`,
      `Total words: ${totalWords.toLocaleString()}`,
      data.timeline.wordCountGoal ? `Word count goal: ${data.timeline.wordCountGoal.toLocaleString()}` : '',
      `Chapters: ${chapters.length}`,
      `Notes: ${noteCount}`,
      '',
      'Characters:',
      ...charSummaries,
      '',
      chapters.length > 0 ? 'Chapters:\n' + chapters.map(ch => `  ${ch.title} (before position ${ch.beforePosition})`).join('\n') : '',
    ].filter(line => line !== '').join('\n');

    return { content: [{ type: 'text', text }] };
  }
);

// 2. list_characters
server.registerTool(
  'list_characters',
  {
    title: 'List Characters',
    description: 'List all POV characters with their IDs, colors, and scene counts',
    inputSchema: z.object({}),
  },
  async () => {
    const data = await loadProject(projectPath);
    const lines = data.characters.map(c => {
      const sceneCount = data.scenes.filter(s => s.characterId === c.id).length;
      const color = c.color ? ` (${c.color})` : '';
      return `${c.name} [${c.id}]${color} — ${sceneCount} scenes`;
    });
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// 3. read_character_outline
server.registerTool(
  'read_character_outline',
  {
    title: 'Read Character Outline',
    description: 'Read the full outline for a character — plot points, scenes, and notes. Accepts character name (case-insensitive) or ID.',
    inputSchema: z.object({
      character: z.string().describe('Character name or ID'),
    }),
  },
  async ({ character }) => {
    const data = await loadProject(projectPath);
    const char = data.characters.find(
      c => c.name.toLowerCase() === character.toLowerCase() || c.id === character
    );
    if (!char) {
      return { content: [{ type: 'text', text: `Character not found: "${character}". Available: ${data.characters.map(c => c.name).join(', ')}` }] };
    }

    const charScenes = data.scenes.filter(s => s.characterId === char.id);
    const charPlotPoints = data.plotPoints.filter(pp => pp.characterId === char.id);

    const sections: string[] = [`# ${char.name}'s Outline\n`];

    for (const pp of charPlotPoints.sort((a, b) => a.order - b.order)) {
      const countStr = pp.expectedSceneCount ? ` (${pp.expectedSceneCount})` : '';
      sections.push(`## ${pp.title}${countStr}`);
      if (pp.description) sections.push(pp.description);

      const ppScenes = charScenes
        .filter(s => s.plotPointId === pp.id)
        .sort((a, b) => a.sceneNumber - b.sceneNumber);

      for (const scene of ppScenes) {
        const pos = scene.timelinePosition !== null ? ` [braid:${scene.timelinePosition}]` : '';
        const wc = scene.wordCount ? ` (${scene.wordCount}w)` : '';
        const hl = scene.isHighlighted ? '**' : '';
        sections.push(`${scene.sceneNumber}. ${hl}${scene.title}${hl}${pos}${wc}`);
        for (const note of scene.notes) {
          sections.push(`   - ${note}`);
        }
      }
      sections.push('');
    }

    // Orphan scenes (no plot point)
    const orphans = charScenes.filter(s => !s.plotPointId);
    if (orphans.length > 0) {
      sections.push('## (Unassigned scenes)');
      for (const scene of orphans.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
        sections.push(`${scene.sceneNumber}. ${scene.title}`);
      }
    }

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  }
);

// 4. read_scene
server.registerTool(
  'read_scene',
  {
    title: 'Read Scene',
    description: 'Read a specific scene by its ID, or by character name + scene number',
    inputSchema: z.object({
      sceneId: z.string().optional().describe('Scene stable ID'),
      character: z.string().optional().describe('Character name or ID (use with sceneNumber)'),
      sceneNumber: z.number().optional().describe('Scene number within character outline (use with character)'),
    }),
  },
  async ({ sceneId, character, sceneNumber }) => {
    const data = await loadProject(projectPath);

    let scene: Scene | undefined;
    if (sceneId) {
      scene = data.scenes.find(s => s.id === sceneId);
    } else if (character && sceneNumber !== undefined) {
      const char = data.characters.find(
        c => c.name.toLowerCase() === character.toLowerCase() || c.id === character
      );
      if (char) {
        scene = data.scenes.find(s => s.characterId === char.id && s.sceneNumber === sceneNumber);
      }
    }

    if (!scene) {
      return { content: [{ type: 'text', text: 'Scene not found. Provide sceneId, or character + sceneNumber.' }] };
    }

    return { content: [{ type: 'text', text: formatScene(scene, data) }] };
  }
);

// 5. read_scene_prose
server.registerTool(
  'read_scene_prose',
  {
    title: 'Read Scene Prose',
    description: 'Read the draft prose (manuscript text) for a scene',
    inputSchema: z.object({
      sceneId: z.string().describe('Scene stable ID'),
    }),
  },
  async ({ sceneId }) => {
    const data = await loadProject(projectPath);
    const scene = data.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return { content: [{ type: 'text', text: `Scene not found: ${sceneId}` }] };
    }

    const prose = getDraftProse(data.timeline, sceneId);
    if (!prose) {
      const char = data.characters.find(c => c.id === scene.characterId);
      return { content: [{ type: 'text', text: `No draft prose yet for scene ${scene.sceneNumber} (${char?.name ?? 'Unknown'}): "${scene.title}"` }] };
    }

    const char = data.characters.find(c => c.id === scene.characterId);
    const header = `Scene ${scene.sceneNumber} (${char?.name ?? 'Unknown'}): ${scene.title}\nWord count: ${scene.wordCount ?? 'unknown'}\n\n---\n\n`;
    return { content: [{ type: 'text', text: header + stripHtml(prose) }] };
  }
);

// 6. search_scenes
server.registerTool(
  'search_scenes',
  {
    title: 'Search Scenes',
    description: 'Search scenes by text content, tag, or character',
    inputSchema: z.object({
      query: z.string().optional().describe('Text to search for in scene titles/content'),
      tag: z.string().optional().describe('Tag to filter by (without #)'),
      character: z.string().optional().describe('Character name or ID to filter by'),
    }),
  },
  async ({ query, tag, character }) => {
    const data = await loadProject(projectPath);
    let results = data.scenes;

    if (character) {
      const char = data.characters.find(
        c => c.name.toLowerCase() === character.toLowerCase() || c.id === character
      );
      if (char) results = results.filter(s => s.characterId === char.id);
    }

    if (tag) {
      const normalizedTag = tag.toLowerCase().replace(/^#/, '');
      results = results.filter(s => s.tags.includes(normalizedTag));
    }

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.notes.some(n => n.toLowerCase().includes(q))
      );
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No scenes matched the search criteria.' }] };
    }

    const text = results.map(s => formatScene(s, data)).join('\n\n---\n\n');
    return { content: [{ type: 'text', text: `Found ${results.length} scene(s):\n\n${text}` }] };
  }
);

// 7. read_braid
server.registerTool(
  'read_braid',
  {
    title: 'Read Braid',
    description: 'Read the braided timeline — all scenes in braid order with chapter breaks. Optionally filter by position range.',
    inputSchema: z.object({
      fromPosition: z.number().optional().describe('Start position (inclusive)'),
      toPosition: z.number().optional().describe('End position (inclusive)'),
    }),
  },
  async ({ fromPosition, toPosition }) => {
    const data = await loadProject(projectPath);

    let braided = data.scenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => a.timelinePosition! - b.timelinePosition!);

    if (fromPosition !== undefined) {
      braided = braided.filter(s => s.timelinePosition! >= fromPosition);
    }
    if (toPosition !== undefined) {
      braided = braided.filter(s => s.timelinePosition! <= toPosition);
    }

    const chapters = (data.timeline.chapters ?? []).sort((a, b) => a.beforePosition - b.beforePosition);

    const lines: string[] = [];
    let chapterIdx = 0;

    for (const scene of braided) {
      // Insert chapter headers
      while (chapterIdx < chapters.length && chapters[chapterIdx].beforePosition <= scene.timelinePosition!) {
        lines.push(`\n=== ${chapters[chapterIdx].title} ===\n`);
        chapterIdx++;
      }

      const char = data.characters.find(c => c.id === scene.characterId);
      const charName = char?.name ?? '?';
      const wc = scene.wordCount ? ` (${scene.wordCount}w)` : '';
      const hl = scene.isHighlighted ? '**' : '';
      lines.push(`${scene.timelinePosition}. [${charName}] ${hl}${scene.title}${hl}${wc} {${scene.id}}`);
    }

    if (braided.length === 0) {
      return { content: [{ type: 'text', text: 'No braided scenes found in the specified range.' }] };
    }

    const header = `Braid: ${braided.length} scenes, positions ${braided[0].timelinePosition}–${braided[braided.length - 1].timelinePosition}\n`;
    return { content: [{ type: 'text', text: header + lines.join('\n') }] };
  }
);

// 8. read_timeline_metadata
server.registerTool(
  'read_timeline_metadata',
  {
    title: 'Read Timeline Metadata',
    description: 'Read connections, word count, dates, custom metadata, and comments for a scene',
    inputSchema: z.object({
      sceneId: z.string().describe('Scene stable ID'),
    }),
  },
  async ({ sceneId }) => {
    const data = await loadProject(projectPath);
    const scene = data.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return { content: [{ type: 'text', text: `Scene not found: ${sceneId}` }] };
    }

    const t = data.timeline;
    const connections = t.connections?.[sceneId] ?? [];
    const metadata = t.sceneMetadata?.[sceneId] ?? {};
    const comments = t.sceneComments?.[sceneId] ?? [];
    const date = t.timelineDates?.[sceneId];
    const endDate = t.timelineEndDates?.[sceneId];
    const scratchpad = t.scratchpad?.[sceneId];

    const char = data.characters.find(c => c.id === scene.characterId);
    const lines: string[] = [
      `Scene: ${scene.title}`,
      `Character: ${char?.name ?? 'Unknown'}`,
      `Braid position: ${scene.timelinePosition ?? 'unbraided'}`,
      `Word count: ${scene.wordCount ?? 'none'}`,
    ];

    if (date) lines.push(`Date: ${date}${endDate ? ' to ' + endDate : ''}`);
    if (connections.length > 0) {
      const connScenes = connections.map(id => {
        const s = data.scenes.find(sc => sc.id === id);
        return s ? `${s.title} [${id}]` : id;
      });
      lines.push(`Connected to: ${connScenes.join(', ')}`);
    }
    if (Object.keys(metadata).length > 0) {
      lines.push('Metadata:');
      for (const [key, value] of Object.entries(metadata)) {
        const fieldDef = t.metadataFieldDefs?.find(f => f.id === key);
        const label = fieldDef?.name ?? key;
        lines.push(`  ${label}: ${Array.isArray(value) ? value.join(', ') : value}`);
      }
    }
    if (comments.length > 0) {
      lines.push(`Comments (${comments.length}):`);
      for (const c of comments) {
        const resolved = c.resolved ? ' [resolved]' : '';
        lines.push(`  - ${c.text}${resolved}`);
      }
    }
    if (scratchpad) lines.push(`\nScratchpad:\n${scratchpad}`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// 9. list_notes
server.registerTool(
  'list_notes',
  {
    title: 'List Notes',
    description: 'List all notes with titles, tags, and links. Optionally filter by tag or parent note.',
    inputSchema: z.object({
      tag: z.string().optional().describe('Filter by tag'),
      parentId: z.string().optional().describe('Filter by parent note ID (for nested notes)'),
    }),
  },
  async ({ tag, parentId }) => {
    const data = await loadProject(projectPath);
    if (!data.notesIndex) {
      return { content: [{ type: 'text', text: 'No notes found in this project.' }] };
    }

    let notes = data.notesIndex.notes;
    if (tag) {
      const t = tag.toLowerCase();
      notes = notes.filter(n => n.tags?.some(nt => nt.toLowerCase() === t));
    }
    if (parentId !== undefined) {
      notes = notes.filter(n => n.parentId === parentId);
    }

    if (notes.length === 0) {
      return { content: [{ type: 'text', text: 'No notes matched the filter criteria.' }] };
    }

    const lines = notes.map(n => {
      const tags = n.tags?.length ? ` [${n.tags.map(t => '#' + t).join(' ')}]` : '';
      const links = n.outgoingLinks.length > 0 ? ` → ${n.outgoingLinks.join(', ')}` : '';
      const sceneLinks = n.sceneLinks.length > 0 ? ` (${n.sceneLinks.length} scene links)` : '';
      const parent = n.parentId ? ` (child of ${n.parentId})` : '';
      return `${n.title} [${n.id}]${tags}${links}${sceneLinks}${parent}`;
    });

    return { content: [{ type: 'text', text: `${notes.length} note(s):\n\n${lines.join('\n')}` }] };
  }
);

// 10. read_note
server.registerTool(
  'read_note',
  {
    title: 'Read Note',
    description: 'Read a note\'s content. Accepts note ID or title (case-insensitive).',
    inputSchema: z.object({
      note: z.string().describe('Note ID or title'),
    }),
  },
  async ({ note }) => {
    const data = await loadProject(projectPath);
    if (!data.notesIndex) {
      return { content: [{ type: 'text', text: 'No notes found in this project.' }] };
    }

    const meta = data.notesIndex.notes.find(
      n => n.id === note || n.title.toLowerCase() === note.toLowerCase()
    );
    if (!meta) {
      return { content: [{ type: 'text', text: `Note not found: "${note}". Use list_notes to see available notes.` }] };
    }

    const html = await loadNoteContent(projectPath, meta.fileName);
    if (!html) {
      return { content: [{ type: 'text', text: `Note file not found: ${meta.fileName}` }] };
    }

    const tags = meta.tags?.length ? `Tags: ${meta.tags.map(t => '#' + t).join(' ')}\n` : '';
    const header = `# ${meta.title}\n${tags}\n`;
    return { content: [{ type: 'text', text: header + stripHtml(html) }] };
  }
);

// 11. search_notes
server.registerTool(
  'search_notes',
  {
    title: 'Search Notes',
    description: 'Search notes by text content, tag, or linked scenes',
    inputSchema: z.object({
      query: z.string().optional().describe('Text to search for in note titles and content'),
      tag: z.string().optional().describe('Tag to filter by'),
      sceneId: z.string().optional().describe('Find notes linked to this scene ID'),
    }),
  },
  async ({ query, tag, sceneId }) => {
    const data = await loadProject(projectPath);
    if (!data.notesIndex) {
      return { content: [{ type: 'text', text: 'No notes found in this project.' }] };
    }

    let results = data.notesIndex.notes;

    if (tag) {
      const t = tag.toLowerCase();
      results = results.filter(n => n.tags?.some(nt => nt.toLowerCase() === t));
    }
    if (sceneId) {
      results = results.filter(n => n.sceneLinks.includes(sceneId));
    }

    // For text search, we need to load note content
    if (query) {
      const q = query.toLowerCase();
      const matched: typeof results = [];
      for (const note of results) {
        if (note.title.toLowerCase().includes(q)) {
          matched.push(note);
          continue;
        }
        const html = await loadNoteContent(projectPath, note.fileName);
        if (html && stripHtml(html).toLowerCase().includes(q)) {
          matched.push(note);
        }
      }
      results = matched;
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No notes matched the search criteria.' }] };
    }

    const lines = results.map(n => {
      const tags = n.tags?.length ? ` [${n.tags.map(t => '#' + t).join(' ')}]` : '';
      return `${n.title} [${n.id}]${tags}`;
    });
    return { content: [{ type: 'text', text: `Found ${results.length} note(s):\n\n${lines.join('\n')}` }] };
  }
);

// --- Start server ---
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('braidr-mcp server running on stdio');
```

**Step 2: Build**

```bash
cd /Users/brian/braidr/mcp-server && npm run build
```

**Step 3: Test manually with a quick smoke test**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node /Users/brian/braidr/mcp-server/dist/index.js "/Users/brian/Library/Mobile Documents/com~apple~CloudDocs/Desktop/My life is over"
```

Should print an `initialize` response with the server's capabilities.

**Step 4: Commit**

```bash
cd /Users/brian/braidr
git add mcp-server/src/index.ts
git commit -m "feat(mcp): implement MCP server with all 11 tools"
```

---

### Task 5: Configure Claude Desktop

**Step 1: Add braidr server to Claude Desktop config**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "braidr": {
      "command": "node",
      "args": [
        "/Users/brian/braidr/mcp-server/dist/index.js",
        "/Users/brian/Library/Mobile Documents/com~apple~CloudDocs/Desktop/My life is over"
      ]
    }
  }
}
```

**Step 2: Restart Claude Desktop**

Quit and reopen Claude Desktop. The braidr MCP server should appear in the tools list.

**Step 3: Test in Claude Desktop**

Try: "Give me a project summary" — should invoke `get_project_summary` and return character/scene counts.

**Step 4: Commit design doc**

```bash
cd /Users/brian/braidr
git add docs/plans/2026-03-04-braidr-mcp-server-design.md docs/plans/2026-03-04-braidr-mcp-server-plan.md
git commit -m "docs: add MCP server design and implementation plan"
```
