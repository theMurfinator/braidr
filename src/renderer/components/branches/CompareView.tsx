import { useState, useEffect, useMemo } from 'react';
import { BranchIndex, BranchCompareData, BranchSceneDiff } from '../../../shared/types';
import { dataService } from '../../services/dataService';

interface CompareViewProps {
  projectPath: string;
  branchIndex: BranchIndex;
  characterColors: Record<string, string>;
  onClose: () => void;
  onMerge: (branchName: string, sceneIds: string[]) => void;
}

const MAIN_VALUE = '__main__';
const DEFAULT_COLOR = '#6b7280';

function stripFormatting(title: string): string {
  return title
    .replace(/==\*\*(.*?)\*\*==/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type ChangeLabel = 'Benched' | 'Moved' | 'Renamed' | 'Rewritten' | 'New Scene' | 'Deleted';

function getChangeLabel(diff: BranchSceneDiff): ChangeLabel {
  if (diff.changeType === 'added') return 'New Scene';
  if (diff.changeType === 'removed') return 'Deleted';
  // modified
  if (diff.rightPosition === null) return 'Benched';
  if (diff.leftPosition === null) return 'Moved'; // was benched in main, now has a position
  if (diff.leftTitle !== diff.rightTitle && diff.leftPosition === diff.rightPosition) return 'Renamed';
  return 'Moved';
}

const LABEL_COLOR: Record<ChangeLabel, string> = {
  'Benched':    '#ef4444',
  'Deleted':    '#ef4444',
  'Moved':      '#f59e0b',
  'Renamed':    '#3b82f6',
  'Rewritten':  '#8b5cf6',
  'New Scene':  '#22c55e',
};

function getDeltaText(diff: BranchSceneDiff, leftName: string): string | null {
  const label = getChangeLabel(diff);
  if (label === 'New Scene') return 'Not in ' + leftName;
  if (label === 'Deleted') return `Was #${diff.leftPosition} in ${leftName}`;
  if (label === 'Benched') return `Was #${diff.leftPosition} in ${leftName}`;
  if (label === 'Renamed') return `Was "${stripFormatting(diff.leftTitle)}"`;
  if (label === 'Moved' && diff.leftPosition !== null && diff.rightPosition !== null) {
    const dir = diff.rightPosition < diff.leftPosition ? '↑' : '↓';
    return `${dir} Was #${diff.leftPosition} in ${leftName}`;
  }
  return null;
}

export function CompareView({ projectPath, branchIndex, characterColors, onClose, onMerge }: CompareViewProps) {
  const branchNames = branchIndex.branches.filter(b => !b.legacy).map(b => b.name);
  const [left, setLeft] = useState(MAIN_VALUE);
  const [right, setRight] = useState(branchNames[0] ?? MAIN_VALUE);
  const [compareData, setCompareData] = useState<BranchCompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [filterLabel, setFilterLabel] = useState<ChangeLabel | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [draftPreview, setDraftPreview] = useState<{
    sceneId: string; title: string; leftDraft: string; rightDraft: string;
  } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  const toApi = (v: string) => (v === MAIN_VALUE ? null : v);
  const sameSelected = left === right;

  useEffect(() => {
    if (sameSelected) { setCompareData(null); return; }
    setDraftPreview(null);
    setFilterLabel(null);
    setLoading(true);
    setError(null);
    setCompareData(null);
    dataService.compareBranches(projectPath, toApi(left), toApi(right))
      .then(data => {
        setCompareData(data);
        setLoading(false);
        // Default: accept all mergeable changed scenes
        const ids = new Set(
          data.scenes
            .filter(s => s.changed && s.changeType !== 'added')
            .map(s => s.sceneId)
        );
        setAcceptedIds(ids);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [left, right, projectPath, sameSelected]);

  // Split diffs into narrative sequence and benched/deleted
  const { narrativeRows, offNarrativeRows } = useMemo(() => {
    if (!compareData) return { narrativeRows: [], offNarrativeRows: [] };
    const narrative = compareData.scenes
      .filter(s => s.rightPosition !== null)
      .sort((a, b) => (a.rightPosition ?? 0) - (b.rightPosition ?? 0));
    const off = compareData.scenes
      .filter(s => s.rightPosition === null && s.changeType !== 'unchanged')
      .sort((a, b) => (a.leftPosition ?? 999) - (b.leftPosition ?? 999));
    return { narrativeRows: narrative, offNarrativeRows: off };
  }, [compareData]);

  // Summary chip counts
  const chipCounts = useMemo(() => {
    if (!compareData) return {} as Record<ChangeLabel, number>;
    const counts = {} as Record<ChangeLabel, number>;
    for (const s of compareData.scenes) {
      if (!s.changed) continue;
      const label = getChangeLabel(s);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return counts;
  }, [compareData]);

  const changedCount = compareData ? compareData.scenes.filter(s => s.changed).length : 0;
  const rightIsNotMain = right !== MAIN_VALUE;
  const leftName = compareData?.leftName || 'main';

  function toggleAccept(sceneId: string) {
    setAcceptedIds(prev => {
      const next = new Set(prev);
      next.has(sceneId) ? next.delete(sceneId) : next.add(sceneId);
      return next;
    });
  }

  function toggleFilter(label: ChangeLabel) {
    setFilterLabel(prev => prev === label ? null : label);
  }

  async function handleSceneClick(sceneId: string, title: string) {
    if (draftPreview?.sceneId === sceneId) { setDraftPreview(null); return; }
    setDraftLoading(true);
    setDraftPreview(null);
    const [leftDraft, rightDraft] = await Promise.all([
      dataService.getBranchSceneDraft(projectPath, toApi(left), sceneId),
      dataService.getBranchSceneDraft(projectPath, toApi(right), sceneId),
    ]);
    setDraftPreview({ sceneId, title, leftDraft, rightDraft });
    setDraftLoading(false);
  }

  function shouldShow(diff: BranchSceneDiff): boolean {
    if (filterLabel) return diff.changed && getChangeLabel(diff) === filterLabel;
    if (!showAll && !diff.changed) return false;
    return true;
  }

  function handleMerge() {
    onMerge(right, [...acceptedIds]);
  }

  return (
    <div className="compare-view-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="compare-view">

        {/* Header */}
        <div className="compare-view-header">
          <h2>Compare Branches</h2>
          <button className="compare-view-close" onClick={onClose}>&times;</button>
        </div>

        {/* Branch selectors */}
        <div className="compare-view-selectors">
          <div className="compare-branch-pick">
            <label>Base</label>
            <select value={left} onChange={e => setLeft(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <span className="compare-vs">→</span>
          <div className="compare-branch-pick">
            <label>Branch</label>
            <select value={right} onChange={e => setRight(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {sameSelected && <div className="compare-view-empty">Select two different branches to compare</div>}
        {!sameSelected && loading && <div className="compare-view-empty">Loading&hellip;</div>}
        {!sameSelected && !loading && error && <div className="compare-view-empty compare-view-error">{error}</div>}

        {!sameSelected && !loading && compareData && (
          <>
            {/* Summary chips */}
            <div className="compare-summary-bar">
              {changedCount === 0 ? (
                <span className="compare-no-changes">No differences</span>
              ) : (
                <>
                  {(Object.entries(chipCounts) as [ChangeLabel, number][]).map(([label, count]) => (
                    <button
                      key={label}
                      className={`compare-chip${filterLabel === label ? ' active' : ''}`}
                      style={{ '--chip-color': LABEL_COLOR[label] } as React.CSSProperties}
                      onClick={() => toggleFilter(label)}
                    >
                      {count} {label}
                    </button>
                  ))}
                  <button
                    className="compare-toggle-btn"
                    onClick={() => { setShowAll(v => !v); setFilterLabel(null); }}
                  >
                    {showAll ? 'Changes only' : `Show all ${compareData.scenes.length}`}
                  </button>
                </>
              )}
            </div>

            {/* Narrative sequence */}
            <div className="compare-sequence">

              {narrativeRows.filter(shouldShow).map(diff => (
                <SceneRow
                  key={diff.sceneId}
                  diff={diff}
                  leftName={leftName}
                  color={characterColors[diff.characterId] || DEFAULT_COLOR}
                  accepted={acceptedIds.has(diff.sceneId)}
                  onToggleAccept={() => toggleAccept(diff.sceneId)}
                  onClick={() => handleSceneClick(diff.sceneId, stripFormatting(diff.rightTitle || diff.leftTitle))}
                  selected={draftPreview?.sceneId === diff.sceneId}
                />
              ))}

              {/* Off-narrative (benched/deleted) section */}
              {offNarrativeRows.length > 0 && !filterLabel && (
                <div className="compare-off-narrative">
                  <div className="compare-off-narrative-label">
                    Removed from narrative on this branch
                  </div>
                  {offNarrativeRows.map(diff => (
                    <SceneRow
                      key={diff.sceneId}
                      diff={diff}
                      leftName={leftName}
                      color={characterColors[diff.characterId] || DEFAULT_COLOR}
                      accepted={acceptedIds.has(diff.sceneId)}
                      onToggleAccept={() => toggleAccept(diff.sceneId)}
                      onClick={() => handleSceneClick(diff.sceneId, stripFormatting(diff.leftTitle))}
                      selected={draftPreview?.sceneId === diff.sceneId}
                    />
                  ))}
                </div>
              )}

              {/* Draft preview panel */}
              {draftLoading && <div className="compare-draft-panel compare-draft-loading">Loading draft&hellip;</div>}
              {draftPreview && !draftLoading && (
                <div className="compare-draft-panel">
                  <div className="compare-draft-header">
                    <span className="compare-draft-title">{draftPreview.title}</span>
                    <button className="compare-draft-close" onClick={() => setDraftPreview(null)}>&times;</button>
                  </div>
                  <div className="compare-draft-columns">
                    <div className="compare-draft-col">
                      <div className="compare-draft-col-label">{compareData.leftName || 'main'}</div>
                      {draftPreview.leftDraft
                        ? <div className="compare-draft-content" dangerouslySetInnerHTML={{ __html: draftPreview.leftDraft }} />
                        : <div className="compare-draft-empty">No draft written</div>}
                    </div>
                    <div className="compare-draft-col">
                      <div className="compare-draft-col-label">{compareData.rightName || 'main'}</div>
                      {draftPreview.rightDraft
                        ? <div className="compare-draft-content" dangerouslySetInnerHTML={{ __html: draftPreview.rightDraft }} />
                        : <div className="compare-draft-empty">No draft written</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer: merge */}
            {rightIsNotMain && (
              <div className="compare-view-footer">
                <span className="compare-accept-count">
                  {acceptedIds.size} change{acceptedIds.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  className="compare-merge-btn"
                  disabled={acceptedIds.size === 0}
                  onClick={handleMerge}
                >
                  Merge {acceptedIds.size} → {left === MAIN_VALUE ? 'main' : left}
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

/* ── Scene row ───────────────────────────────────────────────────────── */

interface SceneRowProps {
  diff: BranchSceneDiff;
  leftName: string;
  color: string;
  accepted: boolean;
  onToggleAccept: () => void;
  onClick: () => void;
  selected: boolean;
}

function SceneRow({ diff, leftName, color, accepted, onToggleAccept, onClick, selected }: SceneRowProps) {
  const changed = diff.changed;
  const label = changed ? getChangeLabel(diff) : null;
  const delta = changed && label ? getDeltaText(diff, leftName) : null;
  const borderColor = label ? LABEL_COLOR[label] : color;
  const title = stripFormatting(diff.rightTitle || diff.leftTitle);
  const position = diff.rightPosition ?? diff.leftPosition;
  const mergeable = diff.changeType !== 'added' && diff.changeType !== 'removed';

  return (
    <div
      className={`compare-scene-row${changed ? ' changed' : ' unchanged'}${selected ? ' selected' : ''}`}
      style={{ '--scene-color': borderColor } as React.CSSProperties}
      onClick={onClick}
      title={changed ? 'Click to preview draft' : undefined}
    >
      {/* Left gutter: accept checkbox (changed) or position dot (unchanged) */}
      <div className="compare-scene-gutter" onClick={e => { if (changed && mergeable) { e.stopPropagation(); onToggleAccept(); }}}>
        {changed && mergeable ? (
          <input
            type="checkbox"
            className="compare-scene-check"
            checked={accepted}
            onChange={onToggleAccept}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="compare-scene-pos-dot">{position ?? '–'}</span>
        )}
      </div>

      {/* Card body */}
      <div className="compare-scene-body">
        <div className="compare-scene-main">
          <span className="compare-scene-char" style={{ color }}>{diff.characterName}</span>
          {position !== null && !changed && (
            <span className="compare-scene-pos">#{position}</span>
          )}
          <span className="compare-scene-title">{title}</span>
          {label && (
            <span className="compare-scene-label" style={{ color: LABEL_COLOR[label] }}>{label}</span>
          )}
          {diff.rightWordCount !== null && (
            <span className="compare-scene-words">{diff.rightWordCount}w</span>
          )}
        </div>
        {delta && (
          <div className="compare-scene-delta">{delta}</div>
        )}
      </div>
    </div>
  );
}
