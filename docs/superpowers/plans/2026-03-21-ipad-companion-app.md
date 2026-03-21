# Braidr iPad Companion App — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract per-scene content from timeline.json into individual files, then build a Capacitor-based iPad companion app that shares the same codebase and project folder.

**Architecture:** Two-phase approach. Phase 1 (desktop-only) migrates storage format — extracting `draftContent`, `scratchpad`, `drafts`, and `sceneComments` from the monolithic `timeline.json` into per-scene files (`drafts/`, `scratchpad/`, `comments/` directories). Phase 2 adds a Capacitor iOS shell with a mobile navigation layer and touch-adapted components. Both phases share the same `DataService` interface; only the implementation differs per platform.

**Tech Stack:** Electron (existing), Capacitor (new), React 19, TipTap, Vite, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-21-ipad-companion-app-design.md`

---

## File Structure

### Phase 1 — Modified files (storage migration)

| File | Responsibility | Changes |
|------|---------------|---------|
| `src/shared/types.ts` | IPC channel constants, TimelineData type | Add 8 new IPC channels, remove extracted fields from TimelineData |
| `src/main/preload.ts` | IPC bridge (renderer ↔ main) | Add bridge methods for new channels |
| `src/main/main.ts` | IPC handlers, filesystem ops | Add per-scene read/write handlers, add migration function |
| `src/renderer/services/dataService.ts` | DataService interface + ElectronDataService | Add 8 new interface methods, implement in ElectronDataService |
| `src/renderer/App.tsx` | Root component, state management, auto-save | Change save flow: per-scene content saves individually, not via saveTimeline |

### Phase 2 — New files (iPad app)

| File | Responsibility |
|------|---------------|
| `capacitor.config.ts` | Capacitor project configuration |
| `src/renderer/services/capacitorDataService.ts` | DataService implementation using Capacitor Filesystem |
| `src/renderer/MobileApp.tsx` | Top-level iPad shell (sidebar + content layout) |
| `src/renderer/components/MobileSidebar.tsx` | View switcher + contextual navigation |

### Phase 2 — Modified files (iPad app)

| File | Changes |
|------|---------|
| `src/renderer/services/dataService.ts` | Platform-conditional singleton (Capacitor vs Electron) |
| `src/renderer/main.tsx` | Conditional root: MobileApp vs App |
| `src/renderer/components/RailsView.tsx` | Replace HTML5 DnD with pointer-event drag |
| `package.json` | Add Capacitor dependencies |
| `vite.config.ts` | Capacitor build support |

---

## Chunk 1: Phase 1 — Storage Format Migration

### Task 1: Add IPC channels for per-scene file I/O

**Files:**
- Modify: `src/shared/types.ts:326-371` (IPC_CHANNELS constant)

- [ ] **Step 1: Add new channel constants to IPC_CHANNELS**

In `src/shared/types.ts`, add these entries to the `IPC_CHANNELS` object (before the `as const`):

```typescript
// Per-scene content (extracted from timeline.json)
READ_DRAFT: 'read-draft',
SAVE_DRAFT: 'save-draft',
READ_SCRATCHPAD: 'read-scratchpad',
SAVE_SCRATCHPAD: 'save-scratchpad',
READ_DRAFT_VERSIONS: 'read-draft-versions',
SAVE_DRAFT_VERSIONS: 'save-draft-versions',
READ_SCENE_COMMENTS: 'read-scene-comments',
SAVE_SCENE_COMMENTS: 'save-scene-comments',
// Bulk read for project loading
READ_ALL_PER_SCENE_CONTENT: 'read-all-per-scene-content',
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: No new errors (pre-existing errors may appear — ignore those)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add IPC channels for per-scene file I/O"
```

---

### Task 2: Add preload bridge methods for per-scene I/O

**Files:**
- Modify: `src/main/preload.ts` — add bridge methods matching new IPC channels

**Context:** The preload script duplicates IPC_CHANNELS (doesn't import from shared). It exposes `window.electronAPI` with methods that call `ipcRenderer.invoke()`. Find the existing pattern and replicate it for the 8 new channels.

- [ ] **Step 1: Read preload.ts to find the pattern**

Read `src/main/preload.ts` and identify how existing methods like `loadTimeline` and `saveTimeline` are exposed.

- [ ] **Step 2: Add bridge methods for per-scene reads/writes**

Add to the `electronAPI` object in the `contextBridge.exposeInMainWorld` call:

```typescript
// Per-scene content
readDraft: (folderPath: string, sceneId: string) =>
  ipcRenderer.invoke('read-draft', folderPath, sceneId),
saveDraft: (folderPath: string, sceneId: string, content: string) =>
  ipcRenderer.invoke('save-draft', folderPath, sceneId, content),
readScratchpad: (folderPath: string, sceneId: string) =>
  ipcRenderer.invoke('read-scratchpad', folderPath, sceneId),
saveScratchpad: (folderPath: string, sceneId: string, content: string) =>
  ipcRenderer.invoke('save-scratchpad', folderPath, sceneId, content),
readDraftVersions: (folderPath: string, sceneId: string) =>
  ipcRenderer.invoke('read-draft-versions', folderPath, sceneId),
saveDraftVersions: (folderPath: string, sceneId: string, versions: string) =>
  ipcRenderer.invoke('save-draft-versions', folderPath, sceneId, versions),
readSceneComments: (folderPath: string, sceneId: string) =>
  ipcRenderer.invoke('read-scene-comments', folderPath, sceneId),
saveSceneComments: (folderPath: string, sceneId: string, comments: string) =>
  ipcRenderer.invoke('save-scene-comments', folderPath, sceneId, comments),
```

Note: `versions` and `comments` are passed as JSON strings (serialized on the renderer side, parsed on the main side) to keep the IPC boundary simple.

- [ ] **Step 3: Build electron to verify**

Run: `cd /Users/brian/braidr && npm run build:electron 2>&1 | tail -5`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat: add preload bridge for per-scene file I/O"
```

---

### Task 3: Add IPC handlers in main.ts for per-scene reads/writes

**Files:**
- Modify: `src/main/main.ts` — add 8 new `ipcMain.handle()` registrations

**Context:** Existing handlers follow the pattern at lines 616-673 of main.ts. Each handler returns `{ success: boolean, data?: T, error?: string }`. File paths are constructed from `folderPath` + subdirectory + `sceneId`.

- [ ] **Step 1: Read main.ts to understand the handler pattern**

Read `src/main/main.ts` around lines 616-673 (LOAD_TIMELINE and SAVE_TIMELINE handlers) for the exact pattern.

- [ ] **Step 2: Add read/write handlers for drafts**

Add after the existing SAVE_TIMELINE handler:

```typescript
// ── Per-scene content handlers ──────────────────────────────────────────

ipcMain.handle('read-draft', async (_event, folderPath: string, sceneId: string) => {
  try {
    const filePath = path.join(folderPath, 'drafts', `${sceneId}.md`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: content };
    }
    return { success: true, data: '' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-draft', async (_event, folderPath: string, sceneId: string, content: string) => {
  try {
    const dir = path.join(folderPath, 'drafts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${sceneId}.md`);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **Step 3: Add read/write handlers for scratchpad**

Same pattern, but folder is `scratchpad/` and extension is `.md`:

```typescript
ipcMain.handle('read-scratchpad', async (_event, folderPath: string, sceneId: string) => {
  try {
    const filePath = path.join(folderPath, 'scratchpad', `${sceneId}.md`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: content };
    }
    return { success: true, data: '' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-scratchpad', async (_event, folderPath: string, sceneId: string, content: string) => {
  try {
    const dir = path.join(folderPath, 'scratchpad');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${sceneId}.md`);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **Step 4: Add read/write handlers for draft versions**

Folder is `drafts/`, extension is `.versions.json`. Content is a JSON string passed from renderer:

```typescript
ipcMain.handle('read-draft-versions', async (_event, folderPath: string, sceneId: string) => {
  try {
    const filePath = path.join(folderPath, 'drafts', `${sceneId}.versions.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: true, data: [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-draft-versions', async (_event, folderPath: string, sceneId: string, versionsJson: string) => {
  try {
    const dir = path.join(folderPath, 'drafts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${sceneId}.versions.json`);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, versionsJson, 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **Step 5: Add read/write handlers for scene comments**

Folder is `comments/`, extension is `.json`:

```typescript
ipcMain.handle('read-scene-comments', async (_event, folderPath: string, sceneId: string) => {
  try {
    const filePath = path.join(folderPath, 'comments', `${sceneId}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: true, data: [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-scene-comments', async (_event, folderPath: string, sceneId: string, commentsJson: string) => {
  try {
    const dir = path.join(folderPath, 'comments');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${sceneId}.json`);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, commentsJson, 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **Step 6: Build electron to verify**

Run: `cd /Users/brian/braidr && npm run build:electron 2>&1 | tail -5`
Expected: Compiles without errors

- [ ] **Step 7: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: add IPC handlers for per-scene file read/write"
```

---

### Task 4: Extend DataService interface + ElectronDataService

**Files:**
- Modify: `src/renderer/services/dataService.ts:6-28` (interface), `src/renderer/services/dataService.ts:31-316` (implementation)

- [ ] **Step 1: Add new methods to the DataService interface**

In `src/renderer/services/dataService.ts`, add before the closing `}` of the `DataService` interface (currently around line 28):

```typescript
// Per-scene content (extracted from timeline.json)
readDraft(projectPath: string, sceneId: string): Promise<string>;
saveDraft(projectPath: string, sceneId: string, content: string): Promise<void>;
readScratchpad(projectPath: string, sceneId: string): Promise<string>;
saveScratchpad(projectPath: string, sceneId: string, content: string): Promise<void>;
readDraftVersions(projectPath: string, sceneId: string): Promise<DraftVersion[]>;
saveDraftVersions(projectPath: string, sceneId: string, versions: DraftVersion[]): Promise<void>;
readSceneComments(projectPath: string, sceneId: string): Promise<SceneComment[]>;
saveSceneComments(projectPath: string, sceneId: string, comments: SceneComment[]): Promise<void>;
```

Note: `DraftVersion` and `SceneComment` are already imported at line 1 of this file.

- [ ] **Step 2: Implement new methods in ElectronDataService**

Add before the closing `}` of the `ElectronDataService` class (around line 316):

```typescript
// Per-scene content
async readDraft(projectPath: string, sceneId: string): Promise<string> {
  const result = await window.electronAPI.readDraft(projectPath, sceneId);
  if (!result.success) throw new Error(result.error || 'Failed to read draft');
  return result.data;
}

async saveDraft(projectPath: string, sceneId: string, content: string): Promise<void> {
  const result = await window.electronAPI.saveDraft(projectPath, sceneId, content);
  if (!result.success) throw new Error(result.error || 'Failed to save draft');
}

async readScratchpad(projectPath: string, sceneId: string): Promise<string> {
  const result = await window.electronAPI.readScratchpad(projectPath, sceneId);
  if (!result.success) throw new Error(result.error || 'Failed to read scratchpad');
  return result.data;
}

async saveScratchpad(projectPath: string, sceneId: string, content: string): Promise<void> {
  const result = await window.electronAPI.saveScratchpad(projectPath, sceneId, content);
  if (!result.success) throw new Error(result.error || 'Failed to save scratchpad');
}

async readDraftVersions(projectPath: string, sceneId: string): Promise<DraftVersion[]> {
  const result = await window.electronAPI.readDraftVersions(projectPath, sceneId);
  if (!result.success) throw new Error(result.error || 'Failed to read draft versions');
  return result.data;
}

async saveDraftVersions(projectPath: string, sceneId: string, versions: DraftVersion[]): Promise<void> {
  const result = await window.electronAPI.saveDraftVersions(
    projectPath, sceneId, JSON.stringify(versions, null, 2)
  );
  if (!result.success) throw new Error(result.error || 'Failed to save draft versions');
}

async readSceneComments(projectPath: string, sceneId: string): Promise<SceneComment[]> {
  const result = await window.electronAPI.readSceneComments(projectPath, sceneId);
  if (!result.success) throw new Error(result.error || 'Failed to read scene comments');
  return result.data;
}

async saveSceneComments(projectPath: string, sceneId: string, comments: SceneComment[]): Promise<void> {
  const result = await window.electronAPI.saveSceneComments(
    projectPath, sceneId, JSON.stringify(comments, null, 2)
  );
  if (!result.success) throw new Error(result.error || 'Failed to save scene comments');
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/dataService.ts
git commit -m "feat: extend DataService with per-scene read/write methods"
```

---

### Task 5: Write migration function in main.ts

**Files:**
- Modify: `src/main/main.ts` — add `migrateTimelineToPerSceneFiles()` function, call from LOAD_TIMELINE handler

**Context:** Migration runs on project load when `timeline.json` still contains extracted fields. It must back up before writing, and be idempotent (safe to re-run if partially failed).

- [ ] **Step 1: Add the migration function**

Add this function in `src/main/main.ts` above the IPC handlers section:

```typescript
/**
 * One-time migration: extract per-scene content from timeline.json into individual files.
 * Safe to re-run — only acts if extracted fields still exist in timeline.json.
 */
function migrateTimelineToPerSceneFiles(folderPath: string, data: any): any {
  const hasExtractedFields =
    data.draftContent || data.scratchpad || data.drafts || data.sceneComments;
  if (!hasExtractedFields) return data;

  // Step 1: Backup original timeline.json before any writes
  const backupDir = path.join(folderPath, '.braidr', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timelinePath = path.join(folderPath, 'timeline.json');
  fs.copyFileSync(timelinePath, path.join(backupDir, `timeline-pre-migration-${timestamp}.json`));

  // Step 2: Create directories
  const draftsDir = path.join(folderPath, 'drafts');
  const scratchpadDir = path.join(folderPath, 'scratchpad');
  const commentsDir = path.join(folderPath, 'comments');
  if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
  if (!fs.existsSync(scratchpadDir)) fs.mkdirSync(scratchpadDir, { recursive: true });
  if (!fs.existsSync(commentsDir)) fs.mkdirSync(commentsDir, { recursive: true });

  // Step 3: Write individual files
  if (data.draftContent) {
    for (const [sceneId, content] of Object.entries(data.draftContent)) {
      if (content) fs.writeFileSync(path.join(draftsDir, `${sceneId}.md`), content as string, 'utf-8');
    }
  }
  if (data.scratchpad) {
    for (const [sceneId, content] of Object.entries(data.scratchpad)) {
      if (content) fs.writeFileSync(path.join(scratchpadDir, `${sceneId}.md`), content as string, 'utf-8');
    }
  }
  if (data.drafts) {
    for (const [sceneId, versions] of Object.entries(data.drafts)) {
      if (versions && (versions as any[]).length > 0) {
        fs.writeFileSync(path.join(draftsDir, `${sceneId}.versions.json`), JSON.stringify(versions, null, 2), 'utf-8');
      }
    }
  }
  if (data.sceneComments) {
    for (const [sceneId, comments] of Object.entries(data.sceneComments)) {
      if (comments && (comments as any[]).length > 0) {
        fs.writeFileSync(path.join(commentsDir, `${sceneId}.json`), JSON.stringify(comments, null, 2), 'utf-8');
      }
    }
  }

  // Step 4: Remove extracted fields from data
  const cleaned = { ...data };
  delete cleaned.draftContent;
  delete cleaned.scratchpad;
  delete cleaned.drafts;
  delete cleaned.sceneComments;

  // Step 5: Save cleaned timeline.json
  const tmpPath = timelinePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(cleaned, null, 2), 'utf-8');
  fs.renameSync(tmpPath, timelinePath);

  return cleaned;
}
```

- [ ] **Step 2: Call migration from LOAD_TIMELINE handler**

In the LOAD_TIMELINE handler (around line 618-627 of main.ts), the current code inlines the JSON parse in the return. Restructure it to allow migration:

Change from:
```typescript
return { success: true, data: JSON.parse(content) };
```

To:
```typescript
let data = JSON.parse(content);
data = migrateTimelineToPerSceneFiles(folderPath, data);
return { success: true, data };
```

- [ ] **Step 3: Build electron to verify**

Run: `cd /Users/brian/braidr && npm run build:electron 2>&1 | tail -5`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: add timeline.json → per-scene files migration"
```

---

### Task 6: Update loadProject to read from per-scene files

**Files:**
- Modify: `src/main/main.ts` — add function to read per-scene files and assemble them into the expected shape
- Modify: `src/renderer/services/dataService.ts:43-141` — update `loadProject` in ElectronDataService

**Context:** After migration, `timeline.json` no longer contains `draftContent`, `scratchpad`, `drafts`, or `sceneComments`. These must be read from individual files. The return shape of `loadProject` stays the same — calling code doesn't change.

- [ ] **Step 1: Add a helper IPC handler to read all per-scene content**

Add to `src/main/main.ts` a new handler that reads all files from `drafts/`, `scratchpad/`, and `comments/` directories and returns them as Records:

```typescript
ipcMain.handle('read-all-per-scene-content', async (_event, folderPath: string) => {
  try {
    const draftContent: Record<string, string> = {};
    const scratchpad: Record<string, string> = {};
    const drafts: Record<string, any[]> = {};
    const sceneComments: Record<string, any[]> = {};

    const draftsDir = path.join(folderPath, 'drafts');
    const scratchpadDir = path.join(folderPath, 'scratchpad');
    const commentsDir = path.join(folderPath, 'comments');

    // Read draft content
    if (fs.existsSync(draftsDir)) {
      for (const file of fs.readdirSync(draftsDir)) {
        if (file.endsWith('.md')) {
          const sceneId = file.replace('.md', '');
          draftContent[sceneId] = fs.readFileSync(path.join(draftsDir, file), 'utf-8');
        } else if (file.endsWith('.versions.json')) {
          const sceneId = file.replace('.versions.json', '');
          const content = fs.readFileSync(path.join(draftsDir, file), 'utf-8');
          drafts[sceneId] = JSON.parse(content);
        }
      }
    }

    // Read scratchpad
    if (fs.existsSync(scratchpadDir)) {
      for (const file of fs.readdirSync(scratchpadDir)) {
        if (file.endsWith('.md')) {
          const sceneId = file.replace('.md', '');
          scratchpad[sceneId] = fs.readFileSync(path.join(scratchpadDir, file), 'utf-8');
        }
      }
    }

    // Read comments
    if (fs.existsSync(commentsDir)) {
      for (const file of fs.readdirSync(commentsDir)) {
        if (file.endsWith('.json')) {
          const sceneId = file.replace('.json', '');
          const content = fs.readFileSync(path.join(commentsDir, file), 'utf-8');
          sceneComments[sceneId] = JSON.parse(content);
        }
      }
    }

    return { success: true, data: { draftContent, scratchpad, drafts, sceneComments } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **Step 2: Add preload bridge for the bulk read**

In `src/main/preload.ts`, add to the `electronAPI` object:

```typescript
readAllPerSceneContent: (folderPath: string) =>
  ipcRenderer.invoke('read-all-per-scene-content', folderPath),
```

Note: the channel name `read-all-per-scene-content` was added to `IPC_CHANNELS` in Task 1 as `READ_ALL_PER_SCENE_CONTENT`. The preload file duplicates channel strings (doesn't import from shared), so use the string literal here to match the existing pattern.

- [ ] **Step 3: Update loadProject in ElectronDataService**

In `src/renderer/services/dataService.ts`, in the `loadProject` method (around lines 43-141), after loading timeline data (line 53), add a call to read per-scene content and merge it in:

```typescript
// Load per-scene content from individual files
const perSceneResult = await window.electronAPI.readAllPerSceneContent(folderPath);
const perSceneContent = perSceneResult.success && perSceneResult.data
  ? perSceneResult.data
  : { draftContent: {}, scratchpad: {}, drafts: {}, sceneComments: {} };
```

Then update the return object (around line 110-141) to use the per-scene data instead of timeline data for these fields:

Change:
```typescript
draftContent: timelineData.draftContent || {},
```
To:
```typescript
draftContent: perSceneContent.draftContent,
```

And similarly for `scratchpad`, `drafts`, and `sceneComments`:
```typescript
scratchpad: perSceneContent.scratchpad,
sceneComments: perSceneContent.sceneComments,
drafts: perSceneContent.drafts,
```

Note: The old `timelineData.draftContent` fallback is no longer needed — migration has already extracted these fields. But for safety during the transition (in case someone hasn't opened the project since migration was added), keep a fallback:

```typescript
draftContent: Object.keys(perSceneContent.draftContent).length > 0
  ? perSceneContent.draftContent
  : (timelineData.draftContent || {}),
```

Apply the same fallback pattern to `scratchpad`, `drafts`, and `sceneComments`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts src/main/preload.ts src/renderer/services/dataService.ts
git commit -m "feat: loadProject reads per-scene content from individual files"
```

---

### Task 7: Update App.tsx save patterns for per-scene content

**Files:**
- Modify: `src/renderer/App.tsx` — change `handleDraftChange`, `handleScratchpadChange`, `handleAddComment`, `handleDeleteComment`, `handleSaveDraft` to save individually; remove these fields from `saveTimelineData`

**Context:** This is the most impactful change. Currently all 4 content types are bundled into `saveTimeline()` (called every 10s). After this change, each content type saves to its own file immediately (with debounce for drafts). `saveTimeline()` only saves structural data.

- [ ] **Step 1: Import dataService in App.tsx if not already imported**

Check if `dataService` is imported in App.tsx. If not, add:

```typescript
import { dataService } from './services/dataService';
```

- [ ] **Step 2: Update handleDraftChange to save directly**

At `src/renderer/App.tsx` around lines 2692-2705, after updating state and ref, add a direct save call. Use a separate debounce for per-scene saves (the 800ms debounce in EditorView already gates how often this fires, so we can save immediately here):

```typescript
const handleDraftChange = async (sceneKey: string, html: string) => {
  isDirtyRef.current = true;
  const updated = { ...draftContentRef.current, [sceneKey]: html };
  setDraftContent(updated);
  draftContentRef.current = updated;

  // Save directly to individual file
  if (projectData?.projectPath) {
    try {
      await dataService.saveDraft(projectData.projectPath, sceneKey, html);
    } catch (err) {
      console.error('Failed to save draft:', err);
    }
  }

  // Keep existing session tracker notification (currently at lines 2698-2702)
  if (sessionTrackerRef.current) {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    sessionTrackerRef.current.recordActivity(sceneKey, wordCount);
  }
};
```

- [ ] **Step 3: Update handleScratchpadChange to save directly**

At `src/renderer/App.tsx` around lines 2710-2715:

```typescript
const handleScratchpadChange = (sceneKey: string, html: string) => {
  isDirtyRef.current = true;
  const updated = { ...scratchpadContentRef.current, [sceneKey]: html };
  setScratchpadContent(updated);
  scratchpadContentRef.current = updated;

  // Save directly to individual file
  if (projectData?.projectPath) {
    dataService.saveScratchpad(projectData.projectPath, sceneKey, html)
      .catch(err => console.error('Failed to save scratchpad:', err));
  }
};
```

- [ ] **Step 4: Update handleAddComment and handleDeleteComment to save directly**

At `src/renderer/App.tsx` around lines 2717-2736, after updating state and ref, add save calls:

For `handleAddComment` — after `sceneCommentsRef.current = updated;`:
```typescript
if (projectData?.projectPath) {
  dataService.saveSceneComments(projectData.projectPath, sceneKey, updated[sceneKey])
    .catch(err => console.error('Failed to save comments:', err));
}
```

For `handleDeleteComment` — after `sceneCommentsRef.current = updated;`:
```typescript
if (projectData?.projectPath) {
  dataService.saveSceneComments(projectData.projectPath, sceneKey, updated[sceneKey])
    .catch(err => console.error('Failed to save comments:', err));
}
```

- [ ] **Step 5: Update handleSaveDraft (version history) to save directly**

At `src/renderer/App.tsx` around lines 2738-2752, after updating `draftsRef.current`:

```typescript
if (projectData?.projectPath) {
  dataService.saveDraftVersions(projectData.projectPath, sceneKey, draftsRef.current[sceneKey])
    .catch(err => console.error('Failed to save draft versions:', err));
}
```

- [ ] **Step 6: Remove extracted fields from saveTimelineData call**

At `src/renderer/App.tsx` around lines 2327-2356, in the `saveTimelineData` function, remove the 4 extracted fields from the `dataService.saveTimeline()` call.

Change the call (around line 2347) to no longer pass:
- `draftContentRef.current` — remove this argument
- `scratchpadContentRef.current` — remove this argument
- `draftsRef.current` — remove this argument
- `sceneCommentsRef.current` — remove this argument

**Important:** The `saveTimeline` method signature has positional parameters. You need to pass `undefined` in place of removed parameters to keep the positions correct for the remaining ones. Check the exact parameter order in `dataService.ts` line 11 and replace the 4 removed values with `undefined`.

Alternatively, update the `saveTimeline` signature in the interface and implementation to remove these 4 parameters entirely (adjusting all callers). This is cleaner but touches more code.

The cleaner approach: remove the 4 parameters from the interface, implementation, preload bridge, and main handler. Update the call site in `saveTimelineData`.

- [ ] **Step 7: Remove extracted fields from saveTimeline interface and implementations**

The 4 fields to remove are at non-contiguous positions in the 26-param signature: `draftContent` (pos 8), `drafts` (pos 11), `scratchpad` (pos 14), `sceneComments` (pos 15). Here is the complete new signature after removal (22 params):

In `src/renderer/services/dataService.ts`, replace the `saveTimeline` signature in the `DataService` interface (line 11) and `ElectronDataService` implementation (line 208) with:

```typescript
saveTimeline(
  positions: Record<string, number>,
  connections: Record<string, string[]>,
  chapters: BraidedChapter[],
  characterColors?: Record<string, string>,
  wordCounts?: Record<string, number>,
  fontSettings?: FontSettings,
  archivedScenes?: ArchivedScene[],
  // draftContent REMOVED — now saved via saveDraft()
  metadataFieldDefs?: MetadataFieldDef[],
  sceneMetadata?: Record<string, Record<string, string | string[]>>,
  // drafts (version history) REMOVED — now saved via saveDraftVersions()
  wordCountGoal?: number,
  allFontSettings?: AllFontSettings,
  // scratchpad REMOVED — now saved via saveScratchpad()
  // sceneComments REMOVED — now saved via saveSceneComments()
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
): Promise<void>;
```

**Update BOTH call sites in App.tsx:**

1. The primary save at `saveTimelineData` (around line 2347) — remove the 4 extracted arguments and re-align remaining arguments to match the new parameter positions.

2. **The migration save at `loadProjectFromPath` (around line 1075)** — this is a second call site that also passes these fields. Remove the 4 extracted arguments here too, ensuring the remaining arguments shift to the correct positions.

In `src/main/preload.ts`:
- The `saveTimeline` bridge is a generic pass-through (`ipcRenderer.invoke(channel, folderPath, data)`) — it passes whatever object `ElectronDataService` constructs. **No changes needed** to preload.ts. The keys will stop appearing in the data object automatically when `ElectronDataService.saveTimeline` stops including them.

In `src/main/main.ts`:
- The SAVE_TIMELINE handler writes whatever is in the data object. No changes needed.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 9: Test manually**

Run: `cd /Users/brian/braidr && npm run dev`

1. Open an existing project
2. Migration should run automatically (check `.braidr/backups/` for `timeline-pre-migration-*.json`)
3. Check that `drafts/`, `scratchpad/`, `comments/` directories were created with files
4. Edit a scene's prose in the Editor — verify `drafts/{sceneId}.md` updates
5. Switch scenes, come back — verify content persists
6. Close and reopen the project — verify all content loads correctly
7. Check `timeline.json` — it should no longer contain `draftContent`, `scratchpad`, `drafts`, or `sceneComments`

- [ ] **Step 10: Commit**

```bash
git add src/renderer/App.tsx src/renderer/services/dataService.ts src/main/preload.ts
git commit -m "feat: save per-scene content to individual files, remove from saveTimeline"
```

---

## Chunk 2: Phase 2 — iPad Companion App

### Task 8: Capacitor project scaffolding

**Files:**
- Create: `capacitor.config.ts`
- Modify: `package.json` — add Capacitor dependencies and scripts
- Modify: `vite.config.ts` — ensure build output works for Capacitor

**Context:** Capacitor wraps the Vite-built web app in a native iOS WebView. The build output (`dist/`) is what Capacitor copies into the iOS project.

- [ ] **Step 1: Install Capacitor dependencies**

```bash
cd /Users/brian/braidr
npm install @capacitor/core @capacitor/filesystem @capacitor/preferences
npm install -D @capacitor/cli @capacitor/ios
```

- [ ] **Step 2: Create capacitor.config.ts**

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.braidr.app',
  appName: 'Braidr',
  webDir: 'dist',
  server: {
    // Required for loading local files (note images) via capacitor://localhost/_capacitor_file_/...
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
  },
};

export default config;
```

- [ ] **Step 3: Add Capacitor scripts to package.json**

Add to the `scripts` section:

```json
"cap:build": "npm run build:vite && npx cap sync",
"cap:open": "npx cap open ios",
"cap:run": "npx cap run ios"
```

- [ ] **Step 4: Initialize iOS platform**

```bash
cd /Users/brian/braidr
npm run build:vite
npx cap add ios
```

This creates an `ios/` directory with the Xcode project.

- [ ] **Step 5: Verify Xcode project opens**

```bash
npx cap open ios
```

Expected: Xcode opens with the Braidr iOS project. The app should build and show the existing web UI in the simulator (it will crash because `window.electronAPI` is undefined, but that's expected — we'll fix it in the next tasks).

- [ ] **Step 6: Commit**

```bash
git add capacitor.config.ts package.json package-lock.json ios/
git commit -m "feat: add Capacitor iOS project scaffolding"
```

---

### Task 9: CapacitorDataService implementation

**Files:**
- Create: `src/renderer/services/capacitorDataService.ts`

**Context:** Implements the full `DataService` interface using Capacitor's Filesystem plugin. Reads/writes the same project folder format as the desktop app. The folder path comes from the iOS document picker.

**Reference:** `src/renderer/services/dataService.ts` for the interface definition. The Capacitor Filesystem API docs: use `Filesystem.readFile()`, `Filesystem.writeFile()`, `Filesystem.readdir()`, `Filesystem.mkdir()`, `Filesystem.stat()`.

- [ ] **Step 1: Create the CapacitorDataService file**

Create `src/renderer/services/capacitorDataService.ts`:

```typescript
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import type { DataService } from './dataService';
import type {
  Character, Scene, PlotPoint, Tag, OutlineFile, ProjectData,
  TimelineData, BraidedChapter, RecentProject, ProjectTemplate,
  FontSettings, AllFontSettings, ArchivedScene, MetadataFieldDef,
  DraftVersion, NotesIndex, SceneComment, Task, TaskFieldDef,
  TaskViewConfig, WorldEvent,
} from '../../shared/types';
import { parseOutlineFile, serializeOutline, createTagsFromStrings } from './parser';
import { migrateSceneKeys } from './migration';

export class CapacitorDataService implements DataService {
  private projectPath: string | null = null;
  private outlineFiles: Map<string, OutlineFile> = new Map();

  private async readTextFile(filePath: string): Promise<string | null> {
    try {
      const result = await Filesystem.readFile({
        path: filePath,
        encoding: Encoding.UTF8,
      });
      return result.data as string;
    } catch {
      return null;
    }
  }

  private async writeTextFile(filePath: string, content: string): Promise<void> {
    // Ensure parent directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    try {
      await Filesystem.mkdir({ path: dir, recursive: true });
    } catch {
      // Directory may already exist
    }
    await Filesystem.writeFile({
      path: filePath,
      data: content,
      encoding: Encoding.UTF8,
    });
  }

  private async listDir(dirPath: string): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({ path: dirPath });
      return result.files.map(f => f.name);
    } catch {
      return [];
    }
  }

  async selectProjectFolder(): Promise<string | null> {
    // Use Capacitor's Filesystem.pickDirectory() (available in @capacitor/filesystem >= 6.0).
    // This opens the native iOS document picker, which surfaces iCloud Drive, Dropbox,
    // and any other registered Files-app provider.
    try {
      const result = await Filesystem.pickDirectory();
      if (result?.url) {
        this.projectPath = result.url;
        return result.url;
      }
      return null;
    } catch {
      // User cancelled the picker
      return null;
    }
  }

  async loadProject(folderPath: string): Promise<ProjectData & {
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
  }> {
    this.projectPath = folderPath;

    // Read all .md files (character outlines)
    const files = await this.listDir(folderPath);
    const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('CLAUDE'));
    const outlines: { fileName: string; content: string }[] = [];
    for (const fileName of mdFiles) {
      const content = await this.readTextFile(`${folderPath}/${fileName}`);
      if (content) outlines.push({ fileName, content });
    }

    // Load timeline data
    const timelineRaw = await this.readTextFile(`${folderPath}/timeline.json`);
    let timelineData: TimelineData = timelineRaw
      ? JSON.parse(timelineRaw)
      : { positions: {}, connections: {} };

    // Parse outlines
    const characters: Character[] = [];
    const allScenes: Scene[] = [];
    const allPlotPoints: PlotPoint[] = [];

    const savedTags: Tag[] = timelineData.tags || [];
    const savedTagMap = new Map(savedTags.map(t => [t.name, t]));

    for (const { fileName, content } of outlines) {
      const filePath = `${folderPath}/${fileName}`;
      const outline = parseOutlineFile(content, fileName, filePath);
      this.outlineFiles.set(outline.character.id, outline);
      if (!characters.some(c => c.id === outline.character.id)) {
        characters.push(outline.character);
      }
      allScenes.push(...outline.scenes);
      allPlotPoints.push(...outline.plotPoints);
    }

    // Build tags
    const seenNames = new Set<string>();
    let allTags: Tag[] = [];
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

    // Migrate legacy keys
    const migration = migrateSceneKeys(allScenes, timelineData);
    timelineData = migration.timelineData;

    // Apply positions and word counts
    for (const scene of allScenes) {
      const position = timelineData.positions[scene.id];
      scene.timelinePosition = position !== undefined ? position : null;
      if (timelineData.wordCounts?.[scene.id] !== undefined) {
        scene.wordCount = timelineData.wordCounts[scene.id];
      }
    }

    // Read per-scene content from individual files
    const draftContent: Record<string, string> = {};
    const scratchpad: Record<string, string> = {};
    const draftsData: Record<string, DraftVersion[]> = {};
    const sceneComments: Record<string, SceneComment[]> = {};

    const draftFiles = await this.listDir(`${folderPath}/drafts`);
    for (const file of draftFiles) {
      if (file.endsWith('.md')) {
        const sceneId = file.replace('.md', '');
        const content = await this.readTextFile(`${folderPath}/drafts/${file}`);
        if (content) draftContent[sceneId] = content;
      } else if (file.endsWith('.versions.json')) {
        const sceneId = file.replace('.versions.json', '');
        const content = await this.readTextFile(`${folderPath}/drafts/${file}`);
        if (content) draftsData[sceneId] = JSON.parse(content);
      }
    }

    const scratchpadFiles = await this.listDir(`${folderPath}/scratchpad`);
    for (const file of scratchpadFiles) {
      if (file.endsWith('.md')) {
        const sceneId = file.replace('.md', '');
        const content = await this.readTextFile(`${folderPath}/scratchpad/${file}`);
        if (content) scratchpad[sceneId] = content;
      }
    }

    const commentFiles = await this.listDir(`${folderPath}/comments`);
    for (const file of commentFiles) {
      if (file.endsWith('.json')) {
        const sceneId = file.replace('.json', '');
        const content = await this.readTextFile(`${folderPath}/comments/${file}`);
        if (content) sceneComments[sceneId] = JSON.parse(content);
      }
    }

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
      draftContent,
      metadataFieldDefs: timelineData.metadataFieldDefs || [],
      sceneMetadata: timelineData.sceneMetadata || {},
      drafts: draftsData,
      wordCountGoal: timelineData.wordCountGoal || 0,
      scratchpad,
      sceneComments,
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

  async saveCharacterOutline(character: Character, plotPoints: PlotPoint[], scenes: Scene[]): Promise<void> {
    const outline = this.outlineFiles.get(character.id);
    if (!outline) throw new Error('Character outline not found');
    outline.character = character;
    outline.plotPoints = plotPoints.filter(p => p.characterId === character.id);
    outline.scenes = scenes.filter(s => s.characterId === character.id);
    const content = serializeOutline(outline);
    await this.writeTextFile(character.filePath, content);
    outline.rawContent = content;
  }

  async createCharacter(folderPath: string, name: string): Promise<Character> {
    const fileName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.md';
    const filePath = `${folderPath}/${fileName}`;
    const content = `---\ncharacter: ${name}\n---\n\n## Act 1 (1)\n1. First scene description here\n`;
    await this.writeTextFile(filePath, content);
    const character: Character = {
      id: Math.random().toString(36).substring(2, 11),
      name,
      filePath,
    };
    const outline: OutlineFile = {
      character,
      plotPoints: [{
        id: Math.random().toString(36).substring(2, 11),
        characterId: character.id,
        title: 'Act 1',
        expectedSceneCount: null,
        description: '',
        order: 0,
      }],
      scenes: [{
        id: Math.random().toString(36).substring(2, 11),
        characterId: character.id,
        sceneNumber: 1,
        title: 'First scene description here',
        content: 'First scene description here',
        tags: [],
        timelinePosition: null,
        isHighlighted: false,
        notes: [],
        plotPointId: null,
      }],
      rawContent: content,
    };
    this.outlineFiles.set(character.id, outline);
    return character;
  }

  // Matches the post-Phase-1 signature (4 per-scene fields removed)
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
    if (!this.projectPath) throw new Error('No project loaded');
    const data = {
      positions, connections, chapters, characterColors, wordCounts,
      fontSettings, archivedScenes, metadataFieldDefs, sceneMetadata,
      wordCountGoal, allFontSettings, tasks, taskFieldDefs,
      taskViews, inlineMetadataFields, showInlineLabels,
      taskColumnWidths, taskVisibleColumns, timelineDates, worldEvents,
      timelineEndDates, tags,
    };
    await this.writeTextFile(
      `${this.projectPath}/timeline.json`,
      JSON.stringify(data, null, 2),
    );
  }

  async getRecentProjects(): Promise<RecentProject[]> {
    const result = await Preferences.get({ key: 'recentProjects' });
    return result.value ? JSON.parse(result.value) : [];
  }

  async addRecentProject(project: RecentProject): Promise<void> {
    const existing = await this.getRecentProjects();
    const filtered = existing.filter(p => p.path !== project.path);
    const updated = [project, ...filtered].slice(0, 10);
    await Preferences.set({ key: 'recentProjects', value: JSON.stringify(updated) });
  }

  async selectSaveLocation(): Promise<string | null> {
    // Not supported on iPad
    return null;
  }

  async createProject(_parentPath: string, _projectName: string, _template: ProjectTemplate): Promise<string | null> {
    // Not supported on iPad — create projects on desktop
    throw new Error('Project creation is not supported on iPad. Create projects on your Mac and sync.');
  }

  async deleteFile(filePath: string): Promise<void> {
    await Filesystem.deleteFile({ path: filePath });
  }

  // Notes
  async loadNotesIndex(projectPath: string): Promise<NotesIndex> {
    const content = await this.readTextFile(`${projectPath}/notes/notes-index.json`);
    if (!content) return { notes: [], version: 2 };
    return JSON.parse(content);
  }

  async saveNotesIndex(projectPath: string, data: NotesIndex): Promise<void> {
    await this.writeTextFile(
      `${projectPath}/notes/notes-index.json`,
      JSON.stringify(data, null, 2),
    );
  }

  async readNote(projectPath: string, fileName: string): Promise<string> {
    const content = await this.readTextFile(`${projectPath}/notes/${fileName}`);
    if (!content) return '';
    // Rewrite braidr-img:// URLs to Capacitor-compatible file URLs.
    // Stored HTML contains absolute Mac paths like braidr-img:///Users/brian/project/notes/images/img.png
    // We extract the relative portion (after "/notes/") and re-anchor to the iPad's projectPath.
    return content.replace(
      /braidr-img:\/\/([^"')\s]+)/g,
      (_match, rawPath) => {
        const decoded = decodeURIComponent(rawPath);
        const notesIdx = decoded.indexOf('/notes/');
        const relativePath = notesIdx >= 0 ? decoded.substring(notesIdx + 7) : decoded;
        return `capacitor://localhost/_capacitor_file_${projectPath}/notes/${relativePath}`;
      },
    );
  }

  async saveNote(projectPath: string, fileName: string, content: string): Promise<void> {
    // Rewrite Capacitor URLs back to braidr-img:// for portability across devices.
    // Extract the relative portion (after "/notes/") and store with the current projectPath
    // so the Mac's Electron protocol handler can resolve it.
    const portableContent = content.replace(
      /capacitor:\/\/localhost\/_capacitor_file_([^"')\s]+)/g,
      (_match, rawPath) => {
        const notesIdx = rawPath.indexOf('/notes/');
        const relativePath = notesIdx >= 0 ? rawPath.substring(notesIdx + 7) : rawPath;
        // Store with projectPath so Mac can resolve it via braidr-img:// protocol
        return `braidr-img://${projectPath}/notes/${relativePath}`;
      },
    );
    await this.writeTextFile(`${projectPath}/notes/${fileName}`, portableContent);
  }

  async createNote(projectPath: string, fileName: string): Promise<void> {
    await this.writeTextFile(`${projectPath}/notes/${fileName}`, '');
  }

  async deleteNote(projectPath: string, fileName: string): Promise<void> {
    await Filesystem.deleteFile({ path: `${projectPath}/notes/${fileName}` });
  }

  async renameNote(projectPath: string, oldFileName: string, newFileName: string): Promise<void> {
    await Filesystem.rename({
      from: `${projectPath}/notes/${oldFileName}`,
      to: `${projectPath}/notes/${newFileName}`,
    });
  }

  async saveNoteImage(projectPath: string, imageData: string, fileName: string): Promise<string> {
    const ext = fileName.split('.').pop() || 'png';
    const uuid = Math.random().toString(36).substring(2, 11);
    const imgFileName = `img_${uuid}.${ext}`;
    const imgPath = `${projectPath}/notes/images/${imgFileName}`;
    // imageData is base64
    await Filesystem.writeFile({ path: imgPath, data: imageData });
    return `images/${imgFileName}`;
  }

  async selectNoteImage(_projectPath: string): Promise<string | null> {
    // TODO: Integrate iOS photo picker or file picker
    return null;
  }

  // Per-scene content
  async readDraft(projectPath: string, sceneId: string): Promise<string> {
    return (await this.readTextFile(`${projectPath}/drafts/${sceneId}.md`)) || '';
  }

  async saveDraft(projectPath: string, sceneId: string, content: string): Promise<void> {
    await this.writeTextFile(`${projectPath}/drafts/${sceneId}.md`, content);
  }

  async readScratchpad(projectPath: string, sceneId: string): Promise<string> {
    return (await this.readTextFile(`${projectPath}/scratchpad/${sceneId}.md`)) || '';
  }

  async saveScratchpad(projectPath: string, sceneId: string, content: string): Promise<void> {
    await this.writeTextFile(`${projectPath}/scratchpad/${sceneId}.md`, content);
  }

  async readDraftVersions(projectPath: string, sceneId: string): Promise<DraftVersion[]> {
    const content = await this.readTextFile(`${projectPath}/drafts/${sceneId}.versions.json`);
    return content ? JSON.parse(content) : [];
  }

  async saveDraftVersions(projectPath: string, sceneId: string, versions: DraftVersion[]): Promise<void> {
    await this.writeTextFile(
      `${projectPath}/drafts/${sceneId}.versions.json`,
      JSON.stringify(versions, null, 2),
    );
  }

  async readSceneComments(projectPath: string, sceneId: string): Promise<SceneComment[]> {
    const content = await this.readTextFile(`${projectPath}/comments/${sceneId}.json`);
    return content ? JSON.parse(content) : [];
  }

  async saveSceneComments(projectPath: string, sceneId: string, comments: SceneComment[]): Promise<void> {
    await this.writeTextFile(
      `${projectPath}/comments/${sceneId}.json`,
      JSON.stringify(comments, null, 2),
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/services/capacitorDataService.ts
git commit -m "feat: add CapacitorDataService for iPad file I/O"
```

---

### Task 10: Platform-conditional DataService singleton + entry point

**Files:**
- Modify: `src/renderer/services/dataService.ts:319` — conditional singleton
- Modify: `src/renderer/main.tsx` — conditional root component

- [ ] **Step 1: Make dataService singleton platform-aware**

In `src/renderer/services/dataService.ts`, change the final export (line 319) from:

```typescript
export const dataService: DataService = new ElectronDataService();
```

To:

```typescript
import { CapacitorDataService } from './capacitorDataService';

const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
export const dataService: DataService = isCapacitor
  ? new CapacitorDataService()
  : new ElectronDataService();
```

Move the import to the top of the file with the other imports.

- [ ] **Step 2: Update main.tsx for conditional root**

Read `src/renderer/main.tsx` to see the current entry point. **Critical:** The current entry point wraps `<App />` inside `<LicenseGate>`, which calls `window.electronAPI.getLicenseStatus()` without optional chaining. This will crash immediately on iPad.

Add a conditional that skips `LicenseGate` and uses `MobileApp` on Capacitor:

```typescript
import { MobileApp } from './MobileApp';

const isCapacitor = typeof (window as any).Capacitor !== 'undefined';

// On iPad, skip LicenseGate (license managed on desktop) and use MobileApp shell
const root = isCapacitor ? (
  <MobileApp />
) : (
  <LicenseGate>
    <App />
  </LicenseGate>
);
```

Then render `root` instead of the existing JSX.

Note: `MobileApp` doesn't exist yet — create a placeholder in the next task. For now, create a minimal stub so TypeScript compiles:

Create `src/renderer/MobileApp.tsx`:

```tsx
export function MobileApp() {
  return <div>Braidr iPad — loading...</div>;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/dataService.ts src/renderer/main.tsx src/renderer/MobileApp.tsx
git commit -m "feat: platform-conditional DataService and root component"
```

---

### Task 11: MobileApp navigation shell

**Files:**
- Modify: `src/renderer/MobileApp.tsx` — full implementation
- Create: `src/renderer/components/MobileSidebar.tsx`

**Context:** Replaces the pane system with a sidebar + content area. The sidebar shows view switcher (POV / Rails / Notes) and contextual navigation (character list, scene list, or note tree). Tapping a scene opens EditorView in the content area.

- [ ] **Step 1: Create MobileSidebar component**

Create `src/renderer/components/MobileSidebar.tsx`:

```tsx
type MobileView = 'pov' | 'rails' | 'notes';

interface MobileSidebarProps {
  currentView: MobileView;
  onViewChange: (view: MobileView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  children: React.ReactNode; // View-specific navigation content
}

export function MobileSidebar({
  currentView, onViewChange, collapsed, onToggleCollapse, children,
}: MobileSidebarProps) {
  if (collapsed) {
    return (
      <div className="mobile-sidebar collapsed" style={{
        width: 44, borderRight: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8,
      }}>
        <button onClick={onToggleCollapse} style={{ padding: 8 }}>☰</button>
      </div>
    );
  }

  return (
    <div className="mobile-sidebar" style={{
      width: 280, borderRight: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{
        display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border-color)',
      }}>
        {(['pov', 'rails', 'notes'] as MobileView[]).map(view => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            style={{
              flex: 1, padding: '8px 4px',
              background: currentView === view ? 'var(--accent-color)' : 'transparent',
              color: currentView === view ? 'white' : 'inherit',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              textTransform: 'uppercase', fontSize: 11, fontWeight: 600,
            }}
          >
            {view === 'pov' ? 'POV' : view === 'rails' ? 'Rails' : 'Notes'}
          </button>
        ))}
        <button onClick={onToggleCollapse} style={{ padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
          ◀
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement MobileApp**

Replace the stub in `src/renderer/MobileApp.tsx` with the full navigation shell. This component manages:
- View state (pov / rails / notes)
- Sidebar collapse state
- Project loading (reusing the same `dataService.loadProject` flow as App.tsx)
- Selected character, selected scene, editor mode
- Rendering the appropriate view component in the content area

This is the largest single component to write. It will be structurally similar to `App.tsx` but much simpler — no pane system, no tasks, no timeline canvas, no graph view. Pull in the same state management patterns (useState + useRef for project data, useHistory for undo/redo).

The key structure:

```tsx
export function MobileApp() {
  // Project state — same shape as App.tsx
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [draftContent, setDraftContent] = useState<Record<string, string>>({});
  // ... other state from App.tsx lines 159-166

  // Mobile-specific state
  const [currentView, setCurrentView] = useState<'pov' | 'rails' | 'notes'>('pov');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingSceneKey, setEditingSceneKey] = useState<string | null>(null);

  // Render
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <MobileSidebar ...>
        {/* View-specific sidebar content */}
      </MobileSidebar>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {editingSceneKey ? (
          <EditorView ... />
        ) : currentView === 'pov' ? (
          /* POV view content */
        ) : currentView === 'rails' ? (
          <RailsView ... />
        ) : (
          <NotesView ... />
        )}
      </div>
    </div>
  );
}
```

**Important:** This component will reuse the existing child components (EditorView, RailsView, NotesView, PlotPointSection, SceneCard, etc.) — it just provides a different top-level shell and passes the same props.

Given the size of App.tsx (~2500 lines), implement MobileApp incrementally with a commit after each sub-step:

**11a: Project loading + POV view.** Wire up `dataService.selectProjectFolder()` → `loadProject()` → parse data → render character list in sidebar + PlotPointSection/SceneCard in content area. This requires the core state: `projectData`, `draftContent`, `scratchpadContent`, `sceneComments`, `drafts`, plus the `useHistory` hook. Replicate the state declarations and ref patterns from App.tsx lines 159-166. Wire up `handleDraftChange`, `handleScratchpadChange`, `handleAddComment`, `handleDeleteComment`, `handleSaveDraft` using the same patterns from App.tsx but calling `dataService.saveDraft()` etc. directly (as modified in Phase 1 Task 7).

**11b: Editor integration.** When a scene is tapped, set `editingSceneKey`. Render `EditorView` in the content area with the same props it gets from App.tsx: `draftContent`, `onDraftChange`, `selectedSceneKey`, etc. Add a back button to return to the view.

**11c: Rails view.** Add RailsView rendering when `currentView === 'rails'`. Pass scene positions, connections, drag handlers. The drag handlers should match the touch-adapted handlers from Task 12.

**11d: Notes view.** Add NotesView rendering when `currentView === 'notes'`. Wire up `loadNotesIndex`, `saveNotesIndex`, `readNote`, `saveNote`, and image handling.

The auto-save pattern: replicate the 10-second interval from App.tsx lines 2358-2368, but since per-scene content now saves directly on change (Phase 1), the interval only needs to save `timeline.json` for structural changes.

- [ ] **Step 3: Verify the app builds and the mobile shell renders**

```bash
cd /Users/brian/braidr && npm run build:vite
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/MobileApp.tsx src/renderer/components/MobileSidebar.tsx
git commit -m "feat: add MobileApp navigation shell for iPad"
```

---

### Task 12: Touch drag adaptation for RailsView

**Files:**
- Modify: `src/renderer/components/RailsView.tsx` — replace HTML5 DnD with pointer events

**Context:** iOS WebKit does not support HTML5 Drag and Drop API. The current RailsView uses `onDragStart`, `onDragEnd`, `onDragOver`, `onDrop` (see lines 208-260, 389-415, 505-507, 532-535, 641-643, 710-714, 769-789). These must be replaced with pointer events that work on both desktop and iPad.

**Approach:** Use `onPointerDown` / `onPointerMove` / `onPointerUp` with a long-press threshold (300ms) to initiate drag. This works on both platforms. The existing drag logic (ghost image, drop targets, reorder callbacks) stays the same — only the event triggering mechanism changes.

- [ ] **Step 1: Add pointer-event based drag state**

Add new state/refs to RailsView for tracking touch drag:

```typescript
const [pointerDragScene, setPointerDragScene] = useState<Scene | null>(null);
const pointerStartRef = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null }>({ x: 0, y: 0, timer: null });
const dragGhostRef = useRef<HTMLDivElement | null>(null);
```

- [ ] **Step 2: Implement long-press-to-drag handlers**

```typescript
const handlePointerDown = (e: React.PointerEvent, scene: Scene) => {
  const start = { x: e.clientX, y: e.clientY };
  pointerStartRef.current = {
    x: start.x,
    y: start.y,
    timer: setTimeout(() => {
      setPointerDragScene(scene);
      setDraggedSceneId(scene.id);
      // Create ghost element positioned at pointer
      // ... ghost creation logic similar to wrappedDragStart
    }, 300), // 300ms long-press to start drag
  };
};

const handlePointerMove = (e: React.PointerEvent) => {
  if (!pointerDragScene) {
    // Cancel if moved too far before long-press fires
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (pointerStartRef.current.timer) clearTimeout(pointerStartRef.current.timer);
    }
    return;
  }
  // Move ghost, update drop target based on pointer position
  // Use document.elementFromPoint(e.clientX, e.clientY) for hit testing
};

const handlePointerUp = (e: React.PointerEvent) => {
  if (pointerStartRef.current.timer) clearTimeout(pointerStartRef.current.timer);
  if (pointerDragScene && dropTargetIndex !== null) {
    // Complete the drop
    onDropOnTimeline(/* synthetic event */, dropTargetIndex);
  }
  setPointerDragScene(null);
  setDraggedSceneId(null);
  setDropTargetIndex(null);
};
```

- [ ] **Step 3: Replace DnD attributes on scene cards**

Replace `onDragStart={...} onDragEnd={...} draggable` with pointer event handlers on scene card elements. Keep the HTML5 handlers as a fallback for desktop (or remove them entirely since pointer events work on both platforms).

- [ ] **Step 4: Replace DnD attributes on drop zones and fix type mismatch**

The drop zone divs (lines 505-507, 532-535, 641-643) currently use `onDragOver`/`onDrop`. With pointer events, drop target detection moves to `handlePointerMove` using `document.elementFromPoint()`. Add data attributes to drop zone elements for hit testing:

```tsx
<div data-drop-index={index} className="drop-zone" ... />
```

**Type mismatch:** The `onDropOnTimeline` prop expects `React.DragEvent` as its first argument, but pointer events don't produce drag events. Update the prop type to accept an index-only signature for pointer-event drops:

In `RailsView.tsx` props (line 32), change:
```typescript
onDropOnTimeline: (e: React.DragEvent, targetIndex: number) => void;
```
To:
```typescript
onDropOnTimeline: (e: React.DragEvent | null, targetIndex: number) => void;
```

Then in `handlePointerUp`, call `onDropOnTimeline(null, dropTargetIndex)`. The parent handler in App.tsx/MobileApp should be updated to handle `null` for the event (it likely only uses the `targetIndex` anyway — verify).

**Also apply to rail header reordering (lines 389-415)** and **inbox drop zone (lines 710-714)**. These use the same HTML5 DnD pattern and need the same pointer-event treatment.

- [ ] **Step 5: Test on iPad Simulator**

Build and run in iOS Simulator:
```bash
cd /Users/brian/braidr && npm run cap:build && npx cap run ios
```

Verify:
- Long-press on a scene card initiates drag
- Dragging over rows shows drop indicator
- Releasing completes the reorder
- Normal taps (without long-press) still work for scene selection

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/RailsView.tsx
git commit -m "feat: replace HTML5 DnD with pointer events for iPad touch support"
```

---

### Task 13: Conflict detection on project load

**Files:**
- Create: `src/renderer/services/conflictDetector.ts`
- Modify: `src/renderer/MobileApp.tsx` — show conflict banner

**Context:** Both iCloud and Dropbox create conflict copies when the same file is edited on two devices. The app should detect these on project load and warn the user.

- [ ] **Step 1: Create conflict detection utility**

Create `src/renderer/services/conflictDetector.ts`:

```typescript
/**
 * Detects sync conflict copies created by iCloud or Dropbox.
 *
 * iCloud pattern: "filename (hostname's conflicted copy YYYY-MM-DD).ext"
 * Dropbox pattern: "filename (conflicted copy YYYY-MM-DD).ext"
 */

const CONFLICT_PATTERN = /\(.*conflicted copy.*\)/i;

export interface ConflictFile {
  originalName: string;
  conflictName: string;
  fullPath: string;
}

export function detectConflicts(fileNames: string[], folderPath: string): ConflictFile[] {
  const conflicts: ConflictFile[] = [];
  for (const name of fileNames) {
    if (CONFLICT_PATTERN.test(name)) {
      // Extract original filename by removing the conflict suffix
      const originalName = name
        .replace(/\s*\(.*conflicted copy.*\)/i, '')
        .trim();
      conflicts.push({
        originalName,
        conflictName: name,
        fullPath: `${folderPath}/${name}`,
      });
    }
  }
  return conflicts;
}
```

- [ ] **Step 2: Call from MobileApp on project load**

The conflict detector takes a list of filenames. To avoid importing `Filesystem` directly into MobileApp (which would break the desktop build), add a `listProjectFiles` method to `DataService`:

In `src/renderer/services/dataService.ts` interface, add:
```typescript
listProjectFiles?(projectPath: string): Promise<string[]>;
```

Implement in `CapacitorDataService`:
```typescript
async listProjectFiles(projectPath: string): Promise<string[]> {
  return this.listDir(projectPath);
}
```

In `ElectronDataService`, implement as a no-op (conflict detection is iPad-only for now):
```typescript
async listProjectFiles(_projectPath: string): Promise<string[]> {
  return [];
}
```

Then in MobileApp, after `loadProject`:
```typescript
import { detectConflicts } from './services/conflictDetector';

const files = await dataService.listProjectFiles?.(folderPath) || [];
const conflicts = detectConflicts(files, folderPath);
if (conflicts.length > 0) {
  setConflictBanner(`Sync conflicts detected: ${conflicts.length} file(s) were edited on both devices`);
}
```

- [ ] **Step 3: Show conflict banner in UI**

Add a dismissable warning banner at the top of MobileApp when conflicts are detected.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/conflictDetector.ts src/renderer/MobileApp.tsx
git commit -m "feat: detect and warn about sync conflict files on project load"
```

---

### Task 14: Build, test on iPad, and verify end-to-end

**Files:** No new files — verification task

- [ ] **Step 1: Build for iOS**

```bash
cd /Users/brian/braidr
npm run cap:build
npx cap sync ios
```

- [ ] **Step 2: Run on iPad Simulator**

```bash
npx cap run ios --target "iPad Pro (12.9-inch)"
```

Or open Xcode and run on a connected iPad:
```bash
npx cap open ios
```

- [ ] **Step 3: Verify core flows**

1. **Project loading:** Pick a project folder via document picker. All characters, scenes, and notes load correctly.
2. **POV view:** Tap a character → see their scenes grouped by plot point. Tap a scene → opens Editor.
3. **Editor:** Write prose → content saves to `drafts/{sceneId}.md`. Close and reopen → content persists.
4. **Rails view:** See all scenes in braided order. Long-press drag to reorder → positions update in `timeline.json`.
5. **Notes:** Open a note → TipTap renders. Wikilinks, hashtags, slash commands work. Images display (via URL rewriting).
6. **Sidebar:** Collapse/expand works. Portrait orientation collapses automatically.
7. **Offline:** Turn on airplane mode. Edit a scene. Turn off airplane mode. Verify the file syncs.

- [ ] **Step 4: Verify sync round-trip**

1. Edit a scene's prose on iPad (creates/updates `drafts/{sceneId}.md`)
2. Wait for sync (iCloud or Dropbox)
3. Open same project on Mac in Braidr desktop
4. Verify the prose change appears
5. Edit a different scene on Mac
6. Wait for sync
7. Open on iPad → verify the change appears

- [ ] **Step 5: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found during iPad testing"
```

---

## Dependencies Between Tasks

```
Task 1 (IPC channels) → Task 2 (preload) → Task 3 (main handlers)
                                          → Task 5 (migration)
Task 1 + 3 → Task 4 (DataService methods)
Task 4 + 5 + 6 → Task 7 (update App.tsx saves)

Task 7 completes Phase 1.

Task 8 (Capacitor scaffold) — independent of Phase 1 tasks
Task 9 (CapacitorDataService) — depends on Task 4 (interface defined)
Task 10 (platform detection) — depends on Task 9
Task 11 (MobileApp shell) — depends on Task 10
Task 12 (touch drag) — independent, can parallel with Task 11
Task 13 (conflict detection) — depends on Task 11
Task 14 (end-to-end test) — depends on all above
```
