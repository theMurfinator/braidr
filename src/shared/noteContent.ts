/**
 * Returns true if the stored note content is BlockNote block-JSON
 * (always a JSON array of block objects). Legacy notes are HTML strings,
 * for which this returns false. Empty content returns false.
 */
export function isBlockJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed[0] !== '[') return false;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}
