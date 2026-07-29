# POV Hide Scenes Toggle — Design Spec

**Date:** 2026-05-27

## Goal

Add a toolbar toggle to the POV view that hides all scene rows, leaving only section headers and their synopsis textareas visible. The intended workflow is writing a high-level synopsis for each section without the distraction of individual scene cards.

## State

Add `hideScenes: Record<string, boolean>` to App.tsx alongside the existing `hideSectionHeaders` state. Keyed by tab ID so each POV tab tracks its own toggle state. Resets on app close (in-memory only, same as `hideSectionHeaders`).

## PovOutlineView Changes

Add `hideScenes?: boolean` prop.

When `hideScenes` is true:
- Skip rendering `SortableItem`/`OutlineSceneRow` blocks inside each section
- Skip rendering `EmptySectionDropZone`
- Force `descVisible = true` in `SectionHeader` regardless of the per-section `synopsisMode` value, so the synopsis textarea is always accessible

When `hideScenes` is false (default): behavior is identical to today.

Section headers (title, count, drag handle, delete button, chevron) render unchanged in both modes.

## Toolbar Button

Add a "Scenes" toggle button in the POV toolbar immediately after the existing "Sections" button.

- Active (lit) when scenes are visible
- Inactive when scenes are hidden
- Follows the same `toolbar-btn` + active class pattern as "Sections"

## DndContext

No changes. With no scene rows rendered, drag events don't fire. The `DndContext` wrapper stays as-is.

## Out of Scope

- Persisting toggle state across app restarts
- Per-section scene collapse (each section individually collapsible)
- Any changes to the Braided view or other views
