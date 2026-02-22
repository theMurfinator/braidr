import { useState } from 'react';
import { CustomCheckinCategory } from '../utils/analyticsStore';

interface CheckinModalProps {
  sceneLabel?: string;
  durationMs?: number;
  wordsNet?: number;
  standalone?: boolean;
  customCategories?: CustomCheckinCategory[];
  onSubmit: (checkin: { energy: number; focus: number; mood: number; custom?: Record<string, number> }) => void;
  onSkip: () => void;
  onAddCategory?: (category: CustomCheckinCategory) => void;
  onRemoveCategory?: (categoryId: string) => void;
}

const SCALES = [
  {
    key: 'energy' as const,
    label: 'Energy',
    levels: ['Low', '', 'Medium', '', 'High'],
  },
  {
    key: 'focus' as const,
    label: 'Focus',
    levels: ['Scattered', '', 'Okay', '', 'Locked in'],
  },
  {
    key: 'mood' as const,
    label: 'Mood',
    levels: ['Rough', '', 'Neutral', '', 'Great'],
  },
];

export default function CheckinModal({ sceneLabel, durationMs = 0, wordsNet = 0, standalone, customCategories = [], onSubmit, onSkip, onAddCategory, onRemoveCategory }: CheckinModalProps) {
  const [energy, setEnergy] = useState(0);
  const [focus, setFocus] = useState(0);
  const [mood, setMood] = useState(0);
  const [customScores, setCustomScores] = useState<Record<string, number>>({});

  // Inline add-category form state
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newLowLabel, setNewLowLabel] = useState('');
  const [newHighLabel, setNewHighLabel] = useState('');

  const values = { energy, focus, mood };
  const setters = { energy: setEnergy, focus: setFocus, mood: setMood };

  const formatDuration = (ms: number) => {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  };

  const canSubmit = energy > 0 && focus > 0 && mood > 0;

  const handleAddCategory = () => {
    const label = newLabel.trim();
    if (!label || !onAddCategory) return;
    const category: CustomCheckinCategory = {
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      lowLabel: newLowLabel.trim() || 'Low',
      highLabel: newHighLabel.trim() || 'High',
    };
    onAddCategory(category);
    setNewLabel('');
    setNewLowLabel('');
    setNewHighLabel('');
    setAdding(false);
  };

  const handleSubmit = () => {
    const custom = Object.keys(customScores).length > 0 ? customScores : undefined;
    onSubmit({ energy, focus, mood, custom });
  };

  return (
    <div className="checkin-overlay" onClick={onSkip}>
      <div className="checkin-modal" onClick={e => e.stopPropagation()}>
        <div className="checkin-header">
          <h3 className="checkin-title">{standalone ? 'How are you feeling?' : 'How was that session?'}</h3>
          {!standalone && sceneLabel && (
            <div className="checkin-summary">
              <span>{sceneLabel}</span>
              <span className="checkin-summary-sep">·</span>
              <span>{formatDuration(durationMs)}</span>
              {wordsNet !== 0 && (
                <>
                  <span className="checkin-summary-sep">·</span>
                  <span>{wordsNet > 0 ? '+' : ''}{wordsNet} words</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="checkin-scales">
          {/* Built-in categories */}
          {SCALES.map(scale => (
            <div key={scale.key} className="checkin-row">
              <span className="checkin-row-label">{scale.label}</span>
              <div className="checkin-buttons">
                {[1, 2, 3, 4, 5].map(level => (
                  <button
                    key={level}
                    className={`checkin-btn ${values[scale.key] === level ? 'selected' : ''} level-${level}`}
                    onClick={() => setters[scale.key](level)}
                    title={scale.levels[level - 1] || `${level}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <span className="checkin-row-hint">
                {values[scale.key] > 0
                  ? (scale.levels[values[scale.key] - 1] || `${values[scale.key]}/5`)
                  : ''}
              </span>
            </div>
          ))}

          {/* Custom categories */}
          {customCategories.map(cat => {
            const score = customScores[cat.id] || 0;
            const levels = [cat.lowLabel, '', '', '', cat.highLabel];
            return (
              <div key={cat.id} className="checkin-row checkin-row-custom">
                <span className="checkin-row-label">{cat.label}</span>
                <div className="checkin-buttons">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      className={`checkin-btn ${score === level ? 'selected' : ''} level-${level}`}
                      onClick={() => setCustomScores(prev => ({ ...prev, [cat.id]: level }))}
                      title={levels[level - 1] || `${level}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <span className="checkin-row-hint">
                  {score > 0 ? (levels[score - 1] || `${score}/5`) : ''}
                </span>
                {onRemoveCategory && (
                  <button
                    className="checkin-remove-cat-btn"
                    onClick={() => onRemoveCategory(cat.id)}
                    title={`Remove ${cat.label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          {/* Add category form */}
          {adding ? (
            <div className="checkin-add-cat-form">
              <input
                className="checkin-add-cat-input"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Category name"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
              <input
                className="checkin-add-cat-input small"
                value={newLowLabel}
                onChange={e => setNewLowLabel(e.target.value)}
                placeholder="Low label"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
              <input
                className="checkin-add-cat-input small"
                value={newHighLabel}
                onChange={e => setNewHighLabel(e.target.value)}
                placeholder="High label"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
              <button
                className="checkin-add-cat-confirm"
                onClick={handleAddCategory}
                disabled={!newLabel.trim()}
              >
                Add
              </button>
              <button
                className="checkin-add-cat-cancel"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          ) : onAddCategory ? (
            <button className="checkin-add-cat-btn" onClick={() => setAdding(true)}>
              + Add category
            </button>
          ) : null}
        </div>

        <div className="checkin-actions">
          <button className="checkin-skip-btn" onClick={onSkip}>{standalone ? 'Cancel' : 'Skip'}</button>
          <button
            className="checkin-save-btn"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
