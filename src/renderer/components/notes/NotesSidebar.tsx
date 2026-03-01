import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NoteMetadata } from '../../../shared/types';

interface NotesSidebarProps {
  notes: NoteMetadata[];
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (parentId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onRenameNote: (noteId: string, newTitle: string) => void;
  onMoveNote: (noteId: string, newParentId: string | null, newOrder: number) => void;
  width?: number;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface NoteTreeNode {
  note: NoteMetadata;
  children: NoteTreeNode[];
}

function buildNoteTree(notes: NoteMetadata[], searchQuery: string): NoteTreeNode[] {
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const matching = notes
      .filter(n => n.title.toLowerCase().includes(q))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    return matching.map(n => ({ note: n, children: [] }));
  }

  const map = new Map<string, NoteTreeNode>();
  const roots: NoteTreeNode[] = [];

  for (const note of notes) {
    map.set(note.id, { note, children: [] });
  }

  for (const note of notes) {
    const node = map.get(note.id)!;
    if (note.parentId && map.has(note.parentId)) {
      map.get(note.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: NoteTreeNode[]) => {
    nodes.sort((a, b) => (a.note.order ?? 0) - (b.note.order ?? 0));
    nodes.forEach(n => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

function getAllDescendantIds(notes: NoteMetadata[], ancestorId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [ancestorId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const note of notes) {
      if (note.parentId === current && !ids.has(note.id)) {
        ids.add(note.id);
        queue.push(note.id);
      }
    }
  }
  return ids;
}

type DropPosition = 'before' | 'inside' | 'after';

interface NoteTreeItemProps {
  node: NoteTreeNode;
  depth: number;
  selectedNoteId: string | null;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, noteId: string) => void;
  draggedNoteId: string | null;
  dropTarget: { noteId: string; position: DropPosition } | null;
  onDragStart: (e: React.DragEvent, noteId: string) => void;
  onDragOver: (e: React.DragEvent, noteId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, noteId: string) => void;
  renamingNoteId: string | null;
  renameValue: string;
  onRenameValueChange: (val: string) => void;
  onRenameSubmit: (noteId: string) => void;
  onRenameCancel: () => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
}

function NoteTreeItem({
  node,
  depth,
  selectedNoteId,
  collapsedIds,
  onToggleCollapse,
  onSelect,
  onContextMenu,
  draggedNoteId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  renamingNoteId,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
  renameInputRef,
}: NoteTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.note.id);
  const isSelected = selectedNoteId === node.note.id;
  const isDragging = draggedNoteId === node.note.id;
  const isDropTarget = dropTarget?.noteId === node.note.id;
  const isRenaming = renamingNoteId === node.note.id;

  let dropClass = '';
  if (isDropTarget && dropTarget) {
    dropClass = `drop-${dropTarget.position}`;
  }

  return (
    <>
      <div
        className={`notes-sidebar-item ${isSelected ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${dropClass}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.note.id)}
        onContextMenu={(e) => onContextMenu(e, node.note.id)}
        draggable
        onDragStart={(e) => onDragStart(e, node.note.id)}
        onDragOver={(e) => onDragOver(e, node.note.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, node.note.id)}
      >
        <button
          className={`notes-sidebar-chevron-btn ${hasChildren ? '' : 'invisible'} ${!isCollapsed && hasChildren ? 'expanded' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.note.id); }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="notes-sidebar-rename-input"
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onBlur={() => onRenameSubmit(node.note.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit(node.note.id);
              if (e.key === 'Escape') onRenameCancel();
            }}
          />
        ) : (
          <div className="notes-sidebar-item-stack">
            <span className="notes-sidebar-item-title">{node.note.title || 'Untitled'}</span>
            <span className="notes-sidebar-item-time">{timeAgo(node.note.modifiedAt)}</span>
            {node.note.tags && node.note.tags.length > 0 && (
              <div className="notes-sidebar-item-tags">
                {node.note.tags.slice(0, 3).map(t => (
                  <span key={t} className="note-tag-pill">#{t}</span>
                ))}
                {node.note.tags.length > 3 && (
                  <span className="note-tag-pill note-tag-overflow">+{node.note.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {!isCollapsed && node.children.map(child => (
        <NoteTreeItem
          key={child.note.id}
          node={child}
          depth={depth + 1}
          selectedNoteId={selectedNoteId}
          collapsedIds={collapsedIds}
          onToggleCollapse={onToggleCollapse}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          draggedNoteId={draggedNoteId}
          dropTarget={dropTarget}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          renamingNoteId={renamingNoteId}
          renameValue={renameValue}
          onRenameValueChange={onRenameValueChange}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
          renameInputRef={renameInputRef}
        />
      ))}
    </>
  );
}

export default function NotesSidebar({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onRenameNote,
  onMoveNote,
  width,
}: NotesSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('braidr-notes-collapsed-folders');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ noteId: string; position: DropPosition } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('braidr-notes-collapsed-folders', JSON.stringify([...collapsedIds]));
  }, [collapsedIds]);

  useEffect(() => {
    if (renamingNoteId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingNoteId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [contextMenu]);

  const tree = useMemo(() => buildNoteTree(notes, searchQuery), [notes, searchQuery]);

  const toggleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRenameSubmit = (noteId: string) => {
    if (renameValue.trim()) {
      onRenameNote(noteId, renameValue.trim());
    }
    setRenamingNoteId(null);
    setRenameValue('');
  };

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    setDraggedNoteId(noteId);
    e.dataTransfer.setData('text/plain', noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetNoteId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedNoteId || draggedNoteId === targetNoteId) {
      setDropTarget(null);
      return;
    }

    const descendants = getAllDescendantIds(notes, draggedNoteId);
    if (descendants.has(targetNoteId)) {
      setDropTarget(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: DropPosition;
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    setDropTarget({ noteId: targetNoteId, position });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetNoteId: string) => {
    e.preventDefault();
    if (!draggedNoteId || !dropTarget || draggedNoteId === targetNoteId) {
      setDraggedNoteId(null);
      setDropTarget(null);
      return;
    }

    const targetNote = notes.find(n => n.id === targetNoteId);
    if (!targetNote) {
      setDraggedNoteId(null);
      setDropTarget(null);
      return;
    }

    let newParentId: string | null;
    let newOrder: number;

    if (dropTarget.position === 'inside') {
      newParentId = targetNoteId;
      const siblings = notes.filter(n => n.parentId === targetNoteId);
      newOrder = siblings.length;
      setCollapsedIds(prev => {
        const next = new Set(prev);
        next.delete(targetNoteId);
        return next;
      });
    } else {
      newParentId = targetNote.parentId;
      const siblings = notes
        .filter(n => (n.parentId ?? null) === (targetNote.parentId ?? null))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const targetIdx = siblings.findIndex(n => n.id === targetNoteId);
      newOrder = dropTarget.position === 'before' ? targetIdx : targetIdx + 1;
    }

    onMoveNote(draggedNoteId, newParentId, newOrder);
    setDraggedNoteId(null);
    setDropTarget(null);
  };

  useEffect(() => {
    const handleEnd = () => {
      setDraggedNoteId(null);
      setDropTarget(null);
    };
    document.addEventListener('dragend', handleEnd);
    return () => document.removeEventListener('dragend', handleEnd);
  }, []);

  return (
    <div className="notes-sidebar" style={width ? { width } : undefined}>
      <div className="notes-sidebar-header">
        <div className="notes-sidebar-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="notes-sidebar-actions">
        <button className="notes-sidebar-new-btn" onClick={() => onCreateNote()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          New Note
        </button>
      </div>

      <div className="notes-sidebar-list">
        {tree.map(node => (
          <NoteTreeItem
            key={node.note.id}
            node={node}
            depth={0}
            selectedNoteId={selectedNoteId}
            collapsedIds={collapsedIds}
            onToggleCollapse={toggleCollapse}
            onSelect={onSelectNote}
            onContextMenu={handleContextMenu}
            draggedNoteId={draggedNoteId}
            dropTarget={dropTarget}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            renamingNoteId={renamingNoteId}
            renameValue={renameValue}
            onRenameValueChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => { setRenamingNoteId(null); setRenameValue(''); }}
            renameInputRef={renameInputRef}
          />
        ))}

        {notes.length === 0 && !searchQuery && (
          <div className="notes-sidebar-empty">
            <p>No notes yet</p>
            <p className="notes-sidebar-empty-hint">Create your first note to get started</p>
          </div>
        )}

        {tree.length === 0 && searchQuery && (
          <div className="notes-sidebar-empty">
            <p>No matching notes</p>
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="notes-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => {
            onCreateNote(contextMenu.noteId);
            setContextMenu(null);
          }}>New Sub-note</button>
          <button onClick={() => {
            const note = notes.find(n => n.id === contextMenu.noteId);
            if (note) { setRenamingNoteId(note.id); setRenameValue(note.title); }
            setContextMenu(null);
          }}>Rename</button>
          <button className="notes-context-menu-delete" onClick={() => {
            onDeleteNote(contextMenu.noteId);
            setContextMenu(null);
          }}>Archive</button>
        </div>
      )}
    </div>
  );
}
