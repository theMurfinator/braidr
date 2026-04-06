import { useState, useRef } from 'react';

export const OPTION_COLORS = [
  '#9e9e9e', '#64b5f6', '#4a90d9', '#3949ab',
  '#9b59b6', '#e91e8a', '#e74c3c', '#e8973d',
  '#f39c12', '#cddc39', '#4caf7a', '#1abc9c',
  '#00bcd4', '#795548', '#607d8b', '#37474f',
];

interface OptionEditorProps {
  options: string[];
  optionColors: Record<string, string>;
  onChange: (options: string[], optionColors: Record<string, string>) => void;
}

export function OptionEditor({ options, optionColors, onChange }: OptionEditorProps) {
  const [search, setSearch] = useState('');

  const getColor = (name: string) => optionColors[name] || '#9e9e9e';

  const getNextColor = () => {
    const usedColors = new Set(options.map(o => getColor(o)));
    return OPTION_COLORS.find(c => !usedColors.has(c)) || '#9e9e9e';
  };

  const addOption = () => {
    const name = search.trim();
    if (!name || options.includes(name)) return;
    const color = getNextColor();
    onChange([...options, name], { ...optionColors, [name]: color });
    setSearch('');
  };

  const removeOption = (name: string) => {
    const newColors = { ...optionColors };
    delete newColors[name];
    onChange(options.filter(o => o !== name), newColors);
  };

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const startRename = (name: string) => {
    setEditingName(name);
    setEditValue(name);
    setTimeout(() => editRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (!editingName) return;
    const newName = editValue.trim();
    if (!newName || (newName !== editingName && options.includes(newName))) {
      setEditingName(null);
      return;
    }
    if (newName === editingName) { setEditingName(null); return; }
    const newOptions = options.map(o => o === editingName ? newName : o);
    const newColors = { ...optionColors };
    const color = newColors[editingName] || '#9e9e9e';
    delete newColors[editingName];
    newColors[newName] = color;
    onChange(newOptions, newColors);
    setEditingName(null);
  };

  const setColor = (name: string, color: string) => {
    onChange(options, { ...optionColors, [name]: color });
  };

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="option-editor">
      <input
        className="option-editor-search"
        type="text"
        placeholder="Search or add options..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
      />
      <div className="option-editor-list">
        {filtered.map(name => (
          <div key={name} className="option-editor-row">
            {editingName === name ? (
              <input
                ref={editRef}
                className="option-editor-rename"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingName(null); }}
              />
            ) : (
              <span
                className="option-editor-pill"
                style={{ background: getColor(name) }}
                onClick={() => startRename(name)}
                title="Click to rename"
              >
                {name}
              </span>
            )}
            <div className="option-editor-swatches">
              {OPTION_COLORS.map(c => (
                <div
                  key={c}
                  className={`option-editor-swatch${getColor(name) === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(name, c)}
                />
              ))}
            </div>
            <button className="option-editor-remove" onClick={() => removeOption(name)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
