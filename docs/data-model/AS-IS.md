# Braidr Data Model — AS-IS (2026-06-11)

*Read-only analysis of the `.braidr` SQLite schema (43 tables, v1.5.147) and every code path that writes it. No code was changed. Companion: [RESEARCH.md](RESEARCH.md) (prior art), `docs/ui-redesign/PLAN.md` (why this matters now).*

## The shape of the problem in one paragraph

There is no shared data layer. The renderer loads the entire project into App.tsx state as one giant assembled object (`BRAIDR_LOAD_PROJECT` returns characters + plot points + scenes + everything), views hold copies of it, and persistence happens through ~110 ad-hoc IPC methods, of which the two most important are **bulk "save the world" calls**: `SAVE_CHARACTER` (replaces a character's outline wholesale) and `SAVE_TIMELINE` (a 20+ key grab-bag payload: positions, connections, colors, fonts, tasks, world events, tags, metadata defs…). Whatever the app layer doesn't carry, the save path destroys. Both data-loss incidents (2026-04-20, 2026-06-03) were this mechanism firing as designed.

## Table inventory (43 tables, by domain)

**Story structure (the core):**
`characters` · `plot_points` (= sections) · `scenes` · `acts` · `chapters` · `scene_connections`

**Per-scene satellite content** (keyed by scene_id, written individually — the *safe* pattern):
`scene_drafts` · `scene_draft_versions` · `scene_scratchpads` · `scene_comments` · `scene_notes` · `scene_dates` · `scene_tags` · `scene_metadata_values`

**Custom-field systems — there are three parallel ones:**
1. `metadata_field_defs` + `scene_metadata_values` (scene metadata)
2. `arc_field_defs` + `arc_field_values` (arc fields, generic `entity_type ∈ act|section|scene`)
3. `task_field_defs` + `task_custom_field_values` (task fields)

**Tasks & time:** `tasks` · `task_tags` · `task_character_links` · `time_entries`

**Notes:** `notes` · `note_tags` · `note_links` · `note_scene_links` · `archived_notes`

**World events:** `world_events` · `world_event_tags` · `world_event_scene_links` · `world_event_note_links`

**Branches:** `branches` · `branch_positions` (positions as a **JSON blob** per branch) · `branch_snapshots` (whole-table JSON snapshots; restore = wipe + re-insert all BRANCHED_TABLES with FKs off)

**Archive / settings / meta:** `archived_scenes` · `tags` · `table_views` · `character_psychology` · `project` · `settings` · `schema_version` (note: PRAGMA user_version unused, =0)

## Finding 1 — Seven ordering systems

| Column | Means | Written by |
|---|---|---|
| `scenes.scene_number` | per-character outline position | SAVE_CHARACTER |
| `scenes.timeline_position` | global braid position | SAVE_TIMELINE |
| `scenes.scene_order` | within-chapter order (late ALTER) | updateScene |
| `plot_points.display_order` | section order | SAVE_CHARACTER (re-insert order) |
| `acts.display_order` | act order | REORDER_ACTS |
| `chapters.ord` | chapter order | REORDER_CHAPTERS |
| `branch_positions.positions_json` | braid positions *per branch*, duplicated as JSON | branch ops |

This is why the same scene is #3 in POV, #11 in Table, "Scene 4" in search: there is no canonical identity, and each view derives numbering from a different column. (UX punch list, item 4.)

## Finding 2 — Story-structure fields are triplicated

`polarity, transformation, dilemma, propelling_action, starting_state, ending_state` exist as literal columns on **scenes**, **plot_points**, *and* **acts** — and then `arc_field_defs/values` exists as a fourth, *generic* mechanism on top of all three. `plot_points.synopsis` is already orphaned (arc work moved to `description`). Every new structure field must be added in four places or it's inconsistent; in practice they've drifted.

## Finding 3 — The write paths, classified by risk

**Class A — narrow per-row writes (safe; most satellite tables):** save draft/scratchpad/comments by scene_id, save chapter, save act, save arc fields (partial UPDATE with explicit field list), per-row deletes. *This is what the whole system should look like.*

**Class B — "replace collection by absence" (the data-loss class):**
- `SAVE_CHARACTER`: `DELETE FROM plot_points WHERE character_id` + re-INSERT from app objects → **any plot_points column not threaded through `insertPlotPoint` dies on every save** (the documented landmine). Scenes: any scene missing from renderer state is **permanently deleted** (`deleteScene` cascades to drafts/versions/comments/etc.). If load is ever partial (the PR #33 bug shape), the next save erases the difference.
- `SAVE_TIMELINE` (`applySaveTimeline`): full-table replaces for tasks, task_field_defs, metadata_field_defs, table_views, scene_connections, world_events, archived_scenes… now behind the `shouldReplace` guard (empty payload + non-empty table → skip), which stops the *empty* case but not the *partial* case (a payload with 3 of 40 tasks still deletes 37).
- Branch restore: wipe all BRANCHED_TABLES, re-insert from JSON snapshot, foreign_keys OFF.

**Class C — defensive machinery that exists because of Class B:** auto-backup before save, `PRAGMA quick_check` + self-heal-from-backup on load, the `shouldReplace` guard, 19 test files pinning save behavior. All good work — all compensating for the architecture rather than fixing it.

## Finding 4 — The seam has no contract

~110 `electronAPI` methods, `{success, data?, error?}` envelopes typed loosely (~190 `any` concentrated here), `SaveTimelinePayload` accepts everything optional, and the renderer's `dataService` mirrors the method list 1:1 — an RPC surface, not a data layer. Six current TS errors live exactly on this seam.

## What's actually good (keep)

- SQLite single-file format with FK cascades — right foundation, validated by the iPad app reading the same file.
- The per-scene satellite pattern (Class A) — already the majority of tables.
- Backup/recovery/guard layer — keep it even after the rewrite; it's cheap insurance.
- 177 passing tests, several pinning exactly the dangerous paths.

## Implications for the TO-BE design (preview)

1. One write discipline: **narrow, named mutations** ("renameScene", "moveSceneToPosition", "setSectionFields") — Class B paths retired one at a time, each behind a behavior-pinning test.
2. One identity + ordering model (fractional/ordered keys per context, derived display numbers).
3. One custom-field system instead of three.
4. Story-structure fields live in **one** place (sections), referenced — not copied — elsewhere.
5. A typed renderer store (normalized entities; views select, never reassemble) replacing App.tsx-as-database.
6. `PRAGMA user_version` + real migrations instead of ad-hoc `ALTER TABLE IF missing` checks.

*(Held as preview until RESEARCH.md is reviewed — the prior-art findings should pressure-test these before they harden into a spec.)*
