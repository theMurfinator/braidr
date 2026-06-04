import { describe, it, expect } from 'vitest';
import { Scene, PlotPoint } from '../shared/types';
import {
  isSceneInPlay,
  isScenePlaced,
  enforceBraidingInvariant,
  indexPlotPoints,
} from '../shared/placement';

function makeScene(over: Partial<Scene> = {}): Scene {
  return {
    id: 's1', characterId: 'c1', sceneNumber: 1, title: '', content: '', tags: [],
    timelinePosition: null, isHighlighted: false, notes: [], plotPointId: null,
    chapterId: null, sceneOrder: 0, stationId: null, polarity: '', transformation: '',
    dilemma: '', propellingAction: '', startingState: '', endingState: '', ...over,
  };
}

function makeSection(over: Partial<PlotPoint> = {}): PlotPoint {
  return {
    id: 'p1', characterId: 'c1', actId: null, inBullpen: false, title: '',
    expectedSceneCount: null, description: '', order: 0, startingState: '',
    endingState: '', polarity: '', transformation: '', dilemma: '', propellingAction: '', ...over,
  };
}

describe('placement predicates', () => {
  it('a loose scene (no section) is neither in play nor placed', () => {
    const byId = indexPlotPoints([]);
    const s = makeScene({ plotPointId: null });
    expect(isSceneInPlay(s, byId)).toBe(false);
    expect(isScenePlaced(s, byId)).toBe(false);
  });

  it('a scene in a section filed into an act is in play AND placed', () => {
    const sec = makeSection({ id: 'p1', actId: 'act1' });
    const byId = indexPlotPoints([sec]);
    const s = makeScene({ plotPointId: 'p1' });
    expect(isSceneInPlay(s, byId)).toBe(true);
    expect(isScenePlaced(s, byId)).toBe(true);
  });

  it('a scene in a section with no act is in the bullpen (not in play, not placed)', () => {
    const sec = makeSection({ id: 'p1', actId: null });
    const byId = indexPlotPoints([sec]);
    const s = makeScene({ plotPointId: 'p1' });
    expect(isSceneInPlay(s, byId)).toBe(false);   // hidden from POV
    expect(isScenePlaced(s, byId)).toBe(false);   // not braidable
  });

  it('a scene pointing at a missing section is treated as bullpen', () => {
    const byId = indexPlotPoints([]);
    const s = makeScene({ plotPointId: 'ghost' });
    expect(isSceneInPlay(s, byId)).toBe(false);
    expect(isScenePlaced(s, byId)).toBe(false);
  });
});

describe('enforceBraidingInvariant (option-2 bug regression)', () => {
  it('unbraids a braided scene when its section is moved to the bullpen (act cleared)', () => {
    const sec = makeSection({ id: 'p1', actId: null });
    const scenes = [makeScene({ id: 's1', plotPointId: 'p1', timelinePosition: 3 })];
    const [out] = enforceBraidingInvariant(scenes, [sec]);
    expect(out.timelinePosition).toBeNull();
  });

  it('unbraids a braided scene when its act is deleted (section loses its act)', () => {
    const sec = makeSection({ id: 'p1', actId: null });
    const scenes = [makeScene({ id: 's1', plotPointId: 'p1', timelinePosition: 5 })];
    const [out] = enforceBraidingInvariant(scenes, [sec]);
    expect(out.timelinePosition).toBeNull();
  });

  it('unbraids a braided loose scene', () => {
    const scenes = [makeScene({ id: 's1', plotPointId: null, timelinePosition: 1 })];
    const [out] = enforceBraidingInvariant(scenes, []);
    expect(out.timelinePosition).toBeNull();
  });

  it('leaves a properly placed braided scene untouched', () => {
    const sec = makeSection({ id: 'p1', actId: 'act1', inBullpen: false });
    const scenes = [makeScene({ id: 's1', plotPointId: 'p1', timelinePosition: 2 })];
    const result = enforceBraidingInvariant(scenes, [sec]);
    expect(result[0].timelinePosition).toBe(2);
    expect(result).toBe(scenes); // no change → same reference
  });
});
