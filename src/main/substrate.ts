import type Database from 'better-sqlite3';
import { seedKeys } from '../shared/fractionalIndex';

// Substrate seeding (docs/data-model/TO-BE.md §7, Phase 2 → Phase 5).
//
// Phase 2 behaviour (pre-Phase 5a): legacy tables are authoritative;
// structure_nodes is a derived mirror wiped and rebuilt on every open.
//
// Phase 5a behaviour (this commit): on the FIRST open of each project
// (detected by the absence of the 'substrate_seeded' settings key),
// structure_nodes is seeded from the legacy tables — exactly as before.
// On every subsequent open the seed is skipped; mutations own the tree.
// refreshFields() still runs on every open because the field dual-write
// (syncStructureSix) is not yet complete enough to be the sole source.
//
// Node ids are deterministic ("novel:<charId>", "act:<actId>",
// "pp:<plotPointId>") so a rebuild yields identical ids and references
// to them stay stable across opens.
//
// Chapters are deliberately NOT mirrored yet: legacy chapters are
// novel-wide and the TO-BE model makes them per-character, which needs
// the split-by-POV migration rule and a check against real project data
// first (TO-BE §1, resolved call #4).

export const NODE_LEVELS = [
  { level_key: 'novel', label: 'Novel', depth: 0 },
  { level_key: 'arc', label: 'Act', depth: 1 },
  { level_key: 'plot_point', label: 'Plot point', depth: 2 },
  { level_key: 'chapter', label: 'Chapter', depth: 3 },
] as const;

export interface NodeOrder { parent_id: string | null; order_key: string }

// Depth-first sort key for a plot-point node within its character's flat
// section list: [branchKey, withinKey] (TO-BE §2). A plot point under an act
// sorts by (the act's key among the root children, then its own key within the
// act); one directly under the novel root sorts by its own key, with an empty
// within-key so it sits at its own root slot. Lets the POV view's section
// order be produced by a plain lexicographic sort rather than a recursive walk.
// Returns null when the node is missing (caller decides the fallback).
export function plotPointFlatKey(
  ppNodeId: string,
  nodeById: Map<string, NodeOrder>
): [string, string] | null {
  const node = nodeById.get(ppNodeId);
  if (!node) return null;
  const parent = node.parent_id ?? '';
  if (parent.startsWith('act:')) return [nodeById.get(parent)?.order_key ?? '', node.order_key];
  return [node.order_key, ''];
}

export function refreshSubstrate(db: Database.Database): void {
  const now = Date.now();

  // Phase 5a: only seed structure_nodes once per project lifetime.
  // After the first open with data, mutations maintain the tree exclusively.
  // We skip the wipe-and-rebuild only when BOTH conditions hold:
  //   1. the seeded flag is set (we ran a full seed at some prior open), AND
  //   2. structure_nodes actually has content (the seed was non-empty).
  // The second guard handles the race where the DB is first opened before any
  // characters exist (e.g. tests, or a brand-new project being initialized);
  // in that case we rebuild on the next open so legacy data is picked up.
  const alreadySeeded = (
    db.prepare("SELECT value FROM settings WHERE key = 'substrate_seeded'").get() as { value: string } | undefined
  )?.value === '1';
  const hasNodes = db.prepare('SELECT 1 FROM structure_nodes LIMIT 1').get() !== undefined;

  if (alreadySeeded && hasNodes) {
    // Fields still rebuilt on every open (field dual-write not yet complete).
    db.transaction(() => refreshFields(db, now))();
    return;
  }

  const refresh = db.transaction(() => {
    // First open: seed from legacy tables, then never again.
    db.exec('UPDATE scenes SET parent_node_id = NULL WHERE parent_node_id IS NOT NULL');
    db.exec('DELETE FROM structure_nodes');

    const actCount = (db.prepare('SELECT count(*) AS n FROM acts').get() as { n: number }).n;
    const ppCount = (db.prepare('SELECT count(*) AS n FROM plot_points').get() as { n: number }).n;
    const enabledByLevel: Record<string, number> = {
      novel: 1,
      arc: actCount > 0 ? 1 : 0,
      plot_point: ppCount > 0 ? 1 : 0,
      chapter: 0, // deferred (see header)
    };
    const upsertLevel = db.prepare(
      'INSERT INTO structure_levels (level_key, label, enabled, depth) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(level_key) DO UPDATE SET enabled = excluded.enabled'
    );
    for (const lvl of NODE_LEVELS) {
      upsertLevel.run(lvl.level_key, lvl.label, enabledByLevel[lvl.level_key], lvl.depth);
    }

    const insertNode = db.prepare(
      'INSERT INTO structure_nodes (id, character_id, level_key, parent_id, order_key, title, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    // novel root per character
    const characters = db
      .prepare('SELECT id, name FROM characters ORDER BY display_order, created_at')
      .all() as { id: string; name: string }[];
    const novelRootKeys = seedKeys(characters.length);
    characters.forEach((c, i) => {
      insertNode.run(`novel:${c.id}`, c.id, 'novel', null, novelRootKeys[i], c.name, now);
    });

    const acts = db
      .prepare('SELECT id, character_id, name, display_order FROM acts')
      .all() as { id: string; character_id: string; name: string; display_order: number }[];

    const pps = db
      .prepare('SELECT id, character_id, title, act_id, display_order FROM plot_points')
      .all() as { id: string; character_id: string; title: string; act_id: string | null; display_order: number }[];

    // Per character, acts AND act-less plot points are siblings under the novel
    // root, so they must share ONE totally-ordered key sequence -- otherwise an
    // act node and an act-less section can collide on the same order_key (TO-BE
    // section 2: order_key is "node within parent"). The flat per-character
    // section list the POV view shows is the depth-first walk of this tree; we
    // seed the keys so that walk reproduces the legacy display_order exactly.
    const EMPTY_ACT_BASE = 1e9; // empty acts sort last, deterministically
    for (const c of characters) {
      const charActs = acts.filter(a => a.character_id === c.id);
      const charPps = pps.filter(p => p.character_id === c.id);

      // Each act sits among the root children at the min display_order of its
      // sections, so contiguous act blocks land in the right place.
      const actMinDo = new Map<string, number>();
      for (const p of charPps) {
        if (!p.act_id) continue;
        const cur = actMinDo.get(p.act_id);
        if (cur === undefined || p.display_order < cur) actMinDo.set(p.act_id, p.display_order);
      }

      type RootChild = { kind: 'act' | 'pp'; id: string; title: string };
      const rootChildren: { sortPos: number; child: RootChild }[] = [];
      for (const a of charActs) {
        rootChildren.push({
          sortPos: actMinDo.get(a.id) ?? (EMPTY_ACT_BASE + a.display_order),
          child: { kind: 'act', id: a.id, title: a.name },
        });
      }
      for (const p of charPps) {
        if (!p.act_id) rootChildren.push({ sortPos: p.display_order, child: { kind: 'pp', id: p.id, title: p.title } });
      }
      rootChildren.sort((x, y) => x.sortPos - y.sortPos);

      const rootKeys = seedKeys(rootChildren.length);
      rootChildren.forEach((rc, i) => {
        const nodeId = rc.child.kind === 'act' ? `act:${rc.child.id}` : `pp:${rc.child.id}`;
        const level = rc.child.kind === 'act' ? 'arc' : 'plot_point';
        insertNode.run(nodeId, c.id, level, `novel:${c.id}`, rootKeys[i], rc.child.title, now);
      });

      // plot points within each act, in display_order
      for (const a of charActs) {
        const within = charPps
          .filter(p => p.act_id === a.id)
          .sort((p, q) => p.display_order - q.display_order);
        const keys = seedKeys(within.length);
        within.forEach((p, i) => {
          insertNode.run(`pp:${p.id}`, c.id, 'plot_point', `act:${a.id}`, keys[i], p.title, now);
        });
      }
    }

    // scenes point at their plot-point node; unplaced scenes at the root
    // (the bullpen — a place, not an absence; TO-BE §1 invariant rule 2)
    db.exec(`
      UPDATE scenes SET parent_node_id =
        CASE WHEN plot_point_id IS NOT NULL THEN 'pp:' || plot_point_id
             ELSE 'novel:' || character_id END
    `);

    // outline_key: fractional order within the parent node, seeded from the
    // legacy scene_number sequence (still authoritative)
    const sceneRows = db
      .prepare('SELECT id, parent_node_id FROM scenes ORDER BY character_id, scene_number, created_at')
      .all() as { id: string; parent_node_id: string }[];
    const setKey = db.prepare('UPDATE scenes SET outline_key = ? WHERE id = ?');
    for (const group of groupBy(sceneRows, s => s.parent_node_id)) {
      const keys = seedKeys(group.length);
      group.forEach((s, i) => setKey.run(keys[i], s.id));
    }

    refreshFields(db, now);

    // Stamp as seeded so future opens skip the rebuild.
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('substrate_seeded', '1') " +
      "ON CONFLICT(key) DO UPDATE SET value = '1'"
    ).run();
  });

  refresh();
}

// The six story-structure fields, hardcoded today at FOUR levels
// (character_psychology novel_*, acts, plot_points, scenes). They become
// one builtin field def each, attached to every structure level.
const STRUCTURE_SIX = [
  { col: 'starting_state', label: 'Starting state' },
  { col: 'ending_state', label: 'Ending state' },
  { col: 'polarity', label: 'Polarity' },
  { col: 'transformation', label: 'Transformation' },
  { col: 'dilemma', label: 'Dilemma' },
  { col: 'propelling_action', label: 'Propelling action' },
] as const;

// One unified field system (TO-BE §4), derived from the three legacy
// def/value systems plus the hardcoded structure-six columns.
//
// Conflict rule: metadata_field_defs ids were copied once into
// arc_field_defs (migrateSceneMetadataToArcTables, copy-once semantics),
// after which the two stores can diverge. For defs that exist in
// metadata_field_defs, scene_metadata_values is the actively-written
// store, so its values WIN over stale arc_field_values copies.
function refreshFields(db: Database.Database, now: number): void {
  db.exec('DELETE FROM field_values');
  db.exec('DELETE FROM field_attachments');
  db.exec('DELETE FROM field_defs');

  const insertDef = db.prepare(
    'INSERT INTO field_defs (id, label, field_type, options, option_colors, rating_max, display_order, builtin, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const attach = db.prepare(
    'INSERT OR IGNORE INTO field_attachments (field_id, level_key) VALUES (?, ?)'
  );
  const insertValue = db.prepare(
    'INSERT OR REPLACE INTO field_values (field_id, entity_type, entity_id, value) VALUES (?, ?, ?, ?)'
  );

  // 1. arc_field_defs — the legacy superset (includes copied metadata defs).
  //    scope 'scene' = scene-only metadata; scope 'arc' = the arc system,
  //    which the UI applies to acts, sections, and scenes.
  const arcDefs = db.prepare('SELECT * FROM arc_field_defs ORDER BY display_order').all() as
    { id: string; label: string; field_type: string; options: string | null; option_colors: string | null; rating_max: number | null; display_order: number; scope: string }[];
  for (const d of arcDefs) {
    insertDef.run(`arcf:${d.id}`, d.label, d.field_type, d.options, d.option_colors, d.rating_max, d.display_order, 0, now);
    const levels = d.scope === 'scene' ? ['scene'] : ['arc', 'plot_point', 'scene'];
    for (const lvl of levels) attach.run(`arcf:${d.id}`, lvl);
  }

  const arcValues = db.prepare('SELECT * FROM arc_field_values').all() as
    { entity_type: string; entity_id: string; field_def_id: string; value: string }[];
  for (const v of arcValues) {
    if (v.entity_type === 'act') insertValue.run(`arcf:${v.field_def_id}`, 'node', `act:${v.entity_id}`, v.value);
    else if (v.entity_type === 'section') insertValue.run(`arcf:${v.field_def_id}`, 'node', `pp:${v.entity_id}`, v.value);
    else insertValue.run(`arcf:${v.field_def_id}`, 'scene', v.entity_id, v.value);
  }

  // 2. metadata defs not yet copied into arc_field_defs, then metadata
  //    values (overriding stale arc copies — see conflict rule above)
  const metaDefs = db.prepare('SELECT * FROM metadata_field_defs ORDER BY display_order').all() as
    { id: string; label: string; field_type: string; options: string | null; option_colors: string | null; display_order: number }[];
  const arcDefIds = new Set(arcDefs.map(d => d.id));
  for (const d of metaDefs) {
    if (!arcDefIds.has(d.id)) {
      insertDef.run(`arcf:${d.id}`, d.label, d.field_type, d.options, d.option_colors, null, d.display_order, 0, now);
      attach.run(`arcf:${d.id}`, 'scene');
    }
  }
  const metaValues = db.prepare('SELECT * FROM scene_metadata_values').all() as
    { scene_id: string; field_def_id: string; value: string }[];
  for (const v of metaValues) {
    insertValue.run(`arcf:${v.field_def_id}`, 'scene', v.scene_id, v.value);
  }

  // 3. task fields ('task' is a pseudo-level; TO-BE §4)
  const taskDefs = db.prepare('SELECT * FROM task_field_defs ORDER BY display_order').all() as
    { id: string; name: string; field_type: string; options: string | null; display_order: number }[];
  for (const d of taskDefs) {
    insertDef.run(`taskf:${d.id}`, d.name, d.field_type, d.options, null, null, d.display_order, 0, now);
    attach.run(`taskf:${d.id}`, 'task');
  }
  const taskValues = db.prepare('SELECT * FROM task_custom_field_values').all() as
    { task_id: string; field_def_id: string; value: string }[];
  for (const v of taskValues) {
    insertValue.run(`taskf:${v.field_def_id}`, 'task', v.task_id, v.value);
  }

  // 4. the structure six, from all four hardcoded sites. Values are stored
  //    JSON-encoded to match the legacy value convention; empty strings are
  //    skipped (the legacy defaults, not user data).
  STRUCTURE_SIX.forEach((f, i) => {
    const id = `builtin:${f.col}`;
    insertDef.run(id, f.label, 'text', null, null, null, i, 1, now);
    for (const lvl of ['novel', 'arc', 'plot_point', 'scene']) attach.run(id, lvl);

    const psych = db.prepare(`SELECT character_id, novel_${f.col} AS v FROM character_psychology WHERE novel_${f.col} != ''`).all() as { character_id: string; v: string }[];
    for (const r of psych) insertValue.run(id, 'node', `novel:${r.character_id}`, JSON.stringify(r.v));

    const acts = db.prepare(`SELECT id, ${f.col} AS v FROM acts WHERE ${f.col} != ''`).all() as { id: string; v: string }[];
    for (const r of acts) insertValue.run(id, 'node', `act:${r.id}`, JSON.stringify(r.v));

    const pps = db.prepare(`SELECT id, ${f.col} AS v FROM plot_points WHERE ${f.col} != ''`).all() as { id: string; v: string }[];
    for (const r of pps) insertValue.run(id, 'node', `pp:${r.id}`, JSON.stringify(r.v));

    const scenes = db.prepare(`SELECT id, ${f.col} AS v FROM scenes WHERE ${f.col} != ''`).all() as { id: string; v: string }[];
    for (const r of scenes) insertValue.run(id, 'scene', r.id, JSON.stringify(r.v));
  });
}

function groupBy<T>(rows: T[], key: (row: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const g = groups.get(k);
    if (g) g.push(row);
    else groups.set(k, [row]);
  }
  return [...groups.values()];
}

// ── Phase 5c-1: within-session field_values dual-writes ──────────────────────
//
// refreshFields() (above) rebuilds the entire field_values mirror on open from
// the legacy field tables. These helpers keep the mirror in sync *within* a
// session so a single legacy write is immediately reflected — the prerequisite
// for retiring refreshFields()-every-open and, eventually, the legacy tables.
//
// Each helper re-derives the field_values rows for ONE entity from the legacy
// table, using the exact same id/shape mapping refreshFields() uses, so the two
// agree byte-for-byte. Values whose def is not yet in field_defs are skipped
// (field_values.field_id is an FK); the def dual-write keeps defs present.

function defExists(db: Database.Database, fieldId: string): boolean {
  return !!db.prepare('SELECT 1 FROM field_defs WHERE id = ?').get(fieldId);
}

// task_custom_field_values → field_values (taskf:<def>, entity 'task'/<taskId>)
export function syncTaskFieldValues(db: Database.Database, taskId: string): void {
  db.prepare(
    "DELETE FROM field_values WHERE entity_type = 'task' AND entity_id = ? AND field_id LIKE 'taskf:%'"
  ).run(taskId);
  const insertValue = db.prepare(
    'INSERT OR REPLACE INTO field_values (field_id, entity_type, entity_id, value) VALUES (?, ?, ?, ?)'
  );
  const rows = db.prepare('SELECT field_def_id, value FROM task_custom_field_values WHERE task_id = ?').all(taskId) as
    { field_def_id: string; value: string }[];
  for (const v of rows) {
    const fieldId = `taskf:${v.field_def_id}`;
    if (defExists(db, fieldId)) insertValue.run(fieldId, 'task', taskId, v.value);
  }
}

// arc_field_values for an act/section → field_values (arcf:<def>, entity
// 'node'/<act:|pp:>). Only arcf:* rows on the node are recomputed; builtin
// structure-six rows on the same node (written by syncStructureSix) are left
// untouched. The scene entity is handled by syncSceneFieldValues, which must
// reconcile arc-scene values with scene_metadata_values precedence.
export function syncArcNodeFieldValues(db: Database.Database, entityType: 'act' | 'section', entityId: string): void {
  const nodeId = entityType === 'act' ? `act:${entityId}` : `pp:${entityId}`;
  db.prepare(
    "DELETE FROM field_values WHERE entity_type = 'node' AND entity_id = ? AND field_id LIKE 'arcf:%'"
  ).run(nodeId);
  const insertValue = db.prepare(
    'INSERT OR REPLACE INTO field_values (field_id, entity_type, entity_id, value) VALUES (?, ?, ?, ?)'
  );
  const rows = db.prepare('SELECT field_def_id, value FROM arc_field_values WHERE entity_type = ? AND entity_id = ?')
    .all(entityType, entityId) as { field_def_id: string; value: string }[];
  for (const v of rows) {
    const fieldId = `arcf:${v.field_def_id}`;
    if (defExists(db, fieldId)) insertValue.run(fieldId, 'node', nodeId, v.value);
  }
}

// A scene's arcf:* field_values are fed by TWO legacy systems that share the
// same (field, scene) key: arc_field_values (entity_type='scene') and
// scene_metadata_values. They diverged historically; refreshFields() resolves
// it by writing arc copies first, then metadata over the top — metadata wins.
// This recomputes one scene's arcf:* rows with the same precedence, so either
// write path (arc-scene or metadata) lands a consistent result. builtin:* scene
// rows (the structure six, from the scenes table) are left untouched.
export function syncSceneFieldValues(db: Database.Database, sceneId: string): void {
  db.prepare(
    "DELETE FROM field_values WHERE entity_type = 'scene' AND entity_id = ? AND field_id LIKE 'arcf:%'"
  ).run(sceneId);
  const insertValue = db.prepare(
    'INSERT OR REPLACE INTO field_values (field_id, entity_type, entity_id, value) VALUES (?, ?, ?, ?)'
  );
  const arcRows = db.prepare("SELECT field_def_id, value FROM arc_field_values WHERE entity_type = 'scene' AND entity_id = ?")
    .all(sceneId) as { field_def_id: string; value: string }[];
  for (const v of arcRows) {
    const fieldId = `arcf:${v.field_def_id}`;
    if (defExists(db, fieldId)) insertValue.run(fieldId, 'scene', sceneId, v.value);
  }
  // metadata wins: written last so it overwrites any arc copy of the same field
  const metaRows = db.prepare('SELECT field_def_id, value FROM scene_metadata_values WHERE scene_id = ?')
    .all(sceneId) as { field_def_id: string; value: string }[];
  for (const v of metaRows) {
    const fieldId = `arcf:${v.field_def_id}`;
    if (defExists(db, fieldId)) insertValue.run(fieldId, 'scene', sceneId, v.value);
  }
}

// ── Phase 5c-1 (B): within-session field_defs / field_attachments dual-writes ─
//
// Mirror the legacy def tables into the unified field_defs/field_attachments,
// using the same id/level mapping refreshFields() uses. CRITICAL: defs that
// persist are UPDATEd in place, never delete-then-reinsert — a DELETE on a
// field_defs row cascades to its field_values (ON DELETE CASCADE), so reinsert
// would silently wipe every value of a merely-renamed field. Only genuinely
// removed defs are DELETEd, which correctly cascades their now-orphaned values.

interface DesiredDef {
  label: string; field_type: string; options: string | null;
  option_colors: string | null; rating_max: number | null;
  display_order: number; levels: string[];
}

function applyDefSync(db: Database.Database, prefix: string, desired: Map<string, DesiredDef>): void {
  const now = Date.now();
  const existing = new Set(
    (db.prepare('SELECT id FROM field_defs WHERE id LIKE ?').all(`${prefix}%`) as { id: string }[]).map(r => r.id)
  );
  const del = db.prepare('DELETE FROM field_defs WHERE id = ?');
  for (const id of existing) if (!desired.has(id)) del.run(id); // cascades values + attachments

  const ins = db.prepare(
    'INSERT INTO field_defs (id, label, field_type, options, option_colors, rating_max, display_order, builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
  );
  const upd = db.prepare(
    'UPDATE field_defs SET label = ?, field_type = ?, options = ?, option_colors = ?, rating_max = ?, display_order = ? WHERE id = ?'
  );
  const delAtt = db.prepare('DELETE FROM field_attachments WHERE field_id = ?');
  const insAtt = db.prepare('INSERT OR IGNORE INTO field_attachments (field_id, level_key) VALUES (?, ?)');
  for (const [id, d] of desired) {
    if (existing.has(id)) upd.run(d.label, d.field_type, d.options, d.option_colors, d.rating_max, d.display_order, id);
    else ins.run(id, d.label, d.field_type, d.options, d.option_colors, d.rating_max, d.display_order, now);
    delAtt.run(id); // attachment set is small; reset to match (handles scope change)
    for (const lvl of d.levels) insAtt.run(id, lvl);
  }
}

// arc_field_defs (+ metadata_field_defs not shadowed by an arc def) → arcf:* defs
export function syncArcFieldDefs(db: Database.Database): void {
  const arcDefs = db.prepare('SELECT * FROM arc_field_defs ORDER BY display_order').all() as
    { id: string; label: string; field_type: string; options: string | null; option_colors: string | null; rating_max: number | null; display_order: number; scope: string }[];
  const metaDefs = db.prepare('SELECT * FROM metadata_field_defs ORDER BY display_order').all() as
    { id: string; label: string; field_type: string; options: string | null; option_colors: string | null; display_order: number }[];
  const arcIds = new Set(arcDefs.map(d => d.id));

  const desired = new Map<string, DesiredDef>();
  for (const d of arcDefs) {
    desired.set(`arcf:${d.id}`, {
      label: d.label, field_type: d.field_type, options: d.options, option_colors: d.option_colors,
      rating_max: d.rating_max, display_order: d.display_order,
      levels: d.scope === 'scene' ? ['scene'] : ['arc', 'plot_point', 'scene'],
    });
  }
  for (const d of metaDefs) {
    if (arcIds.has(d.id)) continue; // arc def shadows a same-id metadata def (refreshFields parity)
    desired.set(`arcf:${d.id}`, {
      label: d.label, field_type: d.field_type, options: d.options, option_colors: d.option_colors,
      rating_max: null, display_order: d.display_order, levels: ['scene'],
    });
  }
  applyDefSync(db, 'arcf:', desired);
}

// task_field_defs → taskf:* defs (label = def name; pseudo-level 'task')
export function syncTaskFieldDefs(db: Database.Database): void {
  const taskDefs = db.prepare('SELECT * FROM task_field_defs ORDER BY display_order').all() as
    { id: string; name: string; field_type: string; options: string | null; display_order: number }[];
  const desired = new Map<string, DesiredDef>();
  for (const d of taskDefs) {
    desired.set(`taskf:${d.id}`, {
      label: d.name, field_type: d.field_type, options: d.options, option_colors: null,
      rating_max: null, display_order: d.display_order, levels: ['task'],
    });
  }
  applyDefSync(db, 'taskf:', desired);
}
