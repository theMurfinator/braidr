# ClickUp-Style Option Editor for Metadata Fields

## Summary

Replace the comma-separated text input for dropdown/multiselect metadata field options with an inline ClickUp-style option editor. Each option is a colored pill with a drag handle for reordering, a color swatch picker, and a remove button. A search/add input at the top lets users type to filter existing options or create new ones.

## Motivation

The current comma-separated input is fragile (typos, no visual feedback) and doesn't support per-option colors for dropdown/multiselect fields. The status field already has a dedicated color editor, but regular dropdown/multiselect fields don't. This upgrade brings parity and a better UX.

## Data Model

No schema changes. `MetadataFieldDef` already has:
- `options?: string[]` — option values
- `optionColors?: Record<string, string>` — per-option color mapping

These fields are currently only populated for `_status`. After this change, dropdown and multiselect fields will also populate `optionColors`.

## Expanded Color Palette

Replace the existing 8-color `STATUS_COLORS` array with a 16-color palette:

```typescript
const OPTION_COLORS = [
  '#9e9e9e', '#64b5f6', '#4a90d9', '#3949ab',  // gray, light blue, blue, dark blue
  '#9b59b6', '#e91e8a', '#e74c3c', '#e8973d',  // purple, pink, red, orange
  '#f39c12', '#cddc39', '#4caf7a', '#1abc9c',  // yellow, lime, green, teal
  '#00bcd4', '#795548', '#607d8b', '#37474f',  // cyan, brown, blue-gray, charcoal
];
```

This palette is shared between the new `OptionEditor` component and the existing status editor. Export it from `OptionEditor.tsx` and import it in `EditorView.tsx` to replace the local `STATUS_COLORS`.

## New Component: `OptionEditor`

**File:** `src/renderer/components/OptionEditor.tsx`

### Props

```typescript
interface OptionEditorProps {
  options: string[];
  optionColors: Record<string, string>;
  onChange: (options: string[], optionColors: Record<string, string>) => void;
}
```

### Layout

```
+------------------------------------------+
| [ Search or add options...           ]   |
+------------------------------------------+
| ⠿  [  Option A  ]  ●●●●●●●●  ×        |
| ⠿  [  Option B  ]  ●●●●●●●●  ×        |
| ⠿  [  Option C  ]  ●●●●●●●●  ×        |
+------------------------------------------+
```

Each row contains:
1. **Drag handle** — 6-dot grip icon (CSS `cursor: grab`), initiates drag
2. **Colored pill** — displays option name on its background color, also an editable text input (click to rename)
3. **Color swatches** — 16-color grid (8x2), click to set color. Current color has a white border/check
4. **Remove button** — `×` to delete the option

### Behavior

- **Adding options:** Type in the search input and press Enter. Creates a new option with the next unused color from `OPTION_COLORS` (cycling through the palette), falling back to `#9e9e9e` if all are used. Input clears after adding.
- **Filtering:** Typing in the search input filters the displayed option list (case-insensitive substring match). Non-matching options are hidden but not removed.
- **Renaming:** Click the pill text to edit inline. Blur or Enter saves. On rename, the `optionColors` entry is migrated (old key deleted, new key inserted with same color).
- **Validation:** Empty names and duplicate names are rejected (no-op, no error message needed).
- **Reordering:** Native HTML5 drag-and-drop on the drag handle. `dragstart`, `dragover`, `drop` events. Also provide up/down arrow buttons as a fallback (matches the status editor pattern, works on touch devices). Reorders the `options` array and calls `onChange`.
- **Color change:** Click a swatch to set the option's color. Calls `onChange`.
- **Remove:** Click `×` to remove the option from both `options` and `optionColors`. Calls `onChange`.
- **Default colors for existing options:** Options with no entry in `optionColors` are displayed with `#9e9e9e` (gray). Colors are only written when the user makes a change.

Note: All `onChange` calls update the parent's local editing state (`editingFieldDefs`), not persisted data. The existing Save/Cancel buttons on the modal handle persistence.

### Color Swatch Layout

Swatches are displayed in a compact 8x2 grid of small circles (18px diameter). Shown inline in each option row. The currently selected color has a white border or subtle ring. The option list has a `max-height` with `overflow-y: auto` to handle many options without making the modal too tall.

## Integration in EditorView

### Edit Properties Modal (lines 2074-2116)

Update the type-change handler (line 2091) to also clear `optionColors`:
```tsx
onChange={e => updateField(field.id, { type: e.target.value as MetadataFieldDef['type'], options: [], optionColors: {} })}
```

Replace the conditional comma-separated input (lines 2096-2103):

```tsx
{(field.type === 'dropdown' || field.type === 'multiselect') && (
  <input
    type="text"
    className="meta-field-editor-options"
    value={(field.options || []).join(', ')}
    onChange={e => updateField(field.id, { options: ... })}
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

### Status Editor Modal

Update the status editor (lines 2119-2182) to import and use `OPTION_COLORS` from the new component instead of the local `STATUS_COLORS` constant. The status editor's own UI structure stays the same — it just gets the expanded palette.

### Inline Metadata Display (SceneCard)

The multiselect chip rendering in `SceneCard.tsx` already reads `optionColors` for coloring chips. Dropdown fields currently render as a plain `<select>`. No changes needed to SceneCard — the colors will automatically apply since the data is already wired.

### Table View

TableView renders dropdown values as text in cells. No changes needed — the color data is stored but table cells don't need pill styling.

## Styling

Add CSS in `styles.css` for the new component:

- `.option-editor` — container
- `.option-editor-search` — search/add input, full width
- `.option-editor-list` — scrollable list of option rows
- `.option-editor-row` — flexbox row (handle, pill, swatches, remove)
- `.option-editor-handle` — drag grip, `cursor: grab`
- `.option-editor-pill` — colored pill with padding, border-radius, editable text
- `.option-editor-swatches` — 8x2 grid of color circles
- `.option-editor-swatch` — individual color circle, `.active` state with white border
- `.option-editor-remove` — `×` button

Dark theme compatible — use existing dark theme patterns from the app.

## Scope Exclusions

- No changes to the `_status` field's separate editor modal (beyond the expanded palette)
- No changes to SceneCard or TableView rendering
- No changes to `MetadataFieldDef` type definition
- No drag-and-drop library — native HTML5 DnD only

## Testing

- Verify adding options via Enter key
- Verify search filtering shows/hides options
- Verify color changes persist through save
- Verify drag reordering updates option order
- Verify removing options works
- Verify duplicate/empty names are rejected
- Verify existing dropdown/multiselect fields with options but no colors get default gray
- Verify status editor still works with expanded palette
