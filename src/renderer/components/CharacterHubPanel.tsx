import { useState, useRef } from 'react';
import { CharacterPsychology } from '../../shared/types';

const FIELDS: Array<{ key: keyof CharacterPsychology; label: string; sublabel: string; color: string }> = [
  { key: 'wound',                 label: 'Wound',                  sublabel: 'The deep hurt that is the source of the negative worldview', color: '#ef4444' },
  { key: 'lie',                   label: 'Lie',                    sublabel: 'The limiting belief keeping the character from the truth', color: '#f97316' },
  { key: 'deepestFear',           label: 'Deepest Fear',           sublabel: 'The known or unknown terrible fear the character carries', color: '#a855f7' },
  { key: 'limitingBelief',        label: 'Limiting Belief',        sublabel: 'The packaged result of the wound, lie, and deepest fear', color: '#ec4899' },
  { key: 'thorn',                 label: 'Thorn',                  sublabel: 'A visceral reminder that the surface want will never heal the wound', color: '#6366f1' },
  { key: 'copingTool',            label: 'Coping Tool',            sublabel: 'The main tool the character uses to blunt the pain of the thorn', color: '#14b8a6' },
  { key: 'whisperOfGrace',        label: 'Whisper of Grace',       sublabel: 'The small voice calling the character toward truth and grace', color: '#22c55e' },
  { key: 'surfaceWant',           label: 'Surface Want',           sublabel: 'Known. Doing today. Produces internal pain but external comfort.', color: '#f97316' },
  { key: 'soulsLonging',          label: "Soul's Longing",         sublabel: 'Wildly compelling. Opposite of the surface want.', color: '#6366f1' },
  { key: 'bitterNeed',            label: 'Bitter Need',            sublabel: 'Something the character must learn or do. The cost of the core want.', color: '#ec4899' },
  { key: 'capitalTTruth',         label: 'Capital-T Truth',        sublabel: "The awareness the character needs to step into the soul's longing", color: '#22c55e' },
  { key: 'arcSummary',            label: 'Arc Summary',            sublabel: "One sentence: what is this character's arc?", color: '#6366f1' },
  { key: 'theme',                 label: 'Theme',                  sublabel: "The story's statement of truth", color: '#6366f1' },
  { key: 'antiTheme',             label: 'Anti-theme',             sublabel: 'The lie the story disproves', color: '#ef4444' },
  { key: 'finalReaderExperience', label: 'Final Reader Experience', sublabel: 'What does the reader feel on the last page?', color: '#22c55e' },
];

function emptyPsych(characterId: string): CharacterPsychology {
  return {
    characterId,
    novelStartingState: '', novelEndingState: '', novelPolarity: '', novelTransformation: '',
    wound: '', lie: '', deepestFear: '', limitingBelief: '', thorn: '', copingTool: '',
    whisperOfGrace: '', surfaceWant: '', soulsLonging: '', bitterNeed: '', capitalTTruth: '',
    arcSummary: '', theme: '', antiTheme: '', finalReaderExperience: '',
  };
}

interface CharacterHubPanelProps {
  characterName: string;
  characterColor: string;
  psychology: CharacterPsychology | null;
  selectedCharacterId: string;
  onSave: (p: CharacterPsychology) => void;
  onClose: () => void;
}

export default function CharacterHubPanel({
  characterName,
  characterColor,
  psychology,
  selectedCharacterId,
  onSave,
  onClose,
}: CharacterHubPanelProps) {
  const [local, setLocal] = useState<CharacterPsychology>(
    psychology || emptyPsych(selectedCharacterId)
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateField = (key: keyof CharacterPsychology, value: string) => {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(updated), 800);
  };

  return (
    <div className="hub-overlay" onClick={onClose}>
      <div className="hub-panel" onClick={e => e.stopPropagation()}>
        <div className="hub-panel-header">
          <span className="hub-char-dot" style={{ background: characterColor }} />
          <span className="hub-panel-title">{characterName} — Character Hub</span>
          <button className="hub-panel-close" onClick={onClose}>×</button>
        </div>
        <div className="hub-panel-body">
          {FIELDS.map(({ key, label, sublabel, color }) => (
            <div key={key} className="hub-field">
              <div className="hub-field-label" style={{ color }}>{label}</div>
              <div className="hub-field-sub">{sublabel}</div>
              <textarea
                className="hub-field-input"
                value={local[key] as string}
                onChange={e => updateField(key, e.target.value)}
                placeholder={`${label}...`}
                rows={2}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
