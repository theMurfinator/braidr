# Draft Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create named branches of scene outlines and timeline positions, switch between them, compare side-by-side, and selectively merge back to main.

**Architecture:** New `branches/` folder per project stores branch data. IPC handlers in a dedicated `src/main/branches.ts` module do all file I/O. The renderer gets new `branchService` methods on the data service, a `BranchSelector` toolbar component, a `CompareView` component, and a `MergeDialog` modal.

**Tech Stack:** Electron IPC (existing pattern), Vitest (existing), React components

---

### Task 1: Types and IPC Channel Definitions

**Files:**
- Modify: `src/shared/types.ts:328-384`
- Modify: `src/main/preload.ts:4-55` (IPC_CHANNELS block)
- Modify: `src/main/preload.ts:67-120` (electronAPI block)

- [ ] **Step 1: Add branch types to `src/shared/types.ts`**

Add after the `NotesIndex` interface (around line 308):

```typescript
// ── Draft Branches ──────────────────────────────────────────────────────────

export interface BranchInfo {
  name: string;
  description?: string;
  createdAt: string;
  createdFrom: string;
}

export interface BranchIndex {
  branches: BranchInfo[];
  activeBranch: string | null;
}

export interface BranchCompareData {
  leftName: string;
  rightName: string;
  scenes: BranchSceneDiff[];
}

export interface BranchSceneDiff {
  sceneId: string;
  characterId: string;
  characterName: string;
  sceneNumber: number;
  leftTitle: string;
  rightTitle: string;
  leftPosition: number | null;
  rightPosition: number | null;
  changed: boolean;
}
```

- [ ] **Step 2: Add IPC channels to `src/shared/types.ts`**

Add to the `IPC_CHANNELS` object, before the closing `} as const;`:

```typescript
  // Branches
  BRANCHES_LIST: 'branches:list',
  BRANCHES_CREATE: 'branches:create',
  BRANCHES_SWITCH: 'branches:switch',
  BRANCHES_DELETE: 'branches:delete',
  BRANCHES_MERGE: 'branches:merge',
  BRANCHES_COMPARE: 'branches:compare',
```

- [ ] **Step 3: Add IPC channels to `src/main/preload.ts`**

Add to the `IPC_CHANNELS` object in preload (duplicated there, around line 4-55):

```typescript
  // Branches
  BRANCHES_LIST: 'branches:list',
  BRANCHES_CREATE: 'branches:create',
  BRANCHES_SWITCH: 'branches:switch',
  BRANCHES_DELETE: 'branches:delete',
  BRANCHES_MERGE: 'branches:merge',
  BRANCHES_COMPARE: 'branches:compare',
```

Add to the `electronAPI` object exposed via `contextBridge`:

```typescript
  // Branches
  branchesList: (projectPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_LIST, projectPath),
  branchesCreate: (projectPath: string, name: string, description?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_CREATE, projectPath, name, description),
  branchesSwitch: (projectPath: string, name: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_SWITCH, projectPath, name),
  branchesDelete: (projectPath: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_DELETE, projectPath, name),
  branchesMerge: (projectPath: string, branchName: string, sceneIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_MERGE, projectPath, branchName, sceneIds),
  branchesCompare: (projectPath: string, leftBranch: string | null, rightBranch: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_COMPARE, projectPath, leftBranch, rightBranch),
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/main/preload.ts
git commit -m "feat(branches): add branch types and IPC channel definitions"
```

---

### Task 2: Main Process Branch Handlers

**Files:**
- Create: `src/main/branches.ts`
- Modify: `src/main/main.ts` (import + register)

- [ ] **Step 1: Write tests for branch file operations**

Create `src/__tests__/branches.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  listBranches,
  createBranch,
  switchBranch,
  deleteBranch,
  mergeBranch,
  compareBranches,
} from '../main/branches';

function setupProject(dir: string) {
  fs.writeFileSync(path.join(dir, 'noah.md'), `---\ncharacter: Noah\n---\n\n## Act 1 (1)\n1. Noah intro <!-- sid:s1 -->\n`, 'utf-8');
  fs.writeFileSync(path.join(dir, 'grace.md'), `---\ncharacter: Grace\n---\n\n## Act 1 (1)\n1. Grace intro <!-- sid:s2 -->\n`, 'utf-8');
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({
    positions: { s1: 1, s2: 2 },
    connections: {},
    chapters: [],
  }, null, 2), 'utf-8');
}

describe('branches', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-branch-test-'));
    setupProject(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('listBranches returns empty index when no branches exist', () => {
    const result = listBranches(tmp);
    expect(result.branches).toEqual([]);
    expect(result.activeBranch).toBeNull();
  });

  it('createBranch copies md files and positions', () => {
    createBranch(tmp, 'test-arc', 'Testing an arc');
    const branchDir = path.join(tmp, 'branches', 'test-arc');
    expect(fs.existsSync(path.join(branchDir, 'noah.md'))).toBe(true);
    expect(fs.existsSync(path.join(branchDir, 'grace.md'))).toBe(true);
    const positions = JSON.parse(fs.readFileSync(path.join(branchDir, 'positions.json'), 'utf-8'));
    expect(positions).toEqual({ s1: 1, s2: 2 });
    const index = listBranches(tmp);
    expect(index.branches).toHaveLength(1);
    expect(index.branches[0].name).toBe('test-arc');
    expect(index.activeBranch).toBe('test-arc');
  });

  it('switchBranch updates activeBranch', () => {
    createBranch(tmp, 'alt', '');
    switchBranch(tmp, null);
    expect(listBranches(tmp).activeBranch).toBeNull();
    switchBranch(tmp, 'alt');
    expect(listBranches(tmp).activeBranch).toBe('alt');
  });

  it('deleteBranch removes folder and index entry', () => {
    createBranch(tmp, 'doomed');
    switchBranch(tmp, null);
    deleteBranch(tmp, 'doomed');
    expect(fs.existsSync(path.join(tmp, 'branches', 'doomed'))).toBe(false);
    expect(listBranches(tmp).branches).toHaveLength(0);
  });

  it('deleteBranch switches to main if active branch is deleted', () => {
    createBranch(tmp, 'active-one');
    expect(listBranches(tmp).activeBranch).toBe('active-one');
    deleteBranch(tmp, 'active-one');
    expect(listBranches(tmp).activeBranch).toBeNull();
  });

  it('compareBranches detects changes', () => {
    createBranch(tmp, 'changed');
    const branchNoah = path.join(tmp, 'branches', 'changed', 'noah.md');
    fs.writeFileSync(branchNoah, `---\ncharacter: Noah\n---\n\n## Act 1 (1)\n1. Noah REWRITTEN intro <!-- sid:s1 -->\n`, 'utf-8');
    const branchPositions = path.join(tmp, 'branches', 'changed', 'positions.json');
    fs.writeFileSync(branchPositions, JSON.stringify({ s1: 5, s2: 2 }), 'utf-8');
    switchBranch(tmp, null);
    const diff = compareBranches(tmp, null, 'changed');
    const s1Diff = diff.scenes.find(s => s.sceneId === 's1')!;
    expect(s1Diff.changed).toBe(true);
    expect(s1Diff.leftPosition).toBe(1);
    expect(s1Diff.rightPosition).toBe(5);
    const s2Diff = diff.scenes.find(s => s.sceneId === 's2')!;
    expect(s2Diff.changed).toBe(false);
  });

  it('mergeBranch selectively copies scenes to main', () => {
    createBranch(tmp, 'merge-src');
    const branchNoah = path.join(tmp, 'branches', 'merge-src', 'noah.md');
    fs.writeFileSync(branchNoah, `---\ncharacter: Noah\n---\n\n## Act 1 (1)\n1. Noah MERGED intro <!-- sid:s1 -->\n`, 'utf-8');
    const branchPositions = path.join(tmp, 'branches', 'merge-src', 'positions.json');
    fs.writeFileSync(branchPositions, JSON.stringify({ s1: 10, s2: 2 }), 'utf-8');

    mergeBranch(tmp, 'merge-src', ['s1']);

    const mainNoah = fs.readFileSync(path.join(tmp, 'noah.md'), 'utf-8');
    expect(mainNoah).toContain('Noah MERGED intro');
    const timeline = JSON.parse(fs.readFileSync(path.join(tmp, 'timeline.json'), 'utf-8'));
    expect(timeline.positions.s1).toBe(10);
    expect(timeline.positions.s2).toBe(2);
    expect(fs.existsSync(path.join(tmp, 'branches', 'merge-src'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brian/braidr && npx vitest run src/__tests__/branches.test.ts`
Expected: FAIL — module `../main/branches` not found

- [ ] **Step 3: Implement `src/main/branches.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import type { BranchIndex, BranchInfo, BranchCompareData, BranchSceneDiff } from '../shared/types';

function indexPath(projectPath: string): string {
  return path.join(projectPath, 'branches', 'index.json');
}

function readIndex(projectPath: string): BranchIndex {
  const p = indexPath(projectPath);
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  return { branches: [], activeBranch: null };
}

function writeIndex(projectPath: string, index: BranchIndex): void {
  const dir = path.join(projectPath, 'branches');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(indexPath(projectPath), JSON.stringify(index, null, 2), 'utf-8');
}

function getMdFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('CLAUDE'));
}

function readPositions(projectPath: string): Record<string, number> {
  const timelinePath = path.join(projectPath, 'timeline.json');
  if (fs.existsSync(timelinePath)) {
    const data = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
    return data.positions || {};
  }
  return {};
}

function getBranchDir(projectPath: string, branchName: string): string {
  return path.join(projectPath, 'branches', branchName);
}

function getOutlineDir(projectPath: string, branchName: string | null): string {
  if (branchName === null) return projectPath;
  return getBranchDir(projectPath, branchName);
}

function getPositions(projectPath: string, branchName: string | null): Record<string, number> {
  if (branchName === null) return readPositions(projectPath);
  const posPath = path.join(getBranchDir(projectPath, branchName), 'positions.json');
  if (fs.existsSync(posPath)) {
    return JSON.parse(fs.readFileSync(posPath, 'utf-8'));
  }
  return {};
}

interface ParsedScene {
  id: string;
  title: string;
  characterName: string;
  sceneNumber: number;
}

function parseSceneIds(mdContent: string, fileName: string): ParsedScene[] {
  const scenes: ParsedScene[] = [];
  const charMatch = mdContent.match(/^---\n[\s\S]*?character:\s*(.+?)\n[\s\S]*?---/);
  const characterName = charMatch ? charMatch[1].trim() : fileName.replace('.md', '');
  let sceneNumber = 0;
  for (const line of mdContent.split('\n')) {
    const sceneMatch = line.match(/^\d+\.\s+/);
    if (sceneMatch) {
      sceneNumber++;
      const sidMatch = line.match(/<!--\s*sid:(\S+)\s*-->/);
      const id = sidMatch ? sidMatch[1] : '';
      const title = line
        .replace(/^\d+\.\s+/, '')
        .replace(/<!--\s*sid:\S+\s*-->/, '')
        .replace(/==\*\*|\*\*==/g, '')
        .replace(/#\S+/g, '')
        .trim();
      if (id) {
        scenes.push({ id, title, characterName, sceneNumber });
      }
    }
  }
  return scenes;
}

export function listBranches(projectPath: string): BranchIndex {
  return readIndex(projectPath);
}

export function createBranch(projectPath: string, name: string, description?: string): BranchIndex {
  const index = readIndex(projectPath);
  if (index.branches.some(b => b.name === name)) {
    throw new Error(`Branch "${name}" already exists`);
  }

  const branchDir = getBranchDir(projectPath, name);
  fs.mkdirSync(branchDir, { recursive: true });

  const sourceDir = index.activeBranch ? getBranchDir(projectPath, index.activeBranch) : projectPath;
  const createdFrom = index.activeBranch || 'main';

  for (const file of getMdFiles(sourceDir)) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(branchDir, file));
  }

  const positions = getPositions(projectPath, index.activeBranch);
  fs.writeFileSync(path.join(branchDir, 'positions.json'), JSON.stringify(positions, null, 2), 'utf-8');

  index.branches.push({
    name,
    description,
    createdAt: new Date().toISOString(),
    createdFrom,
  });
  index.activeBranch = name;
  writeIndex(projectPath, index);
  return index;
}

export function switchBranch(projectPath: string, name: string | null): BranchIndex {
  const index = readIndex(projectPath);
  if (name !== null && !index.branches.some(b => b.name === name)) {
    throw new Error(`Branch "${name}" does not exist`);
  }
  index.activeBranch = name;
  writeIndex(projectPath, index);
  return index;
}

export function deleteBranch(projectPath: string, name: string): BranchIndex {
  const index = readIndex(projectPath);
  index.branches = index.branches.filter(b => b.name !== name);
  if (index.activeBranch === name) {
    index.activeBranch = null;
  }
  const branchDir = getBranchDir(projectPath, name);
  if (fs.existsSync(branchDir)) {
    fs.rmSync(branchDir, { recursive: true, force: true });
  }
  writeIndex(projectPath, index);
  return index;
}

export function compareBranches(
  projectPath: string,
  leftBranch: string | null,
  rightBranch: string | null,
): BranchCompareData {
  const leftDir = getOutlineDir(projectPath, leftBranch);
  const rightDir = getOutlineDir(projectPath, rightBranch);
  const leftPositions = getPositions(projectPath, leftBranch);
  const rightPositions = getPositions(projectPath, rightBranch);

  const allFiles = new Set([...getMdFiles(leftDir), ...getMdFiles(rightDir)]);
  const scenes: BranchSceneDiff[] = [];

  for (const file of allFiles) {
    const leftContent = fs.existsSync(path.join(leftDir, file))
      ? fs.readFileSync(path.join(leftDir, file), 'utf-8') : '';
    const rightContent = fs.existsSync(path.join(rightDir, file))
      ? fs.readFileSync(path.join(rightDir, file), 'utf-8') : '';

    const leftScenes = parseSceneIds(leftContent, file);
    const rightScenes = parseSceneIds(rightContent, file);
    const allIds = new Set([...leftScenes.map(s => s.id), ...rightScenes.map(s => s.id)]);

    for (const id of allIds) {
      const left = leftScenes.find(s => s.id === id);
      const right = rightScenes.find(s => s.id === id);
      const leftPos = leftPositions[id] ?? null;
      const rightPos = rightPositions[id] ?? null;
      const titleChanged = (left?.title || '') !== (right?.title || '');
      const posChanged = leftPos !== rightPos;

      scenes.push({
        sceneId: id,
        characterId: '',
        characterName: left?.characterName || right?.characterName || '',
        sceneNumber: left?.sceneNumber || right?.sceneNumber || 0,
        leftTitle: left?.title || '(not in this branch)',
        rightTitle: right?.title || '(not in this branch)',
        leftPosition: leftPos,
        rightPosition: rightPos,
        changed: titleChanged || posChanged,
      });
    }
  }

  return {
    leftName: leftBranch || 'main',
    rightName: rightBranch || 'main',
    scenes,
  };
}

export function mergeBranch(
  projectPath: string,
  branchName: string,
  sceneIds: string[],
): void {
  if (sceneIds.length === 0) return;

  const branchDir = getBranchDir(projectPath, branchName);
  const branchPositions = getPositions(projectPath, branchName);
  const sceneIdSet = new Set(sceneIds);

  const timelinePath = path.join(projectPath, 'timeline.json');
  const timeline = fs.existsSync(timelinePath)
    ? JSON.parse(fs.readFileSync(timelinePath, 'utf-8'))
    : { positions: {}, connections: {}, chapters: [] };

  for (const id of sceneIds) {
    if (branchPositions[id] !== undefined) {
      timeline.positions[id] = branchPositions[id];
    }
  }

  const tmpPath = timelinePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(timeline, null, 2), 'utf-8');
  fs.renameSync(tmpPath, timelinePath);

  for (const file of getMdFiles(branchDir)) {
    const branchContent = fs.readFileSync(path.join(branchDir, file), 'utf-8');
    const branchScenes = parseSceneIds(branchContent, file);
    const hasSelectedScene = branchScenes.some(s => sceneIdSet.has(s.id));
    if (!hasSelectedScene) continue;

    const mainPath = path.join(projectPath, file);
    const mainContent = fs.existsSync(mainPath) ? fs.readFileSync(mainPath, 'utf-8') : '';
    const mainLines = mainContent.split('\n');

    for (const scene of branchScenes) {
      if (!sceneIdSet.has(scene.id)) continue;

      const branchLine = branchContent.split('\n').find(l => l.includes(`sid:${scene.id}`));
      if (!branchLine) continue;

      const mainLineIdx = mainLines.findIndex(l => l.includes(`sid:${scene.id}`));
      if (mainLineIdx !== -1) {
        mainLines[mainLineIdx] = branchLine;
      }
    }

    fs.writeFileSync(mainPath, mainLines.join('\n'), 'utf-8');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/brian/braidr && npx vitest run src/__tests__/branches.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Register IPC handlers in `src/main/main.ts`**

Add import at the top of `main.ts` with the other imports:

```typescript
import { listBranches, createBranch, switchBranch, deleteBranch, mergeBranch, compareBranches } from './branches';
```

Add handlers after the existing per-scene content handlers (after the `READ_ALL_PER_SCENE_CONTENT` handler):

```typescript
// ── Branch handlers ─────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRANCHES_LIST, async (_event, projectPath: string) => {
  try {
    return { success: true, data: listBranches(projectPath) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRANCHES_CREATE, async (_event, projectPath: string, name: string, description?: string) => {
  try {
    return { success: true, data: createBranch(projectPath, name, description) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRANCHES_SWITCH, async (_event, projectPath: string, name: string | null) => {
  try {
    return { success: true, data: switchBranch(projectPath, name) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRANCHES_DELETE, async (_event, projectPath: string, name: string) => {
  try {
    return { success: true, data: deleteBranch(projectPath, name) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRANCHES_MERGE, async (_event, projectPath: string, branchName: string, sceneIds: string[]) => {
  try {
    mergeBranch(projectPath, branchName, sceneIds);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRANCHES_COMPARE, async (_event, projectPath: string, leftBranch: string | null, rightBranch: string | null) => {
  try {
    return { success: true, data: compareBranches(projectPath, leftBranch, rightBranch) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

- [ ] **Step 6: Run full test suite**

Run: `cd /Users/brian/braidr && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/branches.ts src/main/main.ts src/__tests__/branches.test.ts
git commit -m "feat(branches): add main process branch operations with tests"
```

---

### Task 3: Data Service Branch Methods

**Files:**
- Modify: `src/renderer/services/dataService.ts:7-40` (DataService interface)
- Modify: `src/renderer/services/dataService.ts:43+` (ElectronDataService class)

- [ ] **Step 1: Add branch methods to the `DataService` interface**

Add after the `listProjectFiles` method at the end of the interface:

```typescript
  // Branches
  listBranches(projectPath: string): Promise<BranchIndex>;
  createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex>;
  switchBranch(projectPath: string, name: string | null): Promise<BranchIndex>;
  deleteBranch(projectPath: string, name: string): Promise<BranchIndex>;
  mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void>;
  compareBranches(projectPath: string, leftBranch: string | null, rightBranch: string | null): Promise<BranchCompareData>;
```

- [ ] **Step 2: Add `BranchIndex` and `BranchCompareData` to imports**

Update the import from `../../shared/types` at line 1 to include `BranchIndex` and `BranchCompareData`.

- [ ] **Step 3: Implement branch methods in `ElectronDataService`**

Add before the closing brace of the class:

```typescript
  async listBranches(projectPath: string): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesList(projectPath);
    if (!result.success) throw new Error(result.error || 'Failed to list branches');
    return result.data;
  }

  async createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesCreate(projectPath, name, description);
    if (!result.success) throw new Error(result.error || 'Failed to create branch');
    return result.data;
  }

  async switchBranch(projectPath: string, name: string | null): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesSwitch(projectPath, name);
    if (!result.success) throw new Error(result.error || 'Failed to switch branch');
    return result.data;
  }

  async deleteBranch(projectPath: string, name: string): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesDelete(projectPath, name);
    if (!result.success) throw new Error(result.error || 'Failed to delete branch');
    return result.data;
  }

  async mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void> {
    const result = await window.electronAPI.branchesMerge(projectPath, branchName, sceneIds);
    if (!result.success) throw new Error(result.error || 'Failed to merge branch');
  }

  async compareBranches(projectPath: string, leftBranch: string | null, rightBranch: string | null): Promise<BranchCompareData> {
    const result = await window.electronAPI.branchesCompare(projectPath, leftBranch, rightBranch);
    if (!result.success) throw new Error(result.error || 'Failed to compare branches');
    return result.data;
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/dataService.ts
git commit -m "feat(branches): add branch methods to data service"
```

---

### Task 4: Branch-Aware Project Loading

**Files:**
- Modify: `src/renderer/services/dataService.ts` (`loadProject` method)
- Modify: `src/renderer/services/dataService.ts` (`saveCharacterOutline` method)

When a branch is active, `loadProject` should read `.md` files from the branch folder and positions from the branch's `positions.json`. Saves should write back to the branch folder too.

- [ ] **Step 1: Add `activeBranch` tracking to `ElectronDataService`**

Add a property alongside `projectPath` and `outlineFiles`:

```typescript
  private activeBranch: string | null = null;
```

- [ ] **Step 2: Load branch state during `loadProject`**

At the start of `loadProject`, after setting `this.projectPath`, add:

```typescript
    const branchIndex = await this.listBranches(folderPath);
    this.activeBranch = branchIndex.activeBranch;
```

- [ ] **Step 3: Override outline reading when on a branch**

In `loadProject`, after `const result = await window.electronAPI.readProject(folderPath);`, if a branch is active, replace the outlines with branch versions. Add:

```typescript
    if (this.activeBranch) {
      const branchResult = await window.electronAPI.readProject(
        folderPath + '/branches/' + this.activeBranch
      );
      if (branchResult.success && branchResult.outlines) {
        result.outlines = branchResult.outlines;
      }
    }
```

Note: `readProject` reads `.md` files from any folder, so passing the branch subfolder works.

- [ ] **Step 4: Override positions when on a branch**

After loading `timelineData` from `loadTimeline`, if branch is active, override positions. Add after line `let timelineData: TimelineData = ...`:

```typescript
    if (this.activeBranch) {
      const branchPosResult = await window.electronAPI.readProject(
        folderPath + '/branches/' + this.activeBranch
      );
      // Read branch positions via a dedicated channel or inline read
      // Use the existing loadTimeline approach — read positions.json directly
      try {
        const posResult = await window.electronAPI.branchesCompare(folderPath, this.activeBranch, this.activeBranch);
        // Actually simpler: just load the positions file through the branch data
      } catch {}
    }
```

Wait — that's getting complicated. A cleaner approach: add a new IPC method to read branch positions, OR read them during loadProject. Let me revise.

Better approach: modify `loadProject` to accept an optional branch parameter. The main process `READ_PROJECT` already reads all `.md` from a folder path. For positions, add a small IPC call.

Let me simplify. Instead of modifying loadProject heavily, add a dedicated IPC for reading branch positions:

Add to preload.ts electronAPI:
```typescript
  branchesReadPositions: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('branches:read-positions', projectPath, branchName),
```

Add handler in main.ts:
```typescript
ipcMain.handle('branches:read-positions', async (_event, projectPath: string, branchName: string) => {
  try {
    const posPath = path.join(projectPath, 'branches', branchName, 'positions.json');
    if (fs.existsSync(posPath)) {
      return { success: true, data: JSON.parse(fs.readFileSync(posPath, 'utf-8')) };
    }
    return { success: true, data: {} };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

Then in loadProject:
```typescript
    if (this.activeBranch) {
      const branchPosResult = await window.electronAPI.branchesReadPositions(folderPath, this.activeBranch);
      if (branchPosResult.success) {
        timelineData = { ...timelineData, positions: branchPosResult.data };
      }
    }
```

- [ ] **Step 5: Override outline file paths for branch saves**

In `saveCharacterOutline`, when a branch is active, the file should be saved to the branch folder. Modify the method:

After `const content = serializeOutline(outline);` and before the `saveFile` call, compute the save path:

```typescript
    let savePath = character.filePath;
    if (this.activeBranch && this.projectPath) {
      const fileName = path.basename(character.filePath);
      savePath = this.projectPath + '/branches/' + this.activeBranch + '/' + fileName;
    }
    const result = await window.electronAPI.saveFile(savePath, content);
```

Note: the renderer doesn't have Node's `path` module. Use string manipulation instead:

```typescript
    let savePath = character.filePath;
    if (this.activeBranch && this.projectPath) {
      const fileName = character.filePath.split('/').pop() || character.filePath.split('\\').pop() || '';
      savePath = this.projectPath + '/branches/' + this.activeBranch + '/' + fileName;
    }
```

- [ ] **Step 6: Save branch positions when on a branch**

When `saveTimeline` is called and a branch is active, positions should go to the branch's `positions.json` instead of `timeline.json`. Modify `saveTimeline`:

Add a new IPC for saving branch positions. In preload.ts:
```typescript
  branchesSavePositions: (projectPath: string, branchName: string, positions: Record<string, number>) =>
    ipcRenderer.invoke('branches:save-positions', projectPath, branchName, positions),
```

Handler in main.ts:
```typescript
ipcMain.handle('branches:save-positions', async (_event, projectPath: string, branchName: string, positions: Record<string, number>) => {
  try {
    const posPath = path.join(projectPath, 'branches', branchName, 'positions.json');
    fs.writeFileSync(posPath, JSON.stringify(positions, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

In `saveTimeline` in ElectronDataService, at the start:
```typescript
    if (this.activeBranch) {
      await window.electronAPI.branchesSavePositions(this.projectPath!, this.activeBranch, positions);
      // Still save non-position data to timeline.json (tasks, metadata, etc.)
      const { positions: _ignored, ...rest } = { positions, connections, chapters, characterColors, wordCounts, fontSettings, archivedScenes, metadataFieldDefs, sceneMetadata, wordCountGoal, allFontSettings, tasks, taskFieldDefs, taskViews, inlineMetadataFields, showInlineLabels, taskColumnWidths, taskVisibleColumns, timelineDates, worldEvents, timelineEndDates, tags };
      const result = await window.electronAPI.saveTimeline(this.projectPath!, { ...rest, positions: {} } as any);
      if (!result.success) throw new Error(result.error || 'Failed to save timeline');
      return;
    }
```

Actually, this is too complex. Simpler: when on a branch, save positions to branch, but pass through the same positions to timeline.json too (they'll get overwritten on switch anyway, and the main-process `saveTimelineToDisk` preserves keys). Even simpler: just save positions to the branch file as an additional side-effect, and let the normal save go through unchanged. The branch positions file is the source of truth when on that branch; `timeline.json` positions are main's source of truth.

Revised approach:
```typescript
    if (this.activeBranch) {
      await window.electronAPI.branchesSavePositions(this.projectPath!, this.activeBranch, positions);
    }
    // Normal save continues — timeline.json positions reflect the last state
    // (they represent main when on main, or get overridden on branch load)
```

- [ ] **Step 7: Update `switchBranch` in data service to track active branch**

```typescript
  async switchBranch(projectPath: string, name: string | null): Promise<BranchIndex> {
    const result = await window.electronAPI.branchesSwitch(projectPath, name);
    if (!result.success) throw new Error(result.error || 'Failed to switch branch');
    this.activeBranch = name;
    return result.data;
  }
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/services/dataService.ts src/main/preload.ts src/main/main.ts
git commit -m "feat(branches): branch-aware project loading and saving"
```

---

### Task 5: Branch Selector Component

**Files:**
- Create: `src/renderer/components/branches/BranchSelector.tsx`
- Modify: `src/renderer/App.tsx` (toolbar area)

- [ ] **Step 1: Create `BranchSelector.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react';
import type { BranchIndex } from '../../../shared/types';

interface BranchSelectorProps {
  branchIndex: BranchIndex;
  onCreateBranch: (name: string, description?: string) => void;
  onSwitchBranch: (name: string | null) => void;
  onDeleteBranch: (name: string) => void;
  onCompare: () => void;
  onMerge: (branchName: string) => void;
}

export function BranchSelector({
  branchIndex,
  onCreateBranch,
  onSwitchBranch,
  onDeleteBranch,
  onCompare,
  onMerge,
}: BranchSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setShowCreateForm(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeName = branchIndex.activeBranch || 'main';

  function handleCreate() {
    const trimmed = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!trimmed) return;
    onCreateBranch(trimmed, newDescription.trim() || undefined);
    setNewName('');
    setNewDescription('');
    setShowCreateForm(false);
    setDropdownOpen(false);
  }

  return (
    <div className="branch-selector" ref={dropdownRef}>
      <button
        className="branch-selector-toggle"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        title={`Current branch: ${activeName}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <span className="branch-selector-name">{activeName}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {dropdownOpen && (
        <div className="branch-selector-dropdown">
          {showCreateForm ? (
            <div className="branch-create-form">
              <input
                type="text"
                placeholder="Branch name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <div className="branch-create-actions">
                <button onClick={handleCreate} disabled={!newName.trim()}>Create</button>
                <button onClick={() => setShowCreateForm(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <button
                className={`branch-item ${branchIndex.activeBranch === null ? 'active' : ''}`}
                onClick={() => { onSwitchBranch(null); setDropdownOpen(false); }}
              >
                main
              </button>
              {branchIndex.branches.map(b => (
                <div key={b.name} className="branch-item-row">
                  <button
                    className={`branch-item ${branchIndex.activeBranch === b.name ? 'active' : ''}`}
                    onClick={() => { onSwitchBranch(b.name); setDropdownOpen(false); }}
                  >
                    {b.name}
                    {b.description && <span className="branch-desc">{b.description}</span>}
                  </button>
                  {branchIndex.activeBranch !== b.name && (
                    <button
                      className="branch-delete-btn"
                      onClick={(e) => { e.stopPropagation(); onDeleteBranch(b.name); }}
                      title={`Delete ${b.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <div className="branch-dropdown-divider" />
              <button className="branch-action" onClick={() => setShowCreateForm(true)}>
                + New Branch
              </button>
              {branchIndex.branches.length > 0 && (
                <>
                  <button className="branch-action" onClick={() => { onCompare(); setDropdownOpen(false); }}>
                    Compare
                  </button>
                  {branchIndex.activeBranch && (
                    <button className="branch-action" onClick={() => { onMerge(branchIndex.activeBranch!); setDropdownOpen(false); }}>
                      Merge to Main
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add branch state and handlers to `App.tsx`**

Add state near the other state declarations:

```typescript
const [branchIndex, setBranchIndex] = useState<BranchIndex>({ branches: [], activeBranch: null });
const [showCompareView, setShowCompareView] = useState(false);
const [showMergeDialog, setShowMergeDialog] = useState<string | null>(null);
```

Add the import for `BranchIndex` from `../../shared/types` and `BranchSelector` from the component.

Add handlers:

```typescript
async function handleCreateBranch(name: string, description?: string) {
  if (!projectData?.projectPath) return;
  const updated = await dataService.createBranch(projectData.projectPath, name, description);
  setBranchIndex(updated);
  await reloadProject();
}

async function handleSwitchBranch(name: string | null) {
  if (!projectData?.projectPath) return;
  const updated = await dataService.switchBranch(projectData.projectPath, name);
  setBranchIndex(updated);
  await reloadProject();
}

async function handleDeleteBranch(name: string) {
  if (!projectData?.projectPath) return;
  const updated = await dataService.deleteBranch(projectData.projectPath, name);
  setBranchIndex(updated);
  if (branchIndex.activeBranch === name) {
    await reloadProject();
  }
}
```

Load branch index during project load — add to the existing `loadProject` flow (where `projectData` is set):

```typescript
const brIndex = await dataService.listBranches(folderPath);
setBranchIndex(brIndex);
```

- [ ] **Step 3: Add `BranchSelector` to the toolbar**

In the toolbar-left div, after the character selector / project name conditional, add:

```tsx
{projectData && (
  <>
    <div className="toolbar-divider" />
    <BranchSelector
      branchIndex={branchIndex}
      onCreateBranch={handleCreateBranch}
      onSwitchBranch={handleSwitchBranch}
      onDeleteBranch={handleDeleteBranch}
      onCompare={() => setShowCompareView(true)}
      onMerge={(name) => setShowMergeDialog(name)}
    />
  </>
)}
```

- [ ] **Step 4: Add CSS for the branch selector**

Find the main CSS file (look for `.toolbar-btn` or `.character-selector` styles) and add branch selector styles. Add to the end of the relevant CSS file:

```css
/* Branch Selector */
.branch-selector {
  position: relative;
}

.branch-selector-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
}

.branch-selector-toggle:hover {
  background: var(--hover-bg, rgba(255,255,255,0.05));
}

.branch-selector-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-selector-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 200px;
  background: var(--dropdown-bg, #1e1e1e);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  padding: 4px;
  z-index: 1000;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.branch-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}

.branch-item:hover {
  background: var(--hover-bg, rgba(255,255,255,0.08));
}

.branch-item.active {
  background: var(--active-bg, rgba(255,255,255,0.12));
  font-weight: 600;
}

.branch-item-row {
  display: flex;
  align-items: center;
}

.branch-item-row .branch-item {
  flex: 1;
}

.branch-delete-btn {
  padding: 2px 6px;
  border: none;
  background: transparent;
  color: var(--text-muted, #888);
  cursor: pointer;
  border-radius: 4px;
  font-size: 16px;
}

.branch-delete-btn:hover {
  color: #ff4444;
  background: rgba(255,68,68,0.1);
}

.branch-desc {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 1px;
}

.branch-dropdown-divider {
  height: 1px;
  background: var(--border-color, #333);
  margin: 4px 0;
}

.branch-action {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--text-muted, #aaa);
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}

.branch-action:hover {
  background: var(--hover-bg, rgba(255,255,255,0.08));
  color: inherit;
}

.branch-create-form {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.branch-create-form input {
  padding: 6px 8px;
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  background: var(--input-bg, #2a2a2a);
  color: inherit;
  font-size: 13px;
}

.branch-create-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.branch-create-actions button {
  padding: 4px 12px;
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.branch-create-actions button:first-child {
  background: var(--accent-color, #4a9eff);
  border-color: var(--accent-color, #4a9eff);
}

.branch-create-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/branches/BranchSelector.tsx src/renderer/App.tsx src/renderer/*.css
git commit -m "feat(branches): add branch selector toolbar component"
```

---

### Task 6: Merge Dialog Component

**Files:**
- Create: `src/renderer/components/branches/MergeDialog.tsx`
- Modify: `src/renderer/App.tsx` (render merge dialog)

- [ ] **Step 1: Create `MergeDialog.tsx`**

```tsx
import { useState, useEffect } from 'react';
import type { BranchCompareData } from '../../../shared/types';

interface MergeDialogProps {
  branchName: string;
  compareData: BranchCompareData | null;
  loading: boolean;
  onMerge: (sceneIds: string[]) => void;
  onClose: () => void;
}

export function MergeDialog({ branchName, compareData, loading, onMerge, onClose }: MergeDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (compareData) {
      setSelected(new Set(compareData.scenes.filter(s => s.changed).map(s => s.sceneId)));
    }
  }, [compareData]);

  function toggleScene(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!compareData) return;
    const changedIds = compareData.scenes.filter(s => s.changed).map(s => s.sceneId);
    if (changedIds.every(id => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(changedIds));
    }
  }

  const grouped = compareData
    ? Object.entries(
        compareData.scenes.reduce<Record<string, typeof compareData.scenes>>((acc, s) => {
          (acc[s.characterName] ||= []).push(s);
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="merge-dialog-overlay" onClick={onClose}>
      <div className="merge-dialog" onClick={e => e.stopPropagation()}>
        <div className="merge-dialog-header">
          <h2>Merge "{branchName}" → main</h2>
          <button className="merge-dialog-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="merge-dialog-loading">Loading changes...</div>
        ) : !compareData ? (
          <div className="merge-dialog-loading">No data</div>
        ) : (
          <>
            <div className="merge-dialog-controls">
              <button onClick={toggleAll}>
                {compareData.scenes.filter(s => s.changed).every(s => selected.has(s.sceneId))
                  ? 'Deselect Changed'
                  : 'Select All Changed'}
              </button>
              <span className="merge-dialog-count">
                {selected.size} scene{selected.size !== 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="merge-dialog-scenes">
              {grouped.map(([charName, scenes]) => (
                <div key={charName} className="merge-dialog-character">
                  <h3>{charName}</h3>
                  {scenes.map(scene => (
                    <label
                      key={scene.sceneId}
                      className={`merge-scene-row ${scene.changed ? 'changed' : 'unchanged'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(scene.sceneId)}
                        onChange={() => toggleScene(scene.sceneId)}
                        disabled={!scene.changed}
                      />
                      <span className="merge-scene-number">#{scene.sceneNumber}</span>
                      <span className="merge-scene-title">
                        {scene.changed ? (
                          <>
                            <span className="merge-scene-old">{scene.leftTitle}</span>
                            <span className="merge-scene-arrow">→</span>
                            <span className="merge-scene-new">{scene.rightTitle}</span>
                          </>
                        ) : (
                          scene.leftTitle
                        )}
                      </span>
                      {scene.changed && scene.leftPosition !== scene.rightPosition && (
                        <span className="merge-scene-pos">
                          pos {scene.leftPosition ?? '—'} → {scene.rightPosition ?? '—'}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="merge-dialog-footer">
              <button onClick={onClose}>Cancel</button>
              <button
                className="merge-dialog-confirm"
                disabled={selected.size === 0}
                onClick={() => onMerge(Array.from(selected))}
              >
                Merge {selected.size} Scene{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire up merge dialog in `App.tsx`**

Add state for compare data:

```typescript
const [mergeCompareData, setMergeCompareData] = useState<BranchCompareData | null>(null);
const [mergeLoading, setMergeLoading] = useState(false);
```

When `showMergeDialog` is set (from BranchSelector's onMerge), load compare data:

```typescript
useEffect(() => {
  if (showMergeDialog && projectData?.projectPath) {
    setMergeLoading(true);
    dataService.compareBranches(projectData.projectPath, null, showMergeDialog)
      .then(data => { setMergeCompareData(data); setMergeLoading(false); })
      .catch(() => setMergeLoading(false));
  } else {
    setMergeCompareData(null);
  }
}, [showMergeDialog]);
```

Add the merge handler:

```typescript
async function handleMerge(sceneIds: string[]) {
  if (!showMergeDialog || !projectData?.projectPath) return;
  await dataService.mergeBranch(projectData.projectPath, showMergeDialog, sceneIds);
  setShowMergeDialog(null);
  await handleSwitchBranch(null);
}
```

Render the dialog at the end of the component, before the closing fragment:

```tsx
{showMergeDialog && (
  <MergeDialog
    branchName={showMergeDialog}
    compareData={mergeCompareData}
    loading={mergeLoading}
    onMerge={handleMerge}
    onClose={() => setShowMergeDialog(null)}
  />
)}
```

- [ ] **Step 3: Add CSS for merge dialog**

```css
/* Merge Dialog */
.merge-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.merge-dialog {
  background: var(--dropdown-bg, #1e1e1e);
  border: 1px solid var(--border-color, #333);
  border-radius: 12px;
  width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
}

.merge-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #333);
}

.merge-dialog-header h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.merge-dialog-close {
  border: none;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
}

.merge-dialog-loading {
  padding: 40px;
  text-align: center;
  color: var(--text-muted, #888);
}

.merge-dialog-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color, #333);
}

.merge-dialog-controls button {
  padding: 4px 10px;
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.merge-dialog-count {
  font-size: 12px;
  color: var(--text-muted, #888);
}

.merge-dialog-scenes {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
}

.merge-dialog-character h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
  color: var(--text-muted, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.merge-dialog-character:first-child h3 {
  margin-top: 0;
}

.merge-scene-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.merge-scene-row:hover {
  background: var(--hover-bg, rgba(255,255,255,0.05));
}

.merge-scene-row.unchanged {
  opacity: 0.5;
}

.merge-scene-number {
  color: var(--text-muted, #888);
  min-width: 28px;
}

.merge-scene-title {
  flex: 1;
  overflow: hidden;
}

.merge-scene-old {
  text-decoration: line-through;
  color: var(--text-muted, #888);
}

.merge-scene-arrow {
  margin: 0 6px;
  color: var(--text-muted, #666);
}

.merge-scene-new {
  color: #4ade80;
}

.merge-scene-pos {
  font-size: 11px;
  color: var(--text-muted, #888);
  white-space: nowrap;
}

.merge-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #333);
}

.merge-dialog-footer button {
  padding: 6px 16px;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
}

.merge-dialog-confirm {
  background: var(--accent-color, #4a9eff) !important;
  border-color: var(--accent-color, #4a9eff) !important;
  font-weight: 600;
}

.merge-dialog-confirm:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/branches/MergeDialog.tsx src/renderer/App.tsx src/renderer/*.css
git commit -m "feat(branches): add merge dialog with selective scene merging"
```

---

### Task 7: Compare View Component

**Files:**
- Create: `src/renderer/components/branches/CompareView.tsx`
- Modify: `src/renderer/App.tsx` (render compare view)

- [ ] **Step 1: Create `CompareView.tsx`**

```tsx
import { useState, useEffect } from 'react';
import type { BranchIndex, BranchCompareData } from '../../../shared/types';
import { dataService } from '../../services/dataService';

interface CompareViewProps {
  projectPath: string;
  branchIndex: BranchIndex;
  onClose: () => void;
  onMerge: (branchName: string) => void;
}

export function CompareView({ projectPath, branchIndex, onClose, onMerge }: CompareViewProps) {
  const [leftBranch, setLeftBranch] = useState<string | null>(null);
  const [rightBranch, setRightBranch] = useState<string | null>(branchIndex.branches[0]?.name ?? null);
  const [compareData, setCompareData] = useState<BranchCompareData | null>(null);
  const [loading, setLoading] = useState(false);

  const branchOptions: { value: string | null; label: string }[] = [
    { value: null, label: 'main' },
    ...branchIndex.branches.map(b => ({ value: b.name, label: b.name })),
  ];

  useEffect(() => {
    if (leftBranch === rightBranch) {
      setCompareData(null);
      return;
    }
    setLoading(true);
    dataService.compareBranches(projectPath, leftBranch, rightBranch)
      .then(data => { setCompareData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectPath, leftBranch, rightBranch]);

  const grouped = compareData
    ? Object.entries(
        compareData.scenes.reduce<Record<string, typeof compareData.scenes>>((acc, s) => {
          (acc[s.characterName] ||= []).push(s);
          return acc;
        }, {})
      )
    : [];

  const changedCount = compareData?.scenes.filter(s => s.changed).length ?? 0;

  return (
    <div className="compare-view-overlay" onClick={onClose}>
      <div className="compare-view" onClick={e => e.stopPropagation()}>
        <div className="compare-view-header">
          <h2>Compare Branches</h2>
          <button className="compare-view-close" onClick={onClose}>×</button>
        </div>

        <div className="compare-view-selectors">
          <div className="compare-branch-pick">
            <label>Left</label>
            <select
              value={leftBranch ?? '__main__'}
              onChange={e => setLeftBranch(e.target.value === '__main__' ? null : e.target.value)}
            >
              {branchOptions.map(o => (
                <option key={o.label} value={o.value ?? '__main__'}>{o.label}</option>
              ))}
            </select>
          </div>
          <span className="compare-vs">vs</span>
          <div className="compare-branch-pick">
            <label>Right</label>
            <select
              value={rightBranch ?? '__main__'}
              onChange={e => setRightBranch(e.target.value === '__main__' ? null : e.target.value)}
            >
              {branchOptions.map(o => (
                <option key={o.label} value={o.value ?? '__main__'}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {leftBranch === rightBranch ? (
          <div className="compare-view-empty">Select two different branches to compare</div>
        ) : loading ? (
          <div className="compare-view-empty">Loading...</div>
        ) : !compareData ? (
          <div className="compare-view-empty">No data</div>
        ) : (
          <>
            <div className="compare-view-summary">
              {changedCount} of {compareData.scenes.length} scenes differ
            </div>

            <div className="compare-view-scenes">
              <div className="compare-view-table">
                <div className="compare-table-header">
                  <span className="compare-col-char">Character</span>
                  <span className="compare-col-num">#</span>
                  <span className="compare-col-left">{compareData.leftName}</span>
                  <span className="compare-col-right">{compareData.rightName}</span>
                  <span className="compare-col-pos">Position</span>
                </div>
                {grouped.map(([charName, scenes]) =>
                  scenes.map(scene => (
                    <div
                      key={scene.sceneId}
                      className={`compare-table-row ${scene.changed ? 'changed' : ''}`}
                    >
                      <span className="compare-col-char">{charName}</span>
                      <span className="compare-col-num">{scene.sceneNumber}</span>
                      <span className="compare-col-left">{scene.leftTitle}</span>
                      <span className="compare-col-right">{scene.rightTitle}</span>
                      <span className="compare-col-pos">
                        {scene.leftPosition ?? '—'} / {scene.rightPosition ?? '—'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {rightBranch && (
              <div className="compare-view-footer">
                <button onClick={() => onMerge(rightBranch)}>
                  Merge "{rightBranch}" → main
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire up compare view in `App.tsx`**

Render before the closing fragment, alongside merge dialog:

```tsx
{showCompareView && projectData?.projectPath && (
  <CompareView
    projectPath={projectData.projectPath}
    branchIndex={branchIndex}
    onClose={() => setShowCompareView(false)}
    onMerge={(name) => { setShowCompareView(false); setShowMergeDialog(name); }}
  />
)}
```

- [ ] **Step 3: Add CSS for compare view**

```css
/* Compare View */
.compare-view-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.compare-view {
  background: var(--dropdown-bg, #1e1e1e);
  border: 1px solid var(--border-color, #333);
  border-radius: 12px;
  width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
}

.compare-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #333);
}

.compare-view-header h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.compare-view-close {
  border: none;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 20px;
  cursor: pointer;
}

.compare-view-selectors {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #333);
}

.compare-branch-pick {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.compare-branch-pick label {
  font-size: 11px;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.compare-branch-pick select {
  padding: 6px 8px;
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  background: var(--input-bg, #2a2a2a);
  color: inherit;
  font-size: 13px;
}

.compare-vs {
  color: var(--text-muted, #666);
  font-size: 13px;
  padding-top: 16px;
}

.compare-view-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted, #888);
}

.compare-view-summary {
  padding: 12px 20px;
  font-size: 13px;
  color: var(--text-muted, #aaa);
  border-bottom: 1px solid var(--border-color, #333);
}

.compare-view-scenes {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.compare-view-table {
  font-size: 13px;
}

.compare-table-header {
  display: flex;
  padding: 8px 20px;
  font-weight: 600;
  color: var(--text-muted, #888);
  border-bottom: 1px solid var(--border-color, #333);
  position: sticky;
  top: 0;
  background: var(--dropdown-bg, #1e1e1e);
}

.compare-table-row {
  display: flex;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-color, #222);
}

.compare-table-row.changed {
  background: rgba(74, 222, 128, 0.05);
}

.compare-col-char { width: 100px; flex-shrink: 0; }
.compare-col-num { width: 40px; flex-shrink: 0; color: var(--text-muted, #888); }
.compare-col-left { flex: 1; padding-right: 12px; }
.compare-col-right { flex: 1; padding-right: 12px; }
.compare-col-pos { width: 80px; flex-shrink: 0; color: var(--text-muted, #888); text-align: right; }

.compare-view-footer {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #333);
}

.compare-view-footer button {
  padding: 6px 16px;
  border: 1px solid var(--accent-color, #4a9eff);
  border-radius: 6px;
  background: var(--accent-color, #4a9eff);
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/branches/CompareView.tsx src/renderer/App.tsx src/renderer/*.css
git commit -m "feat(branches): add compare view for side-by-side branch comparison"
```

---

### Task 8: Integration Test and Final Verification

**Files:**
- All files from tasks 1-7

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/brian/braidr && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript type checking**

Run: `cd /Users/brian/braidr && npx tsc --noEmit`
Expected: No new errors (pre-existing errors may appear — ignore those)

- [ ] **Step 3: Start the dev server and test manually**

Run: `cd /Users/brian/braidr && npm run dev`

Test the following in the browser:
1. Open a project — branch selector shows "main" in the toolbar
2. Click the branch selector dropdown — shows "main" active, "New Branch" option
3. Create a new branch — provides name, branch is created, selector shows new name
4. Edit a scene outline on the branch — verify changes save
5. Switch back to main — verify original outlines are unchanged
6. Click Compare — shows side-by-side diff of changes
7. Click Merge — shows selective merge dialog with checkboxes
8. Select scenes and merge — verify changes appear in main
9. Delete the branch — verify it's removed

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(branches): address integration test findings"
```
