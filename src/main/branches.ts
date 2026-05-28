/**
 * Draft branch operations for Braidr — SQLite-based implementation.
 *
 * A "branch" is a full copy of the project's .braidr SQLite file at
 * `branches/<name>.braidr`. The branch index at `branches/index.json`
 * tracks which branches exist and which one (if any) is active.
 *
 * "main" is the implicit default — the .braidr file in the project root.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BranchIndex, BranchInfo, BranchCompareData, BranchSceneDiff } from '../shared/types';
import type { SceneRow, CharacterRow } from './database';

/* ── internal helpers ───────────────────────────────────────────────── */

function branchesDir(projectPath: string): string {
  return path.join(projectPath, 'branches');
}

function indexPath(projectPath: string): string {
  return path.join(branchesDir(projectPath), 'index.json');
}

function readIndex(projectPath: string): BranchIndex {
  const p = indexPath(projectPath);
  if (!fs.existsSync(p)) return { branches: [], activeBranch: null };
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeIndex(projectPath: string, index: BranchIndex): void {
  const dir = branchesDir(projectPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = indexPath(projectPath) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), 'utf-8');
  fs.renameSync(tmp, indexPath(projectPath));
}

async function getDb(filePath: string) {
  const mod = await import('./database');
  return mod.openDatabase(filePath);
}

/**
 * Find the main .braidr file in the project root directory.
 * Returns null if not found (should not happen in a valid project).
 */
export function findMainBraidrFile(projectPath: string): string | null {
  if (!fs.existsSync(projectPath)) return null;
  const files = fs.readdirSync(projectPath).filter(f =>
    f.endsWith('.braidr') && fs.statSync(path.join(projectPath, f)).isFile()
  );
  if (files.length === 0) return null;
  if (files.length > 1) throw new Error(`Multiple .braidr files found in "${projectPath}": ${files.join(', ')}`);
  return path.join(projectPath, files[0]);
}

/**
 * Return the .braidr path for a given branch name (null = main).
 */
export function getBranchBraidrPath(projectPath: string, branchName: string | null): string | null {
  if (branchName === null) return findMainBraidrFile(projectPath);
  return path.join(branchesDir(projectPath), `${branchName}.braidr`);
}

/* ── exported functions ─────────────────────────────────────────────── */

/** Read branch index, marking branches with no .braidr file as legacy. */
export function listBranches(projectPath: string): BranchIndex {
  const index = readIndex(projectPath);
  index.branches = index.branches.map(b => {
    if (b.legacy) return b;
    const braidrPath = path.join(branchesDir(projectPath), `${b.name}.braidr`);
    if (!fs.existsSync(braidrPath)) return { ...b, legacy: true };
    return b;
  });
  return index;
}

/**
 * Create a new branch by copying the current source .braidr file using
 * SQLite's online backup API (safe even with concurrent writers).
 */
export async function createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
  const index = readIndex(projectPath);

  if (index.branches.some(b => b.name === name)) {
    throw new Error(`Branch "${name}" already exists`);
  }

  const sourceLabel = index.activeBranch ?? 'main';
  const sourcePath = index.activeBranch
    ? path.join(branchesDir(projectPath), `${index.activeBranch}.braidr`)
    : findMainBraidrFile(projectPath);

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Cannot find source .braidr for branch "${sourceLabel}"`);
  }

  const dir = branchesDir(projectPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const destPath = path.join(dir, `${name}.braidr`);

  const sourceDb = await getDb(sourcePath);
  await sourceDb.backup(destPath);

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
  if (name !== null && !index.branches.some(b => b.name === name)) {
    throw new Error(`Branch "${name}" does not exist`);
  }
  index.activeBranch = name;
  writeIndex(projectPath, index);
  return index;
}

/** Delete a branch's .braidr file and remove it from the index. */
export function deleteBranch(projectPath: string, name: string): BranchIndex {
  const index = readIndex(projectPath);

  const braidrPath = path.join(branchesDir(projectPath), `${name}.braidr`);
  if (fs.existsSync(braidrPath)) fs.unlinkSync(braidrPath);
  for (const ext of ['-shm', '-wal']) {
    const aux = braidrPath + ext;
    if (fs.existsSync(aux)) fs.unlinkSync(aux);
  }
  const legacyDir = path.join(branchesDir(projectPath), name);
  if (fs.existsSync(legacyDir) && fs.statSync(legacyDir).isDirectory()) {
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }

  index.branches = index.branches.filter(b => b.name !== name);
  if (index.activeBranch === name) index.activeBranch = null;
  writeIndex(projectPath, index);
  return index;
}

/**
 * Compare two branches (null = main). Opens both .braidr files and diffs
 * scenes by ID. Detects: added, removed, title changes, order changes,
 * position changes, word count changes.
 */
export async function compareBranches(
  projectPath: string,
  leftBranch: string | null,
  rightBranch: string | null,
): Promise<BranchCompareData> {
  const leftPath = getBranchBraidrPath(projectPath, leftBranch);
  const rightPath = getBranchBraidrPath(projectPath, rightBranch);

  if (!leftPath || !fs.existsSync(leftPath)) {
    throw new Error(`Branch "${leftBranch ?? 'main'}" not found`);
  }
  if (!rightPath || !fs.existsSync(rightPath)) {
    throw new Error(`Branch "${rightBranch ?? 'main'}" not found`);
  }

  const leftDb = await getDb(leftPath);
  const rightDb = await getDb(rightPath);

  const leftScenes = leftDb.getScenes();
  const rightScenes = rightDb.getScenes();

  const leftChars = new Map(leftDb.getCharacters().map((c: CharacterRow) => [c.id, c.name] as const));
  const rightChars = new Map(rightDb.getCharacters().map((c: CharacterRow) => [c.id, c.name] as const));

  const leftMap = new Map(leftScenes.map((s: SceneRow) => [s.id, s] as const));
  const rightMap = new Map(rightScenes.map((s: SceneRow) => [s.id, s] as const));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);

  // Pre-fetch all drafts for efficient lookup
  const leftDraftMap = new Map<string, string>();
  const rightDraftMap = new Map<string, string>();
  for (const s of leftScenes) {
    const d = leftDb.getDraft(s.id);
    if (d) leftDraftMap.set(s.id, d.content);
  }
  for (const s of rightScenes) {
    const d = rightDb.getDraft(s.id);
    if (d) rightDraftMap.set(s.id, d.content);
  }

  const diffs: BranchSceneDiff[] = [];

  for (const sceneId of allIds) {
    const left = leftMap.get(sceneId);
    const right = rightMap.get(sceneId);

    const charId = (left ?? right)!.character_id;
    const charName = (leftChars.get(charId) ?? rightChars.get(charId) ?? 'Unknown');

    const leftTitle = left?.title ?? '';
    const rightTitle = right?.title ?? '';
    const leftPosition = left?.timeline_position ?? null;
    const rightPosition = right?.timeline_position ?? null;
    const leftSceneNumber = left?.scene_number ?? null;
    const rightSceneNumber = right?.scene_number ?? null;
    const leftWordCount = left?.word_count ?? null;
    const rightWordCount = right?.word_count ?? null;

    let changeType: BranchSceneDiff['changeType'];
    if (!left) {
      changeType = 'added';
    } else if (!right) {
      changeType = 'removed';
    } else if (
      leftTitle !== rightTitle ||
      leftPosition !== rightPosition ||
      leftSceneNumber !== rightSceneNumber ||
      (leftDraftMap.get(sceneId) ?? '') !== (rightDraftMap.get(sceneId) ?? '')
    ) {
      changeType = 'modified';
    } else {
      changeType = 'unchanged';
    }

    diffs.push({
      sceneId,
      characterId: charId,
      characterName: charName,
      sceneNumber: (left ?? right)!.scene_number,
      leftTitle,
      rightTitle,
      leftPosition,
      rightPosition,
      leftSceneNumber,
      rightSceneNumber,
      leftWordCount,
      rightWordCount,
      changed: changeType !== 'unchanged',
      changeType,
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
 * Only updates scenes that exist in both databases (no cross-DB inserts).
 */
export async function mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void> {
  if (sceneIds.length === 0) return;

  const mainPath = findMainBraidrFile(projectPath);
  const branchPath = getBranchBraidrPath(projectPath, branchName);

  if (!mainPath || !fs.existsSync(mainPath)) {
    throw new Error('Main .braidr file not found');
  }
  if (!branchPath || !fs.existsSync(branchPath)) {
    throw new Error(`Branch "${branchName}" not found`);
  }

  const mainDb = await getDb(mainPath);
  const branchDb = await getDb(branchPath);

  for (const sceneId of sceneIds) {
    const branchScene = branchDb.getScene(sceneId) as any;
    if (!branchScene) continue;

    const mainScene = mainDb.getScene(sceneId);
    if (!mainScene) continue;

    mainDb.updateScene(sceneId, {
      title: branchScene.title,
      synopsis: branchScene.synopsis,
      timelinePosition: branchScene.timeline_position ?? undefined,
      sceneNumber: branchScene.scene_number,
      sceneOrder: branchScene.scene_order,
      wordCount: branchScene.word_count ?? undefined,
    });

    const branchDraft = branchDb.getDraft(sceneId);
    if (branchDraft) {
      mainDb.upsertDraft(sceneId, branchDraft.content);
    }
  }
}

/**
 * Read the draft content for a single scene from a branch (null = main).
 * Returns empty string if no draft exists.
 */
export async function getBranchSceneDraft(
  projectPath: string,
  branchName: string | null,
  sceneId: string,
): Promise<string> {
  const braidrPath = getBranchBraidrPath(projectPath, branchName);
  if (!braidrPath || !fs.existsSync(braidrPath)) return '';
  const db = await getDb(braidrPath);
  return db.getDraft(sceneId)?.content ?? '';
}
