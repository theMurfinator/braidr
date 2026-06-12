# Data-Model Prior Art — Research (2026-06-11)

*How comparable apps and the broader field handle manuscript/scene/metadata data. Companion to [AS-IS.md](AS-IS.md). Each section ends with the implication for Braidr.*

## 1. What writing apps actually do

**Scrivener** (`.scriv`): a folder masquerading as a file. A `.scrivx` XML manifest (the binder) holds the tree, titles, labels, statuses, compile settings; each document's text lives in a separate RTF/RTFD file under `Files/Data/`; search indexes and writing history are separate files. The structure/content split is the load-bearing idea: **the binder is a small, always-loaded structural index; heavy text is loaded per-document on demand.** Its weaknesses are the pile-of-files ones — sync corruption (Dropbox conflicts on inner files), no transactional writes, "the glue is understood only by Scrivener."

**Bear**: single SQLite database (Core Data–managed) for all notes and metadata on macOS/iOS — fast search, transactional, one file to back up. Third-party tools read it directly, which proves the schema-as-API point below.

**Implication:** Braidr's single-SQLite choice is the right one — it has Scrivener's organizational model available *plus* transactions and a real query engine. What Braidr should *copy* from Scrivener is the discipline it lacks: a clean split between the structural index (scenes/sections/order — small, loaded once) and heavy content (drafts/versions — loaded per scene, which Braidr already does via `scene_drafts`).

## 2. SQLite as an application file format (the canon)

SQLite's own guidance: when the app file format is an SQLite database, **the schema *is* the file format documentation**, and a federation of programs (desktop app, iPad app, future web) interoperate purely by sharing that schema. Best practices: explicit primary keys, correct column affinities, foreign keys enforced, and — critically — **schema changes treated like code: version-stamped, migrated in deliberate batches,** not incremental ad-hoc tweaks.

**Implication:** The .braidr schema is a public contract (BraidrMobile already reads it). It deserves: `PRAGMA user_version` (currently 0/unused) + ordered migration files, replacing the scattered `ALTER TABLE IF column missing` checks in database.ts. Schema review becomes part of code review.

## 3. Mutation discipline — what the local-first field converged on

The entire sync-engine ecosystem (Replicache-style push/pull, Convex's object sync engine, Evolu, PowerSync, TanStack DB) independently converged on the same write model: **a small vocabulary of named, narrow mutations** ("renameScene", "moveScene") applied optimistically to a local store and recorded as an ordered log — some systems going as fine as per-column operations. Nobody ships "replace the collection with whatever the client holds." The reason is the same one Braidr discovered empirically: a wholesale write encodes the client's *ignorance* as deletions.

**Implication:** This is the architecture for the new data layer even though Braidr is single-user today:
- Renderer holds a **normalized store** (entities by id); views *select* from it, never copy/reassemble.
- Every change is a **named mutation** → applied to the store → mirrored by a narrow SQL UPDATE/INSERT over IPC. The Class B bulk paths in AS-IS.md retire one mutation at a time.
- Free byproduct: this is exactly the shape that makes iPad sync feasible later (a mutation log syncs; "save the world" payloads cannot), without building any sync machinery now.

## 4. Ordering — fractional indexing (Figma, Linear)

Figma's answer to "seven ordering columns": each item carries its own **fractional position key** (arbitrary-precision string; insert between two items = average their keys). Moving an item writes **one row**, not a renumber of the whole list. Mature single-file SQLite-friendly implementations exist (e.g. sqliteai/fractional-indexing, base-62 strings).

**Implication:** Replace integer renumbering with fractional keys for each ordering *context* (outline order within section, braid order, chapter order). Display numbers (M·3, braid #11) become **derived at read time from one canonical order** — which is precisely the fix for the #3/#11/"Scene 4" incoherence. Drag-drop becomes a one-row write instead of a bulk save (today a reorder is what triggers SAVE_CHARACTER's delete/re-insert).

## 5. Undo — command log beats snapshots

The two classic models: **Memento** (snapshot state, restore on undo — simple, memory-heavy, coarse) vs. **Command pattern** (each operation is an object with an inverse; undo = apply inverse; histories, macros, and replay fall out naturally). For document editors the field's verdict is command-based undo, with snapshots reserved for coarse checkpoints.

**Implication:** Named mutations (§3) make this nearly free — each mutation records its inverse ("renameScene A→B" undoes as "renameScene B→A"). That gives Braidr app-wide Ctrl+Z (already a confirmed UX requirement for drag-drop) instead of today's per-editor undo. Branch snapshots stay as the coarse-checkpoint layer — they're the Memento half, already built.

## 6. Custom fields — one system, not three

Braidr has three parallel def/value systems (scene metadata, arc fields, task fields). The arc pair is already the most general (`entity_type` + `entity_id`). Industry norm (Notion, ClickUp, Jira) is a single property-definition system scoped by entity type.

**Implication:** Unify on one `field_defs` / `field_values` pair with an `entity_type` column; migrate the other two in. Likewise the triplicated story-structure columns (scenes/plot_points/acts) become either rows in that system or columns on exactly one entity.

## 7. Data retention safeguards (added on review, 2026-06-12)

Brian's one addition to the decision set: retention must be **built into the data layer**, not bolted on. Prior art is consistent — apps that users trust with years of work never hard-delete on first intent (Notion/Slack trash with purge windows, Time Machine-style generational backups, event-sourced systems keeping the op log as the recovery record). Four mechanisms, all cheap because the mutation architecture provides the hooks:

1. **Soft delete everywhere** — destructive mutations set `deleted_at` instead of removing rows; views filter it; purge happens only after a retention window (default 30 days, configurable). Replaces the ad-hoc `archived_scenes` / `archived_notes` copies with one uniform discipline.
2. **Persisted mutation log** — the command log (§5) is written to a table, not just held in memory. It already powers undo; persisted, it becomes a forensic/recovery record: any incident can be diagnosed and replayed-around after the fact.
3. **Generational backups** — formalize the existing auto-backup into a rotation (recent saves + daily + weekly), plus a mandatory checkpoint before every schema migration and branch restore.
4. **Deletion budget** — the data layer rejects any transaction that deletes more rows than its mutation explicitly named. Replace-by-absence becomes *structurally impossible*, not just avoided by convention.

**Implication:** Class C (the defensive machinery) stops being compensation and becomes the designed safety layer. Keep `quick_check` + self-heal on load as-is.

## Decision summary (to pressure-test in the TO-BE spec)

| Decision | Prior art | Replaces |
|---|---|---|
| Schema = contract; `user_version` + migration files | SQLite canon | ad-hoc ALTER checks |
| Normalized renderer store; views select | every sync engine | App.tsx-as-database |
| Named narrow mutations; no bulk replace | Replicache/Convex/Evolu | SAVE_CHARACTER / SAVE_TIMELINE |
| Fractional position keys; derived display numbers | Figma/Linear | 7 ordering columns |
| Command-log undo with inverses | command pattern | per-editor undo only |
| One custom-field system | Notion/ClickUp model | 3 parallel def/value pairs |
| Structural index loaded once; heavy content per-scene | Scrivener's good half | (keep — already true) |
| Soft deletes + persisted mutation log + backup rotation + deletion budget | Notion/Slack trash, event sourcing | hard deletes, in-memory-only history, ad-hoc backups |

## Sources

- [SQLite As An Application File Format](https://sqlite.org/appfileformat.html) · [SQLite schema best practices](https://moldstud.com/articles/p-best-practices-for-database-schema-design-in-sqlite)
- [How a Scrivener Project is Structured (Lit & Latte forum)](https://www.literatureandlatte.com/forum/viewtopic.php?t=10104) · [Scrivener format (Just Solve)](http://justsolve.archiveteam.org/wiki/Scrivener) · [Held Prisoner by File Formats (Prolost)](https://prolost.com/blog/fileformats)
- [Where are Bear's notes located](https://bear.app/faq/where-are-bears-notes-located/) · [Bear Markdown Export (reads Bear's SQLite)](https://github.com/andymatuschak/Bear-Markdown-Export)
- [An Object Sync Engine for Local-first Apps (Convex)](https://stack.convex.dev/object-sync-engine) · [Simple Sync Engine (SQLite, Replicache-style)](https://github.com/bholmesdev/simple-sync-engine) · [Evolu: Scaling local-first](https://www.evolu.dev/blog/scaling-local-first-software) · [PowerSync](https://powersync.com/) · [TanStack DB 0.6](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)
- [Realtime Editing of Ordered Sequences (Figma)](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/) · [Fractional indexing (Steve Ruiz)](https://www.steveruiz.me/posts/reordering-fractional-indices) · [Implementing Fractional Indexing (David Greenspan)](https://observablehq.com/@dgreensp/implementing-fractional-indexing) · [sqliteai/fractional-indexing](https://github.com/sqliteai/fractional-indexing)
- [Memento pattern for undo](https://neatcode.org/memento-pattern/) · [Undoable Command pattern](https://anubhav-gupta62.medium.com/undoable-command-design-pattern-30ca60b445cd)
