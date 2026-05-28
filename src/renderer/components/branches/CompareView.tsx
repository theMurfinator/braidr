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
  return title.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
}

const CHANGE_LABELS: Record<string, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Changed',
};

interface RailsScene {
  sceneId: string;
  position: number | null;
  sceneNumber: number | null;
  title: string;
  characterName: string;
  characterId: string;
  color: string;
  changeType: BranchSceneDiff['changeType'];
  wordCount: number | null;
}

function buildRailsColumn(
  scenes: BranchSceneDiff[],
  side: 'left' | 'right',
  colors: Record<string, string>,
): RailsScene[] {
  return scenes
    .filter(s => {
      // Always include changed scenes; skip unchanged scenes with no position
      if (s.changeType !== 'unchanged') return true;
      const pos = side === 'left' ? s.leftPosition : s.rightPosition;
      return pos !== null;
    })
    .map(s => ({
      sceneId: s.sceneId,
      position: side === 'left' ? s.leftPosition : s.rightPosition,
      sceneNumber: side === 'left' ? s.leftSceneNumber : s.rightSceneNumber,
      title: stripTags(side === 'left' ? s.leftTitle : s.rightTitle),
      characterName: s.characterName,
      characterId: s.characterId,
      color: colors[s.characterId] || DEFAULT_COLOR,
      changeType: s.changeType,
      wordCount: side === 'left' ? s.leftWordCount : s.rightWordCount,
    }))
    .sort((a, b) => {
      const ap = a.position ?? Infinity;
      const bp = b.position ?? Infinity;
      if (ap !== bp) return ap - bp;
      return (a.sceneNumber ?? 999) - (b.sceneNumber ?? 999);
    });
}

export function CompareView({ projectPath, branchIndex, characterColors, onClose, onMerge }: CompareViewProps) {
  const branchNames = branchIndex.branches.filter(b => !b.legacy).map(b => b.name);
  const [left, setLeft] = useState(MAIN_VALUE);
  const [right, setRight] = useState(branchNames[0] ?? MAIN_VALUE);
  const [compareData, setCompareData] = useState<BranchCompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const leftScenes = compareData ? buildRailsColumn(compareData.scenes, 'left', characterColors) : [];
  const rightScenes = compareData ? buildRailsColumn(compareData.scenes, 'right', characterColors) : [];

  const rightIsNotMain = right !== MAIN_VALUE;

  async function handleSceneClick(sceneId: string, title: string) {
    if (draftPreview?.sceneId === sceneId) {
      setDraftPreview(null);
      return;
    }
    setDraftLoading(true);
    setDraftPreview(null);
    const [leftDraft, rightDraft] = await Promise.all([
      dataService.getBranchSceneDraft(projectPath, toApi(left), sceneId),
      dataService.getBranchSceneDraft(projectPath, toApi(right), sceneId),
    ]);
    setDraftPreview({ sceneId, title, leftDraft, rightDraft });
    setDraftLoading(false);
  }

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

        {sameSelected && (
          <div className="compare-view-empty">Select two different branches to compare</div>
        )}
        {!sameSelected && loading && (
          <div className="compare-view-empty">Loading comparison&hellip;</div>
        )}
        {!sameSelected && !loading && error && (
          <div className="compare-view-empty compare-view-error">{error}</div>
        )}

        {!sameSelected && !loading && compareData && (
          <>
            <div className="compare-view-summary">
              {changedCount === 0
                ? `No differences — all ${totalCount} scenes are identical`
                : `${changedCount} of ${totalCount} scene${totalCount !== 1 ? 's' : ''} differ`}
            </div>

            <div className="compare-rails">
              <div className="compare-rails-header">
                <div className="compare-rails-col-label">{compareData.leftName || 'main'}</div>
                <div className="compare-rails-col-label">{compareData.rightName || 'main'}</div>
              </div>
              <div className="compare-rails-body">
                <div className="compare-rails-column">
                  {leftScenes.map(scene => (
                    <div
                      key={scene.sceneId}
                      className={`compare-rails-card ${scene.changeType}${draftPreview?.sceneId === scene.sceneId ? ' selected' : ''}`}
                      style={{ borderLeftColor: scene.color, cursor: 'pointer' }}
                      onClick={() => handleSceneClick(scene.sceneId, scene.title)}
                      title="Click to preview draft"
                    >
                      <span className="compare-rails-char">{scene.characterName}</span>
                      <span className="compare-rails-title">{scene.title || <em className="compare-rails-empty">—</em>}</span>
                      {scene.changeType !== 'unchanged' && (
                        <span className={`compare-change-badge ${scene.changeType}`}>
                          {CHANGE_LABELS[scene.changeType] ?? scene.changeType}
                        </span>
                      )}
                      {scene.wordCount !== null && (
                        <span className="compare-rails-words">{scene.wordCount}w</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="compare-rails-column">
                  {rightScenes.map(scene => (
                    <div
                      key={scene.sceneId}
                      className={`compare-rails-card ${scene.changeType}${draftPreview?.sceneId === scene.sceneId ? ' selected' : ''}`}
                      style={{ borderLeftColor: scene.color, cursor: 'pointer' }}
                      onClick={() => handleSceneClick(scene.sceneId, scene.title)}
                      title="Click to preview draft"
                    >
                      <span className="compare-rails-char">{scene.characterName}</span>
                      <span className="compare-rails-title">{scene.title || <em className="compare-rails-empty">—</em>}</span>
                      {scene.changeType !== 'unchanged' && (
                        <span className={`compare-change-badge ${scene.changeType}`}>
                          {CHANGE_LABELS[scene.changeType] ?? scene.changeType}
                        </span>
                      )}
                      {scene.wordCount !== null && (
                        <span className="compare-rails-words">{scene.wordCount}w</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {draftLoading && (
              <div className="compare-draft-panel compare-draft-loading">
                Loading draft&hellip;
              </div>
            )}

            {draftPreview && !draftLoading && (
              <div className="compare-draft-panel">
                <div className="compare-draft-header">
                  <span className="compare-draft-title">{draftPreview.title}</span>
                  <button
                    className="compare-draft-close"
                    onClick={() => setDraftPreview(null)}
                  >
                    &times;
                  </button>
                </div>
                <div className="compare-draft-columns">
                  <div className="compare-draft-col">
                    <div className="compare-draft-col-label">{compareData!.leftName || 'main'}</div>
                    {draftPreview.leftDraft
                      ? <div
                          className="compare-draft-content"
                          dangerouslySetInnerHTML={{ __html: draftPreview.leftDraft }}
                        />
                      : <div className="compare-draft-empty">No draft written</div>
                    }
                  </div>
                  <div className="compare-draft-col">
                    <div className="compare-draft-col-label">{compareData!.rightName || 'main'}</div>
                    {draftPreview.rightDraft
                      ? <div
                          className="compare-draft-content"
                          dangerouslySetInnerHTML={{ __html: draftPreview.rightDraft }}
                        />
                      : <div className="compare-draft-empty">No draft written</div>
                    }
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
