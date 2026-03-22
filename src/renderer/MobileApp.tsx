import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Scene, ProjectData, BraidedChapter, SceneComment, DraftVersion, NotesIndex } from '../shared/types';
import { dataService } from './services/dataService';
import { detectConflicts } from './services/conflictDetector';
import EditorView from './components/EditorView';
import RailsView from './components/RailsView';
import SceneCard from './components/SceneCard';
import NotesView from './components/notes/NotesView';
import { MobileView } from './components/MobileSidebar';
import { Tag, TagCategory, PlotPoint } from '../shared/types';

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

  // ── Notes state ────────────────────────────────────────────────────────────
  const [notesIndex, setNotesIndex] = useState<NotesIndex | null>(null);

  // ── Auto-save bookkeeping ──────────────────────────────────────────────────
  const isDirtyRef = useRef(false);

  // ── Project loading ────────────────────────────────────────────────────────
  const loadProjectFromPath = useCallback(async (folderPath: string) => {
    try {
      setLoading(true);
      setError(null);

      const data = await dataService.loadProject(folderPath);
      const name = folderPath.split('/').pop() || 'Untitled';

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
      setScratchpadContent(data.scratchpad || {});
      scratchpadContentRef.current = data.scratchpad || {};
      setSceneComments(data.sceneComments || {});
      sceneCommentsRef.current = data.sceneComments || {};
      setDrafts(data.drafts || {});
      draftsRef.current = data.drafts || {};

      if (data.characters.length > 0) {
        setSelectedCharacterId(data.characters[0].id);
      }

      try {
        const idx = await dataService.loadNotesIndex(folderPath);
        setNotesIndex(idx);
      } catch (_e) {
        // Notes may not exist yet
      }

      await dataService.addRecentProject({
        name,
        path: folderPath,
        lastOpened: Date.now(),
        characterCount: data.characters.length,
        sceneCount: data.scenes.length,
      });

      try {
        const files = await dataService.listProjectFiles?.(folderPath) || [];
        const conflicts = detectConflicts(files, folderPath);
        if (conflicts.length > 0) {
          setConflictBanner(`Sync conflicts detected: ${conflicts.length} file(s) were edited on both devices`);
        }
      } catch (_e) {
        // Non-critical
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProject = useCallback(async () => {
    try {
      const folderPath = await dataService.selectProjectFolder();
      if (!folderPath) return;
      await loadProjectFromPath(folderPath);
    } catch (err: any) {
      setError(err.message || 'Failed to open project');
      setLoading(false);
    }
  }, [loadProjectFromPath]);

  // Dev-only: auto-load demo project when previewing via ?mobile
  useEffect(() => {
    if (window.location.search.includes('mobile') && !projectData && !loading) {
      loadProjectFromPath('/Users/brian/braidr/demo-project').catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load demo project');
      });
    }
  }, [loadProjectFromPath, projectData, loading]);

  // ── Save handlers ──────────────────────────────────────────────────────────
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
      if (scene.timelinePosition !== null) positions[scene.id] = scene.timelinePosition;
      if (scene.wordCount !== undefined) wordCounts[scene.id] = scene.wordCount;
    }
    try {
      await dataService.saveTimeline(positions, connections, chapters, characterColorsRef.current, wordCounts);
      isDirtyRef.current = false;
    } catch (err) {
      console.error('Failed to save timeline data:', err);
    }
  }, []);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (projectData && isDirtyRef.current) {
        saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [projectData, sceneConnections, braidedChapters, saveTimelineData]);

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

  // ── RailsView helpers ─────────────────────────────────────────────────────
  const getCharacterName = useCallback((characterId: string) => {
    return projectData?.characters.find(c => c.id === characterId)?.name || '';
  }, [projectData]);

  const getConnectedScenes = useCallback((sceneId: string) => {
    const connected = sceneConnections[sceneId] || [];
    return connected.map(id => {
      const s = projectData?.scenes.find(sc => sc.id === id);
      const charName = s ? getCharacterName(s.characterId) : '';
      return { id, label: s ? `${charName} ${s.sceneNumber}` : id };
    });
  }, [sceneConnections, projectData, getCharacterName]);

  const unbraidedScenesByCharacter = useMemo(() => {
    if (!projectData) return new Map();
    const map = new Map<string, Map<string, Scene[]>>();
    for (const scene of projectData.scenes) {
      if (scene.timelinePosition !== null) continue;
      if (!map.has(scene.characterId)) map.set(scene.characterId, new Map());
      const charMap = map.get(scene.characterId)!;
      const ppId = scene.plotPointId || '__none__';
      if (!charMap.has(ppId)) charMap.set(ppId, []);
      charMap.get(ppId)!.push(scene);
    }
    return map;
  }, [projectData]);

  const handleDragStart = useCallback((_e: React.DragEvent, _scene: Scene) => {}, []);
  const handleDragEnd = useCallback(() => {}, []);
  const handleDropOnTimeline = useCallback((_e: React.DragEvent | null, _targetIndex: number) => {}, []);
  const handleDropOnInbox = useCallback((_e: React.DragEvent | null) => {}, []);
  const handleRailReorder = useCallback((_from: number, _to: number) => {}, []);

  // ── Navigation ────────────────────────────────────────────────────────────
  const openEditor = useCallback((sceneKey: string) => {
    setEditingSceneKey(sceneKey);
    setCurrentView('editor');
  }, []);

  // ── Welcome screen ────────────────────────────────────────────────────────
  if (!projectData) {
    return (
      <div className="mobile-safe-area-top" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#1a1a2e', color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif', padding: 20,
      }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Braidr</h1>
        <p style={{ color: '#888', marginBottom: 24 }}>Novel outlining for iPad</p>
        {error && <p style={{ color: '#e57373', marginBottom: 16, textAlign: 'center' }}>{error}</p>}
        <button
          onClick={loadProject}
          disabled={loading}
          style={{
            padding: '12px 32px', fontSize: 16, background: '#4a90d9', color: '#fff',
            border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Open Project'}
        </button>
      </div>
    );
  }

  // ── Render content per view ────────────────────────────────────────────────
  const renderContent = () => {
    // ── Editor: full EditorView with its own scene sidebar ──
    if (currentView === 'editor') {
      return (
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
      );
    }

    // ── POV: character's scenes grouped by plot points ──
    if (currentView === 'pov') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Character selector */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={selectedCharacterId || ''}
              onChange={(e) => setSelectedCharacterId(e.target.value || null)}
              style={{
                padding: '6px 10px', background: '#2a2a3e', color: '#e0e0e0',
                border: '1px solid #444', borderRadius: 6, fontSize: 14,
              }}
            >
              {projectData.characters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span style={{ color: '#666', fontSize: 12 }}>
              {characterScenes.length} scenes
            </span>
          </div>

          {/* Scene cards */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
            {characterPlotPoints.map(pp => {
              const ppScenes = characterScenes.filter(s => s.plotPointId === pp.id);
              return (
                <div key={pp.id} style={{ marginBottom: 24 }}>
                  <h3 style={{
                    fontSize: 14, color: '#aaa', fontWeight: 600, marginBottom: 4,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {pp.title}
                    {pp.expectedSceneCount !== null && (
                      <span style={{ color: '#666', fontWeight: 400 }}> ({ppScenes.length}/{pp.expectedSceneCount})</span>
                    )}
                  </h3>
                  {pp.description && (
                    <p style={{ fontSize: 13, color: '#777', marginBottom: 8, lineHeight: 1.4 }}>{pp.description}</p>
                  )}
                  {ppScenes.map(scene => (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      tags={projectData.tags}
                      showCharacter={false}
                      characterName={selectedCharacter?.name || ''}
                      displayNumber={scene.sceneNumber}
                      plotPointTitle={pp.title}
                      onSceneChange={() => {}}
                      onTagsChange={() => {}}
                      onCreateTag={() => {}}
                      onDeleteScene={() => {}}
                      onDuplicateScene={() => {}}
                      collapsedNotes={true}
                      connectedScenes={getConnectedScenes(scene.id)}
                      onStartConnection={() => {}}
                      onRemoveConnection={() => {}}
                      metadataFieldDefs={[]}
                      sceneMetadata={{}}
                      onMetadataChange={() => {}}
                      onOpenInEditor={() => openEditor(scene.id)}
                    />
                  ))}
                </div>
              );
            })}
            {/* Orphan scenes */}
            {characterScenes
              .filter(s => !s.plotPointId || !characterPlotPoints.some(pp => pp.id === s.plotPointId))
              .map(scene => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  tags={projectData.tags}
                  showCharacter={false}
                  characterName={selectedCharacter?.name || ''}
                  displayNumber={scene.sceneNumber}
                  onSceneChange={() => {}}
                  onTagsChange={() => {}}
                  onCreateTag={() => {}}
                  onDeleteScene={() => {}}
                  onDuplicateScene={() => {}}
                  collapsedNotes={true}
                  connectedScenes={getConnectedScenes(scene.id)}
                  onStartConnection={() => {}}
                  onRemoveConnection={() => {}}
                  metadataFieldDefs={[]}
                  sceneMetadata={{}}
                  onMetadataChange={() => {}}
                  onOpenInEditor={() => openEditor(scene.id)}
                />
              ))}
          </div>
        </div>
      );
    }

    // ── Rails: full RailsView (self-contained) ──
    if (currentView === 'rails') {
      return (
        <RailsView
          scenes={braidedScenes}
          characters={projectData.characters}
          characterColors={characterColors}
          connections={sceneConnections}
          showConnections={true}
          showPovColors={true}
          tags={projectData.tags}
          getCharacterName={getCharacterName}
          onSceneChange={() => {}}
          onTagsChange={() => {}}
          onCreateTag={() => {}}
          onWordCountChange={() => {}}
          isConnecting={false}
          connectionSource={null}
          onStartConnection={() => {}}
          onCompleteConnection={() => {}}
          onCancelConnection={() => {}}
          onRemoveConnection={() => {}}
          getConnectedScenes={getConnectedScenes}
          unbraidedScenesByCharacter={unbraidedScenesByCharacter}
          allCharacters={projectData.characters}
          plotPoints={projectData.plotPoints}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnTimeline={handleDropOnTimeline}
          onDropOnInbox={handleDropOnInbox}
          onRailReorder={handleRailReorder}
          draftContent={draftContent}
          onDraftChange={handleDraftChange}
          onOpenInEditor={openEditor}
        />
      );
    }

    // ── Notes: full NotesView (self-contained) ──
    if (currentView === 'notes') {
      return (
        <NotesView
          projectPath={projectData.projectPath}
          scenes={projectData.scenes}
          characters={projectData.characters}
          tags={projectData.tags}
        />
      );
    }

    return null;
  };

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div className="mobile-safe-area-top" style={{
      display: 'flex', height: '100vh', width: '100vw',
      background: '#1a1a2e', color: '#e0e0e0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden', boxSizing: 'border-box',
    }}>
      {/* View tab bar */}
      <div style={{
        width: 56, borderRight: '1px solid #333',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 8, gap: 2, flexShrink: 0,
      }}>
        {(['pov', 'editor', 'rails', 'notes'] as MobileView[]).map(view => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            style={{
              width: 46, padding: '10px 0',
              background: currentView === view ? '#3a3a5a' : 'transparent',
              color: currentView === view ? '#7c9ef5' : '#666',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            }}
          >
            {view === 'pov' ? 'POV' : view === 'editor' ? 'Edit' : view === 'rails' ? 'Rails' : 'Notes'}
          </button>
        ))}
      </div>

      {/* Content area — each view manages its own layout */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Project header */}
        <div style={{
          padding: '6px 16px', borderBottom: '1px solid #333',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          minHeight: 36, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{projectData.projectName}</span>
          <span style={{ fontSize: 12, color: '#666' }}>
            {projectData.characters.length} characters &middot; {projectData.scenes.length} scenes
          </span>
        </div>

        {/* Sync conflict banner */}
        {conflictBanner && (
          <div style={{
            background: '#fef3c7', color: '#92400e', padding: '8px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid #fcd34d', flexShrink: 0,
          }}>
            <span>{conflictBanner}</span>
            <button onClick={() => setConflictBanner(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#92400e' }}>
              ✕
            </button>
          </div>
        )}

        {/* View content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
