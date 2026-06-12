import type Database from 'better-sqlite3';

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
