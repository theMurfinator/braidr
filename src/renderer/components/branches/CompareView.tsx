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

interface RailsScene {
  sceneId: string;
  position: number;
  title: string;
  characterName: string;
  characterId: string;
  color: string;
  changed: boolean;
  otherPosition: number | null;
}

function buildRailsColumn(
  scenes: BranchSceneDiff[],
  side: 'left' | 'right',
  colors: Record<string, string>,
): RailsScene[] {
  return scenes
    .filter(s => (side === 'left' ? s.leftPosition : s.rightPosition) !== null)
    .map(s => ({
      sceneId: s.sceneId,
      position: (side === 'left' ? s.leftPosition : s.rightPosition)!,
      title: side === 'left' ? s.leftTitle : s.rightTitle,
      characterName: s.characterName,
      characterId: s.characterId,
      color: colors[s.characterId] || DEFAULT_COLOR,
      changed: s.changed,
      otherPosition: side === 'left' ? s.rightPosition : s.leftPosition,
    }))
    .sort((a, b) => a.position - b.position);
}

export function CompareView({ projectPath, branchIndex, characterColors, onClose, onMerge }: CompareViewProps) {
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

  const leftScenes = compareData ? buildRailsColumn(compareData.scenes, 'left', characterColors) : [];
  const rightScenes = compareData ? buildRailsColumn(compareData.scenes, 'right', characterColors) : [];

  const rightIsNotMain = right !== MAIN_VALUE;

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

        {!sameSelected && !loading && compareData && (
          <>
            <div className="compare-view-summary">
              {changedCount} of {totalCount} scene{totalCount !== 1 ? 's' : ''} differ
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
                      className={`compare-rails-card ${scene.changed ? 'changed' : 'unchanged'}`}
                      style={{ borderLeftColor: scene.color }}
                    >
                      <span className="compare-rails-char">{scene.characterName}</span>
                      <span className="compare-rails-title">{scene.title}</span>
                      <span className="compare-rails-pos">#{scene.position}</span>
                    </div>
                  ))}
                </div>
                <div className="compare-rails-column">
                  {rightScenes.map(scene => (
                    <div
                      key={scene.sceneId}
                      className={`compare-rails-card ${scene.changed ? 'changed' : 'unchanged'}`}
                      style={{ borderLeftColor: scene.color }}
                    >
                      <span className="compare-rails-char">{scene.characterName}</span>
                      <span className="compare-rails-title">{scene.title}</span>
                      <span className="compare-rails-pos">#{scene.position}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
