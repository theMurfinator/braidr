// Data loader for the Braidr MCP server.
// Reads markdown outline files, timeline.json, and notes index from a project directory.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseOutlineFile } from './parser.js';
import type { Character, Scene, PlotPoint } from './parser.js';
import type { TimelineData, NotesIndex, ProjectData } from './types.js';

/**
 * Load an entire Braidr project from a directory.
 *
 * Reads all .md outline files, timeline.json, and the notes index.
 * Merges timeline positions, word counts, and character colors into the
 * parsed data structures.
 */
export async function loadProject(projectPath: string): Promise<ProjectData> {
  const characters: Character[] = [];
  const scenes: Scene[] = [];
  const plotPoints: PlotPoint[] = [];

  // ── Read and parse all .md files ──────────────────────────────────────
  const files = fs.readdirSync(projectPath);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const fileName of mdFiles) {
    const filePath = path.join(projectPath, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const outline = parseOutlineFile(content, fileName, filePath);

    characters.push(outline.character);
    scenes.push(...outline.scenes);
    plotPoints.push(...outline.plotPoints);
  }

  // ── Read timeline.json ────────────────────────────────────────────────
  const timelinePath = path.join(projectPath, 'timeline.json');
  let timeline: TimelineData = { positions: {} };

  if (fs.existsSync(timelinePath)) {
    try {
      const raw = fs.readFileSync(timelinePath, 'utf-8');
      timeline = JSON.parse(raw) as TimelineData;
    } catch {
      // If timeline.json is malformed, fall back to empty
      timeline = { positions: {} };
    }
  }

  // ── Read notes index ──────────────────────────────────────────────────
  const notesIndexPath = path.join(projectPath, 'notes', 'notes-index.json');
  let notesIndex: NotesIndex | null = null;

  if (fs.existsSync(notesIndexPath)) {
    try {
      const raw = fs.readFileSync(notesIndexPath, 'utf-8');
      notesIndex = JSON.parse(raw) as NotesIndex;
    } catch {
      notesIndex = null;
    }
  }

  // ── Merge timeline data into scenes ───────────────────────────────────
  for (const scene of scenes) {
    if (timeline.positions[scene.id] !== undefined) {
      scene.timelinePosition = timeline.positions[scene.id];
    }
    if (timeline.wordCounts?.[scene.id] !== undefined) {
      scene.wordCount = timeline.wordCounts[scene.id];
    }
  }

  // ── Apply character colors ────────────────────────────────────────────
  for (const character of characters) {
    if (timeline.characterColors?.[character.id]) {
      character.color = timeline.characterColors[character.id];
    }
  }

  return {
    projectPath,
    projectName: path.basename(projectPath),
    characters,
    scenes,
    plotPoints,
    timeline,
    notesIndex,
  };
}

/**
 * Read the HTML content of a single note file from the notes/ subdirectory.
 * Returns null if the file does not exist.
 */
export async function loadNoteContent(
  projectPath: string,
  fileName: string,
): Promise<string | null> {
  const notePath = path.join(projectPath, 'notes', fileName);

  if (!fs.existsSync(notePath)) {
    return null;
  }

  try {
    return fs.readFileSync(notePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get draft prose content for a scene from the timeline's draftContent map.
 * Returns null if no draft exists for the given scene.
 */
export function getDraftProse(
  timeline: TimelineData,
  sceneId: string,
): string | null {
  return timeline.draftContent?.[sceneId] ?? null;
}
