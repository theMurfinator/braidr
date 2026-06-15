import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useCreateBlockNote, useEditorChange } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import type { PartialBlock } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { isBlockJson } from '../../../shared/noteContent';
import { NoteMetadata, Scene, Character, Tag } from '../../../shared/types';

interface NoteEditorProps {
  noteId: string;
  title: string;
  content: string;
  projectPath: string;
  allNotes: NoteMetadata[];
  scenes: Scene[];
  characters: Character[];
  tags: string[];
  allTags: Tag[];
  onTitleChange: (title: string) => void;
  onContentChange: (html: string) => void;
  onNavigateNote: (noteId: string) => void;
  onTagsChange: (tags: string[]) => void;
}

export default function NoteEditor({
  noteId: _noteId,
  title,
  content,
  projectPath: _projectPath,
  allNotes: _allNotes,
  scenes: _scenes,
  characters: _characters,
  tags,
  allTags,
  onTitleChange,
  onContentChange,
  onNavigateNote: _onNavigateNote,
  onTagsChange,
}: NoteEditorProps) {
  const [wordCount] = useState(0);
  const [headings] = useState<{ level: number; text: string; id: string }[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingContentRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Compute initial blocks synchronously on mount only (component is remounted per note via key)
  const initialBlocks = useMemo<PartialBlock[] | undefined>(() => {
    if (isBlockJson(content)) {
      try { return JSON.parse(content) as PartialBlock[]; } catch { return undefined; }
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  const editor = useCreateBlockNote({ initialContent: initialBlocks });

  // Convert legacy HTML content to BlockNote JSON on mount (once)
  useEffect(() => {
    if (!editor) return;
    if (isBlockJson(content) || !content.trim()) return; // already JSON or empty: nothing to convert
    let cancelled = false;
    settingContentRef.current = true;
    try {
      // tryParseHTMLToBlocks is synchronous in this version of BlockNote
      const blocks = editor.tryParseHTMLToBlocks(content);
      if (!cancelled) {
        editor.replaceBlocks(editor.document, blocks);
        onContentChange(JSON.stringify(editor.document)); // persist JSON (main process backs up old HTML)
      }
    } catch (e) {
      console.error('Failed to migrate legacy note content to BlockNote:', e);
    } finally {
      setTimeout(() => { settingContentRef.current = false; }, 0);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Save on change, debounced
  useEditorChange((ed) => {
    if (settingContentRef.current) return;
    const json = JSON.stringify(ed.document);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onContentChange(json), 800);
  }, editor);

  // Flush pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor?.focus();
    }
  };

  // Tag autocomplete
  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    const q = tagInput.toLowerCase();
    return allTags
      .filter(t => t.name.toLowerCase().includes(q) && !tags.includes(t.name))
      .slice(0, 8);
  }, [tagInput, allTags, tags]);

  const handleAddTag = (tagName: string) => {
    const trimmed = tagName.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onTagsChange([...tags, trimmed]);
    setTagInput('');
    setTagDropdownOpen(false);
    setTagDropdownIndex(0);
  };

  const handleRemoveTag = useCallback((tagName: string) => {
    onTagsChange(tags.filter(t => t !== tagName));
  }, [onTagsChange, tags]);

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTagDropdownIndex(i => Math.min(i + 1, tagSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTagDropdownIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (tagSuggestions.length > 0 && tagDropdownOpen) {
        handleAddTag(tagSuggestions[tagDropdownIndex]?.name || tagInput);
      } else if (tagInput.trim()) {
        handleAddTag(tagInput);
      }
    } else if (e.key === 'Escape') {
      setTagDropdownOpen(false);
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      handleRemoveTag(tags[tags.length - 1]);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node) &&
          tagInputRef.current && !tagInputRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
      }
      // Close TOC on click outside
      if (tocOpen && tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setTocOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tocOpen]);

  return (
    <div className="note-editor">
      <div className="note-editor-scrollable" ref={scrollableRef}>
        <div className="note-editor-header">
          <input
            ref={titleInputRef}
            className="note-editor-title"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            spellCheck={false}
          />
        </div>
        <div className="note-tag-bar">
          {tags.map(tag => (
            <span key={tag} className="note-tag">
              #{tag}
              <button className="note-tag-remove" onClick={() => handleRemoveTag(tag)}>&times;</button>
            </span>
          ))}
          <div className="note-tag-input-wrapper">
            <input
              ref={tagInputRef}
              className="note-tag-input"
              type="text"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setTagDropdownOpen(true);
                setTagDropdownIndex(0);
              }}
              onFocus={() => { if (tagInput.trim()) setTagDropdownOpen(true); }}
              onKeyDown={handleTagInputKeyDown}
              placeholder={tags.length === 0 ? 'Add tag...' : ''}
              spellCheck={false}
            />
            {tagDropdownOpen && tagSuggestions.length > 0 && (
              <div ref={tagDropdownRef} className="note-tag-autocomplete">
                {tagSuggestions.map((t, i) => (
                  <button
                    key={t.id}
                    className={`note-tag-autocomplete-item ${i === tagDropdownIndex ? 'active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); handleAddTag(t.name); }}
                    onMouseEnter={() => setTagDropdownIndex(i)}
                  >
                    <span className="note-tag-autocomplete-category">{t.category}</span>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="note-editor-content">
          <BlockNoteView editor={editor} />
        </div>
      </div>
      {headings.length > 0 && (
        <div className="note-toc-container" ref={tocRef}>
          <button
            className={`note-toc-toggle ${tocOpen ? 'active' : ''}`}
            onClick={() => setTocOpen(!tocOpen)}
            title="Table of contents"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="3" y1="6" x2="15" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="18" y2="18"/>
            </svg>
          </button>
          {tocOpen && (
            <nav className="note-toc">
              <ul className="note-toc-list">
                {headings.map((h, i) => (
                  <li
                    key={h.id}
                    className={`note-toc-item note-toc-h${h.level}`}
                    onClick={() => {
                      if (!scrollableRef.current) return;
                      const editorElement = scrollableRef.current.querySelector('.note-editor-content');
                      if (!editorElement) return;
                      const headingEls = editorElement.querySelectorAll('h1, h2, h3');
                      if (headingEls[i]) {
                        headingEls[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                  >
                    {h.text || 'Untitled'}
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      )}
      <div className="note-editor-footer">
        <span className="note-editor-word-count">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
      </div>
    </div>
  );
}
