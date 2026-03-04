# Braidr MCP Server — Design

## Overview

A read-only MCP (Model Context Protocol) server that exposes Braidr novel project data to Claude Desktop. Users can ask Claude about their scenes, characters, braid, prose, notes, and timeline metadata through natural conversation.

## Architecture

- **Type:** stdio-based MCP server (Claude Desktop launches it as a subprocess)
- **Location:** `braidr/mcp-server/` (inside the Braidr repo, its own Node project)
- **Language:** TypeScript, compiled to JS
- **Dependencies:** `@modelcontextprotocol/sdk`, `typescript`
- **Data access:** Reads files directly from disk on every tool call (no caching)
- **Project path:** Passed as a CLI argument

### Claude Desktop configuration

```json
{
  "mcpServers": {
    "braidr": {
      "command": "node",
      "args": ["/Users/brian/braidr/mcp-server/dist/index.js", "/path/to/novel"]
    }
  }
}
```

## Data sources

All data is read from the project directory:

| File | Contents |
|------|----------|
| `*.md` | Character outlines (frontmatter + scenes + plot points) |
| `timeline.json` | Positions, connections, chapters, word counts, metadata, draft prose (`draftContent`) |
| `notes/notes-index.json` | Note metadata, tags, links |
| `notes/*.html` | Note content (HTML from TipTap editor) |

Since Braidr auto-saves with ~800ms debounce, files on disk are always current within ~1 second of the latest edit. Each MCP tool call reads fresh from disk.

## Tools

### Project overview

| Tool | Input | Output |
|------|-------|--------|
| `get_project_summary` | none | Character count, scene count, total word count, chapter list, braided vs unbraided scene counts |

### Characters

| Tool | Input | Output |
|------|-------|--------|
| `list_characters` | none | All characters with ID, name, color, scene count |
| `read_character_outline` | `character` (name or ID) | Full markdown outline for one character — plot points, scenes, notes |

### Scenes

| Tool | Input | Output |
|------|-------|--------|
| `read_scene` | `sceneId` or `character` + `sceneNumber` | Scene title, tags, notes, metadata, timeline position, connections |
| `read_scene_prose` | `sceneId` | Draft prose content for a scene |
| `search_scenes` | `query` (text), optional `character`, `tag` | Matching scenes with context |

### Braid (timeline)

| Tool | Input | Output |
|------|-------|--------|
| `read_braid` | optional `fromPosition`, `toPosition` | All scenes in braided order with chapter breaks, character names, colors |
| `read_timeline_metadata` | `sceneId` | Connections, word count, dates, custom metadata fields, comments |

### Notes

| Tool | Input | Output |
|------|-------|--------|
| `list_notes` | optional `tag`, `parentId` | All notes with title, tags, links, hierarchy |
| `read_note` | `noteId` or `title` | Note HTML content (converted to readable text) |
| `search_notes` | `query` (text), optional `tag` | Matching notes with context |

## Parsing

The MCP server needs to parse Braidr's markdown format for character outlines. This involves:

1. **Frontmatter:** Extract `character: Name` from YAML block
2. **Plot points:** `## Title (N)` headers
3. **Scenes:** Numbered lines like `1. Scene text #tags <!-- sid:abc123 -->`
4. **Tags:** `#tag_name` tokens in scene text
5. **Sub-notes:** Indented bullets under scenes
6. **Highlighting:** `==**text**==` wrapper

This replicates the logic in Braidr's existing parser (`src/main/` area). Since the MCP server is in the same repo, we could potentially share the parser code, but a standalone implementation avoids coupling.

## Constraints

- **Read-only:** No file modifications
- **No Electron dependency:** Pure Node.js, no Electron APIs
- **No caching:** Fresh reads on every call for real-time accuracy
- **Single project:** One project path per server instance

## Example interactions

- "Show me the braid for chapters 1-3"
- "What scenes does Elena appear in?"
- "Read the prose for Noah's scene 5"
- "What notes are tagged with 'magic-system'?"
- "Give me a project summary with word counts per character"
- "What scenes are connected to this one?"
- "Read the note about world-building rules"
