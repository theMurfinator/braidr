import { useEffect, useRef, useState } from 'react';
import type { Scene } from '../../shared/types';

interface OutlineViewProps {
  scenes: Scene[]; // braid order
  outlines: Record<string, string>;
  getCharacterName: (characterId: string) => string;
  getCharacterHexColor: (characterId: string) => string;
  onOutlineChange: (sceneId: string, text: string) => void;
}

// Soft word-count gravity. Calm up to TARGET, warn past MAX.
const TARGET_WORDS = 250;
const MAX_WORDS = 300;

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

interface OutlineCardProps {
  scene: Scene;
  characterName: string;
  accent: string;
  value: string;
  onChange: (text: string) => void;
}

// Each card owns its local text + a debounce so the DB isn't hit per keystroke.
function OutlineCard({ scene, characterName, accent, value, onChange }: OutlineCardProps) {
  const [text, setText] = useState(value);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPropValue = useRef(value);

  // Keep local text in sync if the underlying value changes from elsewhere
  // (e.g. project reload) without clobbering in-progress typing.
  useEffect(() => {
    if (value !== lastPropValue.current) {
      lastPropValue.current = value;
      setText(value);
    }
  }, [value]);

  // Auto-grow the textarea to fit its content.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = (next: string) => {
    setText(next);
    lastPropValue.current = next;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(next), 500);
  };

  const words = countWords(text);
  const isEmpty = words === 0;
  const overMax = words > MAX_WORDS;
  const nearTarget = words > TARGET_WORDS && words <= MAX_WORDS;

  return (
    <div className={`outline-card${isEmpty ? ' outline-card--empty' : ''}`}>
      <div className="outline-card__header">
        <span className="outline-card__pov" style={{ backgroundColor: accent }}>{characterName}</span>
        <span className="outline-card__title">{scene.title || 'Untitled scene'}</span>
        {scene.content && <span className="outline-card__synopsis">{scene.content}</span>}
      </div>
      <textarea
        ref={taRef}
        className="outline-card__body"
        value={text}
        placeholder="What happens in this scene? Rough it out, flat and ugly, no prose."
        onChange={(e) => handleChange(e.target.value)}
        rows={1}
      />
      <div className="outline-card__footer">
        {isEmpty ? (
          <span className="outline-card__hole">Not outlined yet</span>
        ) : (
          <span className={`outline-card__count${overMax ? ' is-over' : nearTarget ? ' is-near' : ''}`}>
            {words} {words === 1 ? 'word' : 'words'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function OutlineView({ scenes, outlines, getCharacterName, getCharacterHexColor, onOutlineChange }: OutlineViewProps) {
  const total = scenes.length;
  const outlined = scenes.filter(s => (outlines[s.id] || '').trim().length > 0).length;

  return (
    <div className="outline-view">
      <div className="outline-view__meta">
        <span className="outline-view__progress">{outlined} of {total} scenes outlined</span>
        <span className="outline-view__hint">Read the arc top to bottom. Blanks are the holes.</span>
      </div>
      <div className="outline-view__stack">
        {scenes.map((scene) => (
          <OutlineCard
            key={scene.id}
            scene={scene}
            characterName={getCharacterName(scene.characterId)}
            accent={getCharacterHexColor(scene.characterId)}
            value={outlines[scene.id] || ''}
            onChange={(text) => onOutlineChange(scene.id, text)}
          />
        ))}
        {total === 0 && (
          <div className="outline-view__empty">No braided scenes yet. Add scenes to start outlining the arc.</div>
        )}
      </div>
    </div>
  );
}
