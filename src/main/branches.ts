/**
 * Draft branch operations — in-.braidr-file implementation.
 *
 * A branch is a row in the `branches` table plus a serialized snapshot of the
 * story tables in `branch_snapshots`. The ACTIVE branch always lives in the
 * normal tables; other branches live in their snapshots. "main" is a real row.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { BranchIndex, BranchInfo, BranchCompareData, BranchSceneDiff } from '../shared/types';
import { openDatabase, type BraidrDB, type SceneRow } from './database';

export function findMainBraidrFile(projectPath: string): string {
  const files = fs.readdirSync(projectPath).filter(f =>
    f.endsWith('.braidr') && fs.statSync(path.join(projectPath, f)).isFile()
  );
  if (files.length === 0) throw new Error(`No .braidr file in "${projectPath}"`);
  if (files.length > 1) throw new Error(`Multiple .braidr files in "${projectPath}": ${files.join(', ')}`);
  return path.join(projectPath, files[0]);
}

function db(projectPath: string): BraidrDB {
  const d = openDatabase(findMainBraidrFile(projectPath));
  d.ensureMainBranch();
  return d;
}

function toIndex(d: BraidrDB): BranchIndex {
  const rows = d.listBranchRows();
  const active = d.getActiveBranchRow();
  const branches: BranchInfo[] = rows
    .filter(r => r.name !== 'main')
    .map(r => ({
      name: r.name,
      description: r.description ?? undefined,
      createdAt: new Date(r.created_at).toISOString(),
      createdFrom: rows.find(x => x.id === r.created_from)?.name ?? 'main',
    }));
  return { branches, activeBranch: active && active.name !== 'main' ? active.name : null };
}

/** Persist current live tables into the active branch's snapshot. */
function persistActiveBranch(d: BraidrDB): void {
  const active = d.getActiveBranchRow() ?? d.ensureMainBranch();
  d.saveSnapshot(active.id, d.serializeBranchedTables());
}

export function listBranches(projectPath: string): BranchIndex {
  return toIndex(db(projectPath));
}

export async function createBranch(projectPath: string, name: string, description?: string): Promise<BranchIndex> {
  const d = db(projectPath);
  if (d.getBranchByName(name)) throw new Error(`Branch "${name}" already exists`);
  const active = d.getActiveBranchRow() ?? d.ensureMainBranch();
  persistActiveBranch(d);
  const id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  d.insertBranchRow(id, name, description ?? null, active.id);
  d.saveSnapshot(id, d.serializeBranchedTables()); // new branch starts as a copy of current state
  d.setActiveBranchRow(id);
  d.checkpoint();
  return toIndex(d);
}

export function switchBranch(projectPath: string, name: string | null): BranchIndex {
  const d = db(projectPath);
  const target = name === null ? d.ensureMainBranch() : d.getBranchByName(name);
  if (!target) throw new Error(`Branch "${name}" does not exist`);
  persistActiveBranch(d);
  const snap = d.getSnapshot(target.id);
  if (snap) d.restoreBranchedTables(snap);
  d.setActiveBranchRow(target.id);
  d.checkpoint();
  return toIndex(d);
}

export function deleteBranch(projectPath: string, name: string): BranchIndex {
  const d = db(projectPath);
  const target = d.getBranchByName(name);
  if (target) {
    const active = d.getActiveBranchRow();
    if (active?.id === target.id) {
      const main = d.ensureMainBranch();
      const snap = d.getSnapshot(main.id);
      if (snap) d.restoreBranchedTables(snap);
      d.setActiveBranchRow(main.id);
    }
    d.deleteBranchRow(target.id);
    d.checkpoint();
  }
  return toIndex(d);
}

/** Read a branch's scenes — from live tables if active, else from its snapshot. */
function branchScenes(d: BraidrDB, name: string | null): { scenes: SceneRow[]; drafts: Map<string, string> } {
  const branch = name === null ? d.ensureMainBranch() : d.getBranchByName(name);
  if (!branch) throw new Error(`Branch "${name ?? 'main'}" not found`);
  const active = d.getActiveBranchRow();
  if (active?.id === branch.id) {
    const scenes = d.getScenes() as SceneRow[];
    const drafts = new Map<string, string>();
    for (const s of scenes) { const dr = d.getDraft(s.id); if (dr) drafts.set(s.id, dr.content); }
    return { scenes, drafts };
  }
  const snap = JSON.parse(d.getSnapshot(branch.id) ?? '{"tables":{}}') as { tables: Record<string, any[]> };
  const scenes = (snap.tables.scenes ?? []) as SceneRow[];
  const drafts = new Map<string, string>();
  for (const dr of (snap.tables.scene_drafts ?? [])) drafts.set(dr.scene_id, dr.content);
  return { scenes, drafts };
}

export async function compareBranches(projectPath: string, leftBranch: string | null, rightBranch: string | null): Promise<BranchCompareData> {
  const d = db(projectPath);
  const left = branchScenes(d, leftBranch);
  const right = branchScenes(d, rightBranch);
  const leftMap = new Map(left.scenes.map(s => [s.id, s] as const));
  const rightMap = new Map(right.scenes.map(s => [s.id, s] as const));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const diffs: BranchSceneDiff[] = [];
  for (const sceneId of allIds) {
    const l = leftMap.get(sceneId);
    const r = rightMap.get(sceneId);
    const base = (l ?? r)!;
    const leftTitle = l?.title ?? '';
    const rightTitle = r?.title ?? '';
    const leftPosition = l?.timeline_position ?? null;
    const rightPosition = r?.timeline_position ?? null;
    const leftSceneNumber = l?.scene_number ?? null;
    const rightSceneNumber = r?.scene_number ?? null;
    let changeType: BranchSceneDiff['changeType'];
    if (!l) changeType = 'added';
    else if (!r) changeType = 'removed';
    else if (leftTitle !== rightTitle || leftPosition !== rightPosition || leftSceneNumber !== rightSceneNumber || (left.drafts.get(sceneId) ?? '') !== (right.drafts.get(sceneId) ?? '')) changeType = 'modified';
    else changeType = 'unchanged';
    diffs.push({
      sceneId, characterId: base.character_id, characterName: '',
      sceneNumber: base.scene_number,
      leftTitle, rightTitle, leftPosition, rightPosition, leftSceneNumber, rightSceneNumber,
      leftWordCount: l?.word_count ?? null, rightWordCount: r?.word_count ?? null,
      changed: changeType !== 'unchanged', changeType,
    });
  }
  return { leftName: leftBranch ?? 'main', rightName: rightBranch ?? 'main', scenes: diffs };
}

export async function mergeBranch(projectPath: string, branchName: string, sceneIds: string[]): Promise<void> {
  if (sceneIds.length === 0) return;
  const d = db(projectPath);
  const source = branchScenes(d, branchName);
  const main = d.ensureMainBranch();
  const active = d.getActiveBranchRow();
  const sourceMap = new Map(source.scenes.map(s => [s.id, s] as const));

  const applyToLive = active?.id === main.id;
  if (applyToLive) {
    for (const sid of sceneIds) {
      const s = sourceMap.get(sid);
      if (!s || !d.getScene(sid)) continue;
      d.updateScene(sid, {
        title: s.title, synopsis: s.synopsis,
        timelinePosition: s.timeline_position ?? undefined,
        sceneNumber: s.scene_number, sceneOrder: (s as any).scene_order,
        wordCount: s.word_count ?? undefined,
      });
      const draft = source.drafts.get(sid);
      if (draft !== undefined) d.upsertDraft(sid, draft);
    }
  } else {
    const snap = JSON.parse(d.getSnapshot(main.id) ?? '{"formatVersion":1,"tables":{}}');
    const mainScenes: any[] = snap.tables.scenes ?? [];
    const mainDrafts: any[] = snap.tables.scene_drafts ?? (snap.tables.scene_drafts = []);
    for (const sid of sceneIds) {
      const s = sourceMap.get(sid);
      const target = mainScenes.find(x => x.id === sid);
      if (!s || !target) continue;
      Object.assign(target, { title: s.title, synopsis: s.synopsis, timeline_position: s.timeline_position, scene_number: s.scene_number, scene_order: (s as any).scene_order, word_count: s.word_count });
      const draft = source.drafts.get(sid);
      if (draft !== undefined) {
        const dr = mainDrafts.find(x => x.scene_id === sid);
        if (dr) dr.content = draft;
      }
    }
    d.saveSnapshot(main.id, JSON.stringify(snap));
  }
  d.checkpoint();
}

export async function getBranchSceneDraft(projectPath: string, branchName: string | null, sceneId: string): Promise<string> {
  const d = db(projectPath);
  const { drafts } = branchScenes(d, branchName);
  return drafts.get(sceneId) ?? '';
}
