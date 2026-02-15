/**
 * Shared utility for converting between TipTap HTML and notes string arrays.
 * Used by SceneCard, EditorView, and SceneDetailPanel to ensure consistent
 * round-trip formatting and ordering.
 */

/** Convert markdown-style bold/italic to HTML tags */
export function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

/** Extract formatted text from a DOM element, converting bold/italic to markdown syntax */
function extractFormattedText(el: Element): string {
  let result = '';
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as Element;
      const tagName = elem.tagName.toLowerCase();
      const inner = extractFormattedText(elem);
      if (tagName === 'strong' || tagName === 'b') {
        result += `**${inner}**`;
      } else if (tagName === 'em' || tagName === 'i') {
        result += `*${inner}*`;
      } else {
        result += inner;
      }
    }
  });
  return result;
}

/**
 * Convert TipTap HTML to a notes string array.
 * Processes elements in DOM order to preserve ordering.
 * Preserves bold/italic as markdown syntax.
 * List items are prefixed with "- " to distinguish them from paragraphs.
 */
export function htmlToNotes(html: string): string[] {
  if (!html || html === '<p></p>') return [];
  const div = document.createElement('div');
  div.innerHTML = html;
  const notes: string[] = [];

  // Process top-level children in DOM order to preserve ordering
  Array.from(div.children).forEach(el => {
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'ul' || tagName === 'ol') {
      // Process list items in order
      Array.from(el.children).forEach(li => {
        if (li.tagName.toLowerCase() === 'li') {
          const text = extractFormattedText(li).trim();
          if (text) notes.push(`- ${text}`);
        }
      });
    } else if (tagName === 'li') {
      // Standalone list item (shouldn't normally happen)
      const text = extractFormattedText(el).trim();
      if (text) notes.push(`- ${text}`);
    } else {
      // Paragraphs, divs, headings, etc.
      const text = extractFormattedText(el).trim();
      if (text) notes.push(text);
    }
  });

  return notes;
}

/**
 * Convert a notes string array to TipTap-compatible HTML.
 * Detects "- " prefixed items and wraps them in <ul>/<li> tags.
 * Converts markdown bold/italic to HTML tags.
 */
export function notesToHtml(notes: string[]): string {
  if (notes.length === 0) return '';
  const parts: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      parts.push(`<ul>${listItems.map(item => `<li><p>${markdownToHtml(item)}</p></li>`).join('')}</ul>`);
      listItems = [];
    }
  };

  for (const note of notes) {
    if (note.startsWith('- ')) {
      listItems.push(note.slice(2));
    } else {
      flushList();
      parts.push(`<p>${markdownToHtml(note)}</p>`);
    }
  }
  flushList();

  return parts.join('');
}
