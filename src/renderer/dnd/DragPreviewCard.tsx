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
