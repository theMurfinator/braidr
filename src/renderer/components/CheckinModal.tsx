import { useState } from 'react';

interface CheckinModalProps {
  sceneLabel?: string;
  durationMs?: number;
  wordsNet?: number;
  standalone?: boolean;
  onSubmit: (checkin: { energy: number; focus: number; mood: number }) => void;
  onSkip: () => void;
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

export default function CheckinModal({ sceneLabel, durationMs = 0, wordsNet = 0, standalone, onSubmit, onSkip }: CheckinModalProps) {
  const [energy, setEnergy] = useState(0);
  const [focus, setFocus] = useState(0);
  const [mood, setMood] = useState(0);

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
        </div>

        <div className="checkin-actions">
          <button className="checkin-skip-btn" onClick={onSkip}>{standalone ? 'Cancel' : 'Skip'}</button>
          <button
            className="checkin-save-btn"
            disabled={!canSubmit}
            onClick={() => onSubmit({ energy, focus, mood })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
