import type Database from 'better-sqlite3';
import { keyBetween } from '../shared/fractionalIndex';

// The mutation registry + executor (docs/data-model/TO-BE.md §3, §6).
//
// Every write to a .braidr file goes through a *named mutation*:
//   - runs in one transaction
//   - declares a deletion budget (max rows it may delete; almost always 0
//     or 1) — exceeding it throws and rolls the whole transaction back
//   - returns its inverse (for undo), which is appended to mutation_log
//     in the same transaction
//
// The one rule (TO-BE §3): a mutation may only touch rows it names. No
// mutation receives a collection and reconciles a table against it.
//
// Deletion accounting: mutations MUST issue DELETEs through ctx.delete()
// so the executor can count rows against the budget. Direct db DELETEs
// bypass the budget and are forbidden by convention (enforced in review;
// grep for 'DELETE FROM' outside ctx.delete when touching this file).

export interface MutationInverse {
  name: string;
  args: unknown;
}

export interface MutationContext {
  db: Database.Database;
  /** Run a DELETE statement, counting affected rows against the budget. */
  delete(sql: string, ...params: unknown[]): number;
}

export interface MutationDef<A> {
  name: string;
  /** Max rows this mutation may delete. Exceeding it rolls everything back. */
  deletionBudget: number;
  /** Apply the change; return the inverse mutation (or null if not undoable). */
  run(ctx: MutationContext, args: A): MutationInverse | null;
}

const registry = new Map<string, MutationDef<never>>();

export function registerMutation<A>(def: MutationDef<A>): void {
  if (registry.has(def.name)) {
    throw new Error(`Mutation already registered: ${def.name}`);
  }
  registry.set(def.name, def as MutationDef<never>);
}

export function listMutations(): string[] {
  return [...registry.keys()].sort();
}

export interface ExecuteResult {
  inverse: MutationInverse | null;
}

export function executeMutation(
  db: Database.Database,
  name: string,
  args: unknown
): ExecuteResult {
  const def = registry.get(name);
  if (!def) throw new Error(`Unknown mutation: ${name}`);

  let deleted = 0;
  const ctx: MutationContext = {
    db,
    delete(sql: string, ...params: unknown[]): number {
      const info = db.prepare(sql).run(...params);
      deleted += info.changes;
      if (deleted > def.deletionBudget) {
        throw new Error(
          `Mutation ${name} exceeded its deletion budget ` +
          `(deleted ${deleted}, budget ${def.deletionBudget}) — rolled back`
        );
      }
      return info.changes;
    },
  };

  const apply = db.transaction((): MutationInverse | null => {
    const inverse = def.run(ctx, args as never) ?? null;
    db.prepare(
      'INSERT INTO mutation_log (ts, name, args_json, inverse_json) VALUES (?, ?, ?, ?)'
    ).run(
      Date.now(),
      name,
      JSON.stringify(args ?? null),
      inverse ? JSON.stringify(inverse) : null
    );
    return inverse;
  });

  return { inverse: apply() };
}

// ---------------------------------------------------------------------------
// Built-in mutations. Append-only vocabulary; names are part of the file
// format (they appear in mutation_log), so never rename a shipped mutation.
// ---------------------------------------------------------------------------

registerMutation<{ sceneId: string; title: string }>({
  name: 'scene.rename',
  deletionBudget: 0,
  run(ctx, { sceneId, title }) {
    const row = ctx.db
      .prepare('SELECT title FROM scenes WHERE id = ?')
      .get(sceneId) as { title: string } | undefined;
    if (!row) throw new Error(`scene.rename: scene not found: ${sceneId}`);
    ctx.db
      .prepare('UPDATE scenes SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, Date.now(), sceneId);
    return { name: 'scene.rename', args: { sceneId, title: row.title } };
  },
});

function ensureSceneParentNode(
  db: Database.Database,
  characterId: string,
  plotPointId: string | null
): void {
  const now = Date.now();
  const insertNode = db.prepare(
    'INSERT OR IGNORE INTO structure_nodes (id, character_id, level_key, parent_id, order_key, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const charName = (db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId) as { name: string } | undefined)?.name ?? '';
  insertNode.run(`novel:${characterId}`, characterId, 'novel', null, keyBetween(null, null), charName, now);
  if (plotPointId !== null) {
    const pp = db.prepare('SELECT title, act_id FROM plot_points WHERE id = ?').get(plotPointId) as { title: string; act_id: string | null };
    const actNodeExists = pp.act_id !== null && db.prepare('SELECT 1 FROM structure_nodes WHERE id = ?').get(`act:${pp.act_id}`) !== undefined;
    const parent = actNodeExists ? `act:${pp.act_id}` : `novel:${characterId}`;
    insertNode.run(`pp:${plotPointId}`, characterId, 'plot_point', parent, keyBetween(null, null), pp.title, now);
  }
}

interface SceneMoveArgs {
  sceneId: string;
  /** Target section; null = the bullpen (TO-BE §1 invariant rule 2). */
  toPlotPointId: string | null;
  /** Place directly after this scene in the target; null = first in target. */
  afterSceneId: string | null;
  /** Inverse-only: braid position to restore when leaving the bullpen. */
  timelinePosition?: number | null;
}

interface SceneOrderRow {
  id: string;
  plot_point_id: string | null;
  scene_number: number;
  timeline_position: number | null;
}

// scene.move — the first SAVE_CHARACTER retirement verb (TO-BE §7 phase 3a).
//
// Dual-write during transition: the LEGACY ordering (per-character
// scene_number 1..N, normalized exactly like App.tsx does on load) is
// updated as the source of truth, and the substrate (parent_node_id +
// fractional outline_key) is kept coherent for the session. The substrate
// refresh on next open re-derives the same order from scene_number, so
// the two can never drift.
//
// Moving to the bullpen clears timeline_position in the same write —
// bullpen membership and braid position are one state (TO-BE §1 rule 2);
// the inverse restores it via the timelinePosition arg.
registerMutation<SceneMoveArgs>({
  name: 'scene.move',
  deletionBudget: 0,
  run(ctx, { sceneId, toPlotPointId, afterSceneId, timelinePosition }) {
    const db = ctx.db;
    const scene = db
      .prepare('SELECT id, character_id, plot_point_id, scene_number, timeline_position FROM scenes WHERE id = ?')
      .get(sceneId) as (SceneOrderRow & { character_id: string }) | undefined;
    if (!scene) throw new Error(`scene.move: scene not found: ${sceneId}`);

    if (toPlotPointId !== null) {
      const pp = db
        .prepare('SELECT character_id FROM plot_points WHERE id = ?')
        .get(toPlotPointId) as { character_id: string } | undefined;
      if (!pp) throw new Error(`scene.move: section not found: ${toPlotPointId}`);
      if (pp.character_id !== scene.character_id) {
        throw new Error("scene.move: cannot move a scene to another character's section");
      }
    }

    // the character's scenes in legacy outline order, without the moved one
    const ordered = (db
      .prepare('SELECT id, plot_point_id, scene_number, timeline_position FROM scenes WHERE character_id = ? ORDER BY scene_number, created_at')
      .all(scene.character_id) as SceneOrderRow[])
      .filter(s => s.id !== sceneId);

    // capture the inverse before anything changes: the old predecessor
    // within the old container, and the old braid position
    const oldSiblings = ordered.filter(s => s.plot_point_id === scene.plot_point_id);
    let oldPredecessor: string | null = null;
    for (const s of oldSiblings) {
      if (s.scene_number < scene.scene_number) oldPredecessor = s.id;
      else break;
    }

    // insertion point in the global sequence
    let insertAt: number;
    if (afterSceneId !== null) {
      const idx = ordered.findIndex(s => s.id === afterSceneId);
      if (idx < 0) throw new Error(`scene.move: afterScene not found: ${afterSceneId}`);
      if (ordered[idx].plot_point_id !== toPlotPointId) {
        throw new Error('scene.move: afterScene is not in the target section');
      }
      insertAt = idx + 1;
    } else {
      const firstInTarget = ordered.findIndex(s => s.plot_point_id === toPlotPointId);
      insertAt = firstInTarget >= 0 ? firstInTarget : ordered.length;
    }

    const movingToBullpen = toPlotPointId === null;
    const newTimeline = movingToBullpen
      ? null
      : (timelinePosition !== undefined ? timelinePosition : scene.timeline_position);

    // fractional key among the new siblings (substrate coherence)
    // Transition-era self-heal: a section created mid-session by a legacy
    // save path has no substrate node yet. Ensure the parent node exists
    // before pointing at it; the refresh on next open re-derives it anyway.
    ensureSceneParentNode(db, scene.character_id, toPlotPointId);

    const before = insertAt > 0 && ordered[insertAt - 1].plot_point_id === toPlotPointId ? ordered[insertAt - 1].id : null;
    const after = insertAt < ordered.length && ordered[insertAt].plot_point_id === toPlotPointId ? ordered[insertAt].id : null;
    const keyOf = (id: string | null): string | null =>
      id === null ? null : (db.prepare('SELECT outline_key FROM scenes WHERE id = ?').get(id) as { outline_key: string | null }).outline_key;
    const outlineKey = keyBetween(keyOf(before), keyOf(after));

    const parentNode = movingToBullpen ? `novel:${scene.character_id}` : `pp:${toPlotPointId}`;
    db.prepare(
      'UPDATE scenes SET plot_point_id = ?, timeline_position = ?, parent_node_id = ?, outline_key = ?, updated_at = ? WHERE id = ?'
    ).run(toPlotPointId, newTimeline, parentNode, outlineKey, Date.now(), sceneId);

    // legacy renumber: dense 1..N in the new order, exactly as App.tsx
    // normalizes on load. Only rows whose number changed are written.
    ordered.splice(insertAt, 0, { id: sceneId, plot_point_id: toPlotPointId, scene_number: 0, timeline_position: newTimeline });
    const renumber = db.prepare('UPDATE scenes SET scene_number = ? WHERE id = ?');
    ordered.forEach((s, i) => {
      const n = i + 1;
      if (s.id === sceneId || s.scene_number !== n) renumber.run(n, s.id);
    });

    return {
      name: 'scene.move',
      args: {
        sceneId,
        toPlotPointId: scene.plot_point_id,
        afterSceneId: oldPredecessor,
        timelinePosition: scene.timeline_position,
      } satisfies SceneMoveArgs,
    };
  },
});
