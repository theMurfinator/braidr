# POV Outline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-based POV view with a clean Obsidian-style outline — compact scene rows, per-section synopsis toggles, draggable scenes, and a bullpen panel for parking scenes.

**Architecture:** Three new components (`OutlineSceneRow`, `BullpenPanel`, `SectionPickerDropdown`) plus modifications to `PlotPointSection` and `App.tsx`. Data model unchanged — bullpen uses existing `plotPointId === null` mechanism. Presentation-layer only change.

**Tech Stack:** React (jsx transform — no React import), TypeScript, CSS (existing custom properties)

---

### Task 1: Create OutlineSceneRow Component

**Files:**
- Create: `src/renderer/components/OutlineSceneRow.tsx`

This is the core building block — a compact scene row with inline number, editable title, character tag, and expandable synopsis.

- [ ] **Step 1: Create the component file with props interface and basic structure**

```tsx
import { useState, useRef, useEffect } from 'react';
import { Scene } from '../../shared/types';

interface OutlineSceneRowProps {
  scene: Scene;
  displayNumber?: number;
  characterName?: string;
  synopsisVisible: boolean;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onSetAside?: (sceneId: string) => void;
  onDragStart: (scene: Scene) => void;
  onDragEnd: () => void;
  onOpenInEditor?: (sceneKey: string) => void;
  expandMode: boolean;
  isDragging?: boolean;
  dropPosition?: 'above' | 'below' | null;
}

function OutlineSceneRow({
  scene,
  displayNumber,
  characterName,
  synopsisVisible,
  onSceneChange,
  onSetAside,
  onDragStart,
  onDragEnd,
  onOpenInEditor,
  expandMode,
  isDragging,
  dropPosition,
}: OutlineSceneRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(scene.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const canDragRef = useRef(false);

  useEffect(() => {
    setTitleValue(scene.title);
  }, [scene.title]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    const resetDrag = () => { canDragRef.current = false; };
    document.addEventListener('mouseup', resetDrag);
    return () => document.removeEventListener('mouseup', resetDrag);
  }, []);

  const cleanContent = (text: string) =>
    text.replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '').replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleValue !== scene.title) {
      const newContent = scene.content.replace(cleanContent(scene.content), titleValue);
      onSceneChange(scene.id, newContent || titleValue, scene.notes);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setTitleValue(scene.title);
      setEditingTitle(false);
    }
  };

  const synopsisText = scene.notes.join('\n');
  const showSynopsis = expandMode ? expanded : synopsisVisible;

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.outline-scene-title-input, .outline-scene-synopsis-input, .outline-scene-action-btn, .outline-scene-drag-handle')) return;
    if (expandMode) {
      setExpanded(!expanded);
    }
  };

  const handleSynopsisBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value.split('\n').filter(line => line.trim());
    if (e.target.value !== synopsisText) {
      onSceneChange(scene.id, scene.content, newNotes.length > 0 ? newNotes : []);
    }
  };

  const rowClasses = [
    'outline-scene-row',
    isDragging ? 'dragging' : '',
    dropPosition === 'above' ? 'drop-above' : '',
    dropPosition === 'below' ? 'drop-below' : '',
    showSynopsis ? 'synopsis-visible' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={rowClasses}
      draggable="true"
      onDragStart={(e) => {
        if (canDragRef.current) {
          onDragStart(scene);
        } else {
          e.preventDefault();
        }
      }}
      onDragEnd={() => {
        onDragEnd();
        canDragRef.current = false;
      }}
      onClick={handleRowClick}
      data-scene-id={scene.id}
    >
      <div className="outline-scene-main">
        <span
          className="outline-scene-drag-handle"
          onMouseDown={() => { canDragRef.current = true; }}
        >
          ⋮⋮
        </span>
        {displayNumber !== undefined && (
          <span className="outline-scene-number">{displayNumber}.</span>
        )}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="outline-scene-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
          />
        ) : (
          <span
            className="outline-scene-title"
            onClick={() => setEditingTitle(true)}
          >
            {scene.title || cleanContent(scene.content) || 'Untitled scene'}
          </span>
        )}
        {characterName && (
          <span className="outline-scene-tag">{characterName}</span>
        )}
        <span className="outline-scene-hover-actions">
          {onOpenInEditor && (
            <button
              className="outline-scene-action-btn"
              onClick={(e) => { e.stopPropagation(); onOpenInEditor(scene.id); }}
            >
              Open
            </button>
          )}
          {onSetAside && (
            <button
              className="outline-scene-action-btn"
              onClick={(e) => { e.stopPropagation(); onSetAside(scene.id); }}
            >
              Set aside
            </button>
          )}
        </span>
      </div>
      <div className={`outline-scene-synopsis ${showSynopsis ? 'open' : ''}`}>
        <textarea
          className="outline-scene-synopsis-input"
          defaultValue={synopsisText}
          onBlur={handleSynopsisBlur}
          placeholder="Write a synopsis..."
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
      </div>
    </div>
  );
}

export default OutlineSceneRow;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit --skipLibCheck 2>&1 | grep OutlineSceneRow`
Expected: No errors from this file (pre-existing errors elsewhere are fine)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/OutlineSceneRow.tsx
git commit -m "feat(pov): add OutlineSceneRow component for outline-style POV view"
```

---

### Task 2: Create SectionPickerDropdown Component

**Files:**
- Create: `src/renderer/components/SectionPickerDropdown.tsx`

Small popover for choosing which section to return a bullpen scene to.

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef } from 'react';
import { PlotPoint } from '../../shared/types';

interface SectionPickerDropdownProps {
  plotPoints: PlotPoint[];
  onSelect: (plotPointId: string) => void;
  onClose: () => void;
}

function SectionPickerDropdown({ plotPoints, onSelect, onClose }: SectionPickerDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const sorted = [...plotPoints].sort((a, b) => a.order - b.order);

  return (
    <div className="section-picker-dropdown" ref={ref}>
      <div className="section-picker-header">Move to section</div>
      {sorted.map((pp) => (
        <button
          key={pp.id}
          className="section-picker-item"
          onClick={() => onSelect(pp.id)}
        >
          {pp.title}
        </button>
      ))}
      {sorted.length === 0 && (
        <div className="section-picker-empty">No sections available</div>
      )}
    </div>
  );
}

export default SectionPickerDropdown;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit --skipLibCheck 2>&1 | grep SectionPickerDropdown`
Expected: No errors from this file

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SectionPickerDropdown.tsx
git commit -m "feat(pov): add SectionPickerDropdown for bullpen scene placement"
```

---

### Task 3: Create BullpenPanel Component

**Files:**
- Create: `src/renderer/components/BullpenPanel.tsx`

Right sidebar showing parked scenes (plotPointId === null).

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { Scene, PlotPoint } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';
import SectionPickerDropdown from './SectionPickerDropdown';

interface BullpenPanelProps {
  scenes: Scene[];
  plotPoints: PlotPoint[];
  getCharacterName: (characterId: string) => string;
  onReturnScene: (sceneId: string, targetPlotPointId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onSceneDrop: (sceneId: string) => void;
  draggedScene: Scene | null;
  onDragStart: (scene: Scene) => void;
  onDragEnd: () => void;
}

function BullpenPanel({
  scenes,
  plotPoints,
  getCharacterName,
  onReturnScene,
  onSceneChange,
  onSceneDrop,
  draggedScene,
  onDragStart,
  onDragEnd,
}: BullpenPanelProps) {
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHover(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDropHover(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    if (draggedScene && draggedScene.plotPointId !== null) {
      onSceneDrop(draggedScene.id);
    }
  };

  return (
    <div
      className={`bullpen-panel ${dropHover ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="bullpen-header">
        <span className="bullpen-label">Bullpen</span>
        <span className="bullpen-count">{scenes.length}</span>
      </div>

      {scenes.length === 0 ? (
        <div className="bullpen-empty">
          Drag scenes here to set them aside for later.
        </div>
      ) : (
        scenes.map((scene) => (
          <div key={scene.id} className="bullpen-scene-wrapper">
            <OutlineSceneRow
              scene={scene}
              characterName={getCharacterName(scene.characterId)}
              synopsisVisible={true}
              onSceneChange={onSceneChange}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              expandMode={false}
            />
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
                  onSelect={(plotPointId) => {
                    onReturnScene(scene.id, plotPointId);
                    setPickerSceneId(null);
                  }}
                  onClose={() => setPickerSceneId(null)}
                />
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default BullpenPanel;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit --skipLibCheck 2>&1 | grep BullpenPanel`
Expected: No errors from this file

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/BullpenPanel.tsx
git commit -m "feat(pov): add BullpenPanel sidebar for parked scenes"
```

---

### Task 4: Add Outline Mode to PlotPointSection

**Files:**
- Modify: `src/renderer/components/PlotPointSection.tsx`

Add `outlineMode` prop that renders `OutlineSceneRow` instead of `SceneCard`, and add per-section synopsis toggle chevron.

- [ ] **Step 1: Add new imports and props**

At the top of `PlotPointSection.tsx`, add the import:

```tsx
import OutlineSceneRow from './OutlineSceneRow';
```

Add these new props to the `PlotPointSectionProps` interface, after the existing `onDateChange` prop:

```tsx
  // Outline mode props
  outlineMode?: boolean;
  synopsisMode?: 'inline' | 'expand';
  onToggleSynopsisMode?: (plotPointId: string) => void;
  onSetAside?: (sceneId: string) => void;
  getCharacterName?: (characterId: string) => string;
```

Add to the function destructuring: `outlineMode, synopsisMode, onToggleSynopsisMode, onSetAside, getCharacterName`

- [ ] **Step 2: Add synopsis chevron to section header**

In the header rendering section (the `{!hideHeader && (` block), add a chevron button before the existing title. Replace the opening of the header div:

Find:
```tsx
        {!hideHeader && (
          <div className="plot-point-header">
            {(onMoveUp || onMoveDown) && (
```

Replace with:
```tsx
        {!hideHeader && (
          <div className={`plot-point-header ${outlineMode ? 'outline-mode' : ''}`}>
            {outlineMode && onToggleSynopsisMode && (
              <button
                className={`section-synopsis-chevron ${synopsisMode === 'expand' ? 'collapsed' : ''}`}
                onClick={() => onToggleSynopsisMode(plotPoint.id)}
                title={synopsisMode === 'expand' ? 'Show synopses' : 'Hide synopses'}
              >
                ▾
              </button>
            )}
            {(onMoveUp || onMoveDown) && (
```

- [ ] **Step 3: Add outline mode scene rendering**

Replace the scene rendering block. Find the `{sortedScenes.map((scene, index) => (` block (lines 288-413) and wrap it in a conditional:

Find:
```tsx
      {sortedScenes.map((scene, index) => (
        <div key={scene.id} className="pov-scene-wrapper" data-scene-id={scene.id}>
```

Add an `outlineMode` branch before the existing rendering. Insert this block just before `{sortedScenes.map(`:

```tsx
      {outlineMode ? (
        <>
          {sortedScenes.map((scene) => (
            <OutlineSceneRow
              key={scene.id}
              scene={scene}
              displayNumber={scene.sceneNumber}
              characterName={getCharacterName?.(scene.characterId)}
              synopsisVisible={synopsisMode !== 'expand'}
              onSceneChange={onSceneChange || (() => {})}
              onSetAside={onSetAside}
              onDragStart={(s) => onSceneDragStart?.(s)}
              onDragEnd={() => onSceneDragEnd?.()}
              onOpenInEditor={onOpenInEditor}
              expandMode={synopsisMode === 'expand'}
              isDragging={draggedScene?.id === scene.id}
            />
          ))}
        </>
      ) : (
```

Then after the closing `)}` of the existing `sortedScenes.map` block (after line 413's `</div>`), close the ternary:

```tsx
      )}
```

Note: The existing drop zones inside the old map block stay for non-outline mode. In outline mode, we rely on the `OutlineSceneRow`'s own drag events.

- [ ] **Step 4: Add drop zone handling for outline mode**

Add drag-over and drop handling to the section container div for outline mode. Find:

```tsx
      <div
        className={`plot-point ${draggedScene ? 'scene-dragging' : ''}`}
        data-plotpoint-id={plotPoint.id}
      >
```

Replace with:

```tsx
      <div
        className={`plot-point ${draggedScene ? 'scene-dragging' : ''} ${outlineMode ? 'outline-mode' : ''}`}
        data-plotpoint-id={plotPoint.id}
        onDragOver={outlineMode && draggedScene && !sortedScenes.some(s => s.id === draggedScene.id) ? (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        } : undefined}
        onDrop={outlineMode && draggedScene && !sortedScenes.some(s => s.id === draggedScene.id) ? (e) => {
          e.preventDefault();
          const lastScene = sortedScenes[sortedScenes.length - 1];
          onSceneDrop?.(lastScene ? lastScene.sceneNumber + 1 : 1, plotPoint.id);
        } : undefined}
      >
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit --skipLibCheck 2>&1 | grep PlotPointSection`
Expected: No errors from this file

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PlotPointSection.tsx
git commit -m "feat(pov): add outline mode and synopsis toggle to PlotPointSection"
```

---

### Task 5: Add New Handlers and State to App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

Add the state for per-section synopsis modes and the new handlers (setAside, returnFromBullpen, toggleSynopsisMode).

- [ ] **Step 1: Add synopsis mode state**

Find the existing state declarations near line 114-115:

```tsx
  const [allNotesExpanded, setAllNotesExpanded] = useState<boolean | null>(null);
  const [hideSectionHeaders, setHideSectionHeaders] = useState<Record<string, boolean>>({});
```

Add after `hideSectionHeaders`:

```tsx
  const [sectionSynopsisModes, setSectionSynopsisModes] = useState<Record<string, 'inline' | 'expand'>>({});
```

- [ ] **Step 2: Add handleSetAside handler**

Add after the `handlePovSceneDrop` function (after line 1919):

```tsx
  const handleSetAside = async (sceneId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    scene.plotPointId = null;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });

    const updatedData = { ...projectData, scenes: [...projectData.scenes] };
    setProjectData(updatedData);

    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedData.scenes, sceneConnections, braidedChapters);
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }
  };
```

- [ ] **Step 3: Add handleReturnFromBullpen handler**

Add right after `handleSetAside`:

```tsx
  const handleReturnFromBullpen = async (sceneId: string, targetPlotPointId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    scene.plotPointId = targetPlotPointId;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });

    const updatedData = { ...projectData, scenes: [...projectData.scenes] };
    setProjectData(updatedData);

    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedData.scenes, sceneConnections, braidedChapters);
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }
  };
```

- [ ] **Step 4: Add synopsis mode toggle handlers**

Add right after `handleReturnFromBullpen`:

```tsx
  const handleToggleSynopsisMode = (plotPointId: string) => {
    setSectionSynopsisModes(prev => ({
      ...prev,
      [plotPointId]: prev[plotPointId] === 'expand' ? 'inline' : 'expand',
    }));
  };

  const handleSetAllSynopsisModes = (mode: 'inline' | 'expand') => {
    if (!projectData) return;
    const modes: Record<string, 'inline' | 'expand'> = {};
    projectData.plotPoints
      .filter(p => p.characterId === selectedCharacterId)
      .forEach(p => { modes[p.id] = mode; });
    setSectionSynopsisModes(modes);
  };
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(handleSetAside|handleReturnFromBullpen|sectionSynopsisModes)" | head -5`
Expected: Only usage references, no type errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(pov): add bullpen and synopsis mode handlers to App.tsx"
```

---

### Task 6: Update POV View Rendering in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

Replace the POV view layout to use outline mode and bullpen panel.

- [ ] **Step 1: Add BullpenPanel import**

At the top of App.tsx, find existing component imports (near `import PlotPointSection`) and add:

```tsx
import BullpenPanel from './components/BullpenPanel';
```

- [ ] **Step 2: Update PlotPointSection rendering to pass outline mode props**

Find the PlotPointSection rendering block (around line 3644). Replace the `<PlotPointSection` call to add the new outline mode props. Find:

```tsx
                  <PlotPointSection
                    key={plotPoint.id}
                    plotPoint={plotPoint}
                    scenes={displayedScenes.filter(s => s.plotPointId === plotPoint.id)}
                    tags={projectData.tags}
```

Add these props right after `tags={projectData.tags}`:

```tsx
                    outlineMode={true}
                    synopsisMode={sectionSynopsisModes[plotPoint.id] || 'inline'}
                    onToggleSynopsisMode={handleToggleSynopsisMode}
                    onSetAside={handleSetAside}
                    getCharacterName={getCharacterName}
```

- [ ] **Step 3: Remove the floating unassigned scenes block**

Find and remove the block that renders scenes with no plotPointId (lines 3710-3741):

```tsx
                {displayedScenes.filter(s => !s.plotPointId).map(scene => (
                  <SceneCard
                    ...
                  />
                ))}
```

Remove this entire block (from `{displayedScenes.filter(s => !s.plotPointId).map` to its closing `))}`).

- [ ] **Step 4: Replace the TOC sidebar with BullpenPanel**

Find the TOC sidebar block (lines 3747-3775):

```tsx
                {!(hideSectionHeaders[tabId] ?? false) && displayedPlotPoints.length > 0 && (
                  <div className="pov-toc">
                    ...
                  </div>
                )}
```

Replace the entire block with:

```tsx
                <BullpenPanel
                  scenes={displayedScenes.filter(s => !s.plotPointId)}
                  plotPoints={displayedPlotPoints}
                  getCharacterName={getCharacterName}
                  onReturnScene={handleReturnFromBullpen}
                  onSceneChange={handleSceneChange}
                  onSceneDrop={handleSetAside}
                  draggedScene={draggedPovScene}
                  onDragStart={(scene) => setDraggedPovScene(scene)}
                  onDragEnd={() => setDraggedPovScene(null)}
                />
```

- [ ] **Step 5: Update POV toolbar buttons**

Find the existing POV toolbar section (around line 4538):

```tsx
          {viewMode === 'pov' && (
            <>
              <div className="toolbar-divider" />
              <button
                className={`toolbar-btn ${allNotesExpanded !== false ? 'active' : ''}`}
                onClick={() => setAllNotesExpanded(prev => prev === null ? false : !prev)}
                title={allNotesExpanded === false ? 'Expand Notes' : 'Collapse Notes'}
              >
                Notes
              </button>
```

Replace the "Notes" button with synopsis mode buttons:

```tsx
          {viewMode === 'pov' && (
            <>
              <div className="toolbar-divider" />
              <button
                className="toolbar-btn"
                onClick={() => handleSetAllSynopsisModes('inline')}
                title="Show all synopses"
              >
                Show synopses
              </button>
              <button
                className="toolbar-btn"
                onClick={() => handleSetAllSynopsisModes('expand')}
                title="Hide all synopses"
              >
                Hide synopses
              </button>
```

Keep the existing "Sections" button and "Fields" dropdown that follow.

- [ ] **Step 6: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS"` 
Expected: Same count as before these changes (pre-existing errors only)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(pov): wire up outline mode, bullpen panel, and synopsis toggles"
```

---

### Task 7: Add CSS Styles

**Files:**
- Modify: `src/renderer/styles.css`

Add all styles for the new outline components.

- [ ] **Step 1: Add OutlineSceneRow styles**

Append to the end of `styles.css`:

```css
/* ===== POV Outline Mode ===== */

/* Outline scene row */
.outline-scene-row {
  position: relative;
  padding: 7px 4px 7px 12px;
  border-radius: 4px;
  transition: background 0.12s;
}

.outline-scene-row:hover {
  background: var(--bg-secondary);
}

.outline-scene-row.dragging {
  opacity: 0.25;
}

.outline-scene-row.drop-above {
  box-shadow: 0 -2px 0 0 var(--accent);
}

.outline-scene-row.drop-below {
  box-shadow: 0 2px 0 0 var(--accent);
}

/* Main row: handle + number + title + tag + actions */
.outline-scene-main {
  display: flex;
  align-items: baseline;
  min-height: 28px;
}

.outline-scene-drag-handle {
  color: var(--text-muted);
  cursor: grab;
  font-size: 13px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.12s;
  user-select: none;
  padding: 2px 4px 2px 0;
  flex-shrink: 0;
  letter-spacing: 2px;
}

.outline-scene-row:hover .outline-scene-drag-handle {
  opacity: 0.4;
}

.outline-scene-drag-handle:hover {
  opacity: 1 !important;
}

.outline-scene-drag-handle:active {
  cursor: grabbing;
}

.outline-scene-number {
  font-size: 15px;
  font-family: var(--font-ui);
  font-weight: 400;
  color: var(--text-muted);
  user-select: none;
  margin-right: 8px;
  flex-shrink: 0;
  min-width: 20px;
}

.outline-scene-title {
  flex: 1;
  font-family: var(--font-body);
  font-size: 17px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: text;
  line-height: 1.5;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-scene-title-input {
  flex: 1;
  font-family: var(--font-body);
  font-size: 17px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.5;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 0;
  margin: 0;
}

.outline-scene-tag {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  color: var(--tag-people);
  background: rgba(61, 139, 64, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 12px;
  white-space: nowrap;
  user-select: none;
  flex-shrink: 0;
}

.outline-scene-hover-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s;
  margin-left: 8px;
  flex-shrink: 0;
}

.outline-scene-row:hover .outline-scene-hover-actions {
  opacity: 1;
}

.outline-scene-action-btn {
  font-size: 11px;
  font-family: var(--font-ui);
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  background: none;
  border: 1px solid transparent;
  padding: 2px 7px;
  border-radius: 4px;
  transition: all 0.12s;
  white-space: nowrap;
}

.outline-scene-action-btn:hover {
  color: var(--text-secondary);
  border-color: var(--border);
  background: var(--bg-secondary);
}

/* Synopsis area */
.outline-scene-synopsis {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition: max-height 0.25s ease, opacity 0.18s ease;
}

.outline-scene-synopsis.open {
  max-height: 500px;
  opacity: 1;
}

.outline-scene-synopsis-input {
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 400;
  color: var(--text-secondary);
  line-height: 1.6;
  border: none;
  outline: none;
  background: transparent;
  width: 100%;
  resize: none;
  padding: 2px 0 4px 28px;
  overflow: hidden;
}

.outline-scene-synopsis-input::placeholder {
  color: var(--text-muted);
  font-style: italic;
}

.outline-scene-synopsis-input:focus {
  color: var(--text-primary);
}
```

- [ ] **Step 2: Add section header outline mode styles**

Append after the outline scene styles:

```css
/* Outline mode section header */
.plot-point-header.outline-mode {
  border-bottom: none;
  padding-bottom: 4px;
  margin-bottom: 0;
  gap: 8px;
}

.section-synopsis-chevron {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 10px;
  transition: transform 0.2s, color 0.15s;
  border: none;
  background: none;
  padding: 0;
  flex-shrink: 0;
}

.section-synopsis-chevron:hover {
  color: var(--text-secondary);
}

.section-synopsis-chevron.collapsed {
  transform: rotate(-90deg);
}

/* Reduce spacing between sections in outline mode */
.plot-point.outline-mode {
  margin-top: 20px;
  margin-bottom: 8px;
}

.plot-point.outline-mode:first-child {
  margin-top: 0;
}
```

- [ ] **Step 3: Add BullpenPanel styles**

Append after the section styles:

```css
/* Bullpen panel */
.bullpen-panel {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  padding: 20px 16px;
  overflow-y: auto;
  transition: background 0.2s;
  position: sticky;
  top: 0;
  max-height: calc(100vh - 120px);
}

.bullpen-panel.drag-over {
  background: rgba(0, 0, 0, 0.04);
}

.bullpen-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.bullpen-label {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-muted);
}

.bullpen-count {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-ui);
  margin-left: auto;
}

.bullpen-empty {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--text-muted);
  padding: 20px 8px;
  line-height: 1.5;
  font-style: italic;
}

.bullpen-scene-wrapper {
  position: relative;
  margin-bottom: 2px;
}

.bullpen-scene-wrapper .outline-scene-row {
  padding-left: 4px;
}

.bullpen-scene-wrapper .outline-scene-number {
  display: none;
}

.bullpen-scene-wrapper .outline-scene-title {
  font-size: 15px;
}

.bullpen-scene-wrapper .outline-scene-synopsis-input {
  font-size: 13px;
  padding-left: 20px;
}

.bullpen-scene-wrapper .outline-scene-tag {
  font-size: 10px;
  padding: 1px 6px;
}

.bullpen-scene-actions {
  position: absolute;
  top: 7px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.12s;
}

.bullpen-scene-wrapper:hover .bullpen-scene-actions {
  opacity: 1;
}

.bullpen-return-btn {
  font-size: 11px;
  font-family: var(--font-ui);
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  background: none;
  border: 1px solid transparent;
  padding: 2px 7px;
  border-radius: 4px;
  transition: all 0.12s;
}

.bullpen-return-btn:hover {
  color: var(--text-secondary);
  border-color: var(--border);
  background: var(--bg-secondary);
}
```

- [ ] **Step 4: Add SectionPickerDropdown styles**

Append after the bullpen styles:

```css
/* Section picker dropdown */
.section-picker-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 50;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 180px;
  padding: 4px;
  margin-top: 4px;
}

.section-picker-header {
  font-size: 11px;
  font-family: var(--font-ui);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  padding: 6px 8px 4px;
}

.section-picker-item {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  background: none;
  border: none;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}

.section-picker-item:hover {
  background: var(--bg-secondary);
}

.section-picker-empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px;
  font-style: italic;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(pov): add CSS styles for outline mode, bullpen, and section picker"
```

---

### Task 8: Manual Testing and Polish

**Files:**
- Possibly modify: any file from Tasks 1-7

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/brian/braidr && npm run dev`

- [ ] **Step 2: Test outline rendering**

Open the app, navigate to any character's POV view. Verify:
- Scenes render as compact rows (number + title + character tag)
- Synopsis text is visible below each title
- Drag handles appear on hover
- "Set aside" and "Open" buttons appear on hover

- [ ] **Step 3: Test per-section synopsis toggle**

Click the chevron next to a section header:
- Synopses in that section should collapse with animation
- Chevron should rotate to point right
- Clicking a scene row in expand mode should expand its synopsis
- Other sections should remain unaffected

- [ ] **Step 4: Test global synopsis controls**

Click "Show synopses" / "Hide synopses" in toolbar:
- All sections should update simultaneously
- Per-section overrides should be respected after global toggle

- [ ] **Step 5: Test drag-and-drop reorder**

Grab a scene by its drag handle and move it:
- Within the same section: scene reorders, numbers update
- Between sections: scene moves to new section, plotPointId updates
- Drag into bullpen panel: scene moves to bullpen, disappears from outline
- Drag from bullpen into a section: scene returns to outline

- [ ] **Step 6: Test bullpen "Return" button**

Click "Return" on a bullpen scene:
- Section picker dropdown should appear
- Selecting a section should move the scene there
- Clicking outside should close the picker

- [ ] **Step 7: Test title and synopsis editing**

Click a scene title to edit:
- Title input should appear with current text
- Blur or Enter should save
- Escape should cancel

Click into synopsis textarea:
- Should be editable
- Blur should save changes

- [ ] **Step 8: Fix any issues found during testing**

Address any visual or functional issues. Common things to check:
- Synopsis textarea auto-height on load (may need to set initial height)
- Drop indicator visibility during drag
- Bullpen panel scroll when many scenes
- Outline row alignment when title wraps to second line

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix(pov): polish outline mode after manual testing"
```
