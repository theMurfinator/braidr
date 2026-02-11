import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Scene, Character, Tag, NoteMetadata } from '../../shared/types';

interface SearchResult {
  type: 'scene' | 'draft' | 'note' | 'character' | 'tag';
  id: string;
  title: string;
  snippet?: string;
  characterId?: string;
  sceneKey?: string;
  noteId?: string;
}

interface SearchOverlayProps {
  scenes: Scene[];
  characters: Character[];
  tags: Tag[];
  draftContent: Record<string, string>;
  notesIndex: NoteMetadata[];
  noteContentCache: Record<string, string>;
  onNavigateToScene: (sceneId: string, characterId: string) => void;
  onNavigateToDraft: (sceneKey: string) => void;
  onNavigateToNote: (noteId: string) => void;
  onNavigateToCharacter: (characterId: string) => void;
  onClose: () => void;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function getSnippet(text: string, query: string, contextLen = 80): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, contextLen * 2);
  const start = Math.max(0, idx - contextLen);
  const end = Math.min(text.length, idx + query.length + contextLen);
  let snippet = '';
  if (start > 0) snippet += '...';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '...';
  return snippet;
}

const MAX_PER_GROUP = 5;

export default function SearchOverlay({ scenes, characters, tags, draftContent, notesIndex, noteContentCache, onNavigateToScene, onNavigateToDraft, onNavigateToNote, onNavigateToCharacter, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Search results
  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];

    const grouped: SearchResult[] = [];

    // Search scenes (outline content)
    const sceneResults: SearchResult[] = [];
    scenes.forEach(scene => {
      const cleanContent = scene.content.replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '').replace(/#\w+/g, '');
      if (cleanContent.toLowerCase().includes(q)) {
        const charName = characters.find(c => c.id === scene.characterId)?.name || '';
        sceneResults.push({
          type: 'scene',
          id: scene.id,
          title: `${charName} — Scene ${scene.sceneNumber}`,
          snippet: getSnippet(cleanContent, q),
          characterId: scene.characterId,
        });
      }
    });
    grouped.push(...sceneResults.slice(0, MAX_PER_GROUP));

    // Search drafts
    const draftResults: SearchResult[] = [];
    Object.entries(draftContent).forEach(([key, html]) => {
      if (!html || html === '<p></p>') return;
      const plainText = stripHtml(html);
      if (plainText.toLowerCase().includes(q)) {
        const [charId, sceneNumStr] = key.split(':');
        const charName = characters.find(c => c.id === charId)?.name || '';
        draftResults.push({
          type: 'draft',
          id: key,
          title: `${charName} — Scene ${sceneNumStr} (draft)`,
          snippet: getSnippet(plainText, q),
          sceneKey: key,
        });
      }
    });
    grouped.push(...draftResults.slice(0, MAX_PER_GROUP));

    // Search notes
    const noteResults: SearchResult[] = [];
    notesIndex.forEach(note => {
      const titleMatch = note.title.toLowerCase().includes(q);
      const contentText = noteContentCache[note.id] ? stripHtml(noteContentCache[note.id]) : '';
      const contentMatch = contentText.toLowerCase().includes(q);
      if (titleMatch || contentMatch) {
        noteResults.push({
          type: 'note',
          id: note.id,
          title: note.title,
          snippet: contentMatch ? getSnippet(contentText, q) : undefined,
          noteId: note.id,
        });
      }
    });
    grouped.push(...noteResults.slice(0, MAX_PER_GROUP));

    // Search characters
    const charResults: SearchResult[] = [];
    characters.forEach(char => {
      if (char.name.toLowerCase().includes(q)) {
        charResults.push({
          type: 'character',
          id: char.id,
          title: char.name,
          characterId: char.id,
        });
      }
    });
    grouped.push(...charResults.slice(0, MAX_PER_GROUP));

    // Search tags
    const tagResults: SearchResult[] = [];
    tags.forEach(tag => {
      if (tag.name.toLowerCase().includes(q)) {
        tagResults.push({
          type: 'tag',
          id: tag.id,
          title: `#${tag.name}`,
        });
      }
    });
    grouped.push(...tagResults.slice(0, MAX_PER_GROUP));

    return grouped;
  }, [debouncedQuery, scenes, characters, tags, draftContent, notesIndex, noteContentCache]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleSelect = useCallback((result: SearchResult) => {
    onClose();
    if (result.type === 'scene' && result.characterId) {
      onNavigateToScene(result.id, result.characterId);
    } else if (result.type === 'draft' && result.sceneKey) {
      onNavigateToDraft(result.sceneKey);
    } else if (result.type === 'note' && result.noteId) {
      onNavigateToNote(result.noteId);
    } else if (result.type === 'character' && result.characterId) {
      onNavigateToCharacter(result.characterId);
    }
  }, [onClose, onNavigateToScene, onNavigateToDraft, onNavigateToNote, onNavigateToCharacter]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const selected = container.querySelector('.search-result-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Highlight match in snippet
  const highlightSnippet = (text: string, q: string) => {
    if (!q) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i}>{part}</mark> : part
    );
  };

  // Group labels for result types
  const getGroupLabel = (type: string): string => {
    switch (type) {
      case 'scene': return 'Scenes';
      case 'draft': return 'Drafts';
      case 'note': return 'Notes';
      case 'character': return 'Characters';
      case 'tag': return 'Tags';
      default: return '';
    }
  };

  // Build grouped display with headers
  const displayItems = useMemo(() => {
    const items: { type: 'header' | 'result'; label?: string; result?: SearchResult; resultIndex?: number }[] = [];
    let lastType = '';
    let idx = 0;
    results.forEach(r => {
      if (r.type !== lastType) {
        items.push({ type: 'header', label: getGroupLabel(r.type) });
        lastType = r.type;
      }
      items.push({ type: 'result', result: r, resultIndex: idx });
      idx++;
    });
    return items;
  }, [results]);

  return (
    <div className="search-overlay-backdrop" onClick={onClose}>
      <div className="search-overlay" onClick={e => e.stopPropagation()}>
        <div className="search-input-row">
          <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search scenes, drafts, notes, characters, tags..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="search-shortcut">esc</kbd>
        </div>
        {debouncedQuery && (
          <div className="search-results" ref={resultsRef}>
            {results.length === 0 ? (
              <div className="search-empty">No results found</div>
            ) : (
              displayItems.map((item, i) => {
                if (item.type === 'header') {
                  return <div key={`h-${i}`} className="search-group-header">{item.label}</div>;
                }
                const r = item.result!;
                const isSelected = item.resultIndex === selectedIndex;
                return (
                  <div
                    key={`${r.type}-${r.id}`}
                    className={`search-result-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setSelectedIndex(item.resultIndex!)}
                  >
                    <span className="search-result-type">{r.type}</span>
                    <div className="search-result-content">
                      <span className="search-result-title">{highlightSnippet(r.title, debouncedQuery)}</span>
                      {r.snippet && (
                        <span className="search-result-snippet">{highlightSnippet(r.snippet, debouncedQuery)}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
