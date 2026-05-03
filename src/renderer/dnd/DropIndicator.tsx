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
