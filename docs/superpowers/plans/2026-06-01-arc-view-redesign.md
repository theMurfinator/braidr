# Arc View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Arc View to a clean spreadsheet-style table with an 8-column layout, remove row-type label chips, add Dilemma and Propelling Action fields at every hierarchy level, and introduce an arc-specific bullpen sidebar for staging unplaced sections and scenes.

**Architecture:** Data changes (new `dilemma` and `propellingAction` columns on all four arc levels) flow through new direct-update IPC channels rather than the lossy `saveCharacterOutline` path. The ArcBullpenPanel replaces the existing BullpenPanel in the arc layout and holds both unassigned sections and scenes. Section assignment uses a right-click context menu; scenes stay drag-and-drop.

**Tech Stack:** React, TypeScript, better-sqlite3, dnd-kit, Electron IPC

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/main/database.ts` | Add dilemma + propellingAction columns to migrations; extend updateScene/updatePlotPoint/upsertAct/upsertCharacterPsychology; update row types |
| Modify | `src/shared/types.ts` | Add dilemma + propellingAction to Scene/PlotPoint/Act/CharacterPsychology interfaces; add new IPC channel constants |
| Modify | `src/main/braidrIpc.ts` | Add BRAIDR_SAVE_SCENE_ARC_FIELDS and BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS handlers |
| Modify | `src/main/preload.ts` | Expose new IPC channels to renderer |
| Modify | `src/renderer/services/dataService.ts` | Add saveSceneArcFields and savePlotPointArcFields service methods |
| Modify | `src/renderer/components/ArcView.tsx` | 8-col grid; remove label chips; rename columns; add dilemma + propellingAction cells; section context menu; new props |
| Create | `src/renderer/components/ArcBullpenPanel.tsx` | Arc-specific bullpen: sections group + scenes group, context menus, drag for scenes |
| Modify | `src/renderer/App.tsx` | New handlers; swap BullpenPanel → ArcBullpenPanel; update arc creation handlers |
| Modify | `src/renderer/styles.css` | 8-col arc grid; remove arc-name-tag styling; arc bullpen CSS |

---

## Task 1: DB migrations + type layer

**Files:**
- Modify: `src/main/database.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add dilemma + propellingAction migrations to `database.ts`**

In `migrate()` (around line 426, after the existing arc field migrations), add:

```typescript
// Dilemma + Propelling Action fields
if (!ppColumns.includes('dilemma')) {
  this.db.exec("ALTER TABLE plot_points ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''");
}
if (!ppColumns.includes('propelling_action')) {
  this.db.exec("ALTER TABLE plot_points ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''");
}
const actColumns = (
  this.db.prepare('PRAGMA table_info(acts)').all() as { name: string }[]
).map(c => c.name);
if (!actColumns.includes('dilemma')) {
  this.db.exec("ALTER TABLE acts ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''");
}
if (!actColumns.includes('propelling_action')) {
  this.db.exec("ALTER TABLE acts ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''");
}
const psychColumns = (
  this.db.prepare('PRAGMA table_info(character_psychology)').all() as { name: string }[]
).map(c => c.name);
if (!psychColumns.includes('novel_dilemma')) {
  this.db.exec("ALTER TABLE character_psychology ADD COLUMN novel_dilemma TEXT NOT NULL DEFAULT ''");
}
if (!psychColumns.includes('novel_propelling_action')) {
  this.db.exec("ALTER TABLE character_psychology ADD COLUMN novel_propelling_action TEXT NOT NULL DEFAULT ''");
}
if (!sceneColumns.includes('dilemma')) {
  this.db.exec("ALTER TABLE scenes ADD COLUMN dilemma TEXT NOT NULL DEFAULT ''");
}
if (!sceneColumns.includes('propelling_action')) {
  this.db.exec("ALTER TABLE scenes ADD COLUMN propelling_action TEXT NOT NULL DEFAULT ''");
}
```

- [ ] **Step 2: Extend `updateScene` to handle arc fields**

`updateScene` currently (line 561) only handles basic fields. Replace the entire method:

```typescript
updateScene(id: string, fields: Partial<{
  title: string; synopsis: string; sceneNumber: number;
  timelinePosition: number | null; isHighlighted: boolean;
  wordCount: number | null; plotPointId: string | null;
  chapterId: string | null; sceneOrder: number;
  polarity: string; transformation: string; dilemma: string; propellingAction: string;
}>) {
  const updates: string[] = [];
  const values: unknown[] = [];
  if ('title' in fields)             { updates.push('title = ?');              values.push(fields.title); }
  if ('synopsis' in fields)          { updates.push('synopsis = ?');           values.push(fields.synopsis); }
  if ('sceneNumber' in fields)       { updates.push('scene_number = ?');       values.push(fields.sceneNumber); }
  if ('timelinePosition' in fields)  { updates.push('timeline_position = ?');  values.push(fields.timelinePosition); }
  if ('isHighlighted' in fields)     { updates.push('is_highlighted = ?');     values.push(fields.isHighlighted ? 1 : 0); }
  if ('wordCount' in fields)         { updates.push('word_count = ?');         values.push(fields.wordCount); }
  if ('plotPointId' in fields)       { updates.push('plot_point_id = ?');      values.push(fields.plotPointId); }
  if ('chapterId' in fields)         { updates.push('chapter_id = ?');         values.push(fields.chapterId); }
  if ('sceneOrder' in fields)        { updates.push('scene_order = ?');        values.push(fields.sceneOrder); }
  if ('polarity' in fields)          { updates.push('polarity = ?');           values.push(fields.polarity); }
  if ('transformation' in fields)    { updates.push('transformation = ?');     values.push(fields.transformation); }
  if ('dilemma' in fields)           { updates.push('dilemma = ?');            values.push(fields.dilemma); }
  if ('propellingAction' in fields)  { updates.push('propelling_action = ?');  values.push(fields.propellingAction); }
  if (updates.length === 0) return;
  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  this.db.prepare(`UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}
```

- [ ] **Step 3: Extend `updatePlotPoint` to handle dilemma**

In `updatePlotPoint` (line 518), add after the `transformation` branch:

```typescript
if ('dilemma' in fields)           { updates.push('dilemma = ?');            values.push(fields.dilemma); }
if ('propellingAction' in fields)  { updates.push('propelling_action = ?');  values.push(fields.propellingAction); }
```

Also update the method signature to include `dilemma: string` and `propellingAction: string`:

```typescript
updatePlotPoint(id: string, fields: Partial<{ title: string; description: string | null; expectedSceneCount: number | null; displayOrder: number; actId: string | null; startingState: string; endingState: string; polarity: string; transformation: string; dilemma: string; propellingAction: string }>) {
```

- [ ] **Step 4: Update `upsertAct` to include dilemma**

Replace the `upsertAct` method (line 763):

```typescript
upsertAct(row: ActRow) {
  this.db.prepare(`
    INSERT INTO acts (id, character_id, name, starting_state, ending_state, polarity, transformation, dilemma, propelling_action, display_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, starting_state = excluded.starting_state,
      ending_state = excluded.ending_state, polarity = excluded.polarity,
      transformation = excluded.transformation, dilemma = excluded.dilemma,
      propelling_action = excluded.propelling_action, display_order = excluded.display_order
  `).run(row.id, row.character_id, row.name, row.starting_state, row.ending_state, row.polarity, row.transformation, row.dilemma, row.propellingAction, row.display_order, row.created_at);
}
```

- [ ] **Step 5: Update `upsertCharacterPsychology` to include novel_dilemma**

Replace the INSERT statement in `upsertCharacterPsychology` (line 790):

```typescript
upsertCharacterPsychology(row: CharacterPsychologyRow) {
  this.db.prepare(`
    INSERT INTO character_psychology (character_id, novel_starting_state, novel_ending_state, novel_polarity, novel_transformation, novel_dilemma, novel_propelling_action, wound, lie, deepest_fear, limiting_belief, thorn, coping_tool, whisper_of_grace, surface_want, souls_longing, bitter_need, capital_t_truth, arc_summary, theme, anti_theme, final_reader_experience)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(character_id) DO UPDATE SET
      novel_starting_state = excluded.novel_starting_state, novel_ending_state = excluded.novel_ending_state,
      novel_polarity = excluded.novel_polarity, novel_transformation = excluded.novel_transformation,
      novel_dilemma = excluded.novel_dilemma, novel_propelling_action = excluded.novel_propelling_action,
      wound = excluded.wound, lie = excluded.lie, deepest_fear = excluded.deepest_fear,
      limiting_belief = excluded.limiting_belief, thorn = excluded.thorn, coping_tool = excluded.coping_tool,
      whisper_of_grace = excluded.whisper_of_grace, surface_want = excluded.surface_want,
      souls_longing = excluded.souls_longing, bitter_need = excluded.bitter_need,
      capital_t_truth = excluded.capital_t_truth, arc_summary = excluded.arc_summary,
      theme = excluded.theme, anti_theme = excluded.anti_theme,
      final_reader_experience = excluded.final_reader_experience
  `).run(
    row.character_id, row.novel_starting_state, row.novel_ending_state, row.novel_polarity, row.novel_transformation, row.novel_dilemma, row.novel_propelling_action,
    row.wound, row.lie, row.deepest_fear, row.limiting_belief, row.thorn, row.coping_tool,
    row.whisper_of_grace, row.surface_want, row.souls_longing, row.bitter_need,
    row.capital_t_truth, row.arc_summary, row.theme, row.anti_theme, row.final_reader_experience
  );
}
```

- [ ] **Step 6: Update DB row types in `database.ts`**

Update `PlotPointRow` (line 1097):
```typescript
export interface PlotPointRow {
  id: string; character_id: string; title: string; description: string | null;
  expected_scene_count: number | null; display_order: number; created_at: number;
  act_id: string | null;
  starting_state: string; ending_state: string; polarity: string; transformation: string; dilemma: string; propelling_action: string;
}
```

Update `ActRow` (line 1103):
```typescript
export interface ActRow {
  id: string; character_id: string; name: string;
  starting_state: string; ending_state: string; polarity: string; transformation: string; dilemma: string; propelling_action: string;
  display_order: number; created_at: number;
}
```

Update `CharacterPsychologyRow` (line 1109):
```typescript
export interface CharacterPsychologyRow {
  character_id: string;
  novel_starting_state: string; novel_ending_state: string;
  novel_polarity: string; novel_transformation: string; novel_dilemma: string; novel_propelling_action: string;
  wound: string; lie: string; deepest_fear: string; limiting_belief: string;
  thorn: string; coping_tool: string; whisper_of_grace: string; surface_want: string;
  souls_longing: string; bitter_need: string; capital_t_truth: string;
  arc_summary: string; theme: string; anti_theme: string; final_reader_experience: string;
}
```

Update `SceneRow` (line 1120):
```typescript
export interface SceneRow {
  id: string; character_id: string; plot_point_id: string | null;
  title: string; synopsis: string; scene_number: number;
  timeline_position: number | null; is_highlighted: number; word_count: number | null;
  chapter_id: string | null; scene_order: number;
  polarity: string; transformation: string; dilemma: string; propelling_action: string;
  created_at: number; updated_at: number;
}
```

- [ ] **Step 7: Update TypeScript interfaces in `types.ts`**

Add `dilemma: string` and `propellingAction: string` to `Scene` interface (after `transformation: string` around line 26):
```typescript
  polarity: string;
  transformation: string;
  dilemma: string;
  propellingAction: string;
```

Add `dilemma: string` and `propellingAction: string` to `PlotPoint` interface (after `transformation: string` around line 293):
```typescript
  polarity: string;
  transformation: string;
  dilemma: string;
  propellingAction: string;
```

Add `dilemma: string` and `propellingAction: string` to `Act` interface (after `transformation: string` around line 253):
```typescript
  polarity: string;
  transformation: string;
  dilemma: string;
  propellingAction: string;
```

Add `novelDilemma: string` and `novelPropellingAction: string` to `CharacterPsychology` (after `novelTransformation: string` around line 263):
```typescript
  novelStartingState: string;
  novelEndingState: string;
  novelPolarity: string;
  novelTransformation: string;
  novelDilemma: string;
  novelPropellingAction: string;
```

- [ ] **Step 8: Commit**

```bash
git add src/main/database.ts src/shared/types.ts
git commit -m "feat: add dilemma field to all arc levels in DB and types"
```

---

## Task 2: IPC + service layer

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/braidrIpc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/services/dataService.ts`

- [ ] **Step 1: Add IPC channel constants to `types.ts`**

In `IPC_CHANNELS` (find the `BRAIDR_SAVE_ACT` entry around line 540), add two new entries:

```typescript
BRAIDR_SAVE_ACT: 'braidr:save-act',
BRAIDR_SAVE_SCENE_ARC_FIELDS: 'braidr:save-scene-arc-fields',
BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS: 'braidr:save-plot-point-arc-fields',
```

- [ ] **Step 2: Add IPC handlers to `braidrIpc.ts`**

After the `BRAIDR_SAVE_ACT` handler (line 1132), add:

```typescript
ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_SCENE_ARC_FIELDS, (_event, braidrPath: string, sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string }) => {
  try {
    const db = getDb(braidrPath);
    db.updateScene(sceneId, fields);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_PLOT_POINT_ARC_FIELDS, (_event, braidrPath: string, plotPointId: string, fields: { actId?: string | null; startingState?: string; endingState?: string; polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; title?: string; description?: string }) => {
  try {
    const db = getDb(braidrPath);
    db.updatePlotPoint(plotPointId, fields);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});
```

- [ ] **Step 3: Add preload bindings to `preload.ts`**

`preload.ts` uses its own copy of IPC channel strings (does not import from shared). After the `braidrSaveAct` binding (line 313), add:

```typescript
braidrSaveSceneArcFields: (braidrPath: string, sceneId: string, fields: unknown) =>
  ipcRenderer.invoke('braidr:save-scene-arc-fields', braidrPath, sceneId, fields),
braidrSavePlotPointArcFields: (braidrPath: string, plotPointId: string, fields: unknown) =>
  ipcRenderer.invoke('braidr:save-plot-point-arc-fields', braidrPath, plotPointId, fields),
```

- [ ] **Step 4: Add service methods to `dataService.ts`**

In the `ElectronDataService` class, after `saveCharacterPsychology` (find it around line 96), add:

```typescript
async saveSceneArcFields(sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string }): Promise<void> {
  if (!this.braidrPath) throw new Error('No project loaded');
  const result = await window.electronAPI.braidrSaveSceneArcFields(this.braidrPath, sceneId, fields);
  if (!result.success) throw new Error(result.error || 'Failed to save scene arc fields');
}

async savePlotPointArcFields(plotPointId: string, fields: { actId?: string | null; startingState?: string; endingState?: string; polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; title?: string; description?: string }): Promise<void> {
  if (!this.braidrPath) throw new Error('No project loaded');
  const result = await window.electronAPI.braidrSavePlotPointArcFields(this.braidrPath, plotPointId, fields);
  if (!result.success) throw new Error(result.error || 'Failed to save plot point arc fields');
}
```

Also update the `DataService` interface at the top of the file to declare these two methods:

```typescript
saveSceneArcFields(sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string }): Promise<void>;
savePlotPointArcFields(plotPointId: string, fields: { actId?: string | null; startingState?: string; endingState?: string; polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; title?: string; description?: string }): Promise<void>;
```

- [ ] **Step 5: Add electronAPI typings**

In `preload.ts`, the `contextBridge.exposeInMainWorld` call has a typed object. Add the two new method signatures to the type annotation (find the section listing braidrSaveAct):

```typescript
braidrSaveSceneArcFields: (braidrPath: string, sceneId: string, fields: unknown) => Promise<unknown>;
braidrSavePlotPointArcFields: (braidrPath: string, plotPointId: string, fields: unknown) => Promise<unknown>;
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/braidrIpc.ts src/main/preload.ts src/renderer/services/dataService.ts
git commit -m "feat: add direct arc field save IPC channels for scenes and plot points"
```

---

## Task 3: ArcView visual reskin

**Files:**
- Modify: `src/renderer/components/ArcView.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Update CSS grid from 6 to 8 columns**

In `styles.css`, find `.arc-grid` (line 20507) and update:

```css
.arc-grid {
  display: grid;
  grid-template-columns: 220px 1fr 1fr 1fr 1fr 1fr 1fr 80px;
}
```

- [ ] **Step 2: Remove arc-name-tag label chip styling**

In `styles.css`, find `.arc-name-tag` (line 20551) and replace with a deleted/empty rule so references don't cause layout issues. Simply remove `.arc-name-tag` and `.arc-act .arc-name-tag` declarations (there are ~3 rules). Also remove `.arc-act-select` rules (the act assignment dropdown on section rows is being replaced by context menu).

- [ ] **Step 3: Update ArcView column headers**

In `ArcView.tsx`, find the column headers block (line 349) and replace:

```tsx
<div className="arc-col-headers arc-grid">
  <div className="arc-col-h"></div>
  <div className="arc-col-h">Plot synopsis</div>
  <div className="arc-col-h">Beginning</div>
  <div className="arc-col-h">Ending</div>
  <div className="arc-col-h">Turning point</div>
  <div className="arc-col-h">Dilemma</div>
  <div className="arc-col-h">Propelling Action</div>
  <div className="arc-col-h arc-col-center">Polarity shift</div>
</div>
```

- [ ] **Step 4: Add new props to ArcView**

Update `ArcViewProps` to add:

```typescript
onSaveSceneArcFields: (sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string }) => void;
onSavePlotPointArcFields: (plotPointId: string, fields: Partial<Pick<PlotPoint, 'actId' | 'startingState' | 'endingState' | 'polarity' | 'transformation' | 'dilemma' | 'propellingAction' | 'title' | 'description'>>) => void;
onDeleteSection: (sectionId: string) => void;
```

Remove `onCreateScene` from props (scenes now created via bullpen, not from within the table). Keep `onCreateSection` for creating sections that go to bullpen.

Update destructuring in the function signature accordingly.

- [ ] **Step 5: Update `emptyPsych` to include novelDilemma**

```typescript
function emptyPsych(characterId: string): CharacterPsychology {
  return {
    characterId, novelStartingState: '', novelEndingState: '', novelPolarity: '', novelTransformation: '', novelDilemma: '', novelPropellingAction: '',
    wound: '', lie: '', deepestFear: '', limitingBelief: '', thorn: '', copingTool: '',
    whisperOfGrace: '', surfaceWant: '', soulsLonging: '', bitterNeed: '', capitalTTruth: '',
    arcSummary: '', theme: '', antiTheme: '', finalReaderExperience: '',
  };
}
```

- [ ] **Step 6: Update novel row — remove label chip, add dilemma cell**

Find the novel row (around line 372) and:
1. Remove the `<span className="arc-name-tag" ...>Novel</span>` element
2. Add a dilemma cell as the 5th column (between Ending and Polarity shift):

```tsx
{/* Novel row */}
<div className="arc-row arc-novel arc-grid">
  <div className="arc-name-cell" style={{ paddingLeft: 0 }}>
    <span className="arc-toggle" onClick={() => toggleCollapsed('novel')}>
      {isCollapsed('novel') ? '▶' : '▼'}
    </span>
    <div className="arc-name-inner">
      <span className="arc-novel-title">{character?.name || '—'}</span>
    </div>
  </div>
  <div className="arc-cell arc-cell-dim"></div>
  <div className="arc-cell">
    <EditableCell value={psych?.novelStartingState || ''} placeholder="Where does this character begin?"
      onChange={v => savePsych({ novelStartingState: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={psych?.novelEndingState || ''} placeholder="Where does this character end?"
      onChange={v => savePsych({ novelEndingState: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={psych?.novelTransformation || ''} placeholder="The full arc in one sentence..."
      onChange={v => savePsych({ novelTransformation: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={psych?.novelDilemma || ''} placeholder="The central dilemma..."
      onChange={v => savePsych({ novelDilemma: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={psych?.novelPropellingAction || ''} placeholder="What propels the story..."
      onChange={v => savePsych({ novelPropellingAction: v })} multiline />
  </div>
  <div className="arc-cell arc-pol-col">
    <PolarityCell value={psych?.novelPolarity || ''} onChange={v => savePsych({ novelPolarity: v })} />
  </div>
</div>
```

- [ ] **Step 7: Update `renderAct` — remove label chip, add dilemma cell**

In `renderAct`, remove the `<span className="arc-name-tag" ...>Act</span>` element. Add a dilemma cell as the 5th column (after the Ending cell):

```tsx
<div className="arc-cell">
  <EditableCell value={act.dilemma} placeholder="The act's dilemma..."
    onChange={v => onSaveAct({ ...act, dilemma: v })} multiline />
</div>
```

The act row's Synopsis column (currently `arc-cell-dim`) stays dim. The Beginning/Ending cells use `startingState`/`endingState`.

Full updated act row grid (7 cells):
```tsx
<div className="arc-row arc-act arc-grid">
  <div className="arc-name-cell" style={{ paddingLeft: 16 }}>
    <span className="arc-toggle" onClick={() => toggleCollapsed(`act-${act.id}`)}>
      {coll ? '▶' : '▼'}
    </span>
    <div className="arc-name-inner">
      <EditableCell value={act.name} placeholder="Act name..."
        onChange={v => onSaveAct({ ...act, name: v })} />
    </div>
  </div>
  <div className="arc-cell arc-cell-dim"></div>
  <div className="arc-cell">
    <EditableCell value={act.startingState} placeholder="Entering this act..."
      onChange={v => onSaveAct({ ...act, startingState: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={act.endingState} placeholder="Exiting this act..."
      onChange={v => onSaveAct({ ...act, endingState: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={act.transformation} placeholder="What this act accomplishes..."
      onChange={v => onSaveAct({ ...act, transformation: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={act.dilemma} placeholder="The act's dilemma..."
      onChange={v => onSaveAct({ ...act, dilemma: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={act.propellingAction || ''} placeholder="What propels this act..."
      onChange={v => onSaveAct({ ...act, propellingAction: v })} multiline />
  </div>
  <div className="arc-cell arc-pol-col">
    <PolarityCell value={act.polarity} onChange={v => onSaveAct({ ...act, polarity: v })} />
  </div>
</div>
```

- [ ] **Step 8: Update `renderSection` — remove label chip + act select, add dilemma, add context menu**

Add context menu state at the top of `ArcView`:
```typescript
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sectionId: string } | null>(null);
```

Add a close-on-outside-click effect:
```typescript
useEffect(() => {
  if (!contextMenu) return;
  const handler = () => setContextMenu(null);
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [contextMenu]);
```

Replace the section row content (remove `arc-name-tag` span and `arc-act-select`, add dilemma cell, add right-click handler):

```tsx
<div
  className="arc-row arc-section arc-grid"
  onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, sectionId: pp.id }); }}
>
  <div className="arc-name-cell" style={{ paddingLeft: 36 }}>
    <span className="arc-toggle" onClick={() => toggleCollapsed(`sec-${pp.id}`)}>
      {coll ? '▶' : '▼'}
    </span>
    <div className="arc-name-inner">
      <EditableCell value={pp.title} placeholder="Section name..."
        onChange={v => onSavePlotPointArcFields(pp.id, { title: v })} />
    </div>
  </div>
  <div className="arc-cell">
    <EditableCell value={pp.description || ''} placeholder="What happens..."
      onChange={v => onSavePlotPointArcFields(pp.id, { description: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={pp.startingState} placeholder="Entering state..."
      onChange={v => onSavePlotPointArcFields(pp.id, { startingState: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={pp.endingState} placeholder="Exiting state..."
      onChange={v => onSavePlotPointArcFields(pp.id, { endingState: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={pp.transformation} placeholder="What shifts..."
      onChange={v => onSavePlotPointArcFields(pp.id, { transformation: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={pp.dilemma || ''} placeholder="The section's dilemma..."
      onChange={v => onSavePlotPointArcFields(pp.id, { dilemma: v })} multiline />
  </div>
  <div className="arc-cell">
    <EditableCell value={pp.propellingAction || ''} placeholder="What propels this section..."
      onChange={v => onSavePlotPointArcFields(pp.id, { propellingAction: v })} multiline />
  </div>
  <div className="arc-cell arc-pol-col">
    <PolarityCell value={pp.polarity} onChange={v => onSavePlotPointArcFields(pp.id, { polarity: v })} />
  </div>
</div>
```

- [ ] **Step 9: Add context menu render in ArcView return**

Just before the closing `</div>` of `arc-view`, add:

```tsx
{contextMenu && (
  <ArcSectionContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    sectionId={contextMenu.sectionId}
    acts={sortedActs}
    onMoveToAct={(actId) => { onSavePlotPointArcFields(contextMenu.sectionId, { actId }); setContextMenu(null); }}
    onReturnToBullpen={() => { onSavePlotPointArcFields(contextMenu.sectionId, { actId: null }); setContextMenu(null); }}
    onDelete={() => { onDeleteSection(contextMenu.sectionId); setContextMenu(null); }}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 10: Update `renderSceneRow` — wire up arc field saves, add dilemma cell**

Replace the `PolarityCell` onChange no-op and add dilemma:

```tsx
const renderSceneRow = (scene: Scene, sectionId: string) => (
  <SortableItem key={scene.id} id={scene.id} data={{ type: 'arc-scene', sectionId }}>
    {({ setNodeRef, style, listeners, attributes, isDragging }) => (
      <div ref={setNodeRef} style={{ ...style, opacity: isDragging ? 0.3 : 1 }}
        className="arc-row arc-scene arc-grid arc-scene-draggable">
        <div className="arc-name-cell" style={{ paddingLeft: 52 }}>
          <span className="arc-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠿</span>
          <div className="arc-name-inner">
            <span className="arc-name-text">{sceneTitle(scene)}</span>
          </div>
        </div>
        <div className="arc-cell"><span className="arc-cell-text">{sceneSynopsis(scene)}</span></div>
        <div className="arc-cell arc-cell-dim"></div>
        <div className="arc-cell arc-cell-dim"></div>
        <div className="arc-cell">
          <EditableCell value={scene.transformation || ''} placeholder="Turning point..."
            onChange={v => onSaveSceneArcFields(scene.id, { transformation: v })} multiline />
        </div>
        <div className="arc-cell">
          <EditableCell value={scene.dilemma || ''} placeholder="Scene dilemma..."
            onChange={v => onSaveSceneArcFields(scene.id, { dilemma: v })} multiline />
        </div>
        <div className="arc-cell">
          <EditableCell value={scene.propellingAction || ''} placeholder="Propelling action..."
            onChange={v => onSaveSceneArcFields(scene.id, { propellingAction: v })} multiline />
        </div>
        <div className="arc-cell arc-pol-col">
          <PolarityCell value={scene.polarity || ''} onChange={v => onSaveSceneArcFields(scene.id, { polarity: v })} />
        </div>
      </div>
    )}
  </SortableItem>
);
```

- [ ] **Step 11: Remove the "Unassigned" bucket section**

Remove the entire "Unassigned sections" block from the render (it's now handled by the bullpen panel). Find the comment `{/* Unassigned sections */}` in the render and delete that entire `div` block along with its conditional.

Also remove the ghost rows for `+ Add scene...` inside `renderSection` since scenes are now created in the bullpen.

Keep the `+ Add act...` ghost row (acts are still created inline).

- [ ] **Step 12: Create `ArcSectionContextMenu` component inline in ArcView.tsx**

Add this component above the `ArcView` default export:

```typescript
function ArcSectionContextMenu({ x, y, sectionId: _sectionId, acts, onMoveToAct, onReturnToBullpen, onDelete, onClose }: {
  x: number; y: number; sectionId: string;
  acts: Act[];
  onMoveToAct: (actId: string) => void;
  onReturnToBullpen: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [showActSubmenu, setShowActSubmenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="arc-context-menu" style={{ left: x, top: y }}>
      <div className="arc-context-item" onMouseEnter={() => setShowActSubmenu(true)} onMouseLeave={() => setShowActSubmenu(false)}>
        Move to Act ▶
        {showActSubmenu && (
          <div className="arc-context-submenu">
            {acts.map(act => (
              <div key={act.id} className="arc-context-item" onClick={() => onMoveToAct(act.id)}>
                {act.name || 'Unnamed act'}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="arc-context-item" onClick={onReturnToBullpen}>Return to Bullpen</div>
      <div className="arc-context-divider" />
      <div className="arc-context-item arc-context-danger" onClick={onDelete}>Delete</div>
    </div>
  );
}
```

- [ ] **Step 13: Add context menu CSS to `styles.css`**

After the existing arc styles, add:

```css
.arc-context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  padding: 4px 0;
  min-width: 180px;
  font-family: var(--font-ui);
  font-size: 13px;
}
.arc-context-item {
  position: relative;
  padding: 7px 14px;
  cursor: pointer;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arc-context-item:hover { background: var(--bg-hover); }
.arc-context-danger { color: #dc2626; }
.arc-context-danger:hover { background: #fee2e2; }
.arc-context-divider { height: 1px; background: var(--border); margin: 4px 0; }
.arc-context-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  padding: 4px 0;
  min-width: 160px;
}
```

- [ ] **Step 14: Commit**

```bash
git add src/renderer/components/ArcView.tsx src/renderer/styles.css
git commit -m "feat: arc view 7-column reskin with dilemma, remove label chips, add section context menu"
```

---

## Task 4: ArcBullpenPanel component

**Files:**
- Create: `src/renderer/components/ArcBullpenPanel.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Create `ArcBullpenPanel.tsx`**

```typescript
import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Act, PlotPoint, Scene } from '../../shared/types';

function ArcBullpenContextMenu({ x, y, type, acts, sections, onAssignToAct, onAssignToSection, onDelete, onClose }: {
  x: number; y: number;
  type: 'section' | 'scene';
  acts: Act[];
  sections: PlotPoint[];
  onAssignToAct?: (actId: string) => void;
  onAssignToSection?: (sectionId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  const items = type === 'section' ? acts : sections;
  const label = type === 'section' ? 'Assign to Act ▶' : 'Assign to Section ▶';
  const onAssign = type === 'section' ? onAssignToAct! : onAssignToSection!;
  const itemLabel = (item: Act | PlotPoint) => type === 'section'
    ? (item as Act).name || 'Unnamed act'
    : (item as PlotPoint).title || 'Unnamed section';

  return (
    <div ref={ref} className="arc-context-menu" style={{ left: x, top: y }}>
      <div className="arc-context-item" onMouseEnter={() => setShowSubmenu(true)} onMouseLeave={() => setShowSubmenu(false)}>
        {label}
        {showSubmenu && (
          <div className="arc-context-submenu">
            {items.length === 0 && (
              <div className="arc-context-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
                No {type === 'section' ? 'acts' : 'sections'} yet
              </div>
            )}
            {items.map(item => (
              <div key={item.id} className="arc-context-item" onClick={() => onAssign(item.id)}>
                {itemLabel(item)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="arc-context-divider" />
      <div className="arc-context-item arc-context-danger" onClick={onDelete}>Delete</div>
    </div>
  );
}

function DraggableArcScene({ scene, onContextMenu }: {
  scene: Scene;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: scene.id });
  return (
    <div
      ref={setNodeRef}
      className="arc-bullpen-row"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onContextMenu={onContextMenu}
    >
      <span className="arc-bullpen-drag" {...attributes} {...listeners}>⠿</span>
      <span className="arc-bullpen-label">{scene.title || 'Untitled scene'}</span>
    </div>
  );
}

interface ArcBullpenPanelProps {
  acts: Act[];
  sections: PlotPoint[];  // ALL sections for this character (for assign submenu)
  bullpenSections: PlotPoint[];  // sections with actId === null
  bullpenScenes: Scene[];  // scenes with plotPointId === null
  onAssignSectionToAct: (sectionId: string, actId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onAssignSceneToSection: (sceneId: string, sectionId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onAddSection: () => void;
  onAddScene: () => void;
}

export default function ArcBullpenPanel({
  acts,
  sections,
  bullpenSections,
  bullpenScenes,
  onAssignSectionToAct,
  onDeleteSection,
  onAssignSceneToSection,
  onDeleteScene,
  onAddSection,
  onAddScene,
}: ArcBullpenPanelProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; type: 'section' | 'scene'; id: string;
  } | null>(null);

  const { setNodeRef, isOver } = useDroppable({ id: 'arc-bullpen' });

  const handleContextMenu = (e: React.MouseEvent, type: 'section' | 'scene', id: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  return (
    <div ref={setNodeRef} className={`arc-bullpen-panel ${isOver ? 'drag-over' : ''}`}>
      <div className="arc-bullpen-header">
        <span className="arc-bullpen-title">Bullpen</span>
      </div>

      {/* Sections group */}
      <div className="arc-bullpen-group">
        <div className="arc-bullpen-group-label">
          Sections
          <span className="arc-bullpen-count">{bullpenSections.length}</span>
        </div>
        {bullpenSections.map(section => (
          <div
            key={section.id}
            className="arc-bullpen-row arc-bullpen-section"
            onContextMenu={e => handleContextMenu(e, 'section', section.id)}
          >
            <span className="arc-bullpen-label">{section.title || 'Untitled section'}</span>
          </div>
        ))}
        <button className="arc-bullpen-add-btn" onClick={onAddSection}>+ Section</button>
      </div>

      {/* Scenes group */}
      <div className="arc-bullpen-group">
        <div className="arc-bullpen-group-label">
          Scenes
          <span className="arc-bullpen-count">{bullpenScenes.length}</span>
        </div>
        {bullpenScenes.map(scene => (
          <DraggableArcScene
            key={scene.id}
            scene={scene}
            onContextMenu={e => handleContextMenu(e, 'scene', scene.id)}
          />
        ))}
        <button className="arc-bullpen-add-btn" onClick={onAddScene}>+ Scene</button>
      </div>

      {contextMenu && (
        <ArcBullpenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          acts={acts}
          sections={sections.filter(s => s.actId !== null)}
          onAssignToAct={actId => { onAssignSectionToAct(contextMenu.id, actId); setContextMenu(null); }}
          onAssignToSection={sectionId => { onAssignSceneToSection(contextMenu.id, sectionId); setContextMenu(null); }}
          onDelete={() => {
            if (contextMenu.type === 'section') onDeleteSection(contextMenu.id);
            else onDeleteScene(contextMenu.id);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add arc bullpen CSS to `styles.css`**

After the existing arc context menu CSS, add:

```css
.arc-bullpen-panel {
  width: 220px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  font-family: var(--font-ui);
  background: var(--bg-primary);
}
.arc-bullpen-panel.drag-over {
  background: var(--bg-hover);
}
.arc-bullpen-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.arc-bullpen-title {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--text-muted);
}
.arc-bullpen-group {
  padding: 12px 0 4px;
  border-bottom: 1px solid var(--border);
}
.arc-bullpen-group-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--text-muted);
  padding: 0 16px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.arc-bullpen-count {
  background: var(--bg-hover);
  color: var(--text-muted);
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 600;
}
.arc-bullpen-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: default;
  border-radius: 4px;
  margin: 0 4px;
}
.arc-bullpen-row:hover { background: var(--bg-hover); }
.arc-bullpen-drag {
  color: var(--text-muted);
  cursor: grab;
  font-size: 12px;
  flex-shrink: 0;
}
.arc-bullpen-drag:active { cursor: grabbing; }
.arc-bullpen-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arc-bullpen-add-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 4px 16px 8px;
  padding: 5px 10px;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-ui);
}
.arc-bullpen-add-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ArcBullpenPanel.tsx src/renderer/styles.css
git commit -m "feat: add ArcBullpenPanel with section and scene staging groups"
```

---

## Task 5: App.tsx wiring

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add import for ArcBullpenPanel**

At the top of App.tsx, add (near other component imports):
```typescript
import ArcBullpenPanel from './components/ArcBullpenPanel';
```

- [ ] **Step 2: Update `handleSavePlotPointArcFields` to use direct IPC**

Replace the existing handler (line 1661) with one that calls the new direct service method instead of `saveCharacterOutline`:

```typescript
const handleSavePlotPointArcFields = useCallback(async (plotPointId: string, fields: Partial<Pick<PlotPoint, 'actId' | 'startingState' | 'endingState' | 'polarity' | 'transformation' | 'dilemma' | 'propellingAction' | 'title' | 'description'>>) => {
  if (!projectData) return;
  setProjectData(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      plotPoints: prev.plotPoints.map(pp => pp.id === plotPointId ? { ...pp, ...fields } : pp),
    };
  });
  try {
    await dataService.savePlotPointArcFields(plotPointId, fields);
  } catch {
    addToast('Couldn’t save section changes');
  }
}, [projectData]);
```

- [ ] **Step 3: Add `handleSaveSceneArcFields` handler**

After `handleSavePlotPointArcFields`, add:

```typescript
const handleSaveSceneArcFields = useCallback(async (sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string }) => {
  if (!projectData) return;
  setProjectData(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, ...fields } : s),
    };
  });
  try {
    await dataService.saveSceneArcFields(sceneId, fields);
  } catch {
    addToast('Couldn’t save scene changes');
  }
}, [projectData]);
```

- [ ] **Step 4: Update `handleCreateArcSection` to always go to bullpen**

Sections created from the arc view now always start unassigned (go to bullpen). Change the call signature — the function will no longer accept an actId from the table:

```typescript
const handleCreateArcSection = async () => {
  if (!projectData || !selectedCharacterId) return;
  const character = projectData.characters.find(c => c.id === selectedCharacterId);
  if (!character) return;
  const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === selectedCharacterId);
  const maxOrder = charPlotPoints.length > 0 ? Math.max(...charPlotPoints.map(p => p.order)) : -1;
  const newPlotPoint: PlotPoint = {
    id: Math.random().toString(36).substring(2, 11),
    characterId: selectedCharacterId,
    actId: null,
    title: 'New Section',
    expectedSceneCount: null,
    description: '',
    order: maxOrder + 1,
    startingState: '',
    endingState: '',
    polarity: '',
    transformation: '',
    dilemma: '',
    propellingAction: '',
  };
  const updatedPlotPoints = [...projectData.plotPoints, newPlotPoint];
  setProjectData({ ...projectData, plotPoints: updatedPlotPoints });
  const charScenes = projectData.scenes.filter(s => s.characterId === character.id);
  try {
    await dataService.saveCharacterOutline(character, updatedPlotPoints.filter(p => p.characterId === character.id), charScenes);
  } catch {
    addToast('Couldn’t save your changes');
  }
};
```

- [ ] **Step 5: Add `handleCreateArcBullpenScene` for scenes going to bullpen**

```typescript
const handleCreateArcBullpenScene = async () => {
  if (!projectData || !selectedCharacterId) return;
  const character = projectData.characters.find(c => c.id === selectedCharacterId);
  if (!character) return;
  const charScenes = projectData.scenes.filter(s => s.characterId === selectedCharacterId).sort((a, b) => a.sceneNumber - b.sceneNumber);
  const newScene: Scene = {
    id: Math.random().toString(36).substring(2, 11),
    characterId: selectedCharacterId,
    sceneNumber: charScenes.length + 1,
    title: 'New scene',
    content: 'New scene',
    tags: [character.name.toLowerCase().replace(/\s+/g, '_')],
    timelinePosition: null,
    isHighlighted: false,
    notes: [],
    plotPointId: null,
    chapterId: null,
    sceneOrder: 0,
    stationId: null,
    polarity: '',
    transformation: '',
    dilemma: '',
    propellingAction: '',
  };
  const updatedScenes = [...projectData.scenes, newScene];
  setProjectData({ ...projectData, scenes: updatedScenes });
  const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
  try {
    await dataService.saveCharacterOutline(character, charPlotPoints, updatedScenes.filter(s => s.characterId === selectedCharacterId));
    await saveTimelineData(updatedScenes, sceneConnections);
  } catch {
    addToast('Couldn’t save your changes');
  }
};
```

- [ ] **Step 6: Add `handleAssignSceneToSection` handler**

```typescript
const handleAssignSceneToSection = async (sceneId: string, sectionId: string) => {
  if (!projectData) return;
  setProjectData(prev => {
    if (!prev) return prev;
    return { ...prev, scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, plotPointId: sectionId } : s) };
  });
  try {
    await dataService.saveSceneArcFields(sceneId, {});
    // saveSceneArcFields doesn't handle plotPointId — use updateScene directly via a new approach
    // For now, re-save the full outline so the plotPointId update persists
    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (scene) {
      const character = projectData.characters.find(c => c.id === scene.characterId);
      const updatedScenes = projectData.scenes.map(s => s.id === sceneId ? { ...s, plotPointId: sectionId } : s);
      const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === scene.characterId);
      if (character) await dataService.saveCharacterOutline(character, charPlotPoints, updatedScenes.filter(s => s.characterId === scene.characterId));
    }
  } catch {
    addToast('Couldn’t assign scene');
  }
};
```

- [ ] **Step 7: Replace `BullpenPanel` with `ArcBullpenPanel` in arc layout**

Find the arc layout block (line 3610). Replace the `<BullpenPanel ... />` inside it with:

```tsx
<ArcBullpenPanel
  acts={acts.filter(a => a.characterId === selectedCharacterId)}
  sections={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId)}
  bullpenSections={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId && !pp.actId)}
  bullpenScenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId && !s.plotPointId)}
  onAssignSectionToAct={(sectionId, actId) => handleSavePlotPointArcFields(sectionId, { actId })}
  onDeleteSection={handleDeletePlotPoint}
  onAssignSceneToSection={handleAssignSceneToSection}
  onDeleteScene={(sceneId) => handleArchiveScene(sceneId)}
  onAddSection={handleCreateArcSection}
  onAddScene={handleCreateArcBullpenScene}
/>
```

- [ ] **Step 8: Update ArcView props in JSX**

In the `<ArcView ... />` call, add `onSaveSceneArcFields` and `onDeleteSection`, remove `onCreateScene`:

```tsx
<ArcView
  characters={projectData.characters}
  selectedCharacterId={selectedCharacterId}
  onSelectCharacter={setSelectedCharacterId}
  acts={acts.filter(a => a.characterId === selectedCharacterId)}
  plotPoints={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId)}
  scenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId)}
  characterColors={characterColors}
  psychology={characterPsychologies[selectedCharacterId] ?? null}
  onSaveAct={handleSaveAct}
  onDeleteAct={handleDeleteAct}
  onSavePlotPointArcFields={handleSavePlotPointArcFields}
  onSaveSceneArcFields={handleSaveSceneArcFields}
  onLoadPsychology={handleLoadCharacterPsychology}
  onSavePsychology={handleSaveCharacterPsychology}
  arcActiveId={arcActiveId}
  onCreateSection={handleCreateArcSection}
  onDeleteSection={handleDeletePlotPoint}
/>
```

- [ ] **Step 9: Update `handleSaveAct` to include dilemma**

Find `handleSaveAct` and make sure it passes the full `Act` object through (it currently does via `onSaveAct={handleSaveAct}`). Since `Act` now includes `dilemma`, the upsert will include it automatically. No code change needed — just verify the existing handler passes the full act object.

Also update the inline act creation in `ArcView.tsx` (the `+ Add act...` ghost row, line ~451) to include `dilemma: ''`:

```typescript
onSaveAct({
  id: randomId(), characterId: selectedCharacterId, name: '',
  startingState: '', endingState: '', polarity: '', transformation: '', dilemma: '', propellingAction: '',
  order: acts.length,
})
```

- [ ] **Step 10: Remove old BullpenPanel import if no longer used in arc layout**

Check if `BullpenPanel` is still used elsewhere in App.tsx (it is in the POV layout). Do NOT remove the import — it's still needed for POV view.

- [ ] **Step 11: Final commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire ArcBullpenPanel and arc field handlers into App.tsx"
```

---

## Validation

After all tasks complete, manually verify in the Electron app:

1. Open a project, navigate to Arc view
2. Confirm 7 columns: Name | Synopsis | Beginning | Ending | Dilemma | Polarity shift | Turning point
3. Confirm no colored "Novel"/"Act"/"Section" label chips visible
4. Right-click a section in the table → context menu appears with "Move to Act..." / "Return to Bullpen" / "Delete"
5. "Return to Bullpen" moves section to the right panel's Sections group
6. "Assign to Act..." in bullpen moves section into the table under that act
7. Click "+ Section" in bullpen → new section appears in bullpen Sections group (not in table)
8. Click "+ Scene" in bullpen → new scene appears in bullpen Scenes group
9. Drag a bullpen scene into a section slot in the table → scene appears under that section
10. Edit dilemma cell at novel, act, section, and scene levels → persists after reload
11. Edit polarity on a scene row → persists after reload (was previously a no-op)
