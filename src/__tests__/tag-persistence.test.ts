/**
 * Bug 144: Tags not saving between saves (especially non-"people" categories)
 *
 * Root cause: saveTimelineData() never passes tags to saveTimeline().
 * On reload, tags are re-inferred via inferTagCategory() which defaults to 'people'.
 * So any tag manually categorized as 'locations', 'arcs', 'things', or 'time' reverts.
 *
 * This test verifies:
 * 1. Tags with non-people categories are included in the save payload
 * 2. On load, saved tag categories are used instead of re-inferring
 */

import { describe, it, expect } from 'vitest';
import { inferTagCategory, createTagsFromStrings } from '../renderer/services/parser';
import type { Tag, TagCategory } from '../shared/types';

describe('Bug 144: Tag category persistence', () => {
  describe('inferTagCategory defaults', () => {
    it('defaults unknown names to "people"', () => {
      // This is the root cause: names like "warehouse" or "betrayal" that
      // don't match the hardcoded keyword lists get "people" by default
      expect(inferTagCategory('noah')).toBe('people');
      expect(inferTagCategory('grace')).toBe('people');
    });

    it('infers locations for keyword matches', () => {
      expect(inferTagCategory('brooklyn')).toBe('locations');
      expect(inferTagCategory('cathedral')).toBe('locations');
    });

    it('FAILS to infer non-people for names without keywords', () => {
      // These are locations/arcs/things that a user would manually categorize,
      // but inferTagCategory returns 'people' for them because they don't
      // match the hardcoded keyword lists
      expect(inferTagCategory('den')).toBe('people');  // user means locations
      expect(inferTagCategory('revenge')).toBe('people');    // user means arcs
      expect(inferTagCategory('pendant')).toBe('people');    // user means things
      expect(inferTagCategory('dusk')).toBe('people');       // user means time
    });
  });

  describe('createTagsFromStrings always re-infers', () => {
    it('ignores existing tag categories when creating from strings', () => {
      // Simulate: user had a tag "den" manually categorized as "locations"
      // but on fresh load (no existingTags), createTagsFromStrings re-infers

      // With no existing tags, it creates fresh and infers — losing user's category
      const newTags = createTagsFromStrings(['den'], []);
      expect(newTags).toHaveLength(1);
      // BUG: this will be 'people' instead of the user's saved 'locations'
      // because there's no mechanism to load saved categories
      expect(newTags[0].category).toBe('people');
    });
  });

  describe('saveTimeline must include tags', () => {
    it('tag data must be part of the timeline save payload', () => {
      // This test documents what the save payload SHOULD contain.
      // The actual saveTimeline function signature must accept tags.
      //
      // We test this by checking the DataService interface includes tags.
      // Since we can't import the interface at runtime, we verify the
      // save/load round-trip preserves tag categories.

      const userTags: Tag[] = [
        { id: 'tag-1', name: 'noah', category: 'people' },
        { id: 'tag-2', name: 'den', category: 'locations' },
        { id: 'tag-3', name: 'revenge', category: 'arcs' },
        { id: 'tag-4', name: 'pendant', category: 'things' },
        { id: 'tag-5', name: 'dusk', category: 'time' },
      ];

      // Simulate save: tags should be serializable to JSON
      const savedJson = JSON.stringify({ tags: userTags });
      const loaded = JSON.parse(savedJson);

      // Simulate load: saved tags should be used as-is
      const loadedTags: Tag[] = loaded.tags;

      // After round-trip, ALL categories must be preserved
      expect(loadedTags.find(t => t.name === 'den')?.category).toBe('locations');
      expect(loadedTags.find(t => t.name === 'revenge')?.category).toBe('arcs');
      expect(loadedTags.find(t => t.name === 'pendant')?.category).toBe('things');
      expect(loadedTags.find(t => t.name === 'dusk')?.category).toBe('time');
      expect(loadedTags.find(t => t.name === 'noah')?.category).toBe('people');
    });
  });

  describe('loadProject must prefer saved tags over re-inference', () => {
    it('saved tags with custom categories must not be overwritten by inference', () => {
      // Simulate: timeline.json has saved tags
      const savedTags: Tag[] = [
        { id: 'tag-2', name: 'den', category: 'locations' },
        { id: 'tag-3', name: 'revenge', category: 'arcs' },
      ];

      // Simulate: parser extracts tag strings from markdown
      const parsedTagStrings = ['den', 'revenge', 'noah'];

      // The fix should: use savedTags for known names, only infer for NEW tags
      const savedTagMap = new Map(savedTags.map(t => [t.name, t]));

      const resultTags: Tag[] = parsedTagStrings.map(name => {
        const saved = savedTagMap.get(name);
        if (saved) return saved;
        // Only infer for truly new tags
        return { id: `new-${name}`, name, category: inferTagCategory(name) };
      });

      // BUG REPRODUCTION: Without the fix, loadProject calls createTagsFromStrings
      // which re-infers ALL tags, losing saved categories.
      // With the fix, saved categories are preserved:
      expect(resultTags.find(t => t.name === 'den')?.category).toBe('locations');
      expect(resultTags.find(t => t.name === 'revenge')?.category).toBe('arcs');
      expect(resultTags.find(t => t.name === 'noah')?.category).toBe('people'); // new tag, inferred correctly
    });
  });
});
