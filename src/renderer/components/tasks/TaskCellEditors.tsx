import { useState, useRef, useEffect } from 'react';
import type { Tag, Character, Scene } from '../../../shared/types';

// ── InlineTextInput ──────────────────────────────────────────────────────────

interface InlineTextInputProps {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

export function InlineTextInput({ value, onCommit, onCancel, placeholder }: InlineTextInputProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      className="task-inline-input"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(draft)}
    />
  );
}

// ── InlineNumberInput ────────────────────────────────────────────────────────

interface InlineNumberInputProps {
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  onCancel: () => void;
}

export function InlineNumberInput({ value, onCommit, onCancel }: InlineNumberInputProps) {
  const [draft, setDraft] = useState(value !== undefined ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCommit(undefined);
    } else {
      const num = parseFloat(trimmed);
      onCommit(isNaN(num) ? undefined : num);
    }
  }

  return (
    <input
      ref={inputRef}
      type="number"
      className="task-inline-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={commit}
    />
  );
}

// ── InlineDropdown ───────────────────────────────────────────────────────────

interface InlineDropdownProps {
  options: { value: string; label: string; color?: string }[];
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function InlineDropdown({ options, value, onCommit, onCancel }: InlineDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  return (
    <div ref={ref} className="task-inline-dropdown">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`task-inline-dropdown-option${opt.value === value ? ' active' : ''}`}
          onClick={() => onCommit(opt.value)}
        >
          {opt.color && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: opt.color,
                flexShrink: 0,
              }}
            />
          )}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── InlineDatePicker ─────────────────────────────────────────────────────────

interface InlineDatePickerProps {
  value: number | undefined; // timestamp
  onCommit: (value: number | undefined) => void;
  onCancel: () => void;
}

function timestampToDateString(ts: number | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateStringToTimestamp(s: string): number | undefined {
  if (!s) return undefined;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

export function InlineDatePicker({ value, onCommit, onCancel }: InlineDatePickerProps) {
  const [draft, setDraft] = useState(timestampToDateString(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.showPicker?.();
  }, []);

  return (
    <input
      ref={inputRef}
      type="date"
      className="task-inline-input"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value) {
          onCommit(dateStringToTimestamp(e.target.value));
        }
      }}
      onBlur={() => {
        if (draft) {
          onCommit(dateStringToTimestamp(draft));
        } else {
          onCommit(undefined);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

// ── TagPicker ────────────────────────────────────────────────────────────────

interface TagPickerProps {
  selectedTags: string[];
  availableTags: Tag[];
  onCommit: (tags: string[]) => void;
  onCancel: () => void;
}

export function TagPicker({ selectedTags, availableTags, onCommit, onCancel: _onCancel }: TagPickerProps) {
  const [selected, setSelected] = useState<string[]>([...selectedTags]);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCommit(selected);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selected, onCommit]);

  function toggle(tagId: string) {
    setSelected((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  }

  const query = search.toLowerCase();
  const filtered = availableTags.filter(
    (tag) => !query || tag.name.toLowerCase().includes(query)
  );

  return (
    <div ref={ref} className="task-inline-dropdown">
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <input
          ref={inputRef}
          type="text"
          className="task-inline-input"
          placeholder="Search tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCommit(selected);
          }}
        />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {filtered.map((tag) => (
          <button
            key={tag.id}
            className="task-picker-checkbox"
            onClick={() => toggle(tag.id)}
          >
            <input
              type="checkbox"
              checked={selected.includes(tag.id)}
              readOnly
              style={{ pointerEvents: 'none' }}
            />
            {tag.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
            No matching tags
          </div>
        )}
      </div>
      <button
        className="task-inline-dropdown-option"
        style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}
        onClick={() => onCommit(selected)}
      >
        Done
      </button>
    </div>
  );
}

// ── CharacterPicker ──────────────────────────────────────────────────────────

interface CharacterPickerProps {
  selectedIds: string[];
  characters: Character[];
  onCommit: (ids: string[]) => void;
  onCancel: () => void;
}

export function CharacterPicker({ selectedIds, characters, onCommit, onCancel: _onCancel }: CharacterPickerProps) {
  const [selected, setSelected] = useState<string[]>([...selectedIds]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCommit(selected);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selected, onCommit]);

  function toggle(charId: string) {
    setSelected((prev) =>
      prev.includes(charId) ? prev.filter((c) => c !== charId) : [...prev, charId]
    );
  }

  return (
    <div ref={ref} className="task-inline-dropdown">
      {characters.map((char) => (
        <button
          key={char.id}
          className="task-picker-checkbox"
          onClick={() => toggle(char.id)}
        >
          <input
            type="checkbox"
            checked={selected.includes(char.id)}
            readOnly
            style={{ pointerEvents: 'none' }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: char.color || '#666',
              flexShrink: 0,
            }}
          />
          {char.name}
        </button>
      ))}
      <button
        className="task-inline-dropdown-option"
        style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}
        onClick={() => onCommit(selected)}
      >
        Done
      </button>
    </div>
  );
}

// ── ScenePicker ──────────────────────────────────────────────────────────────

interface ScenePickerProps {
  value: string | undefined; // sceneKey
  scenes: Scene[];
  characters: Character[];
  onCommit: (sceneKey: string | undefined) => void;
  onCancel: () => void;
}

export function ScenePicker({ value, scenes, characters, onCommit, onCancel }: ScenePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  // Group scenes by character
  const charMap = new Map<string, Character>();
  for (const c of characters) charMap.set(c.id, c);

  const grouped = new Map<string, Scene[]>();
  for (const scene of scenes) {
    const list = grouped.get(scene.characterId) || [];
    list.push(scene);
    grouped.set(scene.characterId, list);
  }

  // Filter by search term
  const query = search.toLowerCase();

  return (
    <div ref={ref} className="task-inline-dropdown" style={{ minWidth: 260 }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <input
          ref={inputRef}
          type="text"
          className="task-inline-input"
          placeholder="Search scenes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
        />
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {!search && (
          <button
            className={`task-inline-dropdown-option${!value ? ' active' : ''}`}
            onClick={() => onCommit(undefined)}
          >
            None
          </button>
        )}
        {Array.from(grouped.entries()).map(([charId, charScenes]) => {
          const char = charMap.get(charId);
          const charName = char?.name || charId;
          const filtered = charScenes.filter((scene) => {
            if (!query) return true;
            const label = `${charName} scene ${scene.sceneNumber} ${scene.title}`.toLowerCase();
            return label.includes(query);
          });
          if (filtered.length === 0) return null;
          return filtered.map((scene) => {
            const sceneKey = `${charId}:${scene.sceneNumber}`;
            return (
              <button
                key={sceneKey}
                className={`task-inline-dropdown-option${sceneKey === value ? ' active' : ''}`}
                onClick={() => onCommit(sceneKey)}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: char?.color || '#666',
                    flexShrink: 0,
                  }}
                />
                {charName} &mdash; Scene #{scene.sceneNumber}: {scene.title}
              </button>
            );
          });
        })}
      </div>
    </div>
  );
}
