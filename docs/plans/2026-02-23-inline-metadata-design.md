# Inline Metadata Fields — Design

## Problem

In the POV view, metadata lives in a separate "Properties" section below the synopsis with different styling (left border, small labels, form widgets). Writers using metadata heavily (hook, thematic conflict, tone, etc.) want to read it as part of the scene's narrative summary — not buried in a collapsible form.

## Solution

Allow writers to select which metadata fields appear inline directly after the synopsis text, styled identically to the synopsis. Fields are fully editable inline. A toolbar dropdown controls which fields are visible and whether labels are shown.

## Toolbar Controls

New **"Fields"** button in the POV toolbar (next to Notes / Sections). Opens a dropdown with:

- Checkbox per metadata field definition (excluding `_status`, which already renders as a pill)
- "Show Labels" toggle at the bottom, separated by a divider
- Checked fields render inline; unchecked fields do not

## Inline Field Rendering

Located inside `.scene-synopsis-section`, after the TipTap `<EditorContent>` and before the Properties section.

### Text fields
- Auto-resizing `<textarea>` with no border, no background
- Matches synopsis styling: `var(--font-body)`, `var(--font-body-size)`, `line-height: 1.6`, `color: var(--text-primary)`
- On focus: subtle background highlight
- Placeholder: em-dash `—`

### Dropdown fields
- Current value displayed as clickable text (same font/styling as text fields)
- Click opens a small popover/select to pick a new value
- Empty state: em-dash placeholder

### Multiselect fields
- Rendered as chip pills inline (reusing existing chip styling)
- Always visible, toggleable on click

### Labels
- When enabled: italic gray prefix on the same line — `font-style: italic; color: var(--text-muted)`
- Format: "*Hook:* value here"
- When disabled: just the raw value, no label

## State & Persistence

- `inlineMetadataFields: string[]` — array of field IDs to show inline
- `showInlineLabels: boolean` — whether labels are displayed (default: true)
- Stored in `timeline.json` alongside existing settings
- Passed as props: App.tsx → PlotPointSection → SceneCard

## SceneCard Layout (updated)

```
Scene header (number, title, character, tags)
Synopsis (TipTap editor)
Inline metadata fields (selected fields, editable)
Properties section (collapsible, at the end)
```

Fields shown inline also remain in the Properties section — same data, same handlers, dual-rendered.

## Future Extension

Per-field font color so each metadata field can have a unique reading color. Not in this iteration — structure supports it (field-level styling object on MetadataFieldDef).
