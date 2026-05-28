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
  'New Scene': '#22c55e',
};

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

  // Sort rows: all scenes with a position on either side, sorted by the smallest known position
  const sortedRows = useMemo(() => {
    if (!compareData) return [];
    return [...compareData.scenes].sort((a, b) => {
      const ap = Math.min(a.leftPosition ?? Infinity, a.rightPosition ?? Infinity);
      const bp = Math.min(b.leftPosition ?? Infinity, b.rightPosition ?? Infinity);
      if (ap !== bp) return ap - bp;
      return (a.leftSceneNumber ?? a.rightSceneNumber ?? 999) -
             (b.leftSceneNumber ?? b.rightSceneNumber ?? 999);
    });
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
  const leftName = compareData?.leftName || 'main';
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

  function shouldShowRow(diff: BranchSceneDiff): boolean {
    if (filterLabel) return diff.changed && getChangeLabel(diff) === filterLabel;
    if (!showAll && !diff.changed) return false;
    return true;
  }

  const visibleRows = sortedRows.filter(shouldShowRow);

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

            {/* Two-column header */}
            <div className="compare-cols-header">
              <div className="compare-col-label">{leftName}</div>
              <div className="compare-col-label">{rightName}</div>
            </div>

            {/* Two-column rows */}
            <div className="compare-rows-body">
              {visibleRows.map(diff => {
                const label = diff.changed ? getChangeLabel(diff) : null;
                const borderColor = label ? LABEL_COLOR[label] : DEFAULT_COLOR;
                const charColor = characterColors[diff.characterId] || DEFAULT_COLOR;
                const isSelected = draftPreview?.sceneId === diff.sceneId;
                const isMergeable = diff.changeType !== 'added';
                const title = stripFormatting(diff.rightTitle || diff.leftTitle);

                return (
                  <div
                    key={diff.sceneId}
                    className={`compare-row${diff.changed ? ' changed' : ' unchanged'}${isSelected ? ' selected' : ''}`}
                    style={diff.changed ? { '--row-color': borderColor } as React.CSSProperties : undefined}
                    onClick={() => handleSceneClick(diff.sceneId, title)}
                  >
                    {/* Accept checkbox */}
                    {diff.changed && (
                      <div className="compare-row-check-col" onClick={e => e.stopPropagation()}>
                        {isMergeable && (
                          <input
                            type="checkbox"
                            className="compare-scene-check"
                            checked={acceptedIds.has(diff.sceneId)}
                            onChange={() => toggleAccept(diff.sceneId)}
                          />
                        )}
                      </div>
                    )}

                    {/* Left card (base/main) */}
                    <SideCard
                      title={stripFormatting(diff.leftTitle)}
                      position={diff.leftPosition}
                      charColor={charColor}
                      charName={diff.characterName}
                      wordCount={diff.leftWordCount}
                      changed={diff.changed}
                      absent={diff.changeType === 'added'}
                      label={label && diff.changeType !== 'added' ? label : null}
                      deltaText={
                        label === 'Renamed' && diff.rightTitle !== diff.leftTitle
                          ? `→ "${stripFormatting(diff.rightTitle)}" on ${rightName}`
                          : label === 'Moved' && diff.leftPosition !== null && diff.rightPosition !== null
                          ? `→ #${diff.rightPosition} on ${rightName}`
                          : null
                      }
                    />

                    {/* Right card (branch) */}
                    <SideCard
                      title={stripFormatting(diff.rightTitle)}
                      position={diff.rightPosition}
                      charColor={charColor}
                      charName={diff.characterName}
                      wordCount={diff.rightWordCount}
                      changed={diff.changed}
                      absent={diff.changeType === 'removed'}
                      benched={label === 'Benched' || label === 'Deleted'}
                      label={label && diff.changeType !== 'removed' ? label : null}
                      deltaText={
                        label === 'Renamed'
                          ? `Was "${stripFormatting(diff.leftTitle)}"`
                          : label === 'Moved' && diff.leftPosition !== null && diff.rightPosition !== null
                          ? `Was #${diff.leftPosition} in ${leftName}`
                          : label === 'New Scene'
                          ? `Not in ${leftName}`
                          : label === 'Benched'
                          ? `Was #${diff.leftPosition} in ${leftName}`
                          : null
                      }
                    />
                  </div>
                );
              })}

              {visibleRows.length === 0 && (
                <div className="compare-view-empty" style={{ padding: '24px 20px' }}>
                  {filterLabel ? `No ${filterLabel} changes` : 'No differences between these branches'}
                </div>
              )}
            </div>

            {/* Draft preview */}
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
          </>
        )}

        {rightIsNotMain && !sameSelected && (
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

      </div>
    </div>
  );
}

/* ── Side card ───────────────────────────────────────────────────────── */

interface SideCardProps {
  title: string;
  position: number | null;
  charColor: string;
  charName: string;
  wordCount: number | null;
  changed: boolean;
  absent?: boolean;
  benched?: boolean;
  label: string | null;
  deltaText: string | null;
}

function SideCard({ title, position, charColor, charName, wordCount, changed, absent, benched, label, deltaText }: SideCardProps) {
  if (absent) {
    return (
      <div className="compare-side-card absent">
        <span className="compare-side-absent">—</span>
      </div>
    );
  }

  return (
    <div className={`compare-side-card${changed ? ' changed' : ' unchanged'}${benched ? ' benched' : ''}`}
         style={{ borderLeftColor: charColor }}>
      <div className="compare-side-main">
        <span className="compare-side-pos">{position !== null ? `#${position}` : '—'}</span>
        <span className="compare-side-char" style={{ color: charColor }}>{charName}</span>
        <span className="compare-side-title">{title || <em style={{ opacity: 0.5 }}>—</em>}</span>
        {label && <span className="compare-side-label">{label}</span>}
        {wordCount !== null && <span className="compare-side-words">{wordCount}w</span>}
      </div>
      {deltaText && <div className="compare-side-delta">{deltaText}</div>}
    </div>
  );
}
