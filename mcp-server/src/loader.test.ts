import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProject, loadNoteContent, getDraftProse } from './loader.js';
import { stableId } from './parser.js';
import type { TimelineData } from './types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

const noahOutline = `---
character: Noah
---

## Prologue (1)
1. Prologue scene description #location <!-- sid:scene1 -->

## Hook (1)
2. ==**Noah intro - Chasing Miguel**== Noah chases #miguel through #mexico <!-- sid:scene2 -->
`;

const graceOutline = `---
character: Grace
---

## Act One (2)
1. Grace meets the stranger #park <!-- sid:scene3 -->
2. Grace returns home #home <!-- sid:scene4 -->
`;

const timelineJson: TimelineData = {
  positions: {
    scene1: 0,
    scene2: 5,
    scene3: 2,
    scene4: 8,
  },
  characterColors: {
    [stableId('noah')]: '#ff0000',
    [stableId('grace')]: '#00ff00',
  },
  wordCounts: {
    scene1: 1200,
    scene2: 850,
    scene3: 600,
    scene4: 1500,
  },
  draftContent: {
    scene1: '<p>It was a dark and stormy night.</p>',
    scene2: '<p>Noah ran through the streets of Mexico City.</p>',
  },
};

const notesIndex = {
  notes: [
    {
      id: 'note1',
      title: 'World Building',
      fileName: 'world-building.html',
      parentId: null,
      order: 0,
      createdAt: 1700000000000,
      modifiedAt: 1700000000000,
      outgoingLinks: [],
      sceneLinks: ['scene1'],
      tags: ['worldbuilding'],
    },
  ],
  version: 1,
};

const noteContent = '<h1>World Building</h1><p>Notes about the world.</p>';

// ── Test suite ────────────────────────────────────────────────────────────

describe('loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-loader-test-'));

    // Write character outline files
    fs.writeFileSync(path.join(tmpDir, 'noah.md'), noahOutline);
    fs.writeFileSync(path.join(tmpDir, 'grace.md'), graceOutline);

    // Write timeline.json
    fs.writeFileSync(
      path.join(tmpDir, 'timeline.json'),
      JSON.stringify(timelineJson),
    );

    // Write notes directory and files
    const notesDir = path.join(tmpDir, 'notes');
    fs.mkdirSync(notesDir);
    fs.writeFileSync(
      path.join(notesDir, 'notes-index.json'),
      JSON.stringify(notesIndex),
    );
    fs.writeFileSync(path.join(notesDir, 'world-building.html'), noteContent);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── loadProject ───────────────────────────────────────────────────────

  describe('loadProject', () => {
    it('loads characters from .md files', async () => {
      const project = await loadProject(tmpDir);
      expect(project.characters).toHaveLength(2);

      const names = project.characters.map((c) => c.name).sort();
      expect(names).toEqual(['Grace', 'Noah']);
    });

    it('loads scenes from all character files', async () => {
      const project = await loadProject(tmpDir);
      // Noah has 2 scenes, Grace has 2 scenes
      expect(project.scenes).toHaveLength(4);
    });

    it('loads plot points from all character files', async () => {
      const project = await loadProject(tmpDir);
      // Noah has 2 plot points (Prologue, Hook), Grace has 1 (Act One)
      expect(project.plotPoints).toHaveLength(3);
    });

    it('merges timeline positions into scenes', async () => {
      const project = await loadProject(tmpDir);

      const scene1 = project.scenes.find((s) => s.id === 'scene1');
      expect(scene1).toBeDefined();
      expect(scene1!.timelinePosition).toBe(0);

      const scene2 = project.scenes.find((s) => s.id === 'scene2');
      expect(scene2!.timelinePosition).toBe(5);

      const scene3 = project.scenes.find((s) => s.id === 'scene3');
      expect(scene3!.timelinePosition).toBe(2);

      const scene4 = project.scenes.find((s) => s.id === 'scene4');
      expect(scene4!.timelinePosition).toBe(8);
    });

    it('merges word counts into scenes', async () => {
      const project = await loadProject(tmpDir);

      const scene1 = project.scenes.find((s) => s.id === 'scene1');
      expect(scene1!.wordCount).toBe(1200);

      const scene3 = project.scenes.find((s) => s.id === 'scene3');
      expect(scene3!.wordCount).toBe(600);
    });

    it('applies character colors from timeline', async () => {
      const project = await loadProject(tmpDir);

      const noah = project.characters.find((c) => c.name === 'Noah');
      expect(noah!.color).toBe('#ff0000');

      const grace = project.characters.find((c) => c.name === 'Grace');
      expect(grace!.color).toBe('#00ff00');
    });

    it('loads timeline data', async () => {
      const project = await loadProject(tmpDir);
      expect(project.timeline).toBeDefined();
      expect(project.timeline.positions).toEqual(timelineJson.positions);
      expect(project.timeline.draftContent).toEqual(timelineJson.draftContent);
    });

    it('loads notes index', async () => {
      const project = await loadProject(tmpDir);
      expect(project.notesIndex).not.toBeNull();
      expect(project.notesIndex!.notes).toHaveLength(1);
      expect(project.notesIndex!.notes[0].title).toBe('World Building');
    });

    it('sets projectPath and projectName', async () => {
      const project = await loadProject(tmpDir);
      expect(project.projectPath).toBe(tmpDir);
      expect(project.projectName).toBe(path.basename(tmpDir));
    });

    it('handles missing timeline.json gracefully', async () => {
      fs.unlinkSync(path.join(tmpDir, 'timeline.json'));
      const project = await loadProject(tmpDir);
      expect(project.timeline).toEqual({ positions: {} });
      // Scenes should still load with null positions
      for (const scene of project.scenes) {
        expect(scene.timelinePosition).toBeNull();
      }
    });

    it('handles missing notes directory gracefully', async () => {
      fs.rmSync(path.join(tmpDir, 'notes'), { recursive: true, force: true });
      const project = await loadProject(tmpDir);
      expect(project.notesIndex).toBeNull();
    });
  });

  // ── loadNoteContent ───────────────────────────────────────────────────

  describe('loadNoteContent', () => {
    it('reads note HTML content from notes/ subdirectory', async () => {
      const content = await loadNoteContent(tmpDir, 'world-building.html');
      expect(content).toBe(noteContent);
    });

    it('returns null for non-existent note file', async () => {
      const content = await loadNoteContent(tmpDir, 'does-not-exist.html');
      expect(content).toBeNull();
    });
  });

  // ── getDraftProse ─────────────────────────────────────────────────────

  describe('getDraftProse', () => {
    it('returns draft content for a scene', () => {
      const prose = getDraftProse(timelineJson, 'scene1');
      expect(prose).toBe('<p>It was a dark and stormy night.</p>');
    });

    it('returns null for a scene without draft content', () => {
      const prose = getDraftProse(timelineJson, 'scene3');
      expect(prose).toBeNull();
    });

    it('returns null when draftContent is undefined', () => {
      const prose = getDraftProse({ positions: {} }, 'scene1');
      expect(prose).toBeNull();
    });
  });
});
