import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { backfillBullpenOrigins } from '../main/migrations';

// Minimal schema slice the backfill touches.
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE plot_points (id TEXT PRIMARY KEY);
    CREATE TABLE scenes (
      id TEXT PRIMARY KEY,
      plot_point_id TEXT,
      previous_plot_point_id TEXT,
      deleted_at INTEGER
    );
    CREATE TABLE mutation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      inverse_json TEXT
    );
  `);
  return db;
}

function logMove(db: Database.Database, sceneId: string, toPlotPointId: string | null, fromPlotPointId: string | null) {
  db.prepare('INSERT INTO mutation_log (name, args_json, inverse_json) VALUES (?, ?, ?)').run(
    'scene.move',
    JSON.stringify({ sceneId, toPlotPointId, afterSceneId: null }),
    JSON.stringify({ name: 'scene.move', args: { sceneId, toPlotPointId: fromPlotPointId, afterSceneId: null, timelinePosition: null } }),
  );
}

function prev(db: Database.Database, id: string): string | null {
  return (db.prepare('SELECT previous_plot_point_id FROM scenes WHERE id = ?').get(id) as { previous_plot_point_id: string | null }).previous_plot_point_id;
}

describe('backfillBullpenOrigins', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
    db.prepare('INSERT INTO plot_points (id) VALUES (?)').run('A');
    db.prepare('INSERT INTO plot_points (id) VALUES (?)').run('B');
    // X is intentionally NOT inserted — represents a since-deleted section.
  });

  it('recovers the origin section for a set-aside bullpen scene', () => {
    db.prepare("INSERT INTO scenes (id, plot_point_id) VALUES ('s1', NULL)").run();
    logMove(db, 's1', null, 'A'); // s1 was moved to bullpen, came from A
    const n = backfillBullpenOrigins(db);
    expect(n).toBe(1);
    expect(prev(db, 's1')).toBe('A');
  });

  it('leaves origin null when the section was since deleted', () => {
    db.prepare("INSERT INTO scenes (id, plot_point_id) VALUES ('s2', NULL)").run();
    logMove(db, 's2', null, 'X'); // came from X, which no longer exists
    backfillBullpenOrigins(db);
    expect(prev(db, 's2')).toBeNull();
  });

  it('skips within-bullpen reorders and finds the real origin underneath', () => {
    db.prepare("INSERT INTO scenes (id, plot_point_id) VALUES ('s3', NULL)").run();
    logMove(db, 's3', null, 'B');   // older: left section B for the bullpen
    logMove(db, 's3', null, null);  // newer: reordered within the bullpen (origin null)
    backfillBullpenOrigins(db);
    expect(prev(db, 's3')).toBe('B');
  });

  it('uses the most recent set-aside when a scene left two different sections', () => {
    db.prepare("INSERT INTO scenes (id, plot_point_id) VALUES ('s4', NULL)").run();
    logMove(db, 's4', null, 'A'); // older set-aside from A
    logMove(db, 's4', null, 'B'); // newer set-aside from B (after a return)
    backfillBullpenOrigins(db);
    expect(prev(db, 's4')).toBe('B');
  });

  it('does not touch scenes that already have an origin, are in a section, or are deleted', () => {
    db.prepare("INSERT INTO scenes (id, plot_point_id, previous_plot_point_id) VALUES ('s5', NULL, 'A')").run();
    db.prepare("INSERT INTO scenes (id, plot_point_id) VALUES ('s6', 'B')").run();
    db.prepare("INSERT INTO scenes (id, plot_point_id, deleted_at) VALUES ('s7', NULL, 123)").run();
    logMove(db, 's5', null, 'B');
    logMove(db, 's6', null, 'A');
    logMove(db, 's7', null, 'A');
    const n = backfillBullpenOrigins(db);
    expect(n).toBe(0);
    expect(prev(db, 's5')).toBe('A'); // unchanged
    expect(prev(db, 's6')).toBeNull();
    expect(prev(db, 's7')).toBeNull();
  });

  it('leaves origin null when there is no log entry', () => {
    db.prepare("INSERT INTO scenes (id, plot_point_id) VALUES ('s8', NULL)").run();
    backfillBullpenOrigins(db);
    expect(prev(db, 's8')).toBeNull();
  });
});
