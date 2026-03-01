# Drag-and-Drop Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make drag-and-drop in Rails and Braided views reliable, clear, and smooth — with unambiguous insertion indicators, auto-scroll during drag, and no scroll position jumps.

**Architecture:** Replace competing drop detection systems with explicit drop zone divs as the sole source of truth. Add a shared `useAutoScrollOnDrag` hook for both views. Fix scroll position preservation in Rails view scene editor.

**Tech Stack:** React, HTML5 Drag & Drop API, requestAnimationFrame

---

### Task 1: Create `useAutoScrollOnDrag` hook

**Files:**
- Create: `src/renderer/hooks/useAutoScrollOnDrag.ts`

**Step 1: Create the hook file**

```typescript
import { useEffect, useRef } from 'react';

/**
 * Auto-scrolls a container when dragging near its top/bottom edges.
 * @param scrollContainerRef - ref to the scrollable container element
 * @param isDragging - whether a drag operation is currently active
 * @param edgeSize - size of the scroll zone in pixels (default 80)
 */
export function useAutoScrollOnDrag(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  isDragging: boolean,
  edgeSize: number = 80,
) {
  const rafId = useRef<number | null>(null);
  const mouseY = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const handleDragOver = (e: DragEvent) => {
      mouseY.current = e.clientY;
    };

    // Listen on document so we get events even when over drop zones
    document.addEventListener('dragover', handleDragOver);

    const scrollLoop = () => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const y = mouseY.current;

      // How far into the top/bottom edge zone the cursor is
      const distFromTop = y - rect.top;
      const distFromBottom = rect.bottom - y;

      const maxSpeed = 15;
      const minSpeed = 2;

      if (distFromTop < edgeSize && distFromTop >= 0) {
        // Scroll up — faster the closer to the edge
        const ratio = 1 - distFromTop / edgeSize;
        const speed = minSpeed + ratio * (maxSpeed - minSpeed);
        el.scrollTop -= speed;
      } else if (distFromBottom < edgeSize && distFromBottom >= 0) {
        // Scroll down
        const ratio = 1 - distFromBottom / edgeSize;
        const speed = minSpeed + ratio * (maxSpeed - minSpeed);
        el.scrollTop += speed;
      }

      rafId.current = requestAnimationFrame(scrollLoop);
    };

    rafId.current = requestAnimationFrame(scrollLoop);

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [isDragging, scrollContainerRef, edgeSize]);
}
```

**Step 2: Verify the file compiles**

Run: `cd /Users/brian/braidr && npx tsc --noEmit src/renderer/hooks/useAutoScrollOnDrag.ts 2>&1 | head -20`

If there are import issues, the full build check in a later step will catch them.

**Step 3: Commit**

```bash
git add src/renderer/hooks/useAutoScrollOnDrag.ts
git commit -m "feat: add useAutoScrollOnDrag hook for drag-and-drop scrolling"
```

---

### Task 2: Simplify Rails view drop detection — remove competing systems

**Files:**
- Modify: `src/renderer/components/RailsView.tsx`

**Step 1: Remove `findDropIndexFromMouse`, `handleGridDragOver`, `handleGridDrop`**

Delete lines 198-230 (the `findDropIndexFromMouse` function, `handleGridDragOver`, and `handleGridDrop`):

```typescript
// DELETE THIS ENTIRE BLOCK:

  // Determine drop index from mouse position by checking which row the mouse is over.
  // Top half of a row → insert before that row; bottom half → insert after (before next row).
  const findDropIndexFromMouse = (clientY: number): number => {
    if (!gridRef.current) return 0;

    const cards = gridRef.current.querySelectorAll('.rails-scene-card');
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.bottom) {
        const midY = rect.top + rect.height / 2;
        return clientY < midY ? i : i + 1;
      }
    }

    // Below all rows → drop at end
    return scenes.length;
  };

  // Grid-level drag handler: highlights the row the mouse is over
  const handleGridDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(findDropIndexFromMouse(e.clientY));
  };

  // Grid-level drop
  const handleGridDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const index = findDropIndexFromMouse(e.clientY);
    setDraggedSceneId(null);
    onDropOnTimeline(e, index);
    setDropTargetIndex(null);
  };
```

**Step 2: Remove grid-level drag event handlers from the grid div**

Change the `rails-grid` div (currently around line 384-389) from:

```tsx
        <div
          className="rails-grid"
          ref={gridRef}
          onDragOver={draggedSceneId ? handleGridDragOver : undefined}
          onDrop={draggedSceneId ? handleGridDrop : undefined}
        >
```

To:

```tsx
        <div
          className="rails-grid"
          ref={gridRef}
        >
```

**Step 3: Remove `drop-target-row` class from rails-row**

Change the row div (currently around line 486-489) from:

```tsx
                <div
                  key={row.scene.id}
                  className={`rails-row ${isDropRow ? 'drop-target-row' : ''}`}
                  style={{ '--row-height': `${rowHeight}px` } as React.CSSProperties}
                >
```

To:

```tsx
                <div
                  key={row.scene.id}
                  className="rails-row"
                  style={{ '--row-height': `${rowHeight}px` } as React.CSSProperties}
                >
```

Also remove the `isDropRow` variable (around line 483):

```typescript
// DELETE:
              const isDropRow = dropTargetIndex === index;
```

**Step 4: Commit**

```bash
git add src/renderer/components/RailsView.tsx
git commit -m "refactor: remove competing drop detection systems from Rails view"
```

---

### Task 3: Wire up auto-scroll hook in Rails view

**Files:**
- Modify: `src/renderer/components/RailsView.tsx`

**Step 1: Import and call the hook**

Add import at the top of the file:

```typescript
import { useAutoScrollOnDrag } from '../hooks/useAutoScrollOnDrag';
```

Call the hook inside the component, after the existing refs (after line ~86):

```typescript
  useAutoScrollOnDrag(scrollRef, !!draggedSceneId);
```

**Step 2: Commit**

```bash
git add src/renderer/components/RailsView.tsx
git commit -m "feat: add auto-scroll during drag in Rails view"
```

---

### Task 4: Wire up auto-scroll hook in Braided view

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Import the hook**

Add import near the top of App.tsx with other imports:

```typescript
import { useAutoScrollOnDrag } from './hooks/useAutoScrollOnDrag';
```

**Step 2: Call the hook**

Find `const timelineRef = useRef<HTMLDivElement>(null);` (line 183). After this line, or near the other hooks, add:

```typescript
  useAutoScrollOnDrag(timelineRef, !!draggedScene);
```

**Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: add auto-scroll during drag in Braided view"
```

---

### Task 5: Restyle drop zones — clean insertion line

**Files:**
- Modify: `src/renderer/styles.css`

**Step 1: Replace Rails view drop zone styles**

Find the rails drop zone styles (around lines 5413-5458) and replace the entire block:

```css
/* OLD — DELETE from ".rails-drop-zone" through ".rails-row.drop-target-row > .rails-row-number" */
```

Replace with:

```css
/* Rails drop zones — insertion line between rows */
.rails-drop-zone {
  height: 0;
  position: relative;
  transition: height 0.1s ease;
}

/* During drag: expand zones for easier hit targets */
.rails-grid-inner.is-dragging .rails-drop-zone {
  height: 12px;
}

/* Active drop target: show bold insertion line */
.rails-drop-zone.active {
  height: 12px;
}

.rails-drop-zone.active::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 3px;
  background: #22c55e;
  border-radius: 2px;
  z-index: 10;
}

/* Circle marker on the left edge */
.rails-drop-zone.active::after {
  content: '';
  position: absolute;
  left: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  background: #22c55e;
  border-radius: 50%;
  z-index: 11;
}

.rails-drop-zone-end {
  margin-top: 8px;
}

/* Dragging visual feedback */
.rails-scene-card.dragging {
  opacity: 0.4;
  box-shadow: none;
}
```

**Step 2: Update Braided view drop zone styles to match**

Find the braided drop zone styles (around lines 3193-3243) and replace:

```css
/* OLD — DELETE from ".drop-zone" through ".dragging" */
```

Replace with:

```css
.drop-zone {
  height: 0;
  position: relative;
  transition: height 0.1s ease;
}

/* Show drop zones when dragging */
.is-dragging .drop-zone {
  height: 12px;
}

.drop-zone.active {
  height: 12px;
}

.drop-zone.active::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 3px;
  background: #22c55e;
  border-radius: 2px;
  z-index: 10;
}

.drop-zone.active::after {
  content: '';
  position: absolute;
  left: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  background: #22c55e;
  border-radius: 50%;
  z-index: 11;
}

.drop-zone.empty-timeline {
  height: 120px;
  background: var(--bg-tertiary);
  border: 2px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
}

.drop-zone.empty-timeline.active {
  border-color: var(--text-secondary);
}

/* Dragging state */
.dragging {
  opacity: 0.4;
  transform: scale(0.98);
}
```

**Step 3: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat: restyle drop zones with clean insertion line indicator"
```

---

### Task 6: Set clean drag image in Rails view

**Files:**
- Modify: `src/renderer/components/RailsView.tsx`

**Step 1: Improve `wrappedDragStart` to set a custom drag image**

Replace the current `wrappedDragStart` function:

```typescript
  const wrappedDragStart = (e: React.DragEvent, scene: Scene) => {
    setDraggedSceneId(scene.id);
    onDragStart(e, scene);
  };
```

With:

```typescript
  const wrappedDragStart = (e: React.DragEvent, scene: Scene) => {
    setDraggedSceneId(scene.id);

    // Create a clean drag image from the scene card
    const card = (e.target as HTMLElement).closest('.rails-scene-card') as HTMLElement;
    if (card) {
      const clone = card.cloneNode(true) as HTMLElement;
      clone.style.width = `${card.offsetWidth}px`;
      clone.style.opacity = '0.9';
      clone.style.transform = 'scale(0.95)';
      clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      clone.style.position = 'absolute';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, card.offsetWidth / 2, 20);
      // Clean up the clone after drag starts
      requestAnimationFrame(() => document.body.removeChild(clone));
    }

    onDragStart(e, scene);
  };
```

**Step 2: Commit**

```bash
git add src/renderer/components/RailsView.tsx
git commit -m "feat: set clean drag image for rails scene cards"
```

---

### Task 7: Fix scroll jump when opening scene editor in Rails view

**Files:**
- Modify: `src/renderer/components/RailsView.tsx`

**Step 1: Add scroll position preservation**

Add a ref to store saved scroll position (near the other refs, around line 85-86):

```typescript
  const savedScrollTop = useRef<number>(0);
```

Modify `handleSceneClick` (currently around line 155-163) to save scroll position before opening editor:

```typescript
  const handleSceneClick = (scene: Scene, e: React.MouseEvent) => {
    // If in connection mode, complete the connection
    if (isConnecting && connectionSource && connectionSource !== scene.id) {
      onCompleteConnection(scene.id);
      return;
    }

    // Save scroll position before opening editor
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    setFloatingEditorScene(scene);
  };
```

Add a `useLayoutEffect` to restore scroll position when the editor opens (after the existing `useLayoutEffect` around line 153):

```typescript
  // Restore scroll position after floating editor opens/closes
  useLayoutEffect(() => {
    if (floatingEditorScene && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [floatingEditorScene]);
```

Make sure `useLayoutEffect` is imported — check the existing import at line 1:

```typescript
import React, { useState, useRef, useLayoutEffect } from 'react';
```

It's already imported, so no change needed there.

**Step 2: Commit**

```bash
git add src/renderer/components/RailsView.tsx
git commit -m "fix: preserve scroll position when opening scene editor in Rails view"
```

---

### Task 8: Smoke test the full implementation

**Step 1: Run the TypeScript compiler**

Run: `cd /Users/brian/braidr && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -40`

Fix any type errors. Pre-existing errors in the codebase are OK — only fix new errors from our changes.

**Step 2: Run the dev server**

Run: `cd /Users/brian/braidr && npm run dev`

Verify the app starts without errors.

**Step 3: Manual verification checklist**

Test in the running app:
1. **Rails view — drag a scene:** Grab a scene card, drag it. Verify:
   - The source card goes to 40% opacity
   - A clean drag image follows the cursor (not the browser's blurry default)
   - Green insertion lines appear between rows (not row highlighting)
   - The insertion line has a green circle on the left edge
   - Dropping places the scene exactly where the line was shown
2. **Rails view — auto-scroll:** Drag a scene to the bottom edge of the view. Verify the view scrolls down smoothly. Same for the top edge.
3. **Rails view — scene click:** Click a scene to open the floating editor. Verify the scroll position does NOT jump.
4. **Braided view — drag a scene:** Same insertion line behavior as Rails.
5. **Braided view — auto-scroll:** Same auto-scroll behavior as Rails.
6. **Drop accuracy:** Move a scene from position 3 to position 8. Verify it lands at exactly position 8, not 7 or 9.

**Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
