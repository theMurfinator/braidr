import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Scene, Tag, MetadataFieldDef } from '../../shared/types';

interface SceneCardProps {
  scene: Scene;
  tags: Tag[];
  showCharacter: boolean;
  characterName?: string;
  displayNumber?: number;
  plotPointTitle?: string;
  onSceneChange?: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange?: (sceneId: string, tags: string[]) => void;
  onCreateTag?: (name: string, category: 'people' | 'locations' | 'arcs' | 'things' | 'time') => void;
  onDeleteScene?: (sceneId: string) => void;
  onDuplicateScene?: (sceneId: string) => void;
  collapsedNotes?: boolean;
  backgroundColor?: string;
  showDragHandle?: boolean;
  dragHandleRef?: (el: HTMLSpanElement | null) => void;
  forceNotesExpanded?: boolean | null;
  // Movement arrows for POV view
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  // Connection props for braided view
  connectedScenes?: { id: string; label: string }[];
  onStartConnection?: () => void;
  onRemoveConnection?: (targetId: string) => void;
  onWordCountChange?: (sceneId: string, wordCount: number | undefined) => void;
  connectableScenes?: { id: string; label: string }[];
  onCompleteConnection?: (targetSceneId: string) => void;
  onOpenInEditor?: (sceneKey: string) => void;
  // Metadata props
  metadataFieldDefs?: MetadataFieldDef[];
  sceneMetadata?: Record<string, string | string[]>;
  onMetadataChange?: (sceneId: string, fieldId: string, value: string | string[]) => void;
  onMetadataFieldDefsChange?: (defs: MetadataFieldDef[]) => void;
}

function SceneCard({
  scene,
  tags,
  showCharacter,
  characterName,
  displayNumber,
  plotPointTitle,
  onSceneChange,
  onTagsChange,
  onCreateTag,
  onDeleteScene,
  onDuplicateScene,
  collapsedNotes = false,
  backgroundColor,
  showDragHandle = false,
  dragHandleRef,
  forceNotesExpanded = null,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  connectedScenes,
  onStartConnection,
  onRemoveConnection,
  onWordCountChange,
  connectableScenes,
  onCompleteConnection,
  onOpenInEditor,
  metadataFieldDefs = [],
  sceneMetadata = {},
  onMetadataChange,
  onMetadataFieldDefsChange,
}: SceneCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(scene.content);
  const [notesExpanded, setNotesExpanded] = useState(!collapsedNotes);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState<'people' | 'locations' | 'arcs' | 'things' | 'time'>('people');
  const [isEditingWordCount, setIsEditingWordCount] = useState(false);
  const [editWordCount, setEditWordCount] = useState(scene.wordCount?.toString() ?? '');
  const [showConnectSearch, setShowConnectSearch] = useState(false);
  const [connectSearchText, setConnectSearchText] = useState('');
  const connectSearchRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'dropdown' | 'multiselect'>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // Use refs to always have current values in callbacks
  const sceneRef = useRef(scene);
  const editContentRef = useRef(editContent);
  sceneRef.current = scene;
  editContentRef.current = editContent;

  // Convert markdown-style formatting to HTML for TipTap
  const markdownToHtml = (text: string): string => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
  };

  // Convert HTML formatting to markdown-style for storage
  const htmlToMarkdown = (html: string): string => {
    return html
      .replace(/<strong>(.+?)<\/strong>/g, '**$1**')
      .replace(/<b>(.+?)<\/b>/g, '**$1**')
      .replace(/<em>(.+?)<\/em>/g, '*$1*')
      .replace(/<i>(.+?)<\/i>/g, '*$1*')
      .replace(/<[^>]+>/g, '') // Strip remaining HTML tags
      .trim();
  };

  // Convert notes array to HTML for TipTap
  const notesToHtml = (notes: string[]): string => {
    if (notes.length === 0) return '';
    return notes.map(note => `<p>${markdownToHtml(note)}</p>`).join('');
  };

  // Convert TipTap HTML back to notes array (preserving formatting as markdown)
  const htmlToNotes = (html: string): string[] => {
    const div = document.createElement('div');
    div.innerHTML = html;
    const notes: string[] = [];
    const seen = new Set<string>();

    // Helper to extract formatted text from an element
    const extractFormattedText = (el: Element): string => {
      let result = '';
      el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          result += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const elem = node as Element;
          const tagName = elem.tagName.toLowerCase();
          const innerText = extractFormattedText(elem);
          if (tagName === 'strong' || tagName === 'b') {
            result += `**${innerText}**`;
          } else if (tagName === 'em' || tagName === 'i') {
            result += `*${innerText}*`;
          } else {
            result += innerText;
          }
        }
      });
      return result;
    };

    // Process list items first (they may contain p tags)
    div.querySelectorAll('li').forEach(el => {
      const text = extractFormattedText(el).trim();
      if (text && !seen.has(text)) {
        notes.push(text);
        seen.add(text);
      }
    });

    // Then process standalone paragraphs (not inside lists)
    div.querySelectorAll('p').forEach(el => {
      // Skip if this p is inside a list item
      if (el.closest('li')) return;
      const text = extractFormattedText(el).trim();
      if (text && !seen.has(text)) {
        notes.push(text);
        seen.add(text);
      }
    });

    return notes;
  };

  // TipTap editor for notes
  const editor = useEditor({
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
    },
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({
        placeholder: '',
      }),
    ],
    content: notesToHtml(scene.notes),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const notes = htmlToNotes(html);
      // Use refs to get current values (closures would capture stale values)
      const currentScene = sceneRef.current;
      const currentContent = editContentRef.current;
      if (JSON.stringify(notes) !== JSON.stringify(currentScene.notes) && onSceneChange) {
        onSceneChange(currentScene.id, currentContent, notes);
      }
    },
  });

  // Update editor content when scene changes
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const newHtml = notesToHtml(scene.notes);
      if (editor.getHTML() !== newHtml) {
        editor.commands.setContent(newHtml);
      }
    }
  }, [scene.notes, editor]);

  useEffect(() => {
    // Store clean content (without tags) for editing display
    setEditContent(cleanContent(scene.content));
  }, [scene.content]);

  useEffect(() => {
    if (!isEditingWordCount) {
      setEditWordCount(scene.wordCount?.toString() ?? '');
    }
  }, [scene.wordCount, isEditingWordCount]);

  useEffect(() => {
    setNotesExpanded(!collapsedNotes);
  }, [collapsedNotes]);

  useEffect(() => {
    if (forceNotesExpanded !== null) {
      setNotesExpanded(forceNotesExpanded);
    }
  }, [forceNotesExpanded]);

  // Close tag picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagPicker(false);
      }
    };
    if (showTagPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTagPicker]);

  // Close connect search when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (connectSearchRef.current && !connectSearchRef.current.contains(e.target as Node)) {
        setShowConnectSearch(false);
        setConnectSearchText('');
      }
    };
    if (showConnectSearch) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConnectSearch]);

  const handleToggleTag = (tagName: string) => {
    if (!onTagsChange) return;
    const currentTags = scene.tags;
    if (currentTags.includes(tagName)) {
      onTagsChange(scene.id, currentTags.filter(t => t !== tagName));
    } else {
      onTagsChange(scene.id, [...currentTags, tagName]);
    }
  };

  const handleCreateNewTag = () => {
    if (!newTagName.trim() || !onCreateTag || !onTagsChange) return;
    const cleanName = newTagName.trim().toLowerCase().replace(/\s+/g, '_').replace(/^#/, '');
    if (tags.some(t => t.name === cleanName)) {
      // Tag exists, just add it to the scene
      if (!scene.tags.includes(cleanName)) {
        onTagsChange(scene.id, [...scene.tags, cleanName]);
      }
    } else {
      // Create new tag with selected category and add to scene
      onCreateTag(cleanName, newTagCategory);
      onTagsChange(scene.id, [...scene.tags, cleanName]);
    }
    setNewTagName('');
    setNewTagCategory('people'); // Reset to default
    setShowTagPicker(false);
  };

  const getTagCategory = (tagName: string): string => {
    const tag = tags.find(t => t.name === tagName);
    return tag?.category || 'people';
  };

  const cleanContent = (text: string) => text
    .replace(/==\*\*/g, '')
    .replace(/\*\*==/g, '')
    .replace(/==/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '')  // Strip tags
    .replace(/\s+/g, ' ')            // Collapse multiple spaces
    .trim();

  const numberToShow = displayNumber ?? scene.sceneNumber;

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  };

  // Title editing - use cleaned content (without tags) for editing
  const handleContentClick = () => {
    setEditContent(cleanContent(scene.content));
    setIsEditing(true);
  };
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
    autoResize(textareaRef.current);
  };
  const handleContentBlur = () => {
    setIsEditing(false);
    if (editContent !== scene.content && onSceneChange) {
      onSceneChange(scene.id, editContent, scene.notes);
    }
  };
  const handleContentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditContent(cleanContent(scene.content));
      setIsEditing(false);
    }
  };

  const toggleNotesExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotesExpanded(!notesExpanded);
  };

  const toggleMetadataExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMetadataExpanded(!metadataExpanded);
  };

  const toggleMultiselect = (fieldId: string, option: string) => {
    if (!onMetadataChange) return;
    const current = sceneMetadata[fieldId];
    const currentArray = Array.isArray(current) ? current : [];
    const updated = currentArray.includes(option)
      ? currentArray.filter(v => v !== option)
      : [...currentArray, option];
    onMetadataChange(scene.id, fieldId, updated);
  };

  const handleAddField = () => {
    if (!onMetadataFieldDefsChange || !newFieldLabel.trim()) return;

    const newField: MetadataFieldDef = {
      id: `field_${Date.now()}`,
      label: newFieldLabel.trim(),
      type: newFieldType,
      options: (newFieldType === 'dropdown' || newFieldType === 'multiselect')
        ? newFieldOptions.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      order: metadataFieldDefs.filter(f => f.id !== '_status').length,
    };

    const statusDef = metadataFieldDefs.find(f => f.id === '_status');
    const otherDefs = metadataFieldDefs.filter(f => f.id !== '_status');
    const updatedDefs = statusDef ? [statusDef, ...otherDefs, newField] : [...otherDefs, newField];

    onMetadataFieldDefsChange(updatedDefs);

    // Reset form
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldOptions('');
    setShowAddField(false);
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize(textareaRef.current);
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const hasNotes = scene.notes.length > 0 || (editor && editor.getText().trim().length > 0);

  return (
    <div
      className={`scene-card ${isEditing ? 'editing' : ''}`}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <div className="scene-row">
        {/* Main content - now full width */}
        <div className="scene-content">
          <div className="scene-header">
            {/* Movement arrows for POV view */}
            {(onMoveUp || onMoveDown) && (
              <div className="scene-move-buttons">
                <button
                  className="scene-move-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveUp?.();
                  }}
                  disabled={!canMoveUp}
                  title="Move scene up"
                >
                  ▲
                </button>
                <button
                  className="scene-move-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveDown?.();
                  }}
                  disabled={!canMoveDown}
                  title="Move scene down"
                >
                  ▼
                </button>
              </div>
            )}

            {/* Drag handle for braided view */}
            {showDragHandle && !onMoveUp && !onMoveDown && (
              <span
                className="scene-drag-handle"
                ref={dragHandleRef}
              >
                ⋮⋮
              </span>
            )}

            <span className="scene-number">{numberToShow}.</span>

            {isEditing ? (
              <textarea
                ref={textareaRef}
                className="scene-edit-textarea"
                value={editContent}
                onChange={handleContentChange}
                onBlur={handleContentBlur}
                onKeyDown={handleContentKeyDown}
                rows={1}
              />
            ) : (
              <span className="scene-title" onClick={handleContentClick}>
                {cleanContent(editContent)}
              </span>
            )}

            {showCharacter && characterName && (
              <span className="scene-character">{characterName}</span>
            )}

            {plotPointTitle && (
              <span className="scene-plotpoint">{plotPointTitle}</span>
            )}

            {onOpenInEditor && (
              <button
                className="open-in-editor-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInEditor(`${scene.characterId}:${scene.sceneNumber}`);
                }}
                title="Go to Scene in Editor"
              >
                →
              </button>
            )}
            {onDuplicateScene && (
              <button
                className="duplicate-scene-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicateScene(scene.id);
                }}
                title="Duplicate scene"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            )}
            {onDeleteScene && (
              <button
                className="delete-scene-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Archive this scene? You can restore it later from the archive.')) {
                    onDeleteScene(scene.id);
                  }
                }}
                title="Archive scene"
              >
                ×
              </button>
            )}
          </div>

          <div className="scene-tags">
        {scene.tags.map(tagName => (
          <span
            key={tagName}
            className={`tag ${getTagCategory(tagName)} ${onTagsChange ? 'clickable' : ''}`}
            onClick={() => onTagsChange && handleToggleTag(tagName)}
            title={onTagsChange ? 'Click to remove' : undefined}
          >
            #{tagName}
          </span>
        ))}
        {onTagsChange && (
          <div className="tag-picker-container" ref={tagPickerRef}>
            <button
              className="add-tag-btn"
              onClick={() => setShowTagPicker(!showTagPicker)}
              title="Add tag"
            >
              +
            </button>
            {showTagPicker && (
              <div className="tag-picker-dropdown">
                {onCreateTag && (
                  <div className="tag-picker-create">
                    <input
                      type="text"
                      placeholder="Search or create..."
                      value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateNewTag();
                        }
                      }}
                      autoFocus
                    />
                    <select
                      className="tag-picker-category"
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
                    <button onClick={handleCreateNewTag} disabled={!newTagName.trim()}>
                      Add
                    </button>
                  </div>
                )}
                {(() => {
                  const filteredTags = tags
                    .filter(t => !scene.tags.includes(t.name))
                    .filter(t => !newTagName.trim() || t.name.toLowerCase().includes(newTagName.trim().toLowerCase()));

                  if (filteredTags.length === 0) {
                    return !onCreateTag && !newTagName.trim() && <div className="tag-picker-empty">No more tags available</div>;
                  }

                  return filteredTags.map(tag => (
                    <div
                      key={tag.id}
                      className={`tag-picker-item ${tag.category}`}
                      onClick={() => {
                        handleToggleTag(tag.name);
                        setShowTagPicker(false);
                        setNewTagName('');
                      }}
                    >
                      #{tag.name}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}
      </div>

          {/* Synopsis section with toggle inside */}
          <div className="scene-synopsis-section">
            <div className="scene-notes">
              <div className="scene-synopsis-header">
                <button className="synopsis-toggle-btn" onClick={toggleNotesExpanded} title={notesExpanded ? 'Collapse synopsis' : 'Expand synopsis'}>
                  {notesExpanded ? '▾' : '▸'} Synopsis
                </button>
              </div>
              {notesExpanded && (
                <>
                  <EditorContent editor={editor} className="notes-editor" />

              {/* Metadata Properties Section */}
              {onMetadataChange && onMetadataFieldDefsChange && (
                <div className="scene-metadata-section">
                  <button
                    className="metadata-toggle-btn"
                    onClick={toggleMetadataExpanded}
                  >
                    {metadataExpanded ? '▾' : '▸'} Properties
                  </button>
                  {metadataExpanded && (
                    <div className="scene-metadata-fields">
                      {/* Connection controls */}
                      {(onStartConnection || connectedScenes || onWordCountChange) && (
                        <div className="scene-connections-inline">
                          {connectedScenes && connectedScenes.length > 0 && (
                            <div className="connected-scenes-list">
                              {connectedScenes.map(conn => (
                                <span key={conn.id} className="connected-scene-chip">
                                  {conn.label}
                                  {onRemoveConnection && (
                                    <button
                                      className="remove-connection-chip-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveConnection(conn.id);
                                      }}
                                      title="Remove connection"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="scene-actions-row">
                            {connectableScenes && onCompleteConnection ? (
                              <div className="connect-search-container" ref={connectSearchRef}>
                                {showConnectSearch ? (
                                  <div className="connect-search-dropdown">
                                    <input
                                      type="text"
                                      className="connect-search-input"
                                      placeholder="Search scenes..."
                                      value={connectSearchText}
                                      onChange={(e) => setConnectSearchText(e.target.value)}
                                      autoFocus
                                    />
                                    <div className="connect-search-results">
                                      {connectableScenes
                                        .filter(s => !connectSearchText.trim() || s.label.toLowerCase().includes(connectSearchText.trim().toLowerCase()))
                                        .map(s => (
                                          <button
                                            key={s.id}
                                            className="connect-search-item"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onCompleteConnection(s.id);
                                              setShowConnectSearch(false);
                                              setConnectSearchText('');
                                            }}
                                          >
                                            {s.label}
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    className="add-connection-inline-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowConnectSearch(true);
                                    }}
                                  >
                                    + Connect
                                  </button>
                                )}
                              </div>
                            ) : onStartConnection && (
                              <button
                                className="add-connection-inline-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartConnection();
                                }}
                              >
                                + Connect
                              </button>
                            )}
                            {onWordCountChange && (
                              <div className="word-count-box">
                                {isEditingWordCount ? (
                                  <input
                                    type="number"
                                    min="0"
                                    className="word-count-input"
                                    value={editWordCount}
                                    onChange={(e) => setEditWordCount(e.target.value)}
                                    onBlur={() => {
                                      setIsEditingWordCount(false);
                                      const val = editWordCount.trim() === '' ? undefined : parseInt(editWordCount, 10);
                                      if (!isNaN(val as number) || val === undefined) {
                                        onWordCountChange(scene.id, val);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        setIsEditingWordCount(false);
                                        const val = editWordCount.trim() === '' ? undefined : parseInt(editWordCount, 10);
                                        if (!isNaN(val as number) || val === undefined) {
                                          onWordCountChange(scene.id, val);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setEditWordCount(scene.wordCount?.toString() ?? '');
                                        setIsEditingWordCount(false);
                                      }
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  <button
                                    className="word-count-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsEditingWordCount(true);
                                    }}
                                  >
                                    {scene.wordCount !== undefined ? `${scene.wordCount.toLocaleString()} words` : '+ Words'}
                                  </button>
                                )}
                              </div>
                            )}
                            {/* Status indicator */}
                            {(() => {
                              const statusField = metadataFieldDefs.find(f => f.id === '_status');
                              const status = sceneMetadata['_status'] as string | undefined;
                              if (status && statusField) {
                                const color = statusField.optionColors?.[status] || '#9e9e9e';
                                return (
                                  <span className="scene-status-pill" style={{ '--status-color': color } as React.CSSProperties}>
                                    {status}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      )}
                      {metadataFieldDefs
                        .filter(field => field.id !== '_status')
                        .sort((a, b) => a.order - b.order)
                        .map(field => {
                          const value = sceneMetadata[field.id];
                          return (
                            <div key={field.id} className="scene-metadata-field">
                              <label className="scene-metadata-field-label">
                                {field.label}
                              </label>
                              {field.type === 'text' && (
                                <textarea
                                  className="scene-metadata-field-input"
                                  value={(value as string) || ''}
                                  onChange={(e) => onMetadataChange(scene.id, field.id, e.target.value)}
                                  placeholder="—"
                                  rows={1}
                                  onInput={(e) => {
                                    const el = e.currentTarget;
                                    el.style.height = 'auto';
                                    el.style.height = el.scrollHeight + 'px';
                                  }}
                                  ref={(el) => {
                                    if (el) {
                                      el.style.height = 'auto';
                                      el.style.height = el.scrollHeight + 'px';
                                    }
                                  }}
                                />
                              )}
                              {field.type === 'dropdown' && (
                                <select
                                  className="scene-metadata-field-select"
                                  value={(value as string) || ''}
                                  onChange={(e) => onMetadataChange(scene.id, field.id, e.target.value)}
                                >
                                  <option value="">—</option>
                                  {field.options?.map(option => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {field.type === 'multiselect' && (
                                <div className="scene-metadata-chips">
                                  {field.options?.map(option => {
                                    const selected = Array.isArray(value) && value.includes(option);
                                    const color = field.optionColors?.[option];
                                    return (
                                      <button
                                        key={option}
                                        className={`scene-metadata-chip ${selected ? 'selected' : ''}`}
                                        onClick={() => toggleMultiselect(field.id, option)}
                                        style={color ? {
                                          backgroundColor: selected ? color : 'transparent',
                                          borderColor: color,
                                          color: selected ? '#fff' : color,
                                        } : undefined}
                                      >
                                        {option}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                      {/* Add Field Form */}
                      {showAddField ? (
                        <div className="scene-metadata-add-form">
                          <input
                            type="text"
                            className="scene-metadata-field-input"
                            placeholder="Field label"
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            autoFocus
                          />
                          <select
                            className="scene-metadata-field-select"
                            value={newFieldType}
                            onChange={(e) => setNewFieldType(e.target.value as 'text' | 'dropdown' | 'multiselect')}
                          >
                            <option value="text">Text</option>
                            <option value="dropdown">Dropdown</option>
                            <option value="multiselect">Multiselect</option>
                          </select>
                          {(newFieldType === 'dropdown' || newFieldType === 'multiselect') && (
                            <input
                              type="text"
                              className="scene-metadata-field-input"
                              placeholder="Options (comma-separated)"
                              value={newFieldOptions}
                              onChange={(e) => setNewFieldOptions(e.target.value)}
                            />
                          )}
                          <div className="scene-metadata-add-actions">
                            <button
                              className="scene-metadata-add-btn"
                              onClick={handleAddField}
                              disabled={!newFieldLabel.trim()}
                            >
                              Add
                            </button>
                            <button
                              className="scene-metadata-cancel-btn"
                              onClick={() => {
                                setShowAddField(false);
                                setNewFieldLabel('');
                                setNewFieldType('text');
                                setNewFieldOptions('');
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="scene-metadata-add-field-btn"
                          onClick={() => setShowAddField(true)}
                        >
                          + Add Field
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SceneCard;
