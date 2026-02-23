# Inline Metadata Fields Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow writers to toggle metadata fields to appear inline after the synopsis in the POV view, editable and styled identically to synopsis text.

**Architecture:** New state in App.tsx (`inlineMetadataFields: string[]`, `showInlineLabels: boolean`) persisted in timeline.json. A "Fields" dropdown in the POV toolbar controls which fields are shown. SceneCard renders selected fields between the synopsis editor and the Properties section, using the same `onMetadataChange` handler.

**Tech Stack:** React, existing TipTap + CSS patterns, Electron IPC (no new dependencies)

---

### Task 1: Add persistence fields to TimelineData

**Files:**
- Modify: `src/shared/types.ts:85-122` (TimelineData interface)

**Step 1: Add fields to TimelineData**

In `src/shared/types.ts`, add two new optional fields to the `TimelineData` interface, after the `taskViews` field (line 121):

```typescript
  // Inline metadata display preferences
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
```

**Step 2: Verify the app still compiles**

Run: `cd /Users/brian/braidr && npm run build 2>&1 | tail -5`
Expected: Build succeeds (these are optional fields, no consumers yet)

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add inlineMetadataFields and showInlineLabels to TimelineData"
```

---

### Task 2: Wire up state, load, and save in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx:62-63` (state declarations)
- Modify: `src/renderer/App.tsx:820-850` (load path)
- Modify: `src/renderer/App.tsx:2112` (save call)
- Modify: `src/renderer/services/dataService.ts:10,182-190` (saveTimeline signature + impl)

**Step 1: Add state and refs in App.tsx**

After the `hideSectionHeaders` state declaration (line 63), add:

```typescript
  const [inlineMetadataFields, setInlineMetadataFields] = useState<string[]>([]);
  const inlineMetadataFieldsRef = useRef<string[]>([]);
  const [showInlineLabels, setShowInlineLabels] = useState(true);
  const showInlineLabelsRef = useRef(true);
```

**Step 2: Load from timeline data**

In the `loadProjectFromPath` function, after loading `metadataFieldDefs` and `sceneMetadata` (around line 820-850), add:

```typescript
    const loadedInlineFields = data.inlineMetadataFields || [];
    setInlineMetadataFields(loadedInlineFields);
    inlineMetadataFieldsRef.current = loadedInlineFields;
    const loadedShowLabels = data.showInlineLabels !== undefined ? data.showInlineLabels : true;
    setShowInlineLabels(loadedShowLabels);
    showInlineLabelsRef.current = loadedShowLabels;
```

Find the exact location by searching for `setMetadataFieldDefs(loadedMetaDefs)` — add right after the metadata loading block.

**Step 3: Update the save path**

In `dataService.ts`, add `inlineMetadataFields` and `showInlineLabels` to the `saveTimeline` method:

In the interface (line 10), append to the end of the parameter list (before the closing `)`):
```typescript
, inlineMetadataFields?: string[], showInlineLabels?: boolean
```

In the `ElectronDataService.saveTimeline` implementation (around line 182), add matching parameters and include them in the save object:
```typescript
, inlineMetadataFields?: string[], showInlineLabels?: boolean
```

And in the object passed to `window.electronAPI.saveTimeline` (line 187), add:
```typescript
, inlineMetadataFields, showInlineLabels
```

**Step 4: Include in the saveTimelineData call in App.tsx**

In `saveTimelineData` (line 2112), append the new refs to the `dataService.saveTimeline(...)` call:

```typescript
, inlineMetadataFieldsRef.current, showInlineLabelsRef.current
```

Also find the font-settings save call (around line 1315) and add the same two refs there.

**Step 5: Update refs when state changes**

Add handlers in App.tsx (near the other metadata handlers around line 2394):

```typescript
  const handleInlineMetadataFieldsChange = (fields: string[]) => {
    setInlineMetadataFields(fields);
    inlineMetadataFieldsRef.current = fields;
    if (projectData) {
      saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  const handleShowInlineLabelsChange = (show: boolean) => {
    setShowInlineLabels(show);
    showInlineLabelsRef.current = show;
    if (projectData) {
      saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };
```

**Step 6: Verify build**

Run: `cd /Users/brian/braidr && npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/services/dataService.ts
git commit -m "feat: wire up inline metadata state, load, and save"
```

---

### Task 3: Add Fields dropdown to POV toolbar

**Files:**
- Modify: `src/renderer/App.tsx:3104-3121` (POV toolbar section)
- Modify: `src/renderer/styles.css` (add dropdown styles)

**Step 1: Add dropdown state**

In App.tsx, add a ref for outside-click handling near the other refs:

```typescript
  const [showFieldsDropdown, setShowFieldsDropdown] = useState(false);
  const fieldsDropdownRef = useRef<HTMLDivElement>(null);
```

Add an outside-click effect (near the other click-outside effects):

```typescript
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fieldsDropdownRef.current && !fieldsDropdownRef.current.contains(e.target as Node)) {
        setShowFieldsDropdown(false);
      }
    };
    if (showFieldsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFieldsDropdown]);
```

**Step 2: Render the Fields button and dropdown**

In the POV toolbar section (after the Sections button, line 3120, before the closing `</>`), add:

```tsx
              <div className="toolbar-dropdown-container" ref={fieldsDropdownRef}>
                <button
                  className={`toolbar-btn ${inlineMetadataFields.length > 0 ? 'active' : ''}`}
                  onClick={() => setShowFieldsDropdown(!showFieldsDropdown)}
                  title="Choose metadata fields to show inline"
                >
                  Fields
                </button>
                {showFieldsDropdown && (
                  <div className="toolbar-fields-dropdown">
                    {metadataFieldDefs.filter(f => f.id !== '_status').length === 0 ? (
                      <div className="toolbar-fields-empty">No metadata fields defined yet</div>
                    ) : (
                      <>
                        {metadataFieldDefs
                          .filter(f => f.id !== '_status')
                          .sort((a, b) => a.order - b.order)
                          .map(field => (
                            <label key={field.id} className="toolbar-fields-item">
                              <input
                                type="checkbox"
                                checked={inlineMetadataFields.includes(field.id)}
                                onChange={() => {
                                  const updated = inlineMetadataFields.includes(field.id)
                                    ? inlineMetadataFields.filter(id => id !== field.id)
                                    : [...inlineMetadataFields, field.id];
                                  handleInlineMetadataFieldsChange(updated);
                                }}
                              />
                              {field.label}
                            </label>
                          ))}
                        <div className="toolbar-fields-divider" />
                        <label className="toolbar-fields-item">
                          <input
                            type="checkbox"
                            checked={showInlineLabels}
                            onChange={() => handleShowInlineLabelsChange(!showInlineLabels)}
                          />
                          Show Labels
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>
```

**Step 3: Add CSS for the dropdown**

In `styles.css`, add after the existing toolbar styles (search for `.toolbar-right` or `.toolbar-btn`):

```css
/* Fields dropdown in POV toolbar */
.toolbar-dropdown-container {
  position: relative;
}

.toolbar-fields-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  padding: 6px 0;
  min-width: 180px;
  z-index: 100;
}

.toolbar-fields-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.1s;
}

.toolbar-fields-item:hover {
  background: var(--bg-tertiary);
}

.toolbar-fields-item input[type="checkbox"] {
  cursor: pointer;
}

.toolbar-fields-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.toolbar-fields-empty {
  padding: 8px 12px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-muted);
  font-style: italic;
}
```

**Step 4: Verify it renders**

Run: `cd /Users/brian/braidr && npm run dev`
Manual check: Open POV view, see "Fields" button in toolbar. Click it. Dropdown appears with metadata fields as checkboxes and "Show Labels" toggle. Toggling a field highlights the "Fields" button.

**Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: add Fields dropdown to POV toolbar"
```

---

### Task 4: Pass inline metadata props through PlotPointSection

**Files:**
- Modify: `src/renderer/components/PlotPointSection.tsx:8-49` (props interface)
- Modify: `src/renderer/components/PlotPointSection.tsx:51` (destructure)
- Modify: `src/renderer/components/PlotPointSection.tsx:396-399` (pass to SceneCard)
- Modify: `src/renderer/App.tsx:3530-3539` (pass to PlotPointSection)
- Modify: `src/renderer/App.tsx:3562-3580` (pass to standalone SceneCards)

**Step 1: Add props to PlotPointSection**

In `PlotPointSection.tsx`, add to the interface (after line 48):

```typescript
  // Inline metadata display
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
```

Add to the destructure on line 51 (inside the parameter list):

```typescript
, inlineMetadataFields, showInlineLabels
```

**Step 2: Pass to SceneCard**

In PlotPointSection.tsx, add to the SceneCard rendering (after `onMetadataFieldDefsChange` prop, around line 399):

```tsx
              inlineMetadataFields={inlineMetadataFields}
              showInlineLabels={showInlineLabels}
```

**Step 3: Pass from App.tsx to PlotPointSection**

In App.tsx, in the PlotPointSection rendering (after `onMetadataFieldDefsChange`, around line 3539), add:

```tsx
                    inlineMetadataFields={inlineMetadataFields}
                    showInlineLabels={showInlineLabels}
```

**Step 4: Pass from App.tsx to standalone SceneCards**

For the standalone SceneCards rendered outside PlotPointSections (scenes without plot points, around line 3562-3580), add:

```tsx
                    inlineMetadataFields={inlineMetadataFields}
                    showInlineLabels={showInlineLabels}
```

Also ensure these standalone SceneCards have the metadata props if they don't already (check: `metadataFieldDefs`, `sceneMetadata`, `onMetadataChange`, `onMetadataFieldDefsChange`). If missing, add them following the same pattern as the PlotPointSection rendering.

**Step 5: Add props to SceneCard interface**

In `src/renderer/components/SceneCard.tsx`, add to the `SceneCardProps` interface (after line 44):

```typescript
  // Inline metadata display
  inlineMetadataFields?: string[];
  showInlineLabels?: boolean;
```

Add to the destructure (around line 79, inside the parameters):

```typescript
  inlineMetadataFields = [],
  showInlineLabels = true,
```

**Step 6: Verify build**

Run: `cd /Users/brian/braidr && npm run build 2>&1 | tail -5`
Expected: Build succeeds (props are passed through but not yet used in rendering)

**Step 7: Commit**

```bash
git add src/renderer/components/PlotPointSection.tsx src/renderer/components/SceneCard.tsx src/renderer/App.tsx
git commit -m "feat: pass inline metadata props through component tree"
```

---

### Task 5: Render inline metadata fields in SceneCard

**Files:**
- Modify: `src/renderer/components/SceneCard.tsx:528-534` (between EditorContent and Properties)
- Modify: `src/renderer/styles.css` (inline field styles)

**Step 1: Add inline metadata rendering**

In `SceneCard.tsx`, between the `<EditorContent>` (line 530) and the metadata Properties section (line 532-534), insert the inline fields block.

Find this existing code:

```tsx
                  <EditorContent editor={editor} className="notes-editor" />

              {/* Metadata Properties Section */}
```

Insert between them:

```tsx
                  {/* Inline Metadata Fields */}
                  {inlineMetadataFields.length > 0 && onMetadataChange && (
                    <div className="inline-metadata-fields">
                      {metadataFieldDefs
                        .filter(f => inlineMetadataFields.includes(f.id))
                        .sort((a, b) => {
                          const aIdx = inlineMetadataFields.indexOf(a.id);
                          const bIdx = inlineMetadataFields.indexOf(b.id);
                          return aIdx - bIdx;
                        })
                        .map(field => {
                          const value = sceneMetadata[field.id];
                          return (
                            <div key={field.id} className="inline-metadata-row">
                              {showInlineLabels && (
                                <span className="inline-metadata-label">{field.label}:</span>
                              )}
                              {field.type === 'text' && (
                                <textarea
                                  className="inline-metadata-text"
                                  value={(value as string) || ''}
                                  onChange={(e) => onMetadataChange(scene.id, field.id, e.target.value)}
                                  placeholder="—"
                                  rows={1}
                                  onInput={(e) => {
                                    const el = e.currentTarget;
                                    el.style.height = 'auto';
                                    el.style.height = el.scrollHeight + 'px';
                                  }}
                                  ref={(el) => {
                                    if (el) {
                                      el.style.height = 'auto';
                                      el.style.height = el.scrollHeight + 'px';
                                    }
                                  }}
                                />
                              )}
                              {field.type === 'dropdown' && (
                                <select
                                  className="inline-metadata-select"
                                  value={(value as string) || ''}
                                  onChange={(e) => onMetadataChange(scene.id, field.id, e.target.value)}
                                >
                                  <option value="">—</option>
                                  {field.options?.map(option => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {field.type === 'multiselect' && (
                                <div className="inline-metadata-chips">
                                  {field.options?.map(option => {
                                    const selected = Array.isArray(value) && value.includes(option);
                                    const color = field.optionColors?.[option];
                                    return (
                                      <button
                                        key={option}
                                        className={`scene-metadata-chip ${selected ? 'selected' : ''}`}
                                        onClick={() => toggleMultiselect(field.id, option)}
                                        style={color ? {
                                          backgroundColor: selected ? color : 'transparent',
                                          borderColor: color,
                                          color: selected ? '#fff' : color,
                                        } : undefined}
                                      >
                                        {option}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
```

**Step 2: Add inline metadata CSS**

In `styles.css`, add after the `.notes-editor` styles (around line 2100):

```css
/* Inline metadata fields (between synopsis and Properties) */
.inline-metadata-fields {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inline-metadata-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  line-height: 1.6;
}

.inline-metadata-label {
  font-size: var(--font-body-size);
  font-family: var(--font-body);
  font-style: italic;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.inline-metadata-text {
  font-size: var(--font-body-size);
  font-family: var(--font-body);
  color: var(--text-primary);
  line-height: 1.6;
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  resize: none;
  overflow: hidden;
  width: 100%;
  transition: background 0.15s;
  border-radius: 3px;
}

.inline-metadata-text:focus {
  background: var(--bg-secondary);
  padding: 2px 4px;
  margin: -2px -4px;
}

.inline-metadata-text::placeholder {
  color: var(--text-muted);
  font-style: italic;
}

.inline-metadata-select {
  font-size: var(--font-body-size);
  font-family: var(--font-body);
  color: var(--text-primary);
  line-height: 1.6;
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.inline-metadata-select:focus {
  background: var(--bg-secondary);
  border-radius: 3px;
  padding: 2px 4px;
  margin: -2px -4px;
}

/* Style the select to look like text until interaction */
.inline-metadata-select option {
  font-size: var(--font-body-size);
  font-family: var(--font-ui);
}

.inline-metadata-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
```

**Step 3: Verify manually**

Run: `cd /Users/brian/braidr && npm run dev`
Manual check:
1. Open POV view with a character that has scenes with metadata
2. Click "Fields" in toolbar, check one or more fields
3. Verify the checked fields appear inline after the synopsis
4. Verify text fields are editable and auto-resize
5. Verify dropdown fields show current value and allow selection
6. Verify multiselect fields show chips
7. Toggle "Show Labels" — labels should appear/disappear
8. Verify Properties section still appears at the bottom and is independently functional

**Step 4: Commit**

```bash
git add src/renderer/components/SceneCard.tsx src/renderer/styles.css
git commit -m "feat: render inline metadata fields in SceneCard"
```

---

### Task 6: Handle edge cases and polish

**Files:**
- Modify: `src/renderer/components/SceneCard.tsx` (edge cases)
- Modify: `src/renderer/styles.css` (polish)

**Step 1: Handle missing metadata gracefully**

If a field is selected in `inlineMetadataFields` but the field definition has been deleted from `metadataFieldDefs`, it should silently skip (the `.filter(f => inlineMetadataFields.includes(f.id))` already handles this).

Verify: Delete a metadata field definition while it's selected for inline display. The field should simply disappear from inline view with no errors.

**Step 2: Handle standalone SceneCards without metadata props**

The standalone SceneCards (scenes without plot points, around App.tsx line 3562) may not have all metadata props. Verify they have `metadataFieldDefs`, `sceneMetadata`, `onMetadataChange`, and `onMetadataFieldDefsChange` props. If any are missing, add them following the same pattern used in PlotPointSection rendering:

```tsx
                    metadataFieldDefs={metadataFieldDefs}
                    sceneMetadata={sceneMetadata[`${scene.characterId}:${scene.sceneNumber}`]}
                    onMetadataChange={(sceneId, fieldId, value) => {
                      const s = projectData.scenes.find(sc => sc.id === sceneId);
                      if (s) {
                        handleMetadataChange(`${s.characterId}:${s.sceneNumber}`, fieldId, value);
                      }
                    }}
                    onMetadataFieldDefsChange={handleMetadataFieldDefsChange}
```

**Step 3: Visual polish — seamless feel**

Check the inline fields visually:
- The gap between synopsis text and inline fields should feel like paragraph spacing, not like a separate section. Adjust `.inline-metadata-fields` `margin-top` if needed (start at 12px, reduce to 8px or 4px based on visual feel).
- Text field focus state should be very subtle — just enough to show it's active.
- When labels are off and only text fields are shown, it should look indistinguishable from more synopsis paragraphs.

**Step 4: Verify full flow**

Manual test:
1. Toggle fields on/off from toolbar — they appear/disappear per scene
2. Edit a text field inline — value saves (check Properties section updates too)
3. Change a dropdown inline — value saves
4. Toggle multiselect chips inline — values save
5. Collapse synopsis — inline fields should collapse too (they're inside the synopsis section)
6. Toggle "Show Labels" — labels appear/disappear
7. Close and reopen the project — inline field selections persist
8. Switch to braided view and back to POV — inline fields still shown

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: polish inline metadata edge cases and styling"
```
