# Code Review Cleanup — 2026-02-27

Holistic code review across 5 areas: App.tsx, timeline components, editor/scene components, main process/data layer, pane system/extensions. Fixes applied in this batch are listed below with rollback notes.

## Critical Data-Loss Fixes

### 1. Stale metadata closure (App.tsx ~L2613)
- **Change:** `handleMetadataChange` reads from `sceneMetadataRef.current` instead of `sceneMetadata` state
- **Why:** Rapid successive metadata changes would overwrite each other (second call read stale state)
- **Rollback:** Revert `sceneMetadataRef.current` back to `sceneMetadata` in the spread

### 2. Notes loader race condition (App.tsx ~L789)
- **Change:** Added `cancelled` flag + `projectData?.projectPath` to useEffect deps
- **Why:** Switching projects while notes were loading could overwrite new project's data with old project's stale cache
- **Rollback:** Remove `cancelled` variable, return cleanup, and `projectData?.projectPath` from deps array

### 3. Archive panel stale data (App.tsx ~L2784)
- **Change:** Added `projectData?.projectPath` to `showArchivePanel` useEffect deps
- **Why:** Archive panel showed old project's notes after switching projects
- **Rollback:** Remove `projectData?.projectPath` from deps

### 4. Stale setViewMode in event listener (App.tsx ~L65, ~L524)
- **Change:** Wrapped `setViewMode` in `useCallback` with `[paneLayout.root, paneLayout.activePaneId, paneDispatch]` deps; added `setViewMode` to account navigation effect deps
- **Why:** Menu "Navigate to Account" used a stale closure from mount time
- **Rollback:** Convert back to plain function, remove `setViewMode` from effect deps, restore `[]` deps

### 5. Timer data loss on project switch (App.tsx ~L4499)
- **Change:** Added `if (timerRunning) handleStopTimer(); if (taskTimerRunning) handleStopTaskTimer();` before `setProjectData(null)` in Switch Project handler
- **Why:** Timer sessions were silently dropped when switching projects
- **Rollback:** Remove the two `if` lines

## Pane System Fixes

### 6. Corrupt localStorage layout validation (usePaneLayout.ts ~L195)
- **Change:** `getStoredLayout()` now calls `isValidLayout()` (recursive check) instead of shallow `parsed?.root && parsed?.activePaneId`; `usePaneLayout` uses lazy initializer to avoid re-reading localStorage on every render
- **Why:** Corrupt stored layout could crash the app on load
- **Rollback:** Revert to shallow check; remove `isValidLayout` import; restore direct `getStoredLayout()` call outside `useReducer`

### 7. Tab switch preserves mounted editors (LeafPaneContainer.tsx ~L33)
- **Change:** Renders all tabs with `display: none` for inactive instead of only rendering active tab
- **Why:** Switching tabs unmounted TipTap editors, losing undo history and potentially dropping unsaved edits mid-debounce
- **Rollback risk:** If hidden tabs consume too much memory with many open tabs, revert to `{activeTab && <TabContent tab={activeTab} />}`
- **Rollback:** Replace the `pane.tabs.map(...)` block with `{activeTab && <TabContent tab={activeTab} />}` and restore the `activeTab` variable

### 8. Close button on all tabs (TabBar.tsx ~L82)
- **Change:** Removed `tab.id === activeTabId` from close button condition
- **Why:** Users couldn't close inactive tabs without activating them first
- **Rollback:** Add `&& tab.id === activeTabId` back to the condition

### 9. paramsMatch braided subMode (paneUtils.ts ~L42)
- **Change:** Added `case 'braided': return a.subMode === (b as Extract<TabParams, { type: 'braided' }>).subMode;`
- **Why:** Opening braided in different sub-modes (list/table/rails) was treated as same tab
- **Rollback:** Remove the `braided` case

## Performance Fixes

### 10. Stable dragHandleRef callback (App.tsx ~L106, ~L3776)
- **Change:** Extracted inline `dragHandleRef={(el) => {...}}` to a `useCallback` named `dragHandleRefCallback`
- **Why:** New function ref every render caused all braided SceneCards to re-render on any hover
- **Rollback:** Replace `dragHandleRefCallback` with the original inline function

### 11. Stable utility functions (App.tsx various)
- **Change:** Wrapped in `useCallback`: `getCharacterName`, `getConnectedScenes`, `getConnectableScenes`, `getCharacterColor`, `getCharacterHexColor`, `formatTimer`
- **Why:** Plain functions recreated every render, defeating React.memo in child components
- **Rollback:** Remove `useCallback` wrapper and deps array from each

## CSS Fixes

### 12. Column resize handle scoped (styles.css ~L10950)
- **Change:** `.column-resize-handle` rules scoped to `.column-block .column-resize-handle`
- **Why:** Unscoped rule conflicted with TipTap table column resize handles
- **Rollback:** Remove `.column-block` prefix from selectors

### 13. Task dropdown z-index (styles.css ~L14362+)
- **Change:** 5 task-related dropdown classes bumped from `z-index: 50` to `z-index: 200`
- **Selectors:** `.task-inline-dropdown`, `.tasks-toolbar-dropdown`, `.tasks-view-dropdown`, `.tasks-columns-panel`, `.task-time-entry-popover`
- **Why:** Dropdowns were hidden behind the sidebar (z-index: 100) when near the left edge
- **Rollback:** Change `z-index: 200` back to `z-index: 50`

### 14. Split pane overflow: clip (styles.css ~L16450)
- **Change:** `.split-pane-child` changed from `overflow: hidden` to `overflow: clip`
- **Why:** `overflow: hidden` clipped inline TipTap suggestion popups in split panes
- **Rollback risk:** If `overflow: clip` causes layout issues in older Electron versions, revert to `overflow: hidden`
- **Rollback:** Change `overflow: clip` back to `overflow: hidden`

---

## Not addressed in this batch (future work)

These were identified in the review but deferred:

- **renderView instability** (App.tsx ~L3183) — 800-line function recreated every render; needs architectural refactor to extract view renderers into memoized components
- **saveTimelineData concurrent writes** — Multiple fire-and-forget calls with no queue/lock; needs save-debounce pattern
- **loadProjectFromPath state batching** — Sets `projectData` before editor data across async boundary; needs atomic state update
- **SplitPaneContainer resize flooding** — Dispatches on every mousemove frame; should apply CSS directly during drag, commit on mouseup
- **Wikilink node view missing update()** — Full teardown/recreate on every attr change; needs `update()` method
- **TodoWidget stale editor.storage** — Scene picker never updates after mount; needs editor update listener
- **Main process path traversal** — Notes IPC handlers don't validate paths stay within project folder
- **Main process non-atomic writes** — timeline.json writes could corrupt on crash mid-write
- **Sidebar width transition reflow** — `width` transition causes layout per frame; should use `transform`
