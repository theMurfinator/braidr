import React, { useState, useRef, useEffect } from 'react';
import { Tag } from '../../shared/types';

interface FilterBarProps {
  tags: Tag[];
  activeFilters: Set<string>;
  onToggleFilter: (tagName: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  people: 'People',
  locations: 'Locations',
  arcs: 'Arcs',
  things: 'Things',
  time: 'Time',
};

const CATEGORY_ORDER = ['people', 'locations', 'arcs', 'things', 'time'];

function FilterBar({ tags, activeFilters, onToggleFilter }: FilterBarProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Group tags by category
  const tagsByCategory = tags.reduce((acc, tag) => {
    if (!acc[tag.category]) {
      acc[tag.category] = [];
    }
    acc[tag.category].push(tag);
    return acc;
  }, {} as Record<string, Tag[]>);

  // Get active filters as Tag objects
  const activeFilterTags = tags.filter(t => activeFilters.has(t.name));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenCategory(null);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Count active filters per category
  const activeCountByCategory = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = activeFilterTags.filter(t => t.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  const handleCategoryClick = (category: string) => {
    if (openCategory === category) {
      setOpenCategory(null);
      setSearchQuery('');
    } else {
      setOpenCategory(category);
      setSearchQuery('');
    }
  };

  const handleTagClick = (tagName: string) => {
    onToggleFilter(tagName);
  };

  const filteredTags = openCategory
    ? (tagsByCategory[openCategory] || []).filter(tag =>
        tag.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="filter-bar-v2">
      <span className="filter-label">Tags</span>
      {/* Category buttons */}
      <div className="filter-categories">
        {CATEGORY_ORDER.map(category => {
          const categoryTags = tagsByCategory[category];
          if (!categoryTags || categoryTags.length === 0) return null;

          const activeCount = activeCountByCategory[category];
          const isOpen = openCategory === category;

          return (
            <button
              key={category}
              className={`filter-category-btn ${category} ${isOpen ? 'open' : ''} ${activeCount > 0 ? 'has-active' : ''}`}
              onClick={() => handleCategoryClick(category)}
            >
              {CATEGORY_LABELS[category]}
              {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
              <svg
                className={`filter-chevron ${isOpen ? 'open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Active filter chips */}
      {activeFilterTags.length > 0 && (
        <div className="active-filters">
          {activeFilterTags.map(tag => (
            <button
              key={tag.id}
              className={`active-filter-chip ${tag.category}`}
              onClick={() => onToggleFilter(tag.name)}
              title="Click to remove"
            >
              #{tag.name}
              <span className="remove-x">×</span>
            </button>
          ))}
          {activeFilterTags.length > 1 && (
            <button
              className="clear-all-btn"
              onClick={() => activeFilterTags.forEach(t => onToggleFilter(t.name))}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {openCategory && (
        <div className="filter-dropdown" ref={dropdownRef}>
          <input
            type="text"
            className="filter-search"
            placeholder={`Search ${CATEGORY_LABELS[openCategory].toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <div className="filter-dropdown-list">
            {filteredTags.length === 0 ? (
              <div className="filter-dropdown-empty">No tags found</div>
            ) : (
              filteredTags.map(tag => (
                <button
                  key={tag.id}
                  className={`filter-dropdown-item ${activeFilters.has(tag.name) ? 'active' : ''}`}
                  onClick={() => handleTagClick(tag.name)}
                >
                  <span className="filter-check">
                    {activeFilters.has(tag.name) ? '✓' : ''}
                  </span>
                  #{tag.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
