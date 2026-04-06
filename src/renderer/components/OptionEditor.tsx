import { useState, useRef, useEffect, useCallback } from 'react';

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
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

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
    if (colorPickerFor === name) setColorPickerFor(null);
  };

  const startRename = (name: string) => {
    setEditingName(name);
    setEditValue(name);
    setColorPickerFor(null);
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
    setColorPickerFor(null);
  };

  const toggleColorPicker = useCallback((name: string, dotEl: HTMLElement) => {
    if (colorPickerFor === name) {
      setColorPickerFor(null);
      return;
    }
    const rect = dotEl.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setColorPickerFor(name);
  }, [colorPickerFor]);

  // Close editor when clicking outside
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setExpanded(false);
        setColorPickerFor(null);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!colorPickerFor) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking the dot itself (toggle handles that)
      if (target.closest('.option-editor-color-dot')) return;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        setColorPickerFor(null);
      }
    };
    // Use setTimeout so the current click event doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [colorPickerFor]);

  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragIdx.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
  };

  const handleDrop = () => {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from === null || to === null || from === to) return;
    const reordered = [...options];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onChange(reordered, optionColors);
    dragIdx.current = null;
    dragOverIdx.current = null;
  };

  const moveOption = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= options.length) return;
    const reordered = [...options];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    onChange(reordered, optionColors);
  };

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="option-editor" ref={editorRef}>
      {!expanded ? (
        <button
          className="option-editor-toggle"
          onClick={() => setExpanded(true)}
        >
          {options.length > 0 ? (
            <span className="option-editor-pill-summary">
              {options.map(name => (
                <span key={name} className="option-editor-pill-mini" style={{ background: getColor(name) }}>{name}</span>
              ))}
            </span>
          ) : (
            <span className="option-editor-toggle-placeholder">Click to add options...</span>
          )}
        </button>
      ) : (
        <>
      <input
        className="option-editor-search"
        type="text"
        placeholder="Search or add options..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
        autoFocus
      />
      <div className="option-editor-list">
        {filtered.map((name) => {
          const realIdx = options.indexOf(name);
          return (
            <div
              key={name}
              className="option-editor-row"
              draggable
              onDragStart={() => handleDragStart(realIdx)}
              onDragOver={e => handleDragOver(e, realIdx)}
              onDrop={handleDrop}
            >
              <span className="option-editor-handle" title="Drag to reorder">⠿</span>
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
              <div
                className="option-editor-color-dot"
                style={{ background: getColor(name) }}
                onClick={e => toggleColorPicker(name, e.currentTarget)}
                title="Change color"
              />
              <div className="option-editor-reorder">
                <button
                  className="option-editor-move-btn"
                  onClick={() => moveOption(realIdx, 'up')}
                  disabled={realIdx === 0}
                  title="Move up"
                >↑</button>
                <button
                  className="option-editor-move-btn"
                  onClick={() => moveOption(realIdx, 'down')}
                  disabled={realIdx === options.length - 1}
                  title="Move down"
                >↓</button>
              </div>
              <button className="option-editor-remove" onClick={() => removeOption(name)}>×</button>
            </div>
          );
        })}
      </div>
      {colorPickerFor && popoverPos && (
        <div
          className="option-editor-color-popover"
          ref={popoverRef}
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          {OPTION_COLORS.map(c => (
            <div
              key={c}
              className={`option-editor-swatch${getColor(colorPickerFor) === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(colorPickerFor, c)}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
