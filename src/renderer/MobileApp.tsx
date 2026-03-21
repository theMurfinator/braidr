import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Scene, ProjectData, BraidedChapter, SceneComment, DraftVersion, NotesIndex } from '../shared/types';
import { dataService } from './services/dataService';
import { detectConflicts } from './services/conflictDetector';
import EditorView from './components/EditorView';
import MobileSidebar, { MobileView } from './components/MobileSidebar';

export function MobileApp() {
  // ── Project data ───────────────────────────────────────────────────────────
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);

  // ── Per-scene content (mirrors App.tsx state+ref pattern) ──────────────────
  const [draftContent, setDraftContent] = useState<Record<string, string>>({});
  const draftContentRef = useRef<Record<string, string>>({});
  const [scratchpadContent, setScratchpadContent] = useState<Record<string, string>>({});
  const scratchpadContentRef = useRef<Record<string, string>>({});
  const [sceneComments, setSceneComments] = useState<Record<string, SceneComment[]>>({});
  const sceneCommentsRef = useRef<Record<string, SceneComment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftVersion[]>>({});
  const draftsRef = useRef<Record<string, DraftVersion[]>>({});

  // ── Braided / timeline state ───────────────────────────────────────────────
  const [sceneConnections, setSceneConnections] = useState<Record<string, string[]>>({});
  const [braidedChapters, setBraidedChapters] = useState<BraidedChapter[]>([]);
  const [characterColors, setCharacterColors] = useState<Record<string, string>>({});
  const characterColorsRef = useRef<Record<string, string>>({});

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [editingSceneKey, setEditingSceneKey] = useState<string | null>(null);

  // ── View state ─────────────────────────────────────────────────────────────
  const [currentView, setCurrentView] = useState<MobileView>('pov');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Notes state (placeholder for future wiring) ────────────────────────────
  const [notesIndex, setNotesIndex] = useState<NotesIndex | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  // noteContent state will be used when Notes view is fully wired up

  // ── Auto-save bookkeeping ──────────────────────────────────────────────────
  const isDirtyRef = useRef(false);

  // scenePositions will be used when timeline drag interactions are added

  // ── Project loading ────────────────────────────────────────────────────────
  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const folderPath = await dataService.selectProjectFolder();
      if (!folderPath) {
        setLoading(false);
        return;
      }

      const data = await dataService.loadProject(folderPath);
      const name = folderPath.split('/').pop() || 'Untitled';

      // Set timeline state
      setSceneConnections(data.connections);
      setBraidedChapters(data.chapters);
      const loadedColors = data.characterColors || {};
      setCharacterColors(loadedColors);
      characterColorsRef.current = loadedColors;

      // Renumber scenes per character
      const byChar: Record<string, Scene[]> = {};
      for (const s of data.scenes) {
        if (!byChar[s.characterId]) byChar[s.characterId] = [];
        byChar[s.characterId].push(s);
      }
      for (const charScenes of Object.values(byChar)) {
        charScenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
        charScenes.forEach((s, i) => { s.sceneNumber = i + 1; });
      }

      setProjectData({ ...data, projectName: name });

      // Load per-scene content
      const loadedDraft = data.draftContent || {};
      setDraftContent(loadedDraft);
      draftContentRef.current = loadedDraft;
      const loadedScratchpad = data.scratchpad || {};
      setScratchpadContent(loadedScratchpad);
      scratchpadContentRef.current = loadedScratchpad;
      const loadedComments = data.sceneComments || {};
      setSceneComments(loadedComments);
      sceneCommentsRef.current = loadedComments;
      const loadedDrafts = data.drafts || {};
      setDrafts(loadedDrafts);
      draftsRef.current = loadedDrafts;

      // Select first character
      if (data.characters.length > 0) {
        setSelectedCharacterId(data.characters[0].id);
      }

      // Load notes index
      try {
        const idx = await dataService.loadNotesIndex(folderPath);
        setNotesIndex(idx);
      } catch {
        // Notes may not exist yet
      }

      // Add to recent projects
      await dataService.addRecentProject({
        name,
        path: folderPath,
        lastOpened: Date.now(),
        characterCount: data.characters.length,
        sceneCount: data.scenes.length,
      });

      // Detect sync conflict files (iCloud / Dropbox)
      try {
        const files = await dataService.listProjectFiles?.(folderPath) || [];
        const conflicts = detectConflicts(files, folderPath);
        if (conflicts.length > 0) {
          setConflictBanner(`Sync conflicts detected: ${conflicts.length} file(s) were edited on both devices`);
        }
      } catch {
        // Non-critical — don't block project load
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Save handlers (same patterns as App.tsx) ──────────────────────────────
  const handleDraftChange = useCallback(async (sceneKey: string, html: string) => {
    isDirtyRef.current = true;
    const updated = { ...draftContentRef.current, [sceneKey]: html };
    setDraftContent(updated);
    draftContentRef.current = updated;

    if (projectData?.projectPath) {
      try {
        await dataService.saveDraft(projectData.projectPath, sceneKey, html);
      } catch (err) {
        console.error('Failed to save draft:', err);
      }
    }
  }, [projectData]);

  const handleScratchpadChange = useCallback((sceneKey: string, html: string) => {
    isDirtyRef.current = true;
    const updated = { ...scratchpadContentRef.current, [sceneKey]: html };
    setScratchpadContent(updated);
    scratchpadContentRef.current = updated;

    if (projectData?.projectPath) {
      dataService.saveScratchpad(projectData.projectPath, sceneKey, html)
        .catch(err => console.error('Failed to save scratchpad:', err));
    }
  }, [projectData]);

  const handleAddComment = useCallback((sceneKey: string, text: string) => {
    isDirtyRef.current = true;
    const existing = sceneCommentsRef.current[sceneKey] || [];
    const comment: SceneComment = {
      id: Math.random().toString(36).substring(2, 11),
      text,
      createdAt: Date.now(),
    };
    const updated = { ...sceneCommentsRef.current, [sceneKey]: [comment, ...existing] };
    setSceneComments(updated);
    sceneCommentsRef.current = updated;

    if (projectData?.projectPath) {
      dataService.saveSceneComments(projectData.projectPath, sceneKey, updated[sceneKey])
        .catch(err => console.error('Failed to save comments:', err));
    }
  }, [projectData]);

  const handleDeleteComment = useCallback((sceneKey: string, commentId: string) => {
    isDirtyRef.current = true;
    const existing = sceneCommentsRef.current[sceneKey] || [];
    const updated = { ...sceneCommentsRef.current, [sceneKey]: existing.filter(c => c.id !== commentId) };
    setSceneComments(updated);
    sceneCommentsRef.current = updated;

    if (projectData?.projectPath) {
      dataService.saveSceneComments(projectData.projectPath, sceneKey, updated[sceneKey])
        .catch(err => console.error('Failed to save comments:', err));
    }
  }, [projectData]);

  const handleSaveDraft = useCallback(async (sceneKey: string, content: string) => {
    if (!content || content === '<p></p>') return;
    const existing = draftsRef.current[sceneKey] || [];
    const newVersion: DraftVersion = {
      version: existing.length + 1,
      content,
      savedAt: Date.now(),
    };
    const updated = { ...draftsRef.current, [sceneKey]: [...existing, newVersion] };
    setDrafts(updated);
    draftsRef.current = updated;

    if (projectData?.projectPath) {
      dataService.saveDraftVersions(projectData.projectPath, sceneKey, draftsRef.current[sceneKey])
        .catch(err => console.error('Failed to save draft versions:', err));
    }
  }, [projectData]);

  const saveTimelineData = useCallback(async (
    scenes: Scene[],
    connections: Record<string, string[]>,
    chapters: BraidedChapter[],
  ) => {
    const positions: Record<string, number> = {};
    const wordCounts: Record<string, number> = {};

    for (const scene of scenes) {
      if (scene.timelinePosition !== null) {
        positions[scene.id] = scene.timelinePosition;
      }
      if (scene.wordCount !== undefined) {
        wordCounts[scene.id] = scene.wordCount;
      }
    }

    try {
      await dataService.saveTimeline(
        positions, connections, chapters,
        characterColorsRef.current, wordCounts,
      );
      isDirtyRef.current = false;
    } catch (err) {
      console.error('Failed to save timeline data:', err);
    }
  }, []);

  // ── Auto-save: 10-second interval ─────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (projectData && isDirtyRef.current) {
        saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [projectData, sceneConnections, braidedChapters, saveTimelineData]);

  // ── Save on visibility change (iPad backgrounding) ────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && projectData && isDirtyRef.current) {
        saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [projectData, sceneConnections, braidedChapters, saveTimelineData]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const selectedCharacter = useMemo(() => {
    if (!projectData || !selectedCharacterId) return null;
    return projectData.characters.find(c => c.id === selectedCharacterId) ?? null;
  }, [projectData, selectedCharacterId]);

  const characterScenes = useMemo(() => {
    if (!projectData || !selectedCharacterId) return [];
    return projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
  }, [projectData, selectedCharacterId]);

  const characterPlotPoints = useMemo(() => {
    if (!projectData || !selectedCharacterId) return [];
    return projectData.plotPoints
      .filter(p => p.characterId === selectedCharacterId)
      .sort((a, b) => a.order - b.order);
  }, [projectData, selectedCharacterId]);

  const braidedScenes = useMemo(() => {
    if (!projectData) return [];
    return projectData.scenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
  }, [projectData]);

  // ── Open editor for a scene ───────────────────────────────────────────────
  const openEditor = useCallback((sceneKey: string) => {
    setEditingSceneKey(sceneKey);
  }, []);

  const closeEditor = useCallback(() => {
    setEditingSceneKey(null);
  }, []);

  // ── Welcome screen (no project loaded) ────────────────────────────────────
  if (!projectData) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1a1a2e',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: 20,
      }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Braidr</h1>
        <p style={{ color: '#888', marginBottom: 24 }}>Novel outlining for iPad</p>
        {error && (
          <p style={{ color: '#e57373', marginBottom: 16, textAlign: 'center' }}>{error}</p>
        )}
        <button
          onClick={loadProject}
          disabled={loading}
          style={{
            padding: '12px 32px',
            fontSize: 16,
            background: '#4a90d9',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Open Project'}
        </button>
      </div>
    );
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderSidebarContent = () => {
    if (currentView === 'pov') {
      return (
        <div>
          {/* Character selector */}
          <div style={{ padding: '4px 12px 8px' }}>
            <select
              value={selectedCharacterId || ''}
              onChange={(e) => setSelectedCharacterId(e.target.value || null)}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: '#2a2a3e',
                color: '#e0e0e0',
                border: '1px solid #444',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {projectData.characters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Scene list for selected character */}
          {characterPlotPoints.map(pp => {
            const ppScenes = characterScenes.filter(s => s.plotPointId === pp.id);
            return (
              <div key={pp.id} style={{ marginBottom: 4 }}>
                <div style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  {pp.title}
                </div>
                {ppScenes.map(scene => (
                  <div
                    key={scene.id}
                    onClick={() => openEditor(scene.id)}
                    style={{
                      padding: '8px 12px 8px 20px',
                      fontSize: 13,
                      color: editingSceneKey === scene.id ? '#fff' : '#ccc',
                      background: editingSceneKey === scene.id ? '#3a3a5a' : 'transparent',
                      cursor: 'pointer',
                      borderLeft: editingSceneKey === scene.id ? '3px solid #4a90d9' : '3px solid transparent',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {scene.sceneNumber}. {scene.content.substring(0, 60)}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Scenes without a plot point */}
          {characterScenes.filter(s => !s.plotPointId || !characterPlotPoints.some(pp => pp.id === s.plotPointId)).length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div style={{
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Unassigned
              </div>
              {characterScenes
                .filter(s => !s.plotPointId || !characterPlotPoints.some(pp => pp.id === s.plotPointId))
                .map(scene => (
                  <div
                    key={scene.id}
                    onClick={() => openEditor(scene.id)}
                    style={{
                      padding: '8px 12px 8px 20px',
                      fontSize: 13,
                      color: editingSceneKey === scene.id ? '#fff' : '#ccc',
                      background: editingSceneKey === scene.id ? '#3a3a5a' : 'transparent',
                      cursor: 'pointer',
                      borderLeft: editingSceneKey === scene.id ? '3px solid #4a90d9' : '3px solid transparent',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {scene.sceneNumber}. {scene.content.substring(0, 60)}
                  </div>
                ))}
            </div>
          )}
        </div>
      );
    }

    if (currentView === 'rails') {
      return (
        <div style={{ padding: '12px 16px', color: '#888', fontSize: 13 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Rails View</p>
          {braidedScenes.map(scene => {
            const char = projectData.characters.find(c => c.id === scene.characterId);
            const color = characterColors[scene.characterId] || '#888';
            return (
              <div
                key={scene.id}
                onClick={() => openEditor(scene.id)}
                style={{
                  padding: '6px 8px',
                  fontSize: 13,
                  color: editingSceneKey === scene.id ? '#fff' : '#ccc',
                  background: editingSceneKey === scene.id ? '#3a3a5a' : 'transparent',
                  cursor: 'pointer',
                  borderLeft: `3px solid ${editingSceneKey === scene.id ? color : 'transparent'}`,
                  marginBottom: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span style={{ color, fontWeight: 600, marginRight: 6 }}>
                  {char?.name}
                </span>
                {scene.sceneNumber}. {scene.content.substring(0, 40)}
              </div>
            );
          })}
          {braidedScenes.length === 0 && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No braided scenes yet</p>
          )}
        </div>
      );
    }

    if (currentView === 'notes') {
      return (
        <div style={{ padding: '12px 16px', color: '#888', fontSize: 13 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Notes</p>
          {notesIndex && notesIndex.notes.length > 0 ? (
            notesIndex.notes
              .filter(n => !n.parentId)
              .sort((a, b) => a.order - b.order)
              .map(note => (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    color: selectedNoteId === note.id ? '#fff' : '#ccc',
                    background: selectedNoteId === note.id ? '#3a3a5a' : 'transparent',
                    borderLeft: selectedNoteId === note.id ? '3px solid #4a90d9' : '3px solid transparent',
                    marginBottom: 2,
                  }}
                >
                  {note.title}
                </div>
              ))
          ) : (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No notes yet</p>
          )}
        </div>
      );
    }

    return null;
  };

  const renderContent = () => {
    // Editor view takes precedence
    if (editingSceneKey && projectData) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Back button */}
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <button
              onClick={closeEditor}
              style={{
                background: 'none',
                border: 'none',
                color: '#4a90d9',
                fontSize: 14,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              &larr; Back
            </button>
            <span style={{ color: '#888', fontSize: 13 }}>
              {(() => {
                const scene = projectData.scenes.find(s => s.id === editingSceneKey);
                if (!scene) return '';
                const char = projectData.characters.find(c => c.id === scene.characterId);
                return `${char?.name} - Scene ${scene.sceneNumber}`;
              })()}
            </span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <EditorView
              scenes={projectData.scenes}
              characters={projectData.characters}
              plotPoints={projectData.plotPoints}
              tags={projectData.tags}
              characterColors={characterColors}
              draftContent={draftContent}
              drafts={drafts}
              sceneMetadata={{}}
              metadataFieldDefs={[]}
              onDraftChange={handleDraftChange}
              onSaveDraft={handleSaveDraft}
              onMetadataChange={() => {}}
              onMetadataFieldDefsChange={() => {}}
              onTagsChange={() => {}}
              onNotesChange={() => {}}
              onCreateTag={() => {}}
              onWordCountChange={() => {}}
              initialSceneKey={editingSceneKey}
              scratchpad={scratchpadContent}
              onScratchpadChange={handleScratchpadChange}
              sceneComments={sceneComments}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
            />
          </div>
        </div>
      );
    }

    // Default: show view-specific content
    if (currentView === 'pov') {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          padding: 40,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>
            {selectedCharacter ? `${selectedCharacter.name}'s Scenes` : 'Select a character'}
          </p>
          <p style={{ fontSize: 13, color: '#666' }}>
            Tap a scene in the sidebar to start writing
          </p>
        </div>
      );
    }

    if (currentView === 'rails') {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          padding: 40,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Rails View</p>
          <p style={{ fontSize: 13, color: '#666' }}>
            Tap a scene in the sidebar to open it in the editor
          </p>
        </div>
      );
    }

    if (currentView === 'notes') {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          padding: 40,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Notes View</p>
          <p style={{ fontSize: 13, color: '#666' }}>
            Select a note from the sidebar to view it
          </p>
        </div>
      );
    }

    return null;
  };

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      background: '#1a1a2e',
      color: '#e0e0e0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden',
    }}>
      <MobileSidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
      >
        {renderSidebarContent()}
      </MobileSidebar>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Project header */}
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 40,
        }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {projectData.projectName}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>
            {projectData.characters.length} characters &middot; {projectData.scenes.length} scenes
          </span>
        </div>

        {/* Sync conflict banner */}
        {conflictBanner && (
          <div style={{
            background: '#fef3c7', color: '#92400e', padding: '8px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid #fcd34d',
          }}>
            <span>{conflictBanner}</span>
            <button
              onClick={() => setConflictBanner(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Content area */}
        {renderContent()}
      </div>
    </div>
  );
}
