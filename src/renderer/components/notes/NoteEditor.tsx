import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useCreateBlockNote, useEditorChange, getDefaultReactSlashMenuItems, SuggestionMenuController, FormattingToolbar, FormattingToolbarController, blockTypeSelectItems, SideMenuController, SideMenu, AddBlockButton, DragHandleButton, useBlockNoteEditor, useExtensionState } from '@blocknote/react';
import { SideMenuExtension } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import { BlockNoteSchema, filterSuggestionItems, combineByGroup } from '@blocknote/core';
import { en } from '@blocknote/core/locales';
import type { PartialBlock } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import {
  withMultiColumn,
  multiColumnDropCursor,
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
} from '@blocknote/xl-multi-column';
import { isBlockJson } from '../../../shared/noteContent';
import { NoteMetadata, Scene, Character, Tag, FontSettings } from '../../../shared/types';
import { dataService } from '../../services/dataService';

// Custom side menu: clicking the six-dot handle (1) selects & highlights the whole
// block, and (2) opens the stock drag-handle dropdown (the DragHandleButton is a
// menu trigger, so the same left-click opens it). Defined at module scope for a
// stable component identity. The SideMenu wrapper still applies the .bn-side-menu
// class + data-block-type/data-level attrs our size CSS depends on.
function BraidrSideMenu() {
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { selector: (s: any) => s?.block });
  const selectBlock = () => {
    if (!block) return;
    try {
      const view = editor.prosemirrorView;
      if (!view) return;
      const el = view.dom.querySelector(`.bn-block[data-id="${CSS.escape(block.id)}"]`);
      if (!el) return;
      const $pos = view.state.doc.resolve(view.posAtDOM(el, 0));
      let depth = $pos.depth;
      while (depth > 0 && $pos.node(depth).type.name !== 'blockContainer') depth--;
      // Route through the editor's own tiptap command so we reuse its single
      // prosemirror-state instance (importing our own NodeSelection would fail
      // instanceof checks). setSelection(block, block) is range-only and throws.
      editor._tiptapEditor.commands.setNodeSelection($pos.before(depth));
    } catch (err) {
      console.error('[BraidrSideMenu] selectBlock failed:', err);
    }
  };
  return (
    <SideMenu>
      <AddBlockButton />
      <span onMouseDown={selectBlock} style={{ display: 'contents' }}>
        <DragHandleButton />
      </span>
    </SideMenu>
  );
}

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
  fontSettings?: FontSettings;
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
  // Notes font is the style-guide content font (Literata) and size is the
  // Small/Medium/Large preset, both applied via CSS on .note-editor-content
  // (see styles.css). No per-note font vars are emitted here anymore.
  const [wordCount] = useState(0);
  const [headings] = useState<{ level: number; text: string; id: string }[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const settingContentRef = useRef(false);
  // FROZEN to the mount-time onContentChange so every save (debounced, flushed,
  // or migration) targets THIS note — never a later selection. NoteEditor is
  // remounted per note by NotesView's load gate, so the mount value is always
  // the handler bound to this note. Reassigning per-render caused cross-note
  // saves (a switch rebound this to the new note before the old save flushed).
  const onContentChangeRef = useRef(onContentChange);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  const editor = useCreateBlockNote({
    schema: withMultiColumn(BlockNoteSchema.create()),
    dropCursor: multiColumnDropCursor,
    dictionary: {
      ...en,
      multi_column: multiColumnLocales.en,
    },
    uploadFile: async (file: File): Promise<string> => {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const id = await dataService.saveNoteImage('', dataUrl, file.name);
      return `braidr-img://${id}`;
    },
  });

  // Curated slash menu: BlockNote defaults + multi-column (Columns) items,
  // minus the cluttered/duplicate heading variants (toggle headings + H4-H6).
  const HIDDEN_SLASH_KEYS = useMemo(
    () => new Set(['toggle_heading', 'toggle_heading_2', 'toggle_heading_3', 'heading_4', 'heading_5', 'heading_6']),
    [],
  );
  const getSlashItems = useCallback(async (query: string) => {
    const defaults = getDefaultReactSlashMenuItems(editor).filter(
      (item) => !('key' in item) || !HIDDEN_SLASH_KEYS.has((item as { key: string }).key),
    );
    // Wrap column items so inserting a column layout always leaves a paragraph
    // below it — otherwise the column block traps the cursor with no escape.
    const columnItems = getMultiColumnSlashMenuItems(editor).map((item) => ({
      ...item,
      onItemClick: () => {
        item.onItemClick();
        setTimeout(() => {
          const doc = editor.document;
          const last = doc[doc.length - 1];
          const cursor = editor.getTextCursorPosition();
          const cursorBlock = cursor?.block;
          // If the inserted column list is the last block, append a paragraph.
          if (last?.type === 'columnList' || cursorBlock?.type === 'column') {
            const columnListBlock = doc.find((b) => b.type === 'columnList' && b.id === last?.id);
            if (columnListBlock) {
              editor.insertBlocks(
                [{ type: 'paragraph' }],
                columnListBlock,
                'after',
              );
            }
          }
        }, 0);
      },
    }));
    const combined = combineByGroup(defaults, columnItems);
    return filterSuggestionItems(combined, query);
  }, [editor, HIDDEN_SLASH_KEYS]);

  // Block-type dropdown in the formatting toolbar: keep Heading 1-3 only,
  // drop H4-H6 and the toggle-heading variants (mirrors the slash-menu trim).
  const blockTypeItems = useMemo(
    () => blockTypeSelectItems(editor.dictionary).filter((item) => {
      if (item.type === 'heading') {
        if (item.props?.isToggleable) return false;
        if (Number(item.props?.level ?? 1) > 3) return false;
      }
      return true;
    }),
    [editor],
  );

  // Apply the note's stored content to the editor whenever it changes (note
  // switch or async load). Content follows the prop reactively — relying on
  // mount-only initialContent fails when content arrives a tick after mount.
  const appliedContentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (appliedContentRef.current === content) return; // already applied this exact content
    appliedContentRef.current = content;
    settingContentRef.current = true;
    try {
      if (isBlockJson(content)) {
        editor.replaceBlocks(editor.document, JSON.parse(content) as PartialBlock[]);
      } else if (content.trim()) {
        // Legacy HTML: convert to blocks and persist as JSON (main backs up old HTML)
        const blocks = editor.tryParseHTMLToBlocks(content);
        editor.replaceBlocks(editor.document, blocks);
        onContentChangeRef.current(JSON.stringify(editor.document));
      } else {
        editor.replaceBlocks(editor.document, [{ type: 'paragraph' } as PartialBlock]);
      }
    } catch (e) {
      console.error('[NoteEditor] failed to apply note content:', e);
    } finally {
      setTimeout(() => { settingContentRef.current = false; }, 0);
    }
  }, [editor, content]);

  // Save on change, debounced
  useEditorChange((ed) => {
    if (settingContentRef.current) return;
    const json = JSON.stringify(ed.document);
    pendingContentRef.current = json;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onContentChangeRef.current(json);
      pendingContentRef.current = null;
    }, 800);
  }, editor);

  // Flush any pending (sub-debounce) edit on unmount so fast note-switching
  // never drops the last keystrokes. Saves to this note via the captured ref.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingContentRef.current !== null) {
        onContentChangeRef.current(pendingContentRef.current);
        pendingContentRef.current = null;
      }
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
          <BlockNoteView editor={editor} slashMenu={false} formattingToolbar={false} sideMenu={false}>
            <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
            <FormattingToolbarController
              formattingToolbar={() => <FormattingToolbar blockTypeSelectItems={blockTypeItems} />}
              portalElement={null}
            />
            <SideMenuController sideMenu={BraidrSideMenu} />
          </BlockNoteView>
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
