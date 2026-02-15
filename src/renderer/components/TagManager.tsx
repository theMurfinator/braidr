import React, { useState } from 'react';
import { Tag, TagCategory } from '../../shared/types';
import { track } from '../utils/posthogTracker';

interface TagManagerProps {
  tags: Tag[];
  onUpdateTag: (tagId: string, category: TagCategory) => void;
  onCreateTag: (name: string, category: TagCategory) => void;
  onDeleteTag: (tagId: string) => void;
  onClose: () => void;
}

const CATEGORIES: { value: TagCategory; label: string }[] = [
  { value: 'people', label: 'People' },
  { value: 'locations', label: 'Locations' },
  { value: 'arcs', label: 'Arcs' },
  { value: 'things', label: 'Things' },
  { value: 'time', label: 'Time' },
];

function TagManager({ tags, onUpdateTag, onCreateTag, onDeleteTag, onClose }: TagManagerProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState<TagCategory>('people');

  const tagsByCategory = CATEGORIES.map(cat => ({
    ...cat,
    tags: tags.filter(t => t.category === cat.value).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    const cleanName = newTagName.trim().toLowerCase().replace(/\s+/g, '_').replace(/^#/, '');
    if (tags.some(t => t.name === cleanName)) {
      alert('Tag already exists');
      return;
    }
    track('tag_created', { category: newTagCategory });
    onCreateTag(cleanName, newTagCategory);
    setNewTagName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateTag();
    }
  };

  return (
    <div className="tag-manager-overlay" onClick={onClose}>
      <div className="tag-manager" onClick={e => e.stopPropagation()}>
        <div className="tag-manager-header">
          <h2>Manage Tags</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="tag-manager-content">
          {/* Create new tag */}
          <div className="create-tag-section">
            <h3>Create New Tag</h3>
            <div className="create-tag-form">
              <input
                type="text"
                placeholder="Tag name..."
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <select
                value={newTagCategory}
                onChange={e => setNewTagCategory(e.target.value as TagCategory)}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <button onClick={handleCreateTag}>Add</button>
            </div>
          </div>

          {/* Tags by category */}
          <div className="tags-by-category">
            {tagsByCategory.map(category => (
              <div key={category.value} className="tag-category-section">
                <h3 className={`category-header ${category.value}`}>{category.label}</h3>
                <div className="category-tags">
                  {category.tags.length === 0 ? (
                    <span className="no-tags">No tags</span>
                  ) : (
                    category.tags.map(tag => (
                      <div key={tag.id} className="tag-item">
                        <span className={`tag-name ${tag.category}`}>#{tag.name}</span>
                        <select
                          value={tag.category}
                          onChange={e => onUpdateTag(tag.id, e.target.value as TagCategory)}
                          className="category-select"
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                          ))}
                        </select>
                        <button
                          className="delete-tag-btn"
                          onClick={() => onDeleteTag(tag.id)}
                          title="Delete tag"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TagManager;
