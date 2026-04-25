/**
 * Tests for draft branch operations (create, list, switch, delete, compare, merge).
 *
 * Each test creates a minimal project in a temp directory with two character
 * .md files and a timeline.json, then exercises the branch functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  listBranches,
  createBranch,
  switchBranch,
  deleteBranch,
  compareBranches,
  mergeBranch,
} from '../main/branches';

/* ── helpers ────────────────────────────────────────────────────────── */

const noahMd = `---
character: Noah
---

## Hook (2)
1. Noah wakes up <!-- sid:noah-1 -->
2. Noah meets Cormac <!-- sid:noah-2 -->
`;

const sallyMd = `---
character: Sally
---

## Hook (1)
1. Sally arrives in town <!-- sid:sally-1 -->
`;

const timelineJson = {
  positions: { 'noah-1': 1, 'noah-2': 3, 'sally-1': 2 },
  connections: {},
  chapters: [],
};

function setupProject(dir: string) {
  fs.writeFileSync(path.join(dir, 'Noah.md'), noahMd, 'utf-8');
  fs.writeFileSync(path.join(dir, 'Sally.md'), sallyMd, 'utf-8');
  fs.writeFileSync(
    path.join(dir, 'timeline.json'),
    JSON.stringify(timelineJson, null, 2),
    'utf-8',
  );
}

/* ── tests ──────────────────────────────────────────────────────────── */

describe('branch operations', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'braidr-branch-test-'));
    setupProject(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ── listBranches ──────────────────────────────────────────────────

  it('returns empty index when no branches exist', () => {
    const idx = listBranches(tmp);
    expect(idx.branches).toEqual([]);
    expect(idx.activeBranch).toBeNull();
  });

  // ── createBranch ──────────────────────────────────────────────────

  it('copies .md files and positions, updates index, sets activeBranch', () => {
    const idx = createBranch(tmp, 'draft-1', 'first draft attempt');

    // Index updated
    expect(idx.branches).toHaveLength(1);
    expect(idx.branches[0].name).toBe('draft-1');
    expect(idx.branches[0].description).toBe('first draft attempt');
    expect(idx.branches[0].createdFrom).toBe('main');
    expect(idx.activeBranch).toBe('draft-1');

    // Files copied into branch folder
    const branchDir = path.join(tmp, 'branches', 'draft-1');
    expect(fs.existsSync(path.join(branchDir, 'Noah.md'))).toBe(true);
    expect(fs.existsSync(path.join(branchDir, 'Sally.md'))).toBe(true);

    // Positions copied
    const posFile = path.join(branchDir, 'positions.json');
    expect(fs.existsSync(posFile)).toBe(true);
    const positions = JSON.parse(fs.readFileSync(posFile, 'utf-8'));
    expect(positions).toEqual(timelineJson.positions);
  });

  it('creates a branch from another branch when one is active', () => {
    createBranch(tmp, 'draft-1');

    // Modify a file in draft-1 to distinguish it
    const branchNoah = path.join(tmp, 'branches', 'draft-1', 'Noah.md');
    const content = fs.readFileSync(branchNoah, 'utf-8');
    fs.writeFileSync(branchNoah, content.replace('Noah wakes up', 'Noah wakes up in a sweat'), 'utf-8');

    // Create draft-2 from draft-1
    const idx = createBranch(tmp, 'draft-2');
    expect(idx.branches[1].createdFrom).toBe('draft-1');

    // draft-2 should have the modified content from draft-1
    const draft2Noah = path.join(tmp, 'branches', 'draft-2', 'Noah.md');
    const draft2Content = fs.readFileSync(draft2Noah, 'utf-8');
    expect(draft2Content).toContain('Noah wakes up in a sweat');
  });

  // ── switchBranch ──────────────────────────────────────────────────

  it('sets activeBranch to a branch name', () => {
    createBranch(tmp, 'draft-1');
    const idx = switchBranch(tmp, null);
    expect(idx.activeBranch).toBeNull();

    const idx2 = switchBranch(tmp, 'draft-1');
    expect(idx2.activeBranch).toBe('draft-1');
  });

  it('switches to main by passing null', () => {
    createBranch(tmp, 'draft-1');
    expect(listBranches(tmp).activeBranch).toBe('draft-1');

    const idx = switchBranch(tmp, null);
    expect(idx.activeBranch).toBeNull();
  });

  // ── deleteBranch ──────────────────────────────────────────────────

  it('removes folder and index entry', () => {
    createBranch(tmp, 'draft-1');
    switchBranch(tmp, null); // back to main so deletion doesn't reset
    const idx = deleteBranch(tmp, 'draft-1');

    expect(idx.branches).toHaveLength(0);
    expect(fs.existsSync(path.join(tmp, 'branches', 'draft-1'))).toBe(false);
  });

  it('switches to main if the active branch is deleted', () => {
    createBranch(tmp, 'draft-1');
    expect(listBranches(tmp).activeBranch).toBe('draft-1');

    const idx = deleteBranch(tmp, 'draft-1');
    expect(idx.activeBranch).toBeNull();
  });

  // ── compareBranches ───────────────────────────────────────────────

  it('detects changed scenes between main and a branch', () => {
    createBranch(tmp, 'draft-1');

    // Modify a scene title in the branch
    const branchNoah = path.join(tmp, 'branches', 'draft-1', 'Noah.md');
    const content = fs.readFileSync(branchNoah, 'utf-8');
    fs.writeFileSync(
      branchNoah,
      content.replace('Noah wakes up', 'Noah wakes up screaming'),
      'utf-8',
    );

    // Modify a position in the branch
    const posFile = path.join(tmp, 'branches', 'draft-1', 'positions.json');
    const positions = JSON.parse(fs.readFileSync(posFile, 'utf-8'));
    positions['sally-1'] = 99;
    fs.writeFileSync(posFile, JSON.stringify(positions), 'utf-8');

    const diff = compareBranches(tmp, null, 'draft-1');
    expect(diff.leftName).toBe('main');
    expect(diff.rightName).toBe('draft-1');
    expect(diff.scenes.length).toBeGreaterThanOrEqual(3);

    const noah1 = diff.scenes.find(s => s.sceneId === 'noah-1');
    expect(noah1).toBeDefined();
    expect(noah1!.changed).toBe(true);
    expect(noah1!.leftTitle).toContain('Noah wakes up');
    expect(noah1!.rightTitle).toContain('Noah wakes up screaming');

    const sally1 = diff.scenes.find(s => s.sceneId === 'sally-1');
    expect(sally1).toBeDefined();
    expect(sally1!.changed).toBe(true);
    expect(sally1!.leftPosition).toBe(2);
    expect(sally1!.rightPosition).toBe(99);

    // noah-2 is unchanged
    const noah2 = diff.scenes.find(s => s.sceneId === 'noah-2');
    expect(noah2).toBeDefined();
    expect(noah2!.changed).toBe(false);
  });

  // ── mergeBranch ───────────────────────────────────────────────────

  it('selectively copies scenes from a branch to main', () => {
    createBranch(tmp, 'draft-1');

    // Modify branch: change noah-1 title, change sally-1 position
    const branchNoah = path.join(tmp, 'branches', 'draft-1', 'Noah.md');
    const noahContent = fs.readFileSync(branchNoah, 'utf-8');
    fs.writeFileSync(
      branchNoah,
      noahContent.replace('Noah wakes up', 'Noah wakes up in a cold sweat'),
      'utf-8',
    );

    const posFile = path.join(tmp, 'branches', 'draft-1', 'positions.json');
    const branchPositions = JSON.parse(fs.readFileSync(posFile, 'utf-8'));
    branchPositions['noah-1'] = 10;
    branchPositions['sally-1'] = 20;
    fs.writeFileSync(posFile, JSON.stringify(branchPositions), 'utf-8');

    // Merge only noah-1 (not sally-1)
    mergeBranch(tmp, 'draft-1', ['noah-1']);

    // Main Noah.md should have the updated title
    const mainNoah = fs.readFileSync(path.join(tmp, 'Noah.md'), 'utf-8');
    expect(mainNoah).toContain('Noah wakes up in a cold sweat');

    // Main timeline should have updated position for noah-1 but NOT sally-1
    const mainTimeline = JSON.parse(
      fs.readFileSync(path.join(tmp, 'timeline.json'), 'utf-8'),
    );
    expect(mainTimeline.positions['noah-1']).toBe(10);
    expect(mainTimeline.positions['sally-1']).toBe(2); // unchanged
  });
});
