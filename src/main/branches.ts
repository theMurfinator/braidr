/**
 * Draft branch operations for Braidr.
 *
 * A "branch" is a named copy of all character .md outlines and their
 * timeline positions. The branch lives in `branches/<name>/` inside the
 * project folder.  A JSON index at `branches/index.json` tracks which
 * branches exist and which one (if any) is currently active.
 *
 * "main" is the implicit default — the .md files and timeline.json that
 * sit directly in the project root.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BranchIndex, BranchInfo, BranchCompareData, BranchSceneDiff } from '../shared/types';

/* ── internal helpers ───────────────────────────────────────────────── */

function branchesDir(projectPath: string): string {
  return path.join(projectPath, 'branches');
}

function indexPath(projectPath: string): string {
  return path.join(branchesDir(projectPath), 'index.json');
}

function readIndex(projectPath: string): BranchIndex {
  const p = indexPath(projectPath);
  if (!fs.existsSync(p)) {
    return { branches: [], activeBranch: null };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeIndex(projectPath: string, index: BranchIndex): void {
  const dir = branchesDir(projectPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = indexPath(projectPath) + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
  fs.renameSync(tmpPath, indexPath(projectPath));
}

/** List .md files in a directory (same filter as READ_PROJECT handler). */
function listMdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('CLAUDE'));
}

/** Read positions for main (from timeline.json) or a branch. */
function readPositions(projectPath: string, branchName: string | null): Record<string, number> {
  if (branchName === null) {
    // Main
    const tl = path.join(projectPath, 'timeline.json');
    if (!fs.existsSync(tl)) return {};
    const data = JSON.parse(fs.readFileSync(tl, 'utf-8'));
    return data.positions ?? {};
  }
  const posFile = path.join(branchesDir(projectPath), branchName, 'positions.json');
  if (!fs.existsSync(posFile)) return {};
  return JSON.parse(fs.readFileSync(posFile, 'utf-8'));
}

/** Directory containing .md files for a branch (or main). */
function mdDir(projectPath: string, branchName: string | null): string {
  if (branchName === null) return projectPath;
  return path.join(branchesDir(projectPath), branchName);
}

/** Parse character name from frontmatter `character: Name`. */
function parseCharacterName(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?character:\s*(.+)\n[\s\S]*?---/m);
  return match ? match[1].trim() : 'Unknown';
}

interface ParsedScene {
  sceneId: string;
  sceneNumber: number;
  title: string;         // the scene line content (without sid comment)
  fullLine: string;      // the original full line
  characterName: string;
  characterId: string;   // derived from filename
  fileName: string;
}

/** Parse all scenes (with sid comments) from a set of .md files in a directory. */
function parseScenesFromDir(dir: string): ParsedScene[] {
  const scenes: ParsedScene[] = [];
  const mdFiles = listMdFiles(dir);

  for (const fileName of mdFiles) {
    const content = fs.readFileSync(path.join(dir, fileName), 'utf-8');
    const characterName = parseCharacterName(content);
    const characterId = fileName.replace('.md', '').toLowerCase();

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      const lineMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (!lineMatch) continue;

      const sceneNumber = parseInt(lineMatch[1], 10);
      let sceneLine = lineMatch[2];

      const sidMatch = sceneLine.match(/<!--\s*sid:(\S+)\s*-->/);
      if (!sidMatch) continue; // skip scenes without stable IDs

      const sceneId = sidMatch[1];
      const title = sceneLine.replace(/\s*<!--\s*sid:\S+\s*-->/, '').trim();

      scenes.push({
        sceneId,
        sceneNumber,
        title,
        fullLine: trimmed,
        characterName,
        characterId,
        fileName,
      });
    }
  }

  return scenes;
}

/* ── exported functions ─────────────────────────────────────────────── */

/** Read branch index (or return empty default). */
export function listBranches(projectPath: string): BranchIndex {
  return readIndex(projectPath);
}

/**
 * Create a new branch by copying .md files and positions from the
 * current source (the active branch, or main if none is active).
 */
export function createBranch(projectPath: string, name: string, description?: string): BranchIndex {
  const index = readIndex(projectPath);

  const sourceLabel = index.activeBranch ?? 'main';
  const sourceDir = mdDir(projectPath, index.activeBranch);
  const sourcePositions = readPositions(projectPath, index.activeBranch);

  // Create branch directory
  const destDir = path.join(branchesDir(projectPath), name);
  fs.mkdirSync(destDir, { recursive: true });

  // Copy .md files
  for (const file of listMdFiles(sourceDir)) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
  }

  // Write positions
  fs.writeFileSync(
    path.join(destDir, 'positions.json'),
    JSON.stringify(sourcePositions, null, 2),
    'utf-8',
  );

  // Update index
  const info: BranchInfo = {
    name,
    description,
    createdAt: new Date().toISOString(),
    createdFrom: sourceLabel,
  };
  index.branches.push(info);
  index.activeBranch = name;
  writeIndex(projectPath, index);

  return index;
}

/** Switch the active branch (pass null to go back to main). */
export function switchBranch(projectPath: string, name: string | null): BranchIndex {
  const index = readIndex(projectPath);
  index.activeBranch = name;
  writeIndex(projectPath, index);
  return index;
}

/** Delete a branch's folder and remove it from the index. */
export function deleteBranch(projectPath: string, name: string): BranchIndex {
  const index = readIndex(projectPath);

  // Remove folder
  const dir = path.join(branchesDir(projectPath), name);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Remove from index
  index.branches = index.branches.filter(b => b.name !== name);

  // Reset to main if the deleted branch was active
  if (index.activeBranch === name) {
    index.activeBranch = null;
  }

  writeIndex(projectPath, index);
  return index;
}

/**
 * Compare two branches (null = main). Returns per-scene diff of titles
 * and positions.
 */
export function compareBranches(
  projectPath: string,
  leftBranch: string | null,
  rightBranch: string | null,
): BranchCompareData {
  const leftDir = mdDir(projectPath, leftBranch);
  const rightDir = mdDir(projectPath, rightBranch);
  const leftPositions = readPositions(projectPath, leftBranch);
  const rightPositions = readPositions(projectPath, rightBranch);

  const leftScenes = parseScenesFromDir(leftDir);
  const rightScenes = parseScenesFromDir(rightDir);

  // Build maps keyed by sceneId
  const leftMap = new Map(leftScenes.map(s => [s.sceneId, s]));
  const rightMap = new Map(rightScenes.map(s => [s.sceneId, s]));

  // Collect all unique scene IDs
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);

  const diffs: BranchSceneDiff[] = [];

  for (const sceneId of allIds) {
    const left = leftMap.get(sceneId);
    const right = rightMap.get(sceneId);

    const leftTitle = left?.title ?? '';
    const rightTitle = right?.title ?? '';
    const leftPos = leftPositions[sceneId] ?? null;
    const rightPos = rightPositions[sceneId] ?? null;

    const changed = leftTitle !== rightTitle || leftPos !== rightPos;

    diffs.push({
      sceneId,
      characterId: (left ?? right)!.characterId,
      characterName: (left ?? right)!.characterName,
      sceneNumber: (left ?? right)!.sceneNumber,
      leftTitle,
      rightTitle,
      leftPosition: leftPos,
      rightPosition: rightPos,
      changed,
    });
  }

  return {
    leftName: leftBranch ?? 'main',
    rightName: rightBranch ?? 'main',
    scenes: diffs,
  };
}

/**
 * Merge selected scenes from a branch into main.
 * For each sceneId: replace the matching line in main's .md file, and
 * update the position in timeline.json.
 */
export function mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): void {
  if (sceneIds.length === 0) return;

  const branchDir = mdDir(projectPath, branchName);
  const branchPositions = readPositions(projectPath, branchName);
  const branchScenes = parseScenesFromDir(branchDir);

  // Build lookup of branch scenes by sceneId
  const branchMap = new Map(branchScenes.map(s => [s.sceneId, s]));

  // Group scene IDs by their .md file so we update each file at most once
  const fileUpdates = new Map<string, { sceneId: string; fullLine: string }[]>();

  for (const sid of sceneIds) {
    const branchScene = branchMap.get(sid);
    if (!branchScene) continue;

    const existing = fileUpdates.get(branchScene.fileName) ?? [];
    existing.push({ sceneId: sid, fullLine: branchScene.fullLine });
    fileUpdates.set(branchScene.fileName, existing);
  }

  // Update .md files in main
  for (const [fileName, updates] of fileUpdates) {
    const mainFile = path.join(projectPath, fileName);
    if (!fs.existsSync(mainFile)) continue;

    let content = fs.readFileSync(mainFile, 'utf-8');

    for (const { sceneId, fullLine } of updates) {
      // Find the line in main that contains this sid and replace it
      const sidPattern = new RegExp(`^(\\d+\\.\\s+.*)<!--\\s*sid:${escapeRegex(sceneId)}\\s*-->.*$`, 'm');
      content = content.replace(sidPattern, fullLine);
    }

    // Atomic write
    const tmpPath = mainFile + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, mainFile);
  }

  // Update positions in timeline.json
  const timelinePath = path.join(projectPath, 'timeline.json');
  let timeline: Record<string, unknown> = { positions: {}, connections: {}, chapters: [] };
  if (fs.existsSync(timelinePath)) {
    timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
  }

  const positions = (timeline.positions ?? {}) as Record<string, number>;
  for (const sid of sceneIds) {
    if (sid in branchPositions) {
      positions[sid] = branchPositions[sid];
    }
  }
  timeline.positions = positions;

  const tmpTimeline = timelinePath + '.tmp';
  fs.writeFileSync(tmpTimeline, JSON.stringify(timeline, null, 2), 'utf-8');
  fs.renameSync(tmpTimeline, timelinePath);
}

/** Escape a string for safe use in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
