# Status

Live snapshot of active work — what's open *right now*, not a history. For history, see `JOURNAL.md`. For what the app does, see `docs/features.md`.

Update this in place whenever something starts, finishes, blocks, or gets deprioritized. A stale "active" item here is worse than no list — prune ruthlessly, don't just append.

**Last pruned:** 2026-07-04

---

## Launch Critical Path (everything else below is not a launch blocker)

1. **Sidebar/UX audit** — scope now unblocked (Brian's call: audit the nav for the resolved v1 screen set — POV, Rails, Table, Editor, Notes, Tasks — not the full current nav).
2. **Homepage refresh path decision** — Path A (build refresh first) vs Path B (patch links + soft-launch now). Sitting since 2026-06-28.
3. **Vercel deployment verification** — downstream of #2, otherwise the only remaining infra blocker (everything else on the old launch-readiness list is done).
4. **Fonts: kill the font selector** — Brian's call (2026-07-05, hit while chasing font-size/indent inconsistencies across Editor/Outline): the font system is "kinda a disaster right now" and he wants the font selector removed, not fixed piecemeal. Ties into the known drift already flagged in `docs/design-system.md` (font token says DM Sans, code has been Arial since the 2026-06-28 revert; Notes Font Editor exposes ~15 fonts, directly contradicting the doc's "two fonts, no others" rule). Scope not yet defined — needs a decision on what replaces per-note/per-field font choice before removing the picker itself.

## Blocked (needs Brian, not on critical path)

- **Screen info contracts (UX overhaul)** — pilot screen not chosen (Editor or POV?). Brian homework outstanding: mid-work screenshot + friction log from actually using the app. MVP scope is now resolved (see Recently Shipped) — Rails is confirmed a top-3 most-used screen, worth reconsidering as the pilot instead of the original Editor/POV choice.
- **Arc↔POV↔rails bullpen propagation** — paused mid-brainstorm awaiting Brian's answer to a section-level question. Also needs a relevance recheck: Arc View was hidden after this was paused — confirm this still matters before resuming (see "Needs your call" below).
- **iPad Companion App** — Phase 1 verified; Phase 2 needs Xcode for on-device testing.
- **BraidrMobile iOS app** — SQLITE_AUTH fix applied 2026-05-25, awaiting device test.
- **Outline-mode worktree** (`.claude/worktrees/outline-mode`, branch `outline-focus-fixes`) — real uncommitted work (scroll-settle timing fix + nav-list click-through fix for Outline view focus mode). Needs a decision: finish and commit, or discard.

## In Progress

- **Data-model redesign** — Phases 0-6 done (PRs #61-#64). Phase 7 (zustand store — Brian taking this as part of the UI redesign) and Phase 8 (branch rework, last) remain.
- **Arc metadata detail editor** — Phase 1 ~90% done, branch `feature/arc-metadata-fields`. Remaining: dataService wiring + App.tsx integration.
- **Full dnd-kit migration** — started 2026-05-03. Confirmed via code 2026-07-04: HTML5 drag handlers (`onDragStart`/`onDragOver`/`onDrop`) still present in `BraidedListView`, `EditorView`, `OptionEditor`, `OutlineSceneRow`, `RailsSceneCard`, `RailsView`, `PlotPointSection`, `TableView`, `App.tsx`. Most contexts still not migrated.
- **Task details page** — subtasks (the other half of this data-model item) are shipped and live, confirmed in code and `docs/features.md`. The details-page UI was never built. (`docs/data-model/TO-BE.md` line 145 still says subtasks aren't built — that line is stale, subtasks shipped.)
- **Note-wipe incident residual fix** — the DB empty-overwrite guard shipped and is tested. The renderer-side race in `NoteEditor` (`settingContentRef`) that caused the original incident is still unpatched.

## Backlog (real, just not urgent)

- **Braidr Apps: per-project runtime toggles** — parked 2026-07-04, not cancelled. This was the original mechanism designed 2026-07-02 for the MVP cut, but Brian isn't sure he wants it right now — the build-time split (shipped, see Recently Shipped) covers the immediate need. Real future value if Brian wants end users themselves to turn features on/off per project ("turn on only what your novel needs" as an actual marketing line), which the build-time split can't do — that's a per-user runtime choice, not a build-time one. Revisit if that use case comes up.
- **Code audit** (2026-05-29, spot-checked still true 2026-07-04, reconfirmed live in CI same day) — `App.tsx` over 5,300 lines, no ESLint/typecheck gate, ~6 TS errors (`FilterBar`/`handleToggleFilter` unused, `CapacitorDataService` missing `removeRecentProject`/`deleteProject`), dead rails "Links" button, dead drag-state refs (`_dropTargetIndex`, `canDragSceneRef`, `draggedPovSceneRef`). The GitHub "Tests" workflow on `main` is currently red because of these — pre-existing, not caused by today's work (confirmed: same failures were present before PR #85 too), and it doesn't block merges or releases (separate "Build & Release" workflow, unaffected).
- **Task data-loss object-arg refactor** — `dataService.saveTimeline`'s 22 positional args still not refactored into the typed payload object (prevents silent argument-order drops).
- **Notes editor tail items** — word count + TOC, hashtag-code deletion, richer tables, migration sweep, dead-file cleanup. Non-blocking.
- **Outline mode deferred scope** — Editor companion panel, Table preview column.
- **POV sidebar in rails/braided view** — idea only, not started. Likely folds into the sidebar revamp below rather than being its own thing.
- **Sidebar revamp — universal cross-screen panel** — Brian's working theory (2026-07-05, after building the Outline view metadata+preview sidebar): the sidebar is the key lever for the app's usability. Braidr has many "screens" (POV, Rails, Table, Editor, Notes, Outline, Tasks...) and a novelist shouldn't have to click all around between them — the sidebar should let you preview/edit *other* screens' content without leaving the one you're on. Concrete example Brian gave: a "POV view" preview that opens in the sidebar from any screen, showing that character's actual scene lineup with the ability to edit it inline, so you never have to leave e.g. Outline view just to check/fix POV order. Bigger than the plain "one unified sidebar component" idea it started as — revisit as its own design pass once ready, don't fold into whatever single-screen sidebar work is active at the time.
- **Legacy branch title suffix cleanup** — cleaned from America America; unknown if it exists in other projects.
- **`docs/brand-assets.md`** — flagged superseded by `docs/design-system.md` on 2026-07-04, recommended for deletion, not yet deleted.
- **Draft Branches: iPad branch ops** — desktop side done (rails compare + lock takeover); iPad side pending.
- **Outreach** — 48 targets identified (12 hot), no contact made yet. Gated behind buy-flow/site readiness per the commercial launch plan.

## Needs your call (status genuinely unclear — flagging instead of guessing)

- **UX review punch list (2026-06-11)** — stuck branch dropdown, weekly-hours mismatch, launcher recents dupes, CSP chevrons. No record of these being fixed. Still open, or did some/all get resolved along the way?
- **Arc View visual formatting bug** (row/column alignment, noted 2026-06-01) — Arc View itself was hidden entirely on 2026-06-13. Is this moot, or does the same alignment bug live on in Table view (which absorbed Arc's functionality)?

## Recently shipped (context only — drop entries after a session or two)

- **MVP scope cut is LIVE, not just built** (2026-07-04) — merged via PR #85 (feature) + PR #86 (typecheck fix for `import.meta.env`, needed `vite/client` types added to `tsconfig.json`) + PR #84 (unrelated analytics fix already on the branch). Released as **v1.5.197**, confirmed published on GitHub. Real users' next auto-update gets the lean nav: POV/Rails/Table/Editor/Notes/Tasks on, Braided List/Outline/Analytics/Branches/Timeline off. `npm run package:studio` builds Brian's personal full-feature "Braidr Studio" app — confirmed working, never published, doesn't auto-update.
- Landing download links fixed — self-updating redirect to latest GitHub release, can't go stale again (2026-07-03)
- Terms of Service page shipped at `/terms` (2026-07-03)
- Crash reporting confirmed working — PostHog `crash_report` capture in both main and renderer, full stack traces (already existed, verified 2026-07-04)
- Docs accuracy pass — README, INSTALL, features.md, schema-design.md, design-system.md, launch-readiness.md corrected; dead docs removed (2026-07-04)
