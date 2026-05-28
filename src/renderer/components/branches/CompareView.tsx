import { useState, useEffect } from 'react';
import { BranchIndex, BranchCompareData, BranchSceneDiff } from '../../../shared/types';
import { dataService } from '../../services/dataService';

interface CompareViewProps {
  projectPath: string;
  branchIndex: BranchIndex;
  characterColors: Record<string, string>;
  onClose: () => void;
  onMerge: (branchName: string) => void;
}

const MAIN_VALUE = '__main__';
const DEFAULT_COLOR = '#6b7280';

function stripTags(title: string): string {
  return title
    .replace(/==\*\*(.*?)\*\*==/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// More specific label for what changed on a given side
function sideLabel(diff: BranchSceneDiff, side: 'left' | 'right'): string | null {
  if (diff.changeType === 'unchanged') return null;
  if (diff.changeType === 'added') return side === 'right' ? 'Added' : null;
  if (diff.changeType === 'removed') return side === 'left' ? 'Removed' : null;
  // modified — figure out what specifically changed
  const pos = side === 'left' ? diff.leftPosition : diff.rightPosition;
  const otherPos = side === 'left' ? diff.rightPosition : diff.leftPosition;
  if (pos === null && otherPos !== null) return 'Benched';
  if (pos !== null && otherPos === null) return 'Restored';
  if (diff.leftTitle !== diff.rightTitle && diff.leftPosition === diff.rightPosition) return 'Renamed';
  return 'Moved';
}

interface DiffCard {
  sceneId: string;
  title: string;
  characterName: string;
  color: string;
  position: number | null;
  wordCount: number | null;
  changeType: BranchSceneDiff['changeType'];
  label: string | null;
  absent: boolean; // true when this side has no version of the scene
}

function buildCard(diff: BranchSceneDiff, side: 'left' | 'right', colors: Record<string, string>): DiffCard {
  const absent = (side === 'left' && diff.changeType === 'added') ||
                 (side === 'right' && diff.changeType === 'removed');
  return {
    sceneId: diff.sceneId,
    title: stripTags(side === 'left' ? diff.leftTitle : diff.rightTitle),
    characterName: diff.characterName,
    color: colors[diff.characterId] || DEFAULT_COLOR,
    position: side === 'left' ? diff.leftPosition : diff.rightPosition,
    wordCount: side === 'left' ? diff.leftWordCount : diff.rightWordCount,
    changeType: diff.changeType,
    label: sideLabel(diff, side),
    absent,
  };
}

export function CompareView({ projectPath, branchIndex, characterColors, onClose, onMerge }: CompareViewProps) {
  const branchNames = branchIndex.branches.filter(b => !b.legacy).map(b => b.name);
  const [left, setLeft] = useState(MAIN_VALUE);
  const [right, setRight] = useState(branchNames[0] ?? MAIN_VALUE);
  const [compareData, setCompareData] = useState<BranchCompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [draftPreview, setDraftPreview] = useState<{
    sceneId: string;
    title: string;
    leftDraft: string;
    rightDraft: string;
  } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  const toApi = (v: string) => (v === MAIN_VALUE ? null : v);
  const sameSelected = left === right;

  useEffect(() => {
    if (sameSelected) { setCompareData(null); return; }
    setDraftPreview(null);
    setLoading(true);
    setError(null);
    setCompareData(null);
    dataService.compareBranches(projectPath, toApi(left), toApi(right))
      .then(data => { setCompareData(data); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [left, right, projectPath, sameSelected]);

  const changedCount = compareData ? compareData.scenes.filter(s => s.changed).length : 0;
  const totalCount = compareData ? compareData.scenes.length : 0;

  const rightIsNotMain = right !== MAIN_VALUE;

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

  // Build the list of rows to render, sorted by the earliest known position
  const rows = compareData
    ? [...compareData.scenes]
        .filter(s => showAll || s.changed)
        .sort((a, b) => {
          const ap = Math.min(a.leftPosition ?? Infinity, a.rightPosition ?? Infinity);
          const bp = Math.min(b.leftPosition ?? Infinity, b.rightPosition ?? Infinity);
          if (ap !== bp) return ap - bp;
          return (a.leftSceneNumber ?? a.rightSceneNumber ?? 999) -
                 (b.leftSceneNumber ?? b.rightSceneNumber ?? 999);
        })
    : [];

  return (
    <div className="compare-view-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="compare-view">
        <div className="compare-view-header">
          <h2>Compare Branches</h2>
          <button className="compare-view-close" onClick={onClose}>&times;</button>
        </div>

        <div className="compare-view-selectors">
          <div className="compare-branch-pick">
            <label>Left</label>
            <select value={left} onChange={e => setLeft(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <span className="compare-vs">vs</span>
          <div className="compare-branch-pick">
            <label>Right</label>
            <select value={right} onChange={e => setRight(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {sameSelected && <div className="compare-view-empty">Select two different branches to compare</div>}
        {!sameSelected && loading && <div className="compare-view-empty">Loading comparison&hellip;</div>}
        {!sameSelected && !loading && error && <div className="compare-view-empty compare-view-error">{error}</div>}

        {!sameSelected && !loading && compareData && (
          <>
            <div className="compare-view-summary">
              <span>
                {changedCount === 0
                  ? `No differences — all ${totalCount} scenes are identical`
                  : `${changedCount} of ${totalCount} scene${totalCount !== 1 ? 's' : ''} differ`}
              </span>
              {totalCount > 0 && (
                <button className="compare-toggle-btn" onClick={() => setShowAll(v => !v)}>
                  {showAll ? `Show changes only` : `Show all ${totalCount}`}
                </button>
              )}
            </div>

            <div className="compare-paired-header">
              <div className="compare-paired-col-label">{compareData.leftName || 'main'}</div>
              <div className="compare-paired-col-label">{compareData.rightName || 'main'}</div>
            </div>

            <div className="compare-paired-list">
              {rows.map(diff => {
                const lCard = buildCard(diff, 'left', characterColors);
                const rCard = buildCard(diff, 'right', characterColors);
                const isSelected = draftPreview?.sceneId === diff.sceneId;
                return (
                  <div
                    key={diff.sceneId}
                    className={`compare-paired-row ${diff.changeType}${isSelected ? ' selected' : ''}`}
                    onClick={() => handleSceneClick(diff.sceneId, lCard.title || rCard.title)}
                    title="Click to preview draft"
                  >
                    <SceneCard card={lCard} />
                    <SceneCard card={rCard} />
                  </div>
                );
              })}
              {rows.length === 0 && changedCount === 0 && (
                <div className="compare-view-empty" style={{ padding: '24px 20px' }}>
                  All scenes are identical between these branches.
                </div>
              )}
            </div>

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
            <button className="compare-merge-btn" onClick={() => onMerge(right)}>
              Merge {right} &rarr; main
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SceneCard({ card }: { card: DiffCard }) {
  if (card.absent) {
    return (
      <div className="compare-paired-card absent" style={{ borderLeftColor: card.color }}>
        <span className="compare-rails-char">{card.characterName}</span>
        <span className="compare-paired-absent">not in this branch</span>
      </div>
    );
  }
  return (
    <div
      className={`compare-paired-card ${card.changeType}`}
      style={{ borderLeftColor: card.color }}
    >
      <span className="compare-rails-char">{card.characterName}</span>
      <span className="compare-paired-pos">
        {card.position !== null ? `#${card.position}` : '—'}
      </span>
      <span className="compare-rails-title">{card.title || <em className="compare-rails-empty">—</em>}</span>
      {card.label && (
        <span className={`compare-change-badge ${card.label.toLowerCase()}`}>{card.label}</span>
      )}
      {card.wordCount !== null && (
        <span className="compare-rails-words">{card.wordCount}w</span>
      )}
    </div>
  );
}
