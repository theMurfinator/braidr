import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Heading from '@tiptap/extension-heading';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { ColoredTableRow } from '../../extensions/coloredTableRow';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Wikilink } from '../../extensions/wikilink';
import { Hashtag } from '../../extensions/hashtag';
import { ColumnBlock, Column, ColumnBlockCommands } from '../../extensions/columns';
import { SlashCommand } from '../../extensions/slashCommand';
import { DragHandle } from '../../extensions/dragHandle';
import { TodoWidget } from '../../extensions/todoWidget';
import { createWikilinkSuggestion, WikilinkSuggestionItem } from './WikilinkSuggestion';
import { createHashtagSuggestion } from './HashtagSuggestion';
import { createSlashCommandSuggestion } from './SlashCommandList';
import NoteToolbar from './NoteToolbar';
import TableControls from './TableControls';
import TableContextMenu from './TableContextMenu';
import { dataService } from '../../services/dataService';
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

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

/** Extract inline hashtag names from editor HTML */
function parseHashtags(html: string): string[] {
  const tags: string[] = [];
  const regex = /data-tag="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[1];
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

export default function NoteEditor({
  noteId,
  title,
  content,
  projectPath,
  allNotes,
  scenes,
  characters,
  tags,
  allTags,
  onTitleChange,
  onContentChange,
  onNavigateNote,
  onTagsChange,
}: NoteEditorProps) {
  const [wordCount, setWordCount] = useState(0);
  const [headings, setHeadings] = useState<{ level: number; text: string; id: string }[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [tableContextMenu, setTableContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const settingContentRef = useRef(false);
  const editorRef = useRef<any>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Keep refs for suggestion items so they're always current
  const allNotesRef = useRef(allNotes);
  const scenesRef = useRef(scenes);
  const charactersRef = useRef(characters);
  const projectPathRef = useRef(projectPath);
  const allTagsRef = useRef(allTags);
  const tagsRef = useRef(tags);
  const onTagsChangeRef = useRef(onTagsChange);
  allNotesRef.current = allNotes;
  scenesRef.current = scenes;
  charactersRef.current = characters;
  projectPathRef.current = projectPath;
  allTagsRef.current = allTags;
  tagsRef.current = tags;
  onTagsChangeRef.current = onTagsChange;

  // Build an image src URL using custom protocol (works in both dev and prod)
  const buildImageSrc = useCallback((relativePath: string) => {
    // relativePath is like "images/img_123_abc.png"
    return `braidr-img://${projectPathRef.current}/notes/${relativePath}`;
  }, []);

  // Save an image from base64 data and insert it into the editor
  const handleSaveAndInsertImage = useCallback(async (base64Data: string, fileName: string, editorInstance: any) => {
    try {
      const relativePath = await dataService.saveNoteImage(projectPathRef.current, base64Data, fileName);
      const src = buildImageSrc(relativePath);
      editorInstance.chain().focus().setImage({ src }).run();
    } catch (error) {
      console.error('Failed to save image:', error);
    }
  }, [buildImageSrc]);

  // Open file picker and insert selected image
  const handleInsertImageFromPicker = useCallback(async (editorInstance: any) => {
    try {
      const relativePath = await dataService.selectNoteImage(projectPathRef.current);
      if (!relativePath) return;
      const src = buildImageSrc(relativePath);
      editorInstance.chain().focus().setImage({ src }).run();
    } catch (error) {
      console.error('Failed to insert image:', error);
    }
  }, [buildImageSrc]);

  const slashCommandSuggestion = useMemo(() => createSlashCommandSuggestion(), []);

  const wikilinkSuggestion = useMemo(() => createWikilinkSuggestion((query: string) => {
    const q = query.toLowerCase();
    const items: WikilinkSuggestionItem[] = [];

    // Notes
    for (const note of allNotesRef.current) {
      if (note.id === noteId) continue; // don't link to self
      if (note.title.toLowerCase().includes(q)) {
        items.push({ id: note.id, label: note.title || 'Untitled', type: 'note' });
      }
    }

    // Scenes
    for (const scene of scenesRef.current) {
      const character = charactersRef.current.find(c => c.id === scene.characterId);
      const charName = character?.name || 'Unknown';
      const cleanedContent = scene.content
        .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
        .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
      const label = cleanedContent || `${charName} Scene ${scene.sceneNumber}`;
      const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
      if (label.toLowerCase().includes(q) || charName.toLowerCase().includes(q)) {
        items.push({
          id: sceneKey,
          label,
          type: 'scene',
          description: `${charName} · Scene ${scene.sceneNumber}`,
        });
      }
    }

    return items.slice(0, 12);
  }), [noteId]);

  const hashtagSuggestion = useMemo(() => createHashtagSuggestion((query: string) => {
    const q = query.toLowerCase();
    return allTagsRef.current
      .filter(t => t.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map(t => ({ name: t.name, category: t.category }));
  }), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
      }),
      Heading.configure({ levels: [1, 2, 3] }),
      HorizontalRule,
      Placeholder.configure({
        placeholder: '',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'note-image',
        },
      }),
      Table.configure({ resizable: true }),
      ColoredTableRow,
      TableCell,
      TableHeader,
      Wikilink.configure({
        suggestion: wikilinkSuggestion,
        onNavigate: (targetId, targetType) => {
          if (targetType === 'note') {
            onNavigateNote(targetId);
          }
        },
      }),
      Hashtag.configure({
        suggestion: hashtagSuggestion,
      }),
      ColumnBlock,
      Column,
      ColumnBlockCommands,
      SlashCommand.configure({
        suggestion: slashCommandSuggestion,
      }),
      DragHandle,
      TodoWidget,
    ],
    content,
    onUpdate: ({ editor }) => {
      if (settingContentRef.current) return;
      const html = editor.getHTML();
      pendingContentRef.current = html;
      setWordCount(countWords(html));

      // Extract headings for TOC
      const newHeadings: { level: number; text: string; id: string }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          newHeadings.push({
            level: node.attrs.level,
            text: node.textContent,
            id: `heading-${pos}`,
          });
        }
      });
      setHeadings(newHeadings);

      // Merge inline hashtags into tag metadata
      const inlineTags = parseHashtags(html);
      if (inlineTags.length > 0) {
        const currentTags = tagsRef.current;
        const merged = [...currentTags];
        let changed = false;
        for (const t of inlineTags) {
          if (!merged.includes(t)) {
            merged.push(t);
            changed = true;
          }
        }
        if (changed) {
          onTagsChangeRef.current(merged);
        }
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (pendingContentRef.current !== null) {
          onContentChange(pendingContentRef.current);
          pendingContentRef.current = null;
        }
      }, 800);
    },
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          // Check if right-click is inside a table
          const target = event.target as HTMLElement;
          if (target.closest('table')) {
            event.preventDefault();
            setTableContextMenu({ x: event.clientX, y: event.clientY });
            return true;
          }
          return false;
        },
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;

            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              if (editorRef.current) {
                handleSaveAndInsertImage(base64, file.name || 'pasted-image.png', editorRef.current);
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        // Only handle external file drops, not internal ProseMirror node drags
        // Internal drags have types like 'text/html' but no real file objects with size > 0
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/') && f.size > 0);
        if (imageFiles.length === 0) return false;

        event.preventDefault();

        // Resolve drop position so images insert where the user dropped them
        const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });

        for (const file of imageFiles) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            if (editorRef.current) {
              // Save file first, then insert at the resolved position
              const proj = projectPathRef.current;
              dataService.saveNoteImage(proj, base64, file.name).then((relativePath) => {
                const src = `braidr-img://${proj}/notes/${relativePath}`;
                const ed = editorRef.current;
                if (!ed) return;
                try {
                  if (dropPos?.pos != null) {
                    // Find a valid position for a block node at or near the drop point
                    const $pos = ed.state.doc.resolve(dropPos.pos);
                    // Insert after the current block at the drop point
                    const insertPos = $pos.after($pos.depth);
                    ed.chain().focus().insertContentAt(insertPos, {
                      type: 'image',
                      attrs: { src },
                    }).run();
                  } else {
                    ed.chain().focus().setImage({ src }).run();
                  }
                } catch {
                  // Fallback: insert at cursor if position-based insert fails
                  ed.chain().focus().setImage({ src }).run();
                }
              }).catch((error) => {
                console.error('Failed to save image:', error);
              });
            }
          };
          reader.readAsDataURL(file);
        }
        return true;
      },
    },
  }, [noteId]);

  // Keep editor ref in sync for paste/drop handlers
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Keep TodoWidget storage in sync with scenes and characters
  useEffect(() => {
    if (editor) {
      editor.storage.todoWidget.scenes = scenes;
      editor.storage.todoWidget.characters = characters;
    }
  }, [editor, scenes, characters]);

  // Update editor content when noteId or content changes (content loads async)
  useEffect(() => {
    if (editor && content !== undefined) {
      // Avoid resetting if editor already has this content (during typing)
      const currentHTML = editor.getHTML();
      if (currentHTML === content) return;
      settingContentRef.current = true;
      try {
        editor.commands.setContent(content);
      } catch (e) {
        console.error('Failed to load note content, falling back to plain text:', e);
        // Strip HTML and load as plain text to recover from corrupted content
        const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        editor.commands.setContent(`<p>${plainText}</p>`);
      }
      setWordCount(countWords(content));
      // Extract headings for TOC on load
      const newHeadings: { level: number; text: string; id: string }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          newHeadings.push({
            level: node.attrs.level,
            text: node.textContent,
            id: `heading-${pos}`,
          });
        }
      });
      setHeadings(newHeadings);
      settingContentRef.current = false;
    }
  }, [editor, noteId, content]);

  // Flush pending content on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingContentRef.current !== null) {
        onContentChange(pendingContentRef.current);
      }
    };
  }, []);

  // Listen for slash command image insertion
  useEffect(() => {
    const handleSlashImage = () => {
      if (editorRef.current) {
        handleInsertImageFromPicker(editorRef.current);
      }
    };
    window.addEventListener('braidr-insert-image', handleSlashImage);
    return () => window.removeEventListener('braidr-insert-image', handleSlashImage);
  }, [handleInsertImageFromPicker]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor?.commands.focus('start');
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

  const handleRemoveTag = (tagName: string) => {
    onTagsChange(tags.filter(t => t !== tagName));
  };

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

  const handleTocClick = (index: number) => {
    if (!editor || !scrollableRef.current) return;
    const editorElement = scrollableRef.current.querySelector('.note-editor-content .tiptap');
    if (!editorElement) return;
    const headingEls = editorElement.querySelectorAll('h1, h2, h3');
    if (headingEls[index]) {
      headingEls[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="note-editor">
      <NoteToolbar editor={editor} onInsertImage={() => editor && handleInsertImageFromPicker(editor)} />
      {editor && <TableControls editor={editor} />}
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
          <EditorContent editor={editor} />
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
                    onClick={() => handleTocClick(i)}
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
      {tableContextMenu && editor && (
        <TableContextMenu
          editor={editor}
          x={tableContextMenu.x}
          y={tableContextMenu.y}
          onClose={() => setTableContextMenu(null)}
        />
      )}
    </div>
  );
}
