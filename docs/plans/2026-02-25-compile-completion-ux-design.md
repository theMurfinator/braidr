# Compile Completion UX (#127)

## Problem
When export completes, the file silently downloads and the compile modal stays open. No confirmation, no auto-close.

## Design

### Success Flow
1. Export function resolves successfully
2. Modal body crossfades to a success screen
3. Confetti burst (pure CSS) plays behind a centered rocket emoji
4. Text: "Your compile is complete" appears below
5. After ~2.5s, modal auto-closes via `onClose()`

### Error Flow
Replace the current `alert()` for PDF failures with an in-modal error state (red icon + message). Consistent across all formats.

### Animation: CSS Confetti
- ~20-30 small colored `<span>` elements
- Randomized `@keyframes` for position, rotation, opacity
- No external libraries

### Implementation Scope
- `CompileModal.tsx` — add `exportComplete`/`exportError` states, success/error overlay, auto-close timer
- `styles.css` — confetti keyframes, success screen styles
- No new dependencies
