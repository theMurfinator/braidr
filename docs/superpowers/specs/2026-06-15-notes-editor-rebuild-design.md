# Notes Editor Rebuild — Design Spec

**Date:** 2026-06-15
**Status:** Awaiting review
**Author:** Brian + Claude

---

## Plain-English summary

Braidr's Notes editor feels fragile (deleting an image can delete a whole
column) and is missing the Notion/ClickUp niceties Brian wants (a "+" on every
line, drag any line, nesting, toggles, resizable images and columns, richer
tables). The current editor is a hand-rolled TipTap setup whose custom
column/drag code fights ProseMirror's internals — that's the root cause of the
fragility.

We will rebuild the editor on **BlockNote**, a Notion-style block editor built
on top of TipTap. It ships nesting, drag handles, the "+" button, toggles,
resizable images, resizable columns, and rich tables as proven, maintained
features — so our effort goes into Braidr's own bits, not into fighting editor
internals.

We will also change **how a note's text is saved**: today each note's body is
stored as HTML (a lossy, tangled format that drops details like column widths
and image sizes). We'll switch to BlockNote's own clean structured format
(JSON). Notes already live in the project's SQLite database; only the *content
representation* changes, and existing notes are converted once, non-destructively
(old HTML kept as a backup).

---

## Goals

1. **Kill the fragility.** Deleting an image must never delete its column.
   Containers (columns, toggles, list items) must never silently collapse.
2. **World-class block editing.** Notion/ClickUp-style "+" on every line, drag
   any line, true nesting (indent/outdent, drag-to-nest).
3. **New features:** toggles/collapsibles, richer tables.
4. **Hard requirements (explicitly called out by Brian):** drag-to-resize
   **images** and drag-to-resize **columns**, ClickUp-style.
5. **Build it right, no data loss.** Clean storage format, non-destructive
   migration, and every consumer of note content updated to the new format.

## Non-goals (explicitly out of scope for this project)

- **Custom fields on notes.** Notes will *not* get scene-style custom fields.
  Decided against. Possible separate future effort.
- **Reviving wikilinks / backlinks / graph view.** These are not live today.
  Their existing (dormant) code is left untouched and is **not** a dependency of
  the new editor. Wikilinks could return later as a BlockNote custom inline
  element; not now.
- **Shredding note blocks into the substrate** (`structure_nodes` /
  `field_values`). The substrate is the authority for the novel's *structure*
  (acts/sections/scenes). A note's internal prose blocks are editor-internal
  document state and stay as a structured JSON document on the note row. This
  boundary is deliberate — shredding would reintroduce the "fight the editor"
  fragility we are removing.

---

## Decision: rebuild on BlockNote (Approach B)

Considered three approaches:

- **A — Hand-build a nestable-block schema on raw TipTap v3.** Maximum control,
  keeps everything in-house, but reinvents the exact recursive-nesting engine
  that BlockNote already hardened. Highest risk of *new* fragility. Rejected:
  ironically the most likely to *not* be built right.
- **B — Rebuild on BlockNote (chosen).** BlockNote *is* TipTap/ProseMirror
  underneath, so we stay in-ecosystem while standing on a maintained block
  engine. Delivers nesting, drag, "+", toggles, resizable images/columns, and
  rich tables natively. The one historical risk (porting the wikilink/graph
  "crown jewel") is **void** — those features are not live.
- **C — Harden-only, no true nesting.** Smallest/safest but does not deliver
  nesting, which Brian designated **core**. Rejected.

**Confirmed BlockNote capabilities (verified against docs):**

- Resizable images (`previewWidth` + resize handles). ✅
- Notion-style resizable multi-column layout (`@blocknote/xl-multi-column`,
  `createColumnResizeExtension`). ✅
- Toggle headings + toggle list items, and `isToggleable` for custom blocks. ✅
- Rich tables: `cellBackgroundColor`, `cellTextColor`, `headerRows`/`headerCols`,
  `columnWidths` (resize), `textAlignment`, cell merge (`colspan`/`rowspan`). ✅
- Custom blocks (for the Braidr todo widget) and custom inline content (for
  hashtags). ✅

Packages: `@blocknote/core`, `@blocknote/react`, `@blocknote/xl-multi-column`.

---

## Storage & format change

### Today

- Notes live in the `.braidr` SQLite DB: `notes` table
  (`id, title, content, parent_id, display_order, created_at, updated_at`) plus
  `note_tags`, `note_scene_links`, `note_links` join tables.
- `notes.content` holds the note body as an **HTML string**.
- `dataService.readNote(id)` / `saveNote(id, content)` read/write that column.
- The note list/order/title/tags live in `NotesIndex` + the join tables.

### After

- `notes.content` holds **BlockNote block-JSON** (the editor's native, lossless
  format). **No schema change** — same column, better payload.
- Everything else about notes storage is unchanged (records, tags, scene links,
  ordering, the notes sidebar/index).
- Images continue to be stored as files on disk and referenced via the existing
  `braidr-img://` custom protocol; `dataService.saveNoteImage` /
  `selectNoteImage` are reused via BlockNote's image upload hook.

### Why JSON over HTML

HTML is lossy and must be re-parsed on every load; round-tripping drops exactly
the attributes that feel fragile today (column widths, image sizes, table cell
colors, toggle open/closed, custom-block props). BlockNote JSON is the editor's
source of truth — lossless and canonical.

---

## Migration plan (non-destructive)

1. **Backup first.** Before converting any note, copy its current HTML body into
   a backup store (an `archived_notes`-style row keyed by note id + timestamp),
   so the original is always recoverable. No `.bak` files.
2. **Convert on first open (lazy) + a one-time full pass.** When a legacy note
   (HTML content) is opened, convert via BlockNote's
   `tryParseHTMLToBlocks()` → block-JSON and save back as JSON. A Phase-3 batch
   pass converts any remaining notes across all projects so nothing lingers in
   the old format.
3. **Detect format** by sniffing `content` (JSON array/object vs. HTML string)
   so load is safe regardless of which format a given note is in during rollout.
4. **Custom blocks survive the convert.** Legacy todo-widget HTML and column
   HTML must map to their BlockNote equivalents during parse (custom parse
   rules), or be captured losslessly. Covered by the migration test fixtures.

### Consumers of note content that MUST be updated (data-loss risk if missed)

- **`src/renderer/utils/parseTodoWidgets.ts`** — currently parses note **HTML**
  to extract scene-linked todo rows surfaced in `App.tsx`. Because the todo
  widget is deferred, this is updated when the widget is re-enabled (Phase 3).
  Until then, existing todo-widget content is preserved by the migration backup
  store so nothing is lost; the batch migration must not crash on notes that
  contain a legacy todo widget.
- Word count and heading/TOC extraction → re-implement against BlockNote content.
  (Hashtag extraction is removed entirely — hashtags are killed.)

---

## Block set

**Native BlockNote blocks (no maintenance burden):** paragraph, headings,
bullet/numbered/check lists, toggle lists & toggle headings, quote, divider,
code block, resizable image, resizable multi-column layout, rich tables.

**Custom Braidr blocks/inline:** none for the initial rebuild. With hashtags
and the todo widget removed/deferred, the initial editor is essentially **stock
BlockNote** plus image-storage wiring and migration — the lowest-risk version of
this rebuild. (Future custom blocks/inline — scene-embed cards, wikilinks — slot
in later via BlockNote's custom-schema API.)

**Removed (killed by Brian):**

- **Inline hashtags** (`#tag` autocomplete in the editor body) and the
  inline-hashtag → note-tag merging. The `hashtag.ts` extension and
  `HashtagSuggestion.tsx` are deleted; hashtag parsing/merging is removed from
  `NoteEditor`; any hashtag usage in `NotesView` is cleaned up. The simple tag
  **pills bar** (`NoteMetadata.tags`, add/remove pills above the editor) is a
  separate feature and is kept as-is unless decided otherwise.

**Deferred (not critical right now):**

- **Todo widget** (`todoWidget`) — a scene-linked checklist (rows of
  `sceneKey`, `sceneLabel`, `description`, `done`). Full interactive port to a
  BlockNote custom block is **deferred to a later phase**. **However, migration
  must never lose existing todo-widget content** — the backup store (see
  Migration) guarantees recoverability, and conversion of a note containing a
  legacy todo widget must not crash or silently drop it. Re-enabling the
  interactive widget (and updating `parseTodoWidgets`) is its own follow-up.

---

## Editor chrome preserved (lives outside the editor, largely unchanged)

Title input, tag bar + autocomplete, table-of-contents drawer, word count,
footer. The table context menu becomes native BlockNote table UI. Image
paste/drop is rewired to `saveNoteImage`; heading extraction (TOC) and word
count are rewired to BlockNote's content API.

---

## Root-cause fragility fix

The image-deletes-column bug exists because the hand-rolled `column` node is
schema-typed `block+` (must hold ≥1 block) with custom `ignoreMutation` /
`NodeSelection` / DOM-mutation code. Emptying a column collapses it, and the
custom drag/selection code corrupts ProseMirror state. BlockNote routes all
deletion/selection/nesting through one hardened engine and guarantees containers
keep a valid child — so deleting an image leaves an empty line, never eats the
column. We delete `columns.ts` and `dragHandle.ts` (custom) entirely.

---

## Affected files (indicative)

- **Rewrite:** `src/renderer/components/notes/NoteEditor.tsx` (TipTap →
  BlockNote wrapper).
- **Delete (replaced by native):** `extensions/columns.ts`,
  `extensions/dragHandle.ts`, `extensions/slashCommand.ts`,
  `components/notes/SlashCommandList.tsx`, `TableControls.tsx`,
  `TableContextMenu.tsx`, `coloredTableRow.ts`.
- **Delete (killed):** `extensions/hashtag.ts`,
  `components/notes/HashtagSuggestion.tsx`; remove hashtag parsing/merging from
  `NoteEditor` and any hashtag usage in `NotesView`.
- **Update for new content format:** word-count/TOC extraction in `NoteEditor`.
- **Deferred (V2):** `extensions/todoWidget.tsx` re-port,
  `utils/parseTodoWidgets.ts` update, plus ClickUp-style quick-add-todo.
- **Main/IPC + data:** `main/braidrIpc.ts` (note read/save unchanged shape;
  add migration + backup), `main/database.ts` (backup store for old HTML),
  `services/dataService.ts` (unchanged interface).
- **Untouched/dormant:** `wikilink.ts`, `WikilinkSuggestion.tsx`,
  `BacklinksPanel.tsx`, `GraphView.tsx` (not a dependency of the new editor).

---

## Phasing (each phase shippable; built right, incremental)

- **Phase 0 — vertical slice.** BlockNote mounted in `NoteEditor`; native blocks
  + resizable columns + resizable images working; one real note round-trips
  through migration (HTML→JSON) with backup verified. Proves the foundation.
- **Phase 1 — parity.** Tag bar + hashtags (custom inline), TOC, word count,
  image paste/drop via `saveNoteImage`, slash menu, toggles.
- **Phase 2 — richer tables** config + full-project migration batch pass +
  backup verification across all live projects.
- **V2 (deferred follow-ups, not part of this rebuild):**
  - Todo widget re-enabled as a BlockNote custom block; `parseTodoWidgets`
    updated and tested. Migration already preserves the underlying data.
  - **ClickUp-style quick-add-todo from notes** — select text / a line in a note
    and turn it into a Braidr task. Brian likes this; explicitly V2.
  - Scene-embed cards and wikilinks (BlockNote custom schema) if ever wanted.

---

## Testing

Migration is the riskiest part, so it is test-first (per the project bug
workflow):

- A fixture suite of real legacy note HTML — columns, resized images, tables,
  todo widgets, nested lists — asserting round-trip fidelity HTML→blocks and
  that a backup row is written before conversion.
- A dedicated test that `parseTodoWidgets` extracts the same todo rows from the
  new JSON format as it did from the old HTML.
- Any migration bug gets a reproducing fixture before a fix.

---

## Decisions locked

1. **Inline hashtags** — **killed** per Brian. Removed entirely. The simple tag
   pills bar (`NoteMetadata.tags`) is kept unless Brian says otherwise.
2. **Todo widget** — **deferred to V2** (not critical now). Migration preserves
   its data; interactive port is a follow-up.
3. **ClickUp-style quick-add-todo from notes** — wanted, but **V2**.
