import { useState, useRef, useEffect } from 'react';
import { Scene } from '../../shared/types';

function stripHtml(html: string): string {
  if (!html || !html.includes('<')) return html;
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
}

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
  onPreview?: (sceneId: string) => void;
  onOpenInEditor?: (sceneId: string) => void;
  expandMode: boolean;
  isDragging?: boolean;
  dropPosition?: 'above' | 'below' | null;
}

function OutlineSceneRow({
  scene,
  displayNumber,
  characterName,
  synopsisVisible,
  onSceneChange,
  onSetAside,
  onDragStart,
  onDragEnd,
  onPreview,
  onOpenInEditor,
  expandMode,
  isDragging,
  dropPosition,
}: OutlineSceneRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(scene.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const canDragRef = useRef(false);

  useEffect(() => {
    setTitleValue(scene.title);
  }, [scene.title]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    const resetDrag = () => { canDragRef.current = false; };
    document.addEventListener('mouseup', resetDrag);
    return () => document.removeEventListener('mouseup', resetDrag);
  }, []);

  const handleTitleBlur = () => {
    setEditingTitle(false);
    console.log('[title-debug] blur: titleValue=', JSON.stringify(titleValue), 'scene.title=', JSON.stringify(scene.title), 'will save=', titleValue !== scene.title);
    if (titleValue !== scene.title) {
      onSceneChange(scene.id, titleValue, scene.notes);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setTitleValue(scene.title);
      setEditingTitle(false);
    }
  };

  const [synopsisValue, setSynopsisValue] = useState(() => scene.notes.map(stripHtml).join('\n'));
  const notesKey = JSON.stringify(scene.notes);
  useEffect(() => { setSynopsisValue(scene.notes.map(stripHtml).join('\n')); }, [notesKey]);

  const synopsisRef = useRef<HTMLTextAreaElement>(null);

  const showSynopsis = expandMode ? expanded : synopsisVisible;

  // Auto-size the synopsis textarea so the full text wraps and is visible
  // without needing to focus/edit it. Re-measure on reflow — a one-time measure
  // locks in a too-tall height when the text later wraps to fewer lines (e.g.
  // the body font loads after the initial measure, or the column widens). A
  // ResizeObserver catches width changes and document.fonts.ready catches the
  // font swap; the width guard keeps the height write from looping the observer.
  useEffect(() => {
    const el = synopsisRef.current;
    if (!el || !showSynopsis) return;
    const measure = () => {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    };
    measure();
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        measure();
      }
    });
    ro.observe(el);
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    return () => { ro.disconnect(); cancelled = true; };
  }, [synopsisValue, showSynopsis]);

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.outline-scene-title-input, .outline-scene-synopsis-input, .outline-scene-action-btn, .outline-scene-drag-handle')) return;
    if (expandMode) {
      setExpanded(!expanded);
    }
  };

  const handleSynopsisBlur = () => {
    const newNotes = synopsisValue.split('\n').filter(line => line.trim());
    if (synopsisValue !== scene.notes.join('\n')) {
      onSceneChange(scene.id, scene.content, newNotes.length > 0 ? newNotes : []);
    }
  };

  const rowClasses = [
    'outline-scene-row',
    isDragging ? 'dragging' : '',
    dropPosition === 'above' ? 'drop-above' : '',
    dropPosition === 'below' ? 'drop-below' : '',
    showSynopsis ? 'synopsis-visible' : '',
  ].filter(Boolean).join(' ');

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
        {displayNumber !== undefined && (
          <span className="outline-scene-number">{displayNumber}.</span>
        )}
        {characterName && (
          <span className="outline-scene-character-tag">{characterName}</span>
        )}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="outline-scene-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
          />
        ) : (
          <span
            className="outline-scene-title"
            onClick={() => setEditingTitle(true)}
          >
            {scene.title || scene.content || 'Untitled scene'}
          </span>
        )}
        <span className="outline-scene-hover-actions">
          {(scene.wordCount ?? 0) > 0 && (
            <em className="outline-scene-wordcount">{(scene.wordCount!).toLocaleString()} words</em>
          )}
          {onPreview ? (
            <button
              className="outline-scene-action-btn"
              onClick={(e) => { e.stopPropagation(); onPreview(scene.id); }}
            >
              Preview
            </button>
          ) : onOpenInEditor ? (
            <button
              className="outline-scene-action-btn"
              onClick={(e) => { e.stopPropagation(); onOpenInEditor(scene.id); }}
            >
              Open
            </button>
          ) : null}
          {onSetAside && (
            <button
              className="outline-scene-action-btn"
              onClick={(e) => { e.stopPropagation(); onSetAside(scene.id); }}
            >
              Set aside
            </button>
          )}
        </span>
      </div>
      <div className={`outline-scene-synopsis ${showSynopsis ? 'open' : ''}`}>
        <textarea
          ref={synopsisRef}
          className="outline-scene-synopsis-input"
          value={synopsisValue}
          onChange={(e) => setSynopsisValue(e.target.value)}
          onBlur={handleSynopsisBlur}
          placeholder="Write a synopsis..."
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
      </div>
    </div>
  );
}

export default OutlineSceneRow;
