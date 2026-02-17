# Braidr — Product Features & Values

## For Design Agency Reference

---

## What Is Braidr?

Braidr is a desktop writing application built specifically for novelists who write with multiple point-of-view (POV) characters. It replaces the fragmented workflow where writers juggle 5+ separate tools — an outliner, a spreadsheet for timelines, a word processor for drafting, a note-taking app, and a progress tracker — with a single, integrated workspace.

The core concept: writers plan each character's story arc independently, then "braid" those arcs together into reading order, write their prose, connect ideas, and track progress — all without leaving the app.

**Platform:** Native desktop app (Electron) for macOS and Windows
**Pricing:** $39/year, 14-day free trial, all features included, no tiers or upsells
**Data philosophy:** All writing is stored as local markdown files the writer owns. No cloud dependency. Works offline. Files are human-readable, git-compatible, and editable in any text editor.

---

## Target Audience

Multi-POV novelists working in:

- **Fantasy** — 3-7 POV characters with epic scope
- **Science Fiction** — Complex timelines and parallel storylines
- **Romance** — Dual or multi-POV love stories
- **Literary Fiction** — Braided narratives and mosaic structures
- **Thriller** — Alternating protagonist and antagonist perspectives
- **Historical Fiction** — Interwoven timelines across eras

The typical user is a serious fiction writer who understands the complexity of managing multiple narrative threads and is frustrated by having to stitch together a workflow from disconnected tools.

---

## The Five Core Views

Braidr is organized around five integrated views that stay in sync. A change in one view is immediately reflected in all others. This is the structural backbone of the product.

### 1. POV Outline View — "Plan"

Each character's story, told in their narrative order.

- **One character at a time.** The writer focuses on a single character's arc, organized by structural plot point sections (e.g., "Hook," "Setup," "Climax," "Resolution").
- **Rich scene cards** containing: title, description, tags, custom metadata fields, scene notes with rich formatting, scene status (Outline / Draft / Revised / Final), and word count.
- **Drag-and-drop reordering** within a character's arc.
- **Plot point sections** with expected scene counts, section descriptions for story beat summaries, and collapsible table-of-contents navigation.
- **Scene numbering** that persists per character — "Sally Scene 3" stays Scene 3 regardless of where it appears in reading order.
- **Story structure templates** to start from: Blank, Three-Act Structure, Save the Cat (15 beats), Hero's Journey (12 stages).

### 2. Braided Timeline View — "Braid"

All scenes from all characters woven into reading order — what the reader will actually experience. This view has three sub-views:

**List View:**
- Drag-and-drop sequential timeline for arranging scenes across all POVs.
- "To Braid" inbox for scenes not yet placed in reading order.
- Chapter markers that can be inserted anywhere to divide the narrative.

**Table View:**
- Spreadsheet-style grid with sortable and filterable columns.
- Inline editing directly in cells.
- Custom column visibility and saved view configurations (filters, sorts, visible columns).

**Rails View:**
- Visual character lanes with scenes positioned along parallel horizontal tracks.
- Connection lines showing relationships between scenes across POVs.
- Interactive, zoomable visualization.

**Shared across all sub-views:** scenes display as "Character Name - Scene X," filtering by character/tag/status/metadata, and automatic position management when scenes are reordered.

### 3. Editor View — "Write"

A full-page rich text writing environment with context always visible.

- **Three-panel layout:** Scene navigator (left), writing canvas (center), metadata panel (right).
- **Rich text formatting:** Bold, italic, headings, lists, task lists, code blocks, blockquotes, tables, images, multi-column layouts, slash commands, and drag handles for blocks.
- **Writing Timer:** A global timer that persists across all views, auto-detects inactivity and pauses, and prompts for a post-session check-in (energy, focus, mood ratings).
- **Draft Versioning:** Save named snapshots of any scene, browse version history with timestamps, restore previous versions.
- **Auto-save:** Continuous background saving — no manual save button, no lost work.
- **Word count and reading time** displayed per scene.
- **Scene-linked to-do lists** created in scene notes.
- **Manual time entry** for logging offline writing sessions.

### 4. Notes & Knowledge Graph View

An integrated, wikilinked notebook with a visual relationship graph.

- **Hierarchical notebook** with nested organization.
- **Wikilinks:** Create bidirectional links between notes and scenes using `[[bracket]]` syntax.
- **Backlinks panel:** Shows all inbound references to the current note.
- **Interactive force-directed graph:** A visual, explorable map of relationships between notes and scenes. Filterable by node type (note vs. scene), link type, and character.
- **Rich text editor in notes** with slash commands, drag handles, table support, and image uploads.

### 5. Analytics & Goals Dashboard

Writing progress tracking and goal management.

- **Calendar heatmap** showing daily writing activity at a glance.
- **Writing streaks** with configurable daily word count goals.
- **Per-character word counts** showing balance across POVs.
- **Per-plot-point word count breakdowns** to visualize pacing distribution.
- **Deadline goals:** Set targets like "80,000 words by March 15."
- **Milestones:** 10k, 25k, 50k, 80k, 100k word markers.
- **Session history:** Browse past writing sessions with check-in data (energy, focus, mood).
- **Global word count goal** for the entire project.

---

## Key Feature Details

### Smart Tag System

Five enforced tag categories that help writers organize and filter their scenes:

1. **People** — Characters (#noah, #grace, #cormac)
2. **Locations** — Places (#brooklyn, #mexico, #cathedral)
3. **Arcs** — Plot threads (#main_arc, #romance, #spiritual_crisis)
4. **Things** — Objects, MacGuffins (#rosary, #pistol)
5. **Time** — Temporal markers (#1453, #present_day, #childhood)

Tags can be created upfront in a tag manager or inline while writing. Autocomplete suggestions appear when typing. Any view can be filtered by one or more tags.

### Custom Metadata

Writers define their own metadata fields at the project level:

- **Three field types:** Text input, dropdown (single-select), and multi-select.
- **Color coding** for dropdown and multi-select options.
- Metadata appears on scene cards and as columns in the table view.
- Enables writers to track custom dimensions like "subplot," "emotional tone," "setting type," etc.

### Scene Connections

- Bidirectional linking between any two scenes, across any characters.
- Visual connection lines appear in the braided timeline and rails views.
- Enables tracking cause-and-effect, foreshadowing, and thematic echoes across POVs.

### Global Search (Cmd+K / Ctrl+K)

- Search across scenes, drafts, notes, characters, and tags.
- Results grouped by type with context snippets.
- Keyboard-navigable.

### Compile & Export

- Export to **Markdown**, **DOCX**, or **PDF**.
- Include or exclude specific chapters.
- Filter export by character or scene status.
- Options to include/exclude character names and scene break markers.
- Preview before exporting.

### Character Management

- Add, rename, and delete characters.
- Each character has a customizable color used across all views for instant visual identification.
- Per-character scene count and word count tracking.

### Archive & Restore

- Soft-delete scenes to an archive (not permanently removed).
- Browse, restore, or permanently delete archived scenes.
- Nothing is lost by accident.

### Font Customization

- Per-view font settings with 14+ font family options.
- Adjustable font sizes for section titles, scene titles, and body text.
- Bold toggles and custom colors per element type.

### Project Backup

- One-click backup creates a `.zip` of the entire project (all markdown files, timeline data, notes, analytics, metadata).

### Auto-Save & Undo/Redo

- Continuous auto-save in the background.
- 50-level undo/redo history that persists across the session.
- Keyboard shortcuts: Cmd+Z / Ctrl+Z (undo), Cmd+Shift+Z / Ctrl+Shift+Z (redo).

---

## The Problem Braidr Solves

| Without Braidr | With Braidr |
|---|---|
| Outline in Scrivener, track timeline in a spreadsheet, draft in Google Docs, take notes in a separate app, track progress manually | Plan, organize, draft, connect, and track in one app |
| Choose between viewing character arcs OR reading order — not both | Instantly switch between character-arc view and reading-order view |
| Notes, tags, metadata, and drafts scattered across 3-5 apps | Everything in one workspace, all synced |
| No visual way to see multi-POV pacing or connections | Rails view and knowledge graph show the big picture |
| No analytics — no way to know if POV balance is off | Per-character word counts, writing streaks, milestones |
| Manually copy-paste scenes together for a final manuscript | One-click compile to Markdown, DOCX, or PDF |

---

## Competitive Positioning

### vs. Scrivener
- Braidr is purpose-built for multi-POV, not general-purpose.
- Five synced views (Scrivener has one organizational model).
- Knowledge graph with wikilinks (Scrivener has none).
- Writing analytics and goal tracking built in.

### vs. Word / Google Docs
- Scene management and metadata built into the tool.
- Visual timeline across all POVs.
- Draft versioning per scene, not per file.
- Compile to manuscript without copy-pasting.

### vs. Plottr / Notion
- Local files, not proprietary databases — you own your data.
- Integrated drafting — write prose here, not just plan.
- Offline-first native app (fast, no internet required).
- $39/year flat — no per-feature upsells or escalating tiers.

---

## Data & File Format

All project data is stored locally as plain files:

- **Character outlines:** `.md` (Markdown) files with YAML frontmatter
- **Timeline data:** `timeline.json`
- **Analytics:** `analytics.json`
- **Notes:** Individual `.html` files with a `notes-index.json` manifest
- **Everything is human-readable, git-compatible, and portable.**

Writers can open their project folder in any text editor, version-control it with git, or back it up however they choose. There is no lock-in.

---

## Core Values & Principles

1. **Writer-first design.** Built by a writer, for writers. Non-technical users should never feel lost.
2. **Data ownership.** Local files in open formats. No cloud lock-in. Your words are yours.
3. **Offline-first.** No internet required. The app loads instantly and never depends on a service staying online.
4. **One integrated workspace.** Plan, braid, write, connect, and track — without switching apps.
5. **Simple pricing.** $39/year. All features. No tiers, no upsells, no feature gates.
6. **The braiding metaphor.** Multi-POV fiction is made of interwoven threads. Braidr is the first tool that treats the braid itself as a first-class concept.

---

## Pricing & Distribution

- **$39/year** — single tier, all features included
- **14-day free trial** — no payment required upfront, full access to everything
- **Cancel anytime**
- **Platforms:** macOS (.dmg) and Windows (.exe), with Linux (AppImage) also available
- **Auto-updater** built in — updates install seamlessly
- **License management** via LemonSqueezy

---

## Tone & Voice Guidelines

- **Literary and craft-aware.** Braidr speaks the language of narrative technique, story structure, and character arcs — not generic productivity-tool jargon.
- **Direct and problem-solution oriented.** Clearly identifies pain points and shows how Braidr solves them.
- **Respectful of the craft.** Positioned as a tool that serves the writer's process, not one that tries to replace creative judgment.
- **Metaphorical.** The "braiding" concept is central — narrative threads being woven together.
- **Confident but not aggressive.** Braidr knows what it does well and for whom, without denigrating other tools.

---

## Key Taglines & Messaging

- "Plan. Braid. Write. All in one app."
- "Stop juggling 5 apps to write one novel."
- "Finally, a tool built for multi-POV novelists."
- "Stories weave together. Now your tools can too."
- "Outline by character. Braid into reading order. Write your draft."
- "Your data. Your files. Your story."
