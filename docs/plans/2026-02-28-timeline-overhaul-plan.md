# Timeline Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix timeline context bar and next/prev bugs, add semantic zoom, zoom slider, collapsible lanes, and view state persistence.

**Architecture:** The context bar already has edge-drag zoom and click-to-jump — the bug is that `TimelineCanvas` has no incoming `viewport` prop. We add one. The `selectedScene` lookup splits on `:` using the old key format — we fix it to use `scene.id`. Semantic zoom renders 3 detail levels based on effective column width. View state persists in App.tsx state (view switches) and `timeline.json` (sessions).

**Tech Stack:** TypeScript, React, HTML5 Canvas

---

### Task 1: Fix Context Bar → Canvas Communication

The context bar fires `onViewportChange(start, end)` on drag/click, but `TimelineCanvas` has no `viewport` prop — it only **reports** its viewport outward. The canvas stores pan/zoom in internal refs that nothing external can drive.

**Files:**
- Modify: `src/renderer/components/timeline/TimelineCanvas.tsx`
- Modify: `src/renderer/components/timeline/TimelineView.tsx`

**Step 1: Add `viewport` prop to TimelineCanvas**

In `TimelineCanvas.tsx`, add to the `TimelineCanvasProps` interface (line 34-50):

```typescript
  viewport?: { start: number; end: number }; // Incoming viewport from context bar
```

Add it to the destructured props (line 96-112):

```typescript
  viewport,
```

**Step 2: Add useEffect to translate incoming viewport to pan/zoom**

After the `reportViewport` function (around line 210), add:

```typescript
  // ── Drive canvas from external viewport (context bar) ──────────────────────
  const viewportRef = useRef(viewport);
  const isExternalViewportUpdate = useRef(false);

  useEffect(() => {
    if (!viewport || dateRange.length === 0) return;
    // Skip if this is just our own reportViewport echoing back
    const prev = viewportRef.current;
    viewportRef.current = viewport;
    if (prev && Math.abs(prev.start - viewport.start) < 0.001 && Math.abs(prev.end - viewport.end) < 0.001) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const zoom = zoomRef.current;
    const totalW = dateRange.length * colWidthRef.current * zoom;
    if (totalW <= 0) return;

    // Compute new zoom from viewport width
    const vpWidth = viewport.end - viewport.start;
    if (vpWidth > 0 && vpWidth < 1) {
      const newZoom = w / (vpWidth * dateRange.length * colWidthRef.current);
      zoomRef.current = Math.max(0.3, Math.min(3, newZoom));
    }

    // Compute new pan from viewport start
    const newTotalW = dateRange.length * colWidthRef.current * zoomRef.current;
    panRef.current = {
      ...panRef.current,
      x: -(viewport.start * newTotalW) + labelWidthRef.current * zoomRef.current,
    };

    isExternalViewportUpdate.current = true;
    draw();
    // Don't call reportViewport here to avoid feedback loop
  }, [viewport, dateRange.length, draw]);
```

**Step 3: Prevent feedback loop in reportViewport**

Update `reportViewport` to skip reporting when we just received an external update:

```typescript
  const reportViewport = useCallback(() => {
    if (isExternalViewportUpdate.current) {
      isExternalViewportUpdate.current = false;
      return;
    }
    // ... existing code
  }, [dateRange.length]);
```

Note: `isExternalViewportUpdate` ref was added in Step 2.

**Step 4: Wire viewport prop in TimelineView.tsx**

In `TimelineView.tsx`, update the `TimelineCanvas` render (line 552) to pass the viewport:

```typescript
            <TimelineCanvas
              // ... existing props
              viewport={contextBarViewport}
            />
```

**Step 5: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -30`

**Step 6: Commit**

```bash
git add src/renderer/components/timeline/TimelineCanvas.tsx src/renderer/components/timeline/TimelineView.tsx
git commit -m "fix: wire context bar viewport to canvas for bidirectional sync

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Fix Next/Prev Scene and Scene Lookup Bugs

`TimelineView.selectedScene` (line 304-310) splits `selectedSceneKey` on `:` expecting old `characterId:sceneNumber` format. After the migration, keys are `scene.id` UUIDs. Also `getSceneLabel` (line 432-436) has the same bug.

**Files:**
- Modify: `src/renderer/components/timeline/TimelineView.tsx`

**Step 1: Fix `selectedScene` lookup (lines 304-310)**

Replace:
```typescript
  const selectedScene = useMemo(() => {
    if (!selectedSceneKey) return null;
    const [charId, sceneNum] = selectedSceneKey.split(':');
    return scenes.find(
      s => s.characterId === charId && String(s.sceneNumber) === sceneNum
    ) ?? null;
  }, [selectedSceneKey, scenes]);
```

With:
```typescript
  const selectedScene = useMemo(() => {
    if (!selectedSceneKey) return null;
    return scenes.find(s => s.id === selectedSceneKey) ?? null;
  }, [selectedSceneKey, scenes]);
```

**Step 2: Fix `getSceneLabel` (lines 432-436)**

Replace:
```typescript
  function getSceneLabel(sceneKey: string): string {
    const [charId, sceneNum] = sceneKey.split(':');
    const character = characters.find(c => c.id === charId);
    return `${character?.name ?? charId} #${sceneNum}`;
  }
```

With:
```typescript
  function getSceneLabel(sceneKey: string): string {
    const scene = scenes.find(s => s.id === sceneKey);
    if (!scene) return sceneKey;
    const character = characters.find(c => c.id === scene.characterId);
    return `${character?.name ?? '?'} #${scene.sceneNumber}`;
  }
```

**Step 3: Fix linked scene chip color (line 708)**

The linked scene chip gets `charId` by splitting the key on `:`. Replace:
```typescript
                    const [charId] = key.split(':');
                    const color = characterColors[charId] || 'var(--accent)';
```

With:
```typescript
                    const linkedScene = scenes.find(s => s.id === key);
                    const color = linkedScene ? (characterColors[linkedScene.characterId] || 'var(--accent)') : 'var(--accent)';
```

**Step 4: Make next/prev scroll the canvas to the target scene**

Currently `handleNextScene` just calls `setSelectedSceneKey(...)`. After switching, the canvas/grid should scroll to show that scene.

Add a `useEffect` that scrolls to the selected scene when it changes:

```typescript
  // Scroll to selected scene when navigating with prev/next
  useEffect(() => {
    if (!selectedSceneKey || !timelineMainRef.current || subMode !== 'grid') return;
    const date = timelineDates[selectedSceneKey];
    if (!date) return;
    const colIndex = dateRange.indexOf(date);
    if (colIndex < 0) return;
    const scrollX = Math.max(0, colIndex * colWidth - timelineMainRef.current.clientWidth / 3);
    timelineMainRef.current.scrollTo({ left: scrollX, behavior: 'smooth' });
  }, [selectedSceneKey]); // Only deps on selectedSceneKey to fire on navigation
```

For canvas mode, we need to update the pan to center on the selected scene. Add to the same effect:

```typescript
  // For canvas mode: handled by passing viewport — we could expose a scrollToScene method
  // but for now, the context bar + viewport sync handles it
```

Actually, for canvas mode we should compute the date fraction and call `handleContextBarViewportChange` to recenter. Alternatively, just update `panRef` directly on the canvas component. The simplest approach: after `setSelectedSceneKey`, compute the date position and update the contextBarViewport to center on that date.

Update `handleNextScene` and `handlePrevScene` to also center the viewport:

```typescript
  const navigateToScene = useCallback((sceneKey: string) => {
    setSelectedSceneKey(sceneKey);
    const date = timelineDates[sceneKey];
    if (!date || dateRange.length === 0) return;
    const idx = dateRange.indexOf(date);
    if (idx < 0) return;
    const dateFrac = idx / (dateRange.length - 1);
    const vpWidth = contextBarViewport.end - contextBarViewport.start;
    const newStart = Math.max(0, Math.min(1 - vpWidth, dateFrac - vpWidth / 2));
    handleContextBarViewportChange(newStart, newStart + vpWidth);
  }, [timelineDates, dateRange, contextBarViewport, handleContextBarViewportChange]);

  const handlePrevScene = useMemo(() => {
    if (selectedSceneIndex <= 0) return undefined;
    return () => navigateToScene(sortedDatedSceneKeys[selectedSceneIndex - 1]);
  }, [selectedSceneIndex, sortedDatedSceneKeys, navigateToScene]);

  const handleNextScene = useMemo(() => {
    if (selectedSceneIndex < 0 || selectedSceneIndex >= sortedDatedSceneKeys.length - 1) return undefined;
    return () => navigateToScene(sortedDatedSceneKeys[selectedSceneIndex + 1]);
  }, [selectedSceneIndex, sortedDatedSceneKeys, navigateToScene]);
```

**Step 5: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -30`

**Step 6: Commit**

```bash
git add src/renderer/components/timeline/TimelineView.tsx
git commit -m "fix: next/prev scene buttons and scene lookup with scene.id keys

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Semantic Zoom (3 Levels)

Modify `TimelineCanvas.draw()` to render scene cards at 3 detail levels based on effective column width.

**Files:**
- Modify: `src/renderer/components/timeline/TimelineCanvas.tsx`

**Step 1: Add zoom level constants**

After the existing constants (around line 10):

```typescript
// Semantic zoom thresholds based on effective column width (colWidth * zoom)
const ZOOM_LEVEL_DOT = 40;      // Below this: colored dot only
const ZOOM_LEVEL_LABEL = 120;   // Below this: label only; above: full card
```

**Step 2: Update the scene cards section of `draw()` (section 10, starting line 462)**

Replace the scene card rendering section with a version that checks effective column width:

```typescript
    // 10. Scene cards — semantic zoom
    const effectiveColW = colWidthRef.current * zoom;

    for (const scene of scenes) {
      const key = scene.id;
      const r = sceneRect(key);
      if (!r) continue;

      const color = characterColors[scene.characterId] || '#888';
      const isHovered = hover?.type === 'scene' && hover.id === scene.id;
      const isSelected = selSceneId === scene.id;
      const isConnected = hover?.type === 'scene' && hover.id !== scene.id && (
        (connections[hover.id] || []).includes(scene.id) ||
        (connections[scene.id] || []).includes(hover.id)
      );
      const isEventLinked = selEvent != null && worldEvents.some(
        e => e.id === selEvent && e.linkedSceneKeys.includes(key),
      );

      if (effectiveColW < ZOOM_LEVEL_DOT) {
        // ── Dot level: colored circle ──
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const radius = isSelected ? 5 : isHovered ? 4 : 3;
        ctx.fillStyle = color;
        ctx.globalAlpha = isSelected ? 1 : isHovered ? 0.9 : 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (effectiveColW < ZOOM_LEVEL_LABEL) {
        // ── Label level: thin bar with title ──
        const barH = 20;
        const barY = r.y + (r.h - barH) / 2;
        ctx.fillStyle = isSelected ? color + '25' : isHovered ? color + '15' : color + '08';
        ctx.strokeStyle = isSelected ? color : isHovered ? color + '80' : color + '40';
        ctx.lineWidth = isSelected ? 1.5 : 1;
        roundRect(ctx, r.x, barY, r.w, barH, 3);
        ctx.fill();
        ctx.stroke();
        // Left color bar
        ctx.fillStyle = color;
        ctx.fillRect(r.x, barY, 3, barH);
        // Title
        ctx.fillStyle = COLORS.cardText;
        ctx.font = '10px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
        ctx.textAlign = 'left';
        const title = scene.title || `#${scene.sceneNumber}`;
        ctx.fillText(truncateText(ctx, title, r.w - 10), r.x + 8, barY + 13);
      } else {
        // ── Full card level: existing rendering ──
        if (isHovered || isSelected) {
          ctx.shadowColor = color + '40';
          ctx.shadowBlur = 12;
        }
        ctx.fillStyle = isSelected ? color + '15' : isHovered ? color + '10' : COLORS.cardFill;
        ctx.strokeStyle = isEventLinked ? COLORS.worldEventStroke
          : isConnected ? COLORS.connectionHighlight
          : isSelected ? color
          : isHovered ? color + '80'
          : COLORS.cardStroke;
        ctx.lineWidth = isSelected || isEventLinked ? 2 : 1;
        roundRect(ctx, r.x, r.y, r.w, r.h, 6);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        // Left color bar
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, 5, r.h);
        ctx.clip();
        ctx.fillStyle = color;
        roundRect(ctx, r.x, r.y, 10, r.h, 6);
        ctx.fill();
        ctx.restore();
        // Scene number
        ctx.fillStyle = color + '99';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`#${scene.sceneNumber}`, r.x + 10, r.y + 14);
        // Title
        ctx.fillStyle = isHovered || isSelected ? COLORS.cardText : '#555555';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
        const title = scene.title || `Scene ${scene.sceneNumber}`;
        ctx.fillText(truncateText(ctx, title, r.w - 16), r.x + 10, r.y + 32);
        // Connection dot
        const hasConnection = (connections[scene.id] && connections[scene.id].length > 0) ||
          Object.values(connections).some(targets => targets.includes(scene.id));
        if (hasConnection) {
          ctx.fillStyle = COLORS.connectionHighlight;
          ctx.beginPath();
          ctx.arc(r.x + r.w - 8, r.y + 10, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
```

**Step 3: Also scale the day labels and lane labels based on zoom**

At the dot zoom level, hide day labels entirely to avoid clutter. In the day labels section (section 4, around line 349):

```typescript
    // 4. Day labels at top (skip at dot zoom level)
    if (effectiveColW >= ZOOM_LEVEL_DOT) {
      // ... existing day label code
    }
```

Move the `effectiveColW` calculation to before section 3 (before line 333) so it's available for all sections.

**Step 4: Verify it compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | head -30`

**Step 5: Commit**

```bash
git add src/renderer/components/timeline/TimelineCanvas.tsx
git commit -m "feat: add 3-level semantic zoom (dot, label, full card)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add Zoom Slider to Footer

**Files:**
- Modify: `src/renderer/components/timeline/TimelineView.tsx`

**Step 1: Add zoom state to TimelineView**

Add state for canvas zoom (around line 93):

```typescript
  const [canvasZoom, setCanvasZoom] = useState(1);
```

**Step 2: Add zoom slider below the context bar (around line 789)**

After the `TimelineContextBar` render, add a footer with the zoom slider:

```typescript
      {dateRange.length > 0 && (
        <div className="timeline-footer">
          <TimelineContextBar
            // ... existing props
          />
          {subMode === 'canvas' && (
            <div className="timeline-zoom-slider">
              <span className="zoom-label">-</span>
              <input
                type="range"
                min="0.3"
                max="3"
                step="0.1"
                value={canvasZoom}
                onChange={(e) => {
                  const newZoom = parseFloat(e.target.value);
                  setCanvasZoom(newZoom);
                }}
              />
              <span className="zoom-label">+</span>
              <span className="zoom-value">{Math.round(canvasZoom * 100)}%</span>
            </div>
          )}
        </div>
      )}
```

**Step 3: Pass zoom state to TimelineCanvas**

Add `zoom` and `onZoomChange` props to `TimelineCanvas`. When the canvas zooms via scroll wheel, it should call `onZoomChange` to sync the slider. When the slider changes zoom, the canvas should update.

Add to `TimelineCanvasProps`:
```typescript
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
```

In the canvas, add a `useEffect` for incoming zoom, and call `onZoomChange` in the wheel handler.

**Step 4: Wire it in TimelineView**

```typescript
            <TimelineCanvas
              // ... existing props
              viewport={contextBarViewport}
              zoom={canvasZoom}
              onZoomChange={setCanvasZoom}
            />
```

**Step 5: Add CSS for zoom slider**

Add to the timeline CSS file (find `timeline-view` styles):
```css
.timeline-footer {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

.timeline-zoom-slider {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--bg-secondary);
}

.timeline-zoom-slider input[type="range"] {
  flex: 1;
  max-width: 120px;
  height: 4px;
}

.timeline-zoom-slider .zoom-label {
  font-size: 12px;
  color: var(--text-muted);
  user-select: none;
}

.timeline-zoom-slider .zoom-value {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 40px;
}
```

**Step 6: Verify and commit**

```bash
git add src/renderer/components/timeline/TimelineCanvas.tsx src/renderer/components/timeline/TimelineView.tsx src/renderer/styles/
git commit -m "feat: add zoom slider for canvas timeline view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Collapsible Character Lanes

**Files:**
- Modify: `src/renderer/components/timeline/TimelineCanvas.tsx`
- Modify: `src/renderer/components/timeline/TimelineView.tsx`
- Modify: `src/renderer/components/timeline/TimelineGrid.tsx`

**Step 1: Add collapsed lanes state to TimelineView**

```typescript
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());

  const toggleLaneCollapse = useCallback((characterId: string) => {
    setCollapsedLanes(prev => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  }, []);
```

Pass `collapsedLanes` and `onToggleLane` as props to both `TimelineCanvas` and `TimelineGrid`.

**Step 2: Update TimelineCanvas to skip collapsed lanes**

Add to props:
```typescript
  collapsedLanes?: Set<string>;
  onToggleLane?: (characterId: string) => void;
```

In `laneY`, adjust to skip collapsed character lanes (collapsed lanes get a thin 16px row instead of full LANE_HEIGHT):

```typescript
  const laneY = useCallback((charIndex: number): number => {
    let y = TOP_MARGIN + EVENT_HEIGHT + LANE_GAP;
    for (let i = 0; i < charIndex; i++) {
      y += collapsedLanes?.has(characters[i]?.id) ? 16 : LANE_HEIGHT;
    }
    return y;
  }, [characters, collapsedLanes]);
```

In the character lane labels section, render a toggle indicator and make collapsed lanes show just the name in a thin row.

In the scene cards section, skip rendering cards for collapsed lanes.

**Step 3: Add click handler for lane labels**

In the canvas click/mouseUp handler, detect clicks on the lane label area (x < labelWidth) and call `onToggleLane`.

**Step 4: Do the same for TimelineGrid**

Skip rendering scene cells for collapsed character rows. Show a thin collapsed row with just the character name and an expand toggle.

**Step 5: Verify and commit**

```bash
git add src/renderer/components/timeline/
git commit -m "feat: add collapsible character lanes in timeline

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: View State Persistence

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/timeline/TimelineView.tsx`
- Modify: `src/shared/types.ts`

**Step 1: Add `TimelineViewState` type to types.ts**

```typescript
export interface TimelineViewState {
  panX: number;
  panY: number;
  zoom: number;
  selectedSceneKey: string | null;
  subMode: 'canvas' | 'grid';
}
```

Add to `TimelineData`:
```typescript
  viewState?: TimelineViewState;
```

**Step 2: Add view state to App.tsx**

Add state that persists between view switches:

```typescript
  const [timelineViewState, setTimelineViewState] = useState<TimelineViewState | null>(null);
  const timelineViewStateRef = useRef<TimelineViewState | null>(null);
```

Load it from `timeline.json` during project load. Save it back when the view state changes.

Pass `viewState` and `onViewStateChange` props to `TimelineView`.

**Step 3: Update TimelineView to use saved state**

On mount, restore `subMode`, `selectedSceneKey`, and canvas viewport from the saved state.

On unmount or state change, call `onViewStateChange` to persist.

```typescript
  // Restore view state on mount
  useEffect(() => {
    if (viewState) {
      setSubMode(viewState.subMode);
      setSelectedSceneKey(viewState.selectedSceneKey);
      setCanvasZoom(viewState.zoom);
      // Compute viewport from pan to restore canvas position
    }
  }, []); // Only on mount

  // Save view state on changes
  useEffect(() => {
    onViewStateChange?.({
      panX: 0, // Will be updated by canvas
      panY: 0,
      zoom: canvasZoom,
      selectedSceneKey,
      subMode,
    });
  }, [canvasZoom, selectedSceneKey, subMode]);
```

**Step 4: Save view state to disk on project save**

In `saveTimelineData`, include `viewState` in the saved data.

**Step 5: Verify and commit**

```bash
git add src/shared/types.ts src/renderer/App.tsx src/renderer/components/timeline/TimelineView.tsx
git commit -m "feat: persist timeline view state between views and sessions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
