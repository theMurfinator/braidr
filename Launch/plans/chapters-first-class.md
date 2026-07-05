# Chapters as a First-Class Citizen — Implementation Plan

**For:** Sonnet 5 implementation session
**Written:** 2026-07-05 (Fable planning session)
**Approved:** Brian blessed the core semantic and the UX walkthrough 2026-07-05 — this plan is GO, not provisional.
**Checkpoint:** Brian is wary that chapters may still feel unintuitive even done right. STOP after Phases 1–2 (Rails management + auto-assignment) and have him use it in the real app before building Phases 3–4. If dragging scenes across chapter headers doesn't feel obvious to him in the first ten minutes, report back instead of continuing.

---

## CHECKPOINT RESULT (2026-07-05) — READ BEFORE RESUMING

**Phases 0–2 are BUILT** on branch `feature/chapters-first-class` (pushed to origin; built in worktree `.claude/worktrees/agent-a3ae57cf0fe3a9cb7`). 21 span-helper unit tests + regression tests, 298 total passing; typecheck clean; vite build clean. See the JOURNAL.md 2026-07-05 entry for the full implementation report, including one real gap flagged: `BraidedListView` (studio-only) still has a contradictory "independent chapter buckets" implementation, untouched, Phase 3 territory.

**Brian's verdict: data model VALIDATED, authoring surface REJECTED as the sole home.** Creating chapters from Rails ("+ New Chapter" appends at braid end) feels wrong for the chapter-first workflow — "a lot of people *start* with the concept of a chapter and not scenes."

**PHASES 3–4 (and 3.5) ARE BLOCKED on one undecided question: where does chapter *authoring* live?** Candidates discussed, none chosen (Brian explicitly declined to decide 2026-07-05):
1. **Dedicated Chapters screen** — chapter cards in reading order, synopsis, counts, contained scenes; the team's recommendation (planning-first tools like Plottr use a structure screen; it would absorb Phase 3.5 and replace BraidedListView's chapter half).
2. **Editor-integrated** — chapter grouping/navigation in the Editor's scene nav (the drafting-tool idiom: Scrivener binder, Dabble manuscript tree). Serves navigation-while-drafting; weak as a day-one conception surface.
3. **Rails sidebar panel** — chapter list panel; aligns with the universal-sidebar direction in STATUS.md backlog.
Research notes: Scrivener/Dabble = persistent sidebar tree beside the editor; Plottr = dedicated structure screen. Drafting-first tools do sidebars, planning-first tools do screens.

**Do NOT build any of the three without Brian's explicit choice.** Rails' shipped Phase 1–2 behavior (headers, drag-across-boundary assignment, delete-merges-down, empty chapters) is validated and stays regardless of the choice.
**Branch:** create `feature/chapters-first-class` off `main`
**Prime directive:** data-model correctness first, no data loss (see memory `project_data_model_correctness_first`). Chapters must be strictly optional — a writer who never touches them sees zero friction.

---

## The core semantic (THE design decision — everything follows from it)

**A chapter is a contiguous run of scenes in the braided (reading) order.**

Not independent buckets. A novel's Chapter 3 cannot contain braid scenes 4, 9, and 17 — that's meaningless for reading order and for Compile. Today the model allows it because `chapterId` is a free per-scene assignment, which is why chapters feel incoherent: braid order and chapter membership can silently contradict each other.

Consequences:
1. **Storage stays as-is.** Keep the `chapters` table and per-scene `chapterId`. No schema migration. Contiguity becomes an *application invariant*, not a DB constraint.
2. **`sceneOrder` (order-within-chapter) is demoted.** Within a chapter, scene order IS braid order (`timelinePosition`). Stop maintaining `sceneOrder` as an independent ordering anywhere in the UI. Keep the column (no destructive migration), just stop writing divergent values — write braid-derived values on chapter edits.
3. **Assignment is mostly automatic.** Moving a scene in the braid moves it into whatever chapter covers its new position. Explicitly assigning a chapter from a metadata dropdown MOVES the scene in the braid (to the end of that chapter). One source of truth: the braid.
4. **Unbraided scenes (bullpen / no `timelinePosition`) always have `chapterId = null`.** Braiding a scene drops it into whatever chapter covers the drop position.

## Single source of truth helper (build this first)

`src/shared/chapterSpans.ts` (shared so main + renderer + tests use one implementation):

```
deriveChapterSpans(scenes: Scene[], chapters: Chapter[]): ChapterSpan[]
// ChapterSpan = { chapterId: string | null, chapter?: Chapter, scenes: Scene[] }
// Input: scenes in braid order. Output: contiguous spans.
// Rule for existing non-contiguous data: a chapter's span starts at its FIRST
// scene in braid order and runs to the last scene before the next chapter's
// first scene. Scenes before any chapter's first scene form a leading
// null-chapter span ("No chapter"). This makes messy legacy data render
// sanely WITHOUT rewriting the DB.
```

**AMENDMENT (2026-07-05, Brian):** **Empty chapters are first-class.** Writers who think chapter-first create chapters (with synopses) BEFORE braiding scenes into them. A chapter with zero scenes must not disappear:
- `deriveChapterSpans` walks chapters in `ord` order; a chapter with no scenes yields a span with `scenes: []`, positioned between its neighbors' spans by `ord`. Add unit tests: empty chapter between populated ones, empty chapter at start/end, ALL chapters empty (scenes exist but unassigned).
- Rails renders an empty chapter as a header + empty drop zone; dropping a scene there assigns it that `chapterId` and a braid position between the adjacent spans.
- Creating a chapter never requires scenes. The toolbar "New Chapter" creates an empty chapter at the end.
- `ord` is therefore authoritative for chapters with no scenes, and kept synced to span order for chapters that have them.

**Non-destructive repair rule:** never bulk-rewrite `chapterId`s on load. Display always goes through `deriveChapterSpans`. Persisted `chapterId`s only change through explicit user actions (moving a scene, moving a boundary, assigning via dropdown), and each such action re-derives and persists correct `chapterId`s for only the affected scenes via the existing `assignSceneToChapter` IPC.

Write unit tests for `deriveChapterSpans` FIRST (test-driven, per CLAUDE.md bug workflow): empty chapters, no chapters, contiguous data, legacy non-contiguous data, unbraided scenes excluded, all-unassigned.

## Phase 1 — Rails view: the chapter management home (v1's braid surface)

RailsView already renders chapter headers (~43 refs) and has `onDeleteChapter`. Make it the full management surface:

- **Create:** "+ Chapter" affordance between chapter groups and at the top/bottom of the braid (insert a boundary at that braid position). Keep the existing toolbar "New Chapter" dropdown item working, but route it through the same insert-at-position flow (default: end of braid).
- **Rename:** click chapter header title to edit inline (same pattern as Outline scene titles just shipped — commit on blur/Enter, Escape cancels).
- **Delete:** existing `onDeleteChapter`; scenes in the deleted chapter merge into the PRECEDING chapter (or "No chapter" if none precedes). Confirm dialog states exactly that. No scene is ever deleted or unbraided by a chapter operation.
- **Move boundary:** dragging scenes across a chapter header (existing braid drag) re-derives assignments automatically — this falls out of consequence 3, no special boundary-drag UI needed for v1.
- **Reorder chapters:** NOT independent in this model — chapter order IS the order of their spans in the braid. Remove/hide any UI implying chapters can be reordered without moving scenes. `reorderChapters` IPC stays for `ord` housekeeping (keep `ord` synced to span order whenever spans change).

## Phase 2 — Assignment automation (the invariant enforcement)

- Hook the braid reorder path(s): after any scene move/drop in Rails (and Braided List for the studio build), compute the scene's new chapter from `deriveChapterSpans` and persist via `assignSceneToChapter` if changed. Find every braid-mutation call site in `App.tsx` (`handleDropOnTimeline`, `handleRailReorder`, `handleInsertSceneAtPosition`, etc.) and route them through one shared `reconcileChaptersAfterBraidChange(sceneIds)` helper — do not scatter the logic.
- Braiding a bullpen scene: assign the covering chapter. Unbraiding / setting aside: null the `chapterId`.
- **Risk check (do this before wiring):** verify `applySaveTimeline` / the bulk `saveTimeline` payload preserves `chapterId` — the plot-points DELETE+re-INSERT landmine (memory `project_plotpoint_bulk_save_landmine`) has a sibling risk here. Add a regression test: bulk timeline save must not wipe chapter assignments.
- Verify branch snapshot/restore round-trips chapters + assignments (`branchTables.ts` mentions the dropped `braided_chapters` — confirm nothing still reads it; remove dead references if trivially safe).

## Phase 3 — Consistent read/edit surfaces everywhere else (v1 set)

- **Outline view:** already groups by chapter. Switch its grouping to `deriveChapterSpans` (it currently sorts by `chapterId` + `sceneOrder`, which shows the legacy-data mess). Scene order within groups = braid order.
- **Table view:** chapter column becomes an editable dropdown. Choosing a chapter = "move this scene to the end of that chapter in the braid" (state that in the dropdown's title/tooltip). Null option = move to the leading no-chapter span? No — null from Table is ambiguous; instead offer only real chapters plus "(keep unassigned)" when already null. If this gets fiddly, make Table's chapter column read-only for v1 and note it.
- **Editor view + Outline meta panel:** show chapter (Outline meta panel already does); make it the same dropdown with the same move semantics. Editor has only ~5 chapter refs — likely display-only today; add the dropdown to its meta panel.
- **POV view:** display-only. A small muted chapter label on scene rows if cheap; otherwise skip. POV order is per-character narrative order and must not be affected by chapters.
- **Compile:** verify chapter-based compile output uses `deriveChapterSpans` ordering (CompileModal has ~39 refs — likely already close). Fix any place it trusts `sceneOrder`.

## Phase 3.5 — Chapter detail panel (chapters as thinking units) — AFTER checkpoint

Some writers think IN chapters: the chapter has its own synopsis and metadata, drafted often before scenes exist (Brian, 2026-07-05). Build a chapter detail panel, same interaction pattern as the Outline scene meta panel:

- Open: click a chapter header in Rails (single click selects/opens panel; inline rename stays on the title text itself — double-click or a dedicated edit affordance, Sonnet's call on what feels right next to the panel-open gesture).
- Contents: title (editable), **synopsis** (rich text via `MetaRichField`, persisted to the existing `chapters.description` column — do NOT add a new column; note the plot-point precedent where a parallel `synopsis` column ended up orphaned, see memory `plot-point description/synopsis unification`), derived scene count, derived word count (sum of the span's scene word counts).
- Chapter-level custom metadata fields: OUT of scope for this pass. Note it as a follow-up if Brian asks; don't speculatively build field-def plumbing.
- Outline view: show the chapter synopsis under the chapter heading (read-only there is fine for v1).

## Phase 4 — Empty states + first-run coherence

- Zero chapters: no headers anywhere, no "Unassigned" label noise (only show a "No chapter" group header when at least one chapter exists).
- First chapter created from the toolbar: insert at end of braid; from a between-groups affordance: at that position. Never auto-create "Chapter 1" on the user's behalf.

## Verification (before claiming done)

1. Unit tests: `deriveChapterSpans` cases above + bulk-save regression test + reassignment-on-move test.
2. `npx tsc --noEmit` — only the pre-existing documented errors (CapacitorDataService, FilterBar/handleToggleFilter) may remain.
3. Run the real app (`VITE_APP_TIER=full npm run dev`) against a COPY of a real project (never the live America America file — it lives in iCloud; copy `demo-project.braidr` instead): create/rename/delete chapters in Rails, drag scenes across boundaries, confirm Outline/Table/Editor/Compile all show the same grouping.
4. Open a legacy project with non-contiguous chapter data and confirm it renders sanely with zero DB writes on load.

## Doc/status obligations (CLAUDE.md rules)

- Update `docs/features.md` chapter mentions in the same sitting.
- Update `STATUS.md` (chapters item) and append a `JOURNAL.md` entry.
- Do NOT touch: tags system, font system, `mcp-server/` uncommitted changes, pre-existing TS errors.
