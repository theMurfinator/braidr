import { describe, it, expect } from 'vitest';
import {
  deriveChapterSpans,
  reconcileChaptersAfterBraidChange,
  computeInsertChapterAssignments,
  computeDeleteChapterAssignments,
} from '../shared/chapterSpans';
import type { Scene, Chapter } from '../shared/types';

function makeScene(overrides: Partial<Scene> & { id: string }): Scene {
  return {
    characterId: 'char1',
    sceneNumber: 1,
    title: '',
    content: '',
    tags: [],
    timelinePosition: null,
    isHighlighted: false,
    notes: [],
    plotPointId: null,
    previousPlotPointId: null,
    chapterId: null,
    sceneOrder: 0,
    stationId: null,
    polarity: '',
    transformation: '',
    dilemma: '',
    propellingAction: '',
    startingState: '',
    endingState: '',
    ...overrides,
  };
}

function makeChapter(overrides: Partial<Chapter> & { id: string; order: number }): Chapter {
  return { title: `Chapter ${overrides.order}`, ...overrides };
}

// Convenience: build N braided scenes with sequential timelinePosition 1..N,
// optionally tagging some with a chapterId.
function braided(specs: { id: string; chapterId?: string | null }[]): Scene[] {
  return specs.map((s, i) => makeScene({ id: s.id, timelinePosition: i + 1, chapterId: s.chapterId ?? null }));
}

describe('deriveChapterSpans', () => {
  it('returns [] for no chapters and no scenes', () => {
    expect(deriveChapterSpans([], [])).toEqual([]);
  });

  it('returns a single null-chapter span when there are no chapters at all', () => {
    const scenes = braided([{ id: 's1' }, { id: 's2' }]);
    const spans = deriveChapterSpans(scenes, []);
    expect(spans).toHaveLength(1);
    expect(spans[0].chapterId).toBeNull();
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('groups contiguous data correctly', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 }), makeChapter({ id: 'ch2', order: 1 })];
    const scenes = braided([
      { id: 's1', chapterId: 'ch1' },
      { id: 's2', chapterId: 'ch1' },
      { id: 's3', chapterId: 'ch2' },
      { id: 's4', chapterId: 'ch2' },
    ]);
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ chapterId: 'ch1' });
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1', 's2']);
    expect(spans[1]).toMatchObject({ chapterId: 'ch2' });
    expect(spans[1].scenes.map(s => s.id)).toEqual(['s3', 's4']);
  });

  it('self-heals legacy non-contiguous data (a chapter span runs to the NEXT chapter\'s first occurrence)', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 }), makeChapter({ id: 'ch2', order: 1 })];
    // ch2 appears at position 1, but a stray scene at position 2 still says ch1 —
    // it must render as part of ch2's span (self-healed), not create a 3rd group.
    const scenes = braided([
      { id: 's1', chapterId: 'ch1' },
      { id: 's2', chapterId: 'ch2' },
      { id: 's3', chapterId: 'ch1' }, // stale/legacy — should NOT reopen ch1
      { id: 's4', chapterId: 'ch2' },
    ]);
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans).toHaveLength(2);
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1']);
    expect(spans[1].chapterId).toBe('ch2');
    expect(spans[1].scenes.map(s => s.id)).toEqual(['s2', 's3', 's4']);
  });

  it('forms a leading "No chapter" span for scenes before any chapter\'s first scene', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 })];
    const scenes = braided([
      { id: 's1' },
      { id: 's2' },
      { id: 's3', chapterId: 'ch1' },
    ]);
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans).toHaveLength(2);
    expect(spans[0].chapterId).toBeNull();
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1', 's2']);
    expect(spans[1].chapterId).toBe('ch1');
    expect(spans[1].scenes.map(s => s.id)).toEqual(['s3']);
  });

  it('excludes unbraided scenes (no timelinePosition) entirely', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 })];
    const scenes = [
      makeScene({ id: 'bullpen1', timelinePosition: null, chapterId: null }),
      ...braided([{ id: 's1', chapterId: 'ch1' }]),
    ];
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans).toHaveLength(1);
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1']);
  });

  it('treats all-unassigned scenes as a single "No chapter" span even when chapters exist', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 }), makeChapter({ id: 'ch2', order: 1 })];
    const scenes = braided([{ id: 's1' }, { id: 's2' }]);
    const spans = deriveChapterSpans(scenes, chapters);
    // No populated chapters -> leading null span with everything, then both
    // chapters rendered as empty spans in order.
    expect(spans.map(s => s.chapterId)).toEqual([null, 'ch1', 'ch2']);
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1', 's2']);
    expect(spans[1].scenes).toEqual([]);
    expect(spans[2].scenes).toEqual([]);
  });

  // ---- Amendment: empty chapters are first-class ----

  it('positions an empty chapter between two populated ones by `order`', () => {
    const chapters = [
      makeChapter({ id: 'a', order: 0 }),
      makeChapter({ id: 'b', order: 1 }), // empty
      makeChapter({ id: 'c', order: 2 }),
    ];
    const scenes = braided([
      { id: 's1', chapterId: 'a' },
      { id: 's2', chapterId: 'a' },
      { id: 's3', chapterId: 'c' },
      { id: 's4', chapterId: 'c' },
    ]);
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans.map(s => s.chapterId)).toEqual(['a', 'b', 'c']);
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1', 's2']);
    expect(spans[1].scenes).toEqual([]);
    expect(spans[2].scenes.map(s => s.id)).toEqual(['s3', 's4']);
  });

  it('positions an empty chapter at the start (before any populated chapter)', () => {
    const chapters = [
      makeChapter({ id: 'empty', order: 0 }),
      makeChapter({ id: 'pop', order: 1 }),
    ];
    const scenes = braided([{ id: 's1', chapterId: 'pop' }, { id: 's2', chapterId: 'pop' }]);
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans.map(s => s.chapterId)).toEqual(['empty', 'pop']);
    expect(spans[0].scenes).toEqual([]);
    expect(spans[1].scenes.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('positions an empty chapter at the end (after the last populated chapter)', () => {
    const chapters = [
      makeChapter({ id: 'pop', order: 0 }),
      makeChapter({ id: 'empty', order: 1 }),
    ];
    const scenes = braided([{ id: 's1', chapterId: 'pop' }, { id: 's2', chapterId: 'pop' }]);
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans.map(s => s.chapterId)).toEqual(['pop', 'empty']);
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1', 's2']);
    expect(spans[1].scenes).toEqual([]);
  });

  it('keeps all chapters as empty spans (in order) when unassigned scenes exist and none are populated', () => {
    const chapters = [makeChapter({ id: 'a', order: 0 }), makeChapter({ id: 'b', order: 1 })];
    const scenes = braided([{ id: 's1' }, { id: 's2' }]); // unassigned
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans.map(s => s.chapterId)).toEqual([null, 'a', 'b']);
    expect(spans[0].scenes.map(s => s.id)).toEqual(['s1', 's2']);
    expect(spans[1].scenes).toEqual([]);
    expect(spans[2].scenes).toEqual([]);
  });

  it('handles multiple empty chapters landing in the same slot, ordered by `order`', () => {
    const chapters = [
      makeChapter({ id: 'pop', order: 0 }),
      makeChapter({ id: 'e2', order: 2 }),
      makeChapter({ id: 'e1', order: 1 }),
    ];
    const scenes = braided([{ id: 's1', chapterId: 'pop' }]);
    const spans = deriveChapterSpans(scenes, chapters);
    expect(spans.map(s => s.chapterId)).toEqual(['pop', 'e1', 'e2']);
  });
});

describe('reconcileChaptersAfterBraidChange', () => {
  it('assigns a scene moved into a chapter\'s span the covering chapterId', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 }), makeChapter({ id: 'ch2', order: 1 })];
    // Scene 'moved' is dragged to position between ch1 and ch2's scenes — it
    // should pick up ch1 (the span it now lands inside).
    const allScenes = braided([
      { id: 's1', chapterId: 'ch1' },
      { id: 'moved', chapterId: 'ch2' }, // stale: used to belong to ch2 before the drag
      { id: 's3', chapterId: 'ch1' },
      { id: 's4', chapterId: 'ch2' },
    ]);
    const result = reconcileChaptersAfterBraidChange(allScenes, chapters, ['moved']);
    expect(result).toEqual([{ sceneId: 'moved', chapterId: 'ch1', sceneOrder: 1 }]);
  });

  it('nulls chapterId when a scene is unbraided (removed from the timeline)', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 })];
    const allScenes = [
      makeScene({ id: 's1', timelinePosition: 1, chapterId: 'ch1' }),
      makeScene({ id: 'removed', timelinePosition: null, chapterId: 'ch1' }),
    ];
    const result = reconcileChaptersAfterBraidChange(allScenes, chapters, ['removed']);
    expect(result).toEqual([{ sceneId: 'removed', chapterId: null, sceneOrder: 0 }]);
  });

  it('assigns the covering chapter when braiding a bullpen scene into an existing chapter\'s range', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 })];
    const allScenes = [
      makeScene({ id: 's1', timelinePosition: 1, chapterId: 'ch1' }),
      makeScene({ id: 'newlyBraided', timelinePosition: 2, chapterId: null }),
      makeScene({ id: 's3', timelinePosition: 3, chapterId: 'ch1' }),
    ];
    const result = reconcileChaptersAfterBraidChange(allScenes, chapters, ['newlyBraided']);
    expect(result).toEqual([{ sceneId: 'newlyBraided', chapterId: 'ch1', sceneOrder: 1 }]);
  });

  it('returns [] when the derived chapter matches the current value (no-op reorder within the same chapter)', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 })];
    const allScenes = braided([
      { id: 's1', chapterId: 'ch1' },
      { id: 's2', chapterId: 'ch1' },
    ]);
    const result = reconcileChaptersAfterBraidChange(allScenes, chapters, ['s2']);
    expect(result).toEqual([]);
  });
});

describe('computeInsertChapterAssignments', () => {
  it('assigns the tail of the covering span (from atIndex onward) to the new chapter', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 })];
    const scenes = braided([
      { id: 's1', chapterId: 'ch1' },
      { id: 's2', chapterId: 'ch1' },
      { id: 's3', chapterId: 'ch1' },
      { id: 's4', chapterId: 'ch1' },
    ]);
    // Insert a new chapter boundary at braid index 2 (s3 onward becomes the new chapter)
    const result = computeInsertChapterAssignments(scenes, chapters, 2, 'newCh');
    expect(result).toEqual([
      { sceneId: 's3', chapterId: 'newCh', sceneOrder: 0 },
      { sceneId: 's4', chapterId: 'newCh', sceneOrder: 1 },
    ]);
  });

  it('returns [] for an out-of-range index', () => {
    const scenes = braided([{ id: 's1' }]);
    expect(computeInsertChapterAssignments(scenes, [], 5, 'newCh')).toEqual([]);
    expect(computeInsertChapterAssignments(scenes, [], -1, 'newCh')).toEqual([]);
  });
});

describe('computeDeleteChapterAssignments', () => {
  it('merges the deleted chapter\'s scenes into the preceding chapter', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 }), makeChapter({ id: 'ch2', order: 1 })];
    const scenes = braided([
      { id: 's1', chapterId: 'ch1' },
      { id: 's2', chapterId: 'ch2' },
      { id: 's3', chapterId: 'ch2' },
    ]);
    const result = computeDeleteChapterAssignments(scenes, chapters, 'ch2');
    expect(result).toEqual([
      { sceneId: 's2', chapterId: 'ch1', sceneOrder: 1 },
      { sceneId: 's3', chapterId: 'ch1', sceneOrder: 2 },
    ]);
  });

  it('merges into "No chapter" (null) when nothing precedes the deleted chapter', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 }), makeChapter({ id: 'ch2', order: 1 })];
    const scenes = braided([
      { id: 's1', chapterId: 'ch1' },
      { id: 's2', chapterId: 'ch2' },
    ]);
    const result = computeDeleteChapterAssignments(scenes, chapters, 'ch1');
    expect(result).toEqual([{ sceneId: 's1', chapterId: null, sceneOrder: 0 }]);
  });

  it('returns [] when deleting an empty chapter (nothing to reassign)', () => {
    const chapters = [makeChapter({ id: 'ch1', order: 0 }), makeChapter({ id: 'empty', order: 1 })];
    const scenes = braided([{ id: 's1', chapterId: 'ch1' }]);
    expect(computeDeleteChapterAssignments(scenes, chapters, 'empty')).toEqual([]);
  });
});
