# BRANCHES.md — Branch Rework Design Decision

**Status:** Design LOCKED 2026-07-05 (Brian's UX answers, Fable session). Implementation is data-model redesign **Phase 8** — last in sequence, after Phase 7 (zustand store). Do not build yet; write the Sonnet implementation plan when Phase 8 is actually next, using this doc as the contract.
**Supersedes:** the open question in `TO-BE.md` §6b ("mutation-log fork vs branch-scoped overlays").

## The UX answers that drove this (Brian, 2026-07-05)

1. **What branches are for:** structure what-ifs (alternate scene order/braid), alternate prose (competing versions of scenes), and safety net before risky changes. Explicitly NOT a primary job: reversibly cutting whole arcs/POVs.
2. **Lifecycle:** short-lived — hours to days, rarely more than one branch alive at a time. Branches are experiments, not long-lived parallel manuscripts.
3. **Merge:** selective — cherry-pick some changed scenes back while keeping the main line's version of others (today's MergeDialog intent, rebuilt on a sane substrate).

## Decision: branch-scoped overlays (not mutation-log forks)

A branch stores **only what differs from the main line**, composed over it at read time:

- **Order overlay** — per-branch order-key overrides for braid position (the substrate's fractional keys make this one row per moved scene; TO-BE §nodes already anticipated "per-branch key overrides in a late phase").
- **Membership overlay** — per-branch scene visibility (in/out of the braid), including scenes created inside a branch (row lives in the main tables, overlay marks it branch-only until merged).
- **Draft overlay** — per-branch, per-scene prose draft overrides (covers the alternate-prose job).
- **Field overlay** — per-branch `field_values` overrides (title, synopsis, etc.) where an experiment touches them.

Why overlays win given the answers: short-lived experiments mean divergence stays small, so full log-replay power is wasted complexity; and an overlay **is** a diff, so Compare ("what differs?") and selective merge ("keep these differences, drop those") fall out almost for free instead of requiring git-grade merge semantics.

## What is NOT branched (unchanged from current model, now by design)

Notes, tasks, analytics/sessions, characters, tag definitions, metadata field *definitions*. **Chapters:** chapter definitions are shared; because chapters are contiguous spans of the braid (chapters-first-class decision, 2026-07-05), each branch's chapter grouping re-derives automatically from its order overlay — no chapter overlay needed.

## Invariants carried over from TO-BE §6b (already decided, restated)

1. Wipe-and-reinsert restore is dead. Branch operations are named mutations with deletion budgets.
2. Switching branches respects the containment invariant — no intermediate orphaned-scene state.
3. Whole-file snapshots survive **only** as backup checkpoints (insurance around branch ops, and the "safety net" job), never as the branch mechanism.
4. Existing branch machinery (`branches.ts`, `branchTables.ts`, snapshot storage, BranchSelector/CompareView/MergeDialog) keeps working untouched until Phase 8 replaces it. Migration of existing stored branches: restore-as-checkpoint, not translated into overlays (short-lived lifecycle means old branches are stale by definition; offer them read-only, let Brian confirm before any are dropped — no data loss).

## Product shape (v1 of the rework)

- One branch alive at a time is the designed-for case; more is allowed but not optimized.
- Create branch = instant (no copying). Switch = flip which overlay set is composed.
- Compare view lists exactly the overlay contents: moved scenes, added/removed scenes, rewritten drafts, changed fields.
- Merge = per-item checkboxes over that same list; applying writes normal named mutations to the main line, then discards or keeps the branch.
- A "checkpoint" affordance (snapshot + note) covers the safety-net job without creating a branch at all.

## Deferred to Phase 8 implementation planning

UI surfaces (where the selector lives in the v1 nav given Branches are OFF in the public build), iPad branch ops parity, lock semantics across devices, and whether POV (per-character) order is branchable or braid-order only. None of these affect the architecture above.
