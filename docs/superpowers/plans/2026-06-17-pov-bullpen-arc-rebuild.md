# POV Bullpen Arc-Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the POV view's bullpen to match the old arc bullpen's compact grouped layout, and add a persisted "previous location" tag on each set-aside scene.

**Architecture:** The previous-location pointer is a structural scenes-table column (`previous_plot_point_id`), written atomically inside the existing `scene.move` mutation and read alongside `plot_point_id`. The POV `BullpenPanel` is rewritten in place to the arc layout, reusing the existing `arc-bullpen-*` CSS, with both an inline Return button and an arc-style right-click context menu.

**Tech Stack:** Electron + React (Vite), TypeScript, better-sqlite3, vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-pov-bullpen-arc-rebuild-design.md`

---

## Task 1: Persist previous location in `scene.move`

Backend persistence foundation. TDD via the existing `scene.move` vitest harness.

**Files:**
- Modify: `src/shared/types.ts` (Scene interface, ~line 10-31)
- Modify: `src/main/database.ts` (scenes CREATE TABLE ~line 87-101; `migrate()` ~line 442-451)
- Modify: `src/main/mutations.ts` (`scene.move` run, ~line 695-762)
- Modify: `src/main/braidrIpc.ts` (scene mapping, ~line 288)
- Test: `src/__tests__/sceneMove.test.ts`

- [ ] **Step 1: Write the failing test**

Append these tests inside the `describe('scene.move', ...)` block in `src/__tests__/sceneMove.test.ts` (the `seed`/`outline` helpers already exist; add a small local reader for the new column):

```typescript
  function prevOf(db: BraidrDB, id: string): string | null {
    return (db.getScene(id) as unknown as { previous_plot_point_id: string | null }).previous_plot_point_id;
  }

  it('records previous_plot_point_id when a sectioned scene moves to the bullpen', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: null, afterSceneId: null });
    expect(prevOf(db, 's1')).toBe('A');
    db.close();
  });

  it('clears previous_plot_point_id when a scene returns to a section', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: null, afterSceneId: null });
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: 'B', afterSceneId: 's4' });
    expect(prevOf(db, 's1')).toBeNull();
    db.close();
  });

  it('preserves previous_plot_point_id when reordering within the bullpen', async () => {
    const db = await seed(dir);
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: null, afterSceneId: null });
    // s1 and s5 are both in the bullpen now; reorder s1 after s5 (still bullpen)
    db.mutate('scene.move', { sceneId: 's1', toPlotPointId: null, afterSceneId: 's5' });
    expect(prevOf(db, 's1')).toBe('A');
    db.close();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- sceneMove`
Expected: the three new tests FAIL — `previous_plot_point_id` is `undefined` (column does not exist yet).

- [ ] **Step 3: Add the column to the scenes schema**

In `src/main/database.ts`, in the `CREATE TABLE IF NOT EXISTS scenes (...)` block, add the column after `scene_order INTEGER NOT NULL DEFAULT 0` (line ~100). Add a comma to the prior line:

```sql
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    scene_order INTEGER NOT NULL DEFAULT 0,
    previous_plot_point_id TEXT
```

- [ ] **Step 4: Add the migration guard**

In `src/main/database.ts`, inside `migrate()`, after the `scene_order` guard (line ~451, before the `DROP TABLE ... braided_chapters` line), add:

```typescript
    if (!sceneColumns.includes('previous_plot_point_id')) {
      this.db.exec('ALTER TABLE scenes ADD COLUMN previous_plot_point_id TEXT');
    }
```

- [ ] **Step 5: Write previous_plot_point_id inside `scene.move`**

In `src/main/mutations.ts`, in the `scene.move` `run`:

(a) Extend the initial scene SELECT (line ~697-699) to fetch the column, and widen the cast:

```typescript
    const scene = db
      .prepare('SELECT id, character_id, plot_point_id, scene_number, timeline_position, previous_plot_point_id FROM scenes WHERE id = ?')
      .get(sceneId) as (SceneOrderRow & { character_id: string; previous_plot_point_id: string | null }) | undefined;
```

(b) Just before the `UPDATE scenes SET ...` statement (line ~760), compute the new value:

```typescript
    // Record where a scene came from when it enters the bullpen (so the POV
    // bullpen can show a "previous location" tag); clear it on the way out.
    // Reordering within the bullpen preserves the existing value.
    const newPreviousPlotPointId = movingToBullpen
      ? (scene.plot_point_id ?? scene.previous_plot_point_id)
      : null;
```

(c) Replace the `UPDATE scenes SET ...` statement to include the new column:

```typescript
    db.prepare(
      'UPDATE scenes SET plot_point_id = ?, timeline_position = ?, parent_node_id = ?, outline_key = ?, previous_plot_point_id = ?, updated_at = ? WHERE id = ?'
    ).run(toPlotPointId, newTimeline, parentNode, outlineKey, newPreviousPlotPointId, Date.now(), sceneId);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- sceneMove`
Expected: all `scene.move` tests PASS (the three new ones plus the pre-existing ones).

- [ ] **Step 7: Add the field to the Scene type**

In `src/shared/types.ts`, in the `Scene` interface, after `plotPointId: string | null;` (line ~20) add:

```typescript
  previousPlotPointId: string | null; // section this scene was set aside from (bullpen tag)
```

- [ ] **Step 8: Map the column when building Scene objects**

In `src/main/braidrIpc.ts`, in the `sceneRows.map(...)` object (after `plotPointId: row.plot_point_id,`, line ~288) add:

```typescript
        previousPlotPointId: row.previous_plot_point_id ?? null,
```

Then add `previous_plot_point_id` to the `SceneRow` interface in `src/main/database.ts` (the interface around line 1618-1626) — append to the `chapter_id ... scene_order` line:

```typescript
  chapter_id: string | null; scene_order: number; previous_plot_point_id: string | null;
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no new errors referencing `previousPlotPointId` / `previous_plot_point_id`. (Pre-existing unused-var errors elsewhere are out of scope — note them but do not fix.)

A new typecheck error will appear: every object literal building a `Scene` must now supply `previousPlotPointId`. Fix each by adding `previousPlotPointId: null,` (or the scene's existing value). Find them with:

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i previousPlotPointId`
For each reported file/line, add `previousPlotPointId: null,` to the Scene literal. Re-run `npm run typecheck` until clean of `previousPlotPointId` errors.

- [ ] **Step 10: Commit**

```bash
git add src/shared/types.ts src/main/database.ts src/main/mutations.ts src/main/braidrIpc.ts src/__tests__/sceneMove.test.ts
git commit -m "feat(bullpen): persist scene previous_plot_point_id via scene.move

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Feed the persisted field through App.tsx, retire in-memory state

Replace the in-memory `previousPlotPointIds` map with the persisted Scene field.

**Files:**
- Modify: `src/renderer/App.tsx` (state decl ~line 153; `handleSetAside` ~line 2480-2482; `BullpenPanel` usage ~line 4288-4298)

- [ ] **Step 1: Remove the in-memory state declaration**

In `src/renderer/App.tsx`, delete line ~153:

```typescript
  const [previousPlotPointIds, setPreviousPlotPointIds] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Remove the bookkeeping in `handleSetAside`**

In `handleSetAside` (~line 2480-2482), delete:

```typescript
    if (scene.plotPointId) {
      setPreviousPlotPointIds(prev => ({ ...prev, [sceneId]: scene.plotPointId! }));
    }
```

(The persistence now happens in the `scene.move` mutation invoked later in this same handler.)

- [ ] **Step 3: Derive the map from persisted scene data at the BullpenPanel call site**

In `src/renderer/App.tsx`, replace the `previousPlotPointIds={previousPlotPointIds}` prop (line ~4294) with a value derived from the scenes themselves. Just above the `<BullpenPanel` JSX (line ~4288), add a derivation, then pass it:

```typescript
                {(() => {
                  const bullpenScenes = displayedScenes.filter(s => !s.plotPointId);
                  const previousPlotPointIds: Record<string, string> = {};
                  for (const s of bullpenScenes) {
                    if (s.previousPlotPointId) previousPlotPointIds[s.id] = s.previousPlotPointId;
                  }
                  return (
                <BullpenPanel
                  scenes={bullpenScenes}
                  plotPoints={displayedPlotPoints}
                  getCharacterName={getCharacterName}
                  onReturnScene={handleReturnFromBullpen}
                  onSceneChange={handleSceneChange}
                  previousPlotPointIds={previousPlotPointIds}
                  onAddScene={handleAddBullpenScene}
                  onDeleteScene={handleArchiveScene}
                  bullpenSections={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId && pp.inBullpen)}
                  sectionScenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId && s.plotPointId !== null && projectData.plotPoints.find(p => p.id === s.plotPointId)?.inBullpen)}
                />
                  );
                })()}
```

Note: `onDeleteScene={handleArchiveScene}` is a new prop consumed in Task 3 (right-click Delete). `handleArchiveScene` already exists (App.tsx ~line 3539).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors referencing `previousPlotPointIds` or `BullpenPanel`. (The `onDeleteScene` prop is added to `BullpenPanelProps` in Task 3; until then this may show one error on the `<BullpenPanel>` prop — acceptable mid-stack, resolved in Task 3. If executing tasks strictly independently, do Task 3 before re-running.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "refactor(bullpen): derive previous-location from persisted scene field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rebuild `BullpenPanel.tsx` to the arc layout + tag + context menu

Rewrite the POV bullpen component. Reuses `arc-bullpen-*` CSS; adds a `.bullpen-prev-tag` pill.

**Files:**
- Modify (full rewrite): `src/renderer/components/BullpenPanel.tsx`
- Modify: `src/renderer/index.css` (or wherever `.arc-bullpen-*` lives — confirm with grep below)

- [ ] **Step 1: Locate the arc-bullpen CSS**

Run: `grep -rln "arc-bullpen-row" src/renderer --include=*.css`
Expected: one CSS file. Add the new `.bullpen-prev-tag` rule there (Step 3). Also confirm `.bullpen-panel`, `.bullpen-resize-handle`, `.bullpen-expand-btn`, `.bullpen-add-scene-btn` still exist (the rewrite keeps these outer classes).

- [ ] **Step 2: Rewrite `BullpenPanel.tsx`**

Replace the entire contents of `src/renderer/components/BullpenPanel.tsx` with:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Scene, PlotPoint } from '../../shared/types';
import { useResizableWidth } from '../utils/useResizableWidth';
import { cleanSceneTitle } from '../utils/sceneTitle';
import SectionPickerDropdown from './SectionPickerDropdown';

// Right-click menu mirroring ArcBullpenPanel's: Assign to Section ▶ / Delete.
function BullpenContextMenu({ x, y, sections, onAssignToSection, onDelete, onClose }: {
  x: number; y: number;
  sections: PlotPoint[];
  onAssignToSection: (sectionId: string) => void;
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
  return (
    <div ref={ref} className="arc-context-menu" style={{ left: x, top: y }}>
      <div className="arc-context-item" onMouseEnter={() => setShowSubmenu(true)} onMouseLeave={() => setShowSubmenu(false)}>
        Assign to Section ▶
        {showSubmenu && (
          <div className="arc-context-submenu">
            {sections.length === 0 && (
              <div className="arc-context-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>No sections yet</div>
            )}
            {sections.map(s => (
              <div key={s.id} className="arc-context-item" onClick={() => onAssignToSection(s.id)}>
                {s.title || 'Unnamed section'}
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

function DraggableBullpenScene({ scene, prevSectionTitle, onContextMenu, children }: {
  scene: Scene;
  prevSectionTitle?: string | null;
  onContextMenu: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
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
      <span className="arc-bullpen-label">{cleanSceneTitle(scene.title) || 'Untitled scene'}</span>
      {prevSectionTitle && <span className="bullpen-prev-tag" title="Previous location">was: {prevSectionTitle}</span>}
      {children}
    </div>
  );
}

interface BullpenPanelProps {
  scenes: Scene[];
  plotPoints: PlotPoint[];
  getCharacterName: (characterId: string) => string;
  onReturnScene: (sceneId: string, targetPlotPointId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  previousPlotPointIds?: Record<string, string>;
  onAddScene?: () => void;
  onDeleteScene?: (sceneId: string) => void;
  bullpenSections?: PlotPoint[];
  sectionScenes?: Scene[];
}

function BullpenPanel({
  scenes,
  plotPoints,
  onReturnScene,
  previousPlotPointIds,
  onAddScene,
  onDeleteScene,
  bullpenSections = [],
  sectionScenes = [],
}: BullpenPanelProps) {
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('bullpen-collapsed') === '1');
  const setPanelCollapsed = (v: boolean) => { setCollapsed(v); localStorage.setItem('bullpen-collapsed', v ? '1' : '0'); };
  const { width, onPointerDown } = useResizableWidth('bullpen-width', 280, { min: 180, max: 640 });
  const { setNodeRef, isOver } = useDroppable({ id: 'bullpen' });
  const toggleSection = (id: string) => setCollapsedSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const sectionTitle = (id?: string): string | null => {
    if (!id) return null;
    const pp = plotPoints.find(p => p.id === id);
    return pp ? (pp.title || 'Untitled section') : null;
  };

  if (collapsed) {
    return (
      <div ref={setNodeRef} className={`bullpen-panel collapsed ${isOver ? 'drag-over' : ''}`}>
        <button className="bullpen-expand-btn" onClick={() => setPanelCollapsed(false)} title="Show bullpen">
          <span className="bullpen-expand-chev">«</span>
          <span className="bullpen-expand-label">Bullpen</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={`bullpen-panel ${isOver ? 'drag-over' : ''}`} style={{ width, minWidth: width }}>
      <div className="bullpen-resize-handle" onPointerDown={onPointerDown} title="Drag to resize" />
      <div className="arc-bullpen-header">
        <span className="arc-bullpen-title">Bullpen</span>
        <button className="bullpen-collapse-btn" onClick={() => setPanelCollapsed(true)} title="Hide bullpen">»</button>
      </div>

      {bullpenSections.length > 0 && (
        <div className="arc-bullpen-group">
          <div className="arc-bullpen-group-label">Sections<span className="arc-bullpen-count">{bullpenSections.length}</span></div>
          {bullpenSections.map(sec => {
            const secScenes = sectionScenes.filter(s => s.plotPointId === sec.id);
            const expanded = !collapsedSections.has(sec.id);
            return (
              <div key={sec.id} className="arc-bullpen-section-group">
                <div className="arc-bullpen-row arc-bullpen-section" onClick={() => secScenes.length && toggleSection(sec.id)}>
                  <span className="arc-bullpen-sec-toggle">{secScenes.length ? (expanded ? '▾' : '▸') : ''}</span>
                  <span className="arc-bullpen-label">{sec.title || 'Untitled section'}</span>
                  {secScenes.length > 0 && <span className="arc-bullpen-count">{secScenes.length}</span>}
                </div>
                {expanded && secScenes.map(s => (
                  <div key={s.id} className="arc-bullpen-row arc-bullpen-row-nested">
                    <span className="arc-bullpen-label">{cleanSceneTitle(s.title) || 'Untitled scene'}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="arc-bullpen-group">
        <div className="arc-bullpen-group-label">Scenes<span className="arc-bullpen-count">{scenes.length}</span></div>
        {scenes.length === 0 && bullpenSections.length === 0 && (
          <div className="bullpen-empty">Scenes you set aside or create here will appear in this list.</div>
        )}
        {scenes.map(scene => (
          <DraggableBullpenScene
            key={scene.id}
            scene={scene}
            prevSectionTitle={sectionTitle(previousPlotPointIds?.[scene.id])}
            onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, sceneId: scene.id }); }}
          >
            <span className="bullpen-scene-actions">
              <button
                className="outline-scene-action-btn bullpen-return-btn"
                onClick={() => setPickerSceneId(pickerSceneId === scene.id ? null : scene.id)}
              >
                Return
              </button>
              {pickerSceneId === scene.id && (
                <SectionPickerDropdown
                  plotPoints={plotPoints}
                  previousPlotPointId={previousPlotPointIds?.[scene.id]}
                  onSelect={(plotPointId) => { onReturnScene(scene.id, plotPointId); setPickerSceneId(null); }}
                  onClose={() => setPickerSceneId(null)}
                />
              )}
            </span>
          </DraggableBullpenScene>
        ))}
      </div>

      {onAddScene && (
        <button className="bullpen-add-scene-btn" onClick={onAddScene}>+ Add Scene</button>
      )}

      {contextMenu && (
        <BullpenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sections={plotPoints.filter(p => !p.inBullpen)}
          onAssignToSection={(sectionId) => { onReturnScene(contextMenu.sceneId, sectionId); setContextMenu(null); }}
          onDelete={() => { onDeleteScene?.(contextMenu.sceneId); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default BullpenPanel;
```

- [ ] **Step 3: Add the `.bullpen-prev-tag` CSS**

In the CSS file found in Step 1, add (mirror the muted-pill look of the arc tags):

```css
.bullpen-prev-tag {
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  border-radius: 9px;
  background: var(--bg-subtle, rgba(127, 127, 127, 0.16));
  color: var(--text-muted, #888);
  white-space: nowrap;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean of any `BullpenPanel` / `previousPlotPointId` / `onDeleteScene` errors. `OutlineSceneRow` and `getCharacterName`/`onSceneChange` are no longer used by this component — confirm no other file imported helpers from `BullpenPanel` (it only has a default export). Remove the now-unused `getCharacterName`/`onSceneChange` from the destructure if eslint flags them (they remain in the props interface for call-site compatibility).

- [ ] **Step 5: Lint**

Run: `npm run lint -- src/renderer/components/BullpenPanel.tsx`
Expected: no new errors for this file.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/BullpenPanel.tsx src/renderer/index.css
git commit -m "feat(bullpen): arc-style POV bullpen layout, prev-location tag, right-click menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Manual verification in the Electron app

No automated UI tests in this project — verify in the running app (per project convention: iterate in the actual Electron app, not browser mockups).

**Files:** none

- [ ] **Step 1: Build-check and launch**

Run: `npm run typecheck && npm test`
Expected: typecheck clean of feature-related errors; all tests pass (including the three new `scene.move` tests).

Then launch the app (use the project's run skill / `npm run dev` or the Electron dev command) and open a project with at least one POV character that has sectioned scenes.

- [ ] **Step 2: Walk the verification checklist**

Confirm each, in the POV view bullpen:
1. Set aside a sectioned scene (set-aside button) → it appears in the **Scenes** group as a compact one-line row with a `was: <section>` tag.
2. Reload the project (close/reopen) → the tag persists.
3. Click **Return** → picker pre-highlights the previous section; selecting a section moves the scene out; it lands at the end of the target section.
4. Right-click a bullpen scene → **Assign to Section ▶** submenu lists non-bullpen sections; choosing one returns the scene. **Delete** archives it.
5. After returning a scene and setting it aside again from a *different* section → tag shows the new section.
6. **Drag** a scene into the bullpen (not the button) → the `was:` tag also appears (proves the `scene.move` path covers drag).
7. Set-aside sections (`inBullpen`) still render in the **Sections** group with expand/collapse and nested scene rows.
8. Collapse/expand the panel and resize it → still work.
9. Set aside a scene, then delete its previous section elsewhere → tag disappears, no crash.

- [ ] **Step 3: Update feature docs**

Per CLAUDE.md, update `docs/features.md` for the bullpen change. Add/adjust the bullpen entry to note: arc-style grouped layout, persisted "previous location" tag, and both Return + right-click Assign-to-Section. Match the file's existing format.

- [ ] **Step 4: Commit**

```bash
git add docs/features.md
git commit -m "docs: note POV bullpen rebuild in features.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** layout rewrite (Task 3) · previous-location tag (Tasks 1+3) · persistence via `scene.move` + schema/migrate/read (Task 1) · both Return + right-click (Task 3) · retire in-memory state (Task 2) · migration safety + manual checks (Task 4). All spec sections mapped.
- **Out-of-scope honored:** no "+ New Section", no Act-assignment, no Character Hub footer, no edits to `ArcBullpenPanel.tsx`.
- **Type consistency:** `previousPlotPointId` (camel, Scene/TS) vs `previous_plot_point_id` (snake, SQL/rows) used consistently; `onDeleteScene` prop defined in Task 3's `BullpenPanelProps` and passed in Task 2.
