# Scene Key Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all `characterId:sceneNumber` composite keys with stable `scene.id` UUIDs to fix data association bugs when scenes are reordered.

**Architecture:** Every Record keyed by `characterId:sceneNumber` switches to `scene.id`. A one-time migration converts existing data on load. The `remapSceneKeys` machinery is deleted since `scene.id` never changes.

**Tech Stack:** TypeScript, React, Electron

---

### Task 1: Add Migration Function to App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Add migration helper function before `loadProjectFromPath`**

Add this function inside the App component, before the `loadProjectFromPath` function (around line 1009):

```typescript
// Migrate scene-keyed data from "characterId:sceneNumber" keys to "scene.id" keys.
// Runs once on load if old-format keys are detected.
const migrateSceneKeys = (
  scenes: Scene[],
  data: {
    draftContent: Record<string, string>;
    drafts: Record<string, DraftVersion[]>;
    sceneMetadata: Record<string, Record<string, string | string[]>>;
    scratchpad: Record<string, string>;
    sceneComments: Record<string, SceneComment[]>;
    positions: Record<string, number>;
    wordCounts: Record<string, number>;
    timelineDates: Record<string, string>;
    timelineEndDates: Record<string, string>;
    connections: Record<string, string[]>;
    tasks: Task[];
  }
) => {
  // Build old-key -> scene.id lookup
  const oldKeyToId: Record<string, string> = {};
  for (const scene of scenes) {
    oldKeyToId[`${scene.characterId}:${scene.sceneNumber}`] = scene.id;
  }

  // Check if migration is needed: do any keys look like old format?
  const allKeys = [
    ...Object.keys(data.draftContent),
    ...Object.keys(data.positions),
    ...Object.keys(data.sceneMetadata),
  ];
  const hasOldKeys = allKeys.some(k => k.includes(':') && /:\d+$/.test(k));
  if (!hasOldKeys) return false; // Already migrated or empty

  // Helper: remap Record keys
  const remap = <T,>(source: Record<string, T>): Record<string, T> => {
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(source)) {
      if (key in oldKeyToId) {
        result[oldKeyToId[key]] = value;
      } else {
        result[key] = value; // Keep unrecognized keys as-is
      }
    }
    return result;
  };

  // Remap all Records
  Object.assign(data, {
    draftContent: remap(data.draftContent),
    drafts: remap(data.drafts),
    sceneMetadata: remap(data.sceneMetadata),
    scratchpad: remap(data.scratchpad),
    sceneComments: remap(data.sceneComments),
    positions: remap(data.positions),
    wordCounts: remap(data.wordCounts),
    timelineDates: remap(data.timelineDates),
    timelineEndDates: remap(data.timelineEndDates),
  });

  // Remap connections: both keys and values are old-format
  const newConnections: Record<string, string[]> = {};
  for (const [sourceKey, targetKeys] of Object.entries(data.connections)) {
    const newSourceKey = oldKeyToId[sourceKey] || sourceKey;
    const newTargetKeys = targetKeys.map(tk => oldKeyToId[tk] || tk);
    newConnections[newSourceKey] = newTargetKeys;
  }
  data.connections = newConnections;

  // Remap task sceneKeys
  for (const task of data.tasks) {
    if (task.sceneKey && task.sceneKey in oldKeyToId) {
      task.sceneKey = oldKeyToId[task.sceneKey];
    }
  }

  console.log('Migrated scene keys from characterId:sceneNumber to scene.id');
  return true; // Migration was performed
};
```

**Step 2: Verify the function compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: add migration function for scene key format change"
```

---

### Task 2: Update Data Loading in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Call migration in `loadProjectFromPath` and update connection loading**

In `loadProjectFromPath` (around line 1010), the current connection-loading code at lines 1016-1028 converts `characterId:sceneNumber` keys to scene IDs. After migration, connections will already be keyed by scene.id. Replace that block and add migration call.

Find the block starting at line 1016:
```typescript
    // Convert stored connections (using keys) to scene IDs
    const loadedConnections: Record<string, string[]> = {};
    for (const [sourceKey, targetKeys] of Object.entries(data.connections)) {
      const sourceScene = data.scenes.find(s => `${s.characterId}:${s.sceneNumber}` === sourceKey);
      if (sourceScene) {
        const targetIds = targetKeys
          .map(targetKey => data.scenes.find(s => `${s.characterId}:${s.sceneNumber}` === targetKey)?.id)
          .filter((id): id is string => id !== undefined);
        if (targetIds.length > 0) {
          loadedConnections[sourceScene.id] = targetIds;
        }
      }
    }
    setSceneConnections(loadedConnections);
```

Replace with:
```typescript
    // Migrate old characterId:sceneNumber keys to scene.id if needed
    const loadedDraft = data.draftContent || {};
    const loadedDrafts = data.drafts || {};
    const loadedScratchpad = data.scratchpad || {};
    const loadedComments = data.sceneComments || {};
    const loadedMetaData = data.sceneMetadata || {};
    const loadedTasks = data.tasks || [];
    const migrationData = {
      draftContent: loadedDraft,
      drafts: loadedDrafts,
      sceneMetadata: loadedMetaData,
      scratchpad: loadedScratchpad,
      sceneComments: loadedComments,
      positions: data.positions || {},
      wordCounts: data.wordCounts || {},
      timelineDates: data.timelineDates || {},
      timelineEndDates: data.timelineEndDates || {},
      connections: data.connections || {},
      tasks: loadedTasks,
    };
    const didMigrate = migrateSceneKeys(data.scenes, migrationData);

    // After migration, connections are already keyed by scene.id
    setSceneConnections(migrationData.connections);
```

**Note:** The variables `loadedDraft`, `loadedDrafts`, `loadedScratchpad`, `loadedComments`, `loadedMetaData` are declared earlier now (moved up). Remove their later declarations around lines 1100-1103 since they're now declared above. The `migrationData` object mutates them in place, so the rest of the code can use them as before.

**Step 2: Update orphan key cleanup (lines 1115-1136)**

The orphan cleanup currently builds `validKeys` using `characterId:sceneNumber`. Change it to use `scene.id`:

Replace:
```typescript
    const validKeys = new Set(data.scenes.map((s: Scene) => `${s.characterId}:${s.sceneNumber}`));
```

With:
```typescript
    const validKeys = new Set(data.scenes.map((s: Scene) => s.id));
```

**Step 3: Update analytics migration**

After the migration runs, also migrate `sceneSessions` in the analytics data. Find where analytics is loaded (search for `READ_ANALYTICS` or `loadAnalytics`). After loading analytics, if `didMigrate` is true, remap the `sceneKey` in each `SceneSession`:

```typescript
    // If keys were migrated, also migrate analytics sceneSessions
    if (didMigrate && analyticsRef.current) {
      const oldKeyToId: Record<string, string> = {};
      for (const scene of data.scenes) {
        oldKeyToId[`${scene.characterId}:${scene.sceneNumber}`] = scene.id;
      }
      const newSessions = (analyticsRef.current.sceneSessions || []).map(s => ({
        ...s,
        sceneKey: oldKeyToId[s.sceneKey] || s.sceneKey,
      }));
      analyticsRef.current = { ...analyticsRef.current, sceneSessions: newSessions };
      setSceneSessions(newSessions);
      // Save migrated analytics
      if (data.projectPath) {
        saveAnalytics(data.projectPath, analyticsRef.current);
      }
    }
```

**Step 4: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: integrate migration into data loading, update orphan cleanup"
```

---

### Task 3: Update Save Path in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Update `saveTimelineData` (lines 2373-2409)**

The save function currently constructs `characterId:sceneNumber` keys for positions, wordCounts, and converts scene ID connections back to key-based connections. After migration, everything is scene.id.

Replace the positions/wordCounts loop (lines 2382-2391):
```typescript
    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      if (scene.timelinePosition !== null) {
        positions[key] = scene.timelinePosition;
      }
      if (scene.wordCount !== undefined) {
        sceneWordCounts[key] = scene.wordCount;
      }
    }
```

With:
```typescript
    for (const scene of scenes) {
      if (scene.timelinePosition !== null) {
        positions[scene.id] = scene.timelinePosition;
      }
      if (scene.wordCount !== undefined) {
        sceneWordCounts[scene.id] = scene.wordCount;
      }
    }
```

**Step 2: Remove connection key conversion (lines 2393-2409)**

The connections conversion block converts scene IDs to `characterId:sceneNumber` keys for storage. Now we store by scene.id directly.

Replace:
```typescript
    // Convert scene ID connections to key-based connections
    const keyConnections: Record<string, string[]> = {};
    for (const [sourceId, targetIds] of Object.entries(connections)) {
      const sourceScene = scenes.find(s => s.id === sourceId);
      if (sourceScene) {
        const sourceKey = `${sourceScene.characterId}:${sourceScene.sceneNumber}`;
        const targetKeys = targetIds
          .map(targetId => {
            const targetScene = scenes.find(s => s.id === targetId);
            return targetScene ? `${targetScene.characterId}:${targetScene.sceneNumber}` : null;
          })
          .filter((key): key is string => key !== null);
        if (targetKeys.length > 0) {
          keyConnections[sourceKey] = targetKeys;
        }
      }
    }
```

With:
```typescript
    // Connections are already keyed by scene.id
    const keyConnections = connections;
```

**Step 3: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: update saveTimelineData to use scene.id keys"
```

---

### Task 4: Update App.tsx Operations and Delete Remap Functions

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Update `handleSceneDateChange` (line 542)**

Replace:
```typescript
      const key = `${s.characterId}:${s.sceneNumber}`;
```
With:
```typescript
      const key = s.id;
```

**Step 2: Update `createSceneInTimeline` (line 2720)**

Replace:
```typescript
    const sceneKey = `${characterId}:${newScene.sceneNumber}`;
```
With:
```typescript
    const sceneKey = newScene.id;
```

**Step 3: Update `archiveScene` (lines 2880-2901)**

Replace:
```typescript
    const archivedKey = `${scene.characterId}:${scene.sceneNumber}`;
```
With:
```typescript
    const archivedKey = scene.id;
```

Remove the remap calls at lines 2894 and 2900-2901:
```typescript
    const oldNumbers = buildKeyMapBeforeRenumber(charScenes);
    // ...renumbering...
    applyKeyRemapAfterRenumber(charScenes, oldNumbers);
```

The renumbering of `sceneNumber` (line 2896-2898) should stay since `sceneNumber` is still used for display ordering. Just remove the remap calls.

**Step 4: Update character deletion (lines 1397-1399)**

Replace:
```typescript
    const charSceneKeys = projectData.scenes
      .filter(s => s.characterId === characterId)
      .map(s => `${s.characterId}:${s.sceneNumber}`);
```
With:
```typescript
    const charSceneKeys = projectData.scenes
      .filter(s => s.characterId === characterId)
      .map(s => s.id);
```

**Step 5: Update POV view metadata lookups (lines 3592-3593)**

Replace:
```typescript
                        const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
                        handleMetadataChange(sceneKey, fieldId, value);
```
With:
```typescript
                        handleMetadataChange(scene.id, fieldId, value);
```

**Step 6: Update POV view unplaced scenes section (lines 3653, 3657, 3665)**

Replace:
```typescript
                    sceneMetadata={sceneMetadata[`${scene.characterId}:${scene.sceneNumber}`]}
```
With:
```typescript
                    sceneMetadata={sceneMetadata[scene.id]}
```

Replace:
```typescript
                        handleMetadataChange(`${s.characterId}:${s.sceneNumber}`, fieldId, value);
```
With:
```typescript
                        handleMetadataChange(s.id, fieldId, value);
```

Replace:
```typescript
                    sceneDate={timelineDates[`${scene.characterId}:${scene.sceneNumber}`]}
```
With:
```typescript
                    sceneDate={timelineDates[scene.id]}
```

**Step 7: Update floating editor (lines 3735, 3752)**

Replace:
```typescript
                    draftContent={draftContent[`${listFloatingEditor.characterId}:${listFloatingEditor.sceneNumber}`] || ''}
```
With:
```typescript
                    draftContent={draftContent[listFloatingEditor.id] || ''}
```

Replace:
```typescript
                    scratchpadContent={scratchpadContent[`${listFloatingEditor.characterId}:${listFloatingEditor.sceneNumber}`] || ''}
```
With:
```typescript
                    scratchpadContent={scratchpadContent[listFloatingEditor.id] || ''}
```

**Step 8: Update braided scene card (lines 4050, 4054, 4060)**

Replace:
```typescript
                                sceneMetadata={sceneMetadata[`${scene.characterId}:${scene.sceneNumber}`]}
```
With:
```typescript
                                sceneMetadata={sceneMetadata[scene.id]}
```

Replace:
```typescript
                                    handleMetadataChange(`${s.characterId}:${s.sceneNumber}`, fieldId, value);
```
With:
```typescript
                                    handleMetadataChange(s.id, fieldId, value);
```

Replace:
```typescript
                                sceneDate={timelineDates[`${scene.characterId}:${scene.sceneNumber}`]}
```
With:
```typescript
                                sceneDate={timelineDates[scene.id]}
```

**Step 9: Update `handlePovDragEnd` (lines 1841, 1849)**

Remove the remap calls:
```typescript
    const oldNumbers = buildKeyMapBeforeRenumber(reordered);
```
and:
```typescript
    applyKeyRemapAfterRenumber(reordered, oldNumbers);
```

Keep the renumbering loop (lines 1844-1846) since `sceneNumber` is still used for display.

**Step 10: Delete remap functions (lines 1711-1770)**

Delete the entire block containing `remapSceneKeys`, `buildKeyMapBeforeRenumber`, and `applyKeyRemapAfterRenumber`.

**Step 11: Search for any remaining `characterId}:${` patterns in App.tsx**

Run: `grep -n 'characterId}:\${' src/renderer/App.tsx`

Fix any remaining occurrences found. Expected remaining spots may include other drag handlers or section-related operations — replace each with `scene.id` or `s.id`.

**Step 12: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 13: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: update all App.tsx operations to use scene.id, delete remap functions"
```

---

### Task 5: Update EditorView.tsx

**Files:**
- Modify: `src/renderer/components/EditorView.tsx`

**Step 1: Delete `getSceneKey` function (lines 100-102)**

Remove:
```typescript
function getSceneKey(scene: Scene): string {
  return `${scene.characterId}:${scene.sceneNumber}`;
}
```

**Step 2: Update sidebar `sceneKey` variable (line 1437)**

Replace:
```typescript
          const sceneKey = selectedScene ? `${selectedScene.characterId}:${selectedScene.sceneNumber}` : '';
```
With:
```typescript
          const sceneKey = selectedScene ? selectedScene.id : '';
```

**Step 3: Update time tracking key (line 1745)**

Replace:
```typescript
                const key = `${selectedScene.characterId}:${selectedScene.sceneNumber}`;
```
With:
```typescript
                const key = selectedScene.id;
```

**Step 4: Search for any remaining `characterId}:${` in EditorView.tsx and fix**

Run: `grep -n 'characterId}:\${' src/renderer/components/EditorView.tsx`

Fix any remaining — all should use `scene.id` or `selectedScene.id`.

**Step 5: Update all places where `getSceneKey` was called**

Search for `getSceneKey(` in EditorView.tsx and replace each call with the scene's `.id` property.

**Step 6: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 7: Commit**

```bash
git add src/renderer/components/EditorView.tsx
git commit -m "feat: update EditorView to use scene.id keys"
```

---

### Task 6: Update Remaining Components

**Files:**
- Modify: `src/renderer/components/TableView.tsx`
- Modify: `src/renderer/components/CompileModal.tsx`
- Modify: `src/renderer/components/WordCountDashboard.tsx`
- Modify: `src/renderer/components/SceneCard.tsx`
- Modify: `src/renderer/components/FloatingEditor.tsx`
- Modify: `src/renderer/components/RailsView.tsx`
- Modify: `src/renderer/components/PlotPointSection.tsx`

**Step 1: TableView.tsx — Delete `getSceneKey` (lines 48-50) and replace all calls with `scene.id`**

Search for all `getSceneKey(` calls in the file and replace with the scene's `.id`.

**Step 2: CompileModal.tsx — Delete `getSceneKey` (lines 18-20) and replace all calls with `scene.id`**

**Step 3: WordCountDashboard.tsx — Delete `getSceneKey` (lines 29-31) and replace all calls with `scene.id`**

**Step 4: SceneCard.tsx — Update line 420**

Replace:
```typescript
                  onOpenInEditor(`${scene.characterId}:${scene.sceneNumber}`);
```
With:
```typescript
                  onOpenInEditor(scene.id);
```

**Step 5: FloatingEditor.tsx — Update line 55**

Replace:
```typescript
    const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
```
With:
```typescript
    const sceneKey = scene.id;
```

**Step 6: RailsView.tsx — Update line 761**

Replace:
```typescript
          draftContent={draftContent[`${floatingEditorScene.characterId}:${floatingEditorScene.sceneNumber}`] || ''}
```
With:
```typescript
          draftContent={draftContent[floatingEditorScene.id] || ''}
```

**Step 7: PlotPointSection.tsx — Update lines 337 and 342**

Replace:
```typescript
                sceneMetadata={sceneMetadata?.[`${scene.characterId}:${scene.sceneNumber}`]}
```
With:
```typescript
                sceneMetadata={sceneMetadata?.[scene.id]}
```

Replace:
```typescript
                sceneDate={timelineDates?.[`${scene.characterId}:${scene.sceneNumber}`]}
```
With:
```typescript
                sceneDate={timelineDates?.[scene.id]}
```

**Step 8: Search all modified files for remaining `characterId}:${` patterns**

Run: `grep -rn 'characterId}:\${' src/renderer/components/TableView.tsx src/renderer/components/CompileModal.tsx src/renderer/components/WordCountDashboard.tsx src/renderer/components/SceneCard.tsx src/renderer/components/FloatingEditor.tsx src/renderer/components/RailsView.tsx src/renderer/components/PlotPointSection.tsx`

Fix any remaining.

**Step 9: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 10: Commit**

```bash
git add src/renderer/components/TableView.tsx src/renderer/components/CompileModal.tsx src/renderer/components/WordCountDashboard.tsx src/renderer/components/SceneCard.tsx src/renderer/components/FloatingEditor.tsx src/renderer/components/RailsView.tsx src/renderer/components/PlotPointSection.tsx
git commit -m "feat: update remaining components to use scene.id keys"
```

---

### Task 7: Update Timeline Components

**Files:**
- Modify: `src/renderer/components/timeline/TimelineCanvas.tsx`
- Modify: `src/renderer/components/timeline/TimelineGrid.tsx`
- Modify: `src/renderer/components/timeline/TimelineContextBar.tsx`
- Modify: `src/renderer/components/timeline/TimelineView.tsx`
- Modify: `src/renderer/components/timeline/TimelineSidebar.tsx`

**Step 1: TimelineCanvas.tsx**

Update `sceneByKey` memo (line 149):
```typescript
      m[`${s.characterId}:${s.sceneNumber}`] = s;
```
→ `m[s.id] = s;`

Update `keyById` memo (line 158):
```typescript
      m[s.id] = `${s.characterId}:${s.sceneNumber}`;
```
→ `m[s.id] = s.id;`

(Note: `keyById` becomes identity and may be removable. But for safety, keep it and simplify later.)

Update hitTest (line 272):
```typescript
      const key = `${scene.characterId}:${scene.sceneNumber}`;
```
→ `const key = scene.id;`

Update scene cards drawing (line 464):
```typescript
      const key = `${scene.characterId}:${scene.sceneNumber}`;
```
→ `const key = scene.id;`

**Step 2: TimelineGrid.tsx**

Update `sceneDateMap` (line 250):
```typescript
      const key = `${scene.characterId}:${scene.sceneNumber}`;
```
→ `const key = scene.id;`

Update `sceneByKey` (line 277):
```typescript
      m[`${s.characterId}:${s.sceneNumber}`] = s;
```
→ `m[s.id] = s;`

**Step 3: TimelineContextBar.tsx**

Update both scene bar loops (lines 91 and 260):
```typescript
      const key = `${scene.characterId}:${scene.sceneNumber}`;
```
→ `const key = scene.id;`

**Step 4: TimelineView.tsx**

Update `getAvailableScenes` (line 443):
```typescript
      const key = `${scene.characterId}:${scene.sceneNumber}`;
```
→ `const key = scene.id;`

**Step 5: TimelineSidebar.tsx**

Update unassigned scenes filter (line 39):
```typescript
      const key = `${s.characterId}:${s.sceneNumber}`;
```
→ `const key = s.id;`

Update narrative cards (line 258):
```typescript
              const key = `${scene.characterId}:${scene.sceneNumber}`;
```
→ `const key = scene.id;`

Update grouped cards (line 302):
```typescript
                      const key = `${scene.characterId}:${scene.sceneNumber}`;
```
→ `const key = scene.id;`

**Step 6: Search all timeline files for remaining `characterId}:${` patterns**

Run: `grep -rn 'characterId}:\${' src/renderer/components/timeline/`

Fix any remaining.

**Step 7: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 8: Commit**

```bash
git add src/renderer/components/timeline/
git commit -m "feat: update all timeline components to use scene.id keys"
```

---

### Task 8: Update Notes Components and Utilities

**Files:**
- Modify: `src/renderer/components/notes/NoteEditor.tsx`
- Modify: `src/renderer/components/notes/GraphView.tsx`
- Modify: `src/renderer/utils/analyticsStore.ts`
- Modify: `src/renderer/utils/parseTodoWidgets.ts`
- Modify: `src/renderer/extensions/todoWidget.tsx`

**Step 1: NoteEditor.tsx — Update wikilink search (line 164)**

Replace:
```typescript
      const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
```
With:
```typescript
      const sceneKey = scene.id;
```

**Step 2: GraphView.tsx — Update node map (lines 329, 332-333)**

Replace:
```typescript
      const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
      // ...
      nodeMap.set(sceneKey, {
        id: sceneKey,
```
With:
```typescript
      nodeMap.set(scene.id, {
        id: scene.id,
```

Update tag mapping (line 379):
```typescript
        const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
```
→ Remove variable, use `scene.id` directly:
```typescript
          list.push(scene.id);
```

**Step 3: analyticsStore.ts — Update comment on SceneSession (line 14)**

Replace:
```typescript
    sceneKey: string;        // "characterId:sceneNumber"
```
With:
```typescript
    sceneKey: string;        // scene.id (stable UUID)
```

No functional changes needed in analyticsStore — it just filters by `sceneKey` string, which will now contain scene.id values.

**Step 4: parseTodoWidgets.ts — Update `getTodosForScene` (lines 71-93)**

The function currently takes `characterId`, `characterName`, and `sceneNumber` params. Change it to accept `sceneId` instead:

Replace:
```typescript
export function getTodosForScene(
  todos: SceneTodo[],
  characterId: string,
  characterName: string,
  sceneNumber: number
): SceneTodo[] {
  const sceneKey = `${characterId}:${sceneNumber}`;

  return todos.filter(todo => {
    if (todo.sceneKey) {
      return todo.sceneKey === sceneKey;
    }
    const label = todo.sceneLabel.toLowerCase();
    const searchTerms = [
      `${characterName} — ${sceneNumber}`,
      `${characterName} — scene ${sceneNumber}`,
      `${characterName} - scene ${sceneNumber}`,
    ].map(t => t.toLowerCase());
    return searchTerms.some(term => label.includes(term));
  });
}
```

With:
```typescript
export function getTodosForScene(
  todos: SceneTodo[],
  sceneId: string
): SceneTodo[] {
  return todos.filter(todo => {
    if (todo.sceneKey) {
      return todo.sceneKey === sceneId;
    }
    return false;
  });
}
```

Then find all callers of `getTodosForScene` and update them to pass `scene.id` instead of `characterId, characterName, sceneNumber`.

**Step 5: todoWidget.tsx — Update `TodoRow` interface comment (line 8) and `sceneOptions` (line 44)**

Update comment:
```typescript
    sceneKey: string; // "characterId:sceneNumber" or empty
```
→
```typescript
    sceneKey: string; // scene.id or empty
```

Update scene options key (line 44):
```typescript
          key: `${s.characterId}:${s.sceneNumber}`,
```
→
```typescript
          key: s.id,
```

Also update the `SceneOption` interface comment (line 15):
```typescript
    key: string;   // "characterId:sceneNumber"
```
→
```typescript
    key: string;   // scene.id
```

**Step 6: Search all modified files for remaining `characterId}:${` patterns**

Run: `grep -rn 'characterId}:\${' src/renderer/components/notes/ src/renderer/utils/ src/renderer/extensions/todoWidget.tsx`

Fix any remaining.

**Step 7: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 8: Commit**

```bash
git add src/renderer/components/notes/ src/renderer/utils/ src/renderer/extensions/todoWidget.tsx
git commit -m "feat: update notes, utilities, and extensions to use scene.id keys"
```

---

### Task 9: Update Type Comments and Final Sweep

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Update all comments in `TimelineData` that say "characterId:sceneNumber"**

Lines 86-131 in `types.ts` have comments like:
- `// Maps "characterId:sceneNumber" to timeline position`
- `// Maps "characterId:sceneNumber" to array of connected scene keys`
- etc.

Update each to say `// Keyed by scene.id` instead. Specifically:

- Line 86: `// Maps scene.id to timeline position`
- Line 88: `// Maps scene.id to array of connected scene IDs`
- Line 94: `// Word counts for scenes (scene.id -> count)`
- Line 102: `// Draft prose content keyed by scene.id`
- Line 106: `// Per-scene metadata values keyed by scene.id`
- Line 108: `// Saved draft versions keyed by scene.id`
- Line 110: `// Scratchpad content keyed by scene.id`
- Line 112: `// Comments keyed by scene.id`
- Line 128: `// Scene dates keyed by scene.id`
- Line 130: `// Scene end dates keyed by scene.id (for multi-day scenes)`

**Step 2: Final comprehensive search**

Run: `grep -rn 'characterId}:\${' src/`

This should return zero results. If any remain, fix them.

Also run: `grep -rn 'characterId:sceneNumber' src/`

This should only appear in comments (if at all). Fix any remaining functional usage.

**Step 3: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Test the app**

Run: `cd /Users/brian/braidr && npm run dev`

Manual test checklist:
- [ ] Open an existing project — data should be migrated automatically
- [ ] Verify draft content loads for each scene
- [ ] Verify metadata (status, tags) loads for each scene
- [ ] Verify time tracking shows correct totals per scene
- [ ] Verify tasks/changes show under correct scenes
- [ ] Reorder scenes in POV view — verify data stays with correct scene
- [ ] Create a new scene — verify it gets a proper key
- [ ] Archive a scene — verify other scenes' data is unaffected
- [ ] Check timeline view — scenes should appear at correct dates
- [ ] Check notes wikilinks — scene links should still work
- [ ] Check graph view — scene nodes should appear correctly

**Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "docs: update type comments to reflect scene.id keying"
```

**Step 6: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: complete migration from characterId:sceneNumber to scene.id keys

Fixes bug #143 where changes needed and time tracking data got
associated with wrong scenes after reordering."
```
