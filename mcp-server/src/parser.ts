// Standalone markdown outline parser for the Braidr MCP server.
// Replicates the parsing logic from the Electron app's renderer/services/parser.ts.

// ── Types ───────────────────────────────────────────────────────────────────

export interface Character {
  id: string;
  name: string;
  filePath: string;
  color?: string;
}

export interface Scene {
  id: string;
  characterId: string;
  sceneNumber: number;
  title: string;
  content: string;
  tags: string[];
  timelinePosition: number | null;
  isHighlighted: boolean;
  notes: string[];
  plotPointId: string | null;
  wordCount?: number;
}

export interface PlotPoint {
  id: string;
  characterId: string;
  title: string;
  expectedSceneCount: number | null;
  description: string;
  order: number;
}

export interface OutlineFile {
  character: Character;
  plotPoints: PlotPoint[];
  scenes: Scene[];
  rawContent: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a simple random ID. */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/** Generate a stable ID from a lowercase string (for characters). */
export function stableId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 'c' + Math.abs(hash).toString(36);
}

/** Extract #tag_name tokens from text. Lowercase and deduplicate. */
export function extractTags(text: string): string[] {
  const tagRegex = /#([a-zA-Z0-9_]+)/g;
  const tags: string[] = [];
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1].toLowerCase());
  }

  return [...new Set(tags)];
}

// ── Internal parsing helpers ────────────────────────────────────────────────

function parseCharacterFromFrontmatter(
  content: string,
  fileName: string,
): { character: string; contentAfterFrontmatter: string; fileNameTag: string } {
  const fileNameWithoutExt = fileName.replace('.md', '');
  const fileNameTag = fileNameWithoutExt.toLowerCase().replace(/[\s-]+/g, '_');

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const characterMatch = frontmatter.match(/character:\s*(.+)/);
    const character = characterMatch ? characterMatch[1].trim() : fileNameWithoutExt;
    const contentAfterFrontmatter = content.slice(frontmatterMatch[0].length);
    return { character, contentAfterFrontmatter, fileNameTag };
  }

  // No frontmatter — derive character name from filename (hyphens→spaces, title-cased)
  return {
    character: fileNameWithoutExt
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    contentAfterFrontmatter: content,
    fileNameTag,
  };
}

function isSceneLine(line: string): boolean {
  return /^\d+\.\s/.test(line);
}

function isPlotPointHeader(line: string): boolean {
  return /^##\s+.+/.test(line.trim());
}

function parsePlotPointHeader(line: string): { title: string; expectedCount: number | null } {
  const match = line.match(/^##\s+(.+?)(?:\s*\((\d+)\))?$/);
  if (match) {
    return {
      title: match[1].trim(),
      expectedCount: match[2] ? parseInt(match[2], 10) : null,
    };
  }
  return { title: line.replace(/^##\s+/, '').trim(), expectedCount: null };
}

function parseSceneLine(line: string): {
  sceneNumber: number;
  content: string;
  isHighlighted: boolean;
  stableId: string | null;
} {
  const match = line.match(/^(\d+)\.\s+(.+)$/);
  if (!match) {
    return { sceneNumber: 0, content: line, isHighlighted: false, stableId: null };
  }

  const sceneNumber = parseInt(match[1], 10);
  let content = match[2];

  // Extract stable ID from <!-- sid:xxx --> comment
  let sid: string | null = null;
  const sidMatch = content.match(/<!--\s*sid:(\S+)\s*-->/);
  if (sidMatch) {
    sid = sidMatch[1];
    content = content.replace(/\s*<!--\s*sid:\S+\s*-->/, '').trim();
  }

  // Check for highlighting (==**text**== pattern)
  const isHighlighted = /==\*\*.*\*\*==/.test(content);

  return { sceneNumber, content, isHighlighted, stableId: sid };
}

function isSubNote(line: string): boolean {
  return /^\s+[\d\-\*]\.\s/.test(line) || /^\s+\d+\.\s/.test(line);
}

function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/** Parse an entire outline file into structured data. */
export function parseOutlineFile(
  content: string,
  fileName: string,
  filePath: string,
): OutlineFile {
  const {
    character: characterName,
    contentAfterFrontmatter,
    fileNameTag,
  } = parseCharacterFromFrontmatter(content, fileName);

  const character: Character = {
    id: stableId(characterName.toLowerCase()),
    name: characterName,
    filePath,
  };

  // Proper tag derived from the character name (not the filename)
  const properCharacterTag = characterName.toLowerCase().replace(/\s+/g, '_');

  const lines = contentAfterFrontmatter.split('\n');
  const plotPoints: PlotPoint[] = [];
  const scenes: Scene[] = [];

  let currentPlotPoint: PlotPoint | null = null;
  let currentPlotPointDescription: string[] = [];
  let currentScene: Scene | null = null;
  let currentSceneNotes: string[] = [];
  let plotPointOrder = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (trimmedLine === '') {
      if (currentPlotPointDescription.length > 0 && currentPlotPoint && !currentScene) {
        continue;
      }
      continue;
    }

    // Check for plot point header
    if (isPlotPointHeader(line)) {
      // Save previous scene if exists
      if (currentScene) {
        currentScene.notes = currentSceneNotes;
        scenes.push(currentScene);
        currentScene = null;
        currentSceneNotes = [];
      }

      // Save previous plot point description
      if (currentPlotPoint && currentPlotPointDescription.length > 0) {
        currentPlotPoint.description = currentPlotPointDescription.join('\n').trim();
        currentPlotPointDescription = [];
      }

      const { title, expectedCount } = parsePlotPointHeader(trimmedLine);
      currentPlotPoint = {
        id: generateId(),
        characterId: character.id,
        title,
        expectedSceneCount: expectedCount,
        description: '',
        order: plotPointOrder++,
      };
      plotPoints.push(currentPlotPoint);
      continue;
    }

    // Check for scene line
    if (isSceneLine(line)) {
      // Save previous scene if exists
      if (currentScene) {
        currentScene.notes = currentSceneNotes;
        scenes.push(currentScene);
        currentSceneNotes = [];
      }

      // Save plot point description if we were collecting it
      if (currentPlotPoint && currentPlotPointDescription.length > 0) {
        currentPlotPoint.description = currentPlotPointDescription.join('\n').trim();
        currentPlotPointDescription = [];
      }

      const {
        sceneNumber,
        content: sceneContent,
        isHighlighted,
        stableId: parsedStableId,
      } = parseSceneLine(trimmedLine);

      let tags = extractTags(sceneContent);

      // Filter out old filename-based tag if it differs from the character tag
      if (fileNameTag !== properCharacterTag) {
        tags = tags.filter((t) => t !== fileNameTag);
      }

      // Auto-add character name as a tag
      if (!tags.includes(properCharacterTag)) {
        tags.push(properCharacterTag);
      }

      currentScene = {
        id: parsedStableId || generateId(),
        characterId: character.id,
        sceneNumber,
        title: sceneContent,
        content: sceneContent,
        tags,
        timelinePosition: null,
        isHighlighted,
        notes: [],
        plotPointId: currentPlotPoint?.id || null,
        wordCount: wordCount(sceneContent),
      };
      continue;
    }

    // Check for sub-note
    if (isSubNote(line) && currentScene) {
      currentSceneNotes.push(trimmedLine.replace(/^\s*[\d\-\*]+\.\s*/, ''));
      continue;
    }

    // Otherwise: plot point description or scene continuation
    if (currentPlotPoint && !currentScene) {
      currentPlotPointDescription.push(trimmedLine);
    } else if (currentScene) {
      currentSceneNotes.push(trimmedLine);
    }
  }

  // Flush the last scene
  if (currentScene) {
    currentScene.notes = currentSceneNotes;
    scenes.push(currentScene);
  }

  // Flush the last plot point description
  if (currentPlotPoint && currentPlotPointDescription.length > 0) {
    currentPlotPoint.description = currentPlotPointDescription.join('\n').trim();
  }

  return {
    character,
    plotPoints,
    scenes,
    rawContent: content,
  };
}
