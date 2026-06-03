# Braidr — Feature Overview

Braidr is an Electron desktop app for outlining multi-POV novels. Each project is a single `.braidr` SQLite file. All data is local; no cloud sync.

---

## Views

### POV Outline View
The character arc view. One character at a time, scenes in their narrative order (not reading order).

- Scene list organized into **plot point sections** (user-defined story beats)
- Drag-and-drop reorder scenes within the POV
- Inline scene title editing
- **Chapter grouping** — scenes organized under named chapters, drag-drop to assign
- **POV reorder indicator** — scenes highlighted red when their POV position conflicts with the braided timeline order
- Filter bar to narrow scenes by tag
- **Sections toggle** — toolbar button hides section headers entirely
- **Scenes toggle** — toolbar button hides all scene cards, leaving only section headers and synopses visible (focus mode for synopsis writing)

### Braided Timeline — List View
All characters' scenes combined into reading/chronological order. The "meta" view of the whole novel.

- Scenes sorted by timeline position, interleaved across characters
- Color-coded by character
- Drag-and-drop to reorder the timeline
- **Inbox** — unbraided scenes per character, drag to place them in the timeline
- **Chapter grouping** — scenes organized under chapter headers; create, rename, delete, and drag-drop chapters
- Scene card shows title, word count, tags, and character

### Braided Timeline — Rails View
A grid layout showing all characters in parallel columns, timeline rows going downward. Visualizes simultaneous action across characters.

- One column per character, one row per timeline position
- **Gap word count** — shows words written between two scenes of the same character when other characters have scenes in between
- **Connector lines** — optional SVG arcs showing scene connections across characters
- **POV color mode** — tints each scene cell by character color
- **Chapter envelopes** — chapters rendered as bordered boxes wrapping their scenes
- Inline drag-and-drop reorder (within rails)
- **Floating editor** — click a scene to open a draft editor in-place
- Insert scene at any timeline position from the row number

### Braided Timeline — Table View
Spreadsheet-style view of all scenes.

- Columns: position, character, title, word count, plot point, tags, custom metadata fields
- Sortable, editable inline
- Chapter grouping as section headers

### Editor View
Full-screen writing environment.

- TipTap rich text editor per scene (drafts stored separately from outline)
- **Scratchpad** — freeform notes per scene, separate from the draft
- **Draft versioning** — manual snapshots of draft content with restore
- **Comments** — inline threaded comments per scene
- **Word count** with session goal progress bar
- **Session timer** — tracks time spent writing in the editor
- **Writing check-in** — prompts for energy/focus/mood rating at session start; custom check-in fields supported
- Auto-save with 800ms debounce
- Per-screen typography settings (font family, size, color)
- "Open in Editor" quick-launch from any scene in other views

### Notes View
A separate knowledge base alongside the outline.

- Rich text notes with TipTap editor
- **Tables**, **multi-column layouts**, **image embedding** (drag/paste)
- **Wikilinks** (`[[note title]]`) for linking between notes
- **Backlinks panel** — shows which notes link to the current note
- **Slash commands** for quick insertion of blocks
- **Tags** — notes can have multiple tags; tag bar in editor
- **Graph view** — d3-force canvas showing notes and scenes as nodes, links as edges, with filter panel
- Sidebar with search and tag filtering

### Tasks View
A lightweight task tracker built into the project.

- Table-style task list with custom fields
- Task timer — track time per task
- Task field manager — define custom column types (text, select, date, etc.)
- Filter bar

### Timeline View
A visual timeline canvas.

- TimelineGrid showing scenes positioned on a horizontal axis
- Sidebar with character/filter controls
- Context bar for selected scenes

### Analytics View
Writing session data and productivity trends.

- Session history from check-ins (energy, focus, mood over time)
- **Weekly Words** — full-width bar chart of daily word counts (Sat–Fri week), configured with manuscript target length + deadline date; auto-calculates required words/day and words/week, shows pace vs. on-track status
- **Weekly Hours** — full-width bar chart of daily writing time with configurable weekly target
- **12-week trend** — rolling chart of output by week
- Manuscript progress bar (total words vs. target)
- Calendar heatmap, words over time, words by character

### Account View
License and subscription management.

- License activation / deactivation
- Trial management
- Subscription details, cancel/reactivate
- Links to billing portal

---

## Cross-View Features

### Characters
- Create, edit, delete characters
- Per-character color (used for scene cards, rails columns, POV indicator)
- Character manager modal

### Tags
- Tag categories: People, Locations, Arcs, Things, Time
- Inline tag creation from scene editor
- Tag manager (rename, recategorize, delete)
- Filter bar in POV and Braided views filters scenes by tag

### Scene Connections
- Causal links between any two scenes
- Rendered as SVG arcs in Rails view
- Toggle visibility

### Chapters
- Project-wide chapters (not per-character)
- Named, ordered, drag-drop reorderable
- Scenes explicitly assigned to chapters (persisted in SQLite)
- Shown in List, Rails, POV, and Table views
- Create from toolbar; delete from chapter header

### Custom Scene Metadata
- User-defined metadata fields (text, select, etc.) per scene
- Shown in Table view columns and scene detail panel

### Draft Branches
- Create named branches to explore alternate plot/character directions
- Switch between branches
- **Compare view** — diff two branches scene-by-scene
- **Merge dialog** — selectively merge changed scenes back
- **Lock** — device-level lock to prevent concurrent edits across machines
- **Storage** — branches live *inside* the single `.braidr` file (each branch is a serialized snapshot in the database), so they sync across machines whenever the file does. Branched content is the story (scenes, drafts, characters, plot points, arcs, timeline); tasks, notes, and writing-session/analytics data are shared across all branches. Legacy filesystem branches (an old `branches/` folder) are migrated into the file automatically on first open, with the old folder preserved as a dated `branches.migrated-<timestamp>/` backup.

### Search
- Full-text search overlay across scene titles and content (Cmd+K)
- Also searches notes

### Compile / Export
- Export entire manuscript to **Markdown**, **HTML**, **DOCX** (via `docx` library), or **PDF**
- Filter by character, chapter, or scene selection before exporting
- Respects chapter order and POV order

### Split Panes / Tabs
- Multi-tab workspace — open multiple views simultaneously
- Split panes (horizontal/vertical) within the workspace
- Tab bar per pane; layout persisted in localStorage

### Typography Settings
- Per-screen font overrides (section title, scene title, body)
- Font picker with ~15 Google Fonts options
- Size and color controls per element
- Settings applied live to CSS variables on `:root`

### Project Format
- Single `.braidr` SQLite file per project
- Legacy folder format (`.md` + `timeline.json`) converted via importer
- Auto-backup on open

### Licensing
- Paid product with trial period
- License activation/deactivation via IPC to main process
- `LicenseGate` component gates access to views

### Onboarding
- `TourOverlay` first-run walkthrough (persisted via `localStorage`)
- `FeedbackModal` for in-app feedback (opens email)
- `UpdateBanner` / `UpdateModal` for app version updates

---

## Data Model (Key Entities)

| Entity | Notes |
|---|---|
| **Scene** | Core unit. Has title, content, timeline position, character, plot point, chapter, word count, tags |
| **Character** | Has name, color, description |
| **Plot Point** | Section header within a character's POV. Has title, order, description |
| **Chapter** | Project-wide grouping. Has title, order, description |
| **Tag** | Has name, category (People / Locations / Arcs / Things / Time) |
| **Note** | Rich-text document with wikilinks, tags, backlinks |
| **Draft** | TipTap HTML content per scene, stored separately from outline |
| **Draft Version** | Manual snapshot of a draft |
| **Scene Comment** | Threaded comment on a scene |
| **Branch** | Named snapshot of the timeline for parallel drafting |
| **Analytics** | Session check-ins (energy, focus, mood, time, word count) |
| **Metadata Field** | User-defined custom field definition |
| **Scene Metadata** | Custom field values per scene |
