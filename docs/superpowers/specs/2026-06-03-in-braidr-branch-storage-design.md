# In-`.braidr` Branch Storage — Design

**Date:** 2026-06-03
**Status:** Approved (design); pending implementation plan
**Scope:** Move draft branches *into* the single `.braidr` SQLite file. Fixes branches not syncing across machines and removes the per-branch sidecar files that caused database corruption over iCloud.

---

## Problem

A draft branch lets the writer test alternate plot/character options without touching their main manuscript — a heavily-used, critical feature.

Today a "branch" is implemented entirely on the filesystem (`src/main/branches.ts`):

- `branches/index.json` — branch list + active branch
- `branches/<name>.braidr` — a full **copy** of the whole project per branch
- `branches/<name>/positions.json`

This contradicts the project's single-`.braidr`-file data model. Consequences observed:

1. **Branches don't cross machines.** A project syncs as 7+ independent files (main `.braidr` + `-wal`/`-shm` sidecars + `branches/index.json` + each branch `.braidr` + *its* `-wal`/`-shm`). iCloud syncs these as separate objects with no atomicity or ordering. The tiny `index.json` and the large per-branch `.braidr` race: if the index arrives first, `listBranches()` flags the branch `legacy`/"must be recreated" (`branches.ts:75`); if the file arrives first, the branch is invisible.
2. **Corruption.** SQLite `-wal`/`-shm` sidecars are not safe to copy between machines. iCloud syncing them inconsistently corrupted a project (the writer had to rebuild from a fresh copy on 2026-06-02).

The codebase already solved the iCloud problem for the *main* file: `database.ts` runs `wal_checkpoint(TRUNCATE)` after saves and switches to `journal_mode = DELETE` on close (`database.ts:367,489-501`), so the main file is self-contained at rest. Branches get none of that benefit. Note also: the schema already contains unused `branches` / `branch_scene_snapshots` tables (`database.ts:331,340`) — dead code from an abandoned earlier attempt at this same migration; only `importer.ts` writes them.

## Goal

Branches live inside the one `.braidr` file. Syncing that single (checkpointed, self-contained) file carries branches atomically — exactly like scenes and tasks today.

## Non-goals (explicitly deferred)

- **Compare/merge rework.** Carry today's logic forward against the new storage; the known-painful comparison UX is a separate later effort.
- **Broader iCloud-corruption hardening** of the main file / multi-device concurrency (lock + heartbeat). Separate spec.
- **Issue 2:** branch switcher missing on some screens. Separate small UI fix, diagnosed on its own.

---

## Design

### 1. Branched vs shared tables

A branch snapshots the **story** tables. Everything else is shared across all branches.

**Branched (copied per branch):**
`characters`, `character_psychology`, `plot_points`, `acts`, `scenes`, `scene_drafts`, `scene_draft_versions`, `scene_scratchpads`, `scene_notes`, `scene_comments`, `scene_connections`, `chapters`, `scene_tags`, `scene_metadata_values`, `scene_dates`, `world_events` (+ `world_event_tags`, `world_event_scene_links`, `world_event_note_links`), `archived_scenes`.

**Shared (one copy, identical on every branch):**
`project`, `settings`, `tags` (tag vocabulary), `metadata_field_defs`, `table_views`, `tasks` (+ `task_tags`, `task_character_links`, `task_field_defs`, `task_custom_field_values`), `time_entries`, `notes` (+ `note_tags`, `note_links`, `note_scene_links`), `archived_notes`, `writing_sessions`.

`writing_sessions` is shared so branching never fragments the writer's weekly-hours stats.

**Cross-references:** a shared row may point at a branched one (a task linked to a character, a note linked to a scene). Those links resolve against whatever branch is active. A task linked to a character later deleted *in one branch* simply doesn't resolve while on that branch, and resolves again on main. No dangling-data errors — branch-appropriate resolution.

### 2. Storage

The active branch always lives in the normal tables — so the entire existing 32-table CRUD layer is untouched. A new `branch_snapshots` table holds a **versioned serialized document** of the branched tables per branch:

```
branches         (id, name, description, created_from, created_at, is_active)
branch_snapshots (branch_id, format_version, updated_at, data)   -- data = serialized branched-table rows
```

`main` becomes a real `branches` row (`is_active = 1` by default) instead of the implicit `null`. The unused `branch_scene_snapshots` table is retired. Serialized-document form (not shadow per-table columns) is chosen for simplicity and easy evolution; novel-sized data makes this cheap.

**Invariant:** live tables = active branch. Every branch has a snapshot row; the active branch's snapshot is stale-and-ignored while live (its truth is the live tables). Helper `persistActiveBranch()` serializes the live branched-tables into the active branch's snapshot — called before ever leaving a branch. Active-branch edits are never lost on crash because they persist in the live tables regardless of snapshot freshness.

### 3. Operations

- **Create** (`name`, desc): `persistActiveBranch()` → insert new branch row with a snapshot copied from current state → set it active. Live tables don't move (the new branch *is* a copy of the current state). Instant; cannot lose current edits.
- **Switch** (→ target): `persistActiveBranch()` → in a **single SQLite transaction**, delete all branched-table rows and re-insert the target's snapshot → set target active. On any error the transaction rolls back; live data is untouched.
- **Delete** (non-active only, as UI already enforces): drop the branch row + its snapshot. No effect on live data.
- **Compare** (left/right): existing scene-level diff, reading live tables for whichever side is active and the snapshot for the other. (No behavioral change; rework deferred.)
- **Merge** (branch → main, selected scenes): apply chosen scenes from the branch's snapshot onto main — into live tables if main is active, else into main's snapshot. Same "only scenes present in both" rule as current `mergeBranch`. (No behavioral change; rework deferred.)

**Crash/sync safety:** the switch swap is transactional; the existing checkpoint-on-save keeps the single `.braidr` self-contained for iCloud. No new sidecar files, no `branches/` folder, nothing to race.

### 4. Migration (one-time, on project load)

If an old-model `branches/index.json` is present:

1. Snapshot the main file's current story tables as `main`'s snapshot.
2. For each `branches/<name>.braidr`, read its story tables → store as that branch's snapshot row.
3. Restore active branch: if `index.json` named a branch active, load that branch's content into the live tables so the writer opens where they left off.
4. Move `branches/` aside to `branches.migrated-<date>/` — kept as a backup, **not deleted**.

Idempotent: skipped once branch rows exist in-file and the folder is archived. Writing into the single synced file means the other machine just receives the already-migrated file. The existing `alt-noah-emotional` branch migrates intact.

### 5. Surface changes

- **No renderer changes.** `branches:*` IPC signatures and `dataService` methods (`branchesList/Create/Switch/Delete/Compare/Merge`) stay identical; they operate on the DB now. `branches.ts` is reimplemented against `BraidrDB` (or becomes a thin wrapper over new DB methods).
- **Remove the active-branch file redirect** in `braidrIpc.ts:127`. Loading always opens the main `.braidr`; the active branch is already reflected in the live tables.
- The `BranchInfo`/`BranchIndex` renderer contract is preserved, built from DB rows. The `legacy` flag is no longer produced at runtime (kept only if useful for migration display).

### 6. Testing (TDD, per project bug-workflow)

- Round-trip integrity: create → edit → switch away → switch back preserves branched content exactly.
- Switch is transactional: a forced failure mid-swap rolls back, leaving live data intact.
- Sharing: `tasks`, `notes`, `writing_sessions` are identical before/after a switch.
- Migration: old folder layout → in-file snapshots, active branch preserved, `branches/` archived, idempotent on second load.

---

## Risks

- **Serialization format drift** — mitigated by `format_version` on each snapshot.
- **Large switch cost** — acceptable: switches are occasional and novel data is small; the swap is one transaction.
- **Migration of a corrupted source branch file** — migration reads each old branch `.braidr`; a corrupt one should be skipped with a surfaced warning rather than aborting the whole migration (the `branches/` backup is retained regardless).
