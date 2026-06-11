import { CollisionDetection, pointerWithin, rectIntersection } from '@dnd-kit/core';

/**
 * Arc-view drag-and-drop helpers.
 *
 * The arc Bullpen panel is one large droppable ('bullpen') that physically
 * contains the per-section drop zones nested inside it. Act-less sections live
 * ONLY in this panel (the act-optional model keeps them out of the narrative
 * grid), so for a character with no acts the entire workflow happens inside the
 * panel. With plain closestCenter the big 'bullpen' droppable can win over a
 * section the pointer is directly on top of — which sent every dragged scene to
 * the bullpen and then trapped it there (no section was ever a valid target).
 *
 * The fix: prefer any specific droppable over the catch-all 'bullpen' panel, and
 * only fall back to 'bullpen' (= set the scene aside) when the pointer is over
 * empty panel space.
 */

export const BULLPEN_ID = 'bullpen';
export const SECTION_EMPTY_PREFIX = 'section-empty:';
export const BULLPEN_SECTION_PREFIX = 'bullpen-section:';

type Collision = { id: string | number };

/**
 * Drop the catch-all 'bullpen' panel from the candidate list whenever a more
 * specific droppable (a section or a scene) is also under the pointer. Pure so
 * it can be unit-tested without a DOM.
 */
export function preferSpecificOverBullpen<T extends Collision>(collisions: T[]): T[] {
  const specific = collisions.filter(c => c.id !== BULLPEN_ID);
  return specific.length ? specific : collisions;
}

export const arcCollisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const collisions = within.length ? within : rectIntersection(args);
  return preferSpecificOverBullpen(collisions);
};

export type ArcDropAction =
  | { kind: 'none' }
  | { kind: 'setAside'; sceneId: string }
  | { kind: 'assignToSection'; sceneId: string; sectionId: string }
  | { kind: 'dropAtSectionStart'; sceneId: string; sectionId: string }
  | { kind: 'reorderAtScene'; sceneId: string; overSceneId: string };

/**
 * Map a resolved drop (active scene + over target) onto a high-level action.
 * Pure; the caller computes the concrete scene-number positioning.
 *
 * - over 'bullpen' panel background → set aside (only if the scene is currently
 *   in a section; a loose scene dropped back on the panel is a no-op rather than
 *   a dead-end).
 * - over a bullpen section row → join that section (append).
 * - over an empty section drop zone → drop at the start of that section.
 * - over another scene → reorder relative to it.
 */
export function resolveArcDrop(p: {
  activeId: string;
  activeHasSection: boolean;
  overId: string;
  overType?: string;
}): ArcDropAction {
  const { activeId, activeHasSection, overId, overType } = p;
  if (!overId || overId === activeId) return { kind: 'none' };

  if (overId === BULLPEN_ID) {
    return activeHasSection ? { kind: 'setAside', sceneId: activeId } : { kind: 'none' };
  }
  if (overId.startsWith(BULLPEN_SECTION_PREFIX)) {
    return { kind: 'assignToSection', sceneId: activeId, sectionId: overId.slice(BULLPEN_SECTION_PREFIX.length) };
  }
  if (overId.startsWith(SECTION_EMPTY_PREFIX)) {
    return { kind: 'dropAtSectionStart', sceneId: activeId, sectionId: overId.slice(SECTION_EMPTY_PREFIX.length) };
  }
  if (overType === 'arc-scene') {
    return { kind: 'reorderAtScene', sceneId: activeId, overSceneId: overId };
  }
  return { kind: 'none' };
}
