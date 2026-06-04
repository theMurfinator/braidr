import { Scene, PlotPoint } from './types';

/**
 * Placement model shared by the arc, POV, and rails views.
 *
 * A scene/section is in one of three states, derived from two stored fields
 * (`PlotPoint.inBullpen` and `PlotPoint.actId`) plus `Scene.plotPointId`:
 *
 *   - Bullpen: a loose scene (no section) OR a scene in a set-aside section.
 *     Never appears in POV or the rails.
 *   - In play (un-braided): scene sits in a section that is not set aside.
 *     Shown in the POV body and the arc; eligible to be braided once its
 *     section is filed into an act.
 *   - Placed (braidable): in play AND the section is filed into an act.
 *     Only placed scenes may carry a timelinePosition (appear in the rails).
 *
 * The invariant the whole feature rests on: a scene that is not placed must
 * not be braided (timelinePosition === null).
 */

export function indexPlotPoints(plotPoints: PlotPoint[]): Map<string, PlotPoint> {
  const byId = new Map<string, PlotPoint>();
  for (const pp of plotPoints) byId.set(pp.id, pp);
  return byId;
}

/** A section is in play (shown in POV + arc) unless it has been set aside. */
export function isSectionInPlay(section: PlotPoint | undefined): boolean {
  return !!section && !section.inBullpen;
}

/**
 * In play for editing: the scene lives in a section that hasn't been set aside.
 * Drives POV-body and arc visibility. Act assignment is irrelevant here.
 */
export function isSceneInPlay(scene: Scene, byId: Map<string, PlotPoint>): boolean {
  if (scene.plotPointId === null) return false;
  return isSectionInPlay(byId.get(scene.plotPointId));
}

/**
 * Placed = eligible to braid: the scene is in play AND its section is filed
 * into an act. Drives the rails.
 */
export function isScenePlaced(scene: Scene, byId: Map<string, PlotPoint>): boolean {
  if (!isSceneInPlay(scene, byId)) return false;
  const section = byId.get(scene.plotPointId as string);
  return !!section && section.actId !== null;
}

/**
 * Enforce the invariant: clear timelinePosition on every scene that is not
 * placed. Pure — returns a new array only when something changed, and never
 * mutates the inputs.
 */
export function enforceBraidingInvariant(scenes: Scene[], plotPoints: PlotPoint[]): Scene[] {
  const byId = indexPlotPoints(plotPoints);
  let changed = false;
  const next = scenes.map(s => {
    if (s.timelinePosition !== null && !isScenePlaced(s, byId)) {
      changed = true;
      return { ...s, timelinePosition: null };
    }
    return s;
  });
  return changed ? next : scenes;
}
