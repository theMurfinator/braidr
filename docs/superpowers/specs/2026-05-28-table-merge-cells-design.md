---
title: Table Merge/Split Cells
date: 2026-05-28
status: approved
---

## Summary

Add a "Merge Cells" / "Split Cell" button to the table right-click context menu in the Notes editor.

## Behavior

- **Placement:** After the "Insert Column Right" row in `TableContextMenu.tsx`, before the Row Color section (with a divider separating it from column inserts).
- **Label:** Dynamic — shows "Split Cell" when cursor is inside a merged cell (`editor.can().splitCell()` returns true), otherwise shows "Merge Cells".
- **Action:** Calls `editor.chain().focus().mergeOrSplit().run()` — TipTap's built-in smart toggle that merges selected cells or splits a merged cell.
- **Icon:** Cell-merge SVG (two cells joining), same 14×14 inline style as existing menu items.

## Files Changed

- `src/renderer/components/notes/TableContextMenu.tsx` — add one button between the column insert section and the row color divider.

## Out of Scope

- No changes to `TableControls.tsx` (the inline toolbar).
- No changes to `TableHeader` or cell extension configuration.
