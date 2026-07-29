# Table Merge Cells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Merge Cells" / "Split Cell" smart-toggle button to the table right-click context menu in the Notes editor.

**Architecture:** Single button added to `TableContextMenu.tsx` using TipTap's built-in `mergeOrSplit()` command. Label is dynamic — reads `editor.can().splitCell()` to show "Split Cell" when the cursor is inside a merged cell, otherwise "Merge Cells". No new files, no extension changes.

**Tech Stack:** TipTap `@tiptap/extension-table` (already installed), React, TypeScript

---

### Task 1: Add Merge/Split button to TableContextMenu

**Files:**
- Modify: `src/renderer/components/notes/TableContextMenu.tsx`

- [ ] **Step 1: Add the button after the column-insert section**

In `src/renderer/components/notes/TableContextMenu.tsx`, find the second column-insert button and the divider that follows it:

```tsx
      <button className="table-context-item" onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 19l7-7-7-7"/></svg>
        Insert Column Right
      </button>
      <div className="table-context-divider" />
      <div className="table-context-submenu">
```

Replace it with:

```tsx
      <button className="table-context-item" onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 19l7-7-7-7"/></svg>
        Insert Column Right
      </button>
      <div className="table-context-divider" />
      <button className="table-context-item" onClick={() => run(() => editor.chain().focus().mergeOrSplit().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/>
          <path d="M11 12h2M9 10l2 2-2 2M15 10l-2 2 2 2"/>
        </svg>
        {editor.can().splitCell() ? 'Split Cell' : 'Merge Cells'}
      </button>
      <div className="table-context-divider" />
      <div className="table-context-submenu">
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep TableContextMenu
```

Expected: no output (no errors in that file).

- [ ] **Step 3: Test manually in the app**

Start the app with `npm start`, open a note, insert a table, right-click a cell. Verify:
- "Merge Cells" appears in the menu between "Insert Column Right" and "Row Color"
- Select multiple cells (click + shift-click or click-drag), right-click → "Merge Cells" → cells merge
- Right-click the merged cell → label now reads "Split Cell" → click → cell splits

- [ ] **Step 4: Commit**

```bash
cd /Users/brian/braidr && git add src/renderer/components/notes/TableContextMenu.tsx docs/superpowers/specs/2026-05-28-table-merge-cells-design.md docs/superpowers/plans/2026-05-28-table-merge-cells.md
git commit -m "feat: add merge/split cells to table context menu"
```
