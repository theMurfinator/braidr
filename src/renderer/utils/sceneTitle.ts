/**
 * Clean a scene title for display: strip markdown highlight markers (==**…**==)
 * and inline #tags, and collapse whitespace. Matches the displayTitle/cleanTitle
 * logic used by RailsSceneCard, FloatingEditor, and EditorView. Display-only —
 * the stored title is unchanged.
 */
export function cleanSceneTitle(text: string | null | undefined): string {
  return (text || '')
    .replace(/==\*\*/g, '')
    .replace(/\*\*==/g, '')
    .replace(/==/g, '')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
