# Braidr iPad Companion App

## Summary

A Capacitor-based iPad companion app for Braidr that enables full round-trip writing, outlining, and note-taking on iPad with sync via iCloud Drive or Dropbox. Includes a prerequisite storage format change to extract per-scene content from `timeline.json` into individual files, making file-level sync safe across devices.

## Motivation

The primary user travels frequently (6+ hour flights) and wants to write, restructure outlines, and work on notes from a 13" iPad Pro. The desktop Electron app is the primary workspace; the iPad app is a focused companion for travel. Changes made on either device must sync reliably without risk of data loss.

## Two-Part Design

This project has two phases that ship separately:

1. **Storage format migration** (desktop only) — extract per-scene content from `timeline.json` into individual files
2. **iPad companion app** — Capacitor-wrapped React app reading/writing the same project folder

Phase 1 ships first as a desktop update. By the time the iPad app exists, all projects are already in the new format.

---

## Phase 1: Storage Format Migration

### Problem

`timeline.json` is a monolithic file containing both structural data (positions, connections, chapters) and per-scene content (prose drafts, scratchpad, version history, comments). When two devices edit different aspects of the project, both write to the same file, creating sync conflicts.

### Solution

Extract four per-scene content fields from `timeline.json` into individual files. Structural data stays in `timeline.json`.

### What gets extracted

| Field | Current Location | New Location | Format |
|-------|-----------------|-------------|--------|
| `draftContent` | `timeline.json` | `drafts/{sceneId}.md` | Plain text/markdown |
| `scratchpad` | `timeline.json` | `scratchpad/{sceneId}.md` | Plain text |
| `drafts` (version history) | `timeline.json` | `drafts/{sceneId}.versions.json` | JSON array of `DraftVersion` |
| `sceneComments` | `timeline.json` | `comments/{sceneId}.json` | JSON array of `SceneComment` |

### What stays in timeline.json

All structural and project-wide data: `positions`, `connections`, `chapters`, `characterColors`, `wordCounts`, `fontSettings`, `allFontSettings`, `archivedScenes`, `metadataFieldDefs`, `sceneMetadata`, `wordCountGoal`, `tasks`, `taskFieldDefs`, `taskViews`, `taskColumnWidths`, `taskVisibleColumns`, `inlineMetadataFields`, `showInlineLabels`, `timelineDates`, `timelineEndDates`, `worldEvents`, `tags`, `tableViews`.

### New project folder structure

```
my-project/
├── character1.md
├── character2.md
├── timeline.json              # structural data only
├── drafts/
│   ├── {sceneId}.md           # prose content
│   ├── {sceneId}.versions.json    # version history
│   └── ...
├── scratchpad/
│   ├── {sceneId}.md
│   └── ...
├── comments/
│   ├── {sceneId}.json
│   └── ...
├── notes/
│   ├── notes-index.json
│   ├── {noteId}.html
│   └── images/
├── analytics.json
└── .braidr/
    └── backups/
```

### Migration strategy

On project load, if `timeline.json` contains any of the extracted fields (`draftContent`, `scratchpad`, `drafts`, `sceneComments`):

1. Back up the original `timeline.json` to `.braidr/backups/` **before any writes**
2. Create `drafts/`, `scratchpad/`, `comments/` directories if they don't exist
3. Write each entry to its individual file
4. Only after all files are written successfully: remove the extracted fields from `timeline.json`
5. Save the cleaned `timeline.json`

If step 3 partially fails (e.g., disk full), the backup from step 1 preserves the original data, and the extracted fields remain in `timeline.json` (steps 4-5 are skipped). Next launch will retry migration.

Migration is one-way and automatic. No user action required.

### DataService interface changes

Remove `draftContent`, `scratchpad`, `drafts`, and `sceneComments` from the `saveTimeline` parameter list.

Add new methods:

```typescript
// Draft prose
readDraft(projectPath: string, sceneId: string): Promise<string>;
saveDraft(projectPath: string, sceneId: string, content: string): Promise<void>;

// Scratchpad
readScratchpad(projectPath: string, sceneId: string): Promise<string>;
saveScratchpad(projectPath: string, sceneId: string, content: string): Promise<void>;

// Version history
readDraftVersions(projectPath: string, sceneId: string): Promise<DraftVersion[]>;
saveDraftVersions(projectPath: string, sceneId: string, versions: DraftVersion[]): Promise<void>;

// Comments
readSceneComments(projectPath: string, sceneId: string): Promise<SceneComment[]>;
saveSceneComments(projectPath: string, sceneId: string, comments: SceneComment[]): Promise<void>;
```

`loadProject` reads from these individual files instead of `timeline.json`, assembling the same in-memory shape the app already expects. Calling code in App.tsx and components does not change — the data shape is identical, only the storage layer differs.

Both `ElectronDataService` and `CapacitorDataService` must implement this post-migration interface (with the new per-scene methods). The assembly logic for `loadProject` — reading individual draft/scratchpad/comment files and composing the return object — should live in a shared utility function to avoid duplication between the two implementations.

### IPC channel changes

New channels for per-scene file operations:

- `READ_DRAFT` / `SAVE_DRAFT`
- `READ_SCRATCHPAD` / `SAVE_SCRATCHPAD`
- `READ_DRAFT_VERSIONS` / `SAVE_DRAFT_VERSIONS`
- `READ_SCENE_COMMENTS` / `SAVE_SCENE_COMMENTS`

### Impact on auto-save

Currently, writing prose triggers `saveTimeline()` which writes the entire JSON blob. After migration:

- Writing prose triggers `saveDraft(projectPath, sceneId, content)` which writes a single small `.md` file
- Structural changes (dragging scenes, editing connections) still trigger `saveTimeline()` but with a smaller JSON payload
- The 800ms debounce pattern remains unchanged

---

## Phase 2: iPad Companion App

### Platform

Capacitor (iOS). The React codebase runs inside a native iOS WebView shell. TipTap and all custom extensions work as-is in the WebView.

### Included views

| View | Purpose | Notes |
|------|---------|-------|
| POV | Character outline editing | Scene cards with touch-friendly tap targets |
| Rails | Braided timeline reordering | Long-press-to-drag instead of click-drag |
| Editor | Prose writing | Same TipTap + EditorView, distraction-free option |
| Notes | Rich text notes | Full NoteEditor with wikilinks, hashtags, slash commands |
| Word Count Dashboard | Writing analytics | Future addition, not in initial build but architecture supports it |

### Excluded views (not on iPad)

- Timeline canvas (date-based visualization — requires touch interaction rewrite)
- Graph view (d3-force canvas — same reason)
- Tasks (low value for travel use case)
- License management (handled on desktop or web)
- PDF export / print

### Navigation

Sidebar + content layout for the 13" iPad:

```
┌──────────┬──────────────────────────┐
│          │                          │
│ Sidebar  │      Content Area        │
│          │                          │
│ [POV]    │  (selected view renders  │
│ [Rails]  │   here)                  │
│ [Notes]  │                          │
│          │                          │
└──────────┴──────────────────────────┘
```

- Sidebar shows view-specific navigation: character list (POV), scene list (Rails), note tree (Notes)
- Tapping a scene opens the Editor in the content area
- Sidebar collapses in portrait orientation or via toggle for distraction-free writing
- No pane splitting — one view at a time

### Shared code (used directly, no changes)

- `src/shared/types.ts`, `src/shared/paneTypes.ts` — all type definitions
- `src/renderer/services/parser.ts` — markdown outline parsing
- `src/renderer/services/migration.ts` — scene key migration
- `src/renderer/hooks/useHistory.ts` — undo/redo
- `src/renderer/extensions/*` — all 7 TipTap extensions (wikilink, hashtag, slashCommand, columns, coloredTableRow, dragHandle, todoWidget)
- `src/renderer/components/SceneCard.tsx` — scene card UI
- `src/renderer/components/PlotPointSection.tsx` — POV grouping
- `src/renderer/components/FilterBar.tsx` — tag filtering
- `src/renderer/components/SearchOverlay.tsx` — global search

### Shared code (requires minor platform adaptation)

These components are shared but reference platform-specific APIs that need attention:

- `src/renderer/components/notes/NoteEditor.tsx` — imports the `dataService` singleton directly (for `saveNoteImage`, `selectNoteImage`). Works as-is once the singleton is made platform-aware (see Platform Detection below). Also uses `braidr-img://` protocol for images — see Image Handling below.
- `src/renderer/components/notes/NotesView.tsx` — same `dataService` singleton import. Works once singleton is swapped.
- `src/renderer/components/EditorView.tsx` — imports `posthogTracker` which references `window.electronAPI`. Analytics calls silently no-op on iPad (see Analytics below).
- `src/renderer/components/FloatingEditor.tsx` — same `posthogTracker` dependency.
- `src/renderer/components/RailsView.tsx` — uses HTML5 Drag and Drop API (`onDragStart`/`onDragEnd`/`onDrop`), which is not supported in iOS WebKit. Requires replacement with a pointer-event or touch-event based drag implementation (e.g., `dnd-kit` or custom touch handlers). This is a meaningful rewrite of the drag interaction, not a minor tweak.

### New code for iPad

**`CapacitorDataService.ts`** — implements the `DataService` interface using Capacitor's Filesystem plugin. Reads/writes the same project folder format as the desktop app. The folder location is wherever the user picks via the iOS document picker (iCloud Drive, Dropbox, or any Files-app provider).

**`MobileApp.tsx`** — top-level app shell replacing App.tsx's pane system with the sidebar + content layout. Manages view switching, scene selection, and navigation state.

**`capacitor.config.ts`** + native iOS project scaffolding (Xcode project, Info.plist, entitlements for iCloud/document access).

### Modified code (touch adaptations)

- Scene cards — slightly larger tap targets for touch
- Rails view — replace HTML5 Drag and Drop with pointer-event based drag (e.g., `dnd-kit`). This is the most significant touch adaptation.
- Notes sidebar — full-width list view when sidebar is the active panel

### Platform detection

The `dataService` singleton in `src/renderer/services/dataService.ts` must be changed from a hard-coded `ElectronDataService` to a platform-conditional export:

```typescript
const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
export const dataService: DataService = isCapacitor
  ? new CapacitorDataService()
  : new ElectronDataService();
```

This is critical because several components (`NoteEditor`, `NotesView`, and others) import the `dataService` singleton directly rather than receiving it via props. The singleton swap ensures all components get the correct platform implementation without refactoring their imports.

### Image handling on iPad

`NoteEditor` constructs image URLs using `braidr-img://`, a custom Electron protocol registered in the main process. This protocol does not exist in Capacitor's WebView. On iPad, note images must be served differently:

- On save: same behavior (write image file to `notes/images/` via `CapacitorDataService.saveNoteImage`)
- On display: convert `braidr-img://` URLs to Capacitor-compatible local file URLs (e.g., `capacitor://localhost/_capacitor_file_/path/to/image.png` or inline base64 data URIs)
- The conversion can happen in `CapacitorDataService.readNote()` — do a string replace on the HTML content before returning it

### Analytics on iPad

`posthogTracker.ts` and `analyticsStore.ts` reference `window.electronAPI` directly. On iPad, these calls silently no-op (`window.electronAPI` is `undefined`, and the tracker uses optional chaining). This is acceptable for the initial build — analytics are disabled on iPad. If Word Count Dashboard is added later, `analyticsStore.ts` will need its own `DataService` methods (`readAnalytics`/`saveAnalytics`).

### DataService methods on iPad

Not all `DataService` methods apply on iPad. For the initial build:

| Method | iPad behavior |
|--------|--------------|
| `selectProjectFolder` | iOS document picker (Capacitor) |
| `loadProject` | Full implementation via Filesystem plugin |
| `saveCharacterOutline` | Full implementation (required for POV editing) |
| `saveTimeline` | Full implementation |
| `createCharacter` | Full implementation |
| `deleteFile` | Full implementation |
| `readDraft` / `saveDraft` / etc. | Full implementation |
| All notes methods | Full implementation |
| `selectSaveLocation` | Stub (not needed — no export on iPad) |
| `createProject` | Stub initially (create projects on desktop, sync to iPad) |
| `getRecentProjects` / `addRecentProject` | Local to iPad (stored in Capacitor Preferences, separate from Mac's list) |

### Data flow

```
iPad app launches
  → User picks project folder via iOS document picker
  → CapacitorDataService.loadProject(folderPath)
  → parser.parseOutlineFile() for each .md file (same parser as desktop)
  → Reads drafts/*.md, scratchpad/*.md, comments/*.json, notes/*
  → Returns same ProjectData shape
  → React components render

User writes prose
  → 800ms debounce auto-save (same as desktop)
  → CapacitorDataService.saveDraft(projectPath, sceneId, content)
  → Writes drafts/{sceneId}.md
  → Sync service (iCloud/Dropbox) uploads in background

User rearranges scenes in Rails
  → CapacitorDataService.saveTimeline(...)
  → Writes timeline.json
  → Sync service uploads
```

---

## Sync Architecture

### Approach: Bring Your Own Sync

The app does not implement sync. It reads and writes to a local folder. The user's choice of sync service (iCloud Drive, Dropbox, or any other) handles file transport between devices.

- **iPad:** reads/writes to a folder surfaced via the iOS document picker
- **Mac:** reads/writes to the same folder on disk (which the sync service keeps in sync)

This means no sync-service-specific code in the app. The iOS document picker natively surfaces iCloud Drive, Dropbox (if installed), and any other Files-app provider.

### Offline behavior

Both iCloud and Dropbox cache files locally. When offline (e.g., on a flight):

- All previously-synced project files are available locally on the iPad
- Edits save locally and queue for upload when connectivity returns
- When connectivity resumes, the sync service uploads changes automatically

### Edge case: partially downloaded project

If a project was recently updated on the Mac and iCloud/Dropbox hasn't finished syncing to the iPad:

- Some files may be marked as "not downloaded" by iOS
- On project load, the app checks for not-yet-downloaded files
- If found, show a banner: "X files still downloading — some content may be out of date"
- The app still opens with whatever is available locally

### Conflict handling

With per-scene file extraction, conflicts are unlikely (different files change on different devices). When they do occur, both iCloud and Dropbox create conflict copies (e.g., `timeline 2.json` or `timeline (conflicted copy).json`).

The app handles conflicts as follows:

1. **Detection:** On project load, scan for conflict-copy files. iCloud uses the pattern `filename (hostname's conflicted copy YYYY-MM-DD).ext`. Dropbox uses `filename (conflicted copy YYYY-MM-DD).ext`. Match with regex: `/\(.*conflicted copy.*\)/i` and `/\(.*'s conflicted copy.*\)/i`.
2. **Notification:** If found, show a banner: "Sync conflicts detected — some files were edited on both devices"
3. **Resolution for draft files (.md):** Show a diff view with both versions, letting the user pick one or manually merge
4. **Resolution for timeline.json:** Use the newer version (by modification time), move the older to `.braidr/backups/` as a safety net
5. **Resolution for notes (.html):** Same as draft files — show both versions for manual choice

---

## What's Not In Scope

- **Real-time sync / CRDTs** — overkill for single-user, two-device usage
- **Server/backend** — no accounts, no cloud infrastructure
- **Android** — Capacitor supports it, but not targeting it now
- **Feature parity with desktop** — iPad is an intentional companion with fewer features
- **App Store submission** — architecture is compatible, but initial distribution via TestFlight; App Store is a future decision

---

## Technical Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| TipTap performance in iOS WebView | Low-Medium | TipTap is widely used in mobile WebViews. Test early with large notes and custom extensions. Columns extension is the main concern — may need to disable on narrow screens. |
| iCloud sync delays | Medium | Files are cached locally. Delays only matter when switching devices. Users should wait for sync to complete before opening on the other device (same guidance Scrivener gives). |
| Capacitor Filesystem edge cases on iOS | Low | Well-maintained plugin with strong iOS support. Document picker API is stable. |
| Large projects with many draft files | Low | Even a 500-scene novel produces 500 small files. Both iCloud and Dropbox handle this fine (unlike Scrivener's thousands-of-RTF-files problem). |
| Apple review rejection | Low | Capacitor apps pass review routinely. No private APIs, no web-only content restrictions. |
| iOS WebKit lacks HTML5 Drag and Drop | Certain | RailsView drag-and-drop must be rewritten using pointer events or `dnd-kit`. Budget 3-4 days for this specifically. |
| `braidr-img://` protocol in WebView | Certain | Custom Electron protocol won't resolve. Mitigated by URL rewriting in `CapacitorDataService.readNote()`. |
