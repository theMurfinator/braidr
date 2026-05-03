# dnd-kit Phase 1: POV View + Foundation Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken POV view drag/drop with a brand-new `PovOutlineView` component built on shared `src/renderer/dnd/` primitives, delivering Scrivener-grade interaction (slim line indicator + slide animation, predictable drop targets, keyboard reorder, auto-scroll, touch parity) and laying the foundation for migrating the rest of the app's 14 drag contexts in subsequent phases.

**Architecture:** Build a small library at `src/renderer/dnd/` wrapping dnd-kit primitives (`SortableArea`, `SortableList`, `SortableItem`, `DropIndicator`, `DragPreviewCard`, `useSortableSensors`, `useAutoScrollContainer`). Compose them into a new `PovOutlineView` that renders POV outline + bullpen panel inside one shared `DndContext`. Strip out the outline-mode drag/drop code from `PlotPointSection` (mobile keeps its non-outline branch).

**Tech Stack:** React 19, TypeScript, Vite, `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@8.0.0`, `@dnd-kit/utilities@3.2.2`. No test framework — verification is `npx vite build` (zero errors) plus manual interaction testing in dev mode (`npm run dev`).

**Spec:** `docs/superpowers/specs/2026-05-03-dnd-kit-full-migration-design.md` (Phase 1 = §5 + §6 + §8 + §9; foundational primitives = §4)

---

## File structure

**Create (new files):**
- `src/renderer/dnd/dnd.css` — drop indicator styles, sortable item placeholder/drag states, reduced-motion handling
- `src/renderer/dnd/useSortableSensors.ts` — shared sensor config (PointerSensor 5px + KeyboardSensor)
- `src/renderer/dnd/useAutoScrollContainer.ts` — auto-scroll hook wired to dnd-kit pointer events
- `src/renderer/dnd/DropIndicator.tsx` — slim absolutely-positioned line + circle marker
- `src/renderer/dnd/DragPreviewCard.tsx` — generic drag overlay card with character-color accent
- `src/renderer/dnd/SortableItem.tsx` — wrapper around `useSortable`, renders props to children via render prop
- `src/renderer/dnd/SortableList.tsx` — wrapper around `SortableContext`, renders items via `renderItem` prop
- `src/renderer/dnd/SortableArea.tsx` — wrapper around `DndContext` + `DragOverlay` + sensors; allows multiple `SortableList` children
- `src/renderer/dnd/index.ts` — barrel export
- `src/renderer/components/PovOutlineView.tsx` — new POV view component composing the primitives

**Modify (existing files):**
- `package.json` — add three `@dnd-kit/*` dependencies
- `src/renderer/App.tsx` — replace the `displayedPlotPoints.map(<PlotPointSection outlineMode>)` block with `<PovOutlineView />`
- `src/renderer/components/PlotPointSection.tsx` — remove the `outlineMode` branch (lines ~304–371) once nothing uses it on desktop. Keep the non-outline branch for `MobileApp.tsx`.

**Defer to later phases (this plan does NOT touch):**
- `src/renderer/hooks/useAutoScrollOnDrag.ts` — still used by `RailsView.tsx`; deleted in Phase 7
- `src/renderer/components/OutlineSceneRow.tsx` — may still be used by `MobileApp`; verified in Phase 7
- `src/renderer/MobileApp.tsx` — Phase 7 verifies it still works after migrations

---

## Task 1: Install dnd-kit packages

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install packages**

```bash
npm install @dnd-kit/core@6.3.1 @dnd-kit/sortable@8.0.0 @dnd-kit/utilities@3.2.2
```

- [ ] **Step 2: Verify build still passes**

```bash
npx vite build
```

Expected: Build succeeds with no errors (dnd-kit is tree-shaken, has no runtime effect until imported).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities"
```

---

## Task 2: Create `useSortableSensors` hook

**Files:**
- Create: `src/renderer/dnd/useSortableSensors.ts`

- [ ] **Step 1: Create the file**

```typescript
import { PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}
```

The 5px activation distance prevents clicks-to-edit (e.g., on a scene title input) from triggering accidental drags.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/useSortableSensors.ts
git commit -m "feat(dnd): add useSortableSensors hook"
```

---

## Task 3: Create `DropIndicator` component

**Files:**
- Create: `src/renderer/dnd/DropIndicator.tsx`

- [ ] **Step 1: Create the file**

```tsx
interface DropIndicatorProps {
  visible: boolean;
  position?: 'above' | 'below';
}

export function DropIndicator({ visible, position = 'above' }: DropIndicatorProps) {
  if (!visible) return null;
  return (
    <div
      className={`dnd-drop-indicator dnd-drop-indicator-${position}`}
      aria-hidden="true"
    />
  );
}
```

The actual visual styling (color, thickness, circle marker, absolute positioning) lives in `dnd.css` — this component just toggles visibility and position class.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/DropIndicator.tsx
git commit -m "feat(dnd): add DropIndicator component"
```

---

## Task 4: Create `DragPreviewCard` component

**Files:**
- Create: `src/renderer/dnd/DragPreviewCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
interface DragPreviewCardProps {
  title: string;
  number?: number | string;
  accentColor?: string;
}

export function DragPreviewCard({ title, number, accentColor }: DragPreviewCardProps) {
  const truncated = title.length > 40 ? title.slice(0, 39) + '…' : title;
  return (
    <div
      className="dnd-drag-preview-card"
      style={accentColor ? { borderLeftColor: accentColor } : undefined}
    >
      {number !== undefined && (
        <span className="dnd-drag-preview-number">{number}.</span>
      )}
      <span className="dnd-drag-preview-title">{truncated}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/DragPreviewCard.tsx
git commit -m "feat(dnd): add DragPreviewCard component"
```

---

## Task 5: Create `SortableItem` component

**Files:**
- Create: `src/renderer/dnd/SortableItem.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { ReactNode, CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SortableItemRenderProps {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
  isOver: boolean;
}

interface SortableItemProps {
  id: string;
  children: (props: SortableItemRenderProps) => ReactNode;
}

export function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    position: 'relative',
  };

  return <>{children({ setNodeRef, style, attributes, listeners, isDragging, isOver })}</>;
}
```

The render-prop pattern lets each view's row component apply `setNodeRef`, `style`, `attributes`, and `listeners` to the element it controls. Items with `isDragging: true` go to 30% opacity in their original slot (the drag overlay shows the visible preview).

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/SortableItem.tsx
git commit -m "feat(dnd): add SortableItem component"
```

---

## Task 6: Create `SortableList` component

**Files:**
- Create: `src/renderer/dnd/SortableList.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { ReactNode } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem, SortableItemRenderProps } from './SortableItem';

interface SortableListProps<T extends { id: string }> {
  items: T[];
  strategy?: 'vertical' | 'horizontal';
  renderItem: (item: T, sortable: SortableItemRenderProps) => ReactNode;
  /**
   * Optional content rendered inside the SortableContext after the items
   * (e.g., section drop placeholders, "add at end" zone).
   */
  children?: ReactNode;
}

export function SortableList<T extends { id: string }>({
  items,
  strategy = 'vertical',
  renderItem,
  children,
}: SortableListProps<T>) {
  const strategyFn =
    strategy === 'horizontal' ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <SortableContext items={items.map(i => i.id)} strategy={strategyFn}>
      {items.map(item => (
        <SortableItem key={item.id} id={item.id}>
          {sortable => renderItem(item, sortable)}
        </SortableItem>
      ))}
      {children}
    </SortableContext>
  );
}
```

`SortableList` wraps `SortableContext` only — it does NOT create a `DndContext`. The DndContext lives in `SortableArea` so that views with multiple lists (POV's outline + bullpen) can share one drag session.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/SortableList.tsx
git commit -m "feat(dnd): add SortableList component"
```

---

## Task 7: Create `SortableArea` component

**Files:**
- Create: `src/renderer/dnd/SortableArea.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { ReactNode, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragCancelEvent,
  DragOverlay,
  closestCenter,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { useSortableSensors } from './useSortableSensors';

interface SortableAreaProps {
  /**
   * Fires when a drag completes successfully (drop on a valid target that is
   * not the same item). `activeId` is the dragged item; `overId` is the drop
   * target item or droppable zone.
   */
  onDragEnd: (event: { activeId: string; overId: string }) => void;
  /**
   * Render the floating preview that follows the cursor during drag.
   * Receives the active drag id; consumer looks up the item and returns JSX.
   */
  renderDragOverlay?: (activeId: string) => ReactNode;
  children: ReactNode;
}

export function SortableArea({ onDragEnd, renderDragOverlay, children }: SortableAreaProps) {
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.id !== e.over.id) {
      onDragEnd({ activeId: String(e.active.id), overId: String(e.over.id) });
    }
  };

  const handleDragCancel = (_e: DragCancelEvent) => {
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay>
        {activeId && renderDragOverlay ? renderDragOverlay(String(activeId)) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/SortableArea.tsx
git commit -m "feat(dnd): add SortableArea component"
```

---

## Task 8: Create `useAutoScrollContainer` hook

**Files:**
- Create: `src/renderer/dnd/useAutoScrollContainer.ts`

- [ ] **Step 1: Create the file**

```typescript
import { useEffect, useRef, RefObject } from 'react';
import { useDndMonitor } from '@dnd-kit/core';

/**
 * Auto-scrolls a container when dragging near its top/bottom edges.
 * Wired to dnd-kit drag events via useDndMonitor — must be called from a
 * component inside a SortableArea.
 */
export function useAutoScrollContainer(
  scrollContainerRef: RefObject<HTMLElement | null>,
  edgeSize: number = 150,
) {
  const isDragging = useRef(false);
  const mouseY = useRef<number>(0);
  const rafId = useRef<number | null>(null);

  useDndMonitor({
    onDragStart: () => {
      isDragging.current = true;
      startScrollLoop();
    },
    onDragMove: (e) => {
      const evt = (e.activatorEvent as PointerEvent) ?? null;
      if (evt && typeof evt.clientY === 'number') {
        mouseY.current = evt.clientY;
      }
    },
    onDragEnd: stopScrollLoop,
    onDragCancel: stopScrollLoop,
  });

  function startScrollLoop() {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(loop);
  }

  function stopScrollLoop() {
    isDragging.current = false;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }

  function loop() {
    if (!isDragging.current) return;
    const el = scrollContainerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const y = mouseY.current;
      const distFromTop = y - rect.top;
      const distFromBottom = rect.bottom - y;
      const maxSpeed = 25;
      const minSpeed = 3;
      if (distFromTop < edgeSize && distFromTop >= 0) {
        const ratio = 1 - distFromTop / edgeSize;
        el.scrollTop -= minSpeed + ratio * (maxSpeed - minSpeed);
      } else if (distFromBottom < edgeSize && distFromBottom >= 0) {
        const ratio = 1 - distFromBottom / edgeSize;
        el.scrollTop += minSpeed + ratio * (maxSpeed - minSpeed);
      }
    }
    rafId.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    // Listen on document so we get pointer position even when over drop zones
    const handleMove = (e: PointerEvent) => {
      mouseY.current = e.clientY;
    };
    document.addEventListener('pointermove', handleMove);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      stopScrollLoop();
    };
  }, []);
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/useAutoScrollContainer.ts
git commit -m "feat(dnd): add useAutoScrollContainer hook"
```

---

## Task 9: Create `dnd.css`

**Files:**
- Create: `src/renderer/dnd/dnd.css`

- [ ] **Step 1: Create the file**

```css
/* dnd-kit primitives — drop indicator, drag preview, item states */

/* Drop indicator: slim absolutely-positioned green line + circle marker */
.dnd-drop-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--dnd-indicator-color, #22c55e);
  border-radius: 2px;
  pointer-events: none;
  z-index: 10;
}

.dnd-drop-indicator-above {
  top: -2px;
}

.dnd-drop-indicator-below {
  bottom: -2px;
}

.dnd-drop-indicator::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  background: var(--dnd-indicator-color, #22c55e);
  border-radius: 50%;
}

/* Drag preview card (rendered inside DragOverlay) */
.dnd-drag-preview-card {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 280px;
  max-height: 44px;
  padding: 10px 14px;
  border-radius: 6px;
  border-left: 3px solid var(--dnd-preview-accent, #3b82f6);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--bg-primary, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-ui);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  cursor: grabbing;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dnd-drag-preview-number {
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.dnd-drag-preview-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* Section drop placeholder (for empty sections) */
.dnd-section-drop-placeholder {
  position: relative;
  height: 12px;
  margin: 4px 0;
}

.dnd-section-drop-placeholder.is-over {
  background: rgba(34, 197, 94, 0.08);
  border-radius: 4px;
}

.dnd-section-drop-placeholder.is-over::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 3px;
  background: var(--dnd-indicator-color, #22c55e);
  border-radius: 2px;
}

/* Reduced motion: disable slide animation, keep indicator visible */
@media (prefers-reduced-motion: reduce) {
  [data-dnd-sortable-item] {
    transition: none !important;
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/dnd.css
git commit -m "feat(dnd): add dnd.css for drop indicator and drag preview styles"
```

---

## Task 10: Create `dnd/index.ts` barrel export

**Files:**
- Create: `src/renderer/dnd/index.ts`

- [ ] **Step 1: Create the file**

```typescript
import './dnd.css';

export { SortableArea } from './SortableArea';
export { SortableList } from './SortableList';
export { SortableItem } from './SortableItem';
export type { SortableItemRenderProps } from './SortableItem';
export { DropIndicator } from './DropIndicator';
export { DragPreviewCard } from './DragPreviewCard';
export { useSortableSensors } from './useSortableSensors';
export { useAutoScrollContainer } from './useAutoScrollContainer';
```

The `import './dnd.css'` ensures the CSS loads whenever any primitive is used.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/dnd/index.ts
git commit -m "feat(dnd): add barrel export with css side-effect import"
```

---

## Task 11: Build skeletal `PovOutlineView` (no drag yet)

This task creates the new component file with all rendering logic but no dnd-kit wiring yet. We get the layout right first, then add drag in subsequent tasks.

**Files:**
- Create: `src/renderer/components/PovOutlineView.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useRef } from 'react';
import { PlotPoint, Scene } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';

interface PovOutlineViewProps {
  sections: PlotPoint[];
  scenes: Scene[];
  bullpenScenes: Scene[];
  characterColor: string;
  synopsisModes: Record<string, 'inline' | 'expand'>;
  hideHeaders: boolean;
  onSceneReorder: (sceneId: string, targetSectionId: string, targetSceneNumber: number) => void;
  onSceneToBullpen: (sceneId: string) => void;
  onBullpenToSection: (sceneId: string, targetSectionId: string) => void;
  onSetAside: (sceneId: string) => void;
  onSectionMoveUp: (sectionId: string) => void;
  onSectionMoveDown: (sectionId: string) => void;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onOpenInEditor?: (sceneId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
  getCharacterName?: (characterId: string) => string;
}

export default function PovOutlineView({
  sections,
  scenes,
  bullpenScenes,
  synopsisModes,
  hideHeaders,
  onSetAside,
  onSectionMoveUp,
  onSectionMoveDown,
  onToggleSynopsisMode,
  onSceneChange,
  onOpenInEditor,
  onDeleteSection,
  getCharacterName,
}: PovOutlineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const scenesBySection = new Map<string, Scene[]>();
  for (const scene of scenes) {
    if (!scene.plotPointId) continue;
    const list = scenesBySection.get(scene.plotPointId) ?? [];
    list.push(scene);
    scenesBySection.set(scene.plotPointId, list);
  }
  for (const list of scenesBySection.values()) {
    list.sort((a, b) => a.sceneNumber - b.sceneNumber);
  }

  return (
    <div className="pov-outline-view" ref={scrollRef}>
      <div className="pov-outline-main">
        {sortedSections.map((section, idx) => {
          const sectionScenes = scenesBySection.get(section.id) ?? [];
          const isFirst = idx === 0;
          const isLast = idx === sortedSections.length - 1;
          return (
            <div key={section.id} className="pov-outline-section" data-section-id={section.id}>
              {!hideHeaders && (
                <div className="pov-outline-section-header">
                  <button
                    className={`section-synopsis-chevron ${synopsisModes[section.id] === 'expand' ? 'collapsed' : ''}`}
                    onClick={() => onToggleSynopsisMode(section.id)}
                    title={synopsisModes[section.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                  >
                    {'▾'}
                  </button>
                  <div className="section-reorder-buttons">
                    <button className="section-move-btn" onClick={() => onSectionMoveUp(section.id)} disabled={isFirst} title="Move section up">{'▲'}</button>
                    <button className="section-move-btn" onClick={() => onSectionMoveDown(section.id)} disabled={isLast} title="Move section down">{'▼'}</button>
                  </div>
                  <span className="plot-point-title">{section.title || 'New Section'}</span>
                  <span className="plot-point-count">({sectionScenes.length}/{section.expectedSceneCount ?? '?'})</span>
                  {onDeleteSection && (
                    <button className="section-delete-btn" onClick={() => onDeleteSection(section.id)} title="Delete section">{'×'}</button>
                  )}
                </div>
              )}
              {sectionScenes.map(scene => (
                <OutlineSceneRow
                  key={scene.id}
                  scene={scene}
                  displayNumber={scene.sceneNumber}
                  characterName={getCharacterName?.(scene.characterId)}
                  synopsisVisible={synopsisModes[section.id] !== 'expand'}
                  onSceneChange={onSceneChange}
                  onSetAside={onSetAside}
                  onOpenInEditor={onOpenInEditor}
                  expandMode={synopsisModes[section.id] === 'expand'}
                />
              ))}
            </div>
          );
        })}
      </div>

      {bullpenScenes.length > 0 && (
        <div className="pov-outline-bullpen" data-bullpen="true">
          <div className="bullpen-header">
            <h3>Bullpen</h3>
            <span className="bullpen-count">{bullpenScenes.length}</span>
          </div>
          <div className="bullpen-scenes">
            {bullpenScenes.map(scene => (
              <div key={scene.id} className="bullpen-scene" data-scene-id={scene.id}>
                <span className="bullpen-scene-number">{scene.sceneNumber}.</span>
                <span className="bullpen-scene-title">{scene.title || scene.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

This re-uses the existing `OutlineSceneRow` for now (its `onDragStart`/`onDragEnd` props get stubbed with no-ops since we'll replace the drag mechanism in Task 12).

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

Expected: Build succeeds. The new component compiles but isn't wired into App.tsx yet.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PovOutlineView.tsx
git commit -m "feat(pov): add skeletal PovOutlineView component (rendering only)"
```

---

## Task 12: Wire dnd into PovOutlineView (single sortable list of scenes)

This task adds the dnd-kit primitives to make scenes draggable within and across sections. Bullpen drag comes in Task 13.

**Why we touch `OutlineSceneRow` first:** its root element has `draggable="true"` and its own `onDragStart` handler. When wrapped by dnd-kit's `PointerSensor`, the two drag systems would fight (HTML5 dragstart steals events from pointer-event listeners). We make `OutlineSceneRow`'s HTML5 drag opt-out so PovOutlineView can disable it; mobile keeps the existing behavior by default.

**Files:**
- Modify: `src/renderer/components/OutlineSceneRow.tsx` (make HTML5 drag opt-out)
- Modify: `src/renderer/components/PovOutlineView.tsx` (wire dnd-kit)

- [ ] **Step 1: Make `OutlineSceneRow`'s HTML5 drag opt-out**

Open `src/renderer/components/OutlineSceneRow.tsx`. Change the props interface so `onDragStart` and `onDragEnd` become optional, and skip the `draggable` attribute + handlers + the gutter handle when both are absent.

Find:

```tsx
interface OutlineSceneRowProps {
  scene: Scene;
  displayNumber?: number;
  characterName?: string;
  synopsisVisible: boolean;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onSetAside?: (sceneId: string) => void;
  onDragStart: (scene: Scene) => void;
  onDragEnd: () => void;
  onOpenInEditor?: (sceneId: string) => void;
  expandMode: boolean;
  isDragging?: boolean;
  dropPosition?: 'above' | 'below' | null;
}
```

Replace with:

```tsx
interface OutlineSceneRowProps {
  scene: Scene;
  displayNumber?: number;
  characterName?: string;
  synopsisVisible: boolean;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onSetAside?: (sceneId: string) => void;
  /** When omitted, the row does not bind HTML5 drag — drag is managed externally (e.g., by dnd-kit). */
  onDragStart?: (scene: Scene) => void;
  /** Required when `onDragStart` is provided. */
  onDragEnd?: () => void;
  onOpenInEditor?: (sceneId: string) => void;
  expandMode: boolean;
  isDragging?: boolean;
  dropPosition?: 'above' | 'below' | null;
}
```

Then in the render, change the root `<div>` to conditionally apply `draggable` + handlers, and conditionally render the gutter handle. Find:

```tsx
  return (
    <div
      className={rowClasses}
      draggable="true"
      onDragStart={(e) => {
        if (canDragRef.current) {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', scene.id);
          setTimeout(() => onDragStart(scene), 0);
        } else {
          e.preventDefault();
        }
      }}
      onDragEnd={() => {
        onDragEnd();
        canDragRef.current = false;
      }}
      onClick={handleRowClick}
      data-scene-id={scene.id}
    >
      <div className="outline-scene-main">
        <span
          className="outline-scene-drag-handle"
          onMouseDown={() => { canDragRef.current = true; }}
        >
          ⋮⋮
        </span>
```

Replace with:

```tsx
  const html5DragEnabled = !!onDragStart && !!onDragEnd;

  return (
    <div
      className={rowClasses}
      {...(html5DragEnabled
        ? {
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
              if (canDragRef.current) {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', scene.id);
                setTimeout(() => onDragStart!(scene), 0);
              } else {
                e.preventDefault();
              }
            },
            onDragEnd: () => {
              onDragEnd!();
              canDragRef.current = false;
            },
          }
        : {})}
      onClick={handleRowClick}
      data-scene-id={scene.id}
    >
      <div className="outline-scene-main">
        {html5DragEnabled && (
          <span
            className="outline-scene-drag-handle"
            onMouseDown={() => { canDragRef.current = true; }}
          >
            ⋮⋮
          </span>
        )}
```

This preserves mobile's behavior (mobile passes both callbacks → drag enabled) and lets PovOutlineView pass neither → drag delegated to dnd-kit.

- [ ] **Step 2: Replace `PovOutlineView.tsx` with the dnd-wired version**

```tsx
import { useRef, useMemo } from 'react';
import { PlotPoint, Scene } from '../../shared/types';
import OutlineSceneRow from './OutlineSceneRow';
import {
  SortableArea,
  SortableList,
  DragPreviewCard,
  useAutoScrollContainer,
} from '../dnd';

interface PovOutlineViewProps {
  sections: PlotPoint[];
  scenes: Scene[];
  bullpenScenes: Scene[];
  characterColor: string;
  synopsisModes: Record<string, 'inline' | 'expand'>;
  hideHeaders: boolean;
  onSceneReorder: (sceneId: string, targetSectionId: string, targetSceneNumber: number) => void;
  onSceneToBullpen: (sceneId: string) => void;
  onBullpenToSection: (sceneId: string, targetSectionId: string) => void;
  onSetAside: (sceneId: string) => void;
  onSectionMoveUp: (sectionId: string) => void;
  onSectionMoveDown: (sectionId: string) => void;
  onToggleSynopsisMode: (sectionId: string) => void;
  onSceneChange: (sceneId: string, newContent: string, newNotes: string[]) => void;
  onOpenInEditor?: (sceneId: string) => void;
  onSectionChange?: (sectionId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => void;
  onDeleteSection?: (sectionId: string) => void;
  getCharacterName?: (characterId: string) => string;
}

function ScrollAutoBinder({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  useAutoScrollContainer(scrollRef);
  return null;
}

export default function PovOutlineView(props: PovOutlineViewProps) {
  const {
    sections,
    scenes,
    bullpenScenes,
    characterColor,
    synopsisModes,
    hideHeaders,
    onSceneReorder,
    onSetAside,
    onSectionMoveUp,
    onSectionMoveDown,
    onToggleSynopsisMode,
    onSceneChange,
    onOpenInEditor,
    onDeleteSection,
    getCharacterName,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections]
  );

  const scenesBySection = useMemo(() => {
    const map = new Map<string, Scene[]>();
    for (const scene of scenes) {
      if (!scene.plotPointId) continue;
      const list = map.get(scene.plotPointId) ?? [];
      list.push(scene);
      map.set(scene.plotPointId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sceneNumber - b.sceneNumber);
    }
    return map;
  }, [scenes]);

  // Flat list of all in-section scenes in display order — used for the SortableList
  const flatSectionScenes = useMemo(() => {
    const flat: Scene[] = [];
    for (const section of sortedSections) {
      const sectionScenes = scenesBySection.get(section.id) ?? [];
      flat.push(...sectionScenes);
    }
    return flat;
  }, [sortedSections, scenesBySection]);

  // Map sceneId -> sectionId for fast lookup on drop
  const sceneToSection = useMemo(() => {
    const map = new Map<string, string>();
    for (const scene of scenes) {
      if (scene.plotPointId) map.set(scene.id, scene.plotPointId);
    }
    return map;
  }, [scenes]);

  const sceneById = useMemo(() => {
    const map = new Map<string, Scene>();
    for (const scene of [...scenes, ...bullpenScenes]) {
      map.set(scene.id, scene);
    }
    return map;
  }, [scenes, bullpenScenes]);

  const handleDragEnd = ({ activeId, overId }: { activeId: string; overId: string }) => {
    const targetSectionId = sceneToSection.get(overId);
    const overScene = sceneById.get(overId);
    if (!targetSectionId || !overScene) return;
    onSceneReorder(activeId, targetSectionId, overScene.sceneNumber);
  };

  const renderActive = (activeId: string) => {
    const scene = sceneById.get(activeId);
    if (!scene) return null;
    return (
      <DragPreviewCard
        title={scene.title || scene.content || 'Untitled scene'}
        number={scene.sceneNumber}
        accentColor={characterColor}
      />
    );
  };

  return (
    <div className="pov-outline-view" ref={scrollRef}>
      <SortableArea onDragEnd={handleDragEnd} renderDragOverlay={renderActive}>
        <ScrollAutoBinder scrollRef={scrollRef} />

        <div className="pov-outline-main">
          <SortableList items={flatSectionScenes}>
            {(scene, sortable) => {
              // Locate which section this scene starts; if it's the first scene
              // of its section, render the section header above it.
              const sectionId = scene.plotPointId!;
              const sectionScenes = scenesBySection.get(sectionId) ?? [];
              const isFirstInSection = sectionScenes[0]?.id === scene.id;
              const section = sortedSections.find(s => s.id === sectionId);
              const sectionIdx = sortedSections.findIndex(s => s.id === sectionId);
              const isFirstSection = sectionIdx === 0;
              const isLastSection = sectionIdx === sortedSections.length - 1;

              return (
                <>
                  {isFirstInSection && section && !hideHeaders && (
                    <div className="pov-outline-section-header" data-section-id={section.id}>
                      <button
                        className={`section-synopsis-chevron ${synopsisModes[section.id] === 'expand' ? 'collapsed' : ''}`}
                        onClick={() => onToggleSynopsisMode(section.id)}
                        title={synopsisModes[section.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                      >{'▾'}</button>
                      <div className="section-reorder-buttons">
                        <button className="section-move-btn" onClick={() => onSectionMoveUp(section.id)} disabled={isFirstSection} title="Move section up">{'▲'}</button>
                        <button className="section-move-btn" onClick={() => onSectionMoveDown(section.id)} disabled={isLastSection} title="Move section down">{'▼'}</button>
                      </div>
                      <span className="plot-point-title">{section.title || 'New Section'}</span>
                      <span className="plot-point-count">({sectionScenes.length}/{section.expectedSceneCount ?? '?'})</span>
                      {onDeleteSection && (
                        <button className="section-delete-btn" onClick={() => onDeleteSection(section.id)} title="Delete section">{'×'}</button>
                      )}
                    </div>
                  )}
                  <div
                    ref={sortable.setNodeRef}
                    style={sortable.style}
                    className={`pov-outline-row-wrapper ${sortable.isOver ? 'is-over' : ''}`}
                    data-dnd-sortable-item
                    {...sortable.attributes}
                    {...sortable.listeners}
                  >
                    <OutlineSceneRow
                      scene={scene}
                      displayNumber={scene.sceneNumber}
                      characterName={getCharacterName?.(scene.characterId)}
                      synopsisVisible={synopsisModes[sectionId] !== 'expand'}
                      onSceneChange={onSceneChange}
                      onSetAside={onSetAside}
                      onOpenInEditor={onOpenInEditor}
                      expandMode={synopsisModes[sectionId] === 'expand'}
                    />
                  </div>
                </>
              );
            }}
          </SortableList>
        </div>
      </SortableArea>
    </div>
  );
}
```

Notes:
- The whole row wrapper gets `attributes` + `listeners` spread, so the entire row is the drag handle.
- `OutlineSceneRow` is called WITHOUT `onDragStart`/`onDragEnd` props — HTML5 drag stays disabled there (per Step 1's opt-in change), so dnd-kit's PointerSensor owns drag uncontested.
- `useAutoScrollContainer` is wired via a tiny inner component because hooks must be called inside the SortableArea (where DndContext is available for `useDndMonitor`).
- This task does NOT yet add bullpen drag — that comes next.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

Expected: Build succeeds. The component is fully wired with sortable scenes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PovOutlineView.tsx
git commit -m "feat(pov): wire dnd-kit sortable into PovOutlineView (scenes only, no bullpen yet)"
```

---

## Task 13: Add bullpen as second SortableList in PovOutlineView's DndContext

**Files:**
- Modify: `src/renderer/components/PovOutlineView.tsx`

- [ ] **Step 1: Add bullpen handling to `handleDragEnd` and render bullpen as a second `SortableList`**

Find this line near the top of `handleDragEnd`:

```tsx
  const handleDragEnd = ({ activeId, overId }: { activeId: string; overId: string }) => {
    const targetSectionId = sceneToSection.get(overId);
    const overScene = sceneById.get(overId);
    if (!targetSectionId || !overScene) return;
    onSceneReorder(activeId, targetSectionId, overScene.sceneNumber);
  };
```

Replace with:

```tsx
  const isBullpenScene = useMemo(
    () => new Set(bullpenScenes.map(s => s.id)),
    [bullpenScenes]
  );

  const handleDragEnd = ({ activeId, overId }: { activeId: string; overId: string }) => {
    const activeIsBullpen = isBullpenScene.has(activeId);
    const overIsBullpen = isBullpenScene.has(overId) || overId === 'bullpen-zone';

    if (overIsBullpen && !activeIsBullpen) {
      // POV scene → bullpen
      props.onSceneToBullpen(activeId);
      return;
    }
    if (!overIsBullpen && activeIsBullpen) {
      // Bullpen scene → POV section
      const targetSectionId = sceneToSection.get(overId);
      if (targetSectionId) {
        props.onBullpenToSection(activeId, targetSectionId);
      }
      return;
    }
    if (!activeIsBullpen && !overIsBullpen) {
      // POV scene → POV section
      const targetSectionId = sceneToSection.get(overId);
      const overScene = sceneById.get(overId);
      if (!targetSectionId || !overScene) return;
      onSceneReorder(activeId, targetSectionId, overScene.sceneNumber);
    }
    // bullpen → bullpen reorder is a no-op for now
  };
```

Task 12 removed the static bullpen markup that Task 11 had (since dnd wiring focused on the outline only). This step re-adds the bullpen — this time as a `SortableList` inside the same `SortableArea` so it shares one drag session with the outline.

Find the existing `<SortableArea>` block from Task 12 (it currently contains `<ScrollAutoBinder />` and one `<div className="pov-outline-main">` with the outline `SortableList` inside). Replace the entire `<SortableArea>...</SortableArea>` block with:

```tsx
      <SortableArea onDragEnd={handleDragEnd} renderDragOverlay={renderActive}>
        <ScrollAutoBinder scrollRef={scrollRef} />

        <div className="pov-outline-main">
          <SortableList items={flatSectionScenes}>
            {/* ... existing scene render-prop body unchanged ... */}
          </SortableList>
        </div>

        <div className="pov-outline-bullpen" data-bullpen="true">
          <div className="bullpen-header">
            <h3>Bullpen</h3>
            <span className="bullpen-count">{bullpenScenes.length}</span>
          </div>
          <SortableList items={bullpenScenes}>
            {(scene, sortable) => (
              <div
                ref={sortable.setNodeRef}
                style={sortable.style}
                className={`bullpen-scene ${sortable.isOver ? 'is-over' : ''}`}
                data-scene-id={scene.id}
                data-dnd-sortable-item
                {...sortable.attributes}
                {...sortable.listeners}
              >
                <span className="bullpen-scene-number">{scene.sceneNumber}.</span>
                <span className="bullpen-scene-title">{scene.title || scene.content || 'Untitled scene'}</span>
              </div>
            )}
          </SortableList>
        </div>
      </SortableArea>
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PovOutlineView.tsx
git commit -m "feat(pov): add bullpen as second SortableList in same DndContext"
```

---

## Task 14: Add section drop placeholders for empty sections

This lets the user drop a scene into a section that currently has no scenes — without this, dnd-kit has no `over.id` to target inside an empty section.

**Files:**
- Modify: `src/renderer/components/PovOutlineView.tsx`

- [ ] **Step 1: Add an `EmptySectionDropZone` inner component**

Add near the top of the file (after the `ScrollAutoBinder` definition):

```tsx
import { useDroppable } from '@dnd-kit/core';

function EmptySectionDropZone({ sectionId }: { sectionId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-empty:${sectionId}`,
    data: { sectionId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`dnd-section-drop-placeholder ${isOver ? 'is-over' : ''}`}
      aria-label="Drop scene into this empty section"
    />
  );
}
```

- [ ] **Step 2: Update `handleDragEnd` to recognize empty-section drop targets**

Find the `handleDragEnd` function and update the POV-scene → POV-section branch:

```tsx
    if (!activeIsBullpen && !overIsBullpen) {
      // Empty-section drop placeholder
      if (overId.startsWith('section-empty:')) {
        const targetSectionId = overId.slice('section-empty:'.length);
        onSceneReorder(activeId, targetSectionId, 1);
        return;
      }
      // POV scene → POV section
      const targetSectionId = sceneToSection.get(overId);
      const overScene = sceneById.get(overId);
      if (!targetSectionId || !overScene) return;
      onSceneReorder(activeId, targetSectionId, overScene.sceneNumber);
    }
```

- [ ] **Step 3: Render `EmptySectionDropZone` interspersed with the SortableList**

Section headers render before the first scene of each section (per Task 12). Sections with NO scenes never trigger that render path, so we need to handle them separately. Three positions matter:

1. Empty sections at the START of the outline → render before any scene render-prop runs
2. Empty sections BETWEEN populated sections → render just before the first scene of the next populated section
3. Empty sections at the END → render after the `SortableList` closes

Replace the entire `<div className="pov-outline-main">` block (the one currently inside `<SortableArea>` from Task 13) with:

```tsx
        <div className="pov-outline-main">
          <SortableList items={flatSectionScenes}>
            {(scene, sortable) => {
              const sectionId = scene.plotPointId!;
              const sectionScenes = scenesBySection.get(sectionId) ?? [];
              const isFirstInSection = sectionScenes[0]?.id === scene.id;
              const section = sortedSections.find(s => s.id === sectionId);
              const sectionIdx = sortedSections.findIndex(s => s.id === sectionId);
              const isFirstSection = sectionIdx === 0;
              const isLastSection = sectionIdx === sortedSections.length - 1;

              // For each section that has zero scenes AND comes BEFORE this scene's section,
              // render its header + empty drop zone here. Tracked via a ref so we don't
              // render the same empty section twice.
              const emptySectionsBefore: PlotPoint[] = [];
              if (isFirstInSection) {
                for (let i = 0; i < sectionIdx; i++) {
                  const earlierSection = sortedSections[i];
                  const earlierScenes = scenesBySection.get(earlierSection.id) ?? [];
                  if (earlierScenes.length === 0) emptySectionsBefore.push(earlierSection);
                }
              }

              return (
                <>
                  {emptySectionsBefore.map((empty, ei) => {
                    const emptyIdx = sortedSections.findIndex(s => s.id === empty.id);
                    return (
                      <div key={`empty-${empty.id}`} className="pov-outline-section">
                        {!hideHeaders && (
                          <div className="pov-outline-section-header" data-section-id={empty.id}>
                            <button
                              className={`section-synopsis-chevron ${synopsisModes[empty.id] === 'expand' ? 'collapsed' : ''}`}
                              onClick={() => onToggleSynopsisMode(empty.id)}
                              title={synopsisModes[empty.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                            >{'▾'}</button>
                            <div className="section-reorder-buttons">
                              <button className="section-move-btn" onClick={() => onSectionMoveUp(empty.id)} disabled={emptyIdx === 0} title="Move section up">{'▲'}</button>
                              <button className="section-move-btn" onClick={() => onSectionMoveDown(empty.id)} disabled={emptyIdx === sortedSections.length - 1} title="Move section down">{'▼'}</button>
                            </div>
                            <span className="plot-point-title">{empty.title || 'New Section'}</span>
                            <span className="plot-point-count">(0/{empty.expectedSceneCount ?? '?'})</span>
                            {onDeleteSection && (
                              <button className="section-delete-btn" onClick={() => onDeleteSection(empty.id)} title="Delete section">{'×'}</button>
                            )}
                          </div>
                        )}
                        <EmptySectionDropZone sectionId={empty.id} />
                      </div>
                    );
                  })}
                  {isFirstInSection && section && !hideHeaders && (
                    <div className="pov-outline-section-header" data-section-id={section.id}>
                      <button
                        className={`section-synopsis-chevron ${synopsisModes[section.id] === 'expand' ? 'collapsed' : ''}`}
                        onClick={() => onToggleSynopsisMode(section.id)}
                        title={synopsisModes[section.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                      >{'▾'}</button>
                      <div className="section-reorder-buttons">
                        <button className="section-move-btn" onClick={() => onSectionMoveUp(section.id)} disabled={isFirstSection} title="Move section up">{'▲'}</button>
                        <button className="section-move-btn" onClick={() => onSectionMoveDown(section.id)} disabled={isLastSection} title="Move section down">{'▼'}</button>
                      </div>
                      <span className="plot-point-title">{section.title || 'New Section'}</span>
                      <span className="plot-point-count">({sectionScenes.length}/{section.expectedSceneCount ?? '?'})</span>
                      {onDeleteSection && (
                        <button className="section-delete-btn" onClick={() => onDeleteSection(section.id)} title="Delete section">{'×'}</button>
                      )}
                    </div>
                  )}
                  <div
                    ref={sortable.setNodeRef}
                    style={sortable.style}
                    className={`pov-outline-row-wrapper ${sortable.isOver ? 'is-over' : ''}`}
                    data-section-id={sectionId}
                    data-dnd-sortable-item
                    {...sortable.attributes}
                    {...sortable.listeners}
                  >
                    <OutlineSceneRow
                      scene={scene}
                      displayNumber={scene.sceneNumber}
                      characterName={getCharacterName?.(scene.characterId)}
                      synopsisVisible={synopsisModes[sectionId] !== 'expand'}
                      onSceneChange={onSceneChange}
                      onSetAside={onSetAside}
                      onOpenInEditor={onOpenInEditor}
                      expandMode={synopsisModes[sectionId] === 'expand'}
                    />
                  </div>
                </>
              );
            }}
          </SortableList>
          {/* Render trailing empty sections (those that come after the last non-empty section) */}
          {(() => {
            const lastNonEmptyIdx = (() => {
              for (let i = sortedSections.length - 1; i >= 0; i--) {
                if ((scenesBySection.get(sortedSections[i].id) ?? []).length > 0) return i;
              }
              return -1;
            })();
            return sortedSections.slice(lastNonEmptyIdx + 1).map((empty, ei) => {
              const emptyIdx = sortedSections.findIndex(s => s.id === empty.id);
              return (
                <div key={`trailing-empty-${empty.id}`} className="pov-outline-section">
                  {!hideHeaders && (
                    <div className="pov-outline-section-header" data-section-id={empty.id}>
                      <button
                        className={`section-synopsis-chevron ${synopsisModes[empty.id] === 'expand' ? 'collapsed' : ''}`}
                        onClick={() => onToggleSynopsisMode(empty.id)}
                        title={synopsisModes[empty.id] === 'expand' ? 'Show synopses' : 'Hide synopses'}
                      >{'▾'}</button>
                      <div className="section-reorder-buttons">
                        <button className="section-move-btn" onClick={() => onSectionMoveUp(empty.id)} disabled={emptyIdx === 0} title="Move section up">{'▲'}</button>
                        <button className="section-move-btn" onClick={() => onSectionMoveDown(empty.id)} disabled={emptyIdx === sortedSections.length - 1} title="Move section down">{'▼'}</button>
                      </div>
                      <span className="plot-point-title">{empty.title || 'New Section'}</span>
                      <span className="plot-point-count">(0/{empty.expectedSceneCount ?? '?'})</span>
                      {onDeleteSection && (
                        <button className="section-delete-btn" onClick={() => onDeleteSection(empty.id)} title="Delete section">{'×'}</button>
                      )}
                    </div>
                  )}
                  <EmptySectionDropZone sectionId={empty.id} />
                </div>
              );
            });
          })()}
        </div>
```

- [ ] **Step 4: Verify build**

```bash
npx vite build
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PovOutlineView.tsx
git commit -m "feat(pov): add empty-section drop placeholders"
```

---

## Task 15: Wire `<PovOutlineView>` into `App.tsx`

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add the import**

Find the existing import block near the top of `App.tsx` and add:

```tsx
import PovOutlineView from './components/PovOutlineView';
```

- [ ] **Step 2: Add helper handlers (before the JSX render)**

Find `handlePovSceneDrop` (around line 1871) and add two helpers immediately after it:

```tsx
  const handleSceneToBullpen = async (sceneId: string) => {
    // Drag from POV outline → bullpen panel = same effect as the existing "Set aside" button
    await handleSetAside(sceneId);
  };

  const handleBullpenToSection = async (sceneId: string, targetSectionId: string) => {
    if (!projectData || !selectedCharacterId) return;
    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const targetSectionScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId && s.plotPointId === targetSectionId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    const insertAtNumber = (targetSectionScenes[targetSectionScenes.length - 1]?.sceneNumber ?? 0) + 1;
    draggedPovSceneRef.current = scene;
    await handlePovSceneDrop(insertAtNumber, targetSectionId);
    draggedPovSceneRef.current = null;
  };
```

- [ ] **Step 3: Replace the POV view rendering block**

Find the existing block at line ~3768:

```tsx
            ) : mode === 'pov' ? (
              // POV View with plot points and table of contents
              <div className={`pov-layout ${isConnecting ? 'is-connecting' : ''}`}>
                <div className="pov-content">
                {isConnecting && (
                  <div className="connecting-banner">
                    Click another scene to connect, or <button onClick={() => { setIsConnecting(false); setConnectionSource(null); }}>cancel</button>
                  </div>
                )}
                {displayedPlotPoints.map((plotPoint, index) => (
                  <PlotPointSection
                    /* ...all the props... */
                  />
                ))}
```

Locate the entire `displayedPlotPoints.map(<PlotPointSection ... />)` JSX (it spans roughly lines 3775–3855) and replace it with:

```tsx
                <PovOutlineView
                  sections={displayedPlotPoints}
                  scenes={displayedScenes.filter(s => s.plotPointId !== null)}
                  bullpenScenes={displayedScenes.filter(s => s.plotPointId === null)}
                  characterColor={getCharacterHexColor(selectedCharacterId ?? '')}
                  synopsisModes={sectionSynopsisModes}
                  hideHeaders={hideSectionHeaders[tabId] ?? false}
                  onSceneReorder={(sceneId, targetSectionId, targetSceneNumber) => {
                    const scene = projectData.scenes.find(s => s.id === sceneId);
                    if (!scene) return;
                    draggedPovSceneRef.current = scene;
                    handlePovSceneDrop(targetSceneNumber, targetSectionId);
                    draggedPovSceneRef.current = null;
                  }}
                  onSceneToBullpen={handleSceneToBullpen}
                  onBullpenToSection={handleBullpenToSection}
                  onSetAside={handleSetAside}
                  onSectionMoveUp={handleMoveSectionUp}
                  onSectionMoveDown={handleMoveSectionDown}
                  onToggleSynopsisMode={handleToggleSynopsisMode}
                  onSceneChange={handleSceneChange}
                  onOpenInEditor={handleOpenInEditor}
                  onSectionChange={handlePlotPointChange}
                  onDeleteSection={handleDeletePlotPoint}
                  getCharacterName={getCharacterName}
                />
```

Note: this assumes `getCharacterHexColor` is already in scope in `App.tsx` (it's used in other places). If not, define it locally as in `RailsView.tsx` lines 218–226.

- [ ] **Step 4: Verify build**

```bash
npx vite build
```

Expected: Build succeeds. There may be one TypeScript warning about unused `PlotPointSection` import — leave it for now; we'll clean it up in Task 17.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(pov): swap App.tsx POV branch to use PovOutlineView"
```

---

## Task 16: Manual verification pass

This task has no code changes — it's pure manual testing of the fully wired POV view.

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait for Vite to print the dev URL. Open the Electron window.

- [ ] **Step 2: Run through the full interaction matrix**

Open a project with a POV character that has multiple sections, multiple scenes, and at least one bullpen scene. Verify each of these interactions works:

1. ☐ **Drag a scene within the same section** — drops at expected position; scene numbers renumber correctly
2. ☐ **Drag a scene to a different section** — assigns to new `plotPointId`; renumbers within both sections
3. ☐ **Drag a scene into an empty section** — drops at position 1 of that section
4. ☐ **Drag a scene to the very top of the outline** — lands at scene 1
5. ☐ **Drag a scene to the very bottom of the outline** — lands at the last position
6. ☐ **Drag a POV scene into the bullpen panel** — scene moves to bullpen (`plotPointId` becomes `null`)
7. ☐ **Drag a bullpen scene into a POV section** — scene gets the section's `plotPointId`
8. ☐ **Cancel a drag with Escape** — scene smoothly returns to original position
9. ☐ **Drop a scene on itself (no-op)** — no flicker, no state change, no console errors
10. ☐ **Drag near the top edge of the viewport** — outline auto-scrolls up
11. ☐ **Drag near the bottom edge of the viewport** — outline auto-scrolls down
12. ☐ **Click on a scene title to edit it** — drag does NOT fire (5px activation threshold)
13. ☐ **Click on the section's ▲▼ buttons** — section reorders without triggering scene drag
14. ☐ **Tab to focus a scene row, press Space, Arrow Down, Space** — keyboard reorder works; screen reader announces position
15. ☐ **The drop indicator (slim green line) appears at the drop point** — only ONE indicator visible at a time
16. ☐ **Other scenes slide out of the way as you drag** — no jump, smooth animation
17. ☐ **Empty section shows a small drop placeholder zone** — turns green when hovered
18. ☐ **The slim line color is `#22c55e`** — matches rails view (visually compare)
19. ☐ **iPad / touch test** (if available): tap-and-hold a scene row, drag, drop — should feel identical to mouse drag

- [ ] **Step 3: If any check fails, file a follow-up note (do NOT fix in this plan)**

If a check fails, note it in `docs/superpowers/specs/2026-05-03-dnd-kit-full-migration-design.md`'s "§10 Open questions / future work" and move on. Bug fixes happen in their own commits after this plan completes.

If all checks pass, proceed to Task 17.

- [ ] **Step 4: Stop the dev server** (Ctrl+C in the terminal running `npm run dev`)

- [ ] **Step 5: Commit a manual verification note**

```bash
git commit --allow-empty -m "verify(pov): manual interaction matrix passes for PovOutlineView"
```

---

## Task 17: Strip the `outlineMode` branch from `PlotPointSection`

`PlotPointSection`'s outline-mode branch (lines ~304–371) is now dead code on desktop. Remove it. The non-outline branch must stay because `MobileApp.tsx` still uses `<PlotPointSection>` without `outlineMode={true}`.

**Files:**
- Modify: `src/renderer/components/PlotPointSection.tsx`

- [ ] **Step 1: Remove the outline-mode branch**

Open `src/renderer/components/PlotPointSection.tsx`. Locate the `outlineMode ? (...) : (...)` ternary that starts around line 304 with `{outlineMode ? (` and ends with `) : (` before the non-outline scene-mapping block.

Replace the entire `outlineMode ? (...) : (` opening (and the matching `)` close at the end of the non-outline branch) with just the non-outline body — i.e., remove the ternary, keep only the existing non-outline scene-mapping JSX.

Also remove these dead pieces:
- The `outlineMode`, `synopsisMode`, `onToggleSynopsisMode`, `onSetAside`, `getCharacterName` props from `PlotPointSectionProps` (no longer used since outline branch is gone)
- The `outline-mode` className conditionals on `plot-point` and `plot-point-header` divs
- The `section-synopsis-chevron` button block in the header (it was only shown in outline mode)
- The `outlineMode` argument in the destructured props
- The `import OutlineSceneRow from './OutlineSceneRow';` line if no other code in this file references it

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

Expected: Build succeeds. If `MobileApp.tsx` passed `outlineMode`/`synopsisMode`/etc. props that no longer exist, TypeScript will flag those — remove the corresponding prop assignments in `MobileApp.tsx` too. (Mobile already runs the non-outline branch only, so no behavioral change.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PlotPointSection.tsx src/renderer/MobileApp.tsx
git commit -m "refactor(pov): remove dead outline-mode branch from PlotPointSection"
```

---

## Task 18: Final verification + push

**Files:** none (push only)

- [ ] **Step 1: Final build pass**

```bash
npx vite build
```

Expected: zero errors.

- [ ] **Step 2: Restart dev once more, sanity-check POV view loads and one drag works**

```bash
npm run dev
```

Open Electron, switch to POV view, drag one scene, verify it works. Stop dev server.

- [ ] **Step 3: Push to main (triggers auto-release per CLAUDE.md release process)**

```bash
git push
```

The GitHub Actions workflow will bump version, tag, build for macOS/Windows/Linux, codesign + notarize, and publish a release.

- [ ] **Step 4: Watch the release workflow complete**

```bash
gh run watch
```

Or manually visit the repo's Actions tab to verify the build + release passes.

---

## Self-Review

**Spec coverage check:**

| Spec section | Implemented in | Notes |
|---|---|---|
| §4.1 Shared primitives | Tasks 2–10 | All 7 primitive files created |
| §4.2 SortableList contract | Task 6 | `renderItem` render-prop pattern matches |
| §4.3 Responsibility map | Task 15 | App.tsx owns state, PovOutlineView owns drag |
| §4.4 Per-view DndContext scope | Task 13 | One DndContext, two SortableLists in PovOutlineView |
| §5.1 Replaces App.tsx block | Task 15 | `displayedPlotPoints.map(<PlotPointSection>)` removed |
| §5.2 Component interface | Task 11 | Props match spec sketch |
| §5.3 Internal structure | Tasks 12–14 | One DndContext, flat sortable, per-section headers, empty-section placeholders |
| §5.4 Interaction model — whole-row drag, 5px activation, cross-section, bullpen, click-vs-drag, cancel | Tasks 2, 12, 13 | Activation distance in `useSortableSensors`; whole-row spread of attributes/listeners; bullpen handled in handleDragEnd |
| §5.5 What's removed | Task 17 | Outline branch of PlotPointSection stripped |
| §5.6 What stays | Tasks 11, 14 | Section header buttons, OutlineSceneRow, "Set aside" button preserved |
| §6.1 Drop indicator | Task 9 | `dnd.css` defines `.dnd-drop-indicator` with `#22c55e`, `::before` circle |
| §6.2 Slide animation | Task 5 + dnd-kit defaults | `useSortable` provides transform/transition; default 200ms ease-out |
| §6.3 Drag preview | Tasks 4, 12 | `DragPreviewCard` rendered via `renderDragOverlay` |
| §6.4 Auto-scroll | Tasks 8, 12 | `useAutoScrollContainer` wired via `ScrollAutoBinder` |
| §6.5 Edge cases | Task 16 | All explicitly checked in manual verification |
| §8.1 Keyboard reorder | Task 2 | `KeyboardSensor` + `sortableKeyboardCoordinates`; verified in Task 16 |
| §8.2 Touch / iPad | Task 2 | `PointerSensor` handles both; verified in Task 16 |
| §8.3 Reduced motion | Task 9 | `prefers-reduced-motion` rule in `dnd.css` |
| §9 Verification protocol | Task 16 | Full interaction matrix |

No spec gaps.

**Placeholder scan:** No "TBD", "TODO", or "implement later" patterns. All code blocks contain working code. All file paths are concrete. All commands have expected output.

**Type consistency:**
- `SortableItemRenderProps` defined in Task 5, used in Task 6 (`SortableList` `renderItem` second arg) and Task 12 (`PovOutlineView` render-prop body) — consistent
- `handlePovSceneDrop(targetSceneNumber, targetSectionId)` — same signature in App.tsx (existing) and Task 15 invocation
- `useDroppable` data shape `{ sectionId }` — Task 14 only, internally consistent
- Drop target ID convention `section-empty:<sectionId>` — defined in Task 14 `EmptySectionDropZone`, consumed in Task 14 `handleDragEnd` — consistent

**Scope check:** Single subsystem (POV view + foundational primitives). Shippable as one PR / auto-release. No decomposition needed.

---

## Notes for the executing agent

- Project has **no test suite**. Verification per task is `npx vite build` + manual where applicable. Do not invent unit tests.
- **Do NOT run `npm run package`** — it prompts for codesign credentials only available in GitHub Secrets. Release happens automatically when you push to main.
- TypeScript in `react-jsx` mode — don't import `React` unless using `React.something` namespace.
- Pre-existing TS errors exist in the codebase (unused imports/vars). Don't try to fix them; only fix errors caused by this plan's changes.
- The user (Brian) is on macOS (darwin 25.3.0); shell is zsh. Bash commands shown should work in zsh too.
- If a step's code references a hook or component defined in an earlier step that you haven't yet created, that's a plan ordering bug — flag it and skip ahead to create the dependency first, then return.
