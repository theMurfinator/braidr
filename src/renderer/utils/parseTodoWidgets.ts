import { TodoRow } from '../extensions/todoWidget';

export interface SceneTodo {
  noteTitle: string;
  noteId: string;
  description: string;
  done: boolean;
  sceneLabel: string;
}

/**
 * Parse all todoWidget blocks from a map of note HTML content,
 * returning a flat list of SceneTodo items.
 */
export function extractTodosFromNotes(
  noteContentCache: Record<string, string>,
  notesIndex: { id: string; title: string; fileName: string }[]
): SceneTodo[] {
  const todos: SceneTodo[] = [];

  for (const note of notesIndex) {
    const html = noteContentCache[note.id];
    if (!html) continue;

    // Find all todoWidget divs
    const regex = /data-type="todoWidget"[^>]*data-rows="([^"]*)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const rowsStr = match[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        const rows: TodoRow[] = JSON.parse(rowsStr);
        for (const row of rows) {
          if (row.sceneLabel || row.description) {
            todos.push({
              noteTitle: note.title,
              noteId: note.id,
              description: row.description,
              done: row.done,
              sceneLabel: row.sceneLabel,
            });
          }
        }
      } catch {
        // Skip malformed data
      }
    }
  }

  return todos;
}

/**
 * Group todos by scene label for display in the editor sidebar.
 * Matches loosely against character name and scene number.
 */
export function getTodosForScene(
  todos: SceneTodo[],
  characterName: string,
  sceneNumber: number
): SceneTodo[] {
  const searchTerms = [
    `${characterName} — Scene ${sceneNumber}`,
    `${characterName} - Scene ${sceneNumber}`,
    `${characterName} Scene ${sceneNumber}`,
    `${characterName} #${sceneNumber}`,
  ].map(t => t.toLowerCase());

  return todos.filter(todo => {
    const label = todo.sceneLabel.toLowerCase();
    return searchTerms.some(term => label.includes(term) || term.includes(label));
  });
}
