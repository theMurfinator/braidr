# POV Hide Scenes Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar toggle to the POV view that hides all scene rows, leaving only section headers and their synopsis textareas visible.

**Architecture:** Add a `hideScenes: Record<string, boolean>` state to App.tsx (keyed by tab ID, same pattern as `hideSectionHeaders`), pass it as a prop to `PovOutlineView`, and add a toolbar button alongside the existing "Sections" button. Inside `PovOutlineView`, when `hideScenes` is true, skip rendering scene rows and force the section synopsis textarea visible.

**Tech Stack:** React, TypeScript, Electron (renderer process only — no IPC changes)

---

### Task 1: Add `hideScenes` prop to PovOutlineView and hide scene rows

**Files:**
- Modify: `src/renderer/components/PovOutlineView.tsx`

- [ ] **Step 1: Add `hideScenes` to the props interface**

In `PovOutlineView.tsx`, the `PovOutlineViewProps` interface starts at line 11. Add the new prop after `povReorderedScenes`:

```typescript
interface PovOutlineViewProps {
  sections: PlotPoint[];
  scenes: Scene[];
  synopsisModes: Record<string, 'inline' | 'expand'>;
  hideHeaders: boolean;
  hideScenes?: boolean;
  onSetAside: (sceneId: string) => void;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onOpenInEditor?: (sceneId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
  getCharacterName?: (characterId: string) => string;
  chapters?: Chapter[];
  onAssignSceneToChapter?: (sceneId: string, chapterId: string | null, sceneOrder: number) => void;
  povReorderedScenes?: Set<string>;
}
```

- [ ] **Step 2: Destructure `hideScenes` in the component body**

In the `PovOutlineView` function body (around line 218), add `hideScenes` to the destructured props:

```typescript
export default function PovOutlineView(props: PovOutlineViewProps) {
  const {
    sections,
    scenes,
    synopsisModes,
    hideHeaders,
    hideScenes,
    onSetAside,
    onToggleSynopsisMode,
    onSceneChange,
    onOpenInEditor,
    onSectionChange,
    onDeleteSection,
    getCharacterName,
    chapters,
    povReorderedScenes,
  } = props;
```

- [ ] **Step 3: Force `descVisible` true in SectionHeader when `hideScenes` is active**

`SectionHeader` is a local component in PovOutlineView.tsx. It needs to know when scenes are hidden so it can force the synopsis visible. Add a `hideScenes` prop to `SectionHeaderProps` and the `SectionHeader` function:

```typescript
interface SectionHeaderProps {
  section: PlotPoint;
  sceneCount: number;
  synopsisMode: 'inline' | 'expand' | undefined;
  hideScenes?: boolean;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

function SectionHeader({
  section,
  sceneCount,
  synopsisMode,
  hideScenes,
  onToggleSynopsisMode,
  onSectionChange,
  onDeleteSection,
  dragHandleProps,
}: SectionHeaderProps) {
```

Then update the `descVisible` line (around line 112) inside `SectionHeader`:

```typescript
const descVisible = hideScenes || synopsisMode !== 'expand';
```

- [ ] **Step 4: Pass `hideScenes` to `SectionHeader` inside the render loop**

In the section map (around line 280), pass the new prop:

```typescript
{!hideHeaders && (
  <SectionHeader
    section={section}
    sceneCount={sectionScenes.length}
    synopsisMode={synopsisModes[section.id]}
    hideScenes={hideScenes}
    onToggleSynopsisMode={onToggleSynopsisMode}
    onSectionChange={onSectionChange}
    onDeleteSection={onDeleteSection}
    dragHandleProps={{ ...sectionSortable.attributes, ...sectionSortable.listeners }}
  />
)}
```

- [ ] **Step 5: Wrap scene rendering in a `hideScenes` guard**

The section body (inside the IIFE starting around line 291) renders scenes in two branches: with chapters and without. Wrap the entire `SortableContext` + scene content in a guard so nothing renders when `hideScenes` is true:

```typescript
return (
  <>
    {!hideScenes && (
      <SortableContext items={orderedSectionIds} strategy={verticalListSortingStrategy}>
        {sceneRenderContent}
      </SortableContext>
    )}
  </>
);
```

Note: `orderedSectionIds` and `sceneRenderContent` are still computed (inside the IIFE) even when hidden. That's fine — they're cheap memos and dnd-kit needs no cleanup.

- [ ] **Step 6: Verify the app compiles**

```bash
cd /Users/brian/braidr && npm run build:vite 2>&1 | tail -20
```

Expected: no TypeScript errors related to `PovOutlineView` or `SectionHeader`.

- [ ] **Step 7: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/components/PovOutlineView.tsx
git commit -m "feat: add hideScenes prop to PovOutlineView"
```

---

### Task 2: Wire state and toolbar button in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add `hideScenes` state**

On line 145 of App.tsx, alongside `hideSectionHeaders`, add:

```typescript
const [hideSectionHeaders, setHideSectionHeaders] = useState<Record<string, boolean>>({});
const [hideScenes, setHideScenes] = useState<Record<string, boolean>>({});
```

- [ ] **Step 2: Pass `hideScenes` to PovOutlineView**

Around line 3292 where `PovOutlineView` is rendered, add the new prop:

```typescript
<PovOutlineView
  sections={displayedPlotPoints}
  scenes={displayedScenes.filter(s => s.plotPointId !== null)}
  chapters={chapters}
  onAssignSceneToChapter={handleAssignSceneToChapter}
  synopsisModes={sectionSynopsisModes}
  hideHeaders={hideSectionHeaders[tabId] ?? false}
  hideScenes={hideScenes[tabId] ?? false}
  onSetAside={handleSetAside}
  onToggleSynopsisMode={handleToggleSynopsisMode}
  onSceneChange={handleSceneChange}
  onOpenInEditor={handleOpenInEditor}
  onSectionChange={handlePlotPointChange}
  onDeleteSection={handleDeletePlotPoint}
  getCharacterName={getCharacterName}
  povReorderedScenes={povReorderedScenes}
/>
```

- [ ] **Step 3: Add the "Scenes" toolbar button**

Around line 3728, the existing "Sections" button looks like:

```typescript
<button
  className={`toolbar-btn ${!(hideSectionHeaders[activeTab.id] ?? false) ? 'active' : ''}`}
  onClick={() => setHideSectionHeaders(prev => ({ ...prev, [activeTab.id]: !(prev[activeTab.id] ?? false) }))}
  title={(hideSectionHeaders[activeTab.id] ?? false) ? 'Show Sections' : 'Hide Sections'}
>
  Sections
</button>
```

Add the "Scenes" button immediately after it:

```typescript
<button
  className={`toolbar-btn ${!(hideScenes[activeTab.id] ?? false) ? 'active' : ''}`}
  onClick={() => setHideScenes(prev => ({ ...prev, [activeTab.id]: !(prev[activeTab.id] ?? false) }))}
  title={(hideScenes[activeTab.id] ?? false) ? 'Show Scenes' : 'Hide Scenes'}
>
  Scenes
</button>
```

- [ ] **Step 4: Verify the app compiles**

```bash
cd /Users/brian/braidr && npm run build:vite 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 5: Manual verification**

Start the app with `npm run dev` and open a project:

1. Go to the POV view. Confirm a "Scenes" button appears in the toolbar next to "Sections".
2. Click "Scenes" — all scene rows should disappear, leaving only section headers and their synopsis textareas.
3. Click a synopsis textarea and type — editing should work normally.
4. Confirm that a section whose chevron was previously clicked to hide its synopsis now shows the synopsis anyway (because `hideScenes` forces it visible).
5. Click "Scenes" again — all scene rows return.
6. Confirm the "Sections" button still works independently.
7. Confirm the "Show synopses" / "Hide synopses" toolbar buttons still work when scenes are visible.

- [ ] **Step 6: Commit**

```bash
cd /Users/brian/braidr
git add src/renderer/App.tsx
git commit -m "feat: POV hide-scenes toggle in toolbar"
```
