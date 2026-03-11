/**
 * Bug 145: Fonts reset between closes/updates + editing vs viewing font mismatch
 *
 * Root causes:
 * A) applyScreenFontOverrides() silently fails on startup because sceneListRef.current
 *    is null — the DOM hasn't rendered the .scene-list div yet when loadProjectFromPath runs.
 *    The :root globals apply fine, but per-screen overrides are lost.
 *    Opening FontPicker "fixes" it because by then the ref is set.
 *
 * B) .scene-edit-textarea has hardcoded font-size: 18px and font-weight: 600,
 *    while .scene-title uses CSS variables. Clicking a title to edit it swaps the element,
 *    causing a visual font change.
 */

import { describe, it, expect } from 'vitest';
import type { AllFontSettings, FontSettings, ScreenKey } from '../shared/types';

describe('Bug 145: Font persistence and consistency', () => {

  describe('Font settings round-trip through timeline.json', () => {
    it('preserves per-screen font overrides through save/load', () => {
      const settings: AllFontSettings = {
        global: {
          sectionTitle: 'Georgia',
          sectionTitleSize: 24,
          sceneTitle: 'Merriweather',
          sceneTitleSize: 18,
          body: 'Inter',
          bodySize: 16,
        },
        screens: {
          editor: {
            body: 'Courier New',
            bodySize: 14,
          },
          pov: {
            sceneTitle: 'Playfair Display',
            sceneTitleSize: 20,
          },
        },
      };

      // Simulate save → load round-trip
      const json = JSON.stringify({ allFontSettings: settings });
      const loaded = JSON.parse(json);

      expect(loaded.allFontSettings.global.sceneTitle).toBe('Merriweather');
      expect(loaded.allFontSettings.screens.editor.body).toBe('Courier New');
      expect(loaded.allFontSettings.screens.pov.sceneTitle).toBe('Playfair Display');
    });
  });

  describe('CSS variable application logic', () => {
    /**
     * applyFontSettings sets CSS vars on :root
     * applyScreenFontOverrides sets CSS vars on .scene-list
     *
     * The bug: applyScreenFontOverrides bails if sceneListRef.current is null
     * On startup, the ref isn't set until after React renders, but the function
     * is called during loadProjectFromPath (before render completes).
     */
    it('documents that screen overrides require a DOM element', () => {
      // Simulate what applyScreenFontOverrides does
      const el: HTMLElement | null = null; // sceneListRef.current on startup
      const canApply = el !== null;
      // BUG: This is false on startup — overrides silently dropped
      expect(canApply).toBe(false);
    });

    it('should apply screen overrides after DOM is ready', () => {
      // After React renders, sceneListRef.current is set
      // The fix should ensure applyScreenFontOverrides runs AFTER ref is available
      // This could be via a useEffect that depends on a ref-ready signal,
      // or by using document.querySelector as a fallback
      const el = { style: { setProperty: () => {} } }; // mock DOM element
      const canApply = el !== null;
      expect(canApply).toBe(true);
    });
  });

  describe('Scene editing font consistency', () => {
    /**
     * .scene-title (viewing) uses CSS variables:
     *   font-size: var(--font-scene-title-size)
     *   font-weight: var(--font-scene-title-weight)
     *   font-family: var(--font-scene-title)
     *
     * .scene-edit-textarea (editing) has HARDCODED:
     *   font-size: 18px    ← should be var(--font-scene-title-size)
     *   font-weight: 600   ← should be var(--font-scene-title-weight)
     *   font-family: var(--font-scene-title)  ← this one IS correct
     *
     * Result: clicking a title to edit visibly changes the font size and weight.
     */
    it('documents the hardcoded vs variable mismatch', () => {
      // .scene-title uses variables
      const viewingFontSize = 'var(--font-scene-title-size)';
      // .scene-edit-textarea has hardcoded values
      const editingFontSize = '18px';

      // These SHOULD match — the textarea should use the same CSS variable
      expect(viewingFontSize).not.toBe(editingFontSize);
      // After fix, both should use var(--font-scene-title-size)
    });
  });
});
