import { describe, it, expect } from 'vitest';
import {
  preferSpecificOverBullpen,
  resolveArcDrop,
  BULLPEN_ID,
} from '../renderer/utils/arcDnd';

describe('arc DnD collision preference', () => {
  it('prefers a section over the catch-all bullpen panel when both are hit', () => {
    // Reproduces the bug: dragging a scene over a section row inside the bullpen
    // panel also intersects the panel droppable. Without this filter the panel
    // wins and the scene is set aside instead of joining the section.
    const collisions = [{ id: BULLPEN_ID }, { id: 'bullpen-section:s1' }];
    expect(preferSpecificOverBullpen(collisions)).toEqual([{ id: 'bullpen-section:s1' }]);
  });

  it('keeps a scene target over the bullpen panel', () => {
    const collisions = [{ id: BULLPEN_ID }, { id: 'scene-42' }];
    expect(preferSpecificOverBullpen(collisions)).toEqual([{ id: 'scene-42' }]);
  });

  it('falls back to bullpen when only the panel background is under the pointer', () => {
    const collisions = [{ id: BULLPEN_ID }];
    expect(preferSpecificOverBullpen(collisions)).toEqual([{ id: BULLPEN_ID }]);
  });
});

describe('arc drop resolution', () => {
  it('dragging a sectioned scene onto a bullpen section joins that section (not the bullpen)', () => {
    expect(
      resolveArcDrop({
        activeId: 'sc1',
        activeHasSection: true,
        overId: 'bullpen-section:secA',
      }),
    ).toEqual({ kind: 'assignToSection', sceneId: 'sc1', sectionId: 'secA' });
  });

  it('dragging a loose bullpen scene onto a section joins it (the way out of the bullpen)', () => {
    expect(
      resolveArcDrop({
        activeId: 'sc1',
        activeHasSection: false,
        overId: 'bullpen-section:secA',
      }),
    ).toEqual({ kind: 'assignToSection', sceneId: 'sc1', sectionId: 'secA' });
  });

  it('dropping a sectioned scene on the panel background sets it aside', () => {
    expect(
      resolveArcDrop({ activeId: 'sc1', activeHasSection: true, overId: BULLPEN_ID }),
    ).toEqual({ kind: 'setAside', sceneId: 'sc1' });
  });

  it('dropping an already-loose scene on the panel background is a no-op (no dead-end)', () => {
    expect(
      resolveArcDrop({ activeId: 'sc1', activeHasSection: false, overId: BULLPEN_ID }),
    ).toEqual({ kind: 'none' });
  });

  it('dropping on a scene resolves to a reorder', () => {
    expect(
      resolveArcDrop({ activeId: 'sc1', activeHasSection: true, overId: 'sc2', overType: 'arc-scene' }),
    ).toEqual({ kind: 'reorderAtScene', sceneId: 'sc1', overSceneId: 'sc2' });
  });

  it('dropping on an empty section drop zone targets the section start', () => {
    expect(
      resolveArcDrop({ activeId: 'sc1', activeHasSection: false, overId: 'section-empty:secB' }),
    ).toEqual({ kind: 'dropAtSectionStart', sceneId: 'sc1', sectionId: 'secB' });
  });
});
