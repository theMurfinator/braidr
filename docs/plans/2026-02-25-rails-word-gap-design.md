# Rails View Word Count Between Scenes (#129)

## Problem
In the rails view, there's no visual indicator of how many words pass between a character's consecutive scenes. Writers need to see pacing at a glance.

## Design
In each character's rail, between two consecutive scenes, show a small word count label on the vertical connector line. This is the sum of `wordCount` from all other characters' scenes in the intervening rows.

### Display
- Small muted text (11-12px, `var(--text-muted)`)
- Centered on the connector line, at the vertical midpoint of the gap
- Format: raw number < 1000 (e.g., `850`), abbreviated >= 1000 (e.g., `1.2k`)
- Hidden when 0 (back-to-back scenes)

### Implementation Scope
- `RailsView.tsx` — compute gap word counts, render labels in connector-through cells
- `styles.css` — label styling
- No new components or dependencies
