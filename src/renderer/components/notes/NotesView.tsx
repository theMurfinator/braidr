import { useState, useEffect, useCallback, useRef } from 'react';
import { NoteMetadata, NotesIndex, ArchivedNote, Scene, Character, Tag, FontSettings, AllFontSettings } from '../../../shared/types';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastContext';
import { track } from '../../utils/posthogTracker';
import NotesSidebar from './NotesSidebar';
import NoteEditor from './NoteEditor';

type NotesWidthMode = 'narrow' | 'wide' | 'full';

const NOTES_WIDTH_MODES: NotesWidthMode[] = ['narrow', 'wide', 'full'];

type NotesSizeMode = 'small' | 'medium' | 'large';

const NOTES_SIZE_MODES: NotesSizeMode[] = ['small', 'medium', 'large'];

interface NotesViewProps {
  projectPath: string;
  scenes: Scene[];
  characters: Character[];
  tags: Tag[];
  initialNoteId?: string | null;
  onNoteNavigated?: () => void;
  storagePrefix?: string;
  allFontSettings?: AllFontSettings;
  onFontSettingsChange?: (s: AllFontSettings) => void;
}

// Get all descendant IDs of a note
function getAllDescendantIds(notes: NoteMetadata[], ancestorId: string): string[] {
  const ids: string[] = [];
  const queue = [ancestorId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const note of notes) {
      if (note.parentId === current && !ids.includes(note.id)) {
        ids.push(note.id);
        queue.push(note.id);
      }
    }
  }
  return ids;
}

// Migrate legacy folder-based index to nested notes
async function migrateNotesIndex(oldIndex: any, projectPath: string): Promise<NotesIndex> {
  if (oldIndex.version && oldIndex.version >= 2) return oldIndex;

  const folders: string[] = oldIndex.folders || [];
  const oldNotes: any[] = oldIndex.notes || [];
  const folderNoteIds: Record<string, string> = {};
  const newNotes: NoteMetadata[] = [];

  // Create a synthetic parent note for each old folder
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const folderId = 'folder_' + folder.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    folderNoteIds[folder] = folderId;
    newNotes.push({
      id: folderId,
      title: folder,
      fileName: `${folderId}.html`,
      parentId: null,
      order: i,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      outgoingLinks: [],
      sceneLinks: [],
      tags: [],
    });
    // Create empty file for the folder note
    try {
      await dataService.createNote(projectPath, `${folderId}.html`);
    } catch {}
  }

  // Migrate existing notes
  let rootOrder = folders.length;
  const folderChildCounters: Record<string, number> = {};

  for (const note of oldNotes) {
    const parentId = note.folderPath ? (folderNoteIds[note.folderPath] || null) : null;
    const orderKey = parentId || '__root__';
    if (!folderChildCounters[orderKey]) folderChildCounters[orderKey] = 0;

    // Flatten file: move from subfolder to root of notes/
    const flatFileName = `${note.id}.html`;
    if (note.fileName && note.fileName !== flatFileName && note.fileName.includes('/')) {
      try {
        await dataService.renameNote(projectPath, note.fileName, flatFileName);
      } catch {
        // If rename fails, file may already be flat
      }
    }

    newNotes.push({
      id: note.id,
      title: note.title,
      fileName: flatFileName,
      parentId,
      order: parentId ? folderChildCounters[orderKey]++ : rootOrder++,
      createdAt: note.createdAt,
      modifiedAt: note.modifiedAt,
      outgoingLinks: note.outgoingLinks || [],
      sceneLinks: note.sceneLinks || [],
      tags: note.tags || [],
    });
  }

  return { notes: newNotes, version: 2 };
}

export default function NotesView({ projectPath, scenes, characters, tags, initialNoteId, onNoteNavigated, storagePrefix, allFontSettings: allFontSettingsProp, onFontSettingsChange: _onFontSettingsChange }: NotesViewProps) {
  const sk = (key: string) => storagePrefix ? `${key}-${storagePrefix}` : key;
  const { addToast } = useToast();
  const [notesWidthMode, setNotesWidthMode] = useState<NotesWidthMode>(() => {
    const saved = localStorage.getItem(sk('braidr-notes-width-mode'));
    return NOTES_WIDTH_MODES.includes(saved as NotesWidthMode) ? saved as NotesWidthMode : 'wide';
  });
  const [notesSizeMode, setNotesSizeMode] = useState<NotesSizeMode>(() => {
    const saved = localStorage.getItem(sk('braidr-notes-size-mode'));
    return NOTES_SIZE_MODES.includes(saved as NotesSizeMode) ? saved as NotesSizeMode : 'medium';
  });

  const allFontSettings: AllFontSettings = allFontSettingsProp ?? { global: {} };

  // Notes font/size are now driven by the style guide (Literata) + the
  // Small/Medium/Large preset (notesSizeMode), not the old per-level font editor.
  const resolvedNotesFontSettings: FontSettings = {
    ...allFontSettings.global,
    ...(allFontSettings.screens?.notes ?? {}),
  };
  const [notesIndex, setNotesIndex] = useState<NotesIndex>({ notes: [], version: 2 });
  const [selectedNoteId, _setSelectedNoteId] = useState<string | null>(
    () => localStorage.getItem('braidr-last-note-id')
  );
  const setSelectedNoteId = (id: string | null) => {
    _setSelectedNoteId(id);
    if (id) localStorage.setItem('braidr-last-note-id', id);
    else localStorage.removeItem('braidr-last-note-id');
  };
  const [noteContent, setNoteContent] = useState<string>('<p></p>');
  const [noteContentLoaded, setNoteContentLoaded] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem(sk('braidr-notes-sidebar-collapsed'));
    return saved !== null ? saved === 'true' : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(sk('braidr-notes-sidebar-width'));
    return saved ? parseInt(saved, 10) : 280;
  });
  const indexRef = useRef(notesIndex);
  indexRef.current = notesIndex;
  const draggingRef = useRef<{ panel: 'sidebar'; startX: number; initialWidth: number } | null>(null);
  const notesViewRef = useRef<HTMLDivElement>(null);

  // Load notes index on mount
  useEffect(() => {
    loadIndex();
  }, [projectPath]);

  // Navigate to specific note from external trigger (e.g., global search)
  useEffect(() => {
    if (initialNoteId && notesIndex.notes.length > 0) {
      const note = notesIndex.notes.find(n => n.id === initialNoteId);
      if (note) {
        setSelectedNoteId(note.id);
        setNoteContentLoaded(false);
        dataService.readNote(projectPath, note.fileName).then(content => {
          setNoteContent(content || '<p></p>');
          setNoteContentLoaded(true);
        }).catch(() => {
          setNoteContentLoaded(true);
        });
      }
      onNoteNavigated?.();
    }
  }, [initialNoteId, notesIndex.notes]);

  // Keyboard shortcuts: Cmd+N new note, Cmd+[ toggle sidebar (only in active pane)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!notesViewRef.current?.closest('.leaf-pane.active')) return;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key === 'n') {
        e.preventDefault();
        handleCreateNote();
      } else if (modifier && e.key === '[') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Persist panel widths and collapsed states
  useEffect(() => {
    localStorage.setItem(sk('braidr-notes-sidebar-width'), sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(sk('braidr-notes-sidebar-collapsed'), String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(sk('braidr-notes-width-mode'), notesWidthMode);
  }, [notesWidthMode]);

  useEffect(() => {
    localStorage.setItem(sk('braidr-notes-size-mode'), notesSizeMode);
  }, [notesSizeMode]);

  // Panel resize drag handling
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      setSidebarWidth(Math.max(180, Math.min(500, drag.initialWidth + delta)));
    };
    const onMouseUp = () => {
      draggingRef.current = null;
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleResizeStart = (e: React.MouseEvent, panel: 'sidebar') => {
    e.preventDefault();
    draggingRef.current = {
      panel,
      startX: e.clientX,
      initialWidth: sidebarWidth,
    };
    document.body.style.userSelect = 'none';
  };

  const loadIndex = async () => {
    try {
      const data = await dataService.loadNotesIndex(projectPath);

      // Run migration if needed
      if (!data.version || data.version < 2) {
        const migrated = await migrateNotesIndex(data, projectPath);
        await dataService.saveNotesIndex(projectPath, migrated);
        setNotesIndex(migrated);
        indexRef.current = migrated;
        return;
      }

      setNotesIndex(data);
    } catch (err) {
      addToast('Couldn\u2019t load notes');
    }
  };

  const saveIndex = useCallback(async (newIndex: NotesIndex) => {
    setNotesIndex(newIndex);
    indexRef.current = newIndex;
    try {
      await dataService.saveNotesIndex(projectPath, newIndex);
    } catch (err) {
      addToast('Couldn\u2019t save notes index');
    }
  }, [projectPath]);

  // Track which note we last loaded to avoid redundant loads but ensure remount loads
  const lastLoadedNoteRef = useRef<string | null>(null);
  // Load note content when selection changes or when index first loads
  useEffect(() => {
    if (selectedNoteId && notesIndex.notes.length > 0) {
      const note = notesIndex.notes.find(n => n.id === selectedNoteId);
      if (note && lastLoadedNoteRef.current !== selectedNoteId) {
        lastLoadedNoteRef.current = selectedNoteId;
        setNoteContentLoaded(false);
        setNoteLoading(true);
        loadNoteContent(note.fileName);
      }
    }
  }, [selectedNoteId, notesIndex.notes]);

  const loadNoteContent = async (fileName: string) => {
    try {
      const content = await dataService.readNote(projectPath, fileName);
      setNoteContent(content);
      setNoteContentLoaded(true);
    } catch (err) {
      addToast('Couldn\u2019t open note');
      setNoteContent('<p></p>');
      setNoteContentLoaded(true);
    } finally {
      setNoteLoading(false);
    }
  };

  const handleCreateNote = useCallback(async (parentId?: string) => {
    const id = Math.random().toString(36).substring(2, 11);
    // In SQLite mode the note's id IS the DB row key, and fileName is the read
    // key — they MUST be identical, or saveNotesIndex's getNote(meta.id) misses
    // the row createNote made (keyed by fileName) and silently skips the update,
    // so title/parentId never persist. (loadNotesIndex sets id === fileName ===
    // row.id, so this matches the reloaded shape.)
    const fileName = id;

    // Calculate order: place at end of siblings
    const siblings = indexRef.current.notes.filter(n =>
      parentId ? n.parentId === parentId : !n.parentId
    );
    const maxOrder = siblings.reduce((max, n) => Math.max(max, n.order ?? 0), -1);

    const newNote: NoteMetadata = {
      id,
      title: 'Untitled',
      fileName,
      parentId: parentId || null,
      order: maxOrder + 1,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      outgoingLinks: [],
      sceneLinks: [],
    };

    try {
      await dataService.createNote(projectPath, fileName);
      const newIndex: NotesIndex = {
        ...indexRef.current,
        notes: [...indexRef.current.notes, newNote],
        version: 2,
      };
      await saveIndex(newIndex);
      setSelectedNoteId(id);
      setNoteContent('<p></p>');
      track('note_created');
    } catch (err) {
      addToast('Couldn\u2019t create note');
    }
  }, [projectPath, saveIndex]);

  const handleArchiveNote = useCallback(async (noteId: string) => {
    const note = indexRef.current.notes.find(n => n.id === noteId);
    if (!note) return;

    // Get all descendants
    const descendantIds = getAllDescendantIds(indexRef.current.notes, noteId);
    const totalCount = 1 + descendantIds.length;

    const message = totalCount > 1
      ? `Archive "${note.title}" and ${descendantIds.length} sub-note${descendantIds.length !== 1 ? 's' : ''}? You can restore from the Archive panel.`
      : `Archive "${note.title}"? You can restore it from the Archive panel.`;

    const confirmed = window.confirm(message);
    if (!confirmed) return;

    const allIdsToArchive = [noteId, ...descendantIds];

    try {
      // Read content for each note and build archive entries
      const archivedEntries: ArchivedNote[] = [];
      for (const id of allIdsToArchive) {
        const n = indexRef.current.notes.find(nn => nn.id === id);
        if (!n) continue;
        let content = '<p></p>';
        try {
          content = await dataService.readNote(projectPath, n.fileName);
        } catch {}
        archivedEntries.push({
          id: n.id,
          title: n.title,
          content,
          parentId: n.parentId,
          tags: n.tags || [],
          outgoingLinks: n.outgoingLinks,
          sceneLinks: n.sceneLinks,
          archivedAt: Date.now(),
          originalMetadata: {
            order: n.order,
            createdAt: n.createdAt,
            modifiedAt: n.modifiedAt,
          },
        });
      }

      // Delete files from disk
      for (const id of allIdsToArchive) {
        const n = indexRef.current.notes.find(nn => nn.id === id);
        if (n) {
          try {
            await dataService.deleteNote(projectPath, n.fileName);
          } catch {}
        }
      }

      const deleteSet = new Set(allIdsToArchive);
      const existingArchived = indexRef.current.archivedNotes || [];
      const newIndex: NotesIndex = {
        ...indexRef.current,
        notes: indexRef.current.notes.filter(n => !deleteSet.has(n.id)),
        archivedNotes: [...existingArchived, ...archivedEntries],
        version: 2,
      };
      await saveIndex(newIndex);
      if (deleteSet.has(selectedNoteId || '')) {
        setSelectedNoteId(null);
        setNoteContent('<p></p>');
      }
      track('note_archived', { count: allIdsToArchive.length });
    } catch (err) {
      addToast('Couldn\u2019t archive note');
    }
  }, [projectPath, selectedNoteId, saveIndex]);

  const handleRenameNote = useCallback(async (noteId: string, newTitle: string) => {
    const newIndex: NotesIndex = {
      ...indexRef.current,
      notes: indexRef.current.notes.map(n =>
        n.id === noteId
          ? { ...n, title: newTitle, modifiedAt: Date.now() }
          : n
      ),
      version: 2,
    };
    await saveIndex(newIndex);
  }, [saveIndex]);

  const handleTitleChange = useCallback((newTitle: string) => {
    if (!selectedNoteId) return;
    const newIndex: NotesIndex = {
      ...indexRef.current,
      notes: indexRef.current.notes.map(n =>
        n.id === selectedNoteId
          ? { ...n, title: newTitle, modifiedAt: Date.now() }
          : n
      ),
      version: 2,
    };
    saveIndex(newIndex);
  }, [selectedNoteId, saveIndex]);

  const handleContentChange = useCallback(async (content: string) => {
    if (!selectedNoteId) return;
    const note = indexRef.current.notes.find(n => n.id === selectedNoteId);
    if (!note) return;

    // Content is BlockNote JSON; we no longer derive links/tags by parsing it.
    // Preserve the note's existing outgoingLinks/sceneLinks/tags untouched.
    try {
      await dataService.saveNote(projectPath, note.fileName, content);
      const newIndex: NotesIndex = {
        ...indexRef.current,
        notes: indexRef.current.notes.map(n =>
          n.id === selectedNoteId
            ? { ...n, modifiedAt: Date.now() }
            : n
        ),
        version: 2,
      };
      await saveIndex(newIndex);
    } catch (err) {
      addToast('Couldn\u2019t save note');
    }
  }, [selectedNoteId, projectPath, saveIndex]);

  const handleMoveNote = useCallback(async (noteId: string, newParentId: string | null, newOrder: number) => {
    const note = indexRef.current.notes.find(n => n.id === noteId);
    if (!note) return;

    // Build new notes array with updated parentId, order, and re-ordered siblings
    let updatedNotes = indexRef.current.notes.map(n => {
      if (n.id === noteId) {
        return { ...n, parentId: newParentId, order: newOrder, modifiedAt: Date.now() };
      }
      return n;
    });

    // Re-order siblings at the new position to make room
    const newSiblings = updatedNotes
      .filter(n => (n.parentId ?? null) === (newParentId ?? null) && n.id !== noteId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Insert the moved note at the correct position
    newSiblings.splice(newOrder, 0, updatedNotes.find(n => n.id === noteId)!);

    // Re-assign sequential orders
    const orderMap: Record<string, number> = {};
    newSiblings.forEach((n, i) => { orderMap[n.id] = i; });

    updatedNotes = updatedNotes.map(n => {
      if (orderMap[n.id] !== undefined) {
        return { ...n, order: orderMap[n.id] };
      }
      return n;
    });

    const newIndex: NotesIndex = { ...indexRef.current, notes: updatedNotes, version: 2 };
    await saveIndex(newIndex);
  }, [saveIndex]);

  const handleNavigateNote = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
  }, []);

  const handleNoteTagsChange = useCallback(async (noteTags: string[]) => {
    if (!selectedNoteId) return;
    const newIndex: NotesIndex = {
      ...indexRef.current,
      notes: indexRef.current.notes.map(n =>
        n.id === selectedNoteId
          ? { ...n, tags: noteTags, modifiedAt: Date.now() }
          : n
      ),
      version: 2,
    };
    await saveIndex(newIndex);
  }, [selectedNoteId, saveIndex]);

  const selectedNote = notesIndex.notes.find(n => n.id === selectedNoteId);

  return (
    <div ref={notesViewRef} className="notes-view">
      {!sidebarCollapsed && (
        <>
          <NotesSidebar
            projectPath={projectPath}
            notes={notesIndex.notes}
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
            onCreateNote={handleCreateNote}
            onDeleteNote={handleArchiveNote}
            onRenameNote={handleRenameNote}
            onMoveNote={handleMoveNote}
            width={sidebarWidth}
          />
          <div className="notes-resize-handle" onMouseDown={(e) => handleResizeStart(e, 'sidebar')} />
        </>
      )}
      <div className={`notes-main notes-width-${notesWidthMode} notes-size-${notesSizeMode}`}>
        <div className="notes-panel-toggles">
          <button className="notes-panel-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Show notes list' : 'Hide notes list'}>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <rect x="0.75" y="0.75" width="16.5" height="12.5" rx="2.25" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="5.5" y1="0.75" x2="5.5" y2="13.25" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          <div className="notes-panel-toggle-spacer" />
          <div className="notes-width-toggle" aria-label="Note width">
            {NOTES_WIDTH_MODES.map(mode => (
              <button
                key={mode}
                className={`notes-width-toggle-btn${notesWidthMode === mode ? ' active' : ''}`}
                onClick={() => setNotesWidthMode(mode)}
                title={`${mode.charAt(0).toUpperCase()}${mode.slice(1)} note width`}
                aria-pressed={notesWidthMode === mode}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="notes-size-toggle" aria-label="Text size">
            {NOTES_SIZE_MODES.map(mode => (
              <button
                key={mode}
                className={`notes-size-toggle-btn${notesSizeMode === mode ? ' active' : ''}`}
                onClick={() => setNotesSizeMode(mode)}
                title={`${mode.charAt(0).toUpperCase()}${mode.slice(1)} text size`}
                aria-pressed={notesSizeMode === mode}
              >
                {mode.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {selectedNote && noteContentLoaded ? (
          <NoteEditor
            noteId={selectedNote.id}
            fontSettings={resolvedNotesFontSettings}
            title={selectedNote.title}
            content={noteContent}
            projectPath={projectPath}
            allNotes={notesIndex.notes}
            scenes={scenes}
            characters={characters}
            tags={selectedNote.tags || []}
            allTags={tags}
            onTitleChange={handleTitleChange}
            onContentChange={handleContentChange}
            onNavigateNote={handleNavigateNote}
            onTagsChange={handleNoteTagsChange}
          />
        ) : selectedNote && noteLoading ? (
          <div className="notes-empty-state"><div className="notes-empty-state-content">Loading...</div></div>
        ) : (
          <div className="notes-empty-state">
            <div className="notes-empty-state-content">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M16 16h16M16 22h12M16 28h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <h3>No note selected</h3>
              <p>Select a note from the sidebar or create a new one</p>
              <button className="notes-empty-state-btn" onClick={() => handleCreateNote()}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Create Note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
