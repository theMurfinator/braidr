import React, { useState, useRef, useEffect } from 'react';
import { Scene, Tag, TagCategory } from '../../shared/types';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface FloatingEditorProps {
  scene: Scene;
  draftContent: string;
  characterName: string;
  tags: Tag[];
  connectedScenes: { id: string; label: string }[];
  onClose: () => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange: (sceneId: string, newTags: string[]) => void;
  onCreateTag: (name: string, category: TagCategory) => void;
  onStartConnection: () => void;
  onRemoveConnection: (targetId: string) => void;
  onWordCountChange: (sceneId: string, wordCount: number | undefined) => void;
  onDraftChange: (sceneKey: string, html: string) => void;
  onOpenInEditor?: (sceneKey: string) => void;
}

export default function FloatingEditor({
  scene,
  draftContent,
  characterName,
  tags,
  connectedScenes,
  onClose,
  onSceneChange,
  onTagsChange,
  onCreateTag,
  onStartConnection,
  onRemoveConnection,
  onWordCountChange,
  onDraftChange,
  onOpenInEditor,
}: FloatingEditorProps) {
  const [localNotes, setLocalNotes] = useState<string[]>(scene.notes);
  const [localWordCount, setLocalWordCount] = useState<string>(scene.wordCount?.toString() || '');
  const [localScratchpad, setLocalScratchpad] = useState('');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [newTagCategory, setNewTagCategory] = useState<'people' | 'locations' | 'arcs' | 'things' | 'time'>('people');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;

  // Clean content for editing (strip tags and formatting)
  const cleanContent = (text: string) => text
    .replace(/==\*\*/g, '')
    .replace(/\*\*==/g, '')
    .replace(/==/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Title editing handlers
  const handleTitleClick = () => {
    setEditTitle(cleanContent(scene.content));
    setIsEditingTitle(true);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditTitle(e.target.value);
    // Auto-resize
    if (titleTextareaRef.current) {
      titleTextareaRef.current.style.height = 'auto';
      titleTextareaRef.current.style.height = titleTextareaRef.current.scrollHeight + 'px';
    }
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (editTitle !== cleanContent(scene.content)) {
      onSceneChange(scene.id, editTitle, scene.notes);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setEditTitle(cleanContent(scene.content));
      setIsEditingTitle(false);
    }
  };

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleTextareaRef.current) {
      titleTextareaRef.current.focus();
      titleTextareaRef.current.style.height = 'auto';
      titleTextareaRef.current.style.height = titleTextareaRef.current.scrollHeight + 'px';
      const len = titleTextareaRef.current.value.length;
      titleTextareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditingTitle]);

  // Notes/Synopsis editor
  const notesEditor = useEditor({
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
    },
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write a synopsis for this scene...',
      }),
    ],
    content: localNotes.join('\n\n'),
    onUpdate: ({ editor }) => {
      const content = editor.getText();
      const newNotes = content.split('\n\n').filter(n => n.trim());
      setLocalNotes(newNotes);
    },
    onBlur: () => {
      onSceneChange(scene.id, scene.content, localNotes);
    },
  });

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && !editorRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAddTag = (tagName: string) => {
    if (!scene.tags.includes(tagName)) {
      onTagsChange(scene.id, [...scene.tags, tagName]);
    }
    setShowTagPicker(false);
    setTagFilter('');
  };

  const handleRemoveTag = (tagName: string) => {
    onTagsChange(scene.id, scene.tags.filter(t => t !== tagName));
  };

  const handleCreateNewTag = () => {
    if (tagFilter.trim()) {
      const normalizedName = tagFilter.trim().toLowerCase().replace(/\s+/g, '_');
      onCreateTag(normalizedName, newTagCategory);
      handleAddTag(normalizedName);
      setNewTagCategory('people'); // Reset to default
    }
  };

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(tagFilter.toLowerCase()) &&
    !scene.tags.includes(tag.name)
  );

  const getTagCategory = (tagName: string): string => {
    const tag = tags.find(t => t.name === tagName);
    return tag?.category || 'people';
  };

  // Clean title for display
  const displayTitle = scene.content
    .replace(/==\*\*/g, '')
    .replace(/\*\*==/g, '')
    .replace(/==/g, '')
    .replace(/#\w+/g, '')
    .trim();

  return (
    <div className="floating-editor-overlay" ref={overlayRef}>
      <div
        className="floating-editor"
        ref={editorRef}
      >
        {/* Header */}
        <div className="floating-editor-header">
          <div className="floating-editor-title-area">
            <span className="floating-editor-character">{characterName}</span>
            <span className="floating-editor-scene-number">Scene {scene.sceneNumber}</span>
          </div>
          {onOpenInEditor && (
            <button
              className="floating-editor-go-to-scene"
              onClick={() => onOpenInEditor(sceneKey)}
            >
              Go to Scene
            </button>
          )}
          <button className="floating-editor-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Scene Title - Editable */}
        <div className="floating-editor-scene-title-wrap">
          {isEditingTitle ? (
            <textarea
              ref={titleTextareaRef}
              className="floating-editor-scene-title-input"
              value={editTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              placeholder="Scene description..."
            />
          ) : (
            <div
              className="floating-editor-scene-title"
              onClick={handleTitleClick}
              title="Click to edit"
            >
              {displayTitle || 'Untitled scene'}
            </div>
          )}
        </div>

        {/* Scene Synopsis — right after title */}
        <div className="floating-editor-synopsis">
          <EditorContent editor={notesEditor} className="floating-editor-notes-editor" />
        </div>

        {/* Metadata */}
        <div className="floating-editor-content">
          {/* Word Count */}
          <div className="floating-editor-word-count">
            <label className="floating-editor-word-count-label">Word Count</label>
            <input
              type="number"
              className="floating-editor-word-count-input"
              placeholder="e.g. 2500"
              value={localWordCount}
              onChange={(e) => setLocalWordCount(e.target.value)}
              onBlur={() => {
                const num = parseInt(localWordCount, 10);
                onWordCountChange(scene.id, isNaN(num) ? undefined : num);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>

          {/* Tags Section */}
          <div className="floating-editor-section">
            <div className="floating-editor-section-header">
              <span className="floating-editor-section-title">Tags</span>
              <button
                className="floating-editor-add-btn"
                onClick={() => setShowTagPicker(!showTagPicker)}
              >
                + Add
              </button>
            </div>
            <div className="floating-editor-tags">
              {scene.tags.map(tag => (
                <span key={tag} className={`floating-editor-tag ${getTagCategory(tag)}`}>
                  #{tag}
                  <button
                    className="floating-editor-tag-remove"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    &times;
                  </button>
                </span>
              ))}
              {scene.tags.length === 0 && (
                <span className="floating-editor-empty">No tags</span>
              )}
            </div>
            {showTagPicker && (
              <div className="floating-editor-tag-picker">
                <div className="floating-editor-tag-picker-row">
                  <input
                    type="text"
                    className="floating-editor-tag-picker-input"
                    placeholder="Search or create tag..."
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagFilter.trim()) {
                        if (filteredTags.length > 0) {
                          handleAddTag(filteredTags[0].name);
                        } else {
                          handleCreateNewTag();
                        }
                      } else if (e.key === 'Escape') {
                        setShowTagPicker(false);
                        setTagFilter('');
                      }
                    }}
                  />
                  <select
                    className="floating-editor-tag-picker-category"
                    value={newTagCategory}
                    onChange={e => setNewTagCategory(e.target.value as typeof newTagCategory)}
                    title="Tag category"
                  >
                    <option value="people">Person</option>
                    <option value="locations">Location</option>
                    <option value="arcs">Arc</option>
                    <option value="things">Thing</option>
                    <option value="time">Time</option>
                  </select>
                </div>
                <div className="floating-editor-tag-list">
                  {filteredTags.slice(0, 8).map(tag => (
                    <button
                      key={tag.id}
                      className={`floating-editor-tag-option ${tag.category}`}
                      onClick={() => handleAddTag(tag.name)}
                    >
                      #{tag.name}
                    </button>
                  ))}
                  {tagFilter.trim() && !filteredTags.some(t => t.name === tagFilter.trim().toLowerCase().replace(/\s+/g, '_')) && (
                    <button
                      className="floating-editor-tag-option create-new"
                      onClick={handleCreateNewTag}
                    >
                      Create "#{tagFilter.trim().toLowerCase().replace(/\s+/g, '_')}"
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Connections Section */}
          <div className="floating-editor-section">
            <div className="floating-editor-section-header">
              <span className="floating-editor-section-title">Connections</span>
              <button
                className="floating-editor-add-btn"
                onClick={onStartConnection}
              >
                + Connect
              </button>
            </div>
            <div className="floating-editor-connections">
              {connectedScenes.map(conn => (
                <span key={conn.id} className="floating-editor-connection">
                  {conn.label}
                  <button
                    className="floating-editor-connection-remove"
                    onClick={() => onRemoveConnection(conn.id)}
                  >
                    &times;
                  </button>
                </span>
              ))}
              {connectedScenes.length === 0 && (
                <span className="floating-editor-empty">No connections</span>
              )}
            </div>
          </div>

          {/* Notes Section */}
          <div className="floating-editor-section floating-editor-notes-section">
            <div className="floating-editor-section-header">
              <span className="floating-editor-section-title">Notes</span>
            </div>
            <div className="floating-editor-scratchpad-wrap">
              <textarea
                className="floating-editor-scratchpad"
                placeholder="Jot down quick notes, ideas, reminders..."
                value={localScratchpad}
                onChange={(e) => setLocalScratchpad(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
