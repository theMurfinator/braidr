import { Scene, PlotPoint } from './types';

/**
 * Placement model shared by the arc, POV, and rails views.
 *
 * Bullpen membership is driven by a single explicit fact: whether the scene's
 * section has been set aside (`PlotPoint.inBullpen`). Act assignment is OPTIONAL
 * metadata used only to organise the arc view — it does NOT gate placement.
 *
 *   - Bullpen: a loose scene (no section) OR a scene whose section is explicitly
 *     set aside (inBullpen). Hidden from POV and the arc body; never in the rails.
 *   - In play / placed: the scene lives in a section that is not set aside,
 *     whether or not that section is filed into an act. Shown in POV; eligible
 *     to be braided (may carry a timelinePosition).
 *
 * The invariant the whole feature rests on: a scene that is not placed must
 * not be braided (timelinePosition === null).
 */

export function indexPlotPoints(plotPoints: PlotPoint[]): Map<string, PlotPoint> {
  const byId = new Map<string, PlotPoint>();
  for (const pp of plotPoints) byId.set(pp.id, pp);
  return byId;
}

/**
 * A section is in play unless it has been explicitly set aside (inBullpen).
 * Act assignment is irrelevant here — an act-less section is still in play.
 */
export function isSectionInPlay(section: PlotPoint | undefined): boolean {
  return !!section && !section.inBullpen;
}

/**
 * In play: the scene lives in a section that has not been set aside. Drives POV
 * body, arc visibility, and (since "in play" == "braidable" in this model)
 * the rails. A scene with no section, or in a set-aside section, is in the bullpen.
 */
export function isSceneInPlay(scene: Scene, byId: Map<string, PlotPoint>): boolean {
  if (scene.plotPointId === null) return false;
  return isSectionInPlay(byId.get(scene.plotPointId));
}

/** Placed = eligible to braid. Same condition as in play: section filed into an act. */
export function isScenePlaced(scene: Scene, byId: Map<string, PlotPoint>): boolean {
  return isSceneInPlay(scene, byId);
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
