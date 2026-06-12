import type Database from 'better-sqlite3';

// Versioned schema migrations (docs/data-model/TO-BE.md §7, Phase 1).
//
// PRAGMA user_version is the source of truth:
//   0 = pre-versioned database (anything created before this file existed)
//   1 = the v1.5.150 schema as built by CREATE_SCHEMA + the legacy
//       column checks in database.ts migrate() (the "baseline")
//   2+ = applied from MIGRATIONS below, in order, each in its own
//       transaction, with user_version stamped atomically alongside it.
//
// Rules:
// - Migrations are append-only. Never edit or reorder a shipped entry.
// - The legacy ad-hoc checks in migrate() stay frozen as part of the
//   baseline; every schema change from now on is a Migration here.
// - Before applying pending migrations to an existing database, a
//   checkpoint copy is written next to the file (VACUUM INTO). If the
//   checkpoint cannot be written, the migration does not run.

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 2,
    name: 'mutation_log',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS mutation_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          name TEXT NOT NULL,
          args_json TEXT NOT NULL,
          inverse_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_mutation_log_ts ON mutation_log(ts);
      `);
    },
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce((v, m) => Math.max(v, m.version), 1);

function writeCheckpoint(db: Database.Database, filePath: string, fromVersion: number): void {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${filePath}.pre-v${fromVersion}-${ts}.bak`;
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
}

export function runMigrations(
  db: Database.Database,
  filePath: string,
  isFreshDb: boolean
): { from: number; to: number } {
  let current = db.pragma('user_version', { simple: true }) as number;

  if (current === 0) {
    // Pre-versioned database: CREATE_SCHEMA + legacy migrate() have just
    // brought it to the baseline. Stamp it.
    db.pragma('user_version = 1');
    current = 1;
  }

  const pending = MIGRATIONS
    .filter(m => m.version > current)
    .sort((a, b) => a.version - b.version);
  if (pending.length === 0) return { from: current, to: current };

  const from = current;
  if (!isFreshDb) {
    // Fail closed: an existing project does not migrate without a checkpoint.
    writeCheckpoint(db, filePath, current);
  }

  for (const m of pending) {
    const apply = db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    });
    apply();
    current = m.version;
  }

  return { from, to: current };
}
