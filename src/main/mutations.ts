import type Database from 'better-sqlite3';
import { keyBetween, seedKeys } from '../shared/fractionalIndex';
import { plotPointFlatKey, syncTaskFieldValues, type NodeOrder } from './substrate';

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
// The substrate is now authoritative for order (Phase 5b): the moved node
// adopts the parent of the section it lands next to and gets a fractional
// order_key among that parent's children. Because a flat drop position implies
// membership, dragging a section into another act's run reparents it there
// (and to the novel root / bullpen when it lands among act-less sections) —
// the containment-as-backbone rule (TO-BE §1). The legacy plot_points columns
// (display_order, act_id) are dual-written to match, dropped in Phase 6.
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

    let afterPpId: string | null = null;
    if (afterNodeId !== null) {
      if (!afterNodeId.startsWith('pp:')) {
        throw new Error(`node.move: afterNode must be a plot_point node: ${afterNodeId}`);
      }
      afterPpId = afterNodeId.slice(3);
      const sib = db
        .prepare('SELECT 1 FROM plot_points WHERE id = ? AND character_id = ?')
        .get(afterPpId, pp.character_id);
      if (!sib) throw new Error(`node.move: afterNode not found among siblings: ${afterNodeId}`);
    }

    ensureSceneParentNode(db, pp.character_id, ppId);

    // Tree state for this character (arc + plot_point nodes).
    const loadNodes = () => {
      const rows = db
        .prepare("SELECT id, parent_id, order_key FROM structure_nodes WHERE character_id = ? AND level_key IN ('arc', 'plot_point')")
        .all(pp.character_id) as { id: string; parent_id: string | null; order_key: string }[];
      return new Map<string, NodeOrder>(rows.map(r => [r.id, { parent_id: r.parent_id, order_key: r.order_key }]));
    };
    const charPps = db
      .prepare('SELECT id, display_order FROM plot_points WHERE character_id = ?')
      .all(pp.character_id) as { id: string; display_order: number }[];

    // Flat (depth-first) section order from the tree; missing nodes fall back to
    // the end by legacy display_order so nothing is ever lost.
    const sortFlat = (ids: { id: string; display_order: number }[], map: Map<string, NodeOrder>): string[] =>
      ids
        .map(p => {
          const flat = plotPointFlatKey(`pp:${p.id}`, map);
          return { id: p.id, missing: flat ? 0 : 1, b: flat?.[0] ?? '', w: flat?.[1] ?? '', fb: p.display_order };
        })
        .sort((a, b) =>
          a.missing - b.missing ||
          (a.b < b.b ? -1 : a.b > b.b ? 1 : 0) ||
          (a.w < b.w ? -1 : a.w > b.w ? 1 : 0) ||
          a.fb - b.fb
        )
        .map(x => x.id);

    const before = loadNodes();
    // inverse target: X's flat predecessor in the pre-move arrangement
    const oldFull = sortFlat(charPps, before);
    const oldIdx = oldFull.indexOf(ppId);
    const oldPredecessor = oldIdx > 0 ? `pp:${oldFull[oldIdx - 1]}` : null;

    // New parent = the parent of the section X lands next to; for a front move,
    // the parent of the current first flat section (so X becomes truly first).
    const flatWithoutX = oldFull.filter(id => id !== ppId);
    let parentId: string;
    if (afterPpId !== null) {
      parentId = before.get(`pp:${afterPpId}`)?.parent_id ?? `novel:${pp.character_id}`;
    } else {
      parentId = flatWithoutX.length > 0
        ? (before.get(`pp:${flatWithoutX[0]}`)?.parent_id ?? `novel:${pp.character_id}`)
        : `novel:${pp.character_id}`;
    }

    // Siblings under the new parent (any level), excluding X, by order_key.
    const siblings = [...before.entries()]
      .filter(([id, n]) => n.parent_id === parentId && id !== nodeId)
      .sort((a, b) => (a[1].order_key < b[1].order_key ? -1 : a[1].order_key > b[1].order_key ? 1 : 0));
    let prevKey: string | null;
    let nextKey: string | null;
    if (afterPpId !== null) {
      const idx = siblings.findIndex(([id]) => id === `pp:${afterPpId}`);
      prevKey = idx >= 0 ? siblings[idx][1].order_key : null;
      nextKey = idx >= 0 ? (siblings[idx + 1]?.[1].order_key ?? null) : (siblings[0]?.[1].order_key ?? null);
    } else {
      prevKey = null;
      nextKey = siblings[0]?.[1].order_key ?? null;
    }
    const orderKey = keyBetween(prevKey, nextKey);

    const newActId = parentId.startsWith('act:') ? parentId.slice(4) : null;
    db.prepare('UPDATE structure_nodes SET parent_id = ?, order_key = ? WHERE id = ?').run(parentId, orderKey, nodeId);
    db.prepare('UPDATE plot_points SET act_id = ? WHERE id = ?').run(newActId, ppId);

    // Renumber legacy display_order to the new flat tree order (dual-write).
    const after = loadNodes();
    const newFull = sortFlat(charPps, after);
    const renumber = db.prepare('UPDATE plot_points SET display_order = ? WHERE id = ?');
    newFull.forEach((id, i) => renumber.run(i, id));

    return {
      name: 'node.move',
      args: { nodeId, afterNodeId: oldPredecessor } satisfies NodeMoveArgs,
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
// Also writes to archived_scenes so the legacy read path stays coherent until Phase 5.
registerMutation<SceneDeleteArgs>({
  name: 'scene.delete',
  deletionBudget: 0,
  run(ctx, { sceneId }) {
    const db = ctx.db;
    const scene = db
      .prepare('SELECT id, character_id, plot_point_id, scene_number, title, synopsis, is_highlighted, word_count FROM scenes WHERE id = ? AND deleted_at IS NULL')
      .get(sceneId) as { id: string; character_id: string; plot_point_id: string | null; scene_number: number; title: string; synopsis: string; is_highlighted: number; word_count: number | null } | undefined;
    if (!scene) throw new Error(`scene.delete: scene not found or already deleted: ${sceneId}`);

    const now = Date.now();
    db.prepare('UPDATE scenes SET deleted_at = ? WHERE id = ?').run(now, sceneId);

    // Sync archived_scenes so the legacy read path stays intact until Phase 5 cutover
    const draftRow = db.prepare('SELECT content FROM scene_drafts WHERE scene_id = ?').get(sceneId) as { content: string } | undefined;
    const tagNames = (db.prepare('SELECT t.name FROM scene_tags st JOIN tags t ON t.id = st.tag_id WHERE st.scene_id = ?').all(sceneId) as { name: string }[]).map(r => r.name);
    const noteContents = (db.prepare('SELECT content FROM scene_notes WHERE scene_id = ? ORDER BY display_order').all(sceneId) as { content: string }[]).map(r => r.content);
    db.prepare(`
      INSERT OR IGNORE INTO archived_scenes
        (id, character_id, original_plot_point_id, original_scene_number, title, synopsis, draft_content, tags, notes, is_highlighted, word_count, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sceneId, scene.character_id, scene.plot_point_id, scene.scene_number, scene.title, scene.synopsis, draftRow?.content ?? null, JSON.stringify(tagNames), JSON.stringify(noteContents), scene.is_highlighted, scene.word_count, now);

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
  deletionBudget: 1,
  run(ctx, { sceneId, toPlotPointId }) {
    const db = ctx.db;
    const scene = db
      .prepare('SELECT id, character_id FROM scenes WHERE id = ? AND deleted_at IS NOT NULL')
      .get(sceneId) as { id: string; character_id: string } | undefined;
    if (!scene) throw new Error(`scene.restore: scene not found or not deleted: ${sceneId}`);

    // Remove from archived_scenes (Phase 4c legacy sync)
    ctx.delete('DELETE FROM archived_scenes WHERE id = ?', sceneId);

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
    syncTaskFieldValues(db, taskId);

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

// ---------------------------------------------------------------------------
// Acts — dual-write to legacy `acts` table + substrate `structure_nodes`
// (arc-level nodes).  Same pattern as node.create / node.delete for sections.
// ---------------------------------------------------------------------------

interface ActUpsertArgs {
  id: string;
  characterId: string;
  name: string;
  synopsis: string;
  startingState: string;
  endingState: string;
  polarity: string;
  transformation: string;
  dilemma: string;
  propellingAction: string;
  displayOrder: number;
}

interface ActDeleteArgs { id: string; }

registerMutation<ActUpsertArgs>({
  name: 'act.upsert',
  deletionBudget: 0,
  run(ctx, args) {
    const db = ctx.db;
    const now = Date.now();
    const existing = db
      .prepare('SELECT name, synopsis, starting_state, ending_state, polarity, transformation, dilemma, propelling_action, display_order FROM acts WHERE id = ?')
      .get(args.id) as { name: string; synopsis: string; starting_state: string; ending_state: string; polarity: string; transformation: string; dilemma: string; propelling_action: string; display_order: number } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE acts SET name = ?, synopsis = ?, starting_state = ?, ending_state = ?,
          polarity = ?, transformation = ?, dilemma = ?, propelling_action = ?, display_order = ?
        WHERE id = ?
      `).run(args.name, args.synopsis, args.startingState, args.endingState, args.polarity, args.transformation, args.dilemma, args.propellingAction, args.displayOrder, args.id);
      db.prepare('UPDATE structure_nodes SET title = ? WHERE id = ?').run(args.name, `act:${args.id}`);
      return {
        name: 'act.upsert',
        args: { id: args.id, characterId: args.characterId, name: existing.name, synopsis: existing.synopsis, startingState: existing.starting_state, endingState: existing.ending_state, polarity: existing.polarity, transformation: existing.transformation, dilemma: existing.dilemma, propellingAction: existing.propelling_action, displayOrder: existing.display_order } satisfies ActUpsertArgs,
      };
    } else {
      db.prepare(`
        INSERT INTO acts (id, character_id, name, synopsis, starting_state, ending_state, polarity, transformation, dilemma, propelling_action, display_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(args.id, args.characterId, args.name, args.synopsis, args.startingState, args.endingState, args.polarity, args.transformation, args.dilemma, args.propellingAction, args.displayOrder, now);

      ensureSceneParentNode(db, args.characterId, null); // ensure novel root
      const lastArc = db
        .prepare("SELECT order_key FROM structure_nodes WHERE character_id = ? AND level_key = 'arc' ORDER BY order_key DESC LIMIT 1")
        .get(args.characterId) as { order_key: string } | undefined;
      const orderKey = keyBetween(lastArc?.order_key ?? null, null);
      db.prepare(
        'INSERT OR IGNORE INTO structure_nodes (id, character_id, level_key, parent_id, order_key, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(`act:${args.id}`, args.characterId, 'arc', `novel:${args.characterId}`, orderKey, args.name, now);

      return { name: 'act.delete', args: { id: args.id } satisfies ActDeleteArgs };
    }
  },
});

registerMutation<ActDeleteArgs>({
  name: 'act.delete',
  deletionBudget: 2,
  run(ctx, { id }) {
    const db = ctx.db;
    const act = db
      .prepare('SELECT id, character_id, name, synopsis, starting_state, ending_state, polarity, transformation, dilemma, propelling_action, display_order FROM acts WHERE id = ?')
      .get(id) as { id: string; character_id: string; name: string; synopsis: string; starting_state: string; ending_state: string; polarity: string; transformation: string; dilemma: string; propelling_action: string; display_order: number } | undefined;
    if (!act) throw new Error(`act.delete: act not found: ${id}`);

    // Reparent plot_point nodes to novel root BEFORE deleting arc node (otherwise ON DELETE CASCADE drops them too).
    db.prepare("UPDATE structure_nodes SET parent_id = ? WHERE parent_id = ?").run(`novel:${act.character_id}`, `act:${id}`);
    ctx.delete('DELETE FROM structure_nodes WHERE id = ?', `act:${id}`);
    ctx.delete('DELETE FROM acts WHERE id = ?', id); // FK ON DELETE SET NULL handles plot_points.act_id

    return {
      name: 'act.upsert',
      args: { id: act.id, characterId: act.character_id, name: act.name, synopsis: act.synopsis, startingState: act.starting_state, endingState: act.ending_state, polarity: act.polarity, transformation: act.transformation, dilemma: act.dilemma, propellingAction: act.propelling_action, displayOrder: act.display_order } satisfies ActUpsertArgs,
    };
  },
});

// ---------------------------------------------------------------------------
// Phase 4f — Word count + braided positions (retire remaining scene UPDATEs from SAVE_TIMELINE)
// ---------------------------------------------------------------------------

interface SceneSetWordCountArgs { sceneId: string; wordCount: number; }

registerMutation<SceneSetWordCountArgs>({
  name: 'scene.setWordCount',
  deletionBudget: 0,
  run(ctx, { sceneId, wordCount }) {
    const db = ctx.db;
    const row = db.prepare('SELECT word_count FROM scenes WHERE id = ?').get(sceneId) as { word_count: number | null } | undefined;
    if (!row) throw new Error(`scene.setWordCount: scene not found: ${sceneId}`);
    db.prepare('UPDATE scenes SET word_count = ?, updated_at = ? WHERE id = ?').run(wordCount, Date.now(), sceneId);
    return { name: 'scene.setWordCount', args: { sceneId, wordCount: row.word_count ?? 0 } satisfies SceneSetWordCountArgs };
  },
});

interface BraidedPositionUpdate { sceneId: string; position: number | null; }
interface BraidedSetPositionsArgs { updates: BraidedPositionUpdate[]; }

// scenes.setBraidedPositions — atomically reorder the braided timeline.
// Sent by every braided drag/reorder handler with the full new position map;
// records old values so the inverse restores them exactly.
registerMutation<BraidedSetPositionsArgs>({
  name: 'scenes.setBraidedPositions',
  deletionBudget: 0,
  run(ctx, { updates }) {
    const db = ctx.db;
    const stmt = db.prepare('UPDATE scenes SET timeline_position = ?, updated_at = ? WHERE id = ?');
    const now = Date.now();
    const oldUpdates: BraidedPositionUpdate[] = [];
    for (const { sceneId, position } of updates) {
      const row = db.prepare('SELECT timeline_position FROM scenes WHERE id = ?').get(sceneId) as { timeline_position: number | null } | undefined;
      if (!row) continue;
      oldUpdates.push({ sceneId, position: row.timeline_position });
      stmt.run(position, now, sceneId);
    }
    return { name: 'scenes.setBraidedPositions', args: { updates: oldUpdates } satisfies BraidedSetPositionsArgs };
  },
});

// ---------------------------------------------------------------------------
// Phase 4e — Character color + scene dates (retire last typed SAVE_TIMELINE fields)
// ---------------------------------------------------------------------------

interface CharacterSetColorArgs { characterId: string; color: string; }

registerMutation<CharacterSetColorArgs>({
  name: 'character.setColor',
  deletionBudget: 0,
  run(ctx, { characterId, color }) {
    const db = ctx.db;
    const row = db.prepare('SELECT color FROM characters WHERE id = ?').get(characterId) as { color: string | null } | undefined;
    if (!row) throw new Error(`character.setColor: character not found: ${characterId}`);
    db.prepare('UPDATE characters SET color = ? WHERE id = ?').run(color, characterId);
    return { name: 'character.setColor', args: { characterId, color: row.color ?? '' } satisfies CharacterSetColorArgs };
  },
});

interface SceneSetDateArgs { sceneId: string; startDate: string | null; endDate: string | null; }

registerMutation<SceneSetDateArgs>({
  name: 'scene.setDate',
  deletionBudget: 1,
  run(ctx, { sceneId, startDate, endDate }) {
    const db = ctx.db;
    const old = db.prepare('SELECT date, end_date FROM scene_dates WHERE scene_id = ?').get(sceneId) as { date: string; end_date: string | null } | undefined;
    if (startDate !== null) {
      db.prepare(`
        INSERT INTO scene_dates (scene_id, date, end_date) VALUES (?, ?, ?)
        ON CONFLICT(scene_id) DO UPDATE SET date = excluded.date, end_date = excluded.end_date
      `).run(sceneId, startDate, endDate);
    } else {
      ctx.delete('DELETE FROM scene_dates WHERE scene_id = ?', sceneId);
    }
    return {
      name: 'scene.setDate',
      args: { sceneId, startDate: old?.date ?? null, endDate: old?.end_date ?? null } satisfies SceneSetDateArgs,
    };
  },
});

// ---------------------------------------------------------------------------
// Phase 4b — Connections (retire SAVE_TIMELINE connections bulk-replace)
// ---------------------------------------------------------------------------

interface ConnectionAddArgs { sourceId: string; targetId: string; }
interface ConnectionRemoveArgs { sourceId: string; targetId: string; }

registerMutation<ConnectionAddArgs>({
  name: 'connection.add',
  deletionBudget: 0,
  run(ctx, { sourceId, targetId }) {
    const db = ctx.db;
    const exists = db.prepare('SELECT 1 FROM scene_connections WHERE source_scene_id = ? AND target_scene_id = ?').get(sourceId, targetId);
    if (!exists) {
      db.prepare('INSERT INTO scene_connections (id, source_scene_id, target_scene_id, label) VALUES (?, ?, ?, NULL)').run(newId(), sourceId, targetId);
      db.prepare('INSERT INTO scene_connections (id, source_scene_id, target_scene_id, label) VALUES (?, ?, ?, NULL)').run(newId(), targetId, sourceId);
    }
    return { name: 'connection.remove', args: { sourceId, targetId } satisfies ConnectionRemoveArgs };
  },
});

registerMutation<ConnectionRemoveArgs>({
  name: 'connection.remove',
  deletionBudget: 2,
  run(ctx, { sourceId, targetId }) {
    ctx.delete('DELETE FROM scene_connections WHERE source_scene_id = ? AND target_scene_id = ?', sourceId, targetId);
    ctx.delete('DELETE FROM scene_connections WHERE source_scene_id = ? AND target_scene_id = ?', targetId, sourceId);
    return { name: 'connection.add', args: { sourceId, targetId } satisfies ConnectionAddArgs };
  },
});

// ---------------------------------------------------------------------------
// Phase 4d — World events (retire SAVE_TIMELINE worldEvents bulk-replace)
// ---------------------------------------------------------------------------

interface WorldEventCreateArgs {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  description: string;
  tags: string[];
  linkedSceneIds: string[];
  linkedNoteIds: string[];
  createdAt: number;
}

interface WorldEventUpdateArgs {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  description: string;
  tags: string[];
  linkedSceneIds: string[];
  linkedNoteIds: string[];
}

function resolveOrUpsertTag(db: Database.Database, name: string): string {
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
  if (existing) return existing.id;
  const tid = newId();
  db.prepare('INSERT OR IGNORE INTO tags (id, name, category) VALUES (?, ?, ?)').run(tid, name, 'things');
  return tid;
}

function readWorldEventLinks(db: Database.Database, id: string) {
  const tags = (db.prepare('SELECT t.name FROM world_event_tags wet JOIN tags t ON t.id = wet.tag_id WHERE wet.event_id = ?').all(id) as { name: string }[]).map(r => r.name);
  const sceneIds = (db.prepare('SELECT scene_id FROM world_event_scene_links WHERE event_id = ?').all(id) as { scene_id: string }[]).map(r => r.scene_id);
  const noteIds = (db.prepare('SELECT note_id FROM world_event_note_links WHERE event_id = ?').all(id) as { note_id: string }[]).map(r => r.note_id);
  return { tags, sceneIds, noteIds };
}

function replaceWorldEventLinks(ctx: MutationContext, id: string, tags: string[], sceneIds: string[], noteIds: string[]) {
  const db = ctx.db;
  ctx.delete('DELETE FROM world_event_tags WHERE event_id = ?', id);
  const insertWETag = db.prepare('INSERT OR IGNORE INTO world_event_tags (event_id, tag_id) VALUES (?, ?)');
  for (const name of tags) insertWETag.run(id, resolveOrUpsertTag(db, name));

  ctx.delete('DELETE FROM world_event_scene_links WHERE event_id = ?', id);
  const insertSceneLink = db.prepare('INSERT OR IGNORE INTO world_event_scene_links (event_id, scene_id) VALUES (?, ?)');
  for (const sid of sceneIds) insertSceneLink.run(id, sid);

  ctx.delete('DELETE FROM world_event_note_links WHERE event_id = ?', id);
  const insertNoteLink = db.prepare('INSERT OR IGNORE INTO world_event_note_links (event_id, note_id) VALUES (?, ?)');
  for (const nid of noteIds) insertNoteLink.run(id, nid);
}

registerMutation<WorldEventCreateArgs>({
  name: 'worldEvent.create',
  deletionBudget: 0,
  run(ctx, { id, title, date, endDate, description, tags, linkedSceneIds, linkedNoteIds, createdAt }) {
    const db = ctx.db;
    const now = Date.now();
    db.prepare('INSERT INTO world_events (id, title, date, end_date, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, title, date, endDate, description, createdAt, now);
    replaceWorldEventLinks(ctx, id, tags, linkedSceneIds, linkedNoteIds);
    return { name: 'worldEvent.delete', args: { id } };
  },
});

registerMutation<WorldEventUpdateArgs>({
  name: 'worldEvent.update',
  deletionBudget: 500,
  run(ctx, { id, title, date, endDate, description, tags, linkedSceneIds, linkedNoteIds }) {
    const db = ctx.db;
    const old = db.prepare('SELECT title, date, end_date, description FROM world_events WHERE id = ?').get(id) as { title: string; date: string; end_date: string | null; description: string } | undefined;
    if (!old) throw new Error(`worldEvent.update: event not found: ${id}`);
    const oldLinks = readWorldEventLinks(db, id);

    db.prepare('UPDATE world_events SET title = ?, date = ?, end_date = ?, description = ?, updated_at = ? WHERE id = ?').run(title, date, endDate, description, Date.now(), id);
    replaceWorldEventLinks(ctx, id, tags, linkedSceneIds, linkedNoteIds);

    return {
      name: 'worldEvent.update',
      args: { id, title: old.title, date: old.date, endDate: old.end_date, description: old.description, tags: oldLinks.tags, linkedSceneIds: oldLinks.sceneIds, linkedNoteIds: oldLinks.noteIds } satisfies WorldEventUpdateArgs,
    };
  },
});

registerMutation<{ id: string }>({
  name: 'worldEvent.delete',
  deletionBudget: 1,
  run(ctx, { id }) {
    const db = ctx.db;
    const old = db.prepare('SELECT title, date, end_date, description, created_at FROM world_events WHERE id = ?').get(id) as { title: string; date: string; end_date: string | null; description: string; created_at: number } | undefined;
    if (!old) throw new Error(`worldEvent.delete: event not found: ${id}`);
    const oldLinks = readWorldEventLinks(db, id);

    ctx.delete('DELETE FROM world_events WHERE id = ?', id);

    return {
      name: 'worldEvent.create',
      args: { id, title: old.title, date: old.date, endDate: old.end_date, description: old.description, tags: oldLinks.tags, linkedSceneIds: oldLinks.sceneIds, linkedNoteIds: oldLinks.noteIds, createdAt: old.created_at } satisfies WorldEventCreateArgs,
    };
  },
});

// ---------------------------------------------------------------------------
// Phase 4g — Settings + tags (retire SAVE_TIMELINE IPC handler entirely)
// ---------------------------------------------------------------------------

interface SettingsSetArgs { key: string; value: string; }

// settings.set — generic key/value setting upsert. Callers serialize to JSON.
// Inverse restores the previous value (or '' if the key was absent).
registerMutation<SettingsSetArgs>({
  name: 'settings.set',
  deletionBudget: 0,
  run(ctx, { key, value }) {
    const db = ctx.db;
    const old = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    return { name: 'settings.set', args: { key, value: old?.value ?? '' } satisfies SettingsSetArgs };
  },
});

interface ProjectSetWordCountGoalArgs { goal: number; }

// project.setWordCountGoal — narrow update to projects.word_count_goal.
registerMutation<ProjectSetWordCountGoalArgs>({
  name: 'project.setWordCountGoal',
  deletionBudget: 0,
  run(ctx, { goal }) {
    const db = ctx.db;
    const old = db.prepare("SELECT word_count_goal FROM project WHERE id = 'project'").get() as { word_count_goal: number | null } | undefined;
    db.prepare("UPDATE project SET word_count_goal = ?, updated_at = ? WHERE id = 'project'").run(goal, Date.now());
    return { name: 'project.setWordCountGoal', args: { goal: old?.word_count_goal ?? 0 } satisfies ProjectSetWordCountGoalArgs };
  },
});

interface TagUpsertArgs { id: string; name: string; category: string; }

// tag.upsert — create or update a tag. Conflicts on name (not id), matching
// the legacy upsertTag() behavior. Inverse is not recorded (tag creation is
// not undoable at this stage — deletion requires removing from many tables).
registerMutation<TagUpsertArgs>({
  name: 'tag.upsert',
  deletionBudget: 0,
  run(ctx, { id, name, category }) {
    ctx.db.prepare(
      'INSERT INTO tags (id, name, category) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET category = excluded.category'
    ).run(id, name, category);
    return null;
  },
});

interface TagSetCategoryArgs { id: string; category: string; }

// tag.setCategory — narrow UPDATE for tag category (used by tag manager).
registerMutation<TagSetCategoryArgs>({
  name: 'tag.setCategory',
  deletionBudget: 0,
  run(ctx, { id, category }) {
    const db = ctx.db;
    const old = db.prepare('SELECT category FROM tags WHERE id = ?').get(id) as { category: string } | undefined;
    if (!old) throw new Error(`tag.setCategory: tag not found: ${id}`);
    db.prepare('UPDATE tags SET category = ? WHERE id = ?').run(category, id);
    return { name: 'tag.setCategory', args: { id, category: old.category } satisfies TagSetCategoryArgs };
  },
});

interface TagDeleteArgs { id: string; }

// tag.delete — remove a tag and all its associations.
// Budget covers all scene_tags + note_tags + task_tags + world_event_tags
// rows plus the tag row itself.
registerMutation<TagDeleteArgs>({
  name: 'tag.delete',
  deletionBudget: 10000,
  run(ctx, { id }) {
    const row = ctx.db.prepare('SELECT id FROM tags WHERE id = ?').get(id) as { id: string } | undefined;
    if (!row) throw new Error(`tag.delete: tag not found: ${id}`);
    ctx.delete('DELETE FROM scene_tags WHERE tag_id = ?', id);
    ctx.delete('DELETE FROM note_tags WHERE tag_id = ?', id);
    ctx.delete('DELETE FROM task_tags WHERE tag_id = ?', id);
    ctx.delete('DELETE FROM world_event_tags WHERE tag_id = ?', id);
    ctx.delete('DELETE FROM tags WHERE id = ?', id);
    return null;
  },
});
