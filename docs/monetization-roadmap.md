# Braidr — Pre-Monetization Roadmap

Working document. Update as items are completed or reprioritized.
Last updated: 2026-05-17

---

## Priority Order

1. Schema design (decisions)
2. SQLite migration (implementation)
3. Code audit + cleanup (on the new foundation)
4. Stability + error handling
5. Security + license hardening
6. Design overhaul
7. UX polish

---

## 1. Schema Design

**Status:** Complete (2026-05-17)  
**Why first:** Every other audit item depends on this. Cleaning code against the current `.md` format wastes effort — most of that code gets replaced by the new data layer.

**Goal:** Design the SQLite schema that replaces the current multi-file format:
- `character.md` per character (scenes + plot points embedded)
- `timeline.json` (scene timeline positions + braided chapters)
- `notes/notes-index.json` + `.html` files per note
- Various sidecar files (comments, sessions, metadata, tasks, etc.)

**Deliverable:** Agreed schema before writing any code.

**Starting point:** Review `src/shared/types.ts` for the full current data model.

---

## 2. SQLite Migration

**Status:** Complete (2026-05-17)  
**Depends on:** Schema design  

**Key decisions already made:**
- Single `.braidr` file per project (SQLite database with custom extension)
- Replaces all current file formats
- `better-sqlite3` as the Electron driver (synchronous, well-maintained, used by Obsidian)
- Existing projects get a one-time conversion on first open

**Work items:**
- [ ] Implement new SQLite-backed `dataService`
- [x] Install `better-sqlite3`, rebuilt for Electron ABI
- [x] `src/main/database.ts` — `BraidrDB` class with full schema (~32 tables) + row-level CRUD helpers
- [x] `src/main/importer.ts` — converts legacy folder project → `.braidr` SQLite file (all data: characters, scenes, drafts, notes, tasks, world events, branches)
- [x] IPC handlers: `detect-project-format`, `convert-to-braidr`, `select-braidr-file`
- [x] Preload bridge updated with new handlers
- [x] "Convert project" button in settings menu (one-click, no modal)
- [x] Implement SQLite-backed dataService — `ElectronDataService` auto-detects `.braidr` on `loadProject` and routes all operations through SQLite IPC handlers (`src/main/braidrIpc.ts`)
- [ ] Retire file-based `dataService` implementation (after validation)
- [x] Test migration with real project data ("My life is over") — all data intact

---

## 3. Code Audit + Cleanup

**Status:** Not started  
**Depends on:** SQLite migration (don't clean code you're about to delete)

**Known issues:**
- [ ] `App.tsx` is ~4000 lines — needs splitting into logical components
- [ ] Pre-existing TypeScript errors (unused imports/vars across multiple files)
- [ ] Dead state, handlers, and imports accumulated from old features
- [ ] `draggedPovScene` and other HTML5 DnD remnants may still linger
- [ ] Two remaining steps on task data-loss bug (object-arg refactor + load-gate) — **fix before migration if still causing data loss**

**Approach:** Fix as we go, not just a report.

---

## 4. Stability + Error Handling

**Status:** Not started  
**Depends on:** SQLite migration (error handling model changes significantly)

**Areas to audit:**
- [ ] Unhandled promise rejections in save/load paths
- [ ] Silent failures (operations that fail without user feedback)
- [ ] IPC error handling consistency
- [ ] Loading states — what happens if a project is slow to open?
- [ ] Crash recovery — what does the user see if the app crashes mid-session?
- [ ] Auto-save reliability audit

---

## 5. Security + License Hardening

**Status:** Not started  
**Why here:** Surface-layer concern — do after the foundation is solid.

**Areas to audit:**
- [ ] License validation — is it bypassable client-side?
- [ ] How sensitive is the project data? Any exposure risks?
- [ ] Input sanitization (notes are rich HTML — XSS surface)
- [ ] Electron security checklist (contextIsolation, nodeIntegration, etc.)

---

## 6. Design Overhaul

**Status:** Not started  
**Blocks nothing technical — can start any time**

**Goal:** Move from functional-but-dated to genuinely beautiful. Reference aesthetic TBD — need to see screenshots and agree on direction before touching anything.

**Known pain points:**
- Three-dot menu in upper left feels unpolished
- General "built by a developer" aesthetic needs refinement
- Typography, spacing, and color need a coherent pass

**Process:**
1. Screenshot all major views
2. Pick aesthetic direction (writer warmth vs. craft-tool precision vs. other)
3. Design audit — identify the 10 highest-impact visual changes
4. Implement in order of impact

---

## 7. UX Polish

**Status:** Ongoing (bugs fixed as reported)

**Known items:**
- [x] Synopsis field in POV view broken (fixed 2026-05-17)
- [x] Bullpen drag to section not working (fixed 2026-05-17)
- [x] Scene numbering wrong in POV view (fixed 2026-05-17)
- [x] Return-from-bullpen numbering wrong (fixed 2026-05-17)
- [ ] Full dnd-kit migration — 12 remaining drag contexts still on HTML5 DnD
- [ ] Section drag in POV view (⋮⋮ handle on section headers)
- [ ] Empty section drop zone invisible when section has no scenes
- [ ] `cursor: grab` / `cursor: grabbing` on sortable items

---

## Parking Lot (good ideas, not yet scheduled)

- iPad companion app (Phase 2 needs Xcode device testing)
- Web/SaaS version (long-term, after SQLite proves the data layer)
- Collaboration features (blocked on move away from local-only model)
- Reddit monitoring for marketing (context doc at `docs/braidr-reddit-context.md`)
