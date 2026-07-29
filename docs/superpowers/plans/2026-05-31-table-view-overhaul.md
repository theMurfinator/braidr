# Table View Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate TableView state from localStorage to SQLite, add group-by-section/chapter, redesign the toolbar (including default view support), add a right-side POV reordering panel, fix toolbar z-index overlap, and show option colors for all metadata field types in table cells.

**Architecture:** TableViewConfig is extended to carry all session state (columns, widths, order, filters, groupBy). A new `table_views` SQLite table stores named saved views. App.tsx loads views on project open and passes them down; TableView removes all localStorage usage. A new `TablePovSlideover` component renders in a right panel when a scene row is selected, showing the character's full POV sequence with drag-to-reorder.

**Tech Stack:** better-sqlite3, dnd-kit (sortable), React, Electron IPC

---

## File Map

| File | Change |
|------|--------|
| `src/shared/types.ts` | Extend `TableViewConfig`, export `FilterRule`, add 2 IPC channels |
| `src/main/database.ts` | Add `table_views` table to `CREATE_SCHEMA`, add `getTableViews` / `saveTableViews` methods |
| `src/main/braidrIpc.ts` | Add `BRAIDR_LOAD_TABLE_VIEWS` and `BRAIDR_SAVE_TABLE_VIEWS` handlers |
| `src/main/preload.ts` | Expose the two new channels via `braidrLoadTableViews` / `braidrSaveTableViews` |
| `src/renderer/services/dataService.ts` | Add `loadTableViews()` / `saveTableViews()` to interface + implementation |
| `src/renderer/App.tsx` | Load table views on project open; pass real props to TableView; expose `onMovePovScene` and `onAddSceneForCharacter` |
| `src/renderer/components/TableView.tsx` | Remove all localStorage; accept full config via props; add groupBy toggle; redesign toolbar; wire POV panel open |
| `src/renderer/components/TablePovSlideover.tsx` | **New** – right-side slide panel showing a character's POV sequence, sortable |

---

## Task 1: Extend shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Export FilterRule and extend TableViewConfig**

Replace the existing `TableViewConfig` interface (lines 85–94) and add `FilterRule` export. The existing `filterCharacter` and `filterTags` fields on `TableViewConfig` were dead code — fold them into `filterRules` instead:

```typescript
// Add BEFORE TableViewConfig (around line 85):
export interface FilterRule {
  id: string;
  field: string;
  operator: 'is' | 'is_not' | 'is_blank' | 'is_not_blank' | 'contains';
  value: string;
}

// Replace existing TableViewConfig:
export interface TableViewConfig {
  id: string;
  name: string;
  isDefault?: boolean;          // if true, loaded automatically on table view mount
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  columnOrder: string[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filterRules: FilterRule[];
  groupBy: 'none' | 'plotPoint' | 'chapter';
  createdAt: number;
}
```

- [ ] **Step 2: Add IPC channel constants**

Find the `IPC_CHANNELS` const (around line 382). Add two entries near the existing BRAIDR channels:

```typescript
  BRAIDR_LOAD_TABLE_VIEWS: 'braidr:load-table-views',
  BRAIDR_SAVE_TABLE_VIEWS: 'braidr:save-table-views',
```

- [ ] **Step 3: Build and fix any type errors from the TableViewConfig shape change**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -i "tableviewconfig\|filterrule\|filterCharacter\|filterTags" | head -30
```

Fix any errors — the only expected ones are in `TableView.tsx` where `filterCharacter`/`filterTags` may be referenced (we'll fully fix those in Task 4, so just comment them out or cast for now if needed).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(table): extend TableViewConfig with groupBy/filterRules/columnWidths, export FilterRule"
```

---

## Task 2: Add SQLite table + database methods

**Files:**
- Modify: `src/main/database.ts`

- [ ] **Step 1: Add `table_views` to CREATE_SCHEMA**

In `database.ts`, find `CREATE_SCHEMA` (the large template literal starting around line 7). Add this table definition after `archived_notes`:

```sql
  CREATE TABLE IF NOT EXISTS table_views (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
```

Because this uses `CREATE TABLE IF NOT EXISTS`, it will be created automatically on first open of any existing `.braidr` file — no ALTER TABLE migration needed.

- [ ] **Step 2: Add database methods**

Find the `// ── Metadata Field Defs ───────────────────────────────────────────────────` section (around line 629). Add a new section after it:

```typescript
  // ── Table Views ───────────────────────────────────────────────────────────

  getTableViews(): TableViewRow[] {
    return this.db.prepare('SELECT * FROM table_views ORDER BY created_at ASC').all() as TableViewRow[];
  }

  saveTableViews(views: TableViewRow[]) {
    this.db.prepare('DELETE FROM table_views').run();
    const insert = this.db.prepare('INSERT INTO table_views (id, name, config_json, created_at) VALUES (?, ?, ?, ?)');
    for (const v of views) insert.run(v.id, v.name, v.config_json, v.created_at);
  }
```

- [ ] **Step 3: Add the TableViewRow interface**

Near the bottom of `database.ts` where other row interfaces live (around line 955), add:

```typescript
export interface TableViewRow { id: string; name: string; config_json: string; created_at: number }
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "database.ts" | head -20
```

Expected: no errors from database.ts.

- [ ] **Step 5: Commit**

```bash
git add src/main/database.ts
git commit -m "feat(db): add table_views SQLite table and CRUD methods"
```

---

## Task 3: IPC handlers + preload + dataService

**Files:**
- Modify: `src/main/braidrIpc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/services/dataService.ts`

- [ ] **Step 1: Add IPC handlers in braidrIpc.ts**

Find `ipcMain.handle(IPC_CHANNELS.BRAIDR_GET_CHAPTERS, ...)` (around line 1022). Add the two new handlers nearby:

```typescript
ipcMain.handle(IPC_CHANNELS.BRAIDR_LOAD_TABLE_VIEWS, (_event, braidrPath: string) => {
  try {
    const { BraidrDB } = require('./database');
    const db = new BraidrDB(braidrPath);
    const rows = db.getTableViews();
    db.close();
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle(IPC_CHANNELS.BRAIDR_SAVE_TABLE_VIEWS, (_event, braidrPath: string, views: import('./database').TableViewRow[]) => {
  try {
    const { BraidrDB } = require('./database');
    const db = new BraidrDB(braidrPath);
    db.saveTableViews(views);
    db.checkpoint();
    db.close();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
```

- [ ] **Step 2: Expose in preload.ts**

Find the block where `braidrGetChapters` is exposed (search for `BRAIDR_GET_CHAPTERS` in preload.ts, around line 82). Add two entries in the same style:

```typescript
braidrLoadTableViews: (braidrPath: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_LOAD_TABLE_VIEWS, braidrPath),
braidrSaveTableViews: (braidrPath: string, views: unknown[]) =>
  ipcRenderer.invoke(IPC_CHANNELS.BRAIDR_SAVE_TABLE_VIEWS, braidrPath, views),
```

- [ ] **Step 3: Add to dataService interface + ElectronDataService**

In `src/renderer/services/dataService.ts`, add to the `DataService` interface:

```typescript
loadTableViews(): Promise<TableViewConfig[]>;
saveTableViews(views: TableViewConfig[]): Promise<void>;
```

Add the import for `TableViewConfig` and `FilterRule` from `../../shared/types` if not already imported.

Then add the implementation in `ElectronDataService`:

```typescript
async loadTableViews(): Promise<TableViewConfig[]> {
  if (!this.braidrPath) return [];
  const result = await window.electronAPI.braidrLoadTableViews(this.braidrPath);
  if (!result?.success || !result.data) return [];
  return (result.data as Array<{ id: string; name: string; config_json: string; created_at: number }>).map(row => ({
    ...JSON.parse(row.config_json),
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
}

async saveTableViews(views: TableViewConfig[]): Promise<void> {
  if (!this.braidrPath) return;
  const rows = views.map(v => ({
    id: v.id,
    name: v.name,
    config_json: JSON.stringify(v),
    created_at: v.createdAt,
  }));
  await window.electronAPI.braidrSaveTableViews(this.braidrPath, rows);
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -E "braidrIpc|preload|dataService" | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/braidrIpc.ts src/main/preload.ts src/renderer/services/dataService.ts
git commit -m "feat(ipc): add load/save table views IPC handlers and dataService methods"
```

---

## Task 4: Wire App.tsx — load/pass/save tableViews

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add tableViews state**

Near where `chapters` state is declared in App.tsx (search for `const [chapters, setChapters]`), add:

```typescript
const [tableViews, setTableViews] = useState<TableViewConfig[]>([]);
```

Add the import for `TableViewConfig` from `../../shared/types` if not present.

- [ ] **Step 2: Load tableViews on project open**

Find where `getChapters()` is called on project load (search for `dataService.getChapters()`). In the same effect/handler, load table views:

```typescript
const loadedTableViews = await dataService.loadTableViews();
setTableViews(loadedTableViews);
```

- [ ] **Step 3: Add save handler**

Near the `handleSaveChapter` function, add:

```typescript
const handleSaveTableViews = useCallback(async (views: TableViewConfig[]) => {
  setTableViews(views);
  await dataService.saveTableViews(views);
}, []);
```

- [ ] **Step 4: Add onMovePovScene callback**

This callback lets the TableView's POV slideout trigger a POV reorder. Find `handleMoveScene` (around line 1710) — it takes `(scene, targetSceneNumber, targetPlotPointId)`. Add a simpler wrapper that takes `(sceneId, targetIndex)` for use from the slideout:

```typescript
const handleMovePovSceneFromTable = useCallback((sceneId: string, targetIndex: number, targetPlotPointId: string | null) => {
  if (!projectData) return;
  const scene = projectData.scenes.find(s => s.id === sceneId);
  if (!scene) return;
  // targetIndex is 0-based position in character's scene array
  const charScenes = projectData.scenes
    .filter(s => s.characterId === scene.characterId)
    .sort((a, b) => a.sceneNumber - b.sceneNumber);
  const [movedScene] = charScenes.splice(charScenes.findIndex(s => s.id === sceneId), 1);
  movedScene.plotPointId = targetPlotPointId;
  charScenes.splice(targetIndex, 0, movedScene);
  charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });
  const updatedScenes = [...projectData.scenes.filter(s => s.characterId !== scene.characterId), ...charScenes];
  const updatedData = { ...projectData, scenes: updatedScenes };
  setProjectData(updatedData);
  debouncedSaveTimeline(updatedData);
}, [projectData, debouncedSaveTimeline]);
```

- [ ] **Step 5: Add onAddSceneForCharacter callback**

```typescript
const handleAddSceneForCharacterFromTable = useCallback(async (characterId: string) => {
  if (!projectData) return;
  await handleAddSceneToInbox(characterId);
}, [projectData, handleAddSceneToInbox]);
```

- [ ] **Step 6: Hide irrelevant toolbar buttons in table mode**

In App.tsx around line 3711, the block that renders "+ New / Show synopses / Sections / Scenes / Fields" has this condition:

```tsx
{(viewMode === 'pov' || (viewMode === 'braided' && braidedSubMode !== 'rails')) && (
```

Change it to also exclude table mode:

```tsx
{(viewMode === 'pov' || (viewMode === 'braided' && braidedSubMode !== 'rails' && braidedSubMode !== 'table')) && (
```

Similarly, around line 3830, the "Colors / Fields" block:

```tsx
{viewMode === 'braided' && braidedSubMode !== 'rails' && (
```

Change to:

```tsx
{viewMode === 'braided' && braidedSubMode !== 'rails' && braidedSubMode !== 'table' && (
```

Around line 3918, the `FilterBar` (tag filter pills):

```tsx
{viewMode !== 'editor' && viewMode !== 'notes' && projectData.tags.length > 0 && (
  <FilterBar ... />
)}
```

Change to also hide in table mode (TableView has its own filter):

```tsx
{viewMode !== 'editor' && viewMode !== 'notes' && !(viewMode === 'braided' && braidedSubMode === 'table') && projectData.tags.length > 0 && (
  <FilterBar ... />
)}
```

This leaves the toolbar showing only project name, branch selector, timer, and search when in table mode.

- [ ] **Step 7: Replace the stubbed TableView props**

Find the `<TableView` render (around line 3384). Replace:

```tsx
tableViews={[]}
onTableViewsChange={() => {}}
```

With:

```tsx
tableViews={tableViews}
onTableViewsChange={handleSaveTableViews}
onMovePovScene={handleMovePovSceneFromTable}
onAddSceneForCharacter={handleAddSceneForCharacterFromTable}
```

- [ ] **Step 8: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "App.tsx" | head -20
```

Fix any type errors (likely from the new prop names on TableView — those will be resolved in Task 5).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(app): wire tableViews from SQLite, hide list-only toolbar buttons in table mode"
```

---

## Task 5: TableView — remove localStorage, accept full config via props, redesign toolbar

**Files:**
- Modify: `src/renderer/components/TableView.tsx`

This is the largest task. We're doing three things: (1) remove localStorage, (2) redesign toolbar, (3) add groupBy=plotPoint mode.

- [ ] **Step 1: Add new props to TableViewProps**

Find the `interface TableViewProps` (around line 11). Add:

```typescript
onMovePovScene: (sceneId: string, targetIndex: number, targetPlotPointId: string | null) => void;
onAddSceneForCharacter: (characterId: string) => void;
```

And update the existing props to match the new TableViewConfig shape — `tableViews` remains `TableViewConfig[]`, `onTableViewsChange` remains `(views: TableViewConfig[]) => void`.

- [ ] **Step 2: Remove the local FilterRule type and import from shared/types**

Delete the local `FilterRule` interface at the top of TableView.tsx (around line 4). Add it to the import from `../../shared/types`:

```typescript
import { Scene, Character, MetadataFieldDef, Tag, TableViewConfig, FilterRule, Chapter } from '../../shared/types';
```

- [ ] **Step 3: Replace all localStorage state with prop-driven state**

Find and replace every `useState` that reads from localStorage. There are five:

**savedViews** (was reading `table-saved-views`):
```typescript
// BEFORE:
const [savedViews, setSavedViews] = useState<TableViewConfig[]>(() => {
  const saved = localStorage.getItem('table-saved-views');
  return saved ? JSON.parse(saved) : [];
});

// AFTER:
// Use the tableViews prop directly (it's the source of truth)
// No local state needed — reads from props, writes via onTableViewsChange
```

**currentViewId** (was reading `table-current-view`):
```typescript
const [currentViewId, setCurrentViewId] = useState<string | null>(null);
```
Remove the localStorage initializer.

**visibleColumns** (was reading `table-visible-columns`):
```typescript
const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
  new Set(['scene', 'character', 'status', 'words', 'plotPoint'])
);
```

**columnWidths** (was reading `table-column-widths`):
```typescript
const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...DEFAULT_COLUMN_WIDTHS });
```

**columnOrder** (was reading `table-column-order`):
```typescript
const [columnOrder, setColumnOrder] = useState<string[]>(['scene', 'character', 'status', 'words', 'plotPoint']);
```

- [ ] **Step 4: Remove all localStorage.setItem calls**

Search for `localStorage.setItem` in TableView.tsx and delete all of them. They should be in `useEffect` hooks that sync state back to localStorage — remove those entire effects.

- [ ] **Step 5: Wire loadView / saveCurrentView / deleteView to use props**

Find the `loadView`, `saveCurrentView`, `deleteView` functions (search for `function loadView` or `const loadView`). Rewrite them to operate on the `tableViews` prop and call `onTableViewsChange`:

```typescript
const loadView = (viewId: string) => {
  const view = tableViews.find(v => v.id === viewId);
  if (!view) return;
  setCurrentViewId(viewId);
  setVisibleColumns(new Set(view.visibleColumns));
  setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...view.columnWidths });
  setColumnOrder(view.columnOrder.length ? view.columnOrder : ['scene', 'character', 'status', 'words', 'plotPoint']);
  setSortField(view.sortField as SortField);
  setSortDirection(view.sortDirection);
  setFilterRules(view.filterRules || []);
  setGroupBy(view.groupBy || 'none');
  setShowViewMenu(false);
};

const saveCurrentView = () => {
  if (!newViewName.trim()) return;
  const id = `view-${Date.now()}`;
  const newView: TableViewConfig = {
    id,
    name: newViewName.trim(),
    isDefault: false,
    visibleColumns: Array.from(visibleColumns),
    columnWidths,
    columnOrder,
    sortField,
    sortDirection,
    filterRules,
    groupBy,
    createdAt: Date.now(),
  };
  onTableViewsChange([...tableViews, newView]);
  setCurrentViewId(id);
  setNewViewName('');
  setShowNewViewDialog(false);
};

const setDefaultView = (viewId: string) => {
  // Toggle: if already default, remove default; otherwise set this one as default (only one at a time)
  onTableViewsChange(tableViews.map(v => ({ ...v, isDefault: v.id === viewId ? !v.isDefault : false })));
};

const deleteView = (viewId: string) => {
  onTableViewsChange(tableViews.filter(v => v.id !== viewId));
  if (currentViewId === viewId) setCurrentViewId(null);
};
```

- [ ] **Step 6: Load default view on mount**

Add a `useEffect` that fires once when `tableViews` first loads (i.e. transitions from empty to populated) and applies the default view if one exists:

```typescript
useEffect(() => {
  if (tableViews.length === 0) return;
  const defaultView = tableViews.find(v => v.isDefault);
  if (defaultView) loadView(defaultView.id);
}, [tableViews.length > 0 ? 'loaded' : 'empty']); // run once when views arrive
```

Note: use a string-derived dep (`tableViews.length > 0 ? 'loaded' : 'empty'`) so this only fires on the empty→populated transition, not on every save.

- [ ] **Step 7: Add groupBy state**

After the existing state declarations, add:

```typescript
const [groupBy, setGroupBy] = useState<'none' | 'plotPoint' | 'chapter'>('none');
const [showAddSceneMenu, setShowAddSceneMenu] = useState(false);
const addSceneMenuRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 8: Replace the toolbar JSX**

Find `{/* Table Controls */}` (around line 518). Replace the entire `<div className="table-view-controls">` block with a redesigned toolbar:

```tsx
<div className="table-view-controls">
  <div className="table-view-controls-left">
    <span className="table-scene-count">{sortedScenes.length} scenes</span>

    {/* Group by */}
    <div className="table-view-group-by">
      <span className="table-control-label">Group by</span>
      <select
        className="table-control-select"
        value={groupBy}
        onChange={e => setGroupBy(e.target.value as 'none' | 'plotPoint' | 'chapter')}
      >
        <option value="none">None</option>
        <option value="plotPoint">Section</option>
        <option value="chapter">Chapter</option>
      </select>
    </div>

    {/* Filter */}
    <button
      className={`table-control-btn ${filterRules.length > 0 ? 'active' : ''}`}
      onClick={() => setShowFilterBuilder(!showFilterBuilder)}
    >
      Filter{filterRules.length > 0 ? ` (${filterRules.length})` : ''}
    </button>

    {/* Add Scene */}
    <div className="table-view-dropdown" ref={addSceneMenuRef}>
      <button
        className="table-control-btn table-control-btn-add"
        onClick={() => setShowAddSceneMenu(!showAddSceneMenu)}
      >
        + Add Scene
      </button>
      {showAddSceneMenu && (
        <div className="table-view-dropdown-menu">
          {characters.map(char => (
            <div
              key={char.id}
              className="table-view-dropdown-item"
              onClick={() => {
                onAddSceneForCharacter(char.id);
                setShowAddSceneMenu(false);
              }}
            >
              <span
                className="table-char-dot"
                style={{ background: characterColors[char.id] || '#9e9e9e' }}
              />
              {char.name}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>

  <div className="table-view-controls-right">
    {/* Columns */}
    <div className="table-view-dropdown" ref={columnMenuRef}>
      <button className="table-control-btn" onClick={() => setShowColumnMenu(!showColumnMenu)}>
        Columns
      </button>
      {showColumnMenu && (
        <div className="table-view-dropdown-menu">
          {allColumns.map(col => (
            <div key={col.id} className="table-view-dropdown-item" onClick={() => toggleColumn(col.id)}>
              <div className={`table-view-dropdown-checkbox ${visibleColumns.has(col.id) ? 'checked' : ''}`} />
              <span>{col.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Views */}
    <div className="table-view-dropdown">
      <button className="table-control-btn" onClick={() => setShowViewMenu(!showViewMenu)}>
        {currentViewId && tableViews.find(v => v.id === currentViewId)
          ? tableViews.find(v => v.id === currentViewId)!.name
          : 'Views'}
      </button>
      {showViewMenu && (
        <div className="table-view-dropdown-menu" style={{ minWidth: '220px' }}>
          {tableViews.map(view => (
            <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px' }}>
              <div className="table-view-dropdown-item" style={{ flex: 1, padding: '8px' }} onClick={() => loadView(view.id)}>
                {view.isDefault && <span style={{ color: 'var(--accent)', marginRight: 4 }}>★</span>}
                {view.name}
              </div>
              <button
                title={view.isDefault ? 'Remove default' : 'Set as default'}
                onClick={e => { e.stopPropagation(); setDefaultView(view.id); }}
                style={{ padding: '4px 6px', fontSize: '11px', background: view.isDefault ? 'var(--accent)' : 'transparent', color: view.isDefault ? 'white' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
              >
                ★
              </button>
              <button
                onClick={e => { e.stopPropagation(); deleteView(view.id); }}
                style={{ padding: '4px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>
          ))}
          {tableViews.length > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />}
          <div className="table-view-dropdown-item" onClick={() => { setShowViewMenu(false); setShowNewViewDialog(true); }}>
            + Save Current View
          </div>
          <div className="table-view-dropdown-item" onClick={resetToDefault}>
            Reset to Default
          </div>
        </div>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 9: Fix toolbar z-index overlap**

The `.table-view-controls` bar renders on top of table cell dropdown menus and sidebar elements. Add this to the table view CSS:

```css
.table-view-controls {
  position: sticky;
  top: 0;
  z-index: 10;           /* below app sidebar (z-index ~100) and modals, above table rows */
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

/* Dropdowns from the toolbar need to sit above the sticky bar */
.table-view-dropdown-menu {
  z-index: 20;
}
```

If the toolbar currently has a higher z-index set inline or in CSS, find and reduce it.

- [ ] **Step 10: Add groupBy=plotPoint rendering**

Find the section (around line 1044) where the table body is rendered:

```tsx
if (chapters && chapters.length > 0) {
```

Add a `groupBy === 'plotPoint'` branch BEFORE the chapters block:

```tsx
if (groupBy === 'plotPoint') {
  // Group by character → plot point (section)
  const result: React.JSX.Element[] = [];
  // Collect all character+plotPoint combos in display order
  const groups = new Map<string, { label: string; scenes: Scene[] }>();
  for (const scene of sortedScenes) {
    const char = characters.find(c => c.id === scene.characterId);
    const pp = plotPoints.find(p => p.id === scene.plotPointId);
    const key = `${scene.characterId}::${scene.plotPointId ?? '__none__'}`;
    if (!groups.has(key)) {
      const charName = char?.name || 'Unknown';
      const ppTitle = pp?.title || 'No Section';
      groups.set(key, { label: `${charName} — ${ppTitle}`, scenes: [] });
    }
    groups.get(key)!.scenes.push(scene);
  }
  for (const [key, group] of groups) {
    result.push(
      <tbody key={key} className="chapter-tbody">
        <tr className="table-chapter-header">
          <td colSpan={100}>{group.label}</td>
        </tr>
        {group.scenes.map(s => renderSceneRow(s))}
      </tbody>
    );
  }
  return result;
}

if (groupBy === 'chapter' && chapters && chapters.length > 0) {
  // existing chapter grouping code (move it inside this branch)
  ...
}

return <tbody>{sortedScenes.map(scene => renderSceneRow(scene))}</tbody>;
```

Move the existing chapter grouping code (lines 1044–1086) into the `groupBy === 'chapter'` branch.

- [ ] **Step 11: Add selected scene state for POV panel trigger**

Add state:
```typescript
const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
const [showPovPanel, setShowPovPanel] = useState(false);
```

In `renderSceneRow`, update the `<tr>` click handler:

```tsx
<tr
  key={scene.id}
  className={`table-row ${povReorderedScenes?.has(scene.id) ? 'pov-reordered' : ''} ${selectedSceneId === scene.id ? 'selected' : ''}`}
  onClick={() => {
    setSelectedSceneId(scene.id);
    setShowPovPanel(true);
    onSceneClick(sceneKey); // keep existing behavior (floating editor)
  }}
>
```

Add the POV panel render at the bottom of the component's return, just before the closing `</div>`:

```tsx
{showPovPanel && selectedSceneId && (() => {
  const selScene = scenes.find(s => s.id === selectedSceneId);
  if (!selScene) return null;
  const charScenes = scenes
    .filter(s => s.characterId === selScene.characterId)
    .sort((a, b) => a.sceneNumber - b.sceneNumber);
  const charPlotPoints = plotPoints.filter(pp => pp.characterId === selScene.characterId);
  return (
    <TablePovSlideover
      characterName={characters.find(c => c.id === selScene.characterId)?.name || 'Unknown'}
      characterColor={characterColors[selScene.characterId] || '#9e9e9e'}
      scenes={charScenes}
      plotPoints={charPlotPoints}
      selectedSceneId={selectedSceneId}
      onClose={() => setShowPovPanel(false)}
      onMove={onMovePovScene}
    />
  );
})()}
```

Add the import at the top:
```typescript
import TablePovSlideover from './TablePovSlideover';
```

- [ ] **Step 12: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "TableView.tsx" | head -30
```

Expect errors about `TablePovSlideover` not existing (resolved in Task 6) and the new props `onMovePovScene`/`onAddSceneForCharacter` (resolved when we add them). Fix any other errors.

- [ ] **Step 13: Commit (partial — may have TS errors until Task 6)**

```bash
git add src/renderer/components/TableView.tsx
git commit -m "feat(table): remove localStorage, redesign toolbar, add groupBy plotPoint/chapter, wire POV panel"
```

---

## Task 6: TablePovSlideover component

**Files:**
- Create: `src/renderer/components/TablePovSlideover.tsx`

This component is a right-side slide panel. It shows a character's full POV scene list, grouped by plot point (section), with dnd-kit drag-to-reorder within the character's sequence.

- [ ] **Step 1: Create the component**

```bash
touch /Users/brian/braidr/src/renderer/components/TablePovSlideover.tsx
```

- [ ] **Step 2: Write the component**

```typescript
import { useState } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, PlotPoint } from '../../shared/types';

interface TablePovSlideoverProps {
  characterName: string;
  characterColor: string;
  scenes: Scene[];           // already sorted by sceneNumber ascending
  plotPoints: PlotPoint[];   // for this character only
  selectedSceneId: string;
  onClose: () => void;
  onMove: (sceneId: string, targetIndex: number, targetPlotPointId: string | null) => void;
}

function SortableSceneRow({ scene, isSelected, plotPointTitle }: {
  scene: Scene;
  isSelected: boolean;
  plotPointTitle: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const titleMatch = scene.content.match(/==\*\*(.+?)\*\*==/);
  const title = titleMatch
    ? titleMatch[1].replace(/#[a-zA-Z0-9_]+/g, '').trim()
    : scene.content.replace(/<[^>]*>/g, '').replace(/#[a-zA-Z0-9_]+/g, '').trim().slice(0, 60);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pov-slideover-row ${isSelected ? 'selected' : ''}`}
    >
      <span className="pov-slideover-drag" {...attributes} {...listeners}>⠿</span>
      <span className="pov-slideover-num">{scene.sceneNumber}</span>
      <span className="pov-slideover-title">{title || 'Untitled'}</span>
    </div>
  );
}

export default function TablePovSlideover({
  characterName,
  characterColor,
  scenes,
  plotPoints,
  selectedSceneId,
  onClose,
  onMove,
}: TablePovSlideoverProps) {
  const [localScenes, setLocalScenes] = useState(scenes);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localScenes.findIndex(s => s.id === active.id);
    const newIndex = localScenes.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localScenes, oldIndex, newIndex);
    setLocalScenes(reordered);

    // Determine new plotPointId: use the plotPointId of the scene now at that position
    const neighborScene = reordered[newIndex + 1] || reordered[newIndex - 1];
    const targetPlotPointId = neighborScene?.plotPointId ?? null;

    onMove(String(active.id), newIndex, targetPlotPointId);
  };

  // Group scenes by plot point for display
  const sections: Array<{ plotPoint: PlotPoint | null; scenes: Scene[] }> = [];
  const seenPpIds = new Set<string | null>();
  for (const scene of localScenes) {
    const ppId = scene.plotPointId ?? null;
    if (!seenPpIds.has(ppId)) {
      seenPpIds.add(ppId);
      sections.push({
        plotPoint: plotPoints.find(pp => pp.id === ppId) ?? null,
        scenes: [],
      });
    }
    sections[sections.length - 1].scenes.push(scene);
  }

  return (
    <div className="pov-slideover-overlay" onClick={onClose}>
      <div className="pov-slideover" onClick={e => e.stopPropagation()}>
        <div className="pov-slideover-header">
          <span
            className="pov-slideover-char-dot"
            style={{ background: characterColor }}
          />
          <span className="pov-slideover-char-name">{characterName} — POV Order</span>
          <button className="pov-slideover-close" onClick={onClose}>×</button>
        </div>

        <div className="pov-slideover-body">
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section, si) => (
                <div key={si} className="pov-slideover-section">
                  {section.plotPoint && (
                    <div className="pov-slideover-section-header">{section.plotPoint.title}</div>
                  )}
                  {section.scenes.map(scene => (
                    <SortableSceneRow
                      key={scene.id}
                      scene={scene}
                      isSelected={scene.id === selectedSceneId}
                      plotPointTitle={section.plotPoint?.title || ''}
                    />
                  ))}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS for the slideover**

Find the table view CSS file. Run:

```bash
find /Users/brian/braidr/src -name "*.css" | xargs grep -l "table-view" | head -5
```

Add these styles to that file:

```css
.pov-slideover-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: transparent;
}

.pov-slideover {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  background: var(--bg-primary);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 16px rgba(0,0,0,0.12);
  z-index: 201;
}

.pov-slideover-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.pov-slideover-char-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pov-slideover-char-name { flex: 1; }

.pov-slideover-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: 4px;
}
.pov-slideover-close:hover { background: var(--bg-hover); }

.pov-slideover-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.pov-slideover-section-header {
  padding: 8px 16px 4px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.pov-slideover-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-primary);
  border-radius: 4px;
  margin: 0 4px;
}
.pov-slideover-row:hover { background: var(--bg-hover); }
.pov-slideover-row.selected {
  background: var(--accent-muted, rgba(99,102,241,0.1));
  font-weight: 600;
}

.pov-slideover-drag {
  cursor: grab;
  color: var(--text-muted);
  font-size: 14px;
  user-select: none;
}

.pov-slideover-num {
  min-width: 24px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}

.pov-slideover-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "TablePovSlideover\|pov-slide" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TablePovSlideover.tsx
git commit -m "feat(table): add TablePovSlideover right panel for POV reordering"
```

---

## Task 7: Color pills for all metadata fields in table cells

**Files:**
- Modify: `src/renderer/components/TableView.tsx`

Currently the custom field cell renderer (around lines 966–1029) renders all values as plain text. This task extends it to show colored pills for `dropdown` and `multiselect` fields when `optionColors` is defined.

- [ ] **Step 1: Update the custom field display renderer**

Find the block at the end of `renderCell` that handles custom metadata fields (around line 966). Replace only the **display** branch (the `<span className="table-cell-editable">` part) — leave the editing selects/textareas as-is:

```tsx
// Custom metadata fields (display)
const field = metadataFieldDefs.find(f => f.id === columnId);
if (field) {
  const value = metadata[field.id];

  const renderDisplay = () => {
    if (field.type === 'multiselect' && Array.isArray(value) && value.length > 0) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {(value as string[]).map(opt => {
            const color = field.optionColors?.[opt];
            return color ? (
              <span
                key={opt}
                className="table-status-pill"
                style={{ '--status-color': color } as React.CSSProperties}
              >
                {opt}
              </span>
            ) : (
              <span key={opt} className="table-tag-plain">{opt}</span>
            );
          })}
        </div>
      );
    }
    if (field.type === 'dropdown' && typeof value === 'string' && value) {
      const color = field.optionColors?.[value];
      return color ? (
        <span className="table-status-pill" style={{ '--status-color': color } as React.CSSProperties}>
          {value}
        </span>
      ) : (
        <span>{value}</span>
      );
    }
    const displayValue = Array.isArray(value) ? value.join(', ') : (value as string || '—');
    return <span>{displayValue}</span>;
  };

  return (
    <td key={field.id} className="table-cell" onClick={(e) => e.stopPropagation()}>
      {editingCell?.sceneKey === sceneKey && editingCell.field === field.id ? (
        // ... existing editing JSX unchanged ...
      ) : (
        <span
          className="table-cell-editable"
          onClick={(e) => {
            e.stopPropagation();
            const displayValue = Array.isArray(value) ? value.join(', ') : (value as string || '');
            handleCellEdit(sceneKey, field.id, displayValue);
          }}
        >
          {renderDisplay()}
        </span>
      )}
    </td>
  );
}
```

Also add the `.table-tag-plain` style to the CSS file:

```css
.table-tag-plain {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep "TableView.tsx" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/TableView.tsx
git commit -m "feat(table): show colored pills for all dropdown/multiselect metadata fields"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|-------------|-----------|
| Migrate tableViews to SQLite | Tasks 1–4 |
| Remove localStorage from TableView | Task 5, Steps 3–4 |
| Group by chapter | Task 5, Step 8 (groupBy=chapter branch) |
| Group by plot point / section | Task 5, Step 8 (groupBy=plotPoint branch) |
| Hide top-bar list-only buttons + tag filters in table mode | Task 4, Step 6 |
| Fix confusing TableView inner toolbar | Task 5, Step 8 |
| Default view — auto-load on mount | Task 1 (isDefault field) + Task 5, Step 6 |
| Set/unset default view in Views menu | Task 5, Step 8 (★ button per view) |
| Fix toolbar z-index overlap | Task 5, Step 9 |
| Add scene from table | Task 5, Step 8 (+ Add Scene dropdown) |
| POV slideout with reordering | Tasks 5 (Step 11) + Task 6 |
| Reorder in POV affects POV view | Task 4 Step 4 (handleMovePovSceneFromTable updates projectData) |
| Color pills for dropdown/multiselect | Task 7 |

**Placeholder scan:** None found — all steps include actual code.

**Type consistency:**
- `FilterRule` exported from `shared/types.ts` in Task 1, imported in Task 5
- `TableViewConfig.filterRules: FilterRule[]` used consistently
- `onMovePovScene(sceneId: string, targetIndex: number, targetPlotPointId: string | null)` — matches signature in App.tsx (Task 4) and TablePovSlideover (Task 6)
- `onAddSceneForCharacter(characterId: string)` — matches App.tsx and TableView toolbar
- `TableViewRow` from `database.ts` used in braidrIpc.ts handlers (Task 3)
