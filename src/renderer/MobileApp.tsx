import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Scene, ProjectData, BraidedChapter, SceneComment, DraftVersion, NotesIndex } from '../shared/types';
import { dataService } from './services/dataService';
import { detectConflicts } from './services/conflictDetector';
import EditorView from './components/EditorView';
import RailsView from './components/RailsView';
import SceneCard from './components/SceneCard';
import PlotPointSection from './components/PlotPointSection';
import NotesView from './components/notes/NotesView';
import { MobileView } from './components/MobileSidebar';

export function MobileApp() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);

  const [draftContent, setDraftContent] = useState<Record<string, string>>({});
  const draftContentRef = useRef<Record<string, string>>({});
  const [scratchpadContent, setScratchpadContent] = useState<Record<string, string>>({});
  const scratchpadContentRef = useRef<Record<string, string>>({});
  const [sceneComments, setSceneComments] = useState<Record<string, SceneComment[]>>({});
  const sceneCommentsRef = useRef<Record<string, SceneComment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftVersion[]>>({});
  const draftsRef = useRef<Record<string, DraftVersion[]>>({});

  const [sceneConnections, setSceneConnections] = useState<Record<string, string[]>>({});
  const [braidedChapters, setBraidedChapters] = useState<BraidedChapter[]>([]);
  const [characterColors, setCharacterColors] = useState<Record<string, string>>({});
  const characterColorsRef = useRef<Record<string, string>>({});

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [editingSceneKey, setEditingSceneKey] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<MobileView>('pov');
  const [notesIndex, setNotesIndex] = useState<NotesIndex | null>(null);
  const isDirtyRef = useRef(false);
  const editorViewRef = useRef<any>(null);

  // ── Project loading ───────────────────────────────────────────────────────
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
      setDraftContent(data.draftContent || {});
      draftContentRef.current = data.draftContent || {};
      setScratchpadContent(data.scratchpad || {});
      scratchpadContentRef.current = data.scratchpad || {};
      setSceneComments(data.sceneComments || {});
      sceneCommentsRef.current = data.sceneComments || {};
      setDrafts(data.drafts || {});
      draftsRef.current = data.drafts || {};

      if (data.characters.length > 0) setSelectedCharacterId(data.characters[0].id);

      try {
        const idx = await dataService.loadNotesIndex(folderPath);
        setNotesIndex(idx);
      } catch (_e) { /* Notes may not exist yet */ }

      await dataService.addRecentProject({
        name, path: folderPath, lastOpened: Date.now(),
        characterCount: data.characters.length, sceneCount: data.scenes.length,
      });

      try {
        const files = await dataService.listProjectFiles?.(folderPath) || [];
        const conflicts = detectConflicts(files, folderPath);
        if (conflicts.length > 0) {
          setConflictBanner(`Sync conflicts detected: ${conflicts.length} file(s) were edited on both devices`);
        }
      } catch (_e) { /* Non-critical */ }
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

  // Simulator demo loader
  const loadDemoProject = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const demoPath = 'demo-project';
      await Filesystem.writeFile({ path: `${demoPath}/frodo.md`, directory: Directory.Documents, data: '---\ncharacter: Frodo\n---\n\n## The Shire (2)\n1. A Long-Expected Party. Bilbo\'s 111th birthday party. #the_shire\n2. The Shadow of the Past. Gandalf reveals the Ring\'s true nature. #gandalf\n', encoding: Encoding.UTF8, recursive: true });
      await Filesystem.writeFile({ path: `${demoPath}/aragorn.md`, directory: Directory.Documents, data: '---\ncharacter: Aragorn\n---\n\n## The Ranger (2)\n1. Strider Revealed. At the Prancing Pony in Bree. #bree\n2. Weathertop. Aragorn defends the hobbits. #weathertop\n', encoding: Encoding.UTF8, recursive: true });
      await Filesystem.writeFile({ path: `${demoPath}/timeline.json`, directory: Directory.Documents, data: JSON.stringify({ positions: {}, connections: {} }, null, 2), encoding: Encoding.UTF8, recursive: true });
      const uri = await Filesystem.getUri({ path: demoPath, directory: Directory.Documents });
      const resolvedPath = decodeURIComponent(uri.uri.replace('file://', ''));
      await loadProjectFromPath(resolvedPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [loadProjectFromPath]);

  // ── Save handlers ─────────────────────────────────────────────────────────
  const handleDraftChange = useCallback(async (sceneKey: string, html: string) => {
    isDirtyRef.current = true;
    const updated = { ...draftContentRef.current, [sceneKey]: html };
    setDraftContent(updated);
    draftContentRef.current = updated;
    if (projectData?.projectPath) {
      try { await dataService.saveDraft(projectData.projectPath, sceneKey, html); }
      catch (err) { console.error('Failed to save draft:', err); }
    }
  }, [projectData]);

  const handleScratchpadChange = useCallback((sceneKey: string, html: string) => {
    isDirtyRef.current = true;
    const updated = { ...scratchpadContentRef.current, [sceneKey]: html };
    setScratchpadContent(updated);
    scratchpadContentRef.current = updated;
    if (projectData?.projectPath) {
      dataService.saveScratchpad(projectData.projectPath, sceneKey, html).catch(console.error);
    }
  }, [projectData]);

  const handleAddComment = useCallback((sceneKey: string, text: string) => {
    isDirtyRef.current = true;
    const existing = sceneCommentsRef.current[sceneKey] || [];
    const comment: SceneComment = { id: Math.random().toString(36).substring(2, 11), text, createdAt: Date.now() };
    const updated = { ...sceneCommentsRef.current, [sceneKey]: [comment, ...existing] };
    setSceneComments(updated);
    sceneCommentsRef.current = updated;
    if (projectData?.projectPath) {
      dataService.saveSceneComments(projectData.projectPath, sceneKey, updated[sceneKey]).catch(console.error);
    }
  }, [projectData]);

  const handleDeleteComment = useCallback((sceneKey: string, commentId: string) => {
    isDirtyRef.current = true;
    const existing = sceneCommentsRef.current[sceneKey] || [];
    const updated = { ...sceneCommentsRef.current, [sceneKey]: existing.filter(c => c.id !== commentId) };
    setSceneComments(updated);
    sceneCommentsRef.current = updated;
    if (projectData?.projectPath) {
      dataService.saveSceneComments(projectData.projectPath, sceneKey, updated[sceneKey]).catch(console.error);
    }
  }, [projectData]);

  const handleSaveDraft = useCallback(async (sceneKey: string, content: string) => {
    if (!content || content === '<p></p>') return;
    const existing = draftsRef.current[sceneKey] || [];
    const newVersion: DraftVersion = { version: existing.length + 1, content, savedAt: Date.now() };
    const updated = { ...draftsRef.current, [sceneKey]: [...existing, newVersion] };
    setDrafts(updated);
    draftsRef.current = updated;
    if (projectData?.projectPath) {
      dataService.saveDraftVersions(projectData.projectPath, sceneKey, draftsRef.current[sceneKey]).catch(console.error);
    }
  }, [projectData]);

  const saveTimelineData = useCallback(async (scenes: Scene[], connections: Record<string, string[]>, chapters: BraidedChapter[]) => {
    const positions: Record<string, number> = {};
    const wordCounts: Record<string, number> = {};
    for (const scene of scenes) {
      if (scene.timelinePosition !== null) positions[scene.id] = scene.timelinePosition;
      if (scene.wordCount !== undefined) wordCounts[scene.id] = scene.wordCount;
    }
    try {
      await dataService.saveTimeline(positions, connections, chapters, characterColorsRef.current, wordCounts);
      isDirtyRef.current = false;
    } catch (err) { console.error('Failed to save timeline:', err); }
  }, []);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (projectData && isDirtyRef.current) {
        editorViewRef.current?.flush?.();
        saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [projectData, sceneConnections, braidedChapters, saveTimelineData]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && projectData && isDirtyRef.current) {
        editorViewRef.current?.flush?.();
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
    return projectData.scenes.filter(s => s.characterId === selectedCharacterId).sort((a, b) => a.sceneNumber - b.sceneNumber);
  }, [projectData, selectedCharacterId]);

  const characterPlotPoints = useMemo(() => {
    if (!projectData || !selectedCharacterId) return [];
    return projectData.plotPoints.filter(p => p.characterId === selectedCharacterId).sort((a, b) => a.order - b.order);
  }, [projectData, selectedCharacterId]);

  const braidedScenes = useMemo(() => {
    if (!projectData) return [];
    return projectData.scenes.filter(s => s.timelinePosition !== null).sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
  }, [projectData]);

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

  const handleAddScene = useCallback(async (plotPointId: string, afterSceneNumber?: number) => {
    if (!projectData || !selectedCharacterId) return;
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    let insertAfterIndex: number;
    if (afterSceneNumber !== undefined) {
      insertAfterIndex = charScenes.findIndex(s => s.sceneNumber === afterSceneNumber);
      if (insertAfterIndex === -1) insertAfterIndex = charScenes.length - 1;
    } else {
      const ppScenes = charScenes.filter(s => s.plotPointId === plotPointId);
      insertAfterIndex = ppScenes.length > 0
        ? charScenes.findIndex(s => s.id === ppScenes[ppScenes.length - 1].id)
        : charScenes.length - 1;
    }

    const characterTag = character.name.toLowerCase().replace(/\s+/g, '_');
    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: selectedCharacterId,
      sceneNumber: insertAfterIndex + 2,
      title: 'New scene',
      content: 'New scene',
      tags: [characterTag],
      timelinePosition: null,
      isHighlighted: false,
      notes: [],
      plotPointId,
    };

    const newCharScenes = [...charScenes];
    newCharScenes.splice(insertAfterIndex + 1, 0, newScene);
    newCharScenes.forEach((s, i) => { s.sceneNumber = i + 1; });

    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...newCharScenes];
    setProjectData({ ...projectData, scenes: updatedScenes });

    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, newCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
    } catch (err) {
      console.error('Failed to save after adding scene:', err);
    }
  }, [projectData, selectedCharacterId, sceneConnections, braidedChapters, saveTimelineData]);

  const openEditor = useCallback((sceneKey: string) => {
    setEditingSceneKey(sceneKey);
    setCurrentView('editor');
  }, []);

  const handleSceneChange = useCallback((sceneId: string, newContent: string, newNotes: string[]) => {
    if (!projectData) return;
    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    scene.content = newContent;
    scene.notes = newNotes;
    isDirtyRef.current = true;
    setProjectData({ ...projectData });
    const char = projectData.characters.find(c => c.id === scene.characterId);
    const plotPoints = projectData.plotPoints.filter(p => p.characterId === scene.characterId);
    const charScenes = projectData.scenes.filter(s => s.characterId === scene.characterId);
    if (char) dataService.saveCharacterOutline(char, plotPoints, charScenes).catch(console.error);
  }, [projectData]);

  // ── Welcome screen ────────────────────────────────────────────────────────
  if (!projectData) {
    return (
      <div className="mobile-safe-area-top" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-primary, #fff)', fontFamily: 'var(--font-ui)',
      }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Braidr</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Novel outlining for iPad</p>
        {error && <p style={{ color: '#C44D5E', marginBottom: 16, textAlign: 'center', maxWidth: 500, fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</p>}
        <button onClick={loadProject} disabled={loading} className="btn-primary" style={{ padding: '12px 32px', fontSize: 16, borderRadius: 8 }}>
          {loading ? 'Loading...' : 'Open Project'}
        </button>
        <button onClick={loadDemoProject} disabled={loading} style={{
          padding: '10px 24px', fontSize: 14, background: 'transparent', color: 'var(--accent)',
          border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', marginTop: 12,
        }}>
          Load Demo Project
        </button>
      </div>
    );
  }

  // ── View content renderer ─────────────────────────────────────────────────
  const renderContent = () => {
    if (currentView === 'editor') {
      return (
        <div className="main-content--editor">
          <EditorView
            ref={editorViewRef}
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
            onNotesChange={(sceneId: string, notes: string[]) => {
              const scene = projectData.scenes.find(s => s.id === sceneId);
              if (scene) handleSceneChange(sceneId, scene.content, notes);
            }}
            onSceneContentChange={(sceneId: string, newContent: string) => {
              const scene = projectData.scenes.find(s => s.id === sceneId);
              if (scene) handleSceneChange(sceneId, newContent, scene.notes);
            }}
            onCreateTag={() => {}}
            onWordCountChange={() => {}}
            initialSceneKey={editingSceneKey}
            onSceneSelect={(key: string) => setEditingSceneKey(key)}
            onGoToPov={() => setCurrentView('pov')}
            onGoToBraid={() => setCurrentView('rails')}
            scratchpad={scratchpadContent}
            onScratchpadChange={handleScratchpadChange}
            sceneComments={sceneComments}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onDeleteScene={() => {}}
            onDuplicateScene={() => {}}
          />
        </div>
      );
    }

    if (currentView === 'pov') {
      return (
        <div className="pov-layout">
          <div className="pov-content">
            {!selectedCharacter ? (
              <p style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>Select a character</p>
            ) : (
              <>
                {characterPlotPoints.map((pp, index) => (
                  <PlotPointSection
                    key={pp.id}
                    plotPoint={pp}
                    scenes={characterScenes.filter(s => s.plotPointId === pp.id)}
                    tags={projectData.tags}
                    onSceneChange={handleSceneChange}
                    onTagsChange={() => {}}
                    onCreateTag={() => {}}
                    onPlotPointChange={() => {}}
                    onDeletePlotPoint={() => {}}
                    onAddScene={handleAddScene}
                    onDeleteScene={() => {}}
                    onDuplicateScene={() => {}}
                    onMoveUp={() => {}}
                    onMoveDown={() => {}}
                    isFirst={index === 0}
                    isLast={index === characterPlotPoints.length - 1}
                    connectedScenes={getConnectedScenes}
                    onStartConnection={() => {}}
                    onRemoveConnection={() => {}}
                    isConnecting={false}
                    onWordCountChange={() => {}}
                    onOpenInEditor={openEditor}
                    metadataFieldDefs={[]}
                    sceneMetadata={{}}
                    onMetadataChange={() => {}}
                  />
                ))}
                {characterScenes
                  .filter(s => !s.plotPointId || !characterPlotPoints.some(pp => pp.id === s.plotPointId))
                  .map(scene => (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      tags={projectData.tags}
                      showCharacter={false}
                      characterName={selectedCharacter.name}
                      displayNumber={scene.sceneNumber}
                      onSceneChange={handleSceneChange}
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
                      onWordCountChange={() => {}}
                    />
                  ))}
              </>
            )}
          </div>
        </div>
      );
    }

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
          onSceneChange={handleSceneChange}
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

    if (currentView === 'notes') {
      return (
        <div className="main-content--notes">
          <NotesView
            projectPath={projectData.projectPath}
            scenes={projectData.scenes}
            characters={projectData.characters}
            tags={projectData.tags}
          />
        </div>
      );
    }

    return null;
  };

  // ── Main layout: reuse desktop CSS classes ────────────────────────────────
  return (
    <div className="app mobile-safe-area-top">
      {/* Left sidebar — reuses .app-sidebar styling */}
      <div className="app-sidebar" style={{
        position: 'relative', padding: '12px 0',
        width: 58, /* fixed on iPad, no hover-expand */
      }}>
        {(['pov', 'editor', 'rails', 'notes'] as MobileView[]).map(view => (
          <button
            key={view}
            className={`app-sidebar-btn ${currentView === view ? 'active' : ''}`}
            onClick={() => setCurrentView(view)}
          >
            <span style={{ fontSize: 11, fontWeight: 600 }}>
              {view === 'pov' ? 'POV' : view === 'editor' ? 'Edit' : view === 'rails' ? 'Rails' : 'Notes'}
            </span>
          </button>
        ))}
      </div>

      {/* Main content area */}
      <div className="app-body">
        {/* Toolbar */}
        <div className="app-toolbar">
          <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{projectData.projectName}</span>
            {currentView === 'pov' && (
              <select
                value={selectedCharacterId || ''}
                onChange={(e) => setSelectedCharacterId(e.target.value || null)}
                style={{ padding: '4px 8px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }}
              >
                {projectData.characters.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="toolbar-right" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {projectData.characters.length} characters &middot; {projectData.scenes.length} scenes
          </div>
        </div>

        {/* Conflict banner */}
        {conflictBanner && (
          <div style={{
            background: '#fef3c7', color: '#92400e', padding: '8px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid #fcd34d',
          }}>
            <span>{conflictBanner}</span>
            <button onClick={() => setConflictBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#92400e' }}>✕</button>
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
