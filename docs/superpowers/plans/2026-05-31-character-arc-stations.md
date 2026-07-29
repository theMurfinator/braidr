# Character Arc & Transformation Stations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-character transformation layer — arc endpoints (starting/ending interior state) and ordered stations (key interior shifts) — that scenes can be assigned to, with gap/orphan detection visible in the Table View.

**Architecture:** Two new SQLite tables (`character_arcs`, `arc_stations`) plus a `station_id` FK column on `scenes`. A new `ArcEditorModal` lets writers define arcs and stations per character. The Table View gains a `Station` column (dropdown per scene) and a `groupBy='station'` mode showing stations as row-group headers with empty-station and unassigned-scene callouts. This plan depends on the table view overhaul plan completing first (it adds `'station'` to the existing `groupBy` union type).

**Tech Stack:** better-sqlite3, dnd-kit (sortable), React, Electron IPC

---

## File Map

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `ArcStation`, `CharacterArc` interfaces; add `stationId` to `Scene`; add 4 IPC channel constants |
| `src/main/database.ts` | Add `character_arcs` + `arc_stations` tables; add `station_id` to scenes via `migrate()`; add CRUD methods; update `SceneRow` |
| `src/main/braidrIpc.ts` | Add handlers: load arcs, save arc, save stations, assign scene station |
| `src/main/preload.ts` | Expose 4 new IPC methods |
| `src/renderer/services/dataService.ts` | Add 4 new methods to interface + `ElectronDataService` |
| `src/renderer/App.tsx` | Load arcs + stations on project open; pass to TableView; add save callbacks |
| `src/renderer/components/ArcEditorModal.tsx` | **New** – modal for editing a character's arc endpoints and ordered stations |
| `src/renderer/components/TableView.tsx` | Add `Station` column; add `groupBy='station'` render mode with gap/orphan callouts; add Arc Editor button to toolbar |

---

## Task 1: Types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add ArcStation and CharacterArc types**

In `src/shared/types.ts`, after the `Scene` interface (around line 24), add:

```typescript
export interface ArcStation {
  id: string;
  characterId: string;
  orderNum: number;
  title: string;
  belief: string;        // what the character believes/feels at this point
  readerFeel: string;    // target reader experience
  nextBreak: string;     // what must break/move to reach the next station
  color: string;         // hex color for visual identification in table
  createdAt: number;
}

export interface CharacterArc {
  id: string;
  characterId: string;
  startingState: string;   // interior state at story start
  endingState: string;     // interior state at story end
}
```

- [ ] **Step 2: Add stationId to Scene**

In `src/shared/types.ts`, update the `Scene` interface to add one field after `wordCount`:

```typescript
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
  chapterId: string | null;
  sceneOrder: number;
  wordCount?: number;
  stationId: string | null;  // which arc station this scene serves; null = unassigned
}
```

- [ ] **Step 3: Add IPC channel constants**

In the `IPC_CHANNELS` const (around line 382), add four entries near the other `BRAIDR_` channels:

```typescript
  BRAIDR_LOAD_CHARACTER_ARC: 'braidr:load-character-arc',
  BRAIDR_SAVE_CHARACTER_ARC: 'braidr:save-character-arc',
  BRAIDR_SAVE_ARC_STATIONS: 'braidr:save-arc-stations',
  BRAIDR_ASSIGN_SCENE_STATION: 'braidr:assign-scene-station',
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "types.ts" | head -20
```

Expected: errors about `stationId` missing from scene construction sites (we fix those in Task 3). No errors from types.ts itself.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(arc): add ArcStation, CharacterArc types, stationId on Scene, 4 IPC channels"
```

---

## Task 2: Database schema + CRUD

**Files:**
- Modify: `src/main/database.ts`

- [ ] **Step 1: Add tables to CREATE_SCHEMA**

In `database.ts`, find `CREATE_SCHEMA` (the large template literal). Add these two tables after `table_views` (or before `archived_scenes` — anywhere that doesn't violate FK order):

```sql
  CREATE TABLE IF NOT EXISTS character_arcs (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    starting_state TEXT NOT NULL DEFAULT '',
    ending_state TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS arc_stations (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    order_num INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    belief TEXT NOT NULL DEFAULT '',
    reader_feel TEXT NOT NULL DEFAULT '',
    next_break TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#9e9e9e',
    created_at INTEGER NOT NULL
  );
```

- [ ] **Step 2: Add station_id to scenes via migrate()**

In the `migrate()` method (around line 338), add after the existing `scene_order` migration:

```typescript
if (!sceneColumns.includes('station_id')) {
  this.db.exec(
    'ALTER TABLE scenes ADD COLUMN station_id TEXT REFERENCES arc_stations(id) ON DELETE SET NULL'
  );
}
```

- [ ] **Step 3: Update SceneRow interface**

Find `export interface SceneRow` (around line 943). Add `station_id` after `scene_order`:

```typescript
export interface SceneRow {
  id: string; character_id: string; plot_point_id: string | null;
  title: string; synopsis: string; scene_number: number;
  timeline_position: number | null; is_highlighted: number; word_count: number | null;
  chapter_id: string | null; scene_order: number; station_id: string | null;
  created_at: number; updated_at: number
}
```

- [ ] **Step 4: Add row interfaces for arcs and stations**

Near the other row interfaces at the bottom of `database.ts` (around line 960):

```typescript
export interface CharacterArcRow { id: string; character_id: string; starting_state: string; ending_state: string; created_at: number }
export interface ArcStationRow { id: string; character_id: string; order_num: number; title: string; belief: string; reader_feel: string; next_break: string; color: string; created_at: number }
```

- [ ] **Step 5: Add database CRUD methods**

After the `// ── Table Views ───────────────────────────────────────────────────────────` section, add:

```typescript
// ── Character Arcs ───────────────────────────────────────────────────────────

getCharacterArc(characterId: string): CharacterArcRow | undefined {
  return this.db.prepare('SELECT * FROM character_arcs WHERE character_id = ?').get(characterId) as CharacterArcRow | undefined;
}

upsertCharacterArc(row: CharacterArcRow) {
  this.db.prepare(`
    INSERT INTO character_arcs (id, character_id, starting_state, ending_state, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET starting_state = excluded.starting_state, ending_state = excluded.ending_state
  `).run(row.id, row.character_id, row.starting_state, row.ending_state, row.created_at);
}

getArcStations(characterId: string): ArcStationRow[] {
  return this.db.prepare('SELECT * FROM arc_stations WHERE character_id = ? ORDER BY order_num').all(characterId) as ArcStationRow[];
}

getAllArcStations(): ArcStationRow[] {
  return this.db.prepare('SELECT * FROM arc_stations ORDER BY character_id, order_num').all() as ArcStationRow[];
}

replaceArcStations(characterId: string, stations: ArcStationRow[]) {
  this.db.prepare('DELETE FROM arc_stations WHERE character_id = ?').run(characterId);
  const insert = this.db.prepare(`
    INSERT INTO arc_stations (id, character_id, order_num, title, belief, reader_feel, next_break, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of stations) {
    insert.run(s.id, s.character_id, s.order_num, s.title, s.belief, s.reader_feel, s.next_break, s.color, s.created_at);
  }
}

assignSceneStation(sceneId: string, stationId: string | null) {
  this.db.prepare('UPDATE scenes SET station_id = ?, updated_at = ? WHERE id = ?').run(stationId, Date.now(), sceneId);
}
```

- [ ] **Step 6: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "database.ts" | head -20
```

Expected: no errors from database.ts.

- [ ] **Step 7: Commit**

```bash
git add src/main/database.ts
git commit -m "feat(arc): add character_arcs + arc_stations tables, station_id on scenes, CRUD methods"
```

---

## Task 3: Propagate stationId through scene load/save

**Files:**
- Modify: `src/main/braidrIpc.ts`

The `BRAIDR_LOAD_PROJECT` handler already reads scenes via `SELECT * FROM scenes` and maps rows to `Scene` objects. We need to include `station_id` in that mapping, and the `updateScene` method in database.ts needs to support `stationId`.

- [ ] **Step 1: Add stationId to updateScene in database.ts**

Find `updateScene` (around line 475). Add `stationId` to the `Partial<>` type and the update block:

```typescript
updateScene(id: string, fields: Partial<{ title: string; synopsis: string; sceneNumber: number; timelinePosition: number | null; isHighlighted: boolean; wordCount: number | null; plotPointId: string | null; chapterId: string | null; sceneOrder: number; stationId: string | null }>) {
  const updates: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];
  if ('title' in fields) { updates.push('title = ?'); values.push(fields.title); }
  if ('synopsis' in fields) { updates.push('synopsis = ?'); values.push(fields.synopsis); }
  if ('sceneNumber' in fields) { updates.push('scene_number = ?'); values.push(fields.sceneNumber); }
  if ('timelinePosition' in fields) { updates.push('timeline_position = ?'); values.push(fields.timelinePosition); }
  if ('isHighlighted' in fields) { updates.push('is_highlighted = ?'); values.push(fields.isHighlighted ? 1 : 0); }
  if ('wordCount' in fields) { updates.push('word_count = ?'); values.push(fields.wordCount); }
  if ('plotPointId' in fields) { updates.push('plot_point_id = ?'); values.push(fields.plotPointId); }
  if ('chapterId' in fields) { updates.push('chapter_id = ?'); values.push(fields.chapterId); }
  if ('sceneOrder' in fields) { updates.push('scene_order = ?'); values.push(fields.sceneOrder); }
  if ('stationId' in fields) { updates.push('station_id = ?'); values.push(fields.stationId); }
  values.push(id);
  this.db.prepare(`UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}
```

- [ ] **Step 2: Map station_id in the project load handler**

In `braidrIpc.ts`, find the `BRAIDR_LOAD_PROJECT` handler (around line 63) where scene rows are mapped to `Scene` objects. Find the mapping that reads `row.chapter_id` and `row.scene_order`, and add `stationId`:

```typescript
// Find the scene mapping block (it maps SceneRow → Scene). Add stationId:
stationId: row.station_id ?? null,
```

Also load all arc stations for the project so they can be passed in the load result. Find where the load handler assembles its return payload and add:

```typescript
const arcStationRows = db.getAllArcStations();
const arcStations: ArcStation[] = arcStationRows.map(r => ({
  id: r.id,
  characterId: r.character_id,
  orderNum: r.order_num,
  title: r.title,
  belief: r.belief,
  readerFeel: r.reader_feel,
  nextBreak: r.next_break,
  color: r.color,
  createdAt: r.created_at,
}));

// Also load character arcs (endpoints)
const characterArcRows = db.prepare('SELECT * FROM character_arcs').all() as import('./database').CharacterArcRow[];
const characterArcs: CharacterArc[] = characterArcRows.map(r => ({
  id: r.id,
  characterId: r.character_id,
  startingState: r.starting_state,
  endingState: r.ending_state,
}));
```

Include both in the returned payload:
```typescript
// In the return object of BRAIDR_LOAD_PROJECT:
arcStations,
characterArcs,
```

The `ArcStation` and `CharacterArc` imports come from `../../shared/types` — add them to the import at top of braidrIpc.ts if not already there.

- [ ] **Step 3: Fix stationId: null for scene construction sites**

Run the build to find all places where a `Scene` object is constructed without `stationId`:

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "stationId\|station_id" | head -20
```

For each construction site (likely in App.tsx where new scenes are created — search for `const newScene: Scene = {`), add `stationId: null`.

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/database.ts src/main/braidrIpc.ts
git commit -m "feat(arc): load station_id with scenes, include arcStations + characterArcs in project load"
```

---

## Task 4: IPC handlers + preload + dataService

**Files:**
- Modify: `src/main/braidrIpc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/services/dataService.ts`

- [ ] **Step 1: Add IPC handlers in braidrIpc.ts**

Add four handlers near the chapter handlers (around line 1022):

```typescript
ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_CHARACTER_ARC, (_event, braidrPath: string, characterId: string) => {
  try {
    const db = getDb(braidrPath);
    const arcRow = db.getCharacterArc(characterId);
    const stationRows = db.getArcStations(characterId);
    const arc: CharacterArc | null = arcRow ? {
      id: arcRow.id,
      characterId: arcRow.character_id,
      startingState: arcRow.starting_state,
      endingState: arcRow.ending_state,
    } : null;
    const stations: ArcStation[] = stationRows.map(r => ({
      id: r.id, characterId: r.character_id, orderNum: r.order_num, title: r.title,
      belief: r.belief, readerFeel: r.reader_feel, nextBreak: r.next_break,
      color: r.color, createdAt: r.created_at,
    }));
    return { success: true, data: { arc, stations } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER_ARC, (_event, braidrPath: string, arc: CharacterArc) => {
  try {
    const db = getDb(braidrPath);
    db.upsertCharacterArc({
      id: arc.id,
      character_id: arc.characterId,
      starting_state: arc.startingState,
      ending_state: arc.endingState,
      created_at: Date.now(),
    });
    db.checkpoint();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_ARC_STATIONS, (_event, braidrPath: string, characterId: string, stations: ArcStation[]) => {
  try {
    const db = getDb(braidrPath);
    db.replaceArcStations(characterId, stations.map((s, i) => ({
      id: s.id, character_id: s.characterId, order_num: i,
      title: s.title, belief: s.belief, reader_feel: s.readerFeel,
      next_break: s.nextBreak, color: s.color, created_at: s.createdAt,
    })));
    db.checkpoint();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_ASSIGN_SCENE_STATION, (_event, braidrPath: string, sceneId: string, stationId: string | null) => {
  try {
    const db = getDb(braidrPath);
    db.assignSceneStation(sceneId, stationId);
    db.checkpoint();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
```

- [ ] **Step 2: Expose in preload.ts**

Find the block where BRAIDR chapters are exposed (search for `braidrGetChapters`). Add four entries:

```typescript
braidrLoadCharacterArc: (braidrPath: string, characterId: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_CHARACTER_ARC, braidrPath, characterId),
braidrSaveCharacterArc: (braidrPath: string, arc: unknown) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_CHARACTER_ARC, braidrPath, arc),
braidrSaveArcStations: (braidrPath: string, characterId: string, stations: unknown[]) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_ARC_STATIONS, braidrPath, characterId, stations),
braidrAssignSceneStation: (braidrPath: string, sceneId: string, stationId: string | null) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_ASSIGN_SCENE_STATION, braidrPath, sceneId, stationId),
```

- [ ] **Step 3: Add to dataService interface + implementation**

In `src/renderer/services/dataService.ts`, add to the `DataService` interface:

```typescript
loadCharacterArc(characterId: string): Promise<{ arc: CharacterArc | null; stations: ArcStation[] }>;
saveCharacterArc(arc: CharacterArc): Promise<void>;
saveArcStations(characterId: string, stations: ArcStation[]): Promise<void>;
assignSceneStation(sceneId: string, stationId: string | null): Promise<void>;
```

Add `ArcStation` and `CharacterArc` to the import from `../../shared/types`.

Then add implementations in `ElectronDataService`:

```typescript
async loadCharacterArc(characterId: string): Promise<{ arc: CharacterArc | null; stations: ArcStation[] }> {
  if (!this.braidrPath) return { arc: null, stations: [] };
  const result = await window.electronAPI.braidrLoadCharacterArc(this.braidrPath, characterId);
  if (!result?.success) return { arc: null, stations: [] };
  return result.data as { arc: CharacterArc | null; stations: ArcStation[] };
}

async saveCharacterArc(arc: CharacterArc): Promise<void> {
  if (!this.braidrPath) return;
  await window.electronAPI.braidrSaveCharacterArc(this.braidrPath, arc);
}

async saveArcStations(characterId: string, stations: ArcStation[]): Promise<void> {
  if (!this.braidrPath) return;
  await window.electronAPI.braidrSaveArcStations(this.braidrPath, characterId, stations);
}

async assignSceneStation(sceneId: string, stationId: string | null): Promise<void> {
  if (!this.braidrPath) return;
  await window.electronAPI.braidrAssignSceneStation(this.braidrPath, sceneId, stationId);
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -E "braidrIpc|preload|dataService" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/main/braidrIpc.ts src/main/preload.ts src/renderer/services/dataService.ts
git commit -m "feat(arc): add IPC handlers and dataService methods for arcs and stations"
```

---

## Task 5: Wire App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add state for arcs and stations**

Near the `tableViews` state declaration, add:

```typescript
const [arcStations, setArcStations] = useState<ArcStation[]>([]);
const [characterArcs, setCharacterArcs] = useState<CharacterArc[]>([]);
```

Import `ArcStation` and `CharacterArc` from `../../shared/types`.

- [ ] **Step 2: Load arcs + stations on project open**

In the same effect/handler that loads `tableViews`, also pull the arc data that comes back in the `BRAIDR_LOAD_PROJECT` result. The load handler now returns `arcStations` and `characterArcs` in its payload. Map them into state:

```typescript
// After loading projectData:
if (result.data.arcStations) setArcStations(result.data.arcStations);
if (result.data.characterArcs) setCharacterArcs(result.data.characterArcs);
```

- [ ] **Step 3: Add save callbacks**

```typescript
const handleSaveCharacterArc = useCallback(async (arc: CharacterArc) => {
  setCharacterArcs(prev => {
    const idx = prev.findIndex(a => a.characterId === arc.characterId);
    return idx >= 0 ? prev.map(a => a.characterId === arc.characterId ? arc : a) : [...prev, arc];
  });
  await dataService.saveCharacterArc(arc);
}, []);

const handleSaveArcStations = useCallback(async (characterId: string, stations: ArcStation[]) => {
  setArcStations(prev => [...prev.filter(s => s.characterId !== characterId), ...stations]);
  await dataService.saveArcStations(characterId, stations);
}, []);

const handleAssignSceneStation = useCallback(async (sceneId: string, stationId: string | null) => {
  if (!projectData) return;
  const updatedScenes = projectData.scenes.map(s =>
    s.id === sceneId ? { ...s, stationId } : s
  );
  setProjectData({ ...projectData, scenes: updatedScenes });
  await dataService.assignSceneStation(sceneId, stationId);
}, [projectData]);
```

- [ ] **Step 4: Pass props to TableView**

Find the `<TableView` render and add:

```tsx
arcStations={arcStations}
characterArcs={characterArcs}
onSaveCharacterArc={handleSaveCharacterArc}
onSaveArcStations={handleSaveArcStations}
onAssignSceneStation={handleAssignSceneStation}
```

- [ ] **Step 5: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "App.tsx" | head -20
```

TypeScript will complain about the new props not existing on TableView yet — those are resolved in Task 7. Note any other errors and fix them.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(arc): load arc stations on project open, wire save/assign callbacks to TableView"
```

---

## Task 6: ArcEditorModal component

**Files:**
- Create: `src/renderer/components/ArcEditorModal.tsx`

This is the modal for defining a character's arc. It has:
- Character selector tabs along the top
- "Starting State" and "Ending State" text areas
- Ordered list of stations (drag to reorder, each with Title / Belief / Reader Feel / Next Break fields)
- Color picker per station (inline — a row of preset swatches)
- Add / delete station buttons
- Auto-save debounced to 800ms

- [ ] **Step 1: Create the file**

```bash
touch /Users/brian/braidr/src/renderer/components/ArcEditorModal.tsx
```

- [ ] **Step 2: Write the component**

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Character, CharacterArc, ArcStation } from '../../shared/types';

const STATION_COLORS = ['#6366f1','#ec4899','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#a855f7'];

function randomId() { return Math.random().toString(36).slice(2, 10); }

interface SortableStationProps {
  station: ArcStation;
  onChange: (updated: ArcStation) => void;
  onDelete: () => void;
}

function SortableStation({ station, onChange, onDelete }: SortableStationProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: station.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="arc-station-row">
      <div className="arc-station-drag" {...attributes} {...listeners}>⠿</div>
      <div className="arc-station-color-dot" style={{ background: station.color }} />
      <div className="arc-station-fields">
        <input
          className="arc-station-title"
          placeholder="Station title (e.g. 'The Lie Holds')"
          value={station.title}
          onChange={e => onChange({ ...station, title: e.target.value })}
        />
        <div className="arc-station-sub-fields">
          <textarea
            className="arc-station-sub"
            placeholder="Belief / interior state..."
            value={station.belief}
            onChange={e => onChange({ ...station, belief: e.target.value })}
            rows={2}
          />
          <textarea
            className="arc-station-sub"
            placeholder="Target reader experience..."
            value={station.readerFeel}
            onChange={e => onChange({ ...station, readerFeel: e.target.value })}
            rows={2}
          />
          <textarea
            className="arc-station-sub"
            placeholder="What must break to reach next station..."
            value={station.nextBreak}
            onChange={e => onChange({ ...station, nextBreak: e.target.value })}
            rows={2}
          />
        </div>
        <div className="arc-station-swatches">
          {STATION_COLORS.map(c => (
            <button
              key={c}
              className={`arc-swatch ${station.color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => onChange({ ...station, color: c })}
            />
          ))}
        </div>
      </div>
      <button className="arc-station-delete" onClick={onDelete} title="Delete station">×</button>
    </div>
  );
}

interface ArcEditorModalProps {
  characters: Character[];
  characterArcs: CharacterArc[];
  arcStations: ArcStation[];
  onSaveArc: (arc: CharacterArc) => void;
  onSaveStations: (characterId: string, stations: ArcStation[]) => void;
  onClose: () => void;
  initialCharacterId?: string;
}

export default function ArcEditorModal({
  characters,
  characterArcs,
  arcStations,
  onSaveArc,
  onSaveStations,
  onClose,
  initialCharacterId,
}: ArcEditorModalProps) {
  const [selectedCharId, setSelectedCharId] = useState(initialCharacterId || characters[0]?.id || '');

  const getArc = (charId: string): CharacterArc => {
    return characterArcs.find(a => a.characterId === charId) || {
      id: randomId(), characterId: charId, startingState: '', endingState: '',
    };
  };
  const getStations = (charId: string): ArcStation[] =>
    arcStations.filter(s => s.characterId === charId).sort((a, b) => a.orderNum - b.orderNum);

  const [localArc, setLocalArc] = useState<CharacterArc>(() => getArc(selectedCharId));
  const [localStations, setLocalStations] = useState<ArcStation[]>(() => getStations(selectedCharId));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Switch character
  useEffect(() => {
    setLocalArc(getArc(selectedCharId));
    setLocalStations(getStations(selectedCharId));
  }, [selectedCharId]);

  const scheduleSave = useCallback((arc: CharacterArc, stations: ArcStation[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onSaveArc(arc);
      onSaveStations(arc.characterId, stations);
    }, 800);
  }, [onSaveArc, onSaveStations]);

  const updateArc = (updated: CharacterArc) => {
    setLocalArc(updated);
    scheduleSave(updated, localStations);
  };

  const updateStations = (updated: ArcStation[]) => {
    setLocalStations(updated);
    scheduleSave(localArc, updated);
  };

  const addStation = () => {
    const color = STATION_COLORS[localStations.length % STATION_COLORS.length];
    const newStation: ArcStation = {
      id: randomId(), characterId: selectedCharId,
      orderNum: localStations.length, title: '', belief: '',
      readerFeel: '', nextBreak: '', color, createdAt: Date.now(),
    };
    updateStations([...localStations, newStation]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localStations.findIndex(s => s.id === active.id);
    const newIdx = localStations.findIndex(s => s.id === over.id);
    updateStations(arrayMove(localStations, oldIdx, newIdx));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="arc-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="arc-editor-header">
          <h2 className="arc-editor-title">Character Arc</h2>
          <button className="arc-editor-close" onClick={onClose}>×</button>
        </div>

        {/* Character tabs */}
        <div className="arc-char-tabs">
          {characters.map(char => (
            <button
              key={char.id}
              className={`arc-char-tab ${selectedCharId === char.id ? 'active' : ''}`}
              onClick={() => setSelectedCharId(char.id)}
            >
              {char.name}
            </button>
          ))}
        </div>

        <div className="arc-editor-body">
          {/* Endpoints */}
          <div className="arc-endpoints">
            <div className="arc-endpoint">
              <label className="arc-endpoint-label">Starting State</label>
              <textarea
                className="arc-endpoint-input"
                placeholder="What does this character believe/feel at the start of the story?"
                value={localArc.startingState}
                onChange={e => updateArc({ ...localArc, startingState: e.target.value })}
                rows={3}
              />
            </div>
            <div className="arc-endpoint-arrow">→</div>
            <div className="arc-endpoint">
              <label className="arc-endpoint-label">Ending State</label>
              <textarea
                className="arc-endpoint-input"
                placeholder="What does this character believe/feel by the end?"
                value={localArc.endingState}
                onChange={e => updateArc({ ...localArc, endingState: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          {/* Stations */}
          <div className="arc-stations-header">
            <span className="arc-stations-label">Transformation Stations ({localStations.length})</span>
            <button className="arc-add-station" onClick={addStation}>+ Add Station</button>
          </div>

          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localStations.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="arc-stations-list">
                {localStations.map((station, idx) => (
                  <SortableStation
                    key={station.id}
                    station={station}
                    onChange={updated => updateStations(localStations.map(s => s.id === updated.id ? updated : s))}
                    onDelete={() => updateStations(localStations.filter(s => s.id !== station.id))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {localStations.length === 0 && (
            <div className="arc-stations-empty">
              No stations yet. Add 5–8 key interior shifts between the starting and ending states.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS**

Find the main CSS file (search for where `.modal-overlay` is defined):

```bash
grep -rn "modal-overlay" /Users/brian/braidr/src/renderer --include="*.css" | head -5
```

Add to that file:

```css
.arc-editor-modal {
  background: var(--bg-primary);
  border-radius: 12px;
  width: 840px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.arc-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.arc-editor-title {
  font-family: var(--font-ui);
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.arc-editor-close {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: 4px;
}
.arc-editor-close:hover { background: var(--bg-hover); }

.arc-char-tabs {
  display: flex;
  gap: 4px;
  padding: 16px 24px 0;
  border-bottom: 1px solid var(--border);
}

.arc-char-tab {
  padding: 6px 14px;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-muted);
  margin-bottom: -1px;
}
.arc-char-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.arc-editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.arc-endpoints {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.arc-endpoint { flex: 1; }
.arc-endpoint-label {
  display: block;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.arc-endpoint-input {
  width: 100%;
  padding: 10px;
  font-family: var(--font-ui);
  font-size: 13px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  resize: none;
  box-sizing: border-box;
}
.arc-endpoint-arrow {
  padding-top: 28px;
  font-size: 20px;
  color: var(--text-muted);
}

.arc-stations-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.arc-stations-label {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.arc-add-station {
  padding: 6px 12px;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.arc-stations-list { display: flex; flex-direction: column; gap: 12px; }
.arc-stations-empty {
  text-align: center;
  padding: 32px;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px dashed var(--border);
}

.arc-station-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.arc-station-drag { cursor: grab; color: var(--text-muted); padding-top: 2px; user-select: none; }
.arc-station-color-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.arc-station-fields { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.arc-station-title {
  width: 100%;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 4px 0;
  color: var(--text-primary);
  box-sizing: border-box;
}
.arc-station-sub-fields { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.arc-station-sub {
  width: 100%;
  font-family: var(--font-ui);
  font-size: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px;
  color: var(--text-primary);
  resize: none;
  box-sizing: border-box;
}
.arc-station-swatches { display: flex; gap: 4px; flex-wrap: wrap; }
.arc-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.arc-swatch.selected { border-color: var(--text-primary); }
.arc-station-delete {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0 4px;
  border-radius: 4px;
  margin-top: -2px;
}
.arc-station-delete:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "ArcEditorModal" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ArcEditorModal.tsx
git commit -m "feat(arc): add ArcEditorModal with endpoints, draggable stations, color swatches"
```

---

## Task 7: TableView — Station column, groupBy='station', Arc Editor button

**Files:**
- Modify: `src/renderer/components/TableView.tsx`

This task requires the table view overhaul plan to be complete (Tasks 1–5 of that plan). The `groupBy` union type already includes `'station'` if you add it in this step.

- [ ] **Step 1: Add new props to TableViewProps**

In `src/renderer/components/TableView.tsx`, extend `TableViewProps`:

```typescript
arcStations: ArcStation[];
characterArcs: CharacterArc[];
onSaveCharacterArc: (arc: CharacterArc) => void;
onSaveArcStations: (characterId: string, stations: ArcStation[]) => void;
onAssignSceneStation: (sceneId: string, stationId: string | null) => void;
```

Import `ArcStation`, `CharacterArc` from `../../shared/types`.

- [ ] **Step 2: Extend groupBy type and add 'station' option to selector**

Update the `groupBy` state type (it was `'none' | 'plotPoint' | 'chapter'` from the table view plan). Extend to `'none' | 'plotPoint' | 'chapter' | 'station'`.

In the toolbar's Group by `<select>`, add:

```tsx
<option value="station">Station</option>
```

Also update `TableViewConfig.groupBy` in `src/shared/types.ts` to match:

```typescript
groupBy: 'none' | 'plotPoint' | 'chapter' | 'station';
```

- [ ] **Step 3: Add "Arc" button to toolbar**

In the toolbar's left side (after the Filter button), add:

```tsx
{/* Arc Editor */}
<button
  className="table-control-btn"
  onClick={() => setShowArcEditor(true)}
  title="Edit character arcs and transformation stations"
>
  Arc
</button>
```

Add state:
```typescript
const [showArcEditor, setShowArcEditor] = useState(false);
const [arcEditorCharId, setArcEditorCharId] = useState<string | undefined>(undefined);
```

Import and render the modal:
```typescript
import ArcEditorModal from './ArcEditorModal';
```

At the bottom of the TableView return (before closing `</div>`):
```tsx
{showArcEditor && (
  <ArcEditorModal
    characters={characters}
    characterArcs={characterArcs}
    arcStations={arcStations}
    onSaveArc={onSaveCharacterArc}
    onSaveStations={onSaveArcStations}
    onClose={() => setShowArcEditor(false)}
    initialCharacterId={arcEditorCharId}
  />
)}
```

- [ ] **Step 4: Add Station column to allColumns**

Find where `allColumns` is built (search for `{ id: 'plotPoint', label: 'Section' }`). Add:

```typescript
{ id: 'station', label: 'Station' },
```

And add `station` to the default `visibleColumns` if desired, or leave it off by default.

- [ ] **Step 5: Render station cell in renderCell**

After the `if (columnId === 'plotPoint')` block, add:

```typescript
if (columnId === 'station') {
  const charStations = arcStations
    .filter(s => s.characterId === scene.characterId)
    .sort((a, b) => a.orderNum - b.orderNum);
  const assignedStation = arcStations.find(s => s.id === scene.stationId);

  return (
    <td key="station" className="table-cell" onClick={e => e.stopPropagation()}>
      {editingCell?.sceneKey === sceneKey && editingCell.field === 'station' ? (
        <select
          className="table-cell-input"
          value={scene.stationId || ''}
          onChange={e => {
            const val = e.target.value || null;
            onAssignSceneStation(scene.id, val);
            setEditingCell(null);
          }}
          onBlur={() => setEditingCell(null)}
          autoFocus
        >
          <option value="">— Unassigned —</option>
          {charStations.map(s => (
            <option key={s.id} value={s.id}>{s.title || 'Untitled station'}</option>
          ))}
        </select>
      ) : (
        <span
          className="table-cell-editable"
          onClick={e => { e.stopPropagation(); setEditingCell({ sceneKey, field: 'station' }); }}
        >
          {assignedStation ? (
            <span
              className="table-status-pill"
              style={{ '--status-color': assignedStation.color } as React.CSSProperties}
            >
              {assignedStation.title || 'Untitled'}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </span>
      )}
    </td>
  );
}
```

- [ ] **Step 6: Add groupBy='station' render mode**

In the table body render (where `groupBy === 'plotPoint'` is handled), add a new branch BEFORE plotPoint:

```tsx
if (groupBy === 'station') {
  const result: React.JSX.Element[] = [];

  // Collect all characters that appear in sortedScenes
  const charIds = [...new Set(sortedScenes.map(s => s.characterId))];

  for (const charId of charIds) {
    const char = characters.find(c => c.id === charId);
    const charStations = arcStations
      .filter(s => s.characterId === charId)
      .sort((a, b) => a.orderNum - b.orderNum);
    const charScenes = sortedScenes.filter(s => s.characterId === charId);

    // Character header (only if multiple characters visible)
    if (charIds.length > 1) {
      result.push(
        <tbody key={`char-${charId}`}>
          <tr className="table-chapter-header table-char-header">
            <td colSpan={100}>
              <span
                className="table-char-dot"
                style={{ background: characterColors[charId] || '#9e9e9e' }}
              />
              {char?.name || 'Unknown'}
            </td>
          </tr>
        </tbody>
      );
    }

    // Station groups
    for (const station of charStations) {
      const stationScenes = charScenes.filter(s => s.stationId === station.id);
      result.push(
        <tbody key={`station-${station.id}`} className="chapter-tbody">
          <tr className="table-chapter-header">
            <td colSpan={100}>
              <span
                className="table-status-pill"
                style={{ '--status-color': station.color } as React.CSSProperties}
              >
                {station.title || 'Untitled Station'}
              </span>
              {stationScenes.length === 0 && (
                <span className="table-station-gap">⚠ No scenes</span>
              )}
              <span className="table-station-count">{stationScenes.length} scene{stationScenes.length !== 1 ? 's' : ''}</span>
            </td>
          </tr>
          {stationScenes.map(s => renderSceneRow(s))}
        </tbody>
      );
    }

    // Unassigned scenes for this character
    const unassigned = charScenes.filter(s => !s.stationId);
    if (unassigned.length > 0) {
      result.push(
        <tbody key={`unassigned-${charId}`} className="chapter-tbody">
          <tr className="table-chapter-header table-orphan-header">
            <td colSpan={100}>
              <span className="table-station-gap">⚠ Unassigned ({unassigned.length})</span>
            </td>
          </tr>
          {unassigned.map(s => renderSceneRow(s))}
        </tbody>
      );
    }

    // If no stations defined yet, show a prompt
    if (charStations.length === 0) {
      result.push(
        <tbody key={`no-arc-${charId}`}>
          <tr>
            <td colSpan={100} className="table-station-no-arc">
              No arc stations defined for {char?.name}.{' '}
              <button
                className="table-station-arc-link"
                onClick={() => { setArcEditorCharId(charId); setShowArcEditor(true); }}
              >
                Open Arc Editor →
              </button>
            </td>
          </tr>
        </tbody>
      );
    }
  }

  return result;
}
```

Add CSS for the new elements in the same CSS file as the rest of table view styles:

```css
.table-station-gap {
  font-size: 11px;
  color: #f97316;
  font-weight: 600;
  margin-left: 8px;
}

.table-station-count {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 8px;
}

.table-orphan-header td { background: rgba(249,115,22,0.06); }

.table-station-no-arc {
  padding: 16px 24px;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

.table-station-arc-link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 13px;
  text-decoration: underline;
}

.table-char-header td {
  background: var(--bg-secondary);
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 7: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "TableView.tsx" | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/TableView.tsx src/shared/types.ts
git commit -m "feat(arc): add Station column, groupBy=station mode with gap/orphan indicators, Arc Editor button"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Covered by |
|-------------|-----------|
| Arc endpoints per character (start/end state) | Task 1 (type), Task 2 (DB), Task 6 (UI) |
| Transformation stations (5–8 interior shifts) | Task 1 (type), Task 2 (DB), Task 6 (UI + drag reorder) |
| Station fields: belief, reader feel, next break | Task 2 (DB columns), Task 6 (ArcEditorModal fields) |
| Station color for visual ID | Task 2 (`color` column), Task 6 (swatches + pill rendering) |
| Scene-to-station mapping | Task 3 (stationId on Scene), Task 4 (assignSceneStation IPC), Task 7 (Station column dropdown) |
| Gap detection: stations with no scenes | Task 7 (⚠ No scenes callout in groupBy=station) |
| Orphan detection: scenes with no station | Task 7 (Unassigned bucket in groupBy=station) |
| Group by station in Table View | Task 7 (groupBy='station' branch) |
| Arc Editor accessible from Table View | Task 7 (Arc button in toolbar, "Open Arc Editor →" link) |
| Persist all data to SQLite | Tasks 2–5 (full stack: DB → IPC → dataService → App) |
| "No arc stations defined" prompt | Task 7 (empty state with link to Arc Editor) |

**Placeholder scan:** None found.

**Type consistency:**
- `ArcStation.readerFeel` → `arc_stations.reader_feel` → `r.reader_feel` → `readerFeel` — consistent
- `ArcStation.nextBreak` → `arc_stations.next_break` → `r.next_break` → `nextBreak` — consistent
- `onAssignSceneStation(sceneId, stationId)` — matches App.tsx Task 5 and TableView Task 7
- `onSaveArcStations(characterId, stations)` — matches App.tsx Task 5 and ArcEditorModal Task 6
- `groupBy: 'none' | 'plotPoint' | 'chapter' | 'station'` updated in both `TableViewConfig` (shared/types.ts Task 7 Step 2) and TableView state
