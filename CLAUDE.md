# Novel Outlining Tool

## Product Vision
A tool for managing multiple POV character outlines with independent timeline views. Writers can see scenes in character arc order (POV view) OR in reading/chronological order (braided timeline view). Full replacement for Obsidian-based outlining workflow.

## Key Decisions

### Architecture: Electron App (with web app migration path)
- **Current:** Electron app reading local markdown files
- **Future potential:** SaaS web app with cloud storage
- **Why Electron first:** User (Brian) cares about local .md files more than average writer; wants to own data, use git, edit in other tools
- **Migration strategy:** Abstract file operations behind a "data service" layer so React components call `dataService.getScenes()` not filesystem directly. When converting to web, swap out the data service implementation.

### What transfers to web app:
- All React components and UI
- Markdown parsing logic
- Scene/timeline data structures
- Drag-and-drop behavior

### What would need rewriting for web:
- File reading/writing → API calls to backend
- Local storage → Database
- Add authentication system

## File Format

Based on existing Obsidian workflow. Each POV character has one markdown file:

```markdown
---
character: Noah
---

## Prologue (1)
1. Prologue scene description here with #location and #character tags

## Hook (1)
2. ==**Noah intro - Chasing Miguel**== Noah chases #miguel through #mexico. This establishes his #main_arc.

## Setup (6)
Description of what happens in this plot point section...

3. Meeting Cormac - Noah meets #cormac at #thane_hq
4. Noah reflecting
5. Noah in Brooklyn
```

### Format Details:
- **Frontmatter:** YAML with `character: Name`
- **Plot point headers:** `## Header Name (scene_count)` - groups scenes, shown only in POV view
- **Plot point descriptions:** Prose after header, before first scene
- **Numbered scenes:** `1. Scene description with #tags`
- **Highlighted scenes:** `==**Bold highlighted**==` for key scenes
- **Sub-notes:** Indented bullets under scenes for notes/details
- **Tags:** Inline `#tag_name` for people, locations, arcs, things

## Two-Notebook Model

### Character Arc Notebook (POV View)
- One character's story in their narrative order
- Scene numbers are fixed here (Scene 1 is always Scene 1)
- Plot point headers visible (`## Hook`, `## Setup`, etc.)
- Can edit everything: scenes, headers, notes

### Braided Notebook (Meta View)
- All scenes from all POV files combined
- Flat list sorted by `timeline_position`
- Displays as "Character Name - Scene X"
- No plot point headers (those are POV-specific)
- Drag-and-drop reorders scenes
- Moving scenes shifts all positions to maintain clean integers

### Key Principle:
"Sally Scene 1" can move anywhere in the braided view but remains "Sally Scene 1" — the scene number only changes if moved within her individual POV outline.

## Tag System

### Tag Categories:
- **People** - characters (#noah, #grace, #cormac)
- **Locations** - places (#brooklyn, #mexico, #cathedral)
- **Arcs** - plot threads (#main_arc, #romance, #spiritual_crisis)
- **Things** - objects, MacGuffins (#rosary, #pistol)
- **Time** - temporal markers (#1453, #present_day, #childhood)

### Tag Management:
- Tags stored in database for consistency/autocomplete
- Two ways to create tags:
  1. Explicit "Add Tag" UI - pre-create in tag manager
  2. Inline creation - type new `#tag`, app prompts for category

### Filtering:
- Filter by tags in both POV and braided views
- Example: Show only scenes with #grace across entire braided view

## Features

### MVP (V1):
1. Read/write .md files from user-selected folder
2. POV outline view with full editing
3. Braided timeline view
4. Drag-and-drop reordering (shifts all positions)
5. Tag database with autocomplete
6. Filtering by tags in both views
7. "Add New Character" button creates new POV file

### Future Ideas (V2+):
- Toggle to show plot point headers in braided view scene names
- Causal linking between scenes ("Sally Scene 1" impacts "Johnny Scene 13")
- Timeline visualization
- Web app version with cloud storage

## Build Order
1. Set up Electron + React project with data service abstraction
2. Markdown parsing (scenes, headers, tags, metadata)
3. POV outline view with editing
4. Braided view with timeline ordering
5. Drag-and-drop reordering
6. Tag database and management
7. Filtering

## Release Process
- Releases are **fully automated via GitHub Actions** (`.github/workflows/release.yml`)
- **Auto-release on merge to main**: When a PR is merged (or code is pushed) to `main`, the workflow automatically bumps the patch version, creates a tag, and builds/publishes a release
- Manual tag push (`v*` tags) also triggers a build (backward compatible)
- The workflow builds for macOS, Windows, and Linux, codesigns, notarizes (via `scripts/notarize.js`), and publishes to GitHub Releases
- **Do NOT run `npm run package` locally** — it will prompt for codesign credentials that are only in GitHub Secrets
- **To release: just merge a PR to `main`** — version bump, tagging, building, and publishing all happen automatically
- To skip a release on a main push, include `chore: bump version` in the commit message
- Secrets (CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_ID_PASSWORD, APPLE_APP_SPECIFIC_PASSWORD) are configured in the GitHub repo settings
- Team ID: CBMC9F64HB (hardcoded in `scripts/notarize.js` and workflow)
- **Always read the release workflow and notarize script before giving release instructions**

## Technical Notes
- Use data service abstraction from day 1 for web migration path
- Store tags in local SQLite or JSON database
- Timeline position stored per-scene (need to decide: in-file metadata or separate index?)

## Commercial Notes
- Potential product to sell later
- Target market: writers working with multiple POV characters
- Design for non-technical users if going commercial
- Electron allows distribution via website or app stores
