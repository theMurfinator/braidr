import { describe, it, expect } from 'vitest';
import { stableId, extractTags, parseOutlineFile } from './parser.js';

describe('stableId', () => {
  it('generates consistent IDs matching /^c[a-z0-9]+$/', () => {
    const id = stableId('noah');
    expect(id).toMatch(/^c[a-z0-9]+$/);
  });

  it('produces the same ID for the same input', () => {
    expect(stableId('noah')).toBe(stableId('noah'));
  });

  it('produces different IDs for different inputs', () => {
    expect(stableId('noah')).not.toBe(stableId('grace'));
  });

  it('uses lowercase input as expected', () => {
    // The parser calls stableId(name.toLowerCase()), so test with lowercase
    const id = stableId('sally');
    expect(id).toMatch(/^c[a-z0-9]+$/);
    expect(id.length).toBeGreaterThan(1);
  });
});

describe('extractTags', () => {
  it('extracts tags from text', () => {
    const tags = extractTags('Noah meets #miguel at #mexico');
    expect(tags).toEqual(['miguel', 'mexico']);
  });

  it('lowercases tags', () => {
    const tags = extractTags('#Brooklyn #NYC');
    expect(tags).toEqual(['brooklyn', 'nyc']);
  });

  it('deduplicates tags', () => {
    const tags = extractTags('#tag1 #tag2 #tag1');
    expect(tags).toEqual(['tag1', 'tag2']);
  });

  it('handles underscores in tags', () => {
    const tags = extractTags('#main_arc #spiritual_crisis');
    expect(tags).toEqual(['main_arc', 'spiritual_crisis']);
  });

  it('returns empty array for text without tags', () => {
    const tags = extractTags('No tags here');
    expect(tags).toEqual([]);
  });

  it('ignores tags that contain non-matching characters', () => {
    // # followed by non-alphanumeric/underscore should not match
    const tags = extractTags('#valid but # not-a-tag');
    expect(tags).toEqual(['valid']);
  });
});

describe('parseOutlineFile', () => {
  const basicOutline = `---
character: Noah
---

## Prologue (1)
1. Prologue scene description #location <!-- sid:abc123 -->

## Hook (1)
2. ==**Noah intro - Chasing Miguel**== Noah chases #miguel through #mexico

## Setup (6)
This is the setup description for the plot point.

3. Meeting Cormac - Noah meets #cormac at #thane_hq
\t1. Sub-note about meeting
\t2. Another sub-note
4. Noah reflecting
`;

  it('parses character from frontmatter', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    expect(result.character.name).toBe('Noah');
    expect(result.character.filePath).toBe('/path/to/noah.md');
    expect(result.character.id).toBe(stableId('noah'));
  });

  it('parses plot points with titles and expected counts', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    expect(result.plotPoints).toHaveLength(3);
    expect(result.plotPoints[0].title).toBe('Prologue');
    expect(result.plotPoints[0].expectedSceneCount).toBe(1);
    expect(result.plotPoints[1].title).toBe('Hook');
    expect(result.plotPoints[1].expectedSceneCount).toBe(1);
    expect(result.plotPoints[2].title).toBe('Setup');
    expect(result.plotPoints[2].expectedSceneCount).toBe(6);
  });

  it('assigns sequential order to plot points', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    expect(result.plotPoints[0].order).toBe(0);
    expect(result.plotPoints[1].order).toBe(1);
    expect(result.plotPoints[2].order).toBe(2);
  });

  it('assigns characterId to plot points', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    const charId = result.character.id;
    for (const pp of result.plotPoints) {
      expect(pp.characterId).toBe(charId);
    }
  });

  it('parses scenes with stable IDs', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    expect(result.scenes).toHaveLength(4);
    // Scene 1 has a stable ID from <!-- sid:abc123 -->
    expect(result.scenes[0].id).toBe('abc123');
    expect(result.scenes[0].sceneNumber).toBe(1);
  });

  it('detects highlighted scenes', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    // Scene 2 has ==**...**== highlighting
    expect(result.scenes[1].isHighlighted).toBe(true);
    // Scene 1 is not highlighted
    expect(result.scenes[0].isHighlighted).toBe(false);
  });

  it('auto-adds character name tag to scenes', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    for (const scene of result.scenes) {
      expect(scene.tags).toContain('noah');
    }
  });

  it('extracts inline tags from scene content', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    // Scene 1 has #location
    expect(result.scenes[0].tags).toContain('location');
    // Scene 2 has #miguel and #mexico
    expect(result.scenes[1].tags).toContain('miguel');
    expect(result.scenes[1].tags).toContain('mexico');
    // Scene 3 has #cormac and #thane_hq
    expect(result.scenes[2].tags).toContain('cormac');
    expect(result.scenes[2].tags).toContain('thane_hq');
  });

  it('parses sub-notes', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    // Scene 3 (index 2) has sub-notes
    expect(result.scenes[2].notes).toHaveLength(2);
    expect(result.scenes[2].notes[0]).toBe('Sub-note about meeting');
    expect(result.scenes[2].notes[1]).toBe('Another sub-note');
  });

  it('handles missing frontmatter (falls back to filename)', () => {
    const noFrontmatter = `## Act One (3)
1. First scene #tag1
2. Second scene
`;
    const result = parseOutlineFile(noFrontmatter, 'sally-mae.md', '/path/to/sally-mae.md');
    expect(result.character.name).toBe('Sally Mae');
    expect(result.character.id).toBe(stableId('sally mae'));
  });

  it('captures plot point descriptions', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    // The Setup plot point has a description
    expect(result.plotPoints[2].description).toBe('This is the setup description for the plot point.');
  });

  it('associates scenes with correct plot points', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    // Scene 1 -> Prologue plot point
    expect(result.scenes[0].plotPointId).toBe(result.plotPoints[0].id);
    // Scene 2 -> Hook plot point
    expect(result.scenes[1].plotPointId).toBe(result.plotPoints[1].id);
    // Scene 3 -> Setup plot point
    expect(result.scenes[2].plotPointId).toBe(result.plotPoints[2].id);
    // Scene 4 -> Setup plot point
    expect(result.scenes[3].plotPointId).toBe(result.plotPoints[2].id);
  });

  it('preserves rawContent', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    expect(result.rawContent).toBe(basicOutline);
  });

  it('strips stable ID comment from scene content/title', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    expect(result.scenes[0].content).not.toContain('<!-- sid:');
    expect(result.scenes[0].title).not.toContain('<!-- sid:');
  });

  it('generates IDs for scenes without stable IDs', () => {
    const result = parseOutlineFile(basicOutline, 'noah.md', '/path/to/noah.md');
    // Scene 2 has no sid comment, should still have a generated ID
    expect(result.scenes[1].id).toBeTruthy();
    expect(typeof result.scenes[1].id).toBe('string');
  });

  it('handles plot points without expected count', () => {
    const outline = `---
character: Grace
---

## Untitled Section
1. A scene here
`;
    const result = parseOutlineFile(outline, 'grace.md', '/path/to/grace.md');
    expect(result.plotPoints[0].title).toBe('Untitled Section');
    expect(result.plotPoints[0].expectedSceneCount).toBeNull();
  });

  it('filters old filename tag if different from character tag', () => {
    // File is named "old-name.md" but character is "New Name"
    const outline = `---
character: New Name
---

## Act One (1)
1. Scene with #old_name tag
`;
    const result = parseOutlineFile(outline, 'old-name.md', '/path/to/old-name.md');
    // The old filename-based tag "old_name" should be filtered out
    // Character tag "new_name" should be auto-added
    expect(result.scenes[0].tags).toContain('new_name');
    expect(result.scenes[0].tags).not.toContain('old_name');
  });

  it('handles scenes with continuation lines as notes', () => {
    const outline = `---
character: Test
---

## Part 1 (1)
1. A scene
This is a continuation line
Another continuation
`;
    const result = parseOutlineFile(outline, 'test.md', '/path/to/test.md');
    expect(result.scenes[0].notes).toContain('This is a continuation line');
    expect(result.scenes[0].notes).toContain('Another continuation');
  });

  it('computes wordCount for scenes', () => {
    const outline = `---
character: Test
---

## Part 1 (1)
1. One two three four five
`;
    const result = parseOutlineFile(outline, 'test.md', '/path/to/test.md');
    expect(result.scenes[0].wordCount).toBe(5);
  });
});
