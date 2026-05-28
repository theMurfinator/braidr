# Compare View Redesign — Annotated Branch Sequence

**Goal:** Replace the side-by-side column diff with a single-column narrative sequence showing the branch's story structure, annotated with what changed vs. main, so the writer can review and decide what to merge.

---

## Mental Model

The writer reads ONE story — the branch version — with editorial markup showing what's different. Unchanged scenes provide narrative context but stay quiet. Changed scenes stand out with color and a specific annotation explaining the delta.

---

## Layout

### Header
- Left/Right branch selectors (same as current)
- Summary chips: **2 Benched · 1 Moved · 1 Renamed** (each chip clickable to jump to next of that type; active chip filters to show only that type)
- "Show all / Changes only" toggle

### Main Body — Single scrollable column
Scenes in RIGHT branch's narrative order (#1, #2, #3…):

**Unchanged scenes** — compact row, 40% opacity. Character name · position · title · word count. No chrome.

**Changed scenes** — full-height card, color-coded left border, full opacity:
- Left border color by change type:
  - **Moved** (yellow/amber): different position from main
  - **Renamed** (blue): same position, different title
  - **Benched** (red): has been removed from narrative in this branch — appears in Benched section below, not inline
  - **Added** (green): new scene, not in main
  - **Rewritten** (purple): draft content changed
- Delta annotation in muted text: `↑ Was #7 in main` / `Was "The Confrontation"` / `New scene`
- Accept checkbox (checked by default for mergeable changes)

### Benched Section (below narrative)
A collapsible section: **"Removed from narrative on this branch (N scenes)"**
Each benched scene shown as a card with `Was #N in main` and its accept checkbox.

### Footer
- **"Merge N changes → main"** button (disabled if right is not main, or 0 accepted)

---

## Interactions

| Action | Result |
|--------|--------|
| Click scene card | Opens draft preview panel below |
| Click summary chip | Jumps to next scene of that type; shows only that type |
| Toggle accept checkbox | Includes/excludes from merge |
| Click "Merge N changes" | Same as existing mergeBranch flow |

---

## Change Labels & Colors

| changeType | Condition | Label | Border |
|-----------|-----------|-------|--------|
| modified | rightPosition = null | Benched | Red |
| modified | leftPosition ≠ rightPosition | Moved | Amber |
| modified | title changed only | Renamed | Blue |
| modified | draft changed only | Rewritten | Purple |
| added | — | New Scene | Green |
| removed | — | Deleted | Red/dim |

---

## Files Changed
- `src/renderer/components/branches/CompareView.tsx` — full rewrite
- `src/renderer/styles.css` — updated compare section styles
