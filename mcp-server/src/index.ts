#!/usr/bin/env node

// Braidr MCP Server — exposes novel project data to AI assistants via MCP.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadProject, loadNoteContent, getDraftProse } from './loader.js';
import type { Scene } from './parser.js';
import type { ProjectData } from './types.js';

// ── CLI argument ────────────────────────────────────────────────────────────

const projectPath = process.argv[2];

if (!projectPath) {
  console.error('Usage: braidr-mcp <project-path>');
  console.error('  project-path: absolute path to a Braidr project directory');
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert HTML to readable plain text. */
function stripHtml(html: string): string {
  let text = html;
  // Replace <br> variants with newline
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Replace closing block tags with double newlines
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Collapse triple+ newlines to double
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/** Format a scene for display. */
function formatScene(scene: Scene, data: ProjectData): string {
  const character = data.characters.find((c) => c.id === scene.characterId);
  const charName = character?.name ?? 'Unknown';

  const lines: string[] = [];
  lines.push(`[${charName}] Scene ${scene.sceneNumber}${scene.isHighlighted ? ' *HIGHLIGHTED*' : ''}`);
  lines.push(`ID: ${scene.id}`);
  lines.push(`Title: ${scene.title}`);

  if (scene.timelinePosition !== null) {
    lines.push(`Braid position: ${scene.timelinePosition}`);
  }

  const wc = data.timeline.wordCounts?.[scene.id] ?? scene.wordCount ?? 0;
  lines.push(`Word count: ${wc}`);

  if (scene.tags.length > 0) {
    lines.push(`Tags: ${scene.tags.map((t) => '#' + t).join(', ')}`);
  }

  if (scene.notes.length > 0) {
    lines.push(`Notes:`);
    for (const note of scene.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return lines.join('\n');
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'braidr',
  version: '1.0.0',
});

// ── Tool 1: get_project_summary ─────────────────────────────────────────────

server.tool(
  'get_project_summary',
  'Get an overview of the entire novel project: character count, scene counts, word totals, chapters, and per-character breakdown.',
  async () => {
    const data = await loadProject(projectPath);

    const braidedScenes = data.scenes.filter((s) => s.timelinePosition !== null);
    const unbraidedScenes = data.scenes.filter((s) => s.timelinePosition === null);

    let totalWords = 0;
    for (const scene of data.scenes) {
      totalWords += data.timeline.wordCounts?.[scene.id] ?? scene.wordCount ?? 0;
    }

    const lines: string[] = [];
    lines.push(`Project: ${data.projectName}`);
    lines.push(`Characters: ${data.characters.length}`);
    lines.push(`Total scenes: ${data.scenes.length} (${braidedScenes.length} braided, ${unbraidedScenes.length} unbraided)`);
    lines.push(`Total words: ${totalWords.toLocaleString()}`);

    if (data.timeline.wordCountGoal) {
      lines.push(`Word count goal: ${data.timeline.wordCountGoal.toLocaleString()}`);
      const pct = Math.round((totalWords / data.timeline.wordCountGoal) * 100);
      lines.push(`Progress: ${pct}%`);
    }

    // Chapters
    const chapters = data.timeline.chapters ?? [];
    if (chapters.length > 0) {
      lines.push('');
      lines.push(`Chapters (${chapters.length}):`);
      for (const ch of chapters) {
        lines.push(`  - ${ch.title} (before position ${ch.beforePosition})`);
      }
    }

    // Per-character breakdown
    lines.push('');
    lines.push('Per-character breakdown:');
    for (const character of data.characters) {
      const charScenes = data.scenes.filter((s) => s.characterId === character.id);
      const charBraided = charScenes.filter((s) => s.timelinePosition !== null);
      let charWords = 0;
      for (const s of charScenes) {
        charWords += data.timeline.wordCounts?.[s.id] ?? s.wordCount ?? 0;
      }
      lines.push(`  ${character.name}: ${charScenes.length} scenes (${charBraided.length} braided), ${charWords.toLocaleString()} words`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool 2: list_characters ─────────────────────────────────────────────────

server.tool(
  'list_characters',
  'List all POV characters with their name, ID, color, and scene count.',
  async () => {
    const data = await loadProject(projectPath);

    const lines: string[] = [];
    for (const character of data.characters) {
      const sceneCount = data.scenes.filter((s) => s.characterId === character.id).length;
      const color = character.color ?? 'none';
      lines.push(`${character.name} (ID: ${character.id}, color: ${color}, scenes: ${sceneCount})`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool 3: read_character_outline ──────────────────────────────────────────

server.tool(
  'read_character_outline',
  'Read a character\'s full outline including plot points, scenes, notes, braid positions, and word counts. Find by name (case-insensitive) or ID.',
  { character: z.string().describe('Character name (case-insensitive) or ID') },
  async ({ character }) => {
    const data = await loadProject(projectPath);

    const charLower = character.toLowerCase();
    const found = data.characters.find(
      (c) => c.name.toLowerCase() === charLower || c.id === character,
    );

    if (!found) {
      return {
        content: [{ type: 'text' as const, text: `Character not found: "${character}". Available: ${data.characters.map((c) => c.name).join(', ')}` }],
      };
    }

    const charScenes = data.scenes.filter((s) => s.characterId === found.id);
    const charPlotPoints = data.plotPoints.filter((pp) => pp.characterId === found.id);

    const lines: string[] = [];
    lines.push(`# ${found.name}`);
    lines.push(`ID: ${found.id}`);
    if (found.color) lines.push(`Color: ${found.color}`);
    lines.push(`Scenes: ${charScenes.length}`);
    lines.push('');

    // Group scenes by plot point
    for (const pp of charPlotPoints) {
      const ppScenes = charScenes.filter((s) => s.plotPointId === pp.id);
      const expected = pp.expectedSceneCount !== null ? ` (${pp.expectedSceneCount})` : '';
      lines.push(`## ${pp.title}${expected}`);
      if (pp.description) {
        lines.push(pp.description);
      }
      lines.push('');

      for (const scene of ppScenes) {
        lines.push(formatScene(scene, data));
        lines.push('');
      }
    }

    // Scenes not in any plot point
    const orphanScenes = charScenes.filter((s) => !s.plotPointId);
    if (orphanScenes.length > 0) {
      lines.push(`## (No plot point)`);
      lines.push('');
      for (const scene of orphanScenes) {
        lines.push(formatScene(scene, data));
        lines.push('');
      }
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool 4: read_scene ──────────────────────────────────────────────────────

server.tool(
  'read_scene',
  'Read a specific scene by ID, or find by character name + scene number.',
  {
    sceneId: z.string().optional().describe('Scene ID'),
    character: z.string().optional().describe('Character name (case-insensitive) or ID'),
    sceneNumber: z.number().optional().describe('Scene number within the character outline'),
  },
  async ({ sceneId, character, sceneNumber }) => {
    const data = await loadProject(projectPath);

    let scene: Scene | undefined;

    if (sceneId) {
      scene = data.scenes.find((s) => s.id === sceneId);
    } else if (character && sceneNumber !== undefined) {
      const charLower = character.toLowerCase();
      const found = data.characters.find(
        (c) => c.name.toLowerCase() === charLower || c.id === character,
      );
      if (found) {
        scene = data.scenes.find(
          (s) => s.characterId === found.id && s.sceneNumber === sceneNumber,
        );
      }
    }

    if (!scene) {
      return {
        content: [{ type: 'text' as const, text: 'Scene not found. Provide a sceneId, or a character name + sceneNumber.' }],
      };
    }

    return { content: [{ type: 'text' as const, text: formatScene(scene, data) }] };
  },
);

// ── Tool 5: read_scene_prose ────────────────────────────────────────────────

server.tool(
  'read_scene_prose',
  'Read the draft prose content for a scene (from the editor\'s draft content).',
  { sceneId: z.string().describe('Scene ID') },
  async ({ sceneId }) => {
    const data = await loadProject(projectPath);

    const scene = data.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return { content: [{ type: 'text' as const, text: `Scene not found: ${sceneId}` }] };
    }

    const html = getDraftProse(data.timeline, sceneId);
    if (!html) {
      return { content: [{ type: 'text' as const, text: `No draft prose found for scene ${sceneId}` }] };
    }

    const character = data.characters.find((c) => c.id === scene.characterId);
    const charName = character?.name ?? 'Unknown';
    const header = `[${charName}] Scene ${scene.sceneNumber}: ${scene.title}\n${'─'.repeat(60)}\n`;

    return { content: [{ type: 'text' as const, text: header + stripHtml(html) }] };
  },
);

// ── Tool 6: search_scenes ───────────────────────────────────────────────────

server.tool(
  'search_scenes',
  'Search for scenes by text query, tag, and/or character. All filters are combined (AND).',
  {
    query: z.string().optional().describe('Text to search for in scene title/content (case-insensitive)'),
    tag: z.string().optional().describe('Tag to filter by (without #)'),
    character: z.string().optional().describe('Character name (case-insensitive) or ID'),
  },
  async ({ query, tag, character }) => {
    const data = await loadProject(projectPath);

    let results = data.scenes;

    if (character) {
      const charLower = character.toLowerCase();
      const found = data.characters.find(
        (c) => c.name.toLowerCase() === charLower || c.id === character,
      );
      if (found) {
        results = results.filter((s) => s.characterId === found.id);
      } else {
        return { content: [{ type: 'text' as const, text: `Character not found: "${character}"` }] };
      }
    }

    if (tag) {
      const tagLower = tag.toLowerCase();
      results = results.filter((s) => s.tags.some((t) => t === tagLower));
    }

    if (query) {
      const queryLower = query.toLowerCase();
      results = results.filter(
        (s) =>
          s.title.toLowerCase().includes(queryLower) ||
          s.content.toLowerCase().includes(queryLower) ||
          s.notes.some((n) => n.toLowerCase().includes(queryLower)),
      );
    }

    if (results.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No scenes matched the search criteria.' }] };
    }

    const lines: string[] = [`${results.length} scene(s) found:`, ''];
    for (const scene of results) {
      lines.push(formatScene(scene, data));
      lines.push('');
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool 7: read_braid ─────────────────────────────────────────────────────

server.tool(
  'read_braid',
  'Read the braided timeline — all scenes that have been placed on the timeline, in position order, with chapter breaks.',
  {
    fromPosition: z.number().optional().describe('Start from this braid position (inclusive)'),
    toPosition: z.number().optional().describe('End at this braid position (inclusive)'),
  },
  async ({ fromPosition, toPosition }) => {
    const data = await loadProject(projectPath);

    let braided = data.scenes
      .filter((s) => s.timelinePosition !== null)
      .sort((a, b) => a.timelinePosition! - b.timelinePosition!);

    if (fromPosition !== undefined) {
      braided = braided.filter((s) => s.timelinePosition! >= fromPosition);
    }
    if (toPosition !== undefined) {
      braided = braided.filter((s) => s.timelinePosition! <= toPosition);
    }

    if (braided.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No braided scenes found in the specified range.' }] };
    }

    const chapters = (data.timeline.chapters ?? []).sort(
      (a, b) => a.beforePosition - b.beforePosition,
    );

    const lines: string[] = [`Braided timeline: ${braided.length} scenes`, ''];
    let chapterIdx = 0;

    for (const scene of braided) {
      // Insert chapter breaks
      while (
        chapterIdx < chapters.length &&
        chapters[chapterIdx].beforePosition <= scene.timelinePosition!
      ) {
        lines.push(`--- ${chapters[chapterIdx].title} ---`);
        lines.push('');
        chapterIdx++;
      }

      const character = data.characters.find((c) => c.id === scene.characterId);
      const charName = character?.name ?? 'Unknown';
      const wc = data.timeline.wordCounts?.[scene.id] ?? scene.wordCount ?? 0;
      lines.push(
        `${scene.timelinePosition}. [${charName}] ${scene.title} (${wc}w) {${scene.id}}`,
      );
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool 8: read_timeline_metadata ──────────────────────────────────────────

server.tool(
  'read_timeline_metadata',
  'Read detailed timeline metadata for a scene: connections, word count, dates, custom metadata fields, comments, and scratchpad.',
  { sceneId: z.string().describe('Scene ID') },
  async ({ sceneId }) => {
    const data = await loadProject(projectPath);

    const scene = data.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return { content: [{ type: 'text' as const, text: `Scene not found: ${sceneId}` }] };
    }

    const character = data.characters.find((c) => c.id === scene.characterId);
    const charName = character?.name ?? 'Unknown';

    const lines: string[] = [];
    lines.push(`[${charName}] Scene ${scene.sceneNumber}: ${scene.title}`);
    lines.push('');

    // Connections
    const connections = data.timeline.connections?.[sceneId] ?? [];
    if (connections.length > 0) {
      lines.push('Connections:');
      for (const connId of connections) {
        const connScene = data.scenes.find((s) => s.id === connId);
        if (connScene) {
          const connChar = data.characters.find((c) => c.id === connScene.characterId);
          lines.push(`  -> [${connChar?.name ?? 'Unknown'}] Scene ${connScene.sceneNumber}: ${connScene.title} {${connId}}`);
        } else {
          lines.push(`  -> {${connId}} (not found)`);
        }
      }
      lines.push('');
    }

    // Word count
    const wc = data.timeline.wordCounts?.[sceneId] ?? scene.wordCount ?? 0;
    lines.push(`Word count: ${wc}`);

    // Dates
    const startDate = data.timeline.timelineDates?.[sceneId];
    const endDate = data.timeline.timelineEndDates?.[sceneId];
    if (startDate) lines.push(`Start date: ${startDate}`);
    if (endDate) lines.push(`End date: ${endDate}`);

    // Custom metadata fields
    const sceneMetadata = data.timeline.sceneMetadata?.[sceneId];
    const fieldDefs = data.timeline.metadataFieldDefs ?? [];
    if (sceneMetadata && fieldDefs.length > 0) {
      lines.push('');
      lines.push('Custom metadata:');
      for (const def of fieldDefs) {
        const value = sceneMetadata[def.id];
        if (value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
          const display = Array.isArray(value) ? value.join(', ') : value;
          lines.push(`  ${def.name}: ${display}`);
        }
      }
    }

    // Comments
    const comments = data.timeline.sceneComments?.[sceneId] ?? [];
    if (comments.length > 0) {
      lines.push('');
      lines.push('Comments:');
      for (const comment of comments) {
        const resolved = comment.resolved ? ' [RESOLVED]' : '';
        lines.push(`  - ${comment.text}${resolved}`);
      }
    }

    // Scratchpad
    const scratchpad = data.timeline.scratchpad?.[sceneId];
    if (scratchpad) {
      lines.push('');
      lines.push('Scratchpad:');
      lines.push(scratchpad);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool 9: list_notes ──────────────────────────────────────────────────────

server.tool(
  'list_notes',
  'List all notes in the project, optionally filtered by tag or parent folder.',
  {
    tag: z.string().optional().describe('Filter by tag (without #)'),
    parentId: z.string().optional().describe('Filter by parent note/folder ID'),
  },
  async ({ tag, parentId }) => {
    const data = await loadProject(projectPath);

    if (!data.notesIndex) {
      return { content: [{ type: 'text' as const, text: 'No notes found in this project.' }] };
    }

    let notes = data.notesIndex.notes;

    if (tag) {
      const tagLower = tag.toLowerCase();
      notes = notes.filter((n) => n.tags?.some((t) => t.toLowerCase() === tagLower));
    }

    if (parentId) {
      notes = notes.filter((n) => n.parentId === parentId);
    }

    if (notes.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No notes matched the filter criteria.' }] };
    }

    const lines: string[] = [`${notes.length} note(s):`, ''];
    for (const note of notes) {
      const tags = note.tags?.length ? ` [${note.tags.map((t) => '#' + t).join(', ')}]` : '';
      const links = note.outgoingLinks.length > 0 ? ` -> ${note.outgoingLinks.length} link(s)` : '';
      const sceneLinks = note.sceneLinks.length > 0 ? ` | ${note.sceneLinks.length} scene link(s)` : '';
      lines.push(`${note.title} (ID: ${note.id})${tags}${links}${sceneLinks}`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool 10: read_note ──────────────────────────────────────────────────────

server.tool(
  'read_note',
  'Read the full content of a note. Find by ID or title (case-insensitive).',
  { note: z.string().describe('Note ID or title (case-insensitive)') },
  async ({ note }) => {
    const data = await loadProject(projectPath);

    if (!data.notesIndex) {
      return { content: [{ type: 'text' as const, text: 'No notes found in this project.' }] };
    }

    const noteLower = note.toLowerCase();
    const found = data.notesIndex.notes.find(
      (n) => n.id === note || n.title.toLowerCase() === noteLower,
    );

    if (!found) {
      return {
        content: [{ type: 'text' as const, text: `Note not found: "${note}". Use list_notes to see available notes.` }],
      };
    }

    const html = await loadNoteContent(projectPath, found.fileName);
    if (!html) {
      return { content: [{ type: 'text' as const, text: `Could not read note file: ${found.fileName}` }] };
    }

    const tags = found.tags?.length ? `\nTags: ${found.tags.map((t) => '#' + t).join(', ')}` : '';
    const header = `# ${found.title}${tags}\nID: ${found.id}\n${'─'.repeat(60)}\n`;

    return { content: [{ type: 'text' as const, text: header + stripHtml(html) }] };
  },
);

// ── Tool 11: search_notes ───────────────────────────────────────────────────

server.tool(
  'search_notes',
  'Search notes by content text, tag, or linked scene ID. All filters are combined (AND).',
  {
    query: z.string().optional().describe('Text to search for in note title and content (case-insensitive)'),
    tag: z.string().optional().describe('Tag to filter by (without #)'),
    sceneId: z.string().optional().describe('Scene ID to find notes linked to'),
  },
  async ({ query, tag, sceneId }) => {
    const data = await loadProject(projectPath);

    if (!data.notesIndex) {
      return { content: [{ type: 'text' as const, text: 'No notes found in this project.' }] };
    }

    let results = data.notesIndex.notes;

    if (tag) {
      const tagLower = tag.toLowerCase();
      results = results.filter((n) => n.tags?.some((t) => t.toLowerCase() === tagLower));
    }

    if (sceneId) {
      results = results.filter((n) => n.sceneLinks.includes(sceneId));
    }

    // For query search, we need to read note content
    if (query) {
      const queryLower = query.toLowerCase();

      const contentChecks = await Promise.all(
        results.map(async (n) => {
          if (n.title.toLowerCase().includes(queryLower)) return true;
          const html = await loadNoteContent(projectPath, n.fileName);
          if (!html) return false;
          return stripHtml(html).toLowerCase().includes(queryLower);
        }),
      );

      results = results.filter((_, i) => contentChecks[i]);
    }

    if (results.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No notes matched the search criteria.' }] };
    }

    const lines: string[] = [`${results.length} note(s) found:`, ''];
    for (const note of results) {
      const tags = note.tags?.length ? ` [${note.tags.map((t) => '#' + t).join(', ')}]` : '';
      const sceneLinks = note.sceneLinks.length > 0 ? ` | scene links: ${note.sceneLinks.join(', ')}` : '';
      lines.push(`${note.title} (ID: ${note.id})${tags}${sceneLinks}`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Start server ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('braidr-mcp server running on stdio');
