import { useState, useEffect, useMemo } from 'react';
import { BranchCompareData, BranchSceneDiff } from '../../../shared/types';

interface MergeDialogProps {
  branchName: string;
  compareData: BranchCompareData | null;
  loading: boolean;
  onMerge: (sceneIds: string[]) => void;
  onClose: () => void;
}

export function MergeDialog({ branchName, compareData, loading, onMerge, onClose }: MergeDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-select all changed scenes when compare data loads
  useEffect(() => {
    if (!compareData) return;
    const changed = new Set(
      compareData.scenes.filter(s => s.changed).map(s => s.sceneId)
    );
    setSelectedIds(changed);
  }, [compareData]);

  // Group scenes by character name
  const grouped = useMemo(() => {
    if (!compareData) return new Map<string, BranchSceneDiff[]>();
    const map = new Map<string, BranchSceneDiff[]>();
    for (const scene of compareData.scenes) {
      const list = map.get(scene.characterName) || [];
      list.push(scene);
      map.set(scene.characterName, list);
    }
    return map;
  }, [compareData]);

  const changedIds = useMemo(() => {
    if (!compareData) return new Set<string>();
    return new Set(compareData.scenes.filter(s => s.changed).map(s => s.sceneId));
  }, [compareData]);

  const allChangedSelected = changedIds.size > 0 && [...changedIds].every(id => selectedIds.has(id));

  function toggleScene(sceneId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  }

  function toggleAllChanged() {
    if (allChangedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(changedIds));
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="merge-dialog-overlay" onClick={handleOverlayClick}>
      <div className="merge-dialog">
        {/* Header */}
        <div className="merge-dialog-header">
          <h2>Merge &ldquo;{branchName}&rdquo; &rarr; main</h2>
          <button className="merge-dialog-close" onClick={onClose}>&times;</button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="merge-dialog-loading">Loading comparison&hellip;</div>
        )}

        {/* Controls */}
        {!loading && compareData && (
          <>
            <div className="merge-dialog-controls">
              <button className="merge-toggle-btn" onClick={toggleAllChanged}>
                {allChangedSelected ? 'Deselect Changed' : 'Select All Changed'}
              </button>
              <span className="merge-selected-count">
                {selectedIds.size} scene{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
            </div>

            {/* Scene list */}
            <div className="merge-dialog-scenes">
              {[...grouped.entries()].map(([characterName, scenes]) => (
                <div className="merge-dialog-character" key={characterName}>
                  <h3>{characterName}</h3>
                  {scenes.map(scene => {
                    const isChanged = scene.changed;
                    const posChanged = scene.leftPosition !== scene.rightPosition;
                    return (
                      <label
                        key={scene.sceneId}
                        className={`merge-scene-row ${!isChanged ? 'unchanged' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(scene.sceneId)}
                          disabled={!isChanged}
                          onChange={() => toggleScene(scene.sceneId)}
                        />
                        <span className="merge-scene-number">#{scene.sceneNumber}</span>
                        {isChanged ? (
                          <span className="merge-scene-titles">
                            <span className="merge-scene-old">{scene.leftTitle}</span>
                            <span className="merge-scene-arrow">&rarr;</span>
                            <span className="merge-scene-new">{scene.rightTitle}</span>
                          </span>
                        ) : (
                          <span className="merge-scene-titles">
                            <span>{scene.leftTitle}</span>
                          </span>
                        )}
                        {posChanged && (
                          <span className="merge-scene-pos">
                            pos {scene.leftPosition ?? '–'} &rarr; {scene.rightPosition ?? '–'}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="merge-dialog-footer">
              <button className="merge-dialog-cancel" onClick={onClose}>Cancel</button>
              <button
                className="merge-dialog-confirm"
                disabled={selectedIds.size === 0}
                onClick={() => onMerge([...selectedIds])}
              >
                Merge {selectedIds.size} Scene{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
