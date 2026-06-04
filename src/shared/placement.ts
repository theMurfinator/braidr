import { Scene, PlotPoint } from './types';

/**
 * Placement model shared by the arc, POV, and rails views.
 *
 * Bullpen membership is driven by a single fact: whether the scene's section is
 * filed into an act (`PlotPoint.actId`).
 *
 *   - Bullpen: a loose scene (no section) OR a scene whose section has no act.
 *     Hidden from POV and the arc body; never in the rails. New sections start
 *     here (created with actId === null) until filed into an act.
 *   - In play / placed: the scene's section is filed into an act. Shown in POV
 *     and the arc; eligible to be braided (may carry a timelinePosition).
 *
 * The invariant the whole feature rests on: a scene that is not placed must
 * not be braided (timelinePosition === null).
 *
 * (`PlotPoint.inBullpen` is retained on the type/schema but no longer drives
 * behavior — act membership is the single source of truth.)
 */

export function indexPlotPoints(plotPoints: PlotPoint[]): Map<string, PlotPoint> {
  const byId = new Map<string, PlotPoint>();
  for (const pp of plotPoints) byId.set(pp.id, pp);
  return byId;
}

/**
 * A section is in play iff it is filed into an act. A section with no act is in
 * the bullpen: hidden from POV and the arc body, its scenes un-braidable.
 */
export function isSectionInPlay(section: PlotPoint | undefined): boolean {
  return !!section && section.actId !== null;
}

/**
 * In play: the scene lives in a section that is filed into an act. Drives POV
 * body, arc visibility, and (since "in play" == "braidable" in this model)
 * the rails. A scene with no section, or in an act-less section, is in the bullpen.
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
