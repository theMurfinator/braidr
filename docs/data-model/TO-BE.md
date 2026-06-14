# Braidr Data Model — TO-BE (2026-06-12, rev. 2)

*The target architecture. Companions: [AS-IS.md](AS-IS.md) (what exists), [RESEARCH.md](RESEARCH.md) (why these choices). Defaults that need Brian's sign-off are marked **[CALL]**.*

*Rev. 2 (same day): domain model generalized to a **configurable structure tree** with a **shared, level-attachable field system**, per Brian's three requirements: (1) metadata fields shared across all structure levels but attached per level; (2) the set of levels in use is writer-specific; (3) each POV character has their own instance of the structure, while the meta-structure (which levels exist) is novel-wide.*

## Goals / non-goals

**Goals:** one write discipline (named narrow mutations), data loss structurally impossible (retention safeguards), one ordering model, one field system attachable to any structure level, a typed seam, real migrations.

**Non-goals (now):** sync engine, big-bang schema rewrite, UI changes. The migration is incremental — every phase is additive first, dual-writes, then retires the old path behind behavior-pinning tests.

## 1. Domain model — a configurable structure tree

The canonical hierarchy:

```
Novel
└─ Arc (today: "act")
   └─ Plot point (today: "plot_points" / section)
      └─ Chapter
         └─ Scene
```

Three rules govern it:

1. **Levels are configuration, not schema.** A project-wide `structure_levels` config declares which levels are in use and what the writer calls them (one writer uses all five, another just Novel → Scene). Disabling a level reparents its children to the next enabled ancestor; enabling a deeper level auto-creates one default node per parent (e.g. "Chapter 1" inside each plot point) and re-homes scenes into it — so the lowest-level attachment rule (invariant rule 2) holds at all times, scenes never float.
2. **The meta-structure is novel-wide; the instances are per-character.** Every POV character gets their own tree (their own arcs, plot points, chapters), but all characters share the same set of levels — matching how authors actually work.
3. **Fields attach to levels, not to tables** (§4). Any metadata field can be enabled at any level; the novel might carry 3 fields, scenes 15.

**Tables:**

- `structure_levels` — ordered level config: `(level_key, label, enabled, depth)`. Writer-renamable labels; defaults novel/arc/plot point/chapter.
- `structure_nodes(id, character_id, level_key, parent_id, order_key, title, deleted_at, created_at)` — one table replaces `acts`, `plot_points`, and `chapters`. Each character's tree root is their **novel node** (which is where the per-character novel-level fields live — today's `character_psychology` columns are exactly this, hardcoded).
- `scenes` — stays a dedicated leaf table (it carries drafts, braid position, and all Class A satellite content), with `parent_node_id` referencing either a node at the **lowest enabled level** (placed) or the character's novel root (bullpen), plus `last_parent_node_id` for bullpen provenance — see invariant rule 2.

**The containment invariant (Brian, 2026-06-12).** The app grew bottom-up — scenes first (markdown lines), then plot points (headers), then chapters and novel-level organization bolted on — so belonging has always been annotations on scenes that nothing keeps coherent. The new model inverts that: **belonging is the backbone.**

1. `scenes.parent_node_id` and `structure_nodes.parent_id` are **NOT NULL** (roots excepted). Every scene can answer "what chapter, plot point, arc, novel am I in?" at any moment by walking up the tree — one lineage, always derivable, never stored redundantly. (For levels the writer has disabled, the honest answer is "this novel doesn't use chapters" — not unknown.)
2. **Placement is binary: fully placed, or in the bullpen — never in between.** A scene always attaches at the **lowest enabled level**: if chapters are on, it is either in a chapter or in the bullpen. It cannot half-belong — attached to a plot point but to no chapter within it. Pulling a scene out of its chapter therefore means one of two deliberate moves: assign it to another chapter, or send it to the bullpen. The scene never disappears either way.

   **The bullpen remembers.** Bullpen = parent is the character's novel root and `braid_key` is NULL, and `sendToBullpen` stamps `last_parent_node_id` — so the bullpen UI can group its contents by provenance ("was in: Chapter 7", "was in: Setup"), not present an amnesiac pile. Soft delete (§6) keeps those references resolvable even when the old chapter has itself been deleted ("was in: Chapter 7 *(deleted)*"). Today's bug class (return-to-bullpen leaving a stale `timeline_position` behind) stays unrepresentable: placement and braid position are one state, changed by one mutation.
3. Containment changes **only** through `move`/`reparent`/`sendToBullpen`/`placeAt` mutations — each a one-row write with an inverse. Nothing else can orphan or re-home anything; the deletion budget (§6) means even bugs can't silently strand children.

**Considered: fully untyped Scrivener-style buckets (Brian, 2026-06-12).** Should nodes just be unlabeled folders — any folder nests anything, ragged depth allowed, à la Scrivener's binder? Half-adopted: the *storage* already is that (one generic `structure_nodes` table; "plot point" is config paint on a depth, nothing hardcoded). The level labels stay, though, because three of this spec's own requirements are expressible only against typed levels: per-level field attachment ("scenes have 15 fields" — Scrivener itself cannot express this; its custom metadata is uniform across all documents), the lowest-level placement invariant ("fully placed" is undefined in a ragged tree), and cross-POV structural alignment (comparing Noah's Act 2 to Grace's). Escape hatch if free-form piles are ever wanted: a single designated "group" level permitted to nest recursively — deferred, not in v1.

**Decided 2026-06-12 — typed levels stay.** Brian: "Scrivener already exists; we don't need another Scrivener with a few fancy screens." The typed structure isn't a limitation to apologize for — it's the product: Braidr's differentiation is *structural discipline* (per-level fields, placement guarantees, cross-POV alignment), not a free-form binder.

**Evidence this is the right generalization, from the AS-IS schema itself:** the structure fields (`starting_state, ending_state, polarity, transformation, …`) already exist at *four* levels — `character_psychology` (novel), `acts`, `plot_points`, `scenes` — each as a separately hardcoded mechanism. The schema has been growing toward "same fields, any level" by accretion; the tree + shared fields makes it the design.

**[Resolved 2026-06-12 — chapters are per-character, like every other level.]** Today `chapters` is novel-wide (no `character_id`) plus a `braided_chapters` table; these migrate by assigning each chapter to the POV character of its scenes (split if mixed). *Data check (same day): America America and New novel contain zero chapter rows — there is nothing to migrate, so the per-character chapter level starts clean with no back-fill rule needed.* No `character_id NULL` shared-node fallback. Brian's reasoning: (1) Braidr is a multi-POV tool — per-character structure is it qualifying where it works well, not a gap; (2) nothing stops a third-person-omniscient writer from creating one "character" named *Omniscient* — single-narrative projects are just the one-tree special case of the multi-POV model, no second mechanism needed.

## 2. Ordering — fractional keys, derived numbers

The tree collapses the seven ordering systems to **three columns**:

| Context | Column | Replaces |
|---|---|---|
| Node within parent | `structure_nodes.order_key` | `acts.display_order`, `plot_points.display_order`, `chapters.ord` |
| Scene within parent node | `scenes.outline_key` | `scene_number`, `scene_order`, section re-insert order |
| Scene in braid (global interleave) | `scenes.braid_key` | `timeline_position`, `braided_chapters.before_position` |

Keys are base-62 fractional strings (sqliteai/fractional-indexing style). A drag-drop writes **one row**. All display numbers ("Scene M·3", "braid #11", "Chapter 7") are **derived at read time** from the tree + keys — the numbering incoherence disappears by construction. Legacy integer columns are dual-written during migration, then dropped. `branch_positions` JSON blobs become per-branch key overrides in a late phase.

## 3. Mutation vocabulary

All writes go through one IPC channel (`braidr:mutate`) carrying `{name, args}`. The main process holds a **mutation registry**: each mutation declares its args type, the SQL it runs (one transaction), its **inverse** (for undo), and its **deletion budget** (how many rows it may delete — almost always 0 or 1).

Core vocabulary (representative, not exhaustive):

| Group | Mutations |
|---|---|
| node | `create(level, parentId) · rename · move(afterId) · softDelete · restore` — one group serves arcs, plot points, chapters |
| structure | `enableLevel · disableLevel · renameLevel` |
| scene | `create · rename · move(context, afterId) · reparent(nodeId) · sendToBullpen · placeAt(nodeId, afterId) · softDelete · restore` |
| character | `create · rename · softDelete · restore` |
| field | `defineField · updateFieldDef · attachToLevel · detachFromLevel · setValue(fieldId, entityId) · clearValue · softDeleteField` |
| task / note / worldEvent | same shape: narrow per-entity verbs |

**The one rule: a mutation may only touch rows it names.** No mutation receives a collection and reconciles the table against it. `SAVE_CHARACTER` and `SAVE_TIMELINE` are not redesigned — they are *retired*, one verb at a time (§7).

## 4. One field system — shared definitions, attached per level

Three parts, replacing the three parallel def/value systems *and* the hardcoded structure-field columns:

- `field_defs(id, name, type, options, …)` — **one shared pool of definitions.** A field is defined once; "Synopsis" is the same field everywhere it appears.
- `field_attachments(field_id, level_key)` — which levels a field is enabled on (scene is a level here; `task`/`note` participate as pseudo-levels for their custom fields). This is how the novel carries 3 fields while scenes carry 15.
- `field_values(field_id, entity_type, entity_id, value)` — **one row per (field, entity).** Set the chapter synopsis on any screen and every other screen reads the same row — value identity is guaranteed by the schema, and on-screen consistency by the normalized store (§5).

Built-in fields migrate in as defs: the structure six (from all four hardcoded sites — `character_psychology`, `acts`, `plot_points`, `scenes`), synopsis/description, expected scene count. Existing values at every level are **preserved** — they migrate to `field_values` rows on the corresponding node or scene.

*(Supersedes rev. 1's "consolidate structure fields onto sections": same goal — one mechanism instead of four — but the mechanism is now level-attachable shared fields rather than section-only columns, which honors that the values legitimately exist at multiple levels. The arc-view observation that motivated it still stands: arc view = table view + tree grouping, and under this model any view is just the tree rendered at a chosen depth. The data layer must not grow view-specific read paths.)*

## 4b. Tasks: subtasks + details page (added 2026-06-12)

Two additions to the tasks domain, sequenced into Phase 4 (which rebuilds tasks first):

- **Subtasks** — self-referential `tasks.parent_task_id` plus a fractional `order_key` among siblings, under the same containment discipline as the structure tree: a subtask always knows its parent, placement changes only through named moves, and soft-deleting a task soft-deletes its subtree. The Phase 4 task verbs are designed for this from day one: `task.create(parentId?)`, `task.move(parentId, afterId)`, `task.setFields`, `task.softDelete`/`restore`. Time rollups (the weekly-hours tracker) sum across subtrees.
- **Task details page** — a full detail view per task (UX sibling of the arc metadata detail editor): fields, time entries, subtasks, scene links. Data-side it is *free* by construction — it selects the same single cards (task row + unified `field_values` + time entries) every other screen reads; no new storage, no sync concern.

## 5. Renderer store

A normalized store (entities by id + key-ordered id lists per context) replaces App.tsx-as-database. **zustand** (confirmed 2026-06-12) — small, no boilerplate, plays well with the existing React tree.

- Views **select** from the store (`useNode(id)`, `useChildren(nodeId)`, `useBraidOrder()`, `useFieldValue(fieldId, entityId)`); they never receive or reassemble project copies. POV view, arc view, table view, braid view are all *the same tree* selected at different depths/groupings — which is what makes field values "persistent across views and locations" automatic rather than a synchronization problem.
- A change = dispatch named mutation → store applies it optimistically → same `{name, args}` goes over IPC → SQLite. One code path, both sides.
- The store is adopted **view by view** (POV first), coexisting with App.tsx state during transition. App.tsx shrinks as views move over.

## 6. Retention safeguards (RESEARCH §7)

Designed-in, not bolted on:

1. **Soft delete** — `deleted_at` on every user-content table; delete mutations set it, views filter it, `restore` clears it. Purge only via an explicit maintenance pass after the retention window (**30 days, confirmed 2026-06-12**; configurable). `archived_scenes`/`archived_notes` migrate into this and are dropped.
2. **Mutation log table** — `mutation_log(id, ts, name, args_json, inverse_json)`, appended in the same transaction as every mutation. Powers app-wide Ctrl+Z (in-session) and post-incident forensics/recovery (persistent). Pruned by age/size.
3. **Backup rotation** — formalize auto-backup: last 5 saves + 7 dailies + 4 weeklies, plus a mandatory checkpoint before any schema migration or branch restore.
4. **Deletion budget enforcement** — the mutation executor counts deleted rows (`sqlite3_changes`) and **rolls back the transaction** if a mutation exceeds its declared budget. Replace-by-absence becomes a runtime error, not a code-review catch.
5. Keep `quick_check` + self-heal-from-backup on load, unchanged.

## 6b. Branches — full rework, own design pass (flagged by Brian 2026-06-12)

Branches are the experimentation feature, and today they're the **worst Class B offender**: whole-table JSON snapshots, restore = wipe every BRANCHED_TABLE and re-insert with foreign keys off, plus braid positions duplicated as a JSON blob per branch. Brian's verdict: the design needs an entire rework — UI/UX *and* data layer.

**Decision: branches get their own design doc (`BRANCHES.md`), written after the substrate (§7 phase 2) exists** — because the rework has to start from the UX question ("what is the writer actually experimenting with — order? membership? prose? all of it?") and because the new architecture supplies exactly the primitives a sane branch model needs:

- **The mutation log is already a branch mechanism.** A branch is conceptually "a set of changes relative to the main line" — which is literally what a labeled fork of the mutation log is. Switching branches = walking inverses back and replaying forward: transactional, cheap, no wipe. (This is the git model, and we get it nearly free.)
- **Alternative: branch-scoped overlays** — per-branch overrides for only the things experimentation touches (placement, order keys, field values, drafts), composed over the main line at read time. Simpler to display "what differs," dodges full log-replay semantics.
- The choice between these is the heart of `BRANCHES.md`, driven by the UX.

**Constraints fixed now, regardless of which model wins:**
1. Wipe-and-reinsert restore **dies**. Branch operations become named mutations with deletion budgets like everything else.
2. Branch switching must respect the containment invariant — no intermediate state where scenes are orphaned.
3. The snapshot layer survives as the coarse *backup* checkpoint (the Memento half, per RESEARCH §5) — demoted from being the branch mechanism to being insurance around it.
4. Until the rework, the existing branch machinery keeps working untouched; it is the **last** thing migrated (§7), not patched incrementally.

## 7. Migration order

Each phase ships independently, additive-first, with behavior-pinning tests before the old path is removed.

*Progress (updated 2026-06-13): Phases 0–4 ✅ DONE. Phase 5 🔵 IN PROGRESS (5a + 5b shipped — structure reads now on the tree; field reads + legacy-table drop remain). Phases 6–8 ⬜ not started.*

0. ✅ **Guardrails (precondition):** typecheck + eslint gates in CI. No data-layer code before this. — *Shipped PR #48 (v1.5.151).*
1. ✅ **Infrastructure:** `braidr:mutate` channel, mutation registry + executor (budget enforcement, log table), `deleted_at` columns, `PRAGMA user_version` + ordered migration files (stamp current schema as v1). All additive; nothing existing changes behavior. — *Shipped PR #49.*
2. ✅ **New substrate (additive):** create `structure_levels`, `structure_nodes`, `field_defs/attachments/values`; back-fill from `acts` + `plot_points` + `chapters` + `character_psychology` + the three old field systems + the hardcoded structure columns. Old tables stay authoritative; the substrate is kept in sync by a one-way refresh until read paths move. New mutations (§3) write the substrate *and* the legacy columns (dual-write) during transition. — *Shipped PRs #49–#50.*
3. ✅ **Retire SAVE_CHARACTER** — the scarier Class B path, verb by verb against the new substrate: (a) outline reorder → `scene.move`/`node.move` on fractional keys (reorders trigger most bulk saves today); (b) field edits → `field.setValue`; (c) create/delete → narrow verbs with soft delete. When no caller remains, delete the DELETE+re-INSERT code and the plot-point landmine with it. — *Done (commit 1096fa3): SAVE_CHARACTER + the plot-point landmine deleted.*
4. ✅ **Retire SAVE_TIMELINE** — split the 20-key grab-bag by domain, **tasks first** (the table both data-loss incidents hit), then connections, world events, defs, views. The `shouldReplace` guard stays until the last replace path is gone. The task rebuild includes the §4b additions (subtasks schema + verbs); the details page UI can follow separately once the verbs exist. — *Done through PR #58: SAVE_TIMELINE IPC handler retired entirely; all writes are point-of-change mutations. (Subtasks/§4b not yet built — tracked separately.)*
5. 🔵 **Cut over reads** — views select from the substrate; legacy tables (`acts`, `plot_points` as structure, `chapters`, `character_psychology` structure columns, old field tables) drop after their last reader.
   - ✅ **5a** (PR #59): `refreshSubstrate()` seeds `structure_nodes` once per project (not wipe-and-rebuild every open); mutation order_key edits now survive reopen.
   - ✅ **5b** (PR #60): plot-point + act reads cut over to the tree — flat section order is the depth-first walk of `structure_nodes` (`getPlotPointsOrdered`/`getActsOrdered`), `node.move` owns `order_key` and reparents on cross-act drops. Verified behaviour-preserving on real projects. Legacy `display_order`/`act_id` still dual-written.
   - ⬜ **5c remaining:** cut over **field reads** to `field_values` + finish the `syncStructureSix` dual-write so `refreshFields()`-every-open can stop and `refreshSubstrate()` can leave `initialize()`; then **drop the legacy structure tables/columns** once nothing reads them.
6. ⬜ **Ordering cleanup** — drop legacy integer columns, derive all display numbers.
7. ⬜ **Renderer store** rollout runs in parallel with 3–6, view by view, consuming whatever mutations exist so far.
8. ⬜ **Branch rework** — last, per `BRANCHES.md` (§6b): its own UX-first design pass on top of the finished substrate; existing branch machinery untouched until then.

## UX/UI implications (recorded for the redesign, not in scope here)

- Views become *renderings of one tree at chosen depths*: POV view = one character's tree; arc/table = tree flattened with group rows; braid = scenes by `braid_key`. The arc/table merge falls out naturally.
- Level configuration needs UI: pick which levels this novel uses, rename them.
- Field management needs one UI: define field once, toggle which levels it appears on.
- Writers who use only Novel → Scene should never see arc/plot-point/chapter chrome.

## Open calls — all resolved 2026-06-12

1. ~~Scene-level structure fields: drift or intent?~~ **Superseded by rev. 2** — fields are level-attachable; existing values at all levels migrate intact (§4)
2. ~~Trash retention window~~ **30 days, configurable** (§6)
3. ~~Store library~~ **zustand** (§5)
4. ~~Chapter scope~~ **Per-character, no shared fallback** — omniscient writers model their narrator as one "character" (§1)

**The spec is signed off. Status (2026-06-13): Phases 0–4 shipped; Phase 5 in progress (5a + 5b done — structure reads on the tree). Next: Phase 5c — cut over field reads to `field_values`, then drop the legacy structure tables/columns.**
