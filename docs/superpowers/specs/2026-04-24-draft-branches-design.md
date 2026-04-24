# Draft Branches

Create named branches of scene outlines and braided timeline positions to test alternative story arcs without modifying main. Compare branches side-by-side and selectively merge scenes back.

## Data Model

### Storage

- `branches/index.json` — branch metadata (name, created date, description)
- `branches/[branch-name]/` — per-branch folder containing:
  - Copies of all character `.md` outline files
  - `positions.json` — scene position data (subset of timeline.json)
- Main remains in project root as-is (`.md` files + `timeline.json`)
- Prose content (`draftContent`) is shared across all branches — not copied

### Branch Index Schema

```typescript
interface BranchIndex {
  branches: BranchInfo[];
  activeBranch: string | null; // null = main
}

interface BranchInfo {
  name: string;
  description?: string;
  createdAt: string; // ISO date
  createdFrom: string; // "main" or another branch name
}
```

## Core Operations

### Create Branch

- User provides a name and optional description
- Copies all `.md` files from project root into `branches/[name]/`
- Extracts `positions` from `timeline.json` into `branches/[name]/positions.json`
- Adds entry to `branches/index.json`
- Stays on the new branch after creation

### Switch Branch

- Updates `activeBranch` in `branches/index.json`
- POV and braided views read from the active branch folder (or root if main)
- All other data (prose, notes, tasks, tags, metadata) reads from `timeline.json` as normal
- Switching does not modify any files — it changes which outline/position data the views display

### Edit on Branch

- When a branch is active, outline edits write to `branches/[name]/*.md`
- Position changes write to `branches/[name]/positions.json`
- Prose edits always write to `timeline.json` (shared)

### Delete Branch

- Removes `branches/[name]/` folder
- Removes entry from `branches/index.json`
- If deleted branch was active, switches back to main

## Selective Merge

- Opens a merge UI showing all scenes grouped by character
- Each scene shows whether it changed relative to main (diff indicator)
- User checks which scenes to bring over
- For checked scenes: copies their outline content into main's `.md` files and updates positions in `timeline.json`
- Branch is preserved after merge (not auto-deleted)

## Compare View

- New side-by-side mode accessible from toolbar
- Pick two branches (or branch vs. main) to compare
- Two display modes:
  - **POV compare** — left/right POV views showing outlines for each branch
  - **Braided compare** — left/right braided timelines showing position differences
- Changed scenes highlighted visually

## UI Entry Points

- **Branch selector** — dropdown in toolbar showing current branch ("main" default)
- **New Branch button** — opens name/description dialog
- **Compare button** — opens branch comparison view
- **Merge** — accessible from branch dropdown or compare view
- Active branch name displayed prominently so user always knows context

## IPC Channels

- `branches:list` — returns branch index
- `branches:create` — creates new branch
- `branches:switch` — switches active branch
- `branches:delete` — deletes a branch
- `branches:merge` — selective merge into main
- `branches:compare` — returns diff data for two branches

## Out of Scope

- Branching prose content (stays shared)
- Branching notes, tasks, or tags
- Conflict resolution (merge overwrites selected scenes in main)
- Branch-to-branch merge (only merge into main)
