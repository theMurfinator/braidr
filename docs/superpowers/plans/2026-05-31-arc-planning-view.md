# Arc Planning View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Arc view to Braidr — a collapsible outline-table showing Novel → Acts → Sections → Scenes with transformation data (Starting State, Ending State, Polarity, Transformation) at every level, plus a Character Hub panel with Maass psychological fields.

**Architecture:** Two new SQLite tables (`acts`, `character_psychology`) plus arc field columns added to `plot_points` and `scenes` via `migrate()`. A new `'arc'` ViewMode renders `ArcView.tsx` — a fully editable, collapsible grid using the same 6-column layout at all levels. Character psychology is a slide-out panel within the Arc view. BullpenPanel reused as-is from the POV view.

**Tech Stack:** better-sqlite3, React, Electron IPC, existing dnd-kit infrastructure

---

## Context for implementers

- `src/main/database.ts` — `BraidrDB` class; new tables go in `CREATE_SCHEMA`; column additions go in `migrate()`; follow the exact patterns already there
- `src/main/braidrIpc.ts` — all IPC handlers; always use `getDb(braidrPath)`, never `new BraidrDB()`; never call `db.close()`
- `src/main/preload.ts` — exposes IPC to renderer via `contextBridge`
- `src/renderer/services/dataService.ts` — `DataService` interface + `ElectronDataService`; add new IPC channels to both
- `src/renderer/App.tsx` — ~4400 lines; `ViewMode` type at line 51; sidebar buttons around line 3615; character-scoped views follow the POV view pattern (character selector in toolbar)
- `src/shared/types.ts` — shared types and `IPC_CHANNELS` const (~line 382)
- `PlotPoint` interface: `{ id, characterId, title, expectedSceneCount, description, order }` — extend with arc fields + `actId`
- `Scene.content` maps from `synopsis` column in the DB (this is the scene text)

---

## File Map

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `Act`, `CharacterPsychology` interfaces; extend `PlotPoint`; add IPC channels |
| `src/main/database.ts` | Add `acts` + `character_psychology` tables; extend `plot_points` + `scenes` via `migrate()`; add CRUD methods |
| `src/main/braidrIpc.ts` | Add handlers for acts CRUD + character psychology CRUD |
| `src/main/preload.ts` | Expose new IPC channels |
| `src/renderer/services/dataService.ts` | Add methods to interface + ElectronDataService |
| `src/renderer/App.tsx` | Add `'arc'` to ViewMode; load acts/psychology on project open; add sidebar button; render ArcView |
| `src/renderer/components/ArcView.tsx` | **New** — collapsible outline-table: Novel → Acts → Sections → Scenes |
| `src/renderer/components/CharacterHubPanel.tsx` | **New** — slide-out panel with Maass psychological fields |

---

## Task 1: Types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add Act and CharacterPsychology interfaces**

After the `PlotPoint` interface (around line 243), add:

```typescript
export interface Act {
  id: string;
  characterId: string;
  name: string;
  startingState: string;
  endingState: string;
  polarity: string;
  transformation: string;
  order: number;
}

export interface CharacterPsychology {
  characterId: string;
  // Novel-level arc
  novelStartingState: string;
  novelEndingState: string;
  novelPolarity: string;
  novelTransformation: string;
  // Maass psychological fields
  wound: string;
  lie: string;
  deepestFear: string;
  limitingBelief: string;
  thorn: string;
  copingTool: string;
  whisperOfGrace: string;
  surfaceWant: string;
  soulsLonging: string;
  bitterNeed: string;
  capitalTTruth: string;
  arcSummary: string;
  theme: string;
  antiTheme: string;
  finalReaderExperience: string;
}
```

- [ ] **Step 2: Extend PlotPoint with arc fields and actId**

Replace the existing `PlotPoint` interface:

```typescript
export interface PlotPoint {
  id: string;
  characterId: string;
  actId: string | null;       // which act this section belongs to
  title: string;
  expectedSceneCount: number | null;
  description: string;
  order: number;
  startingState: string;
  endingState: string;
  polarity: string;
  transformation: string;
}
```

- [ ] **Step 3: Add IPC channel constants**

In `IPC_CHANNELS` (around line 382), add:

```typescript
  BRAIDR_LOAD_ACTS: 'braidr:load-acts',
  BRAIDR_SAVE_ACT: 'braidr:save-act',
  BRAIDR_DELETE_ACT: 'braidr:delete-act',
  BRAIDR_REORDER_ACTS: 'braidr:reorder-acts',
  BRAIDR_LOAD_CHARACTER_PSYCHOLOGY: 'braidr:load-character-psychology',
  BRAIDR_SAVE_CHARACTER_PSYCHOLOGY: 'braidr:save-character-psychology',
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "types.ts\|PlotPoint\|actId" | head -20
```

Expected: errors where `PlotPoint` is constructed without the new fields. Note them — they get fixed in the load/save paths in Tasks 2–3.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(arc): add Act, CharacterPsychology types; extend PlotPoint with arc fields"
```

---

## Task 2: Database schema and CRUD methods

**Files:**
- Modify: `src/main/database.ts`

- [ ] **Step 1: Add acts table to CREATE_SCHEMA**

Find `CREATE_SCHEMA`. Add after the `plot_points` table definition:

```sql
  CREATE TABLE IF NOT EXISTS acts (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    starting_state TEXT NOT NULL DEFAULT '',
    ending_state TEXT NOT NULL DEFAULT '',
    polarity TEXT NOT NULL DEFAULT '',
    transformation TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
```

- [ ] **Step 2: Add character_psychology table to CREATE_SCHEMA**

Add after the `acts` table:

```sql
  CREATE TABLE IF NOT EXISTS character_psychology (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    novel_starting_state TEXT NOT NULL DEFAULT '',
    novel_ending_state TEXT NOT NULL DEFAULT '',
    novel_polarity TEXT NOT NULL DEFAULT '',
    novel_transformation TEXT NOT NULL DEFAULT '',
    wound TEXT NOT NULL DEFAULT '',
    lie TEXT NOT NULL DEFAULT '',
    deepest_fear TEXT NOT NULL DEFAULT '',
    limiting_belief TEXT NOT NULL DEFAULT '',
    thorn TEXT NOT NULL DEFAULT '',
    coping_tool TEXT NOT NULL DEFAULT '',
    whisper_of_grace TEXT NOT NULL DEFAULT '',
    surface_want TEXT NOT NULL DEFAULT '',
    souls_longing TEXT NOT NULL DEFAULT '',
    bitter_need TEXT NOT NULL DEFAULT '',
    capital_t_truth TEXT NOT NULL DEFAULT '',
    arc_summary TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT '',
    anti_theme TEXT NOT NULL DEFAULT '',
    final_reader_experience TEXT NOT NULL DEFAULT ''
  );
```

- [ ] **Step 3: Extend plot_points and scenes via migrate()**

In the `migrate()` method (around line 338), add after the existing `scene_order` migration:

```typescript
// Arc fields on plot_points
const ppColumns = (
  this.db.prepare('PRAGMA table_info(plot_points)').all() as { name: string }[]
).map(c => c.name);
if (!ppColumns.includes('act_id')) {
  this.db.exec('ALTER TABLE plot_points ADD COLUMN act_id TEXT REFERENCES acts(id) ON DELETE SET NULL');
}
if (!ppColumns.includes('starting_state')) {
  this.db.exec("ALTER TABLE plot_points ADD COLUMN starting_state TEXT NOT NULL DEFAULT ''");
}
if (!ppColumns.includes('ending_state')) {
  this.db.exec("ALTER TABLE plot_points ADD COLUMN ending_state TEXT NOT NULL DEFAULT ''");
}
if (!ppColumns.includes('polarity')) {
  this.db.exec("ALTER TABLE plot_points ADD COLUMN polarity TEXT NOT NULL DEFAULT ''");
}
if (!ppColumns.includes('transformation')) {
  this.db.exec("ALTER TABLE plot_points ADD COLUMN transformation TEXT NOT NULL DEFAULT ''");
}

// Arc fields on scenes
const sceneColumns = (
  this.db.prepare('PRAGMA table_info(scenes)').all() as { name: string }[]
).map(c => c.name);
if (!sceneColumns.includes('polarity')) {
  this.db.exec("ALTER TABLE scenes ADD COLUMN polarity TEXT NOT NULL DEFAULT ''");
}
if (!sceneColumns.includes('transformation')) {
  this.db.exec("ALTER TABLE scenes ADD COLUMN transformation TEXT NOT NULL DEFAULT ''");
}
```

Note: `sceneColumns` is already fetched at the top of `migrate()` — reuse it rather than fetching again.

- [ ] **Step 4: Update PlotPointRow interface**

Find `export interface PlotPointRow` (around line 960). Replace:

```typescript
export interface PlotPointRow {
  id: string; character_id: string; title: string; description: string | null;
  expected_scene_count: number | null; display_order: number; created_at: number;
  act_id: string | null;
  starting_state: string; ending_state: string; polarity: string; transformation: string;
}
```

- [ ] **Step 5: Add ActRow and CharacterPsychologyRow interfaces**

Near the other row interfaces at the bottom of `database.ts`:

```typescript
export interface ActRow {
  id: string; character_id: string; name: string;
  starting_state: string; ending_state: string; polarity: string; transformation: string;
  display_order: number; created_at: number;
}

export interface CharacterPsychologyRow {
  character_id: string;
  novel_starting_state: string; novel_ending_state: string; novel_polarity: string; novel_transformation: string;
  wound: string; lie: string; deepest_fear: string; limiting_belief: string;
  thorn: string; coping_tool: string; whisper_of_grace: string; surface_want: string;
  souls_longing: string; bitter_need: string; capital_t_truth: string;
  arc_summary: string; theme: string; anti_theme: string; final_reader_experience: string;
}
```

- [ ] **Step 6: Add CRUD methods**

After the existing `// ── Table Views` section, add:

```typescript
// ── Acts ─────────────────────────────────────────────────────────────────────

getActs(characterId: string): ActRow[] {
  return this.db.prepare('SELECT * FROM acts WHERE character_id = ? ORDER BY display_order').all(characterId) as ActRow[];
}

getAllActs(): ActRow[] {
  return this.db.prepare('SELECT * FROM acts ORDER BY character_id, display_order').all() as ActRow[];
}

upsertAct(row: ActRow) {
  this.db.prepare(`
    INSERT INTO acts (id, character_id, name, starting_state, ending_state, polarity, transformation, display_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, starting_state = excluded.starting_state,
      ending_state = excluded.ending_state, polarity = excluded.polarity,
      transformation = excluded.transformation, display_order = excluded.display_order
  `).run(row.id, row.character_id, row.name, row.starting_state, row.ending_state, row.polarity, row.transformation, row.display_order, row.created_at);
}

deleteAct(id: string) {
  this.db.prepare('DELETE FROM acts WHERE id = ?').run(id);
}

reorderActs(characterId: string, orderedIds: string[]) {
  const update = this.db.prepare('UPDATE acts SET display_order = ? WHERE id = ?');
  orderedIds.forEach((id, i) => update.run(i, id));
}

// ── Character Psychology ──────────────────────────────────────────────────────

getCharacterPsychology(characterId: string): CharacterPsychologyRow | undefined {
  return this.db.prepare('SELECT * FROM character_psychology WHERE character_id = ?').get(characterId) as CharacterPsychologyRow | undefined;
}

upsertCharacterPsychology(row: CharacterPsychologyRow) {
  this.db.prepare(`
    INSERT INTO character_psychology (character_id, novel_starting_state, novel_ending_state, novel_polarity, novel_transformation, wound, lie, deepest_fear, limiting_belief, thorn, coping_tool, whisper_of_grace, surface_want, souls_longing, bitter_need, capital_t_truth, arc_summary, theme, anti_theme, final_reader_experience)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(character_id) DO UPDATE SET
      novel_starting_state = excluded.novel_starting_state, novel_ending_state = excluded.novel_ending_state,
      novel_polarity = excluded.novel_polarity, novel_transformation = excluded.novel_transformation,
      wound = excluded.wound, lie = excluded.lie, deepest_fear = excluded.deepest_fear,
      limiting_belief = excluded.limiting_belief, thorn = excluded.thorn, coping_tool = excluded.coping_tool,
      whisper_of_grace = excluded.whisper_of_grace, surface_want = excluded.surface_want,
      souls_longing = excluded.souls_longing, bitter_need = excluded.bitter_need,
      capital_t_truth = excluded.capital_t_truth, arc_summary = excluded.arc_summary,
      theme = excluded.theme, anti_theme = excluded.anti_theme,
      final_reader_experience = excluded.final_reader_experience
  `).run(
    row.character_id, row.novel_starting_state, row.novel_ending_state, row.novel_polarity, row.novel_transformation,
    row.wound, row.lie, row.deepest_fear, row.limiting_belief, row.thorn, row.coping_tool,
    row.whisper_of_grace, row.surface_want, row.souls_longing, row.bitter_need,
    row.capital_t_truth, row.arc_summary, row.theme, row.anti_theme, row.final_reader_experience
  );
}
```

- [ ] **Step 7: Update insertPlotPoint and updatePlotPoint to include new fields**

Find `insertPlotPoint` (line ~448). Replace with:

```typescript
insertPlotPoint(id: string, characterId: string, title: string, description: string | null, expectedSceneCount: number | null, displayOrder: number, actId: string | null = null) {
  this.db.prepare(`
    INSERT INTO plot_points (id, character_id, title, description, expected_scene_count, display_order, act_id, starting_state, ending_state, polarity, transformation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', '', ?)
  `).run(id, characterId, title, description, expectedSceneCount, displayOrder, actId, Date.now());
}

updatePlotPoint(id: string, fields: Partial<{ title: string; description: string | null; expectedSceneCount: number | null; displayOrder: number; actId: string | null; startingState: string; endingState: string; polarity: string; transformation: string }>) {
  const updates: string[] = [];
  const values: unknown[] = [];
  if ('title' in fields)             { updates.push('title = ?');              values.push(fields.title); }
  if ('description' in fields)       { updates.push('description = ?');        values.push(fields.description); }
  if ('expectedSceneCount' in fields){ updates.push('expected_scene_count = ?'); values.push(fields.expectedSceneCount); }
  if ('displayOrder' in fields)      { updates.push('display_order = ?');      values.push(fields.displayOrder); }
  if ('actId' in fields)             { updates.push('act_id = ?');             values.push(fields.actId); }
  if ('startingState' in fields)     { updates.push('starting_state = ?');     values.push(fields.startingState); }
  if ('endingState' in fields)       { updates.push('ending_state = ?');       values.push(fields.endingState); }
  if ('polarity' in fields)          { updates.push('polarity = ?');           values.push(fields.polarity); }
  if ('transformation' in fields)    { updates.push('transformation = ?');     values.push(fields.transformation); }
  if (updates.length === 0) return;
  values.push(id);
  this.db.prepare(`UPDATE plot_points SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}
```

- [ ] **Step 8: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "database.ts" | head -20
```

Expected: no errors from database.ts.

- [ ] **Step 9: Commit**

```bash
git add src/main/database.ts
git commit -m "feat(arc): add acts + character_psychology tables, extend plot_points/scenes with arc fields"
```

---

## Task 3: IPC handlers + preload + dataService

**Files:**
- Modify: `src/main/braidrIpc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/services/dataService.ts`

- [ ] **Step 1: Add IPC handlers in braidrIpc.ts**

Find the `BRAIDR_GET_CHAPTERS` handler area. Add:

```typescript
// ── Acts ──────────────────────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_ACTS, (_event, braidrPath: string, characterId: string) => {
  try {
    const db = getDb(braidrPath);
    return { success: true, data: db.getActs(characterId) };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_ACT, (_event, braidrPath: string, act: import('./database').ActRow) => {
  try {
    const db = getDb(braidrPath);
    db.upsertAct(act);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_DELETE_ACT, (_event, braidrPath: string, actId: string) => {
  try {
    const db = getDb(braidrPath);
    db.deleteAct(actId);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_REORDER_ACTS, (_event, braidrPath: string, characterId: string, orderedIds: string[]) => {
  try {
    const db = getDb(braidrPath);
    db.reorderActs(characterId, orderedIds);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

// ── Character Psychology ───────────────────────────────────────────────────────

ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_CHARACTER_PSYCHOLOGY, (_event, braidrPath: string, characterId: string) => {
  try {
    const db = getDb(braidrPath);
    return { success: true, data: db.getCharacterPsychology(characterId) ?? null };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER_PSYCHOLOGY, (_event, braidrPath: string, row: import('./database').CharacterPsychologyRow) => {
  try {
    const db = getDb(braidrPath);
    db.upsertCharacterPsychology(row);
    db.checkpoint();
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});
```

Also update the `BRAIDR_LOAD_PROJECT` handler: after loading plot points, include `acts` and `character_psychology` in the returned payload:

```typescript
// In BRAIDR_LOAD_PROJECT, after loading plot points:
const allActs = db.getAllActs();
const acts: Act[] = allActs.map(r => ({
  id: r.id, characterId: r.character_id, name: r.name,
  startingState: r.starting_state, endingState: r.ending_state,
  polarity: r.polarity, transformation: r.transformation, order: r.display_order,
}));
// Include in return payload: acts
```

Also update the plot point mapping in `BRAIDR_LOAD_PROJECT` to include the new fields:

```typescript
// In the plot point mapping (find where PlotPointRow is mapped to PlotPoint):
{
  id: pp.id, characterId: pp.character_id, title: pp.title,
  description: pp.description ?? '', expectedSceneCount: pp.expected_scene_count,
  order: pp.display_order,
  actId: pp.act_id ?? null,
  startingState: pp.starting_state ?? '',
  endingState: pp.ending_state ?? '',
  polarity: pp.polarity ?? '',
  transformation: pp.transformation ?? '',
}
```

- [ ] **Step 2: Expose in preload.ts**

Find the chapter-related block. Add:

```typescript
braidrLoadActs: (braidrPath: string, characterId: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_ACTS, braidrPath, characterId),
braidrSaveAct: (braidrPath: string, act: unknown) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_ACT, braidrPath, act),
braidrDeleteAct: (braidrPath: string, actId: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_DELETE_ACT, braidrPath, actId),
braidrReorderActs: (braidrPath: string, characterId: string, orderedIds: string[]) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_REORDER_ACTS, braidrPath, characterId, orderedIds),
braidrLoadCharacterPsychology: (braidrPath: string, characterId: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_CHARACTER_PSYCHOLOGY, braidrPath, characterId),
braidrSaveCharacterPsychology: (braidrPath: string, row: unknown) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER_PSYCHOLOGY, braidrPath, row),
```

Also add these 6 methods to `assets.d.ts` (the `Window.electronAPI` type declaration).

- [ ] **Step 3: Add to dataService**

Add to the `DataService` interface:

```typescript
loadActs(characterId: string): Promise<Act[]>;
saveAct(act: Act): Promise<void>;
deleteAct(actId: string): Promise<void>;
reorderActs(characterId: string, orderedIds: string[]): Promise<void>;
loadCharacterPsychology(characterId: string): Promise<CharacterPsychology | null>;
saveCharacterPsychology(psychology: CharacterPsychology): Promise<void>;
```

Add implementations in `ElectronDataService`:

```typescript
async loadActs(characterId: string): Promise<Act[]> {
  if (!this.braidrPath) return [];
  const result = await window.electronAPI.braidrLoadActs(this.braidrPath, characterId);
  if (!result?.success || !result.data) return [];
  return (result.data as any[]).map(r => ({
    id: r.id, characterId: r.character_id, name: r.name,
    startingState: r.starting_state, endingState: r.ending_state,
    polarity: r.polarity, transformation: r.transformation, order: r.display_order,
  }));
}

async saveAct(act: Act): Promise<void> {
  if (!this.braidrPath) return;
  await window.electronAPI.braidrSaveAct(this.braidrPath, {
    id: act.id, character_id: act.characterId, name: act.name,
    starting_state: act.startingState, ending_state: act.endingState,
    polarity: act.polarity, transformation: act.transformation,
    display_order: act.order, created_at: Date.now(),
  });
}

async deleteAct(actId: string): Promise<void> {
  if (!this.braidrPath) return;
  await window.electronAPI.braidrDeleteAct(this.braidrPath, actId);
}

async reorderActs(characterId: string, orderedIds: string[]): Promise<void> {
  if (!this.braidrPath) return;
  await window.electronAPI.braidrReorderActs(this.braidrPath, characterId, orderedIds);
}

async loadCharacterPsychology(characterId: string): Promise<CharacterPsychology | null> {
  if (!this.braidrPath) return null;
  const result = await window.electronAPI.braidrLoadCharacterPsychology(this.braidrPath, characterId);
  if (!result?.success || !result.data) return null;
  const r = result.data as any;
  return {
    characterId: r.character_id,
    novelStartingState: r.novel_starting_state, novelEndingState: r.novel_ending_state,
    novelPolarity: r.novel_polarity, novelTransformation: r.novel_transformation,
    wound: r.wound, lie: r.lie, deepestFear: r.deepest_fear,
    limitingBelief: r.limiting_belief, thorn: r.thorn, copingTool: r.coping_tool,
    whisperOfGrace: r.whisper_of_grace, surfaceWant: r.surface_want,
    soulsLonging: r.souls_longing, bitterNeed: r.bitter_need,
    capitalTTruth: r.capital_t_truth, arcSummary: r.arc_summary,
    theme: r.theme, antiTheme: r.anti_theme, finalReaderExperience: r.final_reader_experience,
  };
}

async saveCharacterPsychology(p: CharacterPsychology): Promise<void> {
  if (!this.braidrPath) return;
  await window.electronAPI.braidrSaveCharacterPsychology(this.braidrPath, {
    character_id: p.characterId,
    novel_starting_state: p.novelStartingState, novel_ending_state: p.novelEndingState,
    novel_polarity: p.novelPolarity, novel_transformation: p.novelTransformation,
    wound: p.wound, lie: p.lie, deepest_fear: p.deepestFear,
    limiting_belief: p.limitingBelief, thorn: p.thorn, coping_tool: p.copingTool,
    whisper_of_grace: p.whisperOfGrace, surface_want: p.surfaceWant,
    souls_longing: p.soulsLonging, bitter_need: p.bitterNeed,
    capital_t_truth: p.capitalTTruth, arc_summary: p.arcSummary,
    theme: p.theme, anti_theme: p.antiTheme, final_reader_experience: p.finalReaderExperience,
  });
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -E "braidrIpc|preload|dataService" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/main/braidrIpc.ts src/main/preload.ts src/renderer/services/dataService.ts src/renderer/assets.d.ts
git commit -m "feat(arc): add IPC handlers and dataService methods for acts and character psychology"
```

---

## Task 4: Wire App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add 'arc' to ViewMode and load state**

Find `type ViewMode` (line 51). Add `'arc'`:

```typescript
type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'tasks' | 'timeline' | 'analytics' | 'account' | 'arc';
```

Near the `tableViews` state, add:

```typescript
const [acts, setActs] = useState<Act[]>([]);
const [characterPsychologies, setCharacterPsychologies] = useState<Record<string, CharacterPsychology>>({});
```

Import `Act` and `CharacterPsychology` from `../../shared/types`.

- [ ] **Step 2: Load acts on project open**

In the same effect that loads `tableViews`, also load acts from the payload returned by `BRAIDR_LOAD_PROJECT`:

```typescript
if (result.data.acts) setActs(result.data.acts);
```

- [ ] **Step 3: Add save/update callbacks**

```typescript
const handleSaveAct = useCallback(async (act: Act) => {
  setActs(prev => {
    const idx = prev.findIndex(a => a.id === act.id);
    return idx >= 0 ? prev.map(a => a.id === act.id ? act : a) : [...prev, act];
  });
  await dataService.saveAct(act);
}, []);

const handleDeleteAct = useCallback(async (actId: string) => {
  setActs(prev => prev.filter(a => a.id !== actId));
  // Unassign sections belonging to this act
  if (projectData) {
    const updatedPlotPoints = projectData.plotPoints.map(pp =>
      pp.actId === actId ? { ...pp, actId: null } : pp
    );
    setProjectData({ ...projectData, plotPoints: updatedPlotPoints });
  }
  await dataService.deleteAct(actId);
}, [projectData]);

const handleSavePlotPointArcFields = useCallback(async (plotPointId: string, fields: Partial<Pick<PlotPoint, 'actId' | 'startingState' | 'endingState' | 'polarity' | 'transformation'>>) => {
  if (!projectData) return;
  const updatedPlotPoints = projectData.plotPoints.map(pp =>
    pp.id === plotPointId ? { ...pp, ...fields } : pp
  );
  const updatedData = { ...projectData, plotPoints: updatedPlotPoints };
  setProjectData(updatedData);
  // Save via BRAIDR_SAVE_CHARACTER (which already saves plot points)
  const char = projectData.characters.find(c => updatedPlotPoints.some(pp => pp.id === plotPointId && pp.characterId === c.id));
  if (char) {
    await dataService.saveCharacter(char, updatedPlotPoints.filter(pp => pp.characterId === char.id), projectData.scenes.filter(s => s.characterId === char.id));
  }
}, [projectData]);

const handleSaveCharacterPsychology = useCallback(async (psychology: CharacterPsychology) => {
  setCharacterPsychologies(prev => ({ ...prev, [psychology.characterId]: psychology }));
  await dataService.saveCharacterPsychology(psychology);
}, []);

const handleLoadCharacterPsychology = useCallback(async (characterId: string): Promise<CharacterPsychology | null> => {
  if (characterPsychologies[characterId]) return characterPsychologies[characterId];
  const p = await dataService.loadCharacterPsychology(characterId);
  if (p) setCharacterPsychologies(prev => ({ ...prev, [characterId]: p }));
  return p;
}, [characterPsychologies]);
```

- [ ] **Step 4: Add sidebar button for Arc view**

Find the POV sidebar button (around line 3615). Add an Arc button before it:

```tsx
<button
  className={`app-sidebar-btn ${viewMode === 'arc' ? 'active' : ''}`}
  onClick={() => setViewMode('arc')}
  title="Arc Planning"
  aria-label="Arc view"
>
  <span className="app-sidebar-icon">◈</span>
  <span className="app-sidebar-label">Arc</span>
</button>
```

- [ ] **Step 5: Render ArcView**

Find where `viewMode === 'pov'` renders the POV view (around line 3310). Add an `arc` branch:

```tsx
{viewMode === 'arc' && projectData && (
  <ArcView
    characters={projectData.characters}
    selectedCharacterId={selectedCharacterId}
    onSelectCharacter={setSelectedCharacterId}
    acts={acts.filter(a => a.characterId === selectedCharacterId)}
    plotPoints={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId)}
    scenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId)}
    characterColors={characterColors}
    psychology={selectedCharacterId ? characterPsychologies[selectedCharacterId] ?? null : null}
    onSaveAct={handleSaveAct}
    onDeleteAct={handleDeleteAct}
    onSavePlotPointArcFields={handleSavePlotPointArcFields}
    onLoadPsychology={handleLoadCharacterPsychology}
    onSavePsychology={handleSaveCharacterPsychology}
  />
)}
```

Import `ArcView` at the top:
```typescript
import ArcView from './components/ArcView';
```

- [ ] **Step 6: Add character selector in toolbar for arc mode**

The arc view is character-scoped (same as POV). Find the POV character selector in the toolbar (around line 3695) — it's inside `{viewMode === 'pov' && ...}`. Extend the condition to also show when `viewMode === 'arc'`:

```tsx
{(viewMode === 'pov' || viewMode === 'arc') ? (
  <div className="character-selector">
    <select value={selectedCharacterId || ''} onChange={e => setSelectedCharacterId(e.target.value)}>
      {projectData.characters.map(char => (
        <option key={char.id} value={char.id}>{char.name}</option>
      ))}
    </select>
  </div>
) : (
  <h1>{projectData.projectName || 'Braidr'}</h1>
)}
```

- [ ] **Step 7: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "App.tsx" | head -20
```

TypeScript will complain about `ArcView` props not matching yet — that's resolved in Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(arc): add arc ViewMode, wire acts/psychology state, sidebar button, ArcView render"
```

---

## Task 5: ArcView component

**Files:**
- Create: `src/renderer/components/ArcView.tsx`

This is the main Arc view — the collapsible outline-table with 6 columns: Name | Synopsis | Starting State | Ending State | Polarity | Transformation. It renders the 4-level hierarchy: Novel → Acts → Sections (plot points) → Scenes.

- [ ] **Step 1: Create the file**

```bash
touch /Users/brian/braidr/src/renderer/components/ArcView.tsx
```

- [ ] **Step 2: Write the component**

```typescript
import { useState, useCallback, useRef } from 'react';
import { Character, Act, PlotPoint, Scene, CharacterPsychology } from '../../shared/types';
import CharacterHubPanel from './CharacterHubPanel';

const POLARITY_OPTIONS = ['+/-', '-/+', '-/-', '+/+', '+/-/+'];
const POLARITY_COLORS: Record<string, { bg: string; color: string }> = {
  '+/-':   { bg: '#fee2e2', color: '#b91c1c' },
  '-/+':   { bg: '#ede9fe', color: '#6d28d9' },
  '-/-':   { bg: '#fecaca', color: '#7f1d1d' },
  '+/+':   { bg: '#d1fae5', color: '#065f46' },
  '+/-/+': { bg: '#fef9c3', color: '#854d0e' },
};

function randomId() { return Math.random().toString(36).slice(2, 10); }

interface ArcViewProps {
  characters: Character[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string) => void;
  acts: Act[];
  plotPoints: PlotPoint[];
  scenes: Scene[];
  characterColors: Record<string, string>;
  psychology: CharacterPsychology | null;
  onSaveAct: (act: Act) => void;
  onDeleteAct: (actId: string) => void;
  onSavePlotPointArcFields: (plotPointId: string, fields: Partial<Pick<PlotPoint, 'actId' | 'startingState' | 'endingState' | 'polarity' | 'transformation'>>) => void;
  onLoadPsychology: (characterId: string) => Promise<CharacterPsychology | null>;
  onSavePsychology: (psychology: CharacterPsychology) => void;
}

// Inline editable text cell
function EditableCell({ value, placeholder, onChange, multiline = false }: {
  value: string; placeholder: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  if (editing) {
    const props = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setDraft(e.target.value),
      onBlur: () => { setEditing(false); if (draft !== value) onChange(draft); },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        if (e.key === 'Enter' && !e.shiftKey && !multiline) { setEditing(false); if (draft !== value) onChange(draft); }
      },
      autoFocus: true,
      style: { width: '100%', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: '1.5', background: 'transparent', border: 'none', borderBottom: '1.5px solid var(--accent)', outline: 'none', resize: 'none' as const, padding: '2px 0' },
    };
    return multiline
      ? <textarea {...props} ref={ref as React.RefObject<HTMLTextAreaElement>} rows={3} />
      : <input {...props as any} ref={ref as React.RefObject<HTMLInputElement>} />;
  }

  return (
    <span
      onClick={() => { setEditing(true); setDraft(value); }}
      style={{ cursor: 'text', display: 'block', minHeight: '20px', lineHeight: '1.5', color: value ? 'inherit' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic' }}
    >
      {value || placeholder}
    </span>
  );
}

// Polarity picker cell
function PolarityCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const style = POLARITY_COLORS[value] ?? { bg: 'transparent', color: 'var(--text-muted)' };
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <span
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-block', padding: '3px 9px', borderRadius: '5px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 800, background: style.bg, color: style.color,
          border: value ? 'none' : '1px dashed var(--border)',
        }}
      >
        {value || '—'}
      </span>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'white', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.1)', padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '80px' }}>
          {POLARITY_OPTIONS.map(opt => {
            const s = POLARITY_COLORS[opt];
            return (
              <span key={opt} onClick={() => { onChange(opt); setOpen(false); }} style={{ padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, background: s.bg, color: s.color, textAlign: 'center' }}>
                {opt}
              </span>
            );
          })}
          <span onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>clear</span>
        </div>
      )}
    </div>
  );
}

export default function ArcView({
  characters,
  selectedCharacterId,
  acts,
  plotPoints,
  scenes,
  characterColors,
  psychology,
  onSaveAct,
  onDeleteAct,
  onSavePlotPointArcFields,
  onLoadPsychology,
  onSavePsychology,
}: ArcViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showHub, setShowHub] = useState(false);

  const character = characters.find(c => c.id === selectedCharacterId);
  const charColor = selectedCharacterId ? (characterColors[selectedCharacterId] || '#6366f1') : '#6366f1';

  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isCollapsed = (id: string) => collapsed.has(id);

  // Novel-level psychology (from CharacterPsychology)
  const psych = psychology;

  const sortedActs = [...acts].sort((a, b) => a.order - b.order);
  const unassignedSections = plotPoints.filter(pp => !pp.actId).sort((a, b) => a.order - b.order);

  const renderSceneRow = (scene: Scene) => {
    const synopsis = scene.content.replace(/<[^>]*>/g, '').replace(/==\*\*/g, '').replace(/\*\*==/g, '').trim().slice(0, 120);
    return (
      <div key={scene.id} className="arc-row arc-scene">
        <div className="arc-name-cell arc-scene-indent">
          <span className="arc-toggle arc-toggle-placeholder">·</span>
          <span className="arc-name-text">{scene.content.replace(/<[^>]*>/g, '').replace(/==\*\*/g, '').replace(/\*\*==/g, '').trim().slice(0, 80) || 'Untitled'}</span>
        </div>
        <div className="arc-cell"><span className="arc-cell-text">{synopsis}</span></div>
        <div className="arc-cell arc-cell-dim"></div>
        <div className="arc-cell arc-cell-dim"></div>
        <div className="arc-cell arc-pol-cell">
          <PolarityCell value={(scene as any).polarity || ''} onChange={() => {}} />
        </div>
        <div className="arc-cell"><span className="arc-cell-text">{(scene as any).transformation || ''}</span></div>
      </div>
    );
  };

  const renderSection = (pp: PlotPoint) => {
    const sectionScenes = scenes.filter(s => s.plotPointId === pp.id).sort((a, b) => a.sceneNumber - b.sceneNumber);
    const coll = isCollapsed(`section-${pp.id}`);
    return (
      <div key={pp.id}>
        <div className="arc-row arc-section">
          <div className="arc-name-cell arc-section-indent">
            <span className="arc-toggle" onClick={() => toggleCollapsed(`section-${pp.id}`)}>{coll ? '▶' : '▼'}</span>
            <div className="arc-name-inner">
              <span className="arc-name-tag" style={{ color: charColor }}>Section</span>
              <EditableCell value={pp.title} placeholder="Section name..." onChange={v => onSavePlotPointArcFields(pp.id, { title: v } as any)} />
            </div>
          </div>
          <div className="arc-cell"><EditableCell value={pp.description || ''} placeholder="What happens..." onChange={v => onSavePlotPointArcFields(pp.id, { description: v } as any)} multiline /></div>
          <div className="arc-cell"><EditableCell value={pp.startingState} placeholder="Entering state..." onChange={v => onSavePlotPointArcFields(pp.id, { startingState: v })} multiline /></div>
          <div className="arc-cell"><EditableCell value={pp.endingState} placeholder="Exiting state..." onChange={v => onSavePlotPointArcFields(pp.id, { endingState: v })} multiline /></div>
          <div className="arc-cell arc-pol-cell"><PolarityCell value={pp.polarity} onChange={v => onSavePlotPointArcFields(pp.id, { polarity: v })} /></div>
          <div className="arc-cell"><EditableCell value={pp.transformation} placeholder="What shifts..." onChange={v => onSavePlotPointArcFields(pp.id, { transformation: v })} multiline /></div>
        </div>
        {!coll && sectionScenes.map(renderSceneRow)}
        {!coll && (
          <div className="arc-row arc-ghost arc-scene-indent" style={{ opacity: .4 }}>
            <div className="arc-name-cell"><span className="arc-toggle arc-toggle-placeholder">·</span><span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>+ Add scene...</span></div>
            <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
            <div className="arc-cell arc-pol-cell"></div><div className="arc-cell"></div>
          </div>
        )}
      </div>
    );
  };

  const renderAct = (act: Act) => {
    const actSections = plotPoints.filter(pp => pp.actId === act.id).sort((a, b) => a.order - b.order);
    const coll = isCollapsed(`act-${act.id}`);
    return (
      <div key={act.id}>
        <div className="arc-row arc-act">
          <div className="arc-name-cell arc-act-indent">
            <span className="arc-toggle" onClick={() => toggleCollapsed(`act-${act.id}`)}>{coll ? '▶' : '▼'}</span>
            <div className="arc-name-inner">
              <span className="arc-name-tag" style={{ color: '#7c3aed' }}>Act</span>
              <EditableCell value={act.name} placeholder="Act name..." onChange={v => onSaveAct({ ...act, name: v })} />
            </div>
          </div>
          <div className="arc-cell arc-cell-dim"></div>
          <div className="arc-cell"><EditableCell value={act.startingState} placeholder="Entering this act..." onChange={v => onSaveAct({ ...act, startingState: v })} multiline /></div>
          <div className="arc-cell"><EditableCell value={act.endingState} placeholder="Exiting this act..." onChange={v => onSaveAct({ ...act, endingState: v })} multiline /></div>
          <div className="arc-cell arc-pol-cell"><PolarityCell value={act.polarity} onChange={v => onSaveAct({ ...act, polarity: v })} /></div>
          <div className="arc-cell"><EditableCell value={act.transformation} placeholder="What this act accomplishes..." onChange={v => onSaveAct({ ...act, transformation: v })} multiline /></div>
        </div>
        {!coll && actSections.map(pp => renderSection(pp))}
        {!coll && (
          <div className="arc-row arc-ghost arc-section-indent" style={{ opacity: .35, cursor: 'pointer' }}>
            <div className="arc-name-cell"><span className="arc-toggle arc-toggle-placeholder">+</span><span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>+ Add section...</span></div>
            <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
            <div className="arc-cell arc-pol-cell"></div><div className="arc-cell"></div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="arc-view">

      {/* Column headers */}
      <div className="arc-col-headers arc-grid">
        <div className="arc-col-h"></div>
        <div className="arc-col-h">Synopsis</div>
        <div className="arc-col-h">Starting State</div>
        <div className="arc-col-h">Ending State</div>
        <div className="arc-col-h arc-col-center">Polarity</div>
        <div className="arc-col-h">Transformation</div>
      </div>

      <div className="arc-scroll">

        {/* Novel row */}
        <div className="arc-row arc-novel arc-grid">
          <div className="arc-name-cell">
            <span className="arc-toggle" onClick={() => toggleCollapsed('novel')}>
              {isCollapsed('novel') ? '▶' : '▼'}
            </span>
            <div className="arc-name-inner">
              <span className="arc-name-tag" style={{ color: charColor }}>Novel</span>
              <span className="arc-name-title">{character?.name || '—'}</span>
            </div>
          </div>
          <div className="arc-cell"></div>
          <div className="arc-cell">
            <EditableCell
              value={psych?.novelStartingState || ''}
              placeholder="Where does he begin?"
              onChange={v => onSavePsychology({ ...(psych || emptyPsych(selectedCharacterId!)), novelStartingState: v })}
              multiline
            />
          </div>
          <div className="arc-cell">
            <EditableCell
              value={psych?.novelEndingState || ''}
              placeholder="Where does he end?"
              onChange={v => onSavePsychology({ ...(psych || emptyPsych(selectedCharacterId!)), novelEndingState: v })}
              multiline
            />
          </div>
          <div className="arc-cell arc-pol-cell">
            <PolarityCell
              value={psych?.novelPolarity || ''}
              onChange={v => onSavePsychology({ ...(psych || emptyPsych(selectedCharacterId!)), novelPolarity: v })}
            />
          </div>
          <div className="arc-cell">
            <EditableCell
              value={psych?.novelTransformation || ''}
              placeholder="The full arc in one sentence..."
              onChange={v => onSavePsychology({ ...(psych || emptyPsych(selectedCharacterId!)), novelTransformation: v })}
              multiline
            />
          </div>
        </div>

        {/* Acts + sections + scenes */}
        {!isCollapsed('novel') && (
          <>
            {sortedActs.map(renderAct)}

            {/* Unassigned sections */}
            {unassignedSections.length > 0 && (
              <div>
                <div className="arc-row arc-act arc-grid" style={{ opacity: .6 }}>
                  <div className="arc-name-cell arc-act-indent">
                    <span className="arc-toggle" onClick={() => toggleCollapsed('unassigned')}>{isCollapsed('unassigned') ? '▶' : '▼'}</span>
                    <div className="arc-name-inner">
                      <span className="arc-name-tag" style={{ color: '#aaa' }}>Unassigned</span>
                      <span style={{ fontSize: 13, color: '#aaa' }}>Sections not in an act</span>
                    </div>
                  </div>
                  <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
                  <div className="arc-cell arc-pol-cell"></div><div className="arc-cell"></div>
                </div>
                {!isCollapsed('unassigned') && unassignedSections.map(pp => renderSection(pp))}
              </div>
            )}

            {/* Add act ghost */}
            <div className="arc-row arc-ghost arc-act-indent arc-grid" style={{ opacity: .3, cursor: 'pointer' }}
              onClick={() => onSaveAct({ id: randomId(), characterId: selectedCharacterId!, name: '', startingState: '', endingState: '', polarity: '', transformation: '', order: acts.length })}>
              <div className="arc-name-cell">
                <span className="arc-toggle arc-toggle-placeholder">+</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>+ Add act...</span>
              </div>
              <div className="arc-cell"></div><div className="arc-cell"></div><div className="arc-cell"></div>
              <div className="arc-cell arc-pol-cell"></div><div className="arc-cell"></div>
            </div>
          </>
        )}

      </div>

      {/* Character Hub button */}
      <button className="arc-hub-btn" onClick={() => { onLoadPsychology(selectedCharacterId!); setShowHub(true); }}>
        Character Hub
      </button>

      {/* Character Hub panel */}
      {showHub && psychology !== undefined && (
        <CharacterHubPanel
          characterName={character?.name || ''}
          characterColor={charColor}
          psychology={psych}
          onSave={p => onSavePsychology(p)}
          onClose={() => setShowHub(false)}
          selectedCharacterId={selectedCharacterId!}
        />
      )}
    </div>
  );
}

function emptyPsych(characterId: string): CharacterPsychology {
  return {
    characterId, novelStartingState: '', novelEndingState: '', novelPolarity: '', novelTransformation: '',
    wound: '', lie: '', deepestFear: '', limitingBelief: '', thorn: '', copingTool: '',
    whisperOfGrace: '', surfaceWant: '', soulsLonging: '', bitterNeed: '', capitalTTruth: '',
    arcSummary: '', theme: '', antiTheme: '', finalReaderExperience: '',
  };
}
```

- [ ] **Step 3: Add ArcView CSS**

Find the main CSS file and append:

```bash
find /Users/brian/braidr/src -name "*.css" | xargs grep -l "table-view\|pov-view" | head -3
```

Add to that file:

```css
/* ── Arc View ── */
.arc-view {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg-primary); position: relative;
}

.arc-grid {
  display: grid;
  grid-template-columns: 220px 1fr 1fr 1fr 72px 1fr;
}

.arc-col-headers {
  position: sticky; top: 0; z-index: 10;
  background: var(--bg-primary); border-bottom: 2px solid var(--text-primary);
  padding: 14px 0 8px; flex-shrink: 0;
}
.arc-col-headers.arc-grid > div {
  font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .1em; color: var(--text-muted); padding-right: 14px;
}
.arc-col-h.arc-col-center { text-align: center; }

.arc-scroll { flex: 1; overflow-y: auto; padding-bottom: 80px; }

.arc-row {
  border-bottom: 1px solid var(--border);
  transition: background .1s;
}
.arc-row.arc-grid > * {
  padding: 10px 14px 10px 0;
  display: flex; flex-direction: column; justify-content: flex-start;
  align-items: flex-start; font-size: 12px; color: var(--text-secondary);
}
.arc-row:hover { background: var(--bg-hover); }
.arc-novel { border-bottom: 2px solid var(--border) !important; }
.arc-act { border-bottom-color: var(--border); }

.arc-name-cell {
  flex-direction: row !important; align-items: flex-start !important;
  gap: 0; padding-left: 0 !important;
}
.arc-toggle {
  width: 16px; font-size: 9px; color: var(--text-muted); cursor: pointer;
  flex-shrink: 0; padding-top: 3px; text-align: center; user-select: none;
  transition: color .1s;
}
.arc-toggle:hover { color: var(--accent); }
.arc-toggle-placeholder { cursor: default; }
.arc-toggle-placeholder:hover { color: var(--text-muted); }

.arc-name-inner { display: flex; flex-direction: column; gap: 2px; flex: 1; padding: 2px 14px 2px 4px; }
.arc-name-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 1px; }
.arc-name-text { font-size: 13px; font-weight: 400; color: var(--text-secondary); }
.arc-name-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }

.arc-novel .arc-name-title { font-size: 15px; font-weight: 700; }
.arc-act .arc-name-text { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.arc-section .arc-name-text { font-size: 13px; font-weight: 600; }
.arc-scene .arc-name-text { font-size: 13px; font-weight: 400; color: var(--text-secondary); }

/* Indentation */
.arc-act-indent .arc-name-cell { padding-left: 16px !important; }
.arc-section-indent .arc-name-cell { padding-left: 32px !important; }
.arc-scene-indent .arc-name-cell { padding-left: 48px !important; }

/* Apply indents to grid rows */
.arc-act > .arc-name-cell { padding-left: 16px; }
.arc-section > .arc-name-cell { padding-left: 32px; }
.arc-scene > .arc-name-cell { padding-left: 48px; }

.arc-cell { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
.arc-cell-dim { opacity: .3; }
.arc-cell-text { font-size: 12px; color: var(--text-muted); }
.arc-pol-cell { justify-content: center !important; align-items: center !important; padding-right: 0 !important; }

.arc-ghost { opacity: .4; cursor: pointer; border-bottom: none; }
.arc-ghost:hover { opacity: 1 !important; background: var(--bg-hover); }

/* Character Hub button */
.arc-hub-btn {
  position: absolute; bottom: 20px; right: 24px;
  padding: 8px 16px; background: var(--accent); color: white;
  border: none; border-radius: 8px; font-size: 12px; font-weight: 600;
  font-family: var(--font-ui); cursor: pointer; box-shadow: 0 2px 8px rgba(99,102,241,.3);
}
.arc-hub-btn:hover { background: #5558e8; }
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "ArcView" | head -20
```

Expected: error about `CharacterHubPanel` not existing (resolved in Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ArcView.tsx src/renderer/styles.css
git commit -m "feat(arc): add ArcView component — collapsible outline-table with inline editing"
```

---

## Task 6: CharacterHubPanel component

**Files:**
- Create: `src/renderer/components/CharacterHubPanel.tsx`

This is the slide-out panel (right side, same pattern as TablePovSlideover) showing all Maass psychological fields for a character.

- [ ] **Step 1: Create the file**

```bash
touch /Users/brian/braidr/src/renderer/components/CharacterHubPanel.tsx
```

- [ ] **Step 2: Write the component**

```typescript
import { useState, useRef } from 'react';
import { CharacterPsychology } from '../../shared/types';

const FIELDS: Array<{ key: keyof CharacterPsychology; label: string; sublabel: string; color: string }> = [
  { key: 'wound',                label: 'Wound',                sublabel: 'The deep hurt that is the source of the negative worldview', color: '#ef4444' },
  { key: 'lie',                  label: 'Lie',                  sublabel: 'The limiting belief keeping the character from the truth', color: '#f97316' },
  { key: 'deepestFear',          label: 'Deepest Fear',         sublabel: 'The known or unknown terrible fear the character carries', color: '#a855f7' },
  { key: 'limitingBelief',       label: 'Limiting Belief',      sublabel: 'The packaged result of the wound, lie, and deepest fear', color: '#ec4899' },
  { key: 'thorn',                label: 'Thorn',                sublabel: 'A visceral reminder that the surface want will never heal the wound', color: '#6366f1' },
  { key: 'copingTool',           label: 'Coping Tool',          sublabel: 'The main tool the character uses to blunt the pain of the thorn', color: '#14b8a6' },
  { key: 'whisperOfGrace',       label: 'Whisper of Grace',     sublabel: 'The small voice of God calling the character toward truth', color: '#22c55e' },
  { key: 'surfaceWant',          label: 'Surface Want',         sublabel: 'Known. Doing today. Producing internal pain but external comfort.', color: '#f97316' },
  { key: 'soulsLonging',        label: "Soul's Longing",        sublabel: 'Wildly compelling. Opposite of the surface want.', color: '#6366f1' },
  { key: 'bitterNeed',           label: 'Bitter Need',          sublabel: 'Something the character must learn or do. The cost of the core want.', color: '#ec4899' },
  { key: 'capitalTTruth',        label: 'Capital-T Truth',      sublabel: 'The awareness the character needs to step into the soul\'s longing', color: '#22c55e' },
  { key: 'arcSummary',           label: 'Arc Summary',          sublabel: "One sentence: what is this character's arc?", color: '#6366f1' },
  { key: 'theme',                label: 'Theme',                sublabel: "The story's statement of truth", color: '#6366f1' },
  { key: 'antiTheme',            label: 'Anti-theme',           sublabel: 'The lie the story disproves', color: '#ef4444' },
  { key: 'finalReaderExperience',label: 'Final Reader Experience', sublabel: 'What does the reader feel on the last page?', color: '#22c55e' },
];

function emptyPsych(characterId: string): CharacterPsychology {
  return {
    characterId, novelStartingState: '', novelEndingState: '', novelPolarity: '', novelTransformation: '',
    wound: '', lie: '', deepestFear: '', limitingBelief: '', thorn: '', copingTool: '',
    whisperOfGrace: '', surfaceWant: '', soulsLonging: '', bitterNeed: '', capitalTTruth: '',
    arcSummary: '', theme: '', antiTheme: '', finalReaderExperience: '',
  };
}

interface CharacterHubPanelProps {
  characterName: string;
  characterColor: string;
  psychology: CharacterPsychology | null;
  selectedCharacterId: string;
  onSave: (p: CharacterPsychology) => void;
  onClose: () => void;
}

export default function CharacterHubPanel({ characterName, characterColor, psychology, selectedCharacterId, onSave, onClose }: CharacterHubPanelProps) {
  const [local, setLocal] = useState<CharacterPsychology>(psychology || emptyPsych(selectedCharacterId));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateField = (key: keyof CharacterPsychology, value: string) => {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(updated), 800);
  };

  return (
    <div className="hub-overlay" onClick={onClose}>
      <div className="hub-panel" onClick={e => e.stopPropagation()}>
        <div className="hub-panel-header">
          <span className="hub-char-dot" style={{ background: characterColor }} />
          <span className="hub-panel-title">{characterName} — Character Hub</span>
          <button className="hub-panel-close" onClick={onClose}>×</button>
        </div>
        <div className="hub-panel-body">
          {FIELDS.map(({ key, label, sublabel, color }) => (
            <div key={key} className="hub-field">
              <div className="hub-field-label" style={{ color }}>{label}</div>
              <div className="hub-field-sub">{sublabel}</div>
              <textarea
                className="hub-field-input"
                value={local[key] as string}
                onChange={e => updateField(key, e.target.value)}
                placeholder={`${label}...`}
                rows={2}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add CharacterHubPanel CSS**

Append to `styles.css`:

```css
/* ── Character Hub Panel ── */
.hub-overlay {
  position: fixed; inset: 0; z-index: 200; background: transparent;
}
.hub-panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: 360px;
  background: var(--bg-primary); border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,.1); z-index: 201;
}
.hub-panel-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
  font-family: var(--font-ui); font-size: 13px; font-weight: 600; flex-shrink: 0;
}
.hub-char-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.hub-panel-title { flex: 1; color: var(--text-primary); }
.hub-panel-close {
  background: none; border: none; font-size: 20px; cursor: pointer;
  color: var(--text-muted); padding: 2px 6px; border-radius: 4px;
}
.hub-panel-close:hover { background: var(--bg-hover); }
.hub-panel-body {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 16px;
}
.hub-field { display: flex; flex-direction: column; gap: 3px; }
.hub-field-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.hub-field-sub { font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-bottom: 4px; }
.hub-field-input {
  font-family: var(--font-ui); font-size: 13px; line-height: 1.55;
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 7px; padding: 8px 10px; color: var(--text-primary);
  resize: none; outline: none; width: 100%; transition: border-color .15s;
}
.hub-field-input:focus { border-color: var(--accent); }
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -E "ArcView|CharacterHub" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/CharacterHubPanel.tsx src/renderer/styles.css
git commit -m "feat(arc): add CharacterHubPanel slide-out with Maass psychological fields"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| `acts` SQLite table | Task 2 |
| `character_psychology` SQLite table | Task 2 |
| Extend `plot_points` with arc fields + actId | Task 2 |
| Extend `scenes` with polarity + transformation | Task 2 |
| Full IPC stack for acts + psychology | Task 3 |
| Load acts on project open | Task 4 |
| `'arc'` ViewMode + sidebar button | Task 4 |
| Character selector in toolbar for arc mode | Task 4 |
| ArcView — 6-column grid, all levels | Task 5 |
| Novel row — editable starting/ending/polarity/transformation | Task 5 |
| Act rows — collapsible, editable | Task 5 |
| Section rows — collapsible, editable arc fields | Task 5 |
| Scene rows — synopsis from content, polarity picker | Task 5 |
| Ghost "Add act / Add section / Add scene" rows | Task 5 |
| Unassigned sections bucket | Task 5 |
| Character Hub button → CharacterHubPanel | Tasks 5+6 |
| CharacterHubPanel with all Maass fields, 800ms autosave | Task 6 |

**Placeholder scan:** None found.

**Type consistency:**
- `Act.order` → `display_order` in DB row → `r.display_order` in dataService mapping — consistent
- `CharacterPsychology.soulsLonging` → `souls_longing` in DB → `r.souls_longing` in dataService — consistent
- `onSavePlotPointArcFields(plotPointId, fields)` — signature matches App.tsx Task 4 and ArcView Task 5
- `emptyPsych(characterId)` defined in both ArcView and CharacterHubPanel — acceptable since it's a small factory function and the two files are independent
