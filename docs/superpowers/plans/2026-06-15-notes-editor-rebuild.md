# Notes Editor Rebuild (BlockNote) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Braidr's fragile hand-rolled TipTap Notes editor with a Notion-style BlockNote editor, and switch note storage from lossy HTML to BlockNote's native JSON via a non-destructive migration.

**Architecture:** BlockNote (built on TipTap/ProseMirror) renders the editor in `NoteEditor.tsx`. Note bodies are stored as BlockNote block-JSON in the existing `notes.content` SQLite column. When a note still holds legacy HTML, the renderer converts it to blocks on open; the main process backs up the old HTML into a new `note_content_backups` table before the first JSON write, so nothing is ever lost. Hashtags are removed; the todo widget and quick-add-todo are V2.

**Tech Stack:** React + Vite (renderer), Electron + better-sqlite3 (main), Vitest (tests). New deps: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `@blocknote/xl-multi-column`.

**Spec:** `docs/superpowers/specs/2026-06-15-notes-editor-rebuild-design.md`

---

## File Structure

**Create:**
- `src/shared/noteContent.ts` — pure helper `isBlockJson(content)` used by both renderer (load: JSON vs legacy HTML) and main (backup decision). One responsibility: format detection.
- `src/__tests__/note-content-format.test.ts` — unit tests for `isBlockJson`.
- `src/__tests__/note-content-backup.test.ts` — unit tests for the DB backup-on-migration method.

**Modify:**
- `src/main/database.ts` — add `note_content_backups` table + `backupAndUpdateNoteContent(noteId, newContent)`.
- `src/main/braidrIpc.ts:827` — `BRAIDR_SAVE_NOTE` calls the new backup-aware method.
- `src/renderer/components/notes/NoteEditor.tsx` — full rewrite as a BlockNote wrapper (keeps the surrounding chrome: title, tag pills bar, TOC, word count, footer).
- `src/renderer/components/notes/NotesView.tsx` — remove hashtag usage.
- `docs/features.md` — update the Notes feature description.

**Delete (replaced by native BlockNote or killed):**
- `src/renderer/extensions/columns.ts`, `src/renderer/extensions/dragHandle.ts`, `src/renderer/extensions/slashCommand.ts`, `src/renderer/extensions/hashtag.ts`, `src/renderer/extensions/coloredTableRow.ts`
- `src/renderer/components/notes/SlashCommandList.tsx`, `src/renderer/components/notes/HashtagSuggestion.tsx`, `src/renderer/components/notes/TableControls.tsx`, `src/renderer/components/notes/TableContextMenu.tsx`, `src/renderer/components/notes/NoteToolbar.tsx`

**Untouched (dormant, not a dependency of the new editor):**
- `src/renderer/extensions/wikilink.ts`, `src/renderer/components/notes/WikilinkSuggestion.tsx`, `src/renderer/components/notes/BacklinksPanel.tsx`, `src/renderer/components/notes/GraphView.tsx`, `src/renderer/extensions/todoWidget.tsx`, `src/renderer/utils/parseTodoWidgets.ts`

---

## Phase 0 — Foundation & data safety

### Task 1: Install BlockNote dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the four BlockNote packages**

Run:
```bash
npm install @blocknote/core @blocknote/react @blocknote/mantine @blocknote/xl-multi-column
```
Expected: packages added to `dependencies`, no peer-dependency errors (BlockNote requires React 18+, which this project has).

- [ ] **Step 2: Verify the app still builds**

Run: `npm run typecheck`
Expected: PASS (no usage yet, just deps installed).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(notes): add BlockNote editor dependencies"
```

---

### Task 2: Note content format detection helper (TDD)

A single source of truth for "is this stored content BlockNote JSON, or legacy HTML?" Block-JSON is always a JSON array of block objects; legacy content is an HTML string (or empty).

**Files:**
- Create: `src/shared/noteContent.ts`
- Test: `src/__tests__/note-content-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/note-content-format.test.ts
import { describe, it, expect } from 'vitest';
import { isBlockJson } from '../shared/noteContent';

describe('isBlockJson', () => {
  it('treats a JSON array of blocks as block-json', () => {
    expect(isBlockJson('[{"type":"paragraph","content":[]}]')).toBe(true);
  });
  it('treats an empty array as block-json', () => {
    expect(isBlockJson('[]')).toBe(true);
  });
  it('treats legacy HTML as NOT block-json', () => {
    expect(isBlockJson('<p>hello <strong>world</strong></p>')).toBe(false);
  });
  it('treats an empty string as NOT block-json', () => {
    expect(isBlockJson('')).toBe(false);
  });
  it('treats a JSON object (not array) as NOT block-json', () => {
    expect(isBlockJson('{"type":"paragraph"}')).toBe(false);
  });
  it('treats malformed JSON as NOT block-json', () => {
    expect(isBlockJson('[{oops')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/note-content-format.test.ts`
Expected: FAIL with "Cannot find module '../shared/noteContent'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/noteContent.ts

/**
 * Returns true if the stored note content is BlockNote block-JSON
 * (always a JSON array of block objects). Legacy notes are HTML strings,
 * for which this returns false. Empty content returns false.
 */
export function isBlockJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed[0] !== '[') return false;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/note-content-format.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/noteContent.ts src/__tests__/note-content-format.test.ts
git commit -m "feat(notes): add isBlockJson content-format helper"
```

---

### Task 3: DB backup-on-migration method (TDD)

Before a legacy-HTML note is first overwritten with JSON, copy its old HTML into `note_content_backups`. JSON→JSON saves never back up. This is the data-safety core.

**Files:**
- Modify: `src/main/database.ts` (add table to schema near the `notes` table ~line 199; add method in the Notes section ~line 1245)
- Test: `src/__tests__/note-content-backup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/note-content-backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'notes.braidr'));
}

describe('backupAndUpdateNoteContent', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('backs up legacy HTML before the first JSON write', async () => {
    const db = await freshDb(dir);
    db.insertNote('n1', 'Title', '<p>legacy <strong>html</strong></p>', null, 0);

    db.backupAndUpdateNoteContent('n1', '[{"type":"paragraph","content":[]}]');

    expect(db.getNote('n1')!.content).toBe('[{"type":"paragraph","content":[]}]');
    const backups = db.getNoteContentBackups('n1');
    expect(backups.length).toBe(1);
    expect(backups[0].content).toBe('<p>legacy <strong>html</strong></p>');
  });

  it('does NOT back up on a JSON-to-JSON save', async () => {
    const db = await freshDb(dir);
    db.insertNote('n1', 'Title', '[{"type":"paragraph","content":[]}]', null, 0);

    db.backupAndUpdateNoteContent('n1', '[{"type":"heading","content":[]}]');

    expect(db.getNoteContentBackups('n1').length).toBe(0);
    expect(db.getNote('n1')!.content).toBe('[{"type":"heading","content":[]}]');
  });

  it('does NOT back up an empty legacy note', async () => {
    const db = await freshDb(dir);
    db.insertNote('n1', 'Title', '', null, 0);

    db.backupAndUpdateNoteContent('n1', '[]');

    expect(db.getNoteContentBackups('n1').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/note-content-backup.test.ts`
Expected: FAIL with "db.backupAndUpdateNoteContent is not a function".

- [ ] **Step 3a: Add the backup table to the schema**

In `src/main/database.ts`, immediately after the `notes` table definition (the block ending at `);` near line 199), add:

```sql
  CREATE TABLE IF NOT EXISTS note_content_backups (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    content TEXT NOT NULL,
    backed_up_at INTEGER NOT NULL
  );
```

- [ ] **Step 3b: Add the method**

In `src/main/database.ts`, in the Notes section (near the existing `updateNote`, ~line 1250), add. (Use the file's existing `randomId()` helper and `Date.now()` pattern already used by `insertNote`.)

```ts
  getNoteContentBackups(noteId: string) {
    return this.db
      .prepare('SELECT * FROM note_content_backups WHERE note_id = ? ORDER BY backed_up_at DESC')
      .all(noteId) as { id: string; note_id: string; content: string; backed_up_at: number }[];
  }

  /**
   * Save new note content. If the existing content is legacy HTML (non-empty,
   * not block-JSON) and the incoming content IS block-JSON, back up the old
   * HTML first so the migration is non-destructive.
   */
  backupAndUpdateNoteContent(noteId: string, newContent: string) {
    const existing = this.getNote(noteId);
    if (existing) {
      const old = existing.content || '';
      if (old.trim() && !isBlockJson(old) && isBlockJson(newContent)) {
        this.db
          .prepare('INSERT INTO note_content_backups (id, note_id, content, backed_up_at) VALUES (?, ?, ?, ?)')
          .run(randomId(), noteId, old, Date.now());
      }
    }
    this.updateNote(noteId, { content: newContent });
  }
```

- [ ] **Step 3c: Import the helper**

At the top of `src/main/database.ts`, add to the imports:

```ts
import { isBlockJson } from '../shared/noteContent';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/note-content-backup.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/database.ts src/__tests__/note-content-backup.test.ts
git commit -m "feat(notes): non-destructive content backup on HTML->JSON migration"
```

---

### Task 4: Route note saves through the backup-aware method

**Files:**
- Modify: `src/main/braidrIpc.ts:827-836` (the `BRAIDR_SAVE_NOTE` handler)

- [ ] **Step 1: Replace `updateNote` with the backup-aware call**

Change the handler body from:

```ts
    const db = getDb(braidrPath);
    db.updateNote(noteId, { content });
    db.checkpoint();
```
to:
```ts
    const db = getDb(braidrPath);
    db.backupAndUpdateNoteContent(noteId, content);
    db.checkpoint();
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/braidrIpc.ts
git commit -m "feat(notes): save-note IPC routes through migration backup"
```

---

### Task 5: Minimal BlockNote editor mounted + legacy-HTML conversion

Replace the TipTap editor body in `NoteEditor.tsx` with a minimal BlockNote editor. Keep the existing surrounding chrome (title input, tag pills bar, footer) — only the `<EditorContent>` region changes. Loads JSON content as `initialContent`; converts legacy HTML on mount and saves it back (triggering the Task 3 backup).

**Files:**
- Modify: `src/renderer/components/notes/NoteEditor.tsx`
- Reference: BlockNote quick start + supported-formats (load/save JSON) — https://www.blocknotejs.org/docs/foundations/supported-formats

- [ ] **Step 1: Add BlockNote CSS import**

At the top of `NoteEditor.tsx` add (Mantine styling + BlockNote core styles):

```ts
import { useCreateBlockNote, useEditorChange } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import type { Block, PartialBlock } from '@blocknote/core';
import { isBlockJson } from '../../../shared/noteContent';
```

- [ ] **Step 2: Compute initial content synchronously from the stored string**

Inside the component, before creating the editor:

```ts
  // Legacy HTML is converted asynchronously after mount (see effect below);
  // JSON content is parsed synchronously into initialContent.
  const initialBlocks = useMemo<PartialBlock[] | undefined>(() => {
    if (isBlockJson(content)) {
      try { return JSON.parse(content) as PartialBlock[]; } catch { return undefined; }
    }
    return undefined; // legacy HTML -> start empty, convert in effect
  }, [noteId]); // re-evaluate only when switching notes
```

- [ ] **Step 3: Create the BlockNote editor**

Replace the `useEditor({...})` TipTap call with:

```ts
  const editor = useCreateBlockNote({ initialContent: initialBlocks }, [noteId]);
```

- [ ] **Step 4: Convert legacy HTML on mount**

Add an effect that converts legacy HTML once, then persists JSON (the IPC backup in Task 3/4 fires on that save):

```ts
  useEffect(() => {
    if (!editor) return;
    if (isBlockJson(content)) return; // already migrated
    if (!content.trim()) return;      // empty note, nothing to convert
    let cancelled = false;
    (async () => {
      const blocks = await editor.tryParseHTMLToBlocks(content);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
      onContentChange(JSON.stringify(editor.document)); // persists + backs up old HTML
    })();
    return () => { cancelled = true; };
  }, [editor, noteId]);
```

- [ ] **Step 5: Save on change (debounced, JSON)**

Replace the TipTap `onUpdate` save path. Keep the existing 800ms `debounceRef` pattern:

```ts
  useEditorChange((ed) => {
    const json = JSON.stringify(ed.document);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onContentChange(json), 800);
  }, editor);
```

- [ ] **Step 6: Render the editor**

Replace `<EditorContent editor={editor} />` with:

```tsx
        <div className="note-editor-content">
          <BlockNoteView editor={editor} />
        </div>
```

Remove (for now) the TipTap-only props and the TOC/word-count code that referenced `editor.state` — they are re-added against BlockNote in Phase 1 (Task 8). Delete the now-unused TipTap extension imports.

- [ ] **Step 7: Build and verify in the Electron app**

Run: `npm run dev`
Verify manually (per project preference — iterate in the real Electron app):
1. Open an existing note that has content → it renders (legacy HTML converted).
2. Type a change, wait 1s, reopen the note → change persisted.
3. In a SQLite browser (or a quick `getNoteContentBackups` log), confirm a backup row was written for the converted note, and the note's `content` now starts with `[`.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/notes/NoteEditor.tsx
git commit -m "feat(notes): mount BlockNote editor with legacy-HTML migration"
```

---

## Phase 1 — Parity & features

### Task 6: Resizable columns + native blocks (toggles, slash menu, drag, +)

Add the multi-column schema so columns + the "+" button, drag handle, slash menu, toggles, dividers, and code blocks all come from BlockNote natively.

**Files:**
- Modify: `src/renderer/components/notes/NoteEditor.tsx`
- Reference: multi-column example — https://www.blocknotejs.org/examples/basic/multi-column (follow the installed `@blocknote/xl-multi-column` version's exports for exact wiring)

- [ ] **Step 1: Build the multi-column schema and pass it to the editor**

```ts
import { BlockNoteSchema } from '@blocknote/core';
import { en } from '@blocknote/core/locales';
import {
  withMultiColumn,
  multiColumnDropCursor,
  locales as multiColumnLocales,
} from '@blocknote/xl-multi-column';

// ...
const editor = useCreateBlockNote({
  initialContent: initialBlocks,
  schema: withMultiColumn(BlockNoteSchema.create()),
  dropCursor: multiColumnDropCursor,
  dictionary: { ...en, multi_column: multiColumnLocales.en },
}, [noteId]);
```

- [ ] **Step 2: Verify in the Electron app**

Run: `npm run dev`. Confirm:
1. Hovering a line shows the drag handle **and** a "+" button (native).
2. Slash menu (`/`) lists toggles, columns, divider, code block, table, image.
3. Insert two columns, drag the divider between them → columns **resize** and the ratio persists after reopen.
4. Create a toggle, nest blocks inside, collapse/expand works.
5. **The fragility check:** put an image inside a column, delete the image → the column stays, leaving an empty line (the old bug is gone).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/notes/NoteEditor.tsx
git commit -m "feat(notes): native resizable columns, toggles, drag + plus button"
```

---

### Task 7: Image upload/paste/drop via existing storage + resizable images

Wire BlockNote's `uploadFile` to the existing `dataService.saveNoteImage` so images are stored as files and referenced via the `braidr-img://` protocol (unchanged storage). BlockNote images are drag-resizable out of the box (`previewWidth`).

**Files:**
- Modify: `src/renderer/components/notes/NoteEditor.tsx`

- [ ] **Step 1: Add an uploadFile handler**

```ts
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const base64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const relativePath = await dataService.saveNoteImage(projectPathRef.current, base64, file.name);
    return `braidr-img://${projectPathRef.current}/notes/${relativePath}`;
  }, []);
```

- [ ] **Step 2: Pass it to the editor**

Add `uploadFile` to the `useCreateBlockNote` options object from Task 6.

- [ ] **Step 3: Verify in the Electron app**

Run: `npm run dev`. Confirm:
1. Slash `/image` → upload picker stores the file and the image renders via `braidr-img://`.
2. Paste an image from clipboard → inserted and stored.
3. Drag an image file into the editor → inserted at drop point.
4. Drag the image's side handle → it **resizes**; reopen the note → size persists.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/notes/NoteEditor.tsx
git commit -m "feat(notes): image upload/paste/drop via braidr-img storage; resizable"
```

---

### Task 8: Re-add word count + table of contents from BlockNote content

**Files:**
- Modify: `src/renderer/components/notes/NoteEditor.tsx`

- [ ] **Step 1: Compute word count and headings from `editor.document`**

Replace the removed TipTap TOC/word-count logic. In the `useEditorChange` callback (and once on mount), derive both from the block tree:

```ts
  const recompute = useCallback((ed: typeof editor) => {
    if (!ed) return;
    const text = ed.document
      .map((b: Block) => Array.isArray(b.content)
        ? b.content.map((c: any) => ('text' in c ? c.text : '')).join('')
        : '')
      .join(' ');
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);

    const hs: { level: number; text: string; id: string }[] = [];
    for (const b of ed.document) {
      if (b.type === 'heading') {
        const t = Array.isArray(b.content)
          ? b.content.map((c: any) => ('text' in c ? c.text : '')).join('')
          : '';
        hs.push({ level: (b.props as any).level ?? 1, text: t, id: b.id });
      }
    }
    setHeadings(hs);
  }, []);
```

Call `recompute(ed)` inside the `useEditorChange` callback and in a mount effect `useEffect(() => recompute(editor), [editor, noteId])`.

- [ ] **Step 2: Point TOC clicks at block ids**

In `handleTocClick`, scroll to the heading by block id using BlockNote's DOM (`[data-id="<id>"]`) instead of the old nth-heading query:

```ts
  const handleTocClick = (id: string) => {
    const el = scrollableRef.current?.querySelector(`[data-id="${id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
```

Update the TOC list `onClick={() => handleTocClick(h.id)}`.

- [ ] **Step 3: Verify in the Electron app**

Run: `npm run dev`. Confirm word count updates as you type, and the TOC lists headings and scrolls to them on click.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/notes/NoteEditor.tsx
git commit -m "feat(notes): word count + TOC derived from BlockNote document"
```

---

### Task 9: Remove hashtags

**Files:**
- Modify: `src/renderer/components/notes/NoteEditor.tsx` (remove `parseHashtags`, the hashtag suggestion, and the inline-hashtag→tags merge in the save path)
- Modify: `src/renderer/components/notes/NotesView.tsx` (remove hashtag usage)
- Delete: `src/renderer/extensions/hashtag.ts`, `src/renderer/components/notes/HashtagSuggestion.tsx`

- [ ] **Step 1: Delete the files**

```bash
git rm src/renderer/extensions/hashtag.ts src/renderer/components/notes/HashtagSuggestion.tsx
```

- [ ] **Step 2: Strip hashtag code**

Remove from `NoteEditor.tsx`: the `parseHashtags` function, `hashtagSuggestion`, the Hashtag import, and the `inlineTags` merge block in the save path. Remove hashtag imports/usage from `NotesView.tsx`. (The tag **pills bar** UI and `onTagsChange` stay — they are independent of inline hashtags.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no remaining references to hashtag modules).

- [ ] **Step 4: Commit**

```bash
git add -u src/renderer
git commit -m "refactor(notes): remove inline hashtag feature"
```

---

## Phase 2 — Richer tables, sweep, cleanup

### Task 10: Enable rich table features

BlockNote tables support cell background/text color, header rows/cols, column resize, alignment, and cell merge. Enable the non-default ones.

**Files:**
- Modify: `src/renderer/components/notes/NoteEditor.tsx`

- [ ] **Step 1: Configure table features on the editor**

Add the `tables` option to `useCreateBlockNote` (per the installed version's option names; see https://www.blocknotejs.org/docs/features/blocks/tables):

```ts
  tables: {
    splitCells: true,
    cellBackgroundColor: true,
    cellTextColor: true,
    headers: true,
  },
```

- [ ] **Step 2: Verify in the Electron app**

Run: `npm run dev`. Insert a table; confirm: drag to resize columns; right-click/cell menu sets background + text color; toggle header row/column; merge/split cells.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/notes/NoteEditor.tsx
git commit -m "feat(notes): enable rich table features (colors, headers, split cells)"
```

---

### Task 11: One-time migration sweep across all notes in a project

Lazy migration (Task 5) only converts notes as they are opened. Add a sweep that converts every legacy note in the current project once, so old-format notes don't linger and external readers see consistent data.

**Files:**
- Modify: `src/renderer/components/notes/NotesView.tsx` (run sweep once after the notes index loads)

- [ ] **Step 1: Add the sweep**

After the notes list loads for a project, iterate notes whose content is legacy HTML and migrate each via a headless BlockNote conversion, persisting through the existing `saveNote` path (which backs up). Use a guarded one-shot ref so it runs once per project load:

```ts
  const sweptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectPath || sweptRef.current === projectPath) return;
    sweptRef.current = projectPath;
    (async () => {
      const { ServerBlockNoteEditor } = await import('@blocknote/server-util');
      const server = ServerBlockNoteEditor.create();
      for (const meta of notesIndex.notes) {
        const raw = await dataService.readNote(projectPath, meta.id);
        if (isBlockJson(raw) || !raw.trim()) continue;
        const blocks = await server.tryParseHTMLToBlocks(raw);
        await dataService.saveNote(projectPath, meta.id, JSON.stringify(blocks));
      }
    })();
  }, [projectPath, notesIndex]);
```

If `@blocknote/server-util` adds undue weight, an acceptable alternative is to keep lazy-only migration and drop this task — the backup guarantees safety either way. Decide during implementation; if kept, add the dependency in Task 1's commit.

- [ ] **Step 2: Verify in the Electron app**

Run: `npm run dev`. Open a project with several legacy notes; confirm after load that each note's stored content is JSON and a backup row exists for each converted note. No visible content change.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/notes/NotesView.tsx package.json package-lock.json
git commit -m "feat(notes): one-time migration sweep of legacy notes per project"
```

---

### Task 12: Delete superseded extensions/components + docs

**Files:**
- Delete: `columns.ts`, `dragHandle.ts`, `slashCommand.ts`, `coloredTableRow.ts` (extensions); `SlashCommandList.tsx`, `TableControls.tsx`, `TableContextMenu.tsx`, `NoteToolbar.tsx` (components)
- Modify: `docs/features.md`

- [ ] **Step 1: Remove dead imports then delete files**

Confirm none are imported anymore (they were removed from `NoteEditor.tsx` in Tasks 5–6), then:

```bash
git rm src/renderer/extensions/columns.ts src/renderer/extensions/dragHandle.ts \
       src/renderer/extensions/slashCommand.ts src/renderer/extensions/coloredTableRow.ts \
       src/renderer/components/notes/SlashCommandList.tsx \
       src/renderer/components/notes/TableControls.tsx \
       src/renderer/components/notes/TableContextMenu.tsx \
       src/renderer/components/notes/NoteToolbar.tsx
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run check`
Expected: PASS (no dangling references). Fix any remaining imports the compiler flags.

- [ ] **Step 3: Update docs/features.md**

Update the Notes section to describe the BlockNote editor: block-based editing with drag + "+", nesting, toggles, resizable images and columns, rich tables; note that content is stored as BlockNote JSON; hashtags removed; todo widget / quick-add-todo are planned (V2).

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "chore(notes): remove superseded TipTap extensions; update features doc"
```

---

## Self-Review notes (for the implementer)

- **Data safety is testable and tested** (Tasks 2–3); editor/UI behavior is verified manually in the Electron app, matching this project's testing reality (all existing tests are DB/logic; iterate in the real app, not mockups).
- **No data loss path:** every legacy→JSON transition backs up old HTML (Task 3), exercised by Task 5 (lazy) and Task 11 (sweep).
- **Version-sensitive third-party wiring** (multi-column exports, `tables` option names) is the one place to follow the installed package's types/examples rather than assume — links provided in Tasks 6 and 10.
- **Out of scope, intentionally:** todo widget, quick-add-todo, wikilinks/graph, custom fields. Their files are left untouched.
