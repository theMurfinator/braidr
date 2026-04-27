# iPad Branch Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6 stub branch methods in CapacitorDataService with real implementations so branches work on iPad.

**Architecture:** Port the logic from `src/main/branches.ts` (Node.js `fs`) to async Capacitor Filesystem calls. Add scene parsing helpers as module-level functions. Make `loadProject`, `saveCharacterOutline`, and `saveTimeline` branch-aware (reading/writing from branch folders when active), matching the ElectronDataService pattern.

**Tech Stack:** TypeScript, Capacitor Filesystem API, existing `readTextFile`/`writeTextFile`/`listDir` helpers

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/renderer/services/capacitorDataService.ts` | Replace 6 branch stubs with real implementations; add branch-aware loading/saving; add scene parsing helpers |

All changes are in one file. The existing module-level helpers (`readTextFile`, `writeTextFile`, `listDir`, `fsOptions`) handle all file I/O.

---

### Task 1: Add Scene Parsing Helpers

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

Add module-level helper functions for parsing scenes from `.md` files. These are needed by `compareBranches` and `mergeBranch`.

- [ ] **Step 1: Add the helper functions after the existing `generateId()` function (around line 81)**

Add these module-level functions between `generateId()` and `getCapacitorDeviceInfo()`:

```typescript
/** Parse character name from frontmatter `character: Name`. */
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

/** List .md outline files in a directory (same filter as loadProject). */
async function listMdFiles(dir: string): Promise<string[]> {
  const entries = await listDir(dir);
  return entries
    .filter(e => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('CLAUDE') && !e.name.startsWith('README'))
    .map(e => e.name);
}

/** Parse all scenes (with sid comments) from .md files in a directory. */
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

/** Read branch index from branches/index.json. */
async function readBranchIndex(projectPath: string): Promise<BranchIndex> {
  const content = await readTextFile(`${projectPath}/branches/index.json`);
  if (!content) return { branches: [], activeBranch: null };
  try { return JSON.parse(content); } catch { return { branches: [], activeBranch: null }; }
}

/** Write branch index to branches/index.json. */
async function writeBranchIndex(projectPath: string, index: BranchIndex): Promise<void> {
  await writeTextFile(`${projectPath}/branches/index.json`, JSON.stringify(index, null, 2));
}

/** Read positions from main (timeline.json) or a branch (branches/{name}/positions.json). */
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

/** Get the directory containing .md files for a branch (or main). */
function branchMdDir(projectPath: string, branchName: string | null): string {
  if (branchName === null) return projectPath;
  return `${projectPath}/branches/${branchName}`;
}

/** Escape a string for safe use in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 2: Add the `BranchInfo` import**

At the top of the file, find the import from `../../shared/types` and add `BranchInfo` to it. It currently imports `BranchIndex` and `BranchCompareData` — add `BranchInfo` alongside them:

```typescript
import {
  // ... existing imports ...
  BranchIndex,
  BranchInfo,
  BranchCompareData,
} from '../../shared/types';
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count as before (helpers are unused for now — TS may not error on unused module-level functions).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): add scene parsing and branch index helpers"
```

---

### Task 2: Add `activeBranch` Field and Branch-Aware Loading

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

The `CapacitorDataService` class needs an `activeBranch` field (like `ElectronDataService` has), and `loadProject` must read from the branch folder when a branch is active.

- [ ] **Step 1: Add `activeBranch` field to the class**

Find the class definition (around line 108):

```typescript
export class CapacitorDataService implements DataService {
  private projectPath: string | null = null;
  private outlineFiles: Map<string, OutlineFile> = new Map();
```

Add `activeBranch` after `projectPath`:

```typescript
export class CapacitorDataService implements DataService {
  private projectPath: string | null = null;
  private activeBranch: string | null = null;
  private outlineFiles: Map<string, OutlineFile> = new Map();
```

- [ ] **Step 2: Make `loadProject` branch-aware**

Find the start of `loadProject` (around line 171). Currently it does:

```typescript
    this.projectPath = folderPath;

    // 1. List .md files in project folder (exclude CLAUDE* and README*)
    const entries = await listDir(folderPath);
```

Replace the section from `this.projectPath = folderPath;` through the parsing loop (up to `// 3. Read timeline.json`) with:

```typescript
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
```

- [ ] **Step 3: Override positions when on a branch**

Find `// 3. Read timeline.json` (now follows the code you just changed). After the timelineData is parsed, add branch position override:

```typescript
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
```

The existing code after this (reading per-scene content, etc.) stays unchanged.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count as before.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): add activeBranch field and branch-aware loading"
```

---

### Task 3: Branch-Aware Saving

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

Make `saveCharacterOutline` write to the branch folder and `saveTimeline` save positions to the branch's `positions.json` when a branch is active.

- [ ] **Step 1: Update `saveCharacterOutline`**

Find `saveCharacterOutline` (around line 334). Currently it ends with:

```typescript
    const content = serializeOutline(outline);
    await writeTextFile(character.filePath, content);
```

Replace those two lines with:

```typescript
    const content = serializeOutline(outline);
    let savePath = character.filePath;
    if (this.activeBranch && this.projectPath) {
      const fileName = character.filePath.split('/').pop() || '';
      savePath = `${this.projectPath}/branches/${this.activeBranch}/${fileName}`;
    }
    await writeTextFile(savePath, content);
```

- [ ] **Step 2: Update `saveTimeline`**

Find `saveTimeline` (around line 400). Right after the guard `if (!this.projectPath)`, add branch position saving:

```typescript
    if (!this.projectPath) {
      throw new Error('No project loaded');
    }

    // Save positions to branch positions.json when a branch is active
    if (this.activeBranch) {
      await writeTextFile(
        `${this.projectPath}/branches/${this.activeBranch}/positions.json`,
        JSON.stringify(positions, null, 2),
      );
    }
```

The rest of `saveTimeline` (building the data object, merging, writing timeline.json) stays unchanged — it always writes the full timeline to main, which preserves tasks, settings, etc.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count as before.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): branch-aware saveCharacterOutline and saveTimeline"
```

---

### Task 4: Implement listBranches, createBranch, switchBranch

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

Replace the first 3 stub methods.

- [ ] **Step 1: Replace `listBranches`**

Find the stub (around line 693):

```typescript
  async listBranches(_projectPath: string): Promise<BranchIndex> {
    return { branches: [], activeBranch: null };
  }
```

Replace with:

```typescript
  async listBranches(projectPath: string): Promise<BranchIndex> {
    return readBranchIndex(projectPath);
  }
```

- [ ] **Step 2: Replace `createBranch`**

Find the stub:

```typescript
  async createBranch(_projectPath: string, _name: string, _description?: string): Promise<BranchIndex> {
    throw new Error('Branches not supported on this platform');
  }
```

Replace with:

```typescript
  async createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
    const index = await readBranchIndex(projectPath);

    const sourceLabel = index.activeBranch ?? 'main';
    const sourceDir = branchMdDir(projectPath, index.activeBranch);
    const sourcePositions = await readBranchPositions(projectPath, index.activeBranch);

    // Copy .md files to branch directory
    const mdFiles = await listMdFiles(sourceDir);
    const destDir = `${projectPath}/branches/${name}`;
    for (const fileName of mdFiles) {
      const content = await readTextFile(`${sourceDir}/${fileName}`);
      if (content !== null) {
        await writeTextFile(`${destDir}/${fileName}`, content);
      }
    }

    // Write positions
    await writeTextFile(`${destDir}/positions.json`, JSON.stringify(sourcePositions, null, 2));

    // Update index
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
```

- [ ] **Step 3: Replace `switchBranch`**

Find the stub:

```typescript
  async switchBranch(_projectPath: string, _name: string | null): Promise<BranchIndex> {
    throw new Error('Branches not supported on this platform');
  }
```

Replace with:

```typescript
  async switchBranch(projectPath: string, name: string | null): Promise<BranchIndex> {
    const index = await readBranchIndex(projectPath);
    index.activeBranch = name;
    this.activeBranch = name;
    await writeBranchIndex(projectPath, index);
    return index;
  }
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count as before.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): implement listBranches, createBranch, switchBranch"
```

---

### Task 5: Implement deleteBranch

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

- [ ] **Step 1: Replace `deleteBranch`**

Find the stub:

```typescript
  async deleteBranch(_projectPath: string, _name: string): Promise<BranchIndex> {
    throw new Error('Branches not supported on this platform');
  }
```

Replace with:

```typescript
  async deleteBranch(projectPath: string, name: string): Promise<BranchIndex> {
    const index = await readBranchIndex(projectPath);

    // Delete all files in the branch directory, then the directory itself
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

    // Update index
    index.branches = index.branches.filter(b => b.name !== name);
    if (index.activeBranch === name) {
      index.activeBranch = null;
      this.activeBranch = null;
    }
    await writeBranchIndex(projectPath, index);

    return index;
  }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count. Note: `Filesystem.rmdir` is a valid Capacitor Filesystem method. If TS complains it doesn't exist on the type, check the Capacitor version. If it does error, use this fallback instead:

```typescript
    try {
      await Filesystem.rmdir({ ...fsOptions(branchDir), recursive: true });
    } catch { /* directory may already be gone */ }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): implement deleteBranch"
```

---

### Task 6: Implement compareBranches

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

- [ ] **Step 1: Replace `compareBranches`**

Find the stub:

```typescript
  async compareBranches(_projectPath: string, _leftBranch: string | null, _rightBranch: string | null): Promise<BranchCompareData> {
    throw new Error('Branches not supported on this platform');
  }
```

Replace with:

```typescript
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
      const left = leftMap.get(sceneId);
      const right = rightMap.get(sceneId);

      const leftTitle = left?.title ?? '';
      const rightTitle = right?.title ?? '';
      const leftPos = leftPositions[sceneId] ?? null;
      const rightPos = rightPositions[sceneId] ?? null;

      const changed = leftTitle !== rightTitle || leftPos !== rightPos;

      diffs.push({
        sceneId,
        characterId: (left ?? right)!.characterId,
        characterName: (left ?? right)!.characterName,
        sceneNumber: (left ?? right)!.sceneNumber,
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
```

- [ ] **Step 2: Add `BranchSceneDiff` to imports**

At the top of the file, add `BranchSceneDiff` to the import from `../../shared/types`:

```typescript
import {
  // ... existing imports ...
  BranchIndex,
  BranchInfo,
  BranchCompareData,
  BranchSceneDiff,
} from '../../shared/types';
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count as before.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): implement compareBranches"
```

---

### Task 7: Implement mergeBranch

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

- [ ] **Step 1: Replace `mergeBranch`**

Find the stub:

```typescript
  async mergeBranch(_projectPath: string, _branchName: string, _sceneIds: string[]): Promise<void> {
    throw new Error('Branches not supported on this platform');
  }
```

Replace with:

```typescript
  async mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void> {
    if (sceneIds.length === 0) return;

    const branchDir = branchMdDir(projectPath, branchName);
    const branchPositions = await readBranchPositions(projectPath, branchName);
    const branchScenes = await parseScenesFromDir(branchDir);

    const branchMap = new Map(branchScenes.map(s => [s.sceneId, s]));

    // Group scene IDs by their .md file
    const fileUpdates = new Map<string, { sceneId: string; fullLine: string }[]>();
    for (const sid of sceneIds) {
      const branchScene = branchMap.get(sid);
      if (!branchScene) continue;
      const existing = fileUpdates.get(branchScene.fileName) ?? [];
      existing.push({ sceneId: sid, fullLine: branchScene.fullLine });
      fileUpdates.set(branchScene.fileName, existing);
    }

    // Update .md files in main
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

    // Update positions in timeline.json
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
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count as before.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All existing tests pass (the branch tests in `src/__tests__/branches.test.ts` test the Node.js implementation, not the Capacitor one — they should still pass).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): implement mergeBranch"
```

---

### Task 8: Update Comment and Final Verification

**Files:**
- Modify: `src/renderer/services/capacitorDataService.ts`

- [ ] **Step 1: Update the section comment**

Find the old comment:

```typescript
  // ── Branches (not supported on iPad) ────────────────────────────────────
```

Replace with:

```typescript
  // ── Branches ────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: Same error count as before.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Verify Vite build**

Run: `npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit and push**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat(ipad-branches): complete branch operations for iPad"
git push origin main
```
