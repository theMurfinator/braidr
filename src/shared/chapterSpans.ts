// Single source of truth for "what does the braid look like grouped into chapters."
//
// Core semantic (see Launch/plans/chapters-first-class.md): a chapter is a
// CONTIGUOUS run of scenes in the braided (reading) order. Storage keeps the
// existing free per-scene `chapterId` column — contiguity is an application
// invariant enforced here at read time, not a DB constraint. This lets messy/
// legacy data (where a chapter's scenes aren't actually contiguous) render
// sanely without ever rewriting the database on load.
//
// AMENDMENT (2026-07-05): empty chapters (zero scenes) are first-class —
// writers who think chapter-first create a chapter (with a synopsis) before
// braiding anything into it. An empty chapter must still render as its own
// span, positioned by `chapters[].order` ("ord") relative to its neighbors,
// since it has no scene position to derive a spot from.

import type { Scene, Chapter } from './types';

export interface ChapterSpan {
  chapterId: string | null;
  chapter?: Chapter;
  scenes: Scene[];
}

/**
 * Derive contiguous chapter spans from the current braid + chapter list.
 *
 * Populated chapters (>=1 scene in the braid carries their id) are sequenced
 * by the position of their FIRST scene in braid order — this is what makes
 * non-contiguous legacy data self-heal on display (a chapter's span always
 * starts at its first occurrence and runs until the next chapter's first
 * occurrence, regardless of what other scenes' stale chapterId values say).
 *
 * Empty chapters have no scene to anchor on, so they are slotted into that
 * populated sequence using `chapters[].order` ("ord"): an empty chapter is
 * inserted immediately after however many populated chapters have a smaller
 * `order` value than it does. If NO chapter has any scenes yet (including
 * the "all chapters empty" and "no chapters at all" cases), every scene
 * forms a single leading "No chapter" span, followed by the chapters (all
 * empty) in `order` sequence.
 *
 * Scenes without a `timelinePosition` (unbraided / bullpen) are excluded
 * entirely — chapters are a braid-order concept only.
 */
export function deriveChapterSpans(scenes: Scene[], chapters: Chapter[]): ChapterSpan[] {
  const braided = scenes
    .filter(s => s.timelinePosition !== null)
    .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));

  const chapterById = new Map(chapters.map(c => [c.id, c]));

  // First-occurrence index (in braid order) of each chapter that actually
  // has at least one scene pointing at it.
  const firstIndex = new Map<string, number>();
  braided.forEach((s, idx) => {
    if (s.chapterId && chapterById.has(s.chapterId) && !firstIndex.has(s.chapterId)) {
      firstIndex.set(s.chapterId, idx);
    }
  });

  const byOrd = [...chapters].sort((a, b) => a.order - b.order);
  const populatedIds = [...firstIndex.keys()].sort((a, b) => firstIndex.get(a)! - firstIndex.get(b)!);
  const emptyChapters = byOrd.filter(c => !firstIndex.has(c.id));

  // Nothing has a scene yet: everything braided is one leading "No chapter"
  // span (only emitted if non-empty), followed by every chapter — all of
  // which are empty by definition here — in `order` sequence.
  if (populatedIds.length === 0) {
    const spans: ChapterSpan[] = [];
    if (braided.length > 0) spans.push({ chapterId: null, scenes: braided });
    for (const c of emptyChapters) spans.push({ chapterId: c.id, chapter: c, scenes: [] });
    return spans;
  }

  // Slot each empty chapter into the populated spine: "after the k-th
  // populated chapter" where k = how many populated chapters have a
  // smaller `order` than this empty chapter. Ties broken by `order` then id
  // for determinism.
  const populatedOrd = new Map(populatedIds.map(id => [id, chapterById.get(id)!.order]));
  const emptyByOrd = [...emptyChapters].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const slots = new Map<number, Chapter[]>(); // slot index -> empty chapters landing there
  for (const ec of emptyByOrd) {
    let k = 0;
    for (const pid of populatedIds) {
      if (populatedOrd.get(pid)! < ec.order) k++;
    }
    const bucket = slots.get(k) ?? [];
    bucket.push(ec);
    slots.set(k, bucket);
  }

  const spans: ChapterSpan[] = [];

  // Leading "No chapter" span: scenes before the first populated chapter's
  // first occurrence, then any empty chapters slotted at position 0.
  const firstPopulatedIndex = firstIndex.get(populatedIds[0])!;
  if (firstPopulatedIndex > 0) {
    spans.push({ chapterId: null, scenes: braided.slice(0, firstPopulatedIndex) });
  }
  for (const ec of slots.get(0) ?? []) {
    spans.push({ chapterId: ec.id, chapter: ec, scenes: [] });
  }

  populatedIds.forEach((chId, i) => {
    const start = firstIndex.get(chId)!;
    const end = i + 1 < populatedIds.length ? firstIndex.get(populatedIds[i + 1])! : braided.length;
    spans.push({ chapterId: chId, chapter: chapterById.get(chId), scenes: braided.slice(start, end) });

    for (const ec of slots.get(i + 1) ?? []) {
      spans.push({ chapterId: ec.id, chapter: ec, scenes: [] });
    }
  });

  return spans;
}

export interface ChapterAssignment {
  sceneId: string;
  chapterId: string | null;
  sceneOrder: number;
}

/**
 * Given the FULL scene list (post-move) and the chapter list, compute the
 * chapter/sceneOrder assignments that the scenes in `affectedSceneIds` should
 * now have, so the braid's invariant ("chapter membership follows contiguous
 * braid position") holds after a drag/reorder/braid/unbraid.
 *
 * Only scenes whose derived assignment actually differs from their current
 * persisted value are returned — callers persist just those via the existing
 * `assignSceneToChapter` IPC, never a bulk rewrite.
 */
export function reconcileChaptersAfterBraidChange(
  allScenes: Scene[],
  chapters: Chapter[],
  affectedSceneIds: string[],
): ChapterAssignment[] {
  const affected = new Set(affectedSceneIds);
  const results: ChapterAssignment[] = [];

  // Scenes that left the braid entirely (unbraided / set aside) must be
  // cleared — they can never appear in a derived span.
  for (const id of affected) {
    const scene = allScenes.find(s => s.id === id);
    if (scene && scene.timelinePosition === null && scene.chapterId !== null) {
      results.push({ sceneId: id, chapterId: null, sceneOrder: 0 });
    }
  }

  // Scenes still in the braid: null out the affected ones' chapterId before
  // deriving spans, so their stale membership at the OLD position doesn't
  // wrongly anchor a chapter at their NEW position. Whichever span their new
  // position falls into (by index) is their new chapter.
  const braided = allScenes
    .filter(s => s.timelinePosition !== null)
    .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
  const basis = braided.map(s => (affected.has(s.id) ? { ...s, chapterId: null } : s));
  const spans = deriveChapterSpans(basis, chapters);

  for (const span of spans) {
    span.scenes.forEach((s, idx) => {
      if (!affected.has(s.id)) return;
      const original = allScenes.find(o => o.id === s.id);
      if (original && original.chapterId !== span.chapterId) {
        results.push({ sceneId: s.id, chapterId: span.chapterId, sceneOrder: idx });
      }
    });
  }

  return results;
}

/**
 * Compute the assignments needed to insert a new chapter boundary at a braid
 * position: every scene from `atIndex` to the end of whatever span currently
 * covers that position becomes a member of the new chapter (up to, but not
 * including, the next chapter's first scene, if any). Used by Rails' "+
 * Chapter" affordance dropped between/within existing chapter groups.
 */
export function computeInsertChapterAssignments(
  braidedScenes: Scene[],
  chapters: Chapter[],
  atIndex: number,
  newChapterId: string,
): ChapterAssignment[] {
  if (atIndex < 0 || atIndex >= braidedScenes.length) return [];
  const spans = deriveChapterSpans(braidedScenes, chapters);
  let cursor = 0;
  for (const span of spans) {
    const start = cursor;
    const end = cursor + span.scenes.length;
    if (atIndex >= start && atIndex < end) {
      const tail = span.scenes.slice(atIndex - start);
      return tail.map((s, i) => ({ sceneId: s.id, chapterId: newChapterId, sceneOrder: i }));
    }
    cursor = end;
  }
  return [];
}

/**
 * Compute the assignments needed to delete a chapter: every scene in its
 * span merges into the PRECEDING span's chapter (or "No chapter" if none
 * precedes it) per the plan's delete semantics. Returns [] for an empty
 * chapter (nothing to reassign — just delete the chapter row).
 */
export function computeDeleteChapterAssignments(
  braidedScenes: Scene[],
  chapters: Chapter[],
  chapterIdToDelete: string,
): ChapterAssignment[] {
  const spans = deriveChapterSpans(braidedScenes, chapters);
  const idx = spans.findIndex(s => s.chapterId === chapterIdToDelete);
  if (idx === -1 || spans[idx].scenes.length === 0) return [];

  const deletedSpan = spans[idx];
  const precedingSpan = idx > 0 ? spans[idx - 1] : null;
  const targetChapterId = precedingSpan ? precedingSpan.chapterId : null;
  const precedingCount = precedingSpan ? precedingSpan.scenes.length : 0;

  return deletedSpan.scenes.map((s, i) => ({
    sceneId: s.id,
    chapterId: targetChapterId,
    sceneOrder: precedingCount + i,
  }));
}
