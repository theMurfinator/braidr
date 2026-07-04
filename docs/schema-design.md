# Braidr — Database Schema Design

> **SUPERSEDED (2026-07-04).** This predates the June 2026 data-model redesign and does not
> reflect the current schema: it's missing the `structure_nodes`/`field_defs`/`field_values`
> substrate (now the sole read+write authority for structure and fields), describes the wrong
> branch tables (`branches`/`branch_scene_snapshots` — actual tables are `branch_snapshots`/
> `branch_positions`), and is missing 10+ tables added since. For current schema truth, read
> `docs/data-model/AS-IS.md` and `docs/data-model/TO-BE.md`, or `src/main/database.ts` /
> `src/main/migrations.ts` directly. Kept here for historical context only — do not use for
> current architecture decisions.

**Format:** SQLite, one `.braidr` file per project  
**Driver:** `better-sqlite3` (synchronous, Electron-native)  
**Status:** Draft — agreed decisions incorporated, awaiting review  
**Last updated:** 2026-05-17

---

## Decisions Incorporated

- Braidr is a full writing tool — outline and draft are one unified scene
- Full Git-style branching — explore alternate stories, merge back to main
- Analytics stored both inside the project and summarised at app level
- One shared tag pool across scenes, notes, tasks, and world events

---

## The Big Picture

Everything that currently lives across `aragorn.md`, `timeline.json`,
`notes-index.json`, and a dozen sidecar files collapses into one
`my-novel.braidr` file. The file is a SQLite database — a single binary
file the user can copy, back up, and move like any document.

---

## Tables

### `project`
Project-wide settings. Always exactly one row.

| Column | Type | Notes |
|---|---|---|
| id | text | Always `'project'` |
| name | text | The novel's title |
| word_count_goal | integer | Target word count for the whole novel |
| created_at | integer | Unix timestamp |
| updated_at | integer | Unix timestamp |

---

### `characters`
The POV characters in the novel.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| name | text | |
| color | text | Hex color for braided view |
| display_order | integer | Order in the character list |
| created_at | integer | |

---

### `plot_points`
Sections within a character's arc (Hook, Setup, Inciting Incident, etc.)

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| character_id | text | → characters.id |
| title | text | |
| description | text | Optional section description |
| expected_scene_count | integer | nullable — the (x/y) target count |
| display_order | integer | Order within the character's arc |
| created_at | integer | |

---

### `scenes`
The core of the app. Every scene belongs to a character and optionally to
a plot point section. A scene in the bullpen has `plot_point_id = null`.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| character_id | text | → characters.id |
| plot_point_id | text | → plot_points.id, nullable (null = bullpen) |
| title | text | |
| synopsis | text | Short outline description (what you see in POV view) |
| scene_number | integer | Order within the character's arc |
| timeline_position | integer | nullable — position in braided reading order |
| is_highlighted | boolean | Key/pivotal scene flag |
| word_count | integer | nullable |
| created_at | integer | |
| updated_at | integer | |

> **Note:** `content` (the old field) has been renamed to `synopsis` to
> make clear it's the outline description, not the prose.

---

### `scene_drafts`
The actual prose content for each scene. Separate from synopsis so the
outline view stays fast — we only load prose when the editor opens.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| scene_id | text | → scenes.id |
| content | text | Full prose content |
| updated_at | integer | |

> One row per scene. Created automatically when a scene is created.

---

### `scene_draft_versions`
Saved snapshots of a scene's prose — the version history.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| scene_id | text | → scenes.id |
| version | integer | Auto-incrementing version number |
| content | text | Snapshot of prose at save time |
| saved_at | integer | |

---

### `scene_scratchpads`
Per-scene scratchpad — a private notepad attached to each scene.

| Column | Type | Notes |
|---|---|---|
| scene_id | text | → scenes.id (primary key) |
| content | text | |
| updated_at | integer | |

---

### `scene_notes`
The short bullet notes on a scene (currently `scene.notes: string[]`).
Kept as separate rows so ordering is clean.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| scene_id | text | → scenes.id |
| content | text | |
| display_order | integer | |

---

### `scene_comments`
Review/editorial comments on a scene.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| scene_id | text | → scenes.id |
| text | text | |
| created_at | integer | |

---

### `scene_connections`
Links between scenes (causal relationships, callbacks, etc.)

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| source_scene_id | text | → scenes.id |
| target_scene_id | text | → scenes.id |
| label | text | nullable |

---

### `braided_chapters`
Chapter markers in the braided timeline view.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| title | text | |
| before_position | integer | Chapter appears before this timeline position |

---

### `tags`
One shared pool — used across scenes, notes, tasks, and world events.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| name | text | e.g. `cormac`, `brooklyn`, `main_arc` |
| category | text | `people`, `locations`, `arcs`, `things`, `time` |

---

### `scene_tags`
Junction table linking scenes to tags.

| Column | Type | Notes |
|---|---|---|
| scene_id | text | → scenes.id |
| tag_id | text | → tags.id |

---

### `metadata_field_defs`
Custom metadata fields the writer defines for their scenes
(e.g. "POV Depth", "Tension Level", "Location").

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| label | text | Display name |
| field_type | text | `text`, `dropdown`, `multiselect` |
| options | text | JSON array of option strings |
| option_colors | text | JSON object of option → hex color |
| display_order | integer | |

---

### `scene_metadata_values`
The actual values for custom metadata fields on each scene.

| Column | Type | Notes |
|---|---|---|
| scene_id | text | → scenes.id |
| field_def_id | text | → metadata_field_defs.id |
| value | text | JSON — string or string[] depending on field type |

---

### `scene_dates`
In-world dates for scenes (for the timeline/calendar view).

| Column | Type | Notes |
|---|---|---|
| scene_id | text | → scenes.id (primary key) |
| date | text | `YYYY-MM-DD` |
| end_date | text | nullable, for multi-day scenes |

---

### `notes`
World-building wiki notes. Supports nesting (a note can have child notes).

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| title | text | |
| content | text | HTML rich text |
| parent_id | text | → notes.id, nullable (null = root level) |
| display_order | integer | Order among siblings |
| created_at | integer | |
| updated_at | integer | |

---

### `note_tags`
Junction table linking notes to tags.

| Column | Type | Notes |
|---|---|---|
| note_id | text | → notes.id |
| tag_id | text | → tags.id |

---

### `note_links`
Wikilinks between notes (the knowledge graph).

| Column | Type | Notes |
|---|---|---|
| source_note_id | text | → notes.id |
| target_note_id | text | → notes.id |

---

### `note_scene_links`
Links from notes to scenes (referenced scenes in world-building notes).

| Column | Type | Notes |
|---|---|---|
| note_id | text | → notes.id |
| scene_id | text | → scenes.id |

---

### `world_events`
Events on the in-world timeline (battles, historical dates, etc.)

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| title | text | |
| date | text | `YYYY-MM-DD` |
| end_date | text | nullable |
| description | text | |
| created_at | integer | |
| updated_at | integer | |

---

### `world_event_tags`
Junction: world events ↔ tags.

| Column | Type | Notes |
|---|---|---|
| event_id | text | → world_events.id |
| tag_id | text | → tags.id |

---

### `world_event_scene_links`
Links from world events to scenes.

| Column | Type | Notes |
|---|---|---|
| event_id | text | → world_events.id |
| scene_id | text | → scenes.id |

---

### `world_event_note_links`
Links from world events to notes.

| Column | Type | Notes |
|---|---|---|
| event_id | text | → world_events.id |
| note_id | text | → notes.id |

---

### `tasks`
Writing tasks (revise chapter 3, research police procedure, etc.)

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| title | text | |
| description | text | nullable |
| status | text | `open`, `in-progress`, `done` |
| priority | text | `none`, `low`, `medium`, `high`, `urgent` |
| scene_id | text | → scenes.id, nullable |
| time_estimate | integer | Minutes, nullable |
| due_date | integer | Unix timestamp, nullable |
| display_order | integer | |
| created_at | integer | |
| updated_at | integer | |

---

### `task_tags`
Junction: tasks ↔ tags.

| Column | Type | Notes |
|---|---|---|
| task_id | text | → tasks.id |
| tag_id | text | → tags.id |

---

### `task_character_links`
Tasks linked to specific characters.

| Column | Type | Notes |
|---|---|---|
| task_id | text | → tasks.id |
| character_id | text | → characters.id |

---

### `time_entries`
Time tracking sessions on tasks.

| Column | Type | UUID |
|---|---|---|
| id | text | UUID |
| task_id | text | → tasks.id |
| started_at | integer | Unix timestamp |
| duration | integer | Seconds |
| description | text | nullable |

---

### `task_field_defs`
Custom fields that can be added to tasks.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| name | text | |
| field_type | text | `text`, `number`, `checkbox`, `dropdown`, `date` |
| options | text | JSON array |
| display_order | integer | |

---

### `task_custom_field_values`
Values for custom task fields.

| Column | Type | Notes |
|---|---|---|
| task_id | text | → tasks.id |
| field_def_id | text | → task_field_defs.id |
| value | text | JSON |

---

### `writing_sessions`
Time spent writing, attached to a scene. This is the full record inside
the project. A summary is also written to the app-level analytics store.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| scene_id | text | → scenes.id, nullable (session before scene assigned) |
| character_id | text | → characters.id |
| date | text | `YYYY-MM-DD` |
| duration | integer | Seconds |
| word_count_delta | integer | Words added/removed during session |
| created_at | integer | |

---

### `archived_scenes`
Soft-deleted scenes. Kept so writers can recover them.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| character_id | text | |
| original_plot_point_id | text | nullable |
| original_scene_number | integer | |
| title | text | |
| synopsis | text | |
| draft_content | text | nullable |
| tags | text | JSON array of tag names (snapshot) |
| notes | text | JSON array |
| is_highlighted | boolean | |
| word_count | integer | nullable |
| archived_at | integer | |

---

### `archived_notes`
Soft-deleted notes.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| title | text | |
| content | text | HTML |
| parent_id | text | nullable |
| tags | text | JSON array of tag names (snapshot) |
| archived_at | integer | |

---

## Branches

Branches are the most complex part of the schema. The model:

- `main` is always the primary branch
- Creating a branch snapshots the current state of every scene
- Switching branches restores that snapshot
- Merging brings selected changes from one branch back into another

### `branches`
| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| name | text | e.g. `main`, `cut-chapter-3`, `alternate-ending` |
| description | text | nullable |
| created_from | text | → branches.id (parent branch) |
| created_at | integer | |

---

### `branch_scene_snapshots`
A full snapshot of every scene's state at the time the branch was created.
When you switch to a branch, the app loads from this snapshot.

| Column | Type | Notes |
|---|---|---|
| id | text | UUID |
| branch_id | text | → branches.id |
| scene_id | text | Original scene UUID |
| character_id | text | |
| plot_point_id | text | nullable |
| title | text | |
| synopsis | text | |
| draft_content | text | nullable |
| scene_number | integer | |
| timeline_position | integer | nullable |
| is_highlighted | boolean | |

> **How this works in practice:**
> - You're on `main` writing your novel normally
> - You create branch `alternate-ending` — the app snapshots all scenes
> - You work on `alternate-ending`, making big changes
> - Switch back to `main` — your original work is untouched
> - Compare branches side by side to see what changed
> - Merge specific scenes from `alternate-ending` back to `main`

---

## Settings

### `settings`
Key-value store for project-level preferences. Avoids adding columns to
`project` every time a new preference is added.

| Column | Type | Notes |
|---|---|---|
| key | text | e.g. `font_settings`, `inline_metadata_fields` |
| value | text | JSON |

---

## What Lives Outside the Project File

These stay at the **app level** (not in the `.braidr` project file):

| Data | Where | Why |
|---|---|---|
| Recent projects list | `electron-store` | App needs it before a project opens |
| App-level writing summary | `electron-store` | Cross-project weekly hours tracker |
| License / subscription | `electron-store` | Not project-specific |
| Window size / position | `electron-store` | App preference, not project data |
| Font/UI preferences | `electron-store` | Could be per-project too — TBD |

---

## Migration Plan (existing projects)

On first open of a folder-based project:

1. Parse all `character.md` files → populate `characters`, `plot_points`, `scenes`
2. Parse `timeline.json` → populate timeline positions, connections, chapters, metadata, tasks, archived scenes, analytics
3. Parse `notes/notes-index.json` + `.html` files → populate `notes`, `note_tags`, `note_links`
4. Create default `main` branch with initial snapshot
5. Save as `project-name.braidr` in same folder
6. Offer to keep or remove the original files

---

## Table Count Summary

| Area | Tables |
|---|---|
| Core story | characters, plot_points, scenes, braided_chapters |
| Scene content | scene_drafts, scene_draft_versions, scene_scratchpads, scene_notes, scene_comments |
| Scene relationships | scene_connections, scene_tags, scene_metadata_values, scene_dates, scene_character_links |
| Notes | notes, note_tags, note_links, note_scene_links |
| World events | world_events, world_event_tags, world_event_scene_links, world_event_note_links |
| Tags | tags |
| Tasks | tasks, task_tags, task_character_links, time_entries, task_field_defs, task_custom_field_values |
| Analytics | writing_sessions |
| Branches | branches, branch_scene_snapshots |
| Archive | archived_scenes, archived_notes |
| Settings | project, settings |
| **Total** | **~32 tables** |
