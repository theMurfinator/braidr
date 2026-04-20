import * as fs from 'fs';
import * as path from 'path';

const PRESERVED_KEYS = [
  'tasks',
  'taskFieldDefs',
  'taskViews',
  'taskColumnWidths',
  'archivedScenes',
  'worldEvents',
] as const;

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/**
 * Writes timeline.json for a project, preserving task-family data when the
 * incoming payload omits fields that exist in the current file on disk.
 *
 * The renderer serializes via JSON.stringify, which drops keys with undefined
 * values. Any caller that forgets to pass tasks etc. would otherwise silently
 * wipe them — this is the regression that destroyed tasks on 2026-04-20.
 * Explicit empty arrays/objects from the caller are respected (user cleared).
 */
export function saveTimelineToDisk(folderPath: string, data: Record<string, unknown>): void {
  const timelinePath = path.join(folderPath, 'timeline.json');

  let merged: Record<string, unknown> = data;
  if (fs.existsSync(timelinePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(timelinePath, 'utf-8')) as Record<string, unknown>;
      merged = { ...data };
      for (const key of PRESERVED_KEYS) {
        const incomingMissing = !(key in data) || data[key] === undefined;
        if (incomingMissing && !isEmpty(existing[key])) {
          merged[key] = existing[key];
        }
      }
    } catch {
      // Corrupt or unreadable existing file — fall through to write incoming as-is.
    }
  }

  const tmpPath = timelinePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
  fs.renameSync(tmpPath, timelinePath);
}
