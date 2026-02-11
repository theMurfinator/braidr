import { TodoRow } from '../extensions/todoWidget';

export interface SceneTodo {
  todoId: string;       // row ID from the todoWidget or inline todo
  noteTitle: string;    // note title (empty for inline todos)
  noteId: string;       // note ID (empty for inline todos)
  noteFileName: string; // note file name for saving back (empty for inline)
  description: string;
  done: boolean;
  sceneLabel: string;
  sceneKey: string; // "characterId:sceneNumber" — reliable matching key
  isInline?: boolean;   // true for todos added directly in the editor sidebar
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

    // Find all todoWidget divs — attributes can appear in any order
    const regex = /<div[^>]*data-type="todoWidget"[^>]*>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const tag = match[0];
        const rowsMatch = tag.match(/data-rows="([^"]*)"/);
        if (!rowsMatch) continue;
        const rowsStr = rowsMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        const rows: TodoRow[] = JSON.parse(rowsStr);
        for (const row of rows) {
          if (row.sceneKey || row.sceneLabel || row.description) {
            todos.push({
              todoId: row.id,
              noteTitle: note.title,
              noteId: note.id,
              noteFileName: note.fileName,
              description: row.description,
              done: row.done,
              sceneLabel: row.sceneLabel,
              sceneKey: row.sceneKey || '',
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
 * Get todos matching a specific scene for display in the editor sidebar.
 * Uses sceneKey ("characterId:sceneNumber") for reliable matching,
 * with fallback to label-based matching for older todos without a key.
 */
export function getTodosForScene(
  todos: SceneTodo[],
  characterId: string,
  characterName: string,
  sceneNumber: number
): SceneTodo[] {
  const sceneKey = `${characterId}:${sceneNumber}`;

  return todos.filter(todo => {
    // Primary: match by sceneKey (reliable)
    if (todo.sceneKey) {
      return todo.sceneKey === sceneKey;
    }
    // Fallback: match by label for older todos without sceneKey
    const label = todo.sceneLabel.toLowerCase();
    const searchTerms = [
      `${characterName} — ${sceneNumber}`,
      `${characterName} — scene ${sceneNumber}`,
      `${characterName} - scene ${sceneNumber}`,
    ].map(t => t.toLowerCase());
    return searchTerms.some(term => label.includes(term));
  });
}

/**
 * Toggle a todo's done state in the raw note HTML.
 * Returns the updated HTML string, or null if the todo wasn't found.
 */
export function toggleTodoInNoteHtml(html: string, todoId: string, newDone: boolean): string | null {
  // Find all todoWidget divs
  const regex = /<div[^>]*data-type="todoWidget"[^>]*>/g;
  let result = html;
  let found = false;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    const rowsMatch = tag.match(/data-rows="([^"]*)"/);
    if (!rowsMatch) continue;

    try {
      const rowsStr = rowsMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const rows: TodoRow[] = JSON.parse(rowsStr);

      const rowIdx = rows.findIndex(r => r.id === todoId);
      if (rowIdx === -1) continue;

      // Toggle the done state
      rows[rowIdx] = { ...rows[rowIdx], done: newDone };
      found = true;

      // Re-encode to HTML attribute format
      const newRowsJson = JSON.stringify(rows)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Replace the old data-rows attribute value
      const newTag = tag.replace(/data-rows="[^"]*"/, `data-rows="${newRowsJson}"`);
      result = result.replace(tag, newTag);
      break;
    } catch {
      continue;
    }
  }

  return found ? result : null;
}
