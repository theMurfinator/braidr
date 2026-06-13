import type Database from 'better-sqlite3';
import { keyBetween, seedKeys } from '../shared/fractionalIndex';

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

interface SceneEditArgs {
  sceneId: string;
  title: string;
  /** Outline body text; the legacy column is scenes.synopsis. */
  content: string;
  notes: string[];
}

// scene.edit — inline outline edits (title/body/sub-notes) as one mutation,
// retiring the SAVE_CHARACTER trigger behind every view's scene editor
// (TO-BE §7 phase 3b). The notes list is a value replace of the named
// scene's wholly-owned scene_notes rows — the list IS the new value, like
// a JSON column, not a reconciliation of independent entities, so it stays
// within the "only touch rows you name" rule. The budget is sized for one
// scene's notes (scoped DELETE by scene_id); a missing WHERE clause on a
// real project would still blow it.
registerMutation<SceneEditArgs>({
  name: 'scene.edit',
  deletionBudget: 100,
  run(ctx, { sceneId, title, content, notes }) {
    const db = ctx.db;
    const row = db
      .prepare('SELECT title, synopsis FROM scenes WHERE id = ?')
      .get(sceneId) as { title: string; synopsis: string } | undefined;
    if (!row) throw new Error(`scene.edit: scene not found: ${sceneId}`);
    const oldNotes = (db
      .prepare('SELECT content FROM scene_notes WHERE scene_id = ? ORDER BY display_order')
      .all(sceneId) as { content: string }[]).map(n => n.content);

    db.prepare('UPDATE scenes SET title = ?, synopsis = ?, updated_at = ? WHERE id = ?')
      .run(title, content, Date.now(), sceneId);
    ctx.delete('DELETE FROM scene_notes WHERE scene_id = ?', sceneId);
    const insert = db.prepare(
      'INSERT INTO scene_notes (id, scene_id, content, display_order) VALUES (?, ?, ?, ?)'
    );
    notes.forEach((c, i) => insert.run(newId(), sceneId, c, i));

    return {
      name: 'scene.edit',
      args: { sceneId, title: row.title, content: row.synopsis, notes: oldNotes } satisfies SceneEditArgs,
    };
  },
});

function newId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

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

interface NodeMoveArgs {
  /** Substrate node id ("pp:<plotPointId>"); only plot_point nodes so far. */
  nodeId: string;
  /** Place directly after this sibling node; null = first among siblings. */
  afterNodeId: string | null;
}

// node.move — section (plot point) reorder as one mutation (TO-BE §3).
// Dual-write: legacy plot_points.display_order renumbered dense 0..N-1 per
// character (authoritative; matches the renderer's arrayMove + index
// reassignment), substrate order_key kept coherent for the session.
// Other levels (arc, chapter) join when their reorder paths are wired.
registerMutation<NodeMoveArgs>({
  name: 'node.move',
  deletionBudget: 0,
  run(ctx, { nodeId, afterNodeId }) {
    const db = ctx.db;
    if (!nodeId.startsWith('pp:')) {
      throw new Error(`node.move: only plot_point nodes are supported so far: ${nodeId}`);
    }
    const ppId = nodeId.slice(3);
    const pp = db
      .prepare('SELECT id, character_id, display_order FROM plot_points WHERE id = ?')
      .get(ppId) as { id: string; character_id: string; display_order: number } | undefined;
    if (!pp) throw new Error(`node.move: section not found: ${ppId}`);

    const ordered = (db
      .prepare('SELECT id, display_order FROM plot_points WHERE character_id = ? ORDER BY display_order, created_at')
      .all(pp.character_id) as { id: string; display_order: number }[])
      .filter(s => s.id !== ppId);

    // inverse: the old predecessor among the character's sections
    let oldPredecessor: string | null = null;
    for (const s of ordered) {
      if (s.display_order < pp.display_order) oldPredecessor = s.id;
      else break;
    }

    let insertAt: number;
    if (afterNodeId !== null) {
      if (!afterNodeId.startsWith('pp:')) {
        throw new Error(`node.move: afterNode must be a plot_point node: ${afterNodeId}`);
      }
      const afterPpId = afterNodeId.slice(3);
      const idx = ordered.findIndex(s => s.id === afterPpId);
      if (idx < 0) throw new Error(`node.move: afterNode not found among siblings: ${afterNodeId}`);
      insertAt = idx + 1;
    } else {
      insertAt = 0;
    }

    ensureSceneParentNode(db, pp.character_id, ppId);
    const keyOf = (id: string | null): string | null => {
      if (id === null) return null;
      const row = db.prepare('SELECT order_key FROM structure_nodes WHERE id = ?').get(`pp:${id}`) as { order_key: string } | undefined;
      return row?.order_key ?? null;
    };
    const beforeId = insertAt > 0 ? ordered[insertAt - 1].id : null;
    const afterId = insertAt < ordered.length ? ordered[insertAt].id : null;
    let orderKey: string;
    try {
      orderKey = keyBetween(keyOf(beforeId), keyOf(afterId));
    } catch {
      // neighbors missing substrate nodes mid-session: any key is fine,
      // the refresh re-derives from display_order on next open
      orderKey = keyBetween(null, null);
    }
    db.prepare('UPDATE structure_nodes SET order_key = ? WHERE id = ?').run(orderKey, nodeId);

    ordered.splice(insertAt, 0, { id: ppId, display_order: -1 });
    const renumber = db.prepare('UPDATE plot_points SET display_order = ? WHERE id = ?');
    ordered.forEach((s, i) => {
      if (s.id === ppId || s.display_order !== i) renumber.run(i, s.id);
    });

    return {
      name: 'node.move',
      args: {
        nodeId,
        afterNodeId: oldPredecessor === null ? null : `pp:${oldPredecessor}`,
      } satisfies NodeMoveArgs,
    };
  },
});

// ---------------------------------------------------------------------------
// Node verbs — sections (plot points), TO-BE §7 phase 3c.
// ---------------------------------------------------------------------------

interface NodeEditArgs {
  /** 'pp:<plotPointId>' */
  nodeId: string;
  title: string;
  description: string;
  expectedSceneCount: number | null;
}

// node.edit — update a section's title/description/expectedSceneCount.
// Dual-write: legacy plot_points row + substrate structure_nodes title.
registerMutation<NodeEditArgs>({
  name: 'node.edit',
  deletionBudget: 0,
  run(ctx, { nodeId, title, description, expectedSceneCount }) {
    const db = ctx.db;
    if (!nodeId.startsWith('pp:')) {
      throw new Error(`node.edit: only plot_point nodes supported: ${nodeId}`);
    }
    const ppId = nodeId.slice(3);
    const row = db
      .prepare('SELECT title, description, expected_scene_count FROM plot_points WHERE id = ?')
      .get(ppId) as { title: string; description: string | null; expected_scene_count: number | null } | undefined;
    if (!row) throw new Error(`node.edit: section not found: ${ppId}`);

    db.prepare('UPDATE plot_points SET title = ?, description = ?, expected_scene_count = ? WHERE id = ?')
      .run(title, description, expectedSceneCount, ppId);
    db.prepare('UPDATE structure_nodes SET title = ? WHERE id = ?').run(title, nodeId);

    return {
      name: 'node.edit',
      args: {
        nodeId,
        title: row.title,
        description: row.description ?? '',
        expectedSceneCount: row.expected_scene_count,
      } satisfies NodeEditArgs,
    };
  },
});

interface NodeCreateArgs {
  id: string;
  characterId: string;
  title: string;
}

// node.create — add a new section at the end of a character's outline.
// Dual-write: insert into plot_points + structure_nodes.
registerMutation<NodeCreateArgs>({
  name: 'node.create',
  deletionBudget: 0,
  run(ctx, { id, characterId, title }) {
    const db = ctx.db;
    const now = Date.now();
    const maxRow = db
      .prepare('SELECT MAX(display_order) as m FROM plot_points WHERE character_id = ?')
      .get(characterId) as { m: number | null };
    const displayOrder = (maxRow.m ?? -1) + 1;

    db.prepare(`
      INSERT INTO plot_points
        (id, character_id, title, description, expected_scene_count, display_order, in_bullpen, synopsis, created_at)
      VALUES (?, ?, ?, '', NULL, ?, 0, '', ?)
    `).run(id, characterId, title, displayOrder, now);

    const novelNode = `novel:${characterId}`;
    ensureSceneParentNode(db, characterId, null);
    const lastSibling = db
      .prepare(
        `SELECT order_key FROM structure_nodes
         WHERE character_id = ? AND level_key = 'plot_point' AND parent_id = ?
         ORDER BY order_key DESC LIMIT 1`
      )
      .get(characterId, novelNode) as { order_key: string } | undefined;
    const orderKey = keyBetween(lastSibling?.order_key ?? null, null);
    db.prepare(
      'INSERT OR IGNORE INTO structure_nodes (id, character_id, level_key, parent_id, order_key, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(`pp:${id}`, characterId, 'plot_point', novelNode, orderKey, title, now);

    return { name: 'node.delete', args: { nodeId: `pp:${id}` } };
  },
});

interface NodeDeleteArgs {
  /** 'pp:<plotPointId>' */
  nodeId: string;
}

// node.delete — remove a section and send its scenes to the character bullpen.
// Dual-write: hard-delete plot_point (legacy) + structure_node; clear
// plot_point_id / timeline_position on affected scenes.
// Budget 2: one plot_points row + one structure_nodes row.
registerMutation<NodeDeleteArgs>({
  name: 'node.delete',
  deletionBudget: 2,
  run(ctx, { nodeId }) {
    const db = ctx.db;
    if (!nodeId.startsWith('pp:')) {
      throw new Error(`node.delete: only plot_point nodes supported: ${nodeId}`);
    }
    const ppId = nodeId.slice(3);
    const pp = db
      .prepare('SELECT id, character_id FROM plot_points WHERE id = ?')
      .get(ppId) as { id: string; character_id: string } | undefined;
    if (!pp) throw new Error(`node.delete: section not found: ${ppId}`);

    const now = Date.now();

    // Move affected scenes to bullpen: NULL parent_node_id (same as ON DELETE SET NULL;
    // substrate rebuilds on next open).
    db.prepare(
      'UPDATE scenes SET plot_point_id = NULL, timeline_position = NULL, parent_node_id = NULL, updated_at = ? WHERE plot_point_id = ? AND deleted_at IS NULL'
    ).run(now, ppId);

    ctx.delete('DELETE FROM plot_points WHERE id = ?', ppId);
    ctx.delete('DELETE FROM structure_nodes WHERE id = ?', nodeId);

    // Renumber remaining sections: dense 0..N-1
    const remaining = db
      .prepare('SELECT id FROM plot_points WHERE character_id = ? ORDER BY display_order, created_at')
      .all(pp.character_id) as { id: string }[];
    const renumber = db.prepare('UPDATE plot_points SET display_order = ? WHERE id = ?');
    remaining.forEach((s, i) => renumber.run(i, s.id));

    return null;
  },
});

// ---------------------------------------------------------------------------
// Scene create/delete/restore — TO-BE §7 phase 3c (soft delete via §6).
// ---------------------------------------------------------------------------

interface SceneCreateArgs {
  id: string;
  characterId: string;
  /** Section assignment; null = bullpen. */
  plotPointId: string | null;
  /** Global outline predecessor; null = append at end of character's outline. */
  afterSceneId: string | null;
  title: string;
  /** Stored in scenes.synopsis (legacy column name). */
  content: string;
  tags: string[];
}

// scene.create — insert a new scene into the character's outline.
// Dual-write: INSERT into scenes + scene_drafts; fractional outline_key for
// substrate coherence. Tags resolved from the tags master table (upserted as
// 'things' category if new, matching the legacy saveCharacterOutline path).
registerMutation<SceneCreateArgs>({
  name: 'scene.create',
  deletionBudget: 0,
  run(ctx, { id, characterId, plotPointId, afterSceneId, title, content, tags }) {
    const db = ctx.db;
    const now = Date.now();

    const ordered = db
      .prepare(
        'SELECT id, plot_point_id, scene_number, outline_key FROM scenes WHERE character_id = ? AND deleted_at IS NULL ORDER BY scene_number, created_at'
      )
      .all(characterId) as (SceneOrderRow & { outline_key: string | null })[];

    let insertAt: number;
    if (afterSceneId !== null) {
      const idx = ordered.findIndex(s => s.id === afterSceneId);
      if (idx < 0) throw new Error(`scene.create: afterScene not found: ${afterSceneId}`);
      insertAt = idx + 1;
    } else {
      insertAt = ordered.length;
    }

    ensureSceneParentNode(db, characterId, plotPointId);
    let before: string | null = null;
    for (let i = insertAt - 1; i >= 0; i--) {
      if (ordered[i].plot_point_id === plotPointId) { before = ordered[i].id; break; }
    }
    let after: string | null = null;
    for (let i = insertAt; i < ordered.length; i++) {
      if (ordered[i].plot_point_id === plotPointId) { after = ordered[i].id; break; }
    }
    const keyOf = (sid: string | null): string | null =>
      sid === null ? null : (ordered.find(s => s.id === sid)?.outline_key ?? null);
    const outlineKey = keyBetween(keyOf(before), keyOf(after));
    const parentNode = plotPointId ? `pp:${plotPointId}` : `novel:${characterId}`;

    db.prepare(`
      INSERT INTO scenes
        (id, character_id, plot_point_id, title, synopsis, scene_number, timeline_position, is_highlighted, word_count, created_at, updated_at, parent_node_id, outline_key)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?, ?)
    `).run(id, characterId, plotPointId, title, content, ordered.length + 1, now, now, parentNode, outlineKey);

    db.prepare('INSERT INTO scene_drafts (id, scene_id, content, updated_at) VALUES (?, ?, ?, ?)')
      .run(newId(), id, '', now);

    if (tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id, name, category) VALUES (?, ?, ?)');
      const insertSceneTag = db.prepare('INSERT OR IGNORE INTO scene_tags (scene_id, tag_id) VALUES (?, ?)');
      for (const tagName of tags) {
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: string } | undefined;
        const tagId = existing ? existing.id : (() => {
          const tid = newId();
          insertTag.run(tid, tagName, 'things');
          return tid;
        })();
        insertSceneTag.run(id, tagId);
      }
    }

    // Splice into global outline and dense-renumber
    ordered.splice(insertAt, 0, { id, plot_point_id: plotPointId, scene_number: 0, timeline_position: null, outline_key: outlineKey });
    const renumber = db.prepare('UPDATE scenes SET scene_number = ? WHERE id = ?');
    ordered.forEach((s, i) => {
      const n = i + 1;
      if (s.id === id || s.scene_number !== n) renumber.run(n, s.id);
    });

    return { name: 'scene.delete', args: { sceneId: id } };
  },
});

interface SceneDeleteArgs {
  sceneId: string;
}

interface SceneRestoreArgs {
  sceneId: string;
  /** Renderer-computed: original section if still present, else first section or null. */
  toPlotPointId: string | null;
}

// scene.delete — soft-delete a scene (TO-BE §6: set deleted_at, renumber active).
// The legacy archived_scenes row is still written by saveTimelineData (which
// callers keep until SAVE_TIMELINE is retired in Phase 4).
registerMutation<SceneDeleteArgs>({
  name: 'scene.delete',
  deletionBudget: 0,
  run(ctx, { sceneId }) {
    const db = ctx.db;
    const scene = db
      .prepare('SELECT id, character_id, plot_point_id, scene_number FROM scenes WHERE id = ? AND deleted_at IS NULL')
      .get(sceneId) as { id: string; character_id: string; plot_point_id: string | null; scene_number: number } | undefined;
    if (!scene) throw new Error(`scene.delete: scene not found or already deleted: ${sceneId}`);

    db.prepare('UPDATE scenes SET deleted_at = ? WHERE id = ?').run(Date.now(), sceneId);

    // Renumber remaining active scenes for this character
    const remaining = db
      .prepare('SELECT id, scene_number FROM scenes WHERE character_id = ? AND deleted_at IS NULL ORDER BY scene_number, created_at')
      .all(scene.character_id) as { id: string; scene_number: number }[];
    const renumber = db.prepare('UPDATE scenes SET scene_number = ? WHERE id = ?');
    remaining.forEach((s, i) => {
      const n = i + 1;
      if (s.scene_number !== n) renumber.run(n, s.id);
    });

    return {
      name: 'scene.restore',
      args: { sceneId, toPlotPointId: scene.plot_point_id } satisfies SceneRestoreArgs,
    };
  },
});

// scene.restore — un-delete a scene, appending it at the end of the outline.
registerMutation<SceneRestoreArgs>({
  name: 'scene.restore',
  deletionBudget: 0,
  run(ctx, { sceneId, toPlotPointId }) {
    const db = ctx.db;
    const scene = db
      .prepare('SELECT id, character_id FROM scenes WHERE id = ? AND deleted_at IS NOT NULL')
      .get(sceneId) as { id: string; character_id: string } | undefined;
    if (!scene) throw new Error(`scene.restore: scene not found or not deleted: ${sceneId}`);

    const maxRow = db
      .prepare('SELECT MAX(scene_number) as m FROM scenes WHERE character_id = ? AND deleted_at IS NULL')
      .get(scene.character_id) as { m: number | null };
    const newSceneNumber = (maxRow.m ?? 0) + 1;
    // parent_node_id left NULL; substrate rebuilds from legacy on next open.
    db.prepare(
      'UPDATE scenes SET deleted_at = NULL, scene_number = ?, plot_point_id = ?, parent_node_id = NULL, updated_at = ? WHERE id = ?'
    ).run(newSceneNumber, toPlotPointId, Date.now(), sceneId);

    return { name: 'scene.delete', args: { sceneId } satisfies SceneDeleteArgs };
  },
});

// ---------------------------------------------------------------------------
// Section scene reorder — within-section sort (redistributes the fixed set
// of scene_numbers already assigned to this section; does NOT splice globally).
// This diverges from scene.move's splice-renumber when section scenes
// interleave with other characters' scenes in global numbering.
// ---------------------------------------------------------------------------

interface SectionReorderArgs {
  sectionId: string;
  /** New order of scene IDs within the section. */
  orderedIds: string[];
}

registerMutation<SectionReorderArgs>({
  name: 'section.reorderScenes',
  deletionBudget: 0,
  run(ctx, { sectionId, orderedIds }) {
    const db = ctx.db;
    const pp = db
      .prepare('SELECT character_id FROM plot_points WHERE id = ?')
      .get(sectionId) as { character_id: string } | undefined;
    if (!pp) throw new Error(`section.reorderScenes: section not found: ${sectionId}`);

    const sectionScenes = (db
      .prepare('SELECT id, scene_number FROM scenes WHERE plot_point_id = ? AND deleted_at IS NULL ORDER BY scene_number, created_at')
      .all(sectionId) as { id: string; scene_number: number }[]);
    const oldOrdered = sectionScenes.map(s => s.id);
    const sectionNumbers = sectionScenes.map(s => s.scene_number);

    if (orderedIds.length !== sectionScenes.length) {
      throw new Error(
        `section.reorderScenes: length mismatch (got ${orderedIds.length}, expected ${sectionScenes.length})`
      );
    }

    // Redistribute the fixed pool of scene_numbers across the new ordering.
    // Substrate: generate fresh keys for the section (authoritative order is
    // scene_number; substrate is refreshed on next open anyway).
    const freshKeys = seedKeys(orderedIds.length);
    const apply = db.prepare('UPDATE scenes SET scene_number = ?, outline_key = ? WHERE id = ?');
    orderedIds.forEach((sceneId, newPos) => {
      apply.run(sectionNumbers[newPos], freshKeys[newPos], sceneId);
    });

    return { name: 'section.reorderScenes', args: { sectionId, orderedIds: oldOrdered } satisfies SectionReorderArgs };
  },
});

interface SceneMoveArgs {
  sceneId: string;
  /** Target section; null = the bullpen (TO-BE §1 invariant rule 2). */
  toPlotPointId: string | null;
  /**
   * Place directly after this scene in the character's global outline
   * sequence (legacy scene_number order interleaves sections and bullpen);
   * null = the very first position. Section membership comes solely from
   * toPlotPointId.
   */
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

    // capture the inverse before anything changes: the old global
    // predecessor, and the old braid position
    let oldPredecessor: string | null = null;
    for (const s of ordered) {
      if (s.scene_number < scene.scene_number) oldPredecessor = s.id;
      else break;
    }

    // insertion point in the global sequence
    let insertAt: number;
    if (afterSceneId !== null) {
      const idx = ordered.findIndex(s => s.id === afterSceneId);
      if (idx < 0) throw new Error(`scene.move: afterScene not found in this character's outline: ${afterSceneId}`);
      insertAt = idx + 1;
    } else {
      insertAt = 0;
    }

    const movingToBullpen = toPlotPointId === null;
    const newTimeline = movingToBullpen
      ? null
      : (timelinePosition !== undefined ? timelinePosition : scene.timeline_position);

    // Transition-era self-heal: a section created mid-session by a legacy
    // save path has no substrate node yet. Ensure the parent node exists
    // before pointing at it; the refresh on next open re-derives it anyway.
    ensureSceneParentNode(db, scene.character_id, toPlotPointId);

    // fractional key among the nearest same-section siblings (substrate coherence)
    let before: string | null = null;
    for (let i = insertAt - 1; i >= 0; i--) {
      if (ordered[i].plot_point_id === toPlotPointId) { before = ordered[i].id; break; }
    }
    let after: string | null = null;
    for (let i = insertAt; i < ordered.length; i++) {
      if (ordered[i].plot_point_id === toPlotPointId) { after = ordered[i].id; break; }
    }
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

// ---------------------------------------------------------------------------
// character.rename — rename a character (TO-BE §7 phase 3b)
// ---------------------------------------------------------------------------

interface CharacterRenameArgs {
  characterId: string;
  name: string;
}

registerMutation<CharacterRenameArgs>({
  name: 'character.rename',
  deletionBudget: 0,
  run(ctx, { characterId, name }) {
    const db = ctx.db;
    const row = db
      .prepare('SELECT name FROM characters WHERE id = ?')
      .get(characterId) as { name: string } | undefined;
    if (!row) throw new Error(`character.rename: character not found: ${characterId}`);

    db.prepare('UPDATE characters SET name = ? WHERE id = ?').run(name, characterId);
    db.prepare('UPDATE structure_nodes SET title = ? WHERE id = ?').run(name, `novel:${characterId}`);

    return { name: 'character.rename', args: { characterId, name: row.name } satisfies CharacterRenameArgs };
  },
});

// ---------------------------------------------------------------------------
// scene.setTags — replace a scene's full tag set (TO-BE §7 phase 3b)
// ---------------------------------------------------------------------------

interface SceneSetTagsArgs {
  sceneId: string;
  tags: string[];
}

registerMutation<SceneSetTagsArgs>({
  name: 'scene.setTags',
  deletionBudget: 50,
  run(ctx, { sceneId, tags }) {
    const db = ctx.db;
    const scene = db
      .prepare('SELECT id FROM scenes WHERE id = ? AND deleted_at IS NULL')
      .get(sceneId) as { id: string } | undefined;
    if (!scene) throw new Error(`scene.setTags: scene not found: ${sceneId}`);

    const oldTags = (db
      .prepare('SELECT t.name FROM tags t JOIN scene_tags st ON st.tag_id = t.id WHERE st.scene_id = ?')
      .all(sceneId) as { name: string }[]).map(r => r.name);

    ctx.delete('DELETE FROM scene_tags WHERE scene_id = ?', sceneId);

    if (tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id, name, category) VALUES (?, ?, ?)');
      const insertSceneTag = db.prepare('INSERT OR IGNORE INTO scene_tags (scene_id, tag_id) VALUES (?, ?)');
      for (const tagName of tags) {
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: string } | undefined;
        const tagId = existing ? existing.id : (() => {
          const tid = newId();
          insertTag.run(tid, tagName, 'things');
          return tid;
        })();
        insertSceneTag.run(sceneId, tagId);
      }
    }

    return { name: 'scene.setTags', args: { sceneId, tags: oldTags } satisfies SceneSetTagsArgs };
  },
});

// ---------------------------------------------------------------------------
// Task verbs — Phase 4a, includes §4b subtask schema from day one.
// parent_task_id + order_key added in migration v7.
// ---------------------------------------------------------------------------

interface TaskCreateArgs {
  id: string;
  title: string;
  parentTaskId: string | null;
  /** Fractional key among siblings; null = append at end. */
  orderKey: string | null;
  displayOrder: number;
}

registerMutation<TaskCreateArgs>({
  name: 'task.create',
  deletionBudget: 0,
  run(ctx, { id, title, parentTaskId, orderKey, displayOrder }) {
    const db = ctx.db;
    const now = Date.now();
    db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, display_order, order_key,
        parent_task_id, created_at, updated_at)
      VALUES (?, ?, NULL, 'open', 'none', ?, ?, ?, ?, ?)
    `).run(id, title, displayOrder, orderKey, parentTaskId, now, now);

    return { name: 'task.softDelete', args: { taskId: id } };
  },
});

interface TaskSetFieldsArgs {
  taskId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  sceneId: string | null;
  timeEstimate: number | null;
  dueDate: number | null;
  tags: string[];
  characterIds: string[];
  customFields: Record<string, unknown>;
}

interface TaskSetFieldsInverseArgs extends TaskSetFieldsArgs {
  _oldEntries: Array<{ id: string; startedAt: number; duration: number; description: string | null }>;
}

// budget=50: tags DELETE (1) + per-tag inserts (0), character links DELETE (1), custom fields DELETE (1)
registerMutation<TaskSetFieldsArgs>({
  name: 'task.setFields',
  deletionBudget: 50,
  run(ctx, { taskId, title, description, status, priority, sceneId, timeEstimate, dueDate, tags, characterIds, customFields }) {
    const db = ctx.db;
    type TaskRow = { title: string; description: string | null; status: string; priority: string; scene_id: string | null; time_estimate: number | null; due_date: number | null };
    const old = db.prepare('SELECT title, description, status, priority, scene_id, time_estimate, due_date FROM tasks WHERE id = ? AND deleted_at IS NULL').get(taskId) as TaskRow | undefined;
    if (!old) throw new Error(`task.setFields: task not found: ${taskId}`);

    const oldTags = (db.prepare('SELECT t.name FROM tags t JOIN task_tags tt ON tt.tag_id = t.id WHERE tt.task_id = ?').all(taskId) as { name: string }[]).map(r => r.name);
    const oldChars = (db.prepare('SELECT character_id FROM task_character_links WHERE task_id = ?').all(taskId) as { character_id: string }[]).map(r => r.character_id);
    const oldCustom = (db.prepare('SELECT field_def_id, value FROM task_custom_field_values WHERE task_id = ?').all(taskId) as { field_def_id: string; value: string }[]);

    db.prepare('UPDATE tasks SET title=?, description=?, status=?, priority=?, scene_id=?, time_estimate=?, due_date=?, updated_at=? WHERE id=?')
      .run(title, description, status, priority, sceneId, timeEstimate, dueDate, Date.now(), taskId);

    ctx.delete('DELETE FROM task_tags WHERE task_id = ?', taskId);
    if (tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id, name, category) VALUES (?, ?, ?)');
      const insertTaskTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
      for (const name of tags) {
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
        const tagId = existing ? existing.id : (() => { const tid = newId(); insertTag.run(tid, name, 'things'); return tid; })();
        insertTaskTag.run(taskId, tagId);
      }
    }

    ctx.delete('DELETE FROM task_character_links WHERE task_id = ?', taskId);
    const insertChar = db.prepare('INSERT OR IGNORE INTO task_character_links (task_id, character_id) VALUES (?, ?)');
    for (const cid of characterIds) insertChar.run(taskId, cid);

    ctx.delete('DELETE FROM task_custom_field_values WHERE task_id = ?', taskId);
    const insertCF = db.prepare('INSERT INTO task_custom_field_values (task_id, field_def_id, value) VALUES (?, ?, ?)');
    for (const [fieldId, val] of Object.entries(customFields)) insertCF.run(taskId, fieldId, JSON.stringify(val));

    const oldCustomFields: Record<string, unknown> = {};
    for (const { field_def_id, value } of oldCustom) oldCustomFields[field_def_id] = JSON.parse(value);

    return {
      name: 'task.setFields',
      args: {
        taskId, title: old.title, description: old.description,
        status: old.status, priority: old.priority, sceneId: old.scene_id,
        timeEstimate: old.time_estimate, dueDate: old.due_date,
        tags: oldTags, characterIds: oldChars, customFields: oldCustomFields,
      } satisfies TaskSetFieldsArgs,
    };
  },
});

interface TaskSoftDeleteArgs {
  taskId: string;
}

registerMutation<TaskSoftDeleteArgs>({
  name: 'task.softDelete',
  deletionBudget: 0,
  run(ctx, { taskId }) {
    const db = ctx.db;
    const row = db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(taskId) as { id: string } | undefined;
    if (!row) throw new Error(`task.softDelete: task not found: ${taskId}`);
    db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), taskId);
    return { name: 'task.restore', args: { taskId } };
  },
});

registerMutation<TaskSoftDeleteArgs>({
  name: 'task.restore',
  deletionBudget: 0,
  run(ctx, { taskId }) {
    const db = ctx.db;
    const row = db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NOT NULL').get(taskId) as { id: string } | undefined;
    if (!row) throw new Error(`task.restore: task not found or not deleted: ${taskId}`);
    db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), taskId);
    return { name: 'task.softDelete', args: { taskId } };
  },
});

interface TaskSetTimeEntriesArgs {
  taskId: string;
  entries: Array<{ id: string; startedAt: number; duration: number; description: string | null }>;
}

registerMutation<TaskSetTimeEntriesArgs>({
  name: 'task.setTimeEntries',
  deletionBudget: 100,
  run(ctx, { taskId, entries }) {
    const db = ctx.db;
    const row = db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(taskId) as { id: string } | undefined;
    if (!row) throw new Error(`task.setTimeEntries: task not found: ${taskId}`);

    const oldEntries = (db.prepare('SELECT id, started_at, duration, description FROM time_entries WHERE task_id = ?').all(taskId) as Array<{ id: string; started_at: number; duration: number; description: string | null }>)
      .map(r => ({ id: r.id, startedAt: r.started_at, duration: r.duration, description: r.description }));

    ctx.delete('DELETE FROM time_entries WHERE task_id = ?', taskId);
    const insert = db.prepare('INSERT INTO time_entries (id, task_id, started_at, duration, description) VALUES (?, ?, ?, ?, ?)');
    for (const e of entries) insert.run(e.id, taskId, e.startedAt, e.duration, e.description);

    return { name: 'task.setTimeEntries', args: { taskId, entries: oldEntries } satisfies TaskSetTimeEntriesArgs };
  },
});
