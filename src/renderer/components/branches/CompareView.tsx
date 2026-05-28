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

type ChangeLabel = 'Benched' | 'Moved' | 'Renamed' | 'Rewritten' | 'Added' | 'Deleted';

function getChangeLabel(diff: BranchSceneDiff): ChangeLabel {
  if (diff.changeType === 'added') return 'Added';
  if (diff.changeType === 'removed') return 'Deleted';
  if (diff.rightPosition === null) return 'Benched';
  if (diff.leftPosition === null) return 'Moved';
  if (diff.leftTitle !== diff.rightTitle && diff.leftPosition === diff.rightPosition) return 'Renamed';
  return 'Moved';
}

const LABEL_COLOR: Record<ChangeLabel, string> = {
  'Benched':   '#ef4444',
  'Deleted':   '#ef4444',
  'Moved':     '#f59e0b',
  'Renamed':   '#3b82f6',
  'Rewritten': '#8b5cf6',
  'Added':     '#22c55e',
};

// What the branch did to this main scene — shown as a delta annotation
function getBranchDelta(diff: BranchSceneDiff, rightName: string): string {
  const label = getChangeLabel(diff);
  if (label === 'Benched') return `Benched on ${rightName}`;
  if (label === 'Deleted') return `Deleted on ${rightName}`;
  if (label === 'Added') return `Only on ${rightName} (not in base)`;
  if (label === 'Renamed') return `→ "${stripFormatting(diff.rightTitle)}" on ${rightName}`;
  if (label === 'Moved') {
    if (diff.rightPosition !== null && diff.leftPosition !== null) {
      const dir = diff.rightPosition < diff.leftPosition ? '↑' : '↓';
      return `${dir} Moved to #${diff.rightPosition} on ${rightName}`;
    }
    if (diff.rightPosition !== null) return `→ #${diff.rightPosition} on ${rightName}`;
  }
  return '';
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
        const ids = new Set(
          data.scenes
            .filter(s => s.changed && s.changeType !== 'added')
            .map(s => s.sceneId)
        );
        setAcceptedIds(ids);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [left, right, projectPath, sameSelected]);

  // Main sequence: scenes that exist in the left/base branch, in its narrative order
  // Branch-only additions go at the bottom
  const { mainSequence, branchAdditions } = useMemo(() => {
    if (!compareData) return { mainSequence: [], branchAdditions: [] };
    const inMain = compareData.scenes
      .filter(s => s.leftPosition !== null)
      .sort((a, b) => (a.leftPosition ?? 0) - (b.leftPosition ?? 0));
    const added = compareData.scenes
      .filter(s => s.leftPosition === null && s.changed)
      .sort((a, b) => (a.rightPosition ?? 999) - (b.rightPosition ?? 999));
    return { mainSequence: inMain, branchAdditions: added };
  }, [compareData]);

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
  const rightName = compareData?.rightName || right;

  function toggleAccept(sceneId: string) {
    setAcceptedIds(prev => {
      const next = new Set(prev);
      next.has(sceneId) ? next.delete(sceneId) : next.add(sceneId);
      return next;
    });
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

  const renderRow = (diff: BranchSceneDiff) => {
    if (!shouldShow(diff)) return null;
    const changed = diff.changed;
    const label = changed ? getChangeLabel(diff) : null;
    const delta = changed && label ? getBranchDelta(diff, rightName) : null;
    const charColor = characterColors[diff.characterId] || DEFAULT_COLOR;
    const borderColor = label ? LABEL_COLOR[label] : charColor;
    const title = stripFormatting(diff.leftTitle || diff.rightTitle);
    const position = diff.leftPosition ?? diff.rightPosition;
    const isMergeable = diff.changeType !== 'added';
    const isSelected = draftPreview?.sceneId === diff.sceneId;

    return (
      <div
        key={diff.sceneId}
        className={`cv-row${changed ? ' changed' : ' unchanged'}${isSelected ? ' selected' : ''}`}
        style={changed ? { '--row-accent': borderColor } as React.CSSProperties : undefined}
        onClick={() => handleSceneClick(diff.sceneId, title)}
      >
        <div className="cv-gutter" onClick={e => { if (changed && isMergeable) e.stopPropagation(); }}>
          {changed && isMergeable ? (
            <input
              type="checkbox"
              className="cv-check"
              checked={acceptedIds.has(diff.sceneId)}
              onChange={() => toggleAccept(diff.sceneId)}
              onClick={e => e.stopPropagation()}
              title="Include in merge"
            />
          ) : (
            <span className="cv-pos">{position ?? '–'}</span>
          )}
        </div>
        <div className="cv-body">
          <div className="cv-main-line">
            <span className="cv-char" style={{ color: charColor }}>{diff.characterName}</span>
            {!changed && <span className="cv-pos-inline">#{position}</span>}
            <span className="cv-title">{title}</span>
            {label && <span className="cv-label" style={{ color: borderColor }}>{label}</span>}
            {diff.leftWordCount !== null && (
              <span className="cv-words">{diff.leftWordCount}w</span>
            )}
          </div>
          {delta && <div className="cv-delta">{delta}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="compare-view-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="compare-view">

        <div className="compare-view-header">
          <h2>Compare Branches</h2>
          <button className="compare-view-close" onClick={onClose}>&times;</button>
        </div>

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
            <div className="compare-summary-bar">
              {changedCount === 0 ? (
                <span className="compare-no-changes">No differences between these branches</span>
              ) : (
                <>
                  {(Object.entries(chipCounts) as [ChangeLabel, number][]).map(([label, count]) => (
                    <button
                      key={label}
                      className={`compare-chip${filterLabel === label ? ' active' : ''}`}
                      style={{ '--chip-color': LABEL_COLOR[label] } as React.CSSProperties}
                      onClick={() => setFilterLabel(prev => prev === label ? null : label)}
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

            <div className="cv-sequence">
              {mainSequence.map(renderRow)}

              {branchAdditions.length > 0 && !filterLabel && (
                <div className="cv-additions-section">
                  <div className="cv-section-label">Added on {rightName}</div>
                  {branchAdditions.map(renderRow)}
                </div>
              )}

              {draftLoading && (
                <div className="compare-draft-panel compare-draft-loading">Loading draft&hellip;</div>
              )}

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

            {rightIsNotMain && (
              <div className="compare-view-footer">
                <span className="compare-accept-count">
                  {acceptedIds.size} change{acceptedIds.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  className="compare-merge-btn"
                  disabled={acceptedIds.size === 0}
                  onClick={() => onMerge(right, [...acceptedIds])}
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
