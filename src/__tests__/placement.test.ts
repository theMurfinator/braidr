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

describe('placement predicates (act is optional; inBullpen is the only bullpen flag)', () => {
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

  it('a scene in a section with NO act is still in play AND placed (act is optional)', () => {
    const sec = makeSection({ id: 'p1', actId: null, inBullpen: false });
    const byId = indexPlotPoints([sec]);
    const s = makeScene({ plotPointId: 'p1' });
    expect(isSceneInPlay(s, byId)).toBe(true);   // shown in POV
    expect(isScenePlaced(s, byId)).toBe(true);   // braidable
  });

  it('a scene in an explicitly set-aside (inBullpen) section is in the bullpen', () => {
    const sec = makeSection({ id: 'p1', actId: 'act1', inBullpen: true });
    const byId = indexPlotPoints([sec]);
    const s = makeScene({ plotPointId: 'p1' });
    expect(isSceneInPlay(s, byId)).toBe(false);  // hidden from POV
    expect(isScenePlaced(s, byId)).toBe(false);  // not braidable
  });

  it('a scene pointing at a missing section is treated as bullpen', () => {
    const byId = indexPlotPoints([]);
    const s = makeScene({ plotPointId: 'ghost' });
    expect(isSceneInPlay(s, byId)).toBe(false);
    expect(isScenePlaced(s, byId)).toBe(false);
  });
});

describe('enforceBraidingInvariant', () => {
  it('unbraids a braided scene when its section is set aside to the bullpen', () => {
    const sec = makeSection({ id: 'p1', actId: 'act1', inBullpen: true });
    const scenes = [makeScene({ id: 's1', plotPointId: 'p1', timelinePosition: 3 })];
    const [out] = enforceBraidingInvariant(scenes, [sec]);
    expect(out.timelinePosition).toBeNull();
  });

  it('does NOT unbraid a braided scene when its act is merely cleared (act optional)', () => {
    const sec = makeSection({ id: 'p1', actId: null, inBullpen: false });
    const scenes = [makeScene({ id: 's1', plotPointId: 'p1', timelinePosition: 5 })];
    const result = enforceBraidingInvariant(scenes, [sec]);
    expect(result[0].timelinePosition).toBe(5);
    expect(result).toBe(scenes); // no change → same reference
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
