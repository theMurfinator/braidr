# ClickUp-Style Option Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the comma-separated text input for dropdown/multiselect metadata options with an inline ClickUp-style editor featuring colored pills, search/add, drag reorder, and a 16-color palette.

**Architecture:** New `OptionEditor` component in its own file, integrated into EditorView's Edit Properties modal. Exports the shared `OPTION_COLORS` constant used by both the new component and the existing status editor.

**Tech Stack:** React (Vite, `react-jsx` mode — no React import needed), CSS, native HTML5 drag-and-drop.

**Spec:** `docs/superpowers/specs/2026-04-06-clickup-option-editor-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/renderer/components/OptionEditor.tsx` | New OptionEditor component + exported `OPTION_COLORS` constant |
| Modify | `src/renderer/components/EditorView.tsx:84,2091,2096-2103,2136` | Import OptionEditor + OPTION_COLORS, replace comma input, update type-change handler, update status editor palette |
| Modify | `src/renderer/styles.css:8468-8476` | Replace `.meta-field-editor-options` with new `.option-editor-*` styles |

---

### Task 1: Create OptionEditor component with add/remove functionality

**Files:**
- Create: `src/renderer/components/OptionEditor.tsx`

- [ ] **Step 1: Create the OptionEditor component file with OPTION_COLORS, props interface, and basic structure**

Create `src/renderer/components/OptionEditor.tsx`:

```tsx
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
            <span className="option-editor-pill" style={{ background: getColor(name) }}>
              {name}
            </span>
            <button className="option-editor-remove" onClick={() => removeOption(name)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep OptionEditor | head -20`

Note: There may be pre-existing TS errors in the codebase. Only check for errors mentioning OptionEditor.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/OptionEditor.tsx
git commit -m "feat: add OptionEditor component with add/remove and color palette"
```

---

### Task 2: Add inline rename and color swatch picker

**Files:**
- Modify: `src/renderer/components/OptionEditor.tsx`

- [ ] **Step 1: Add rename state and color change handlers**

In the `OptionEditor` function body, after the existing state/handlers, add:

```tsx
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
```

- [ ] **Step 2: Update the row rendering to support inline rename and color swatches**

Replace the pill `<span>` and the area before the remove button in each row with:

```tsx
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
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep OptionEditor | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/OptionEditor.tsx
git commit -m "feat: add inline rename and color swatch picker to OptionEditor"
```

---

### Task 3: Add drag-and-drop and arrow button reordering

**Files:**
- Modify: `src/renderer/components/OptionEditor.tsx`

- [ ] **Step 1: Add drag state and reorder handlers**

In the `OptionEditor` function body, add:

```tsx
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
```

- [ ] **Step 2: Update row rendering to add drag handle and arrow buttons**

Update each row in the `filtered.map` to include the drag handle at the start and arrow buttons before the remove button. The full row becomes:

```tsx
{filtered.map((name, i) => {
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
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep OptionEditor | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/OptionEditor.tsx
git commit -m "feat: add drag-and-drop and arrow button reordering to OptionEditor"
```

---

### Task 4: Add CSS styles for OptionEditor

**Files:**
- Modify: `src/renderer/styles.css:8468-8476`

- [ ] **Step 1: Replace `.meta-field-editor-options` with new `.option-editor-*` styles**

Replace the `.meta-field-editor-options` block (lines 8468-8476) with the full OptionEditor styles:

```css
/* ===== Option Editor (ClickUp-style) ===== */
.option-editor {
  width: 100%;
  margin-top: 8px;
}

.option-editor-search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-sizing: border-box;
}

.option-editor-search::placeholder {
  color: var(--text-muted);
}

.option-editor-list {
  max-height: 240px;
  overflow-y: auto;
  margin-top: 6px;
}

.option-editor-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.option-editor-row:last-child {
  border-bottom: none;
}

.option-editor-handle {
  cursor: grab;
  color: var(--text-muted);
  font-size: 14px;
  user-select: none;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.option-editor-handle:active {
  cursor: grabbing;
}

.option-editor-pill {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.option-editor-rename {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
  width: 120px;
  flex-shrink: 0;
}

.option-editor-rename:focus {
  outline: none;
  border-color: var(--text-secondary);
}

.option-editor-swatches {
  display: grid;
  grid-template-columns: repeat(8, 18px);
  gap: 3px;
  flex-shrink: 0;
}

.option-editor-swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.1s, transform 0.1s;
  box-sizing: border-box;
}

.option-editor-swatch:hover {
  transform: scale(1.15);
}

.option-editor-swatch.active {
  border-color: #fff;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
}

.option-editor-reorder {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex-shrink: 0;
}

.option-editor-move-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 3px;
  line-height: 1;
  transition: color 0.15s;
}

.option-editor-move-btn:hover:not(:disabled) {
  color: var(--text-primary);
}

.option-editor-move-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.option-editor-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 0 3px;
  line-height: 1;
  flex-shrink: 0;
}

.option-editor-remove:hover {
  color: #e94560;
}
```

- [ ] **Step 2: Verify the app still loads with the CSS changes**

Run: `cd /Users/brian/braidr && npx vite build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat: add CSS styles for ClickUp-style OptionEditor"
```

---

### Task 5: Integrate OptionEditor into EditorView and update status editor palette

**Files:**
- Modify: `src/renderer/components/EditorView.tsx:84,2091,2096-2103,2136`

- [ ] **Step 1: Add import for OptionEditor and OPTION_COLORS**

At the top of `EditorView.tsx`, with the other component imports, add:

```tsx
import { OptionEditor, OPTION_COLORS } from './OptionEditor';
```

- [ ] **Step 2: Remove the local STATUS_COLORS constant**

Delete line 84:

```tsx
const STATUS_COLORS = ['#9e9e9e', '#4a90d9', '#e8973d', '#4caf7a', '#e74c3c', '#9b59b6', '#1abc9c', '#f39c12'];
```

Replace all references to `STATUS_COLORS` with `OPTION_COLORS` in the file.

- [ ] **Step 3: Update the type-change handler to clear optionColors**

On line 2091, change:

```tsx
<select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as MetadataFieldDef['type'], options: [] })}>
```

To:

```tsx
<select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as MetadataFieldDef['type'], options: [], optionColors: {} })}>
```

- [ ] **Step 4: Replace the comma-separated input with OptionEditor**

Replace lines 2096-2103:

```tsx
{(field.type === 'dropdown' || field.type === 'multiselect') && (
  <input
    type="text"
    className="meta-field-editor-options"
    value={(field.options || []).join(', ')}
    onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
    placeholder="Option 1, Option 2..."
  />
)}
```

With:

```tsx
{(field.type === 'dropdown' || field.type === 'multiselect') && (
  <OptionEditor
    options={field.options || []}
    optionColors={field.optionColors || {}}
    onChange={(options, optionColors) => updateField(field.id, { options, optionColors })}
  />
)}
```

- [ ] **Step 5: Update modal width and layout for vertical stacking**

First, bump the modal body `minWidth` from `'360px'` to `'520px'` (line 2081) to accommodate the 16-color swatch grid in each row.

Then update the `editingFieldDefs.map(...)` block. The row currently uses `display: flex` with `align-items: center` (all in one horizontal line). With the new OptionEditor expanding below the field name/type selector, wrap the field name input, type select, and remove button in a flex row, then render the OptionEditor below it:

```tsx
{editingFieldDefs.map((field, i) => (
  <div key={field.id} className="meta-field-editor-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <input
        type="text"
        className="meta-field-editor-label"
        value={field.label}
        onChange={e => updateField(field.id, { label: e.target.value })}
        placeholder="Field name"
      />
      <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as MetadataFieldDef['type'], options: [], optionColors: {} })}>
        <option value="text">Text</option>
        <option value="dropdown">Dropdown</option>
        <option value="multiselect">Multiselect</option>
      </select>
      <button className="meta-field-editor-remove" onClick={() => removeField(field.id)}>×</button>
    </div>
    {(field.type === 'dropdown' || field.type === 'multiselect') && (
      <OptionEditor
        options={field.options || []}
        optionColors={field.optionColors || {}}
        onChange={(options, optionColors) => updateField(field.id, { options, optionColors })}
      />
    )}
  </div>
))}
```

- [ ] **Step 6: Verify the file compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -i "OptionEditor\|EditorView" | head -10`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/EditorView.tsx
git commit -m "feat: integrate OptionEditor into Edit Properties modal and expand status palette"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/brian/braidr && npm run dev`

- [ ] **Step 2: Verify the OptionEditor in the Edit Properties modal**

1. Open a project in the app
2. Click the gear/settings icon to open "Edit Properties"
3. Add a new property, set type to "Dropdown"
4. Verify the ClickUp-style option editor appears below the field name/type row
5. Type an option name in the search box and press Enter — verify colored pill appears
6. Add several options — verify they cycle through different colors
7. Click a color swatch — verify the pill color changes
8. Click a pill — verify inline rename activates
9. Rename an option — verify the color follows the new name
10. Try adding a duplicate name — verify it's rejected (no-op)
11. Click ↑/↓ arrows — verify options reorder
12. Drag a handle — verify drag reorder works
13. Click × — verify option is removed
14. Type in search with existing options — verify filtering works
15. Click Save — verify changes persist
16. Click Cancel on a new edit — verify changes are discarded

- [ ] **Step 3: Verify the status editor still works**

1. Open the status editor
2. Verify the expanded 16-color palette appears
3. Verify existing status colors are preserved
4. Add/remove/reorder statuses — verify everything still works

- [ ] **Step 4: Verify switching field types clears options**

1. Create a dropdown field with options and colors
2. Save
3. Reopen Edit Properties, change the field type to Text
4. Change it back to Dropdown — verify options and colors are cleared

- [ ] **Step 5: Verify existing data compatibility**

1. If you have existing dropdown/multiselect fields with options (created with the old comma input), verify they display with default gray pills
2. Change a color on one and save — verify it persists
