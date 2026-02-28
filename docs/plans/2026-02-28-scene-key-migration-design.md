# Design: Migrate Scene Keys from `characterId:sceneNumber` to `scene.id`

**Date:** 2026-02-28
**Issue:** #143 — "Changes needed" and "time tracking" data associated with wrong scenes after reordering

## Problem

Every piece of data associated with a scene (draft content, metadata, tasks, time tracking, comments, scratchpad, dates) is keyed by `characterId:sceneNumber` — a mutable position that changes when scenes are reordered. A `remapSceneKeys` function tries to fix keys after reordering but misses tasks, analytics, note-linked todos, and timeline dates.

## Solution

Replace all `characterId:sceneNumber` keys with `scene.id` (a stable UUID). Since `scene.id` never changes, no remapping is ever needed — the remap machinery gets deleted entirely.

## Scope

### Files Touched (~15)

| File | Changes |
|------|---------|
| `src/shared/types.ts` | No type changes — Records are `Record<string, ...>`, key values change |
| `src/renderer/App.tsx` | Replace ~20 inline key constructions; delete remap functions; update load/save/archive/create |
| `src/renderer/components/EditorView.tsx` | Replace `getSceneKey()` and 3 inline constructions |
| `src/renderer/components/TableView.tsx` | Replace `getSceneKey()` |
| `src/renderer/components/CompileModal.tsx` | Replace `getSceneKey()` |
| `src/renderer/components/WordCountDashboard.tsx` | Replace `getSceneKey()` |
| `src/renderer/components/SceneCard.tsx` | 1 inline construction |
| `src/renderer/components/FloatingEditor.tsx` | 1 inline construction |
| `src/renderer/components/RailsView.tsx` | 1 inline construction |
| `src/renderer/components/PlotPointSection.tsx` | 2 inline constructions |
| Timeline components (5 files) | ~13 inline constructions |
| Notes components (2 files) | Wikilink/graph key construction |
| `src/renderer/utils/analyticsStore.ts` | `SceneSession.sceneKey` values become `scene.id` |
| `src/renderer/utils/parseTodoWidgets.ts` | Filter by `scene.id` |

### Data Migration

On project load in App.tsx, detect old-format keys and migrate:

1. Check if any key in `draftContent` matches `characterId:sceneNumber` format (contains `:` and ends with a number)
2. Build lookup: for each scene, map `${scene.characterId}:${scene.sceneNumber}` → `scene.id`
3. Remap all Records: `draftContent`, `drafts`, `sceneMetadata`, `scratchpadContent`, `sceneComments`, `timelineDates`, `timelineEndDates`, `positions`, `wordCounts`, `connections`
4. Remap `tasks[].sceneKey` and `sceneSessions[].sceneKey`
5. Note-linked todos in HTML: update `sceneKey` attributes where possible
6. Save immediately after migration

### What Gets Deleted

- `getSceneKey()` — 4 duplicate definitions, replaced by direct `scene.id` access
- `remapSceneKeys()` — no longer needed
- `buildKeyMapBeforeRenumber()` — no longer needed
- `applyKeyRemapAfterRenumber()` — no longer needed
- All calls to these functions in drag-and-drop handlers

### What Stays the Same

- `scene.sceneNumber` still exists for display ordering — just stops being used as a data key
- `selectedSceneKey` state variable name stays, value becomes `scene.id`
