import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Scene, Tag, TagCategory } from '../../shared/types';
import { htmlToNotes, notesToHtml } from '../utils/notesHtml';

interface SceneDetailPanelProps {
  scene: Scene;
  tags: Tag[];
  characterName: string;
  plotPointTitle?: string;
  timelineDate?: string;
  connectedScenes: { id: string; label: string }[];
  onClose: () => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onTagsChange: (sceneId: string, tags: string[]) => void;
  onCreateTag: (name: string, category: TagCategory) => void;
  onStartConnection?: () => void;
  onRemoveConnection?: (targetId: string) => void;
  onTimelineDateChange?: (date: string) => void;
  timelineEndDate?: string;
  onTimelineEndDateChange?: (date: string) => void;
  onOpenInEditor?: () => void;
  onPrevScene?: () => void;
  onNextScene?: () => void;
}

function SceneDetailPanel({
  scene,
  tags,
  characterName,
  plotPointTitle,
  timelineDate,
  connectedScenes,
  onClose,
  onSceneChange,
  onTagsChange,
  onCreateTag,
  onStartConnection,
  onRemoveConnection,
  onTimelineDateChange,
  timelineEndDate,
  onTimelineEndDateChange,
  onOpenInEditor,
  onPrevScene,
  onNextScene,
}: SceneDetailPanelProps) {
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState<'people' | 'locations' | 'arcs' | 'things' | 'time'>('people');
  const tagPickerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '',
      }),
    ],
    content: notesToHtml(scene.notes),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const notes = htmlToNotes(html);
      if (JSON.stringify(notes) !== JSON.stringify(scene.notes)) {
        onSceneChange(scene.id, scene.content, notes);
      }
    },
  });

  useEffect(() => {
    if (editor && !editor.isFocused) {
      editor.commands.setContent(notesToHtml(scene.notes));
    }
  }, [scene.id, scene.notes, editor]);

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

  const getTagCategory = (tagName: string): string => {
    const tag = tags.find(t => t.name === tagName);
    return tag?.category || 'people';
  };

  const handleToggleTag = (tagName: string) => {
    const currentTags = scene.tags;
    if (currentTags.includes(tagName)) {
      onTagsChange(scene.id, currentTags.filter(t => t !== tagName));
    } else {
      onTagsChange(scene.id, [...currentTags, tagName]);
    }
  };

  const handleCreateNewTag = () => {
    if (!newTagName.trim()) return;
    const cleanName = newTagName.trim().toLowerCase().replace(/\s+/g, '_').replace(/^#/, '');
    if (tags.some(t => t.name === cleanName)) {
      if (!scene.tags.includes(cleanName)) {
        onTagsChange(scene.id, [...scene.tags, cleanName]);
      }
    } else {
      onCreateTag(cleanName, newTagCategory);
      onTagsChange(scene.id, [...scene.tags, cleanName]);
    }
    setNewTagName('');
    setNewTagCategory('people'); // Reset to default
    setShowTagPicker(false);
  };


  return (
    <div className="scene-detail-panel">
      <div className="scene-detail-header">
        <div className="scene-detail-meta">
          <span className="scene-detail-character">{scene.title || `Scene ${scene.sceneNumber}`}</span>
          <span className="scene-detail-number">{characterName} &middot; Scene {scene.sceneNumber}</span>
          {plotPointTitle && <span className="scene-detail-plotpoint">{plotPointTitle}</span>}
        </div>
        <div className="scene-detail-header-actions">
          {(onPrevScene || onNextScene) && (
            <div className="scene-detail-nav">
              <button
                className="scene-detail-nav-btn"
                onClick={onPrevScene}
                disabled={!onPrevScene}
                title="Previous scene"
              >
                &#8249;
              </button>
              <button
                className="scene-detail-nav-btn"
                onClick={onNextScene}
                disabled={!onNextScene}
                title="Next scene"
              >
                &#8250;
              </button>
            </div>
          )}
          {onOpenInEditor && (
            <button className="scene-detail-open-editor-btn" onClick={onOpenInEditor} title="Open in editor">
              Open in Editor
            </button>
          )}
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
      </div>

      <div className="scene-detail-content">

        {onTimelineDateChange && (
          <div className="scene-detail-section">
            <label>Timeline Date</label>
            <div className="timeline-detail-date-row">
              <input
                type="date"
                min="0001-01-01"
                max="2200-12-31"
                className="scene-detail-date-input"
                value={timelineDate || ''}
                onChange={e => onTimelineDateChange(e.target.value)}
              />
              {timelineDate && (
                <button
                  className="timeline-detail-clear-btn"
                  onClick={() => onTimelineDateChange('')}
                  title="Remove from timeline"
                >
                  &times;
                </button>
              )}
            </div>
            {onTimelineEndDateChange && timelineDate && (
              <>
                <label className="scene-detail-sub-label">End Date</label>
                <div className="timeline-detail-date-row">
                  <input
                    type="date"
                    min={timelineDate}
                    max="2200-12-31"
                    className="scene-detail-date-input"
                    value={timelineEndDate || ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val && timelineDate && val < timelineDate) return;
                      onTimelineEndDateChange(val);
                    }}
                  />
                  {timelineEndDate && (
                    <button
                      className="timeline-detail-clear-btn"
                      onClick={() => onTimelineEndDateChange('')}
                      title="Clear end date"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="scene-detail-section">
          <label>Tags</label>
          <div className="scene-detail-tags">
            {scene.tags.map(tagName => (
              <span
                key={tagName}
                className={`tag ${getTagCategory(tagName)} clickable`}
                onClick={() => handleToggleTag(tagName)}
                title="Click to remove"
              >
                #{tagName}
              </span>
            ))}
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
                  <div className="tag-picker-create">
                    <input
                      type="text"
                      placeholder="New tag..."
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
                  {tags
                    .filter(t => !scene.tags.includes(t.name))
                    .map(tag => (
                      <div
                        key={tag.id}
                        className={`tag-picker-item ${tag.category}`}
                        onClick={() => {
                          handleToggleTag(tag.name);
                          setShowTagPicker(false);
                        }}
                      >
                        #{tag.name}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="scene-detail-section">
          <label>Notes</label>
          <div className="scene-detail-notes">
            <EditorContent editor={editor} className="notes-editor" />
          </div>
        </div>

        <div className="scene-detail-section">
          <label>Connections</label>
          <div className="scene-detail-connections">
            {connectedScenes.length === 0 ? (
              <span className="no-connections">No connections yet</span>
            ) : (
              connectedScenes.map(conn => (
                <div key={conn.id} className="connection-item">
                  <span>{conn.label}</span>
                  {onRemoveConnection && (
                    <button
                      className="remove-connection-btn"
                      onClick={() => onRemoveConnection(conn.id)}
                      title="Remove connection"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
            {onStartConnection && (
              <button className="add-connection-btn" onClick={onStartConnection}>
                + Connect to another scene
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SceneDetailPanel;
