# Status

Live snapshot of active work — what's open *right now*, not a history. For history, see `JOURNAL.md`. For what the app does, see `docs/features.md`.

Update this in place whenever something starts, finishes, blocks, or gets deprioritized. A stale "active" item here is worse than no list — prune ruthlessly, don't just append.

**Last pruned:** 2026-07-04

---

## Launch Critical Path (everything else below is not a launch blocker)

1. **Sidebar/UX audit** — scope now unblocked (Brian's call: audit the nav for the resolved v1 screen set — POV, Rails, Table, Editor, Notes, Tasks — not the full current nav).
2. **Homepage refresh path decision** — Path A (build refresh first) vs Path B (patch links + soft-launch now). Sitting since 2026-06-28.
3. **Vercel deployment verification** — downstream of #2, otherwise the only remaining infra blocker (everything else on the old launch-readiness list is done).

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

- **Braidr Apps: per-project runtime toggles** — parked 2026-07-04, not cancelled. This was the original mechanism designed 2026-07-02 for the MVP cut, but Brian isn't sure he wants it right now — the build-time split (Launch Critical Path item 1) covers the immediate need. Real future value if Brian wants end users themselves to turn features on/off per project ("turn on only what your novel needs" as an actual marketing line), which the build-time split can't do — that's a per-user runtime choice, not a build-time one. Revisit if that use case comes up.
- **Code audit** (2026-05-29, spot-checked still true 2026-07-04) — `App.tsx` over 5,300 lines, no ESLint/typecheck gate, ~6 TS errors, dead rails "Links" button, dead drag-state refs (`_dropTargetIndex`, `canDragSceneRef`, `draggedPovSceneRef`).
- **Task data-loss object-arg refactor** — `dataService.saveTimeline`'s 22 positional args still not refactored into the typed payload object (prevents silent argument-order drops).
- **Notes editor tail items** — word count + TOC, hashtag-code deletion, richer tables, migration sweep, dead-file cleanup. Non-blocking.
- **Outline mode deferred scope** — Editor companion panel, Table preview column.
- **POV sidebar in rails/braided view** — idea only, not started.
- **Legacy branch title suffix cleanup** — cleaned from America America; unknown if it exists in other projects.
- **`docs/brand-assets.md`** — flagged superseded by `docs/design-system.md` on 2026-07-04, recommended for deletion, not yet deleted.
- **Draft Branches: iPad branch ops** — desktop side done (rails compare + lock takeover); iPad side pending.
- **Outreach** — 48 targets identified (12 hot), no contact made yet. Gated behind buy-flow/site readiness per the commercial launch plan.

## Needs your call (status genuinely unclear — flagging instead of guessing)

- **UX review punch list (2026-06-11)** — stuck branch dropdown, weekly-hours mismatch, launcher recents dupes, CSP chevrons. No record of these being fixed. Still open, or did some/all get resolved along the way?
- **Arc View visual formatting bug** (row/column alignment, noted 2026-06-01) — Arc View itself was hidden entirely on 2026-06-13. Is this moot, or does the same alignment bug live on in Table view (which absorbed Arc's functionality)?

## Recently shipped (context only — drop entries after a session or two)

- **MVP scope cut decided + production/studio build split shipped** (2026-07-04) — v1 default set is POV/Rails/Table/Editor/Notes/Tasks; Braided List/Outline/Analytics/Branches/Timeline hidden by default via a `VITE_APP_TIER` build flag (`src/renderer/tier.ts`). `npm run package:studio` builds Brian's personal full-feature app (distinct app identity, never published). Ran end-to-end, confirmed working: Braidr Studio shows the entire lineup, regular build stays lean.
- Landing download links fixed — self-updating redirect to latest GitHub release, can't go stale again (2026-07-03)
- Terms of Service page shipped at `/terms` (2026-07-03)
- Crash reporting confirmed working — PostHog `crash_report` capture in both main and renderer, full stack traces (already existed, verified 2026-07-04)
- Docs accuracy pass — README, INSTALL, features.md, schema-design.md, design-system.md, launch-readiness.md corrected; dead docs removed (2026-07-04)
