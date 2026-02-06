import React from 'react';
import { Scene } from '../../shared/types';

interface RailsSceneCardProps {
  scene: Scene;
  characterColor: string;
  onClick: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  isHighlighted: boolean;
  hasConnections: boolean;
  isConnecting: boolean;
  isConnectionSource: boolean;
  isConnectionTarget: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export default function RailsSceneCard({
  scene,
  characterColor,
  onClick,
  onMouseEnter,
  onMouseLeave,
  isHighlighted,
  hasConnections,
  isConnecting,
  isConnectionSource,
  isConnectionTarget,
  onDragStart,
  onDragEnd,
}: RailsSceneCardProps) {
  // Clean up the title for display (remove markdown formatting)
  const displayTitle = scene.content
    .replace(/==\*\*/g, '')
    .replace(/\*\*==/g, '')
    .replace(/==/g, '')
    .replace(/#\w+/g, '') // Remove tags
    .trim();

  return (
    <div
      className={`rails-scene-card ${isHighlighted ? 'highlighted' : ''} ${hasConnections ? 'has-connections' : ''} ${isConnectionSource ? 'connection-source' : ''} ${isConnectionTarget ? 'connection-target' : ''}`}
      style={{ borderLeftColor: characterColor }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-scene-id={scene.id}
      draggable={!isConnecting}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="rails-scene-title">{displayTitle || 'Untitled scene'}</div>
      {hasConnections && (
        <div className="rails-scene-connection-indicator" style={{ backgroundColor: characterColor }} />
      )}
    </div>
  );
}
