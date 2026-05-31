import { useState } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, PlotPoint } from '../../shared/types';

interface TablePovSlideoverProps {
  characterName: string;
  characterColor: string;
  scenes: Scene[];
  plotPoints: PlotPoint[];
  selectedSceneId: string;
  onClose: () => void;
  onMove: (sceneId: string, targetIndex: number, targetPlotPointId: string | null) => void;
}

function SortableSceneRow({ scene, isSelected }: {
  scene: Scene;
  isSelected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const titleMatch = scene.content.match(/==\*\*(.+?)\*\*==/);
  const title = titleMatch
    ? titleMatch[1].replace(/#[a-zA-Z0-9_]+/g, '').trim()
    : scene.content.replace(/<[^>]*>/g, '').replace(/#[a-zA-Z0-9_]+/g, '').trim().slice(0, 60);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pov-slideover-row ${isSelected ? 'selected' : ''}`}
    >
      <span className="pov-slideover-drag" {...attributes} {...listeners}>⠿</span>
      <span className="pov-slideover-num">{scene.sceneNumber}</span>
      <span className="pov-slideover-title">{title || 'Untitled'}</span>
    </div>
  );
}

export default function TablePovSlideover({
  characterName,
  characterColor,
  scenes,
  plotPoints,
  selectedSceneId,
  onClose,
  onMove,
}: TablePovSlideoverProps) {
  const [localScenes, setLocalScenes] = useState(scenes);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localScenes.findIndex(s => s.id === active.id);
    const newIndex = localScenes.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localScenes, oldIndex, newIndex);
    setLocalScenes(reordered);

    const neighborScene = reordered[newIndex + 1] || reordered[newIndex - 1];
    const targetPlotPointId = neighborScene?.plotPointId ?? null;

    onMove(String(active.id), newIndex, targetPlotPointId);
  };

  // Group scenes by plot point for display
  const sections: Array<{ plotPoint: PlotPoint | null; scenes: Scene[] }> = [];
  const seenPpIds = new Set<string | null>();
  for (const scene of localScenes) {
    const ppId = scene.plotPointId ?? null;
    if (!seenPpIds.has(ppId)) {
      seenPpIds.add(ppId);
      sections.push({
        plotPoint: plotPoints.find(pp => pp.id === ppId) ?? null,
        scenes: [],
      });
    }
    sections[sections.length - 1].scenes.push(scene);
  }

  return (
    <div className="pov-slideover-overlay" onClick={onClose}>
      <div className="pov-slideover" onClick={e => e.stopPropagation()}>
        <div className="pov-slideover-header">
          <span
            className="pov-slideover-char-dot"
            style={{ background: characterColor }}
          />
          <span className="pov-slideover-char-name">{characterName} — POV Order</span>
          <button className="pov-slideover-close" onClick={onClose}>×</button>
        </div>

        <div className="pov-slideover-body">
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section, si) => (
                <div key={si} className="pov-slideover-section">
                  {section.plotPoint && (
                    <div className="pov-slideover-section-header">{section.plotPoint.title}</div>
                  )}
                  {section.scenes.map(scene => (
                    <SortableSceneRow
                      key={scene.id}
                      scene={scene}
                      isSelected={scene.id === selectedSceneId}
                    />
                  ))}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
