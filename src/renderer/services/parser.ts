import { Scene, PlotPoint, Character, OutlineFile, Tag, TagCategory } from '../../shared/types';

// Generate a simple unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Generate a stable ID from a string (for characters)
function stableId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'c' + Math.abs(hash).toString(36);
}

// Extract character name from frontmatter
function parseCharacterFromFrontmatter(content: string, fileName: string): { character: string; contentAfterFrontmatter: string; fileNameTag: string } {
  // Calculate filename-based tag (for filtering out old tags)
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

  // No frontmatter, use filename as character name
  return {
    character: fileNameWithoutExt.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    contentAfterFrontmatter: content,
    fileNameTag
  };
}

// Extract tags from text (words starting with #)
export function extractTags(text: string): string[] {
  const tagRegex = /#([a-zA-Z0-9_]+)/g;
  const tags: string[] = [];
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1].toLowerCase());
  }

  return [...new Set(tags)]; // Remove duplicates
}

// Check if a line is a scene (starts with a number followed by period, NOT indented)
function isSceneLine(line: string): boolean {
  // Must start at beginning of line (no leading whitespace) with a number
  return /^\d+\.\s/.test(line);
}

// Check if a line is a plot point header (## followed by text)
function isPlotPointHeader(line: string): boolean {
  return /^##\s+.+/.test(line.trim());
}

// Parse a plot point header to extract title and expected scene count
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

// Parse a scene line
function parseSceneLine(line: string): { sceneNumber: number; content: string; isHighlighted: boolean } {
  const match = line.match(/^(\d+)\.\s+(.+)$/);
  if (!match) {
    return { sceneNumber: 0, content: line, isHighlighted: false };
  }

  const sceneNumber = parseInt(match[1], 10);
  let content = match[2];

  // Check for highlighting (==**text**== pattern)
  const isHighlighted = /==\*\*.*\*\*==/.test(content);

  return { sceneNumber, content, isHighlighted };
}

// Check if a line is a sub-note (indented bullet)
function isSubNote(line: string): boolean {
  return /^\s+[\d\-\*]\.\s/.test(line) || /^\s+\d+\.\s/.test(line);
}

// Parse an entire outline file
export function parseOutlineFile(content: string, fileName: string, filePath: string): OutlineFile {
  const { character: characterName, contentAfterFrontmatter, fileNameTag } = parseCharacterFromFrontmatter(content, fileName);

  const character: Character = {
    id: stableId(characterName.toLowerCase()),
    name: characterName,
    filePath,
  };

  // Calculate the proper character tag based on the character name
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

    // Skip empty lines but track them
    if (trimmedLine === '') {
      if (currentPlotPointDescription.length > 0 && currentPlotPoint && !currentScene) {
        // We're in plot point description mode
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

      const { sceneNumber, content: sceneContent, isHighlighted } = parseSceneLine(trimmedLine);
      let tags = extractTags(sceneContent);

      // Filter out any old filename-based tag if it differs from the proper character tag
      // This handles the case where files were named differently than the character name
      if (fileNameTag !== properCharacterTag) {
        tags = tags.filter(t => t !== fileNameTag);
      }

      // Auto-add character name as a tag (using proper character name, not filename)
      if (!tags.includes(properCharacterTag)) {
        tags.push(properCharacterTag);
      }

      currentScene = {
        id: generateId(),
        characterId: character.id,
        sceneNumber,
        title: sceneContent,
        content: sceneContent,
        tags,
        timelinePosition: null, // null = not yet braided, positions loaded from timeline.json
        isHighlighted,
        notes: [],
        plotPointId: currentPlotPoint?.id || null,
      };
      continue;
    }

    // Check for sub-note
    if (isSubNote(line) && currentScene) {
      currentSceneNotes.push(trimmedLine.replace(/^\s*[\d\-\*]+\.\s*/, ''));
      continue;
    }

    // Otherwise, it's either plot point description or continuation
    if (currentPlotPoint && !currentScene) {
      currentPlotPointDescription.push(trimmedLine);
    } else if (currentScene) {
      // Could be a continuation of scene content or a note
      currentSceneNotes.push(trimmedLine);
    }
  }

  // Don't forget the last scene
  if (currentScene) {
    currentScene.notes = currentSceneNotes;
    scenes.push(currentScene);
  }

  // Don't forget the last plot point description
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

// Build scene line with tags appended from tags array
function buildSceneLine(scene: Scene, characterName: string): string {
  // Strip existing tags from content to avoid duplicates
  let cleanContent = scene.content.replace(/#[a-zA-Z0-9_]+/g, '').trim();

  // Get tags to append (excluding character's own tag which is auto-added)
  const characterTag = characterName.toLowerCase().replace(/\s+/g, '_');
  const tagsToWrite = scene.tags.filter(t => t !== characterTag);

  // Append tags
  if (tagsToWrite.length > 0) {
    cleanContent += ' ' + tagsToWrite.map(t => `#${t}`).join(' ');
  }

  return cleanContent;
}

// Serialize outline back to markdown format
export function serializeOutline(outline: OutlineFile): string {
  let content = `---\ncharacter: ${outline.character.name}\n---\n\n`;

  // Group scenes by plot point
  const scenesByPlotPoint = new Map<string | null, Scene[]>();

  for (const scene of outline.scenes) {
    const key = scene.plotPointId;
    if (!scenesByPlotPoint.has(key)) {
      scenesByPlotPoint.set(key, []);
    }
    scenesByPlotPoint.get(key)!.push(scene);
  }

  // Sort plot points by order
  const sortedPlotPoints = [...outline.plotPoints].sort((a, b) => a.order - b.order);

  // Write scenes without plot points first
  const orphanScenes = scenesByPlotPoint.get(null) || [];
  for (const scene of orphanScenes.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
    const sceneLine = buildSceneLine(scene, outline.character.name);
    content += `${scene.sceneNumber}. ${sceneLine}\n`;
    for (const note of scene.notes) {
      content += `\t1. ${note}\n`;
    }
  }

  // Write each plot point with its scenes
  for (const plotPoint of sortedPlotPoints) {
    const countStr = plotPoint.expectedSceneCount ? ` (${plotPoint.expectedSceneCount})` : '';
    content += `## ${plotPoint.title}${countStr}\n`;

    if (plotPoint.description) {
      content += `${plotPoint.description}\n`;
    }

    const scenes = scenesByPlotPoint.get(plotPoint.id) || [];
    for (const scene of scenes.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      const sceneLine = buildSceneLine(scene, outline.character.name);
      content += `${scene.sceneNumber}. ${sceneLine}\n`;
      for (const note of scene.notes) {
        content += `\t1. ${note}\n`;
      }
    }

    content += '\n';
  }

  return content;
}

// Infer tag category from tag name (simple heuristic)
export function inferTagCategory(tagName: string): TagCategory {
  // These are just defaults - users can recategorize
  const locationKeywords = ['city', 'town', 'street', 'house', 'building', 'church', 'cathedral', 'apartment', 'brooklyn', 'mexico', 'hq'];
  const timeKeywords = ['day', 'night', 'morning', 'evening', 'year', 'century', 'present', 'past', 'future', 'childhood'];
  const arcKeywords = ['arc', 'plot', 'story', 'thread', 'crisis', 'romance'];
  const thingKeywords = ['rosary', 'pistol', 'letter', 'note', 'weapon'];

  const lower = tagName.toLowerCase();

  if (locationKeywords.some(k => lower.includes(k))) return 'locations';
  if (timeKeywords.some(k => lower.includes(k))) return 'time';
  if (arcKeywords.some(k => lower.includes(k))) return 'arcs';
  if (thingKeywords.some(k => lower.includes(k))) return 'things';

  // Default to people (most tags are probably character names)
  return 'people';
}

// Create Tag objects from extracted tag strings
export function createTagsFromStrings(tagStrings: string[], existingTags: Tag[]): Tag[] {
  const existingNames = new Set(existingTags.map(t => t.name));
  const newTags: Tag[] = [];

  for (const name of tagStrings) {
    if (!existingNames.has(name)) {
      newTags.push({
        id: generateId(),
        name,
        category: inferTagCategory(name),
      });
      existingNames.add(name);
    }
  }

  return newTags;
}
