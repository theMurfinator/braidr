/**
 * Detects sync conflict copies created by iCloud or Dropbox.
 *
 * iCloud pattern: "filename (hostname's conflicted copy YYYY-MM-DD).ext"
 * Dropbox pattern: "filename (conflicted copy YYYY-MM-DD).ext"
 */

const CONFLICT_PATTERN = /\(.*conflicted copy.*\)/i;

export interface ConflictFile {
  originalName: string;
  conflictName: string;
  fullPath: string;
}

export function detectConflicts(fileNames: string[], folderPath: string): ConflictFile[] {
  const conflicts: ConflictFile[] = [];
  for (const name of fileNames) {
    if (CONFLICT_PATTERN.test(name)) {
      const originalName = name
        .replace(/\s*\(.*conflicted copy.*\)/i, '')
        .trim();
      conflicts.push({
        originalName,
        conflictName: name,
        fullPath: `${folderPath}/${name}`,
      });
    }
  }
  return conflicts;
}
