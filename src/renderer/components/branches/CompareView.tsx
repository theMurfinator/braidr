import { useState, useEffect } from 'react';
import { BranchIndex, BranchCompareData } from '../../../shared/types';
import { dataService } from '../../services/dataService';

interface CompareViewProps {
  projectPath: string;
  branchIndex: BranchIndex;
  onClose: () => void;
  onMerge: (branchName: string) => void;
}

const MAIN_VALUE = '__main__';

export function CompareView({ projectPath, branchIndex, onClose, onMerge }: CompareViewProps) {
  const branchNames = branchIndex.branches.map(b => b.name);
  const [left, setLeft] = useState(MAIN_VALUE);
  const [right, setRight] = useState(branchNames[0] ?? MAIN_VALUE);
  const [compareData, setCompareData] = useState<BranchCompareData | null>(null);
  const [loading, setLoading] = useState(false);

  const toApi = (v: string) => (v === MAIN_VALUE ? null : v);
  const sameSelected = left === right;

  useEffect(() => {
    if (sameSelected) {
      setCompareData(null);
      return;
    }
    setLoading(true);
    setCompareData(null);
    dataService.compareBranches(projectPath, toApi(left), toApi(right))
      .then(data => { setCompareData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [left, right, projectPath, sameSelected]);

  const changedCount = compareData ? compareData.scenes.filter(s => s.changed).length : 0;
  const totalCount = compareData ? compareData.scenes.length : 0;

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const rightIsNotMain = right !== MAIN_VALUE;

  return (
    <div className="compare-view-overlay" onClick={handleOverlayClick}>
      <div className="compare-view">
        {/* Header */}
        <div className="compare-view-header">
          <h2>Compare Branches</h2>
          <button className="compare-view-close" onClick={onClose}>&times;</button>
        </div>

        {/* Branch Selectors */}
        <div className="compare-view-selectors">
          <div className="compare-branch-pick">
            <label>Left</label>
            <select value={left} onChange={e => setLeft(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <span className="compare-vs">vs</span>
          <div className="compare-branch-pick">
            <label>Right</label>
            <select value={right} onChange={e => setRight(e.target.value)}>
              <option value={MAIN_VALUE}>main</option>
              {branchNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Same-branch message */}
        {sameSelected && (
          <div className="compare-view-empty">Select two different branches to compare</div>
        )}

        {/* Loading */}
        {!sameSelected && loading && (
          <div className="compare-view-empty">Loading comparison&hellip;</div>
        )}

        {/* Results */}
        {!sameSelected && !loading && compareData && (
          <>
            {/* Summary */}
            <div className="compare-view-summary">
              {changedCount} of {totalCount} scene{totalCount !== 1 ? 's' : ''} differ
            </div>

            {/* Table */}
            <div className="compare-view-table">
              <div className="compare-table-header">
                <span className="compare-col-char">Character</span>
                <span className="compare-col-num">#</span>
                <span className="compare-col-title">{compareData.leftName || 'main'}</span>
                <span className="compare-col-title">{compareData.rightName || 'main'}</span>
                <span className="compare-col-pos">Position</span>
              </div>
              <div className="compare-table-body">
                {compareData.scenes.map(scene => {
                  const titleChanged = scene.leftTitle !== scene.rightTitle;
                  const posChanged = scene.leftPosition !== scene.rightPosition;
                  return (
                    <div
                      key={scene.sceneId}
                      className={`compare-table-row${scene.changed ? ' changed' : ' unchanged'}`}
                    >
                      <span className="compare-col-status">
                        {scene.changed && <span className="compare-change-dot" />}
                      </span>
                      <span className="compare-col-char">{scene.characterName}</span>
                      <span className="compare-col-num">{scene.sceneNumber}</span>
                      <span className={`compare-col-title${titleChanged ? ' compare-col-removed' : ''}`}>
                        {scene.leftTitle}
                      </span>
                      <span className={`compare-col-title${titleChanged ? ' compare-col-added' : ''}`}>
                        {scene.rightTitle}
                      </span>
                      <span className={`compare-col-pos${posChanged ? ' compare-pos-changed' : ''}`}>
                        {scene.leftPosition ?? '–'} / {scene.rightPosition ?? '–'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        {rightIsNotMain && !sameSelected && (
          <div className="compare-view-footer">
            <button
              className="compare-merge-btn"
              onClick={() => onMerge(right)}
            >
              Merge {right} &rarr; main
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
