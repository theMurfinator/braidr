import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { Character, Scene, PlotPoint, Tag, TagCategory, ProjectData, BraidedChapter, RecentProject, ProjectTemplate, FontSettings, ArchivedScene, MetadataFieldDef, DraftVersion } from '../shared/types';
import EditorView from './components/EditorView';
import CompileModal from './components/CompileModal';
import { dataService } from './services/dataService';
import SceneCard from './components/SceneCard';
import PlotPointSection from './components/PlotPointSection';
import FilterBar from './components/FilterBar';
import TagManager from './components/TagManager';
import SceneDetailPanel from './components/SceneDetailPanel';
import CharacterManager from './components/CharacterManager';
import RailsView from './components/RailsView';
import FloatingEditor from './components/FloatingEditor';
import FontPicker from './components/FontPicker';
import { useHistory } from './hooks/useHistory';

type ViewMode = 'pov' | 'braided' | 'editor';
type BraidedSubMode = 'list' | 'rails';

function App() {
  const {
    state: projectData,
    set: setProjectData,
    undo: undoProjectData,
    redo: redoProjectData,
    canUndo,
    canRedo,
  } = useHistory<ProjectData | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('pov');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedScene, setDraggedScene] = useState<Scene | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showPovColors, setShowPovColors] = useState(true);
  const [allNotesExpanded, setAllNotesExpanded] = useState<boolean | null>(null);
  const [hideSectionHeaders, setHideSectionHeaders] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [sceneConnections, setSceneConnections] = useState<Record<string, string[]>>({});
  const [scenePositions, setScenePositions] = useState<Record<string, number>>({});
  const [braidedChapters, setBraidedChapters] = useState<BraidedChapter[]>([]);
  const [characterColors, setCharacterColors] = useState<Record<string, string>>({});
  const characterColorsRef = useRef<Record<string, string>>({});
  const fontSettingsRef = useRef<FontSettings>({});
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [canDragScene, setCanDragScene] = useState(false);
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [draggedChapter, setDraggedChapter] = useState<BraidedChapter | null>(null);
  const [addingChapterAtPosition, setAddingChapterAtPosition] = useState<number | null>(null);
  const [draggedPovScene, setDraggedPovScene] = useState<Scene | null>(null);
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontSettings, setFontSettings] = useState<FontSettings>({});
  const [braidedSubMode, setBraidedSubMode] = useState<BraidedSubMode>('list');
  const [showRailsConnections, setShowRailsConnections] = useState(true);
  const [listFloatingEditor, setListFloatingEditor] = useState<Scene | null>(null);
  const [listInboxCharFilter, setListInboxCharFilter] = useState<string>('all');
  const [editorInitialSceneKey, setEditorInitialSceneKey] = useState<string | null>(null);
  const lastEditorSceneKeyRef = useRef<string | null>(null);
  const scrollToSceneIdRef = useRef<string | null>(null);
  const [archivedScenes, setArchivedScenes] = useState<ArchivedScene[]>([]);
  const archivedScenesRef = useRef<ArchivedScene[]>([]);
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [draftContent, setDraftContent] = useState<Record<string, string>>({});
  const draftContentRef = useRef<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftVersion[]>>({});
  const draftsRef = useRef<Record<string, DraftVersion[]>>({});
  const [metadataFieldDefs, setMetadataFieldDefs] = useState<MetadataFieldDef[]>([]);
  const metadataFieldDefsRef = useRef<MetadataFieldDef[]>([]);
  const [sceneMetadata, setSceneMetadata] = useState<Record<string, Record<string, string | string[]>>>({});
  const sceneMetadataRef = useRef<Record<string, Record<string, string | string[]>>>({});
  const [showCompileModal, setShowCompileModal] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Welcome screen state
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectTemplate, setNewProjectTemplate] = useState<ProjectTemplate>('three-act');
  const [newProjectLocation, setNewProjectLocation] = useState<string | null>(null);

  // Load recent projects on mount
  useEffect(() => {
    const loadRecent = async () => {
      const projects = await dataService.getRecentProjects();
      setRecentProjects(projects);
    };
    loadRecent();
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'z') {
        // Don't interfere with input/textarea undo
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        e.preventDefault();
        if (e.shiftKey) {
          redoProjectData();
        } else {
          undoProjectData();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undoProjectData, redoProjectData]);

  // Scroll to scene after navigating from editor via POV/Braid buttons
  useEffect(() => {
    if (!scrollToSceneIdRef.current) return;
    const sceneId = scrollToSceneIdRef.current;
    scrollToSceneIdRef.current = null;
    // Brief delay to let the view render
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-scene-id="${sceneId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => clearTimeout(timer);
  }, [viewMode, selectedCharacterId]);

  const selectedCharacter = useMemo(() => {
    if (!projectData || !selectedCharacterId) return null;
    return projectData.characters.find(c => c.id === selectedCharacterId) || null;
  }, [projectData, selectedCharacterId]);

  // Get scenes for current view
  const displayedScenes = useMemo(() => {
    if (!projectData) return [];

    let scenes: Scene[];

    if (viewMode === 'pov' && selectedCharacterId) {
      // POV view: only scenes from selected character
      scenes = projectData.scenes.filter(s => s.characterId === selectedCharacterId);
      scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
    } else {
      // Braided view: only braided scenes (timelinePosition !== null)
      scenes = projectData.scenes.filter(s => s.timelinePosition !== null);
      scenes.sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
    }

    // Apply tag filters
    if (activeFilters.size > 0) {
      scenes = scenes.filter(scene =>
        scene.tags.some(tag => activeFilters.has(tag))
      );
    }

    return scenes;
  }, [projectData, viewMode, selectedCharacterId, activeFilters]);

  // Get unbraided scenes grouped by character and plot point
  const unbraidedScenesByCharacter = useMemo(() => {
    if (!projectData || viewMode !== 'braided') return new Map<string, Map<string, Scene[]>>();

    const grouped = new Map<string, Map<string, Scene[]>>();
    const unbraided = projectData.scenes.filter(s => s.timelinePosition === null);

    for (const scene of unbraided) {
      if (!grouped.has(scene.characterId)) {
        grouped.set(scene.characterId, new Map<string, Scene[]>());
      }
      const charMap = grouped.get(scene.characterId)!;
      const plotPointKey = scene.plotPointId || 'no-plot-point';
      if (!charMap.has(plotPointKey)) {
        charMap.set(plotPointKey, []);
      }
      charMap.get(plotPointKey)!.push(scene);
    }

    // Sort each plot point's scenes by scene number
    for (const [charId, plotPointMap] of grouped) {
      for (const [ppId, scenes] of plotPointMap) {
        scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
      }
    }

    return grouped;
  }, [projectData, viewMode]);

  // Get plot points for current character
  const displayedPlotPoints = useMemo(() => {
    if (!projectData || !selectedCharacterId || viewMode !== 'pov') return [];
    return projectData.plotPoints
      .filter(p => p.characterId === selectedCharacterId)
      .sort((a, b) => a.order - b.order);
  }, [projectData, selectedCharacterId, viewMode]);

  // Track custom rail order (character IDs in display order)
  const [railOrder, setRailOrder] = useState<string[]>([]);

  // Get all characters for rails view (up to 4), respecting custom order
  const railsDisplayCharacters = useMemo(() => {
    if (!projectData) return [];
    const allChars = projectData.characters.slice(0, 4);

    // If we have a custom order, use it
    if (railOrder.length > 0) {
      const ordered: Character[] = [];
      for (const charId of railOrder) {
        const char = allChars.find(c => c.id === charId);
        if (char) ordered.push(char);
      }
      // Add any new characters not in the order
      for (const char of allChars) {
        if (!ordered.find(c => c.id === char.id)) {
          ordered.push(char);
        }
      }
      return ordered;
    }

    return allChars;
  }, [projectData, railOrder]);

  const handleRailReorder = (fromIndex: number, toIndex: number) => {
    const newOrder = railsDisplayCharacters.map(c => c.id);
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    setRailOrder(newOrder);
  };

  // Helper to load a project from a path
  const loadProjectFromPath = async (folderPath: string, projectName?: string) => {
    const data = await dataService.loadProject(folderPath);

    // Derive project name from folder if not provided
    const name = projectName || folderPath.split('/').pop() || 'Untitled';

    // Convert stored connections (using keys) to scene IDs
    const loadedConnections: Record<string, string[]> = {};
    for (const [sourceKey, targetKeys] of Object.entries(data.connections)) {
      const sourceScene = data.scenes.find(s => `${s.characterId}:${s.sceneNumber}` === sourceKey);
      if (sourceScene) {
        const targetIds = targetKeys
          .map(targetKey => data.scenes.find(s => `${s.characterId}:${s.sceneNumber}` === targetKey)?.id)
          .filter((id): id is string => id !== undefined);
        if (targetIds.length > 0) {
          loadedConnections[sourceScene.id] = targetIds;
        }
      }
    }
    setSceneConnections(loadedConnections);
    setBraidedChapters(data.chapters);
    const loadedColors = data.characterColors || {};
    setCharacterColors(loadedColors);
    characterColorsRef.current = loadedColors;

    // Load font settings
    const loadedFonts = data.fontSettings || {};
    setFontSettings(loadedFonts);
    fontSettingsRef.current = loadedFonts;
    applyFontSettings(loadedFonts);

    // Load archived scenes
    const loadedArchived = data.archivedScenes || [];
    setArchivedScenes(loadedArchived);
    archivedScenesRef.current = loadedArchived;

    // Reconcile: remove scenes from parsed data that still exist in the markdown
    // but were already archived (can happen if iCloud syncs back old file versions).
    // Match by content + characterId since scene IDs are regenerated on each parse.
    if (loadedArchived.length > 0) {
      const archivedSet = new Set(
        loadedArchived.map((a: ArchivedScene) => `${a.characterId}::${a.content.trim()}`)
      );
      const beforeCount = data.scenes.length;
      data.scenes = data.scenes.filter(
        (s: Scene) => !archivedSet.has(`${s.characterId}::${s.content.trim()}`)
      );
      if (data.scenes.length < beforeCount) {
        // Re-renumber scenes per character
        const byChar: Record<string, Scene[]> = {};
        for (const s of data.scenes) {
          if (!byChar[s.characterId]) byChar[s.characterId] = [];
          byChar[s.characterId].push(s);
        }
        for (const charScenes of Object.values(byChar)) {
          charScenes.sort((a: Scene, b: Scene) => a.sceneNumber - b.sceneNumber);
          charScenes.forEach((s: Scene, i: number) => { s.sceneNumber = i + 1; });
        }
        console.log(`Removed ${beforeCount - data.scenes.length} archived scenes that persisted in markdown`);
      }
    }

    setProjectData({ ...data, projectName: name });

    // Load editor data
    const loadedDraft = data.draftContent || {};
    const loadedDrafts = data.drafts || {};
    const loadedMetaDefs = data.metadataFieldDefs || [];
    setMetadataFieldDefs(loadedMetaDefs);
    metadataFieldDefsRef.current = loadedMetaDefs;
    const loadedMetaData = data.sceneMetadata || {};

    // Reconcile scene-keyed data: remove orphaned keys that don't match any current scene.
    // This repairs data from the bug where archiving/reordering changed sceneNumbers
    // without updating the keys in draftContent/drafts/sceneMetadata.
    const validKeys = new Set(data.scenes.map((s: Scene) => `${s.characterId}:${s.sceneNumber}`));
    const allStoredKeys = new Set([
      ...Object.keys(loadedDraft),
      ...Object.keys(loadedDrafts),
      ...Object.keys(loadedMetaData),
    ]);
    const orphanedKeys = [...allStoredKeys].filter(k => !validKeys.has(k));
    if (orphanedKeys.length > 0) {
      for (const key of orphanedKeys) {
        delete loadedDraft[key];
        delete loadedDrafts[key];
        delete loadedMetaData[key];
      }
      console.log('Cleaned up orphaned scene keys:', orphanedKeys);
    }

    setSceneMetadata(loadedMetaData);
    sceneMetadataRef.current = loadedMetaData;
    setDraftContent(loadedDraft);
    draftContentRef.current = loadedDraft;
    setDrafts(loadedDrafts);
    draftsRef.current = loadedDrafts;

    // Select first character by default
    if (data.characters.length > 0) {
      setSelectedCharacterId(data.characters[0].id);
    }

    // Add to recent projects
    await dataService.addRecentProject({
      name,
      path: folderPath,
      lastOpened: Date.now(),
    });

    // Refresh recent projects list
    const projects = await dataService.getRecentProjects();
    setRecentProjects(projects);
  };

  const handleSelectFolder = async () => {
    try {
      setLoading(true);
      setError(null);

      const folderPath = await dataService.selectProjectFolder();
      if (!folderPath) {
        setLoading(false);
        return;
      }

      await loadProjectFromPath(folderPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRecentProject = async (project: RecentProject) => {
    try {
      setLoading(true);
      setError(null);
      await loadProjectFromPath(project.path, project.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewProject = async () => {
    if (!newProjectName.trim() || !newProjectLocation) return;

    try {
      setLoading(true);
      setError(null);

      const projectPath = await dataService.createProject(
        newProjectLocation,
        newProjectName.trim(),
        newProjectTemplate
      );

      if (projectPath) {
        await loadProjectFromPath(projectPath, newProjectName.trim());
        setShowNewProject(false);
        setNewProjectName('');
        setNewProjectLocation(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLocation = async () => {
    const location = await dataService.selectSaveLocation();
    if (location) {
      setNewProjectLocation(location);
    }
  };

  const handleCreateCharacter = async (name: string) => {
    if (!projectData || !name.trim()) return;

    try {
      const character = await dataService.createCharacter(projectData.projectPath, name.trim());
      setProjectData({
        ...projectData,
        characters: [...projectData.characters, character],
      });
      setSelectedCharacterId(character.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create character');
    }
  };

  const handleRenameCharacter = async (characterId: string, newName: string) => {
    if (!projectData || !newName.trim()) return;

    const character = projectData.characters.find(c => c.id === characterId);
    if (!character) return;

    // Update character name in state
    const updatedCharacters = projectData.characters.map(c =>
      c.id === characterId ? { ...c, name: newName.trim() } : c
    );

    const updatedData = { ...projectData, characters: updatedCharacters };
    setProjectData(updatedData);

    // Save the character file with new name in frontmatter
    const charScenes = projectData.scenes.filter(s => s.characterId === characterId);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === characterId);
    try {
      await dataService.saveCharacterOutline(
        { ...character, name: newName.trim() },
        charPlotPoints,
        charScenes
      );
    } catch (err) {
      console.error('Failed to save character:', err);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!projectData) return;

    const character = projectData.characters.find(c => c.id === characterId);
    if (!character) return;

    try {
      await dataService.deleteFile(character.filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete character file');
      return;
    }

    const updatedCharacters = projectData.characters.filter(c => c.id !== characterId);
    const deletedSceneIds = new Set(projectData.scenes.filter(s => s.characterId === characterId).map(s => s.id));
    const updatedScenes = projectData.scenes.filter(s => s.characterId !== characterId);
    const updatedPlotPoints = projectData.plotPoints.filter(p => p.characterId !== characterId);

    // Remove connections referencing deleted scenes
    const updatedConnections: Record<string, string[]> = {};
    for (const [sourceId, targetIds] of Object.entries(sceneConnections)) {
      if (deletedSceneIds.has(sourceId)) continue;
      const filteredTargets = targetIds.filter(t => !deletedSceneIds.has(t));
      if (filteredTargets.length > 0) {
        updatedConnections[sourceId] = filteredTargets;
      }
    }

    // Remove character color
    const updatedColors = { ...characterColors };
    delete updatedColors[characterId];
    characterColorsRef.current = updatedColors;
    setCharacterColors(updatedColors);

    // Remove draft content and metadata for deleted character's scenes
    const charSceneKeys = projectData.scenes
      .filter(s => s.characterId === characterId)
      .map(s => `${s.characterId}:${s.sceneNumber}`);
    const updatedDraftContent = { ...draftContent };
    const updatedSceneMetadata = { ...sceneMetadata };
    charSceneKeys.forEach(key => {
      delete updatedDraftContent[key];
      delete updatedSceneMetadata[key];
    });
    draftContentRef.current = updatedDraftContent;
    sceneMetadataRef.current = updatedSceneMetadata;
    setDraftContent(updatedDraftContent);
    setSceneMetadata(updatedSceneMetadata);

    // Remove archived scenes for this character
    const updatedArchived = archivedScenes.filter(a => a.characterId !== characterId);
    archivedScenesRef.current = updatedArchived;
    setArchivedScenes(updatedArchived);

    // Update project data
    setProjectData({ ...projectData, characters: updatedCharacters, scenes: updatedScenes, plotPoints: updatedPlotPoints });
    setSceneConnections(updatedConnections);

    if (selectedCharacterId === characterId) {
      setSelectedCharacterId(updatedCharacters.length > 0 ? updatedCharacters[0].id : null);
    }

    // Save timeline (refs already updated)
    await saveTimelineData(updatedScenes, updatedConnections, braidedChapters);
  };

  const handleBackupProject = async () => {
    if (!projectData) return;
    const result = await (window as any).electronAPI.backupProject(projectData.projectPath);
    if (result.success) {
      alert(`Backup saved to:\n${result.backupPath}`);
    } else if (!result.canceled) {
      setError(result.error || 'Backup failed');
    }
  };

  const handleToggleFilter = (tagName: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(tagName)) {
      newFilters.delete(tagName);
    } else {
      newFilters.add(tagName);
    }
    setActiveFilters(newFilters);
  };

  const getCharacterName = (characterId: string): string => {
    const character = projectData?.characters.find(c => c.id === characterId);
    return character?.name || 'Unknown';
  };

  // Apply font settings to CSS variables
  const applyFontSettings = (settings: FontSettings) => {
    const root = document.documentElement;
    if (settings.sectionTitle) {
      root.style.setProperty('--font-section-title', settings.sectionTitle);
    } else {
      root.style.removeProperty('--font-section-title');
    }
    if (settings.sectionTitleSize) {
      root.style.setProperty('--font-section-title-size', `${settings.sectionTitleSize}px`);
    } else {
      root.style.removeProperty('--font-section-title-size');
    }
    if (settings.sceneTitle) {
      root.style.setProperty('--font-scene-title', settings.sceneTitle);
    } else {
      root.style.removeProperty('--font-scene-title');
    }
    if (settings.sceneTitleSize) {
      root.style.setProperty('--font-scene-title-size', `${settings.sceneTitleSize}px`);
    } else {
      root.style.removeProperty('--font-scene-title-size');
    }
    if (settings.body) {
      root.style.setProperty('--font-body', settings.body);
    } else {
      root.style.removeProperty('--font-body');
    }
    if (settings.bodySize) {
      root.style.setProperty('--font-body-size', `${settings.bodySize}px`);
    } else {
      root.style.removeProperty('--font-body-size');
    }
  };

  // Handle font settings change
  const handleFontSettingsChange = async (settings: FontSettings) => {
    setFontSettings(settings);
    fontSettingsRef.current = settings;
    applyFontSettings(settings);

    // Save to timeline data
    if (projectData) {
      const positions: Record<string, number> = {};
      projectData.scenes.forEach(scene => {
        if (scene.timelinePosition !== null) {
          positions[`${scene.characterId}:${scene.sceneNumber}`] = scene.timelinePosition;
        }
      });

      // Convert connections from scene IDs to keys
      const connectionKeys: Record<string, string[]> = {};
      for (const [sourceId, targetIds] of Object.entries(sceneConnections)) {
        const sourceScene = projectData.scenes.find(s => s.id === sourceId);
        if (sourceScene) {
          const sourceKey = `${sourceScene.characterId}:${sourceScene.sceneNumber}`;
          connectionKeys[sourceKey] = targetIds
            .map(targetId => {
              const targetScene = projectData.scenes.find(s => s.id === targetId);
              return targetScene ? `${targetScene.characterId}:${targetScene.sceneNumber}` : null;
            })
            .filter((key): key is string => key !== null);
        }
      }

      // Get word counts
      const wordCounts: Record<string, number> = {};
      projectData.scenes.forEach(scene => {
        if (scene.wordCount !== undefined) {
          wordCounts[`${scene.characterId}:${scene.sceneNumber}`] = scene.wordCount;
        }
      });

      await dataService.saveTimeline(positions, connectionKeys, braidedChapters, characterColors, wordCounts, settings, archivedScenesRef.current, draftContentRef.current, metadataFieldDefsRef.current, sceneMetadataRef.current);
    }
  };

  const getPlotPointTitle = (plotPointId: string | null): string | undefined => {
    if (!plotPointId || !projectData) return undefined;
    const plotPoint = projectData.plotPoints.find(p => p.id === plotPointId);
    return plotPoint?.title;
  };

  const selectedScene = useMemo(() => {
    if (!projectData || !selectedSceneId) return null;
    return projectData.scenes.find(s => s.id === selectedSceneId) || null;
  }, [projectData, selectedSceneId]);

  const getConnectedScenes = (sceneId: string): { id: string; label: string }[] => {
    const connections = sceneConnections[sceneId] || [];
    return connections.map(connId => {
      const scene = projectData?.scenes.find(s => s.id === connId);
      if (!scene) return { id: connId, label: 'Unknown scene' };
      const charName = getCharacterName(scene.characterId);
      return { id: connId, label: `${charName} - Scene ${scene.sceneNumber}` };
    });
  };

  const handleSceneClick = (scene: Scene, e: React.MouseEvent) => {
    // Don't do anything if we're dragging
    if (draggedScene) return;

    // If we're in connection mode, complete the connection
    if (isConnecting && connectionSource && connectionSource !== scene.id && projectData) {
      const sourceConnections = sceneConnections[connectionSource] || [];
      const targetConnections = sceneConnections[scene.id] || [];

      // Add bidirectional connection
      if (!sourceConnections.includes(scene.id)) {
        const newConnections = {
          ...sceneConnections,
          [connectionSource]: [...sourceConnections, scene.id],
          [scene.id]: [...targetConnections, connectionSource],
        };
        setSceneConnections(newConnections);
        // Save connections to file
        saveTimelineData(projectData.scenes, newConnections, braidedChapters);
      }
      setIsConnecting(false);
      setConnectionSource(null);
      return;
    }

    // No longer selecting scenes for detail panel - connections handled inline
  };

  const handleStartConnection = () => {
    if (selectedSceneId) {
      setConnectionSource(selectedSceneId);
      setIsConnecting(true);
      setSelectedSceneId(null);
    }
  };

  const getConnectableScenes = (sceneId: string): { id: string; label: string }[] => {
    if (!projectData) return [];
    const alreadyConnected = new Set(sceneConnections[sceneId] || []);
    return projectData.scenes
      .filter(s => s.id !== sceneId && !alreadyConnected.has(s.id))
      .map(s => {
        const charName = getCharacterName(s.characterId);
        return { id: s.id, label: `${charName} - Scene ${s.sceneNumber}` };
      });
  };

  const handleCompleteConnection = async (sourceId: string, targetId: string) => {
    if (!projectData) return;
    const sourceConnections = sceneConnections[sourceId] || [];
    const targetConnections = sceneConnections[targetId] || [];
    if (!sourceConnections.includes(targetId)) {
      const newConnections = {
        ...sceneConnections,
        [sourceId]: [...sourceConnections, targetId],
        [targetId]: [...targetConnections, sourceId],
      };
      setSceneConnections(newConnections);
      await saveTimelineData(projectData.scenes, newConnections, braidedChapters);
    }
  };

  const handleRemoveConnection = async (sourceId: string, targetId: string) => {
    if (!projectData) return;
    const newConnections = { ...sceneConnections };

    // Remove from source
    if (newConnections[sourceId]) {
      newConnections[sourceId] = newConnections[sourceId].filter(id => id !== targetId);
      if (newConnections[sourceId].length === 0) delete newConnections[sourceId];
    }
    // Remove from target (bidirectional)
    if (newConnections[targetId]) {
      newConnections[targetId] = newConnections[targetId].filter(id => id !== sourceId);
      if (newConnections[targetId].length === 0) delete newConnections[targetId];
    }

    setSceneConnections(newConnections);
    await saveTimelineData(projectData.scenes, newConnections, braidedChapters);
  };

  // Chapter handlers
  const handleAddChapter = async (title: string, beforePosition: number) => {
    if (!projectData || !title.trim()) return;

    const newChapter: BraidedChapter = {
      id: Math.random().toString(36).substring(2, 11),
      title: title.trim(),
      beforePosition,
    };

    const updatedChapters = [...braidedChapters, newChapter].sort((a, b) => a.beforePosition - b.beforePosition);
    setBraidedChapters(updatedChapters);
    setIsAddingChapter(false);
    setNewChapterTitle('');
    await saveTimelineData(projectData.scenes, sceneConnections, updatedChapters);
  };

  const handleMoveChapter = async (chapterId: string, newBeforePosition: number) => {
    if (!projectData) return;
    const updatedChapters = braidedChapters.map(ch =>
      ch.id === chapterId ? { ...ch, beforePosition: newBeforePosition } : ch
    ).sort((a, b) => a.beforePosition - b.beforePosition);
    setBraidedChapters(updatedChapters);
    await saveTimelineData(projectData.scenes, sceneConnections, updatedChapters);
  };

  // Remap scene-keyed data (draftContent, sceneMetadata, drafts) when scene numbers change.
  // Takes a map of oldKey -> newKey and updates both state and refs.
  // Builds fresh objects to avoid collision when keys shift (e.g., 3->2 while 2->1).
  const remapSceneKeys = (keyMap: Record<string, string>) => {
    if (Object.entries(keyMap).every(([oldKey, newKey]) => oldKey === newKey)) return;

    // Helper: remap keys in a Record, preserving entries not in the keyMap
    const remap = <T,>(source: Record<string, T>): Record<string, T> => {
      const result: Record<string, T> = {};
      for (const [key, value] of Object.entries(source)) {
        if (key in keyMap) {
          result[keyMap[key]] = value;
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    const newDraftContent = remap(draftContentRef.current);
    setDraftContent(newDraftContent);
    draftContentRef.current = newDraftContent;

    const newDrafts = remap(draftsRef.current);
    setDrafts(newDrafts);
    draftsRef.current = newDrafts;

    const newSceneMetadata = remap(sceneMetadataRef.current);
    setSceneMetadata(newSceneMetadata);
    sceneMetadataRef.current = newSceneMetadata;
  };

  // Build oldKey->newKey map from scenes before and after renumbering.
  // Call this BEFORE renumbering to capture old keys, passing the character's scenes.
  const buildKeyMapBeforeRenumber = (charScenes: Scene[]): Record<string, number> => {
    const oldNumbers: Record<string, number> = {};
    for (const scene of charScenes) {
      oldNumbers[scene.id] = scene.sceneNumber;
    }
    return oldNumbers;
  };

  // After renumbering, use old numbers to build the remap and apply it.
  const applyKeyRemapAfterRenumber = (charScenes: Scene[], oldNumbers: Record<string, number>) => {
    const keyMap: Record<string, string> = {};
    for (const scene of charScenes) {
      const oldKey = `${scene.characterId}:${oldNumbers[scene.id]}`;
      const newKey = `${scene.characterId}:${scene.sceneNumber}`;
      keyMap[oldKey] = newKey;
    }
    remapSceneKeys(keyMap);
  };

  const handlePovSceneDrop = async (targetSceneNumber: number, targetPlotPointId: string) => {
    if (!projectData || !draggedPovScene || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    // Get all scenes for this character, sorted by scene number
    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    // Find the dragged scene index
    const draggedIndex = charScenes.findIndex(s => s.id === draggedPovScene.id);
    if (draggedIndex === -1) return;

    // Find target index BEFORE removing the dragged scene
    // targetSceneNumber tells us what scene number position we're targeting
    let targetIndex = charScenes.findIndex(s => s.sceneNumber >= targetSceneNumber);

    // If no scene found with that number or higher, insert at end
    if (targetIndex === -1) {
      targetIndex = charScenes.length;
    }

    // Adjust if we're moving within the same list and the removal would affect the index
    // If we're removing from before the target, the target shifts left by 1
    if (draggedIndex < targetIndex) {
      targetIndex -= 1;
    }

    // Remove the dragged scene
    const [movedScene] = charScenes.splice(draggedIndex, 1);

    // Ensure target index is valid after removal
    targetIndex = Math.max(0, Math.min(targetIndex, charScenes.length));

    // Update the plot point if moving to a different section
    movedScene.plotPointId = targetPlotPointId;

    // Insert at target position
    charScenes.splice(targetIndex, 0, movedScene);

    // Capture old keys before renumbering
    const oldNumbers = buildKeyMapBeforeRenumber(charScenes);

    // Renumber all scenes
    charScenes.forEach((scene, idx) => {
      scene.sceneNumber = idx + 1;
    });

    // Remap scene-keyed data to match new numbers
    applyKeyRemapAfterRenumber(charScenes, oldNumbers);

    // Update the full scenes array
    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...charScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);
    setDraggedPovScene(null);

    // Save to file
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleMoveSectionUp = async (sectionId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const charPlotPoints = projectData.plotPoints
      .filter(p => p.characterId === selectedCharacterId)
      .sort((a, b) => a.order - b.order);

    const currentIndex = charPlotPoints.findIndex(p => p.id === sectionId);
    if (currentIndex <= 0) return; // Already at top

    // Swap with previous
    [charPlotPoints[currentIndex - 1], charPlotPoints[currentIndex]] =
      [charPlotPoints[currentIndex], charPlotPoints[currentIndex - 1]];

    // Reassign orders
    const updatedPlotPoints = projectData.plotPoints.map(pp => {
      const newIndex = charPlotPoints.findIndex(p => p.id === pp.id);
      if (newIndex !== -1) {
        return { ...pp, order: newIndex };
      }
      return pp;
    });

    const updatedData = { ...projectData, plotPoints: updatedPlotPoints };
    setProjectData(updatedData);

    // Save to file
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (character) {
      const charScenes = projectData.scenes.filter(s => s.characterId === character.id);
      const charPPs = updatedPlotPoints.filter(p => p.characterId === character.id);
      try {
        await dataService.saveCharacterOutline(character, charPPs, charScenes);
      } catch (err) {
        console.error('Failed to save:', err);
      }
    }
  };

  const handleMoveSectionDown = async (sectionId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const charPlotPoints = projectData.plotPoints
      .filter(p => p.characterId === selectedCharacterId)
      .sort((a, b) => a.order - b.order);

    const currentIndex = charPlotPoints.findIndex(p => p.id === sectionId);
    if (currentIndex === -1 || currentIndex >= charPlotPoints.length - 1) return; // Already at bottom

    // Swap with next
    [charPlotPoints[currentIndex], charPlotPoints[currentIndex + 1]] =
      [charPlotPoints[currentIndex + 1], charPlotPoints[currentIndex]];

    // Reassign orders
    const updatedPlotPoints = projectData.plotPoints.map(pp => {
      const newIndex = charPlotPoints.findIndex(p => p.id === pp.id);
      if (newIndex !== -1) {
        return { ...pp, order: newIndex };
      }
      return pp;
    });

    const updatedData = { ...projectData, plotPoints: updatedPlotPoints };
    setProjectData(updatedData);

    // Save to file
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (character) {
      const charScenes = projectData.scenes.filter(s => s.characterId === character.id);
      const charPPs = updatedPlotPoints.filter(p => p.characterId === character.id);
      try {
        await dataService.saveCharacterOutline(character, charPPs, charScenes);
      } catch (err) {
        console.error('Failed to save:', err);
      }
    }
  };

  const handlePovSceneMoveUp = async (sceneId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    // Get all scenes for this character, sorted by scene number
    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    const currentIndex = charScenes.findIndex(s => s.id === sceneId);
    if (currentIndex <= 0) return; // Already at top or not found

    const currentScene = charScenes[currentIndex];
    const prevScene = charScenes[currentIndex - 1];

    // Check if we're moving to a different plot point
    const movingToNewPlotPoint = currentScene.plotPointId !== prevScene.plotPointId;

    const updatedScenes = projectData.scenes.map(s => {
      if (s.id === currentScene.id) {
        return {
          ...s,
          sceneNumber: prevScene.sceneNumber,
          plotPointId: movingToNewPlotPoint ? prevScene.plotPointId : s.plotPointId
        };
      } else if (s.id === prevScene.id) {
        return {
          ...s,
          sceneNumber: currentScene.sceneNumber,
          plotPointId: movingToNewPlotPoint ? currentScene.plotPointId : s.plotPointId
        };
      }
      return s;
    });

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const updatedCharScenes = updatedScenes.filter(s => s.characterId === selectedCharacterId);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === selectedCharacterId);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, updatedCharScenes);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handlePovSceneMoveDown = async (sceneId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    // Get all scenes for this character, sorted by scene number
    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    const currentIndex = charScenes.findIndex(s => s.id === sceneId);
    if (currentIndex === -1 || currentIndex >= charScenes.length - 1) return; // Already at bottom or not found

    const currentScene = charScenes[currentIndex];
    const nextScene = charScenes[currentIndex + 1];

    // Check if we're moving to a different plot point
    const movingToNewPlotPoint = currentScene.plotPointId !== nextScene.plotPointId;

    const updatedScenes = projectData.scenes.map(s => {
      if (s.id === currentScene.id) {
        return {
          ...s,
          sceneNumber: nextScene.sceneNumber,
          plotPointId: movingToNewPlotPoint ? nextScene.plotPointId : s.plotPointId
        };
      } else if (s.id === nextScene.id) {
        return {
          ...s,
          sceneNumber: currentScene.sceneNumber,
          plotPointId: movingToNewPlotPoint ? currentScene.plotPointId : s.plotPointId
        };
      }
      return s;
    });

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const updatedCharScenes = updatedScenes.filter(s => s.characterId === selectedCharacterId);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === selectedCharacterId);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, updatedCharScenes);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleUpdateChapter = async (chapterId: string, newTitle: string) => {
    if (!projectData) return;
    const updatedChapters = braidedChapters.map(ch =>
      ch.id === chapterId ? { ...ch, title: newTitle } : ch
    );
    setBraidedChapters(updatedChapters);
    await saveTimelineData(projectData.scenes, sceneConnections, updatedChapters);
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!projectData) return;
    const updatedChapters = braidedChapters.filter(ch => ch.id !== chapterId);
    setBraidedChapters(updatedChapters);
    await saveTimelineData(projectData.scenes, sceneConnections, updatedChapters);
  };

  // Measure scene positions for connection lines
  useLayoutEffect(() => {
    if (!timelineRef.current || viewMode !== 'braided') return;

    const measurePositions = () => {
      const container = timelineRef.current;
      if (!container) return;

      const positions: Record<string, number> = {};
      const wrappers = container.querySelectorAll('.braided-scene-wrapper');
      const containerRect = container.getBoundingClientRect();

      wrappers.forEach((wrapper) => {
        const sceneId = wrapper.getAttribute('data-scene-id');
        if (sceneId) {
          const rect = wrapper.getBoundingClientRect();
          // Get center Y position relative to container
          positions[sceneId] = rect.top - containerRect.top + rect.height / 2;
        }
      });

      setScenePositions(positions);
    };

    measurePositions();
    // Re-measure on window resize
    window.addEventListener('resize', measurePositions);
    return () => window.removeEventListener('resize', measurePositions);
  }, [viewMode, displayedScenes, sceneConnections]);

  // Soft pastel colors for POV characters
  const POV_COLORS = [
    'rgba(59, 130, 246, 0.08)',  // blue
    'rgba(239, 68, 68, 0.08)',   // red
    'rgba(34, 197, 94, 0.08)',   // green
    'rgba(168, 85, 247, 0.08)',  // purple
    'rgba(249, 115, 22, 0.08)',  // orange
    'rgba(236, 72, 153, 0.08)',  // pink
    'rgba(20, 184, 166, 0.08)',  // teal
    'rgba(245, 158, 11, 0.08)',  // amber
  ];

  const getCharacterColor = (characterId: string): string => {
    if (!projectData) return 'transparent';
    // Use custom color if set
    if (characterColors[characterId]) {
      // Convert hex to rgba with low opacity
      const hex = characterColors[characterId].replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, 0.08)`;
    }
    // Fall back to automatic color
    const index = projectData.characters.findIndex(c => c.id === characterId);
    return POV_COLORS[index % POV_COLORS.length];
  };

  const DEFAULT_HEX_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#f59e0b'];

  const getCharacterHexColor = (characterId: string): string => {
    if (characterColors[characterId]) return characterColors[characterId];
    if (!projectData) return DEFAULT_HEX_COLORS[0];
    const index = projectData.characters.findIndex(c => c.id === characterId);
    return DEFAULT_HEX_COLORS[index % DEFAULT_HEX_COLORS.length];
  };

  const handleCharacterColorChange = async (characterId: string, color: string) => {
    const newColors = { ...characterColors, [characterId]: color };
    setCharacterColors(newColors);
    characterColorsRef.current = newColors;
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  const handleSceneChange = async (sceneId: string, newContent: string, newNotes: string[]) => {
    if (!projectData) return;

    // Update scene in state
    const updatedScenes = projectData.scenes.map(scene =>
      scene.id === sceneId
        ? { ...scene, content: newContent, title: newContent, notes: newNotes }
        : scene
    );

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Find the character for this scene and save
    const scene = updatedScenes.find(s => s.id === sceneId);
    if (scene) {
      const character = projectData.characters.find(c => c.id === scene.characterId);
      if (character) {
        const charScenes = updatedScenes.filter(s => s.characterId === character.id);
        const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
        try {
          await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
        } catch (err) {
          console.error('Failed to save:', err);
        }
      }
    }
  };

  const handlePlotPointChange = async (plotPointId: string, newTitle: string, newDescription: string, expectedSceneCount?: number | null) => {
    if (!projectData) return;

    // Update plot point in state
    const updatedPlotPoints = projectData.plotPoints.map(pp =>
      pp.id === plotPointId
        ? { ...pp, title: newTitle, description: newDescription, expectedSceneCount: expectedSceneCount !== undefined ? expectedSceneCount : pp.expectedSceneCount }
        : pp
    );

    const updatedData = { ...projectData, plotPoints: updatedPlotPoints };
    setProjectData(updatedData);

    // Find the character for this plot point and save
    const plotPoint = updatedPlotPoints.find(p => p.id === plotPointId);
    if (plotPoint) {
      const character = projectData.characters.find(c => c.id === plotPoint.characterId);
      if (character) {
        const charScenes = projectData.scenes.filter(s => s.characterId === character.id);
        const charPlotPoints = updatedPlotPoints.filter(p => p.characterId === character.id);
        try {
          await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
        } catch (err) {
          console.error('Failed to save:', err);
        }
      }
    }
  };

  const handleCreatePlotPoint = async () => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    // Get existing plot points for this character to determine order
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === selectedCharacterId);
    const maxOrder = charPlotPoints.length > 0
      ? Math.max(...charPlotPoints.map(p => p.order))
      : -1;

    const newPlotPoint: PlotPoint = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: selectedCharacterId,
      title: 'New Section',
      expectedSceneCount: null,
      description: '',
      order: maxOrder + 1,
    };

    const updatedPlotPoints = [...projectData.plotPoints, newPlotPoint];
    const updatedData = { ...projectData, plotPoints: updatedPlotPoints };
    setProjectData(updatedData);

    // Save to file
    const charScenes = projectData.scenes.filter(s => s.characterId === character.id);
    const allCharPlotPoints = updatedPlotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, allCharPlotPoints, charScenes);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleAddScene = async (plotPointId: string, afterSceneNumber?: number) => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    // Get existing scenes for this character, sorted by scene number
    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    // Determine insert position
    let insertAfterIndex: number;
    if (afterSceneNumber !== undefined) {
      // Insert after the specified scene
      insertAfterIndex = charScenes.findIndex(s => s.sceneNumber === afterSceneNumber);
      if (insertAfterIndex === -1) insertAfterIndex = charScenes.length - 1;
    } else {
      // Insert after the last scene in this plot point
      const plotPointScenes = charScenes.filter(s => s.plotPointId === plotPointId);
      if (plotPointScenes.length > 0) {
        const lastPlotPointScene = plotPointScenes[plotPointScenes.length - 1];
        insertAfterIndex = charScenes.findIndex(s => s.id === lastPlotPointScene.id);
      } else {
        // No scenes in this plot point, find where this plot point falls in order
        const plotPoints = projectData.plotPoints
          .filter(p => p.characterId === selectedCharacterId)
          .sort((a, b) => a.order - b.order);
        const ppIndex = plotPoints.findIndex(p => p.id === plotPointId);

        // Find the last scene before this plot point
        let lastSceneBeforeIndex = -1;
        for (let i = ppIndex - 1; i >= 0; i--) {
          const prevPPScenes = charScenes.filter(s => s.plotPointId === plotPoints[i].id);
          if (prevPPScenes.length > 0) {
            const lastScene = prevPPScenes[prevPPScenes.length - 1];
            lastSceneBeforeIndex = charScenes.findIndex(s => s.id === lastScene.id);
            break;
          }
        }
        insertAfterIndex = lastSceneBeforeIndex;
      }
    }

    // Calculate new scene number (will be insertAfterIndex + 2, since we renumber from 1)
    const newSceneNumber = insertAfterIndex + 2;

    // Auto-add character name as a tag
    const characterTag = character.name.toLowerCase().replace(/\s+/g, '_');

    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: selectedCharacterId,
      sceneNumber: newSceneNumber,
      title: 'New scene',
      content: 'New scene',
      tags: [characterTag],
      timelinePosition: null,
      isHighlighted: false,
      notes: [],
      plotPointId: plotPointId,
    };

    // Insert the new scene at the right position
    const newCharScenes = [...charScenes];
    newCharScenes.splice(insertAfterIndex + 1, 0, newScene);

    // Capture old keys before renumbering
    const oldNumbers = buildKeyMapBeforeRenumber(newCharScenes);

    // Renumber all scenes
    newCharScenes.forEach((scene, idx) => {
      scene.sceneNumber = idx + 1;
    });

    // Remap scene-keyed data to match new numbers
    applyKeyRemapAfterRenumber(newCharScenes, oldNumbers);

    // Update the full scenes array
    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...newCharScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, newCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  // Save timeline positions, connections, and chapters to file
  const saveTimelineData = useCallback(async (
    scenes: Scene[],
    connections: Record<string, string[]>,
    chapters: BraidedChapter[]
  ) => {
    const positions: Record<string, number> = {};
    const sceneWordCounts: Record<string, number> = {};

    for (const scene of scenes) {
      const key = `${scene.characterId}:${scene.sceneNumber}`;
      if (scene.timelinePosition !== null) {
        positions[key] = scene.timelinePosition;
      }
      // Always save word counts if present
      if (scene.wordCount !== undefined) {
        sceneWordCounts[key] = scene.wordCount;
      }
    }

    // Convert scene ID connections to key-based connections
    const keyConnections: Record<string, string[]> = {};
    for (const [sourceId, targetIds] of Object.entries(connections)) {
      const sourceScene = scenes.find(s => s.id === sourceId);
      if (sourceScene) {
        const sourceKey = `${sourceScene.characterId}:${sourceScene.sceneNumber}`;
        const targetKeys = targetIds
          .map(targetId => {
            const targetScene = scenes.find(s => s.id === targetId);
            return targetScene ? `${targetScene.characterId}:${targetScene.sceneNumber}` : null;
          })
          .filter((key): key is string => key !== null);
        if (targetKeys.length > 0) {
          keyConnections[sourceKey] = targetKeys;
        }
      }
    }

    try {
      // Always use the current characterColors from ref
      await dataService.saveTimeline(positions, keyConnections, chapters, characterColorsRef.current, sceneWordCounts, fontSettingsRef.current, archivedScenesRef.current, draftContentRef.current, metadataFieldDefsRef.current, sceneMetadataRef.current, draftsRef.current);
    } catch (err) {
      console.error('Failed to save timeline:', err);
    }
  }, []);

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, scene: Scene) => {
    setDraggedScene(scene);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', scene.id);
  };

  const handleDragEnd = () => {
    setDraggedScene(null);
    setDropTargetIndex(null);
  };

  const handleDragOverTimeline = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(index);
  };

  const handleDropOnTimeline = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedScene || !projectData) return;

    // Get currently braided scenes in order
    const braidedScenes = projectData.scenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));

    // Remove the dragged scene if it's already in the list
    const withoutDragged = braidedScenes.filter(s => s.id !== draggedScene.id);

    // Insert at the target position
    withoutDragged.splice(targetIndex, 0, draggedScene);

    // Create a map of scene id to new position
    const newPositions = new Map<string, number>();
    withoutDragged.forEach((scene, idx) => {
      newPositions.set(scene.id, idx + 1);
    });

    // Update all scenes with new positions
    const finalScenes = projectData.scenes.map(scene => {
      const newPos = newPositions.get(scene.id);
      if (newPos !== undefined) {
        return { ...scene, timelinePosition: newPos };
      }
      return scene;
    });

    setProjectData({ ...projectData, scenes: finalScenes });
    setDraggedScene(null);
    setDropTargetIndex(null);

    await saveTimelineData(finalScenes, sceneConnections, braidedChapters);
  };

  const handleDragOverInbox = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnInbox = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedScene || !projectData) return;

    // Remove from timeline (set timelinePosition to null)
    const updatedScenes = projectData.scenes.map(scene => {
      if (scene.id === draggedScene.id) {
        return { ...scene, timelinePosition: null };
      }
      return scene;
    });

    // Renumber remaining braided scenes
    const braidedScenes = updatedScenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));

    const finalScenes = updatedScenes.map(scene => {
      const idx = braidedScenes.findIndex(s => s.id === scene.id);
      if (idx !== -1) {
        return { ...scene, timelinePosition: idx + 1 };
      }
      return scene;
    });

    setProjectData({ ...projectData, scenes: finalScenes });
    setDraggedScene(null);
    setDropTargetIndex(null);

    await saveTimelineData(finalScenes, sceneConnections, braidedChapters);
  };

  // Tag management handlers
  const handleUpdateTag = (tagId: string, category: TagCategory) => {
    if (!projectData) return;
    const updatedTags = projectData.tags.map(tag =>
      tag.id === tagId ? { ...tag, category } : tag
    );
    setProjectData({ ...projectData, tags: updatedTags });
  };

  const handleCreateTag = (name: string, category: TagCategory) => {
    if (!projectData) return;
    const newTag: Tag = {
      id: Math.random().toString(36).substring(2, 11),
      name,
      category,
    };
    setProjectData({ ...projectData, tags: [...projectData.tags, newTag] });
  };

  const handleDeleteTag = (tagId: string) => {
    if (!projectData) return;
    const tagToDelete = projectData.tags.find(t => t.id === tagId);
    if (!tagToDelete) return;

    // Remove tag from tags list
    const updatedTags = projectData.tags.filter(t => t.id !== tagId);

    // Remove tag from all scenes
    const updatedScenes = projectData.scenes.map(scene => ({
      ...scene,
      tags: scene.tags.filter(t => t !== tagToDelete.name),
    }));

    setProjectData({ ...projectData, tags: updatedTags, scenes: updatedScenes });
  };

  const handleOpenInEditor = (sceneKey: string) => {
    setEditorInitialSceneKey(sceneKey);
    setViewMode('editor');
  };

  const handleGoToPov = (sceneId: string, characterId: string) => {
    scrollToSceneIdRef.current = sceneId;
    setSelectedCharacterId(characterId);
    setViewMode('pov');
  };

  const handleGoToBraid = (sceneId: string) => {
    scrollToSceneIdRef.current = sceneId;
    setViewMode('braided');
  };

  const handleDraftChange = async (sceneKey: string, html: string) => {
    const updated = { ...draftContent, [sceneKey]: html };
    setDraftContent(updated);
    draftContentRef.current = updated;
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  const handleSaveDraft = async (sceneKey: string, content: string) => {
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
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  const handleMetadataChange = async (sceneKey: string, fieldId: string, value: string | string[]) => {
    const updated = {
      ...sceneMetadata,
      [sceneKey]: { ...(sceneMetadata[sceneKey] || {}), [fieldId]: value },
    };
    setSceneMetadata(updated);
    sceneMetadataRef.current = updated;
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  const handleMetadataFieldDefsChange = async (defs: MetadataFieldDef[]) => {
    setMetadataFieldDefs(defs);
    metadataFieldDefsRef.current = defs;
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  const handleArchiveScene = async (sceneId: string) => {
    if (!projectData) return;

    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Create archived copy
    const archived: ArchivedScene = {
      id: scene.id,
      characterId: scene.characterId,
      originalSceneNumber: scene.sceneNumber,
      plotPointId: scene.plotPointId,
      content: scene.content,
      tags: scene.tags,
      notes: scene.notes,
      isHighlighted: scene.isHighlighted,
      wordCount: scene.wordCount,
      archivedAt: Date.now(),
    };

    const updatedArchived = [...archivedScenes, archived];
    setArchivedScenes(updatedArchived);
    archivedScenesRef.current = updatedArchived;

    // Remove scene from active state
    const updatedScenes = projectData.scenes.filter(s => s.id !== sceneId);

    // Renumber remaining scenes for this character
    const charScenes = updatedScenes
      .filter(s => s.characterId === scene.characterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    // Remove the archived scene's keyed data and capture old keys before renumbering
    const archivedKey = `${scene.characterId}:${scene.sceneNumber}`;
    const newDC = { ...draftContentRef.current };
    delete newDC[archivedKey];
    draftContentRef.current = newDC;
    setDraftContent(newDC);
    const newDr = { ...draftsRef.current };
    delete newDr[archivedKey];
    draftsRef.current = newDr;
    setDrafts(newDr);
    const newSM = { ...sceneMetadataRef.current };
    delete newSM[archivedKey];
    sceneMetadataRef.current = newSM;
    setSceneMetadata(newSM);

    const oldNumbers = buildKeyMapBeforeRenumber(charScenes);

    charScenes.forEach((s, idx) => {
      s.sceneNumber = idx + 1;
    });

    // Remap scene-keyed data to match new numbers
    applyKeyRemapAfterRenumber(charScenes, oldNumbers);

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    if (selectedSceneId === sceneId) {
      setSelectedSceneId(null);
    }

    // Remove any connections involving this scene
    const newConnections = { ...sceneConnections };
    delete newConnections[sceneId];
    for (const [sourceId, targetIds] of Object.entries(newConnections)) {
      newConnections[sourceId] = targetIds.filter(id => id !== sceneId);
      if (newConnections[sourceId].length === 0) delete newConnections[sourceId];
    }
    setSceneConnections(newConnections);

    // Save to file
    const character = projectData.characters.find(c => c.id === scene.characterId);
    if (character) {
      const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
      try {
        await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
        await saveTimelineData(updatedScenes, newConnections, braidedChapters);
      } catch (err) {
        console.error('Failed to save:', err);
      }
    }
  };

  const handleRestoreScene = async (archived: ArchivedScene) => {
    if (!projectData) return;

    // Remove from archive
    const updatedArchived = archivedScenes.filter(a => a.id !== archived.id);
    setArchivedScenes(updatedArchived);
    archivedScenesRef.current = updatedArchived;

    // Find the target plot point — if the original plot point still exists, use it; otherwise use first plot point for that character
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === archived.characterId);
    const targetPlotPointId = charPlotPoints.find(p => p.id === archived.plotPointId)?.id ?? charPlotPoints[0]?.id ?? null;

    // Get current scenes for this character and assign new scene number (append at end)
    const charScenes = projectData.scenes.filter(s => s.characterId === archived.characterId);
    const maxSceneNumber = charScenes.length > 0 ? Math.max(...charScenes.map(s => s.sceneNumber)) : 0;

    const restoredScene: Scene = {
      id: archived.id,
      characterId: archived.characterId,
      sceneNumber: maxSceneNumber + 1,
      title: archived.content,
      content: archived.content,
      tags: archived.tags,
      timelinePosition: null,
      isHighlighted: archived.isHighlighted,
      notes: archived.notes,
      plotPointId: targetPlotPointId,
      wordCount: archived.wordCount,
    };

    const updatedScenes = [...projectData.scenes, restoredScene];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const character = projectData.characters.find(c => c.id === archived.characterId);
    if (character) {
      const updatedCharPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
      const updatedCharScenes = updatedScenes.filter(s => s.characterId === character.id);
      try {
        await dataService.saveCharacterOutline(character, updatedCharPlotPoints, updatedCharScenes);
        await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
      } catch (err) {
        console.error('Failed to save:', err);
      }
    }
  };

  const handleDuplicateScene = async (sceneId: string) => {
    if (!projectData) return;

    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const character = projectData.characters.find(c => c.id === scene.characterId);
    if (!character) return;

    // Get all scenes for this character, sorted by scene number
    const charScenes = projectData.scenes
      .filter(s => s.characterId === scene.characterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    // Find where the original scene is
    const originalIndex = charScenes.findIndex(s => s.id === sceneId);

    // Create the duplicate scene
    const duplicateScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: scene.characterId,
      sceneNumber: scene.sceneNumber + 1, // Will be renumbered
      title: scene.title,
      content: scene.content,
      tags: [...scene.tags],
      timelinePosition: null, // Don't copy timeline position
      isHighlighted: scene.isHighlighted,
      notes: [...scene.notes],
      plotPointId: scene.plotPointId,
      wordCount: scene.wordCount,
    };

    // Insert duplicate after original
    charScenes.splice(originalIndex + 1, 0, duplicateScene);

    // Capture old keys before renumbering
    const oldNumbers = buildKeyMapBeforeRenumber(charScenes);

    // Renumber all scenes
    charScenes.forEach((s, idx) => {
      s.sceneNumber = idx + 1;
    });

    // Remap scene-keyed data to match new numbers
    applyKeyRemapAfterRenumber(charScenes, oldNumbers);

    // Update the full scenes array
    const otherScenes = projectData.scenes.filter(s => s.characterId !== scene.characterId);
    const updatedScenes = [...otherScenes, ...charScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleWordCountChange = async (sceneId: string, wordCount: number | undefined) => {
    if (!projectData) return;

    const updatedScenes = projectData.scenes.map(scene =>
      scene.id === sceneId ? { ...scene, wordCount } : scene
    );

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save word count to timeline.json
    await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
  };

  const handleTagsChange = async (sceneId: string, newTags: string[]) => {
    if (!projectData) return;

    // Find any new tags that need to be added to the master list
    const existingTagNames = new Set(projectData.tags.map(t => t.name));
    const newMasterTags = newTags
      .filter(tagName => !existingTagNames.has(tagName))
      .map(tagName => ({
        id: Math.random().toString(36).substring(2, 11),
        name: tagName,
        category: 'people' as TagCategory,
      }));

    // Update scene tags in state (don't modify content - tags are stored separately)
    const updatedScenes = projectData.scenes.map(scene => {
      if (scene.id !== sceneId) return scene;
      return { ...scene, tags: newTags };
    });

    const updatedData = {
      ...projectData,
      scenes: updatedScenes,
      tags: [...projectData.tags, ...newMasterTags],
    };
    setProjectData(updatedData);

    // Save to file
    const scene = updatedScenes.find(s => s.id === sceneId);
    if (scene) {
      const character = projectData.characters.find(c => c.id === scene.characterId);
      if (character) {
        const charScenes = updatedScenes.filter(s => s.characterId === character.id);
        const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
        try {
          await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
        } catch (err) {
          console.error('Failed to save:', err);
        }
      }
    }
  };

  // Welcome screen when no project loaded
  if (!projectData) {
    const templateOptions: { id: ProjectTemplate; name: string; description: string }[] = [
      { id: 'three-act', name: 'Three-Act Structure', description: 'Classic setup, confrontation, resolution' },
      { id: 'save-the-cat', name: 'Save the Cat', description: '15 beats from Opening Image to Final Image' },
      { id: 'heros-journey', name: "Hero's Journey", description: '12 stages of the monomyth' },
      { id: 'blank', name: 'Blank', description: 'Start from scratch' },
    ];

    return (
      <div className="app">
        <div className="app-header">
          <h1>Braidr</h1>
        </div>
        <div className="main-content">
          <div className="welcome-screen">
            {!showNewProject ? (
              <>
                <h2>Braidr</h2>
                <div className="welcome-subtitle">Multi-POV Novel Outliner</div>

                {recentProjects.length > 0 ? (
                  <div className="recent-projects">
                    <div className="recent-projects-label">Recent Novels</div>
                    {recentProjects.map(project => (
                      <button
                        key={project.path}
                        className="recent-project-card"
                        onClick={() => handleOpenRecentProject(project)}
                        disabled={loading}
                      >
                        <span className="project-name">{project.name}</span>
                        <span className="project-date">
                          {new Date(project.lastOpened).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">
                    Create your first novel to get started.
                  </p>
                )}

                <div className="welcome-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowNewProject(true)}
                    disabled={loading}
                  >
                    + New Novel
                  </button>
                </div>

                <button
                  className="link-btn"
                  onClick={handleSelectFolder}
                  disabled={loading}
                >
                  Import existing folder
                </button>

                {error && <p className="error-message">{error}</p>}
              </>
            ) : (
              <>
                <h2>Create New Novel</h2>

                <div className="new-project-form">
                  <div className="form-group">
                    <label>Novel Title</label>
                    <input
                      type="text"
                      placeholder="My Novel"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="form-group">
                    <label>Location</label>
                    <div className="location-picker">
                      <span className="location-path">
                        {newProjectLocation || 'Choose where to save...'}
                      </span>
                      <button
                        className="btn btn-small"
                        onClick={handleSelectLocation}
                      >
                        Browse
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Story Structure Template</label>
                    <div className="template-options">
                      {templateOptions.map(template => (
                        <button
                          key={template.id}
                          className={`template-option ${newProjectTemplate === template.id ? 'selected' : ''}`}
                          onClick={() => setNewProjectTemplate(template.id)}
                        >
                          <span className="template-name">{template.name}</span>
                          <span className="template-desc">{template.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowNewProject(false);
                        setNewProjectName('');
                        setNewProjectLocation(null);
                        setError(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleCreateNewProject}
                      disabled={!newProjectName.trim() || !newProjectLocation || loading}
                    >
                      {loading ? 'Creating...' : 'Create Novel'}
                    </button>
                  </div>

                  {error && <p className="error-message">{error}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Primary Toolbar - Navigation */}
      <div className="app-toolbar">
        <div className="toolbar-left">
          <h1>{projectData.projectName || 'Braidr'}</h1>
        </div>

        <div className="toolbar-center">
          <div className="view-toggle">
            <button
              className={viewMode === 'pov' ? 'active' : ''}
              onClick={() => setViewMode('pov')}
            >
              POV
            </button>
            <button
              className={viewMode === 'braided' ? 'active' : ''}
              onClick={() => setViewMode('braided')}
            >
              Braided
            </button>
            <button
              className={viewMode === 'editor' ? 'active' : ''}
              onClick={() => { setEditorInitialSceneKey(null); setViewMode('editor'); }}
            >
              Editor
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <button
            className="toolbar-compile-btn"
            onClick={() => setShowCompileModal(true)}
            title="Compile Manuscript"
          >
            Compile
          </button>
          <div className="toolbar-divider" />
          <button
            className="icon-btn"
            onClick={() => setShowCharacterManager(true)}
            title="Manage Characters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowTagManager(true)}
            title="Manage Tags"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowFontPicker(true)}
            title="Font Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 7 4 4 20 4 20 7"/>
              <line x1="9" y1="20" x2="15" y2="20"/>
              <line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowArchivePanel(true)}
            title={`Archive${archivedScenes.length > 0 ? ` (${archivedScenes.length})` : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8"/>
              <rect x="1" y="3" width="22" height="5"/>
              <line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={handleBackupProject}
            title="Backup Project"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 15 3 15 7"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setProjectData(null)}
            title="Switch Project"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Secondary Toolbar - Context & Filters */}
      {viewMode !== 'editor' && (
        <div className="secondary-toolbar">
          <div className="toolbar-left">
            {viewMode === 'pov' ? (
              <div className="character-selector">
                <select
                  value={selectedCharacterId || ''}
                  onChange={(e) => setSelectedCharacterId(e.target.value)}
                >
                  {projectData.characters.map(char => (
                    <option key={char.id} value={char.id}>
                      {char.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="sub-view-toggle">
                <button
                  className={braidedSubMode === 'list' ? 'active' : ''}
                  onClick={() => setBraidedSubMode('list')}
                >
                  List
                </button>
                <button
                  className={braidedSubMode === 'rails' ? 'active' : ''}
                  onClick={() => setBraidedSubMode('rails')}
                >
                  Rails
                </button>
              </div>
            )}
            <div className="toolbar-divider" />
            {viewMode === 'pov' ? (
              <>
                <button
                  className={`toolbar-btn ${allNotesExpanded !== false ? 'active' : ''}`}
                  onClick={() => setAllNotesExpanded(prev => prev === null ? false : !prev)}
                  title={allNotesExpanded === false ? 'Expand Notes' : 'Collapse Notes'}
                >
                  Notes
                </button>
                <button
                  className={`toolbar-btn ${!hideSectionHeaders ? 'active' : ''}`}
                  onClick={() => setHideSectionHeaders(!hideSectionHeaders)}
                  title={hideSectionHeaders ? 'Show Sections' : 'Hide Sections'}
                >
                  Sections
                </button>
              </>
            ) : (
              <>
                <button
                  className={`toolbar-btn ${showPovColors ? 'active' : ''}`}
                  onClick={() => setShowPovColors(!showPovColors)}
                  title="Toggle Colors"
                >
                  Colors
                </button>
                {braidedSubMode === 'rails' && (
                  <button
                    className={`toolbar-btn ${showRailsConnections ? 'active' : ''}`}
                    onClick={() => setShowRailsConnections(!showRailsConnections)}
                    title="Toggle Connections"
                  >
                    Links
                  </button>
                )}
              </>
            )}
          </div>

          <div className="toolbar-right">
            {projectData.tags.length > 0 && (
              <FilterBar
                tags={projectData.tags}
                activeFilters={activeFilters}
                onToggleFilter={handleToggleFilter}
              />
            )}
            <div className="toolbar-divider" />
            <button
              className={`icon-btn ${!canUndo ? 'disabled' : ''}`}
              onClick={undoProjectData}
              disabled={!canUndo}
              title="Undo (Cmd+Z)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6"/>
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.4 2.6L3 13"/>
              </svg>
            </button>
            <button
              className={`icon-btn ${!canRedo ? 'disabled' : ''}`}
              onClick={redoProjectData}
              disabled={!canRedo}
              title="Redo (Cmd+Shift+Z)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6"/>
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.4 2.6L21 13"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="main-content">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="scene-list">
            {viewMode === 'editor' ? (
              <EditorView
                scenes={projectData.scenes}
                characters={projectData.characters}
                plotPoints={projectData.plotPoints}
                tags={projectData.tags}
                characterColors={characterColors}
                draftContent={draftContent}
                sceneMetadata={sceneMetadata}
                metadataFieldDefs={metadataFieldDefs}
                drafts={drafts}
                onDraftChange={handleDraftChange}
                onSaveDraft={handleSaveDraft}
                onMetadataChange={handleMetadataChange}
                onMetadataFieldDefsChange={handleMetadataFieldDefsChange}
                onTagsChange={handleTagsChange}
                onNotesChange={(sceneId, notes) => {
                  const scene = projectData.scenes.find(s => s.id === sceneId);
                  if (scene) handleSceneChange(sceneId, scene.content, notes);
                }}
                onSceneContentChange={(sceneId, newContent) => {
                  const scene = projectData.scenes.find(s => s.id === sceneId);
                  if (scene) handleSceneChange(sceneId, newContent, scene.notes);
                }}
                onCreateTag={handleCreateTag}
                onWordCountChange={handleWordCountChange}
                initialSceneKey={editorInitialSceneKey || lastEditorSceneKeyRef.current}
                onSceneSelect={(key) => { lastEditorSceneKeyRef.current = key; }}
                onGoToPov={handleGoToPov}
                onGoToBraid={handleGoToBraid}
              />
            ) : viewMode === 'pov' ? (
              // POV View with plot points and table of contents
              <div className={`pov-layout ${isConnecting ? 'is-connecting' : ''}`}>
                <div className="pov-content">
                {isConnecting && (
                  <div className="connecting-banner">
                    Click another scene to connect, or <button onClick={() => { setIsConnecting(false); setConnectionSource(null); }}>cancel</button>
                  </div>
                )}
                {displayedPlotPoints.map((plotPoint, index) => (
                  <PlotPointSection
                    key={plotPoint.id}
                    plotPoint={plotPoint}
                    scenes={displayedScenes.filter(s => s.plotPointId === plotPoint.id)}
                    tags={projectData.tags}
                    onSceneChange={handleSceneChange}
                    onTagsChange={handleTagsChange}
                    onCreateTag={handleCreateTag}
                    onPlotPointChange={handlePlotPointChange}
                    onAddScene={handleAddScene}
                    onDeleteScene={handleArchiveScene}
                    onDuplicateScene={handleDuplicateScene}
                    onMoveUp={() => handleMoveSectionUp(plotPoint.id)}
                    onMoveDown={() => handleMoveSectionDown(plotPoint.id)}
                    isFirst={index === 0}
                    isLast={index === displayedPlotPoints.length - 1}
                    forceNotesExpanded={allNotesExpanded}
                    onSceneMoveUp={handlePovSceneMoveUp}
                    onSceneMoveDown={handlePovSceneMoveDown}
                    allCharacterScenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId)}
                    onSceneDragStart={(scene) => setDraggedPovScene(scene)}
                    onSceneDragEnd={() => setDraggedPovScene(null)}
                    onSceneDrop={handlePovSceneDrop}
                    draggedScene={draggedPovScene}
                    hideHeader={hideSectionHeaders}
                    getConnectedScenes={getConnectedScenes}
                    onStartConnection={(sceneId) => {
                      setConnectionSource(sceneId);
                      setIsConnecting(true);
                    }}
                    onRemoveConnection={handleRemoveConnection}
                    isConnecting={isConnecting}
                    onWordCountChange={handleWordCountChange}
                    getConnectableScenes={getConnectableScenes}
                    onCompleteConnection={handleCompleteConnection}
                    onOpenInEditor={handleOpenInEditor}
                    metadataFieldDefs={metadataFieldDefs}
                    sceneMetadata={sceneMetadata}
                    onMetadataChange={(sceneId, fieldId, value) => {
                      const scene = projectData.scenes.find(s => s.id === sceneId);
                      if (scene) {
                        const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
                        handleMetadataChange(sceneKey, fieldId, value);
                      }
                    }}
                    onMetadataFieldDefsChange={handleMetadataFieldDefsChange}
                    onSceneClick={(sceneId) => {
                      // Handle completing a connection in POV view
                      if (isConnecting && connectionSource && connectionSource !== sceneId && projectData) {
                        const sourceConnections = sceneConnections[connectionSource] || [];
                        const targetConnections = sceneConnections[sceneId] || [];

                        if (!sourceConnections.includes(sceneId)) {
                          const newConnections = {
                            ...sceneConnections,
                            [connectionSource]: [...sourceConnections, sceneId],
                            [sceneId]: [...targetConnections, connectionSource],
                          };
                          setSceneConnections(newConnections);
                          saveTimelineData(projectData.scenes, newConnections, braidedChapters);
                        }
                        setIsConnecting(false);
                        setConnectionSource(null);
                      }
                    }}
                  />
                ))}
                {/* Scenes without plot points */}
                {displayedScenes.filter(s => !s.plotPointId).map(scene => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    tags={projectData.tags}
                    showCharacter={false}
                    onSceneChange={handleSceneChange}
                    onTagsChange={handleTagsChange}
                    onCreateTag={handleCreateTag}
                    onDeleteScene={handleArchiveScene}
                    onDuplicateScene={handleDuplicateScene}
                    forceNotesExpanded={allNotesExpanded}
                    connectedScenes={getConnectedScenes(scene.id)}
                    onStartConnection={() => {
                      setConnectionSource(scene.id);
                      setIsConnecting(true);
                    }}
                    onRemoveConnection={(targetId) => handleRemoveConnection(scene.id, targetId)}
                  />
                ))}
                {/* Add Section button */}
                <button className="add-section-btn" onClick={handleCreatePlotPoint}>
                  + Add Section
                </button>
                </div>

                {/* Table of Contents Sidebar */}
                {!hideSectionHeaders && displayedPlotPoints.length > 0 && (
                  <div className="pov-toc">
                    <h3 className="toc-title">Sections</h3>
                    <div className="toc-items">
                      {displayedPlotPoints.map((plotPoint) => {
                        const sectionScenes = displayedScenes.filter(s => s.plotPointId === plotPoint.id);
                        return (
                          <button
                            key={plotPoint.id}
                            className="toc-item"
                            onClick={() => {
                              // Find the plot point element and scroll to it
                              const element = document.querySelector(`[data-plotpoint-id="${plotPoint.id}"]`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                          >
                            <span className="toc-item-title">{plotPoint.title}</span>
                            {plotPoint.expectedSceneCount && (
                              <span className="toc-item-count">
                                {sectionScenes.length}/{plotPoint.expectedSceneCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : braidedSubMode === 'rails' ? (
              // Rails View
              <RailsView
                scenes={displayedScenes}
                characters={railsDisplayCharacters}
                characterColors={characterColors}
                connections={sceneConnections}
                showConnections={showRailsConnections}
                showPovColors={showPovColors}
                tags={projectData.tags}
                getCharacterName={getCharacterName}
                onSceneChange={handleSceneChange}
                onTagsChange={handleTagsChange}
                onCreateTag={handleCreateTag}
                onWordCountChange={handleWordCountChange}
                isConnecting={isConnecting}
                connectionSource={connectionSource}
                onStartConnection={(sceneId) => {
                  setConnectionSource(sceneId);
                  setIsConnecting(true);
                }}
                onCompleteConnection={(targetId) => {
                  if (connectionSource && connectionSource !== targetId) {
                    const sourceConnections = sceneConnections[connectionSource] || [];
                    const targetConnections = sceneConnections[targetId] || [];
                    if (!sourceConnections.includes(targetId)) {
                      const newConnections = {
                        ...sceneConnections,
                        [connectionSource]: [...sourceConnections, targetId],
                        [targetId]: [...targetConnections, connectionSource],
                      };
                      setSceneConnections(newConnections);
                      saveTimelineData(projectData.scenes, newConnections, braidedChapters);
                    }
                  }
                  setIsConnecting(false);
                  setConnectionSource(null);
                }}
                onCancelConnection={() => {
                  setIsConnecting(false);
                  setConnectionSource(null);
                }}
                onRemoveConnection={handleRemoveConnection}
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
                onOpenInEditor={handleOpenInEditor}
              />
            ) : (
              // Braided List View with two-column layout
              <div className={`braided-layout ${draggedScene ? 'is-dragging' : ''} ${isConnecting ? 'is-connecting' : ''}`}>
                {/* Braided Timeline - Left side */}
                <div className="braided-timeline" ref={timelineRef}>
                  {/* Connection Lines SVG - positioned relative to timeline */}
                  <svg className="connection-lines">
                    {displayedScenes.map((scene, index) => {
                      const connections = sceneConnections[scene.id] || [];
                      const startY = scenePositions[scene.id];
                      if (startY === undefined) return null;

                      return connections.map(connId => {
                        const targetIndex = displayedScenes.findIndex(s => s.id === connId);
                        if (targetIndex === -1 || targetIndex <= index) return null;

                        const endY = scenePositions[connId];
                        if (endY === undefined) return null;

                        const distance = Math.abs(targetIndex - index);
                        const curveDepth = 20 + Math.min(distance, 6) * 8;
                        // Connect to the left edge of the scene card (at x=40 where padding ends)
                        const cardEdgeX = 38;

                        const isHighlighted =
                          scene.id === hoveredSceneId ||
                          scene.id === selectedSceneId ||
                          connId === hoveredSceneId ||
                          connId === selectedSceneId;

                        return (
                          <path
                            key={`${scene.id}-${connId}`}
                            d={`M ${cardEdgeX} ${startY} C ${cardEdgeX - curveDepth} ${startY}, ${cardEdgeX - curveDepth} ${endY}, ${cardEdgeX} ${endY}`}
                            className={`connection-line ${isHighlighted ? 'highlighted' : ''}`}
                            onClick={() => setSelectedSceneId(scene.id)}
                          />
                        );
                      });
                    })}
                  </svg>
                  {isConnecting && (
                    <div className="connecting-banner">
                      Click another scene to connect, or <button onClick={() => { setIsConnecting(false); setConnectionSource(null); }}>cancel</button>
                    </div>
                  )}
                  {displayedScenes.length === 0 && (
                    <div
                      className={`drop-zone empty-timeline ${dropTargetIndex === 0 ? 'active' : ''}`}
                      onDragOver={(e) => handleDragOverTimeline(e, 0)}
                      onDrop={(e) => handleDropOnTimeline(e, 0)}
                    >
                      Drag scenes here to start braiding
                    </div>
                  )}
                  {displayedScenes.map((scene, index) => {
                    const displayPosition = index + 1;
                    const chapterBefore = braidedChapters.find(ch => ch.beforePosition === displayPosition);

                    return (
                      <div key={scene.id}>
                        {/* Chapter header before this scene */}
                        {chapterBefore && (
                          <div
                            className={`braided-chapter ${draggedChapter?.id === chapterBefore.id ? 'dragging' : ''}`}
                            draggable
                            onDragStart={(e) => {
                              setDraggedChapter(chapterBefore);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', chapterBefore.id);
                            }}
                            onDragEnd={() => setDraggedChapter(null)}
                          >
                            <span className="chapter-drag-handle">⋮⋮</span>
                            <input
                              type="text"
                              className="braided-chapter-title"
                              defaultValue={chapterBefore.title}
                              onBlur={(e) => {
                                if (e.target.value !== chapterBefore.title) {
                                  handleUpdateChapter(chapterBefore.id, e.target.value);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              className="delete-chapter-btn"
                              onClick={() => handleDeleteChapter(chapterBefore.id)}
                              title="Delete chapter"
                            >
                              ×
                            </button>
                          </div>
                        )}

                        {/* Drop zone for moving chapters here, or add chapter button */}
                        {!chapterBefore && (
                          draggedChapter ? (
                            <div
                              className="chapter-drop-zone"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (draggedChapter) {
                                  handleMoveChapter(draggedChapter.id, displayPosition);
                                  setDraggedChapter(null);
                                }
                              }}
                            >
                              Move chapter here
                            </div>
                          ) : addingChapterAtPosition === displayPosition ? (
                            <div className="add-chapter-inline-container">
                              <input
                                type="text"
                                className="add-chapter-input"
                                placeholder="Chapter title..."
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const input = e.target as HTMLInputElement;
                                    if (input.value.trim()) {
                                      handleAddChapter(input.value.trim(), displayPosition);
                                      setAddingChapterAtPosition(null);
                                    }
                                  } else if (e.key === 'Escape') {
                                    setAddingChapterAtPosition(null);
                                  }
                                }}
                                onBlur={(e) => {
                                  if (e.target.value.trim()) {
                                    handleAddChapter(e.target.value.trim(), displayPosition);
                                  }
                                  setAddingChapterAtPosition(null);
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              className="add-chapter-inline-btn"
                              onClick={() => setAddingChapterAtPosition(displayPosition)}
                            >
                              + Chapter
                            </button>
                          )
                        )}

                        <div className="braided-scene-wrapper" data-scene-id={scene.id}>
                          {/* Drop zone before this scene */}
                          <div
                            className={`drop-zone ${dropTargetIndex === index ? 'active' : ''}`}
                            onDragOver={(e) => handleDragOverTimeline(e, index)}
                            onDrop={(e) => handleDropOnTimeline(e, index)}
                          />
                          <div
                            draggable={canDragScene}
                            onDragStart={(e) => {
                              if (canDragScene) {
                                handleDragStart(e, scene);
                              } else {
                                e.preventDefault();
                              }
                            }}
                            onDragEnd={() => {
                              handleDragEnd();
                              setCanDragScene(false);
                            }}
                            onClick={(e) => {
                              if (isConnecting && connectionSource && connectionSource !== scene.id) {
                                handleSceneClick(scene, e);
                              } else {
                                setListFloatingEditor(scene);
                              }
                            }}
                            onMouseEnter={() => setHoveredSceneId(scene.id)}
                            onMouseLeave={() => setHoveredSceneId(null)}
                            className={`braided-scene-item compact ${draggedScene?.id === scene.id ? 'dragging' : ''} ${selectedSceneId === scene.id ? 'selected' : ''} ${isConnecting && connectionSource !== scene.id ? 'connect-target' : ''} ${(sceneConnections[scene.id]?.length || 0) > 0 ? 'has-connections' : ''}`}
                            style={showPovColors ? { backgroundColor: getCharacterColor(scene.characterId) } : { borderLeftColor: getCharacterHexColor(scene.characterId), borderLeftWidth: '3px' }}
                          >
                            <span
                              className="braided-drag-handle"
                              onMouseDown={() => setCanDragScene(true)}
                            >
                              ⋮⋮
                            </span>
                            <span className="braided-scene-number">{displayPosition}.</span>
                            <span className="braided-scene-title">
                              {scene.content.replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '').replace(/#\w+/g, '').trim()}
                            </span>
                            <span className="braided-scene-character">{getCharacterName(scene.characterId)}</span>
                            <span className="braided-scene-meta">
                              {scene.plotPointId && projectData.plotPoints.find(p => p.id === scene.plotPointId) && (
                                <span className="braided-scene-plotpoint">{projectData.plotPoints.find(p => p.id === scene.plotPointId)!.title}</span>
                              )}
                              <span className="braided-scene-scenenumber">Scene {scene.sceneNumber}</span>
                            </span>
                            {(sceneConnections[scene.id]?.length || 0) > 0 && (
                              <span className="braided-scene-connections-badge">{sceneConnections[scene.id].length}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Drop zone at the end */}
                  {displayedScenes.length > 0 && (
                    <div
                      className={`drop-zone ${dropTargetIndex === displayedScenes.length ? 'active' : ''}`}
                      onDragOver={(e) => handleDragOverTimeline(e, displayedScenes.length)}
                      onDrop={(e) => handleDropOnTimeline(e, displayedScenes.length)}
                    />
                  )}

                  {/* Add Chapter button/input */}
                  {displayedScenes.length > 0 && (
                    isAddingChapter ? (
                      <div className="add-chapter-input-container">
                        <input
                          type="text"
                          className="add-chapter-input"
                          placeholder="Chapter title..."
                          value={newChapterTitle}
                          onChange={(e) => setNewChapterTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newChapterTitle.trim()) {
                              // Find next available position (after last chapter or at start if no chapters)
                              const existingPositions = braidedChapters.map(ch => ch.beforePosition);
                              let newPosition = 1;
                              // Find a position that doesn't already have a chapter
                              while (existingPositions.includes(newPosition) && newPosition <= displayedScenes.length) {
                                newPosition++;
                              }
                              handleAddChapter(newChapterTitle, newPosition);
                            } else if (e.key === 'Escape') {
                              setIsAddingChapter(false);
                              setNewChapterTitle('');
                            }
                          }}
                          autoFocus
                        />
                        <button
                          className="add-chapter-confirm-btn"
                          onClick={() => {
                            // Find next available position
                            const existingPositions = braidedChapters.map(ch => ch.beforePosition);
                            let newPosition = 1;
                            while (existingPositions.includes(newPosition) && newPosition <= displayedScenes.length) {
                              newPosition++;
                            }
                            handleAddChapter(newChapterTitle, newPosition);
                          }}
                          disabled={!newChapterTitle.trim()}
                        >
                          Add
                        </button>
                        <button
                          className="add-chapter-cancel-btn"
                          onClick={() => {
                            setIsAddingChapter(false);
                            setNewChapterTitle('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="add-section-btn"
                        onClick={() => setIsAddingChapter(true)}
                      >
                        + Add Chapter
                      </button>
                    )
                  )}
                </div>

                {/* To Braid Inbox - Right sidebar */}
                <div
                  className="to-braid-inbox"
                  onDragOver={handleDragOverInbox}
                  onDrop={handleDropOnInbox}
                >
                  <div className="inbox-header">
                    <h2 className="inbox-title">To Braid</h2>
                    <select
                      className="inbox-char-filter"
                      value={listInboxCharFilter}
                      onChange={(e) => setListInboxCharFilter(e.target.value)}
                    >
                      <option value="all">All Characters</option>
                      {projectData.characters.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="inbox-characters">
                    {projectData.characters.filter(c => listInboxCharFilter === 'all' || c.id === listInboxCharFilter).map(char => {
                      const charPlotPointMap = unbraidedScenesByCharacter.get(char.id);
                      const charPlotPoints = projectData.plotPoints
                        .filter(p => p.characterId === char.id)
                        .sort((a, b) => a.order - b.order);

                      // Calculate total unbraided scenes for this character
                      let totalUnbraided = 0;
                      if (charPlotPointMap) {
                        for (const scenes of charPlotPointMap.values()) {
                          totalUnbraided += scenes.length;
                        }
                      }

                      const charColor = getCharacterHexColor(char.id);

                      return (
                        <div key={char.id} className="inbox-character-group">
                          <div className="inbox-character-header">
                            <div className="inbox-character-color" style={{ backgroundColor: charColor }} />
                            <h3 className="inbox-character-name">{char.name}</h3>
                            {totalUnbraided > 0 && (
                              <span className="inbox-character-count">{totalUnbraided}</span>
                            )}
                          </div>
                          <div className="inbox-scenes">
                            {totalUnbraided > 0 ? (
                              <>
                                {charPlotPoints.map(plotPoint => {
                                  const plotPointScenes = charPlotPointMap?.get(plotPoint.id);
                                  if (!plotPointScenes || plotPointScenes.length === 0) return null;
                                  return (
                                    <div key={plotPoint.id} className="inbox-plot-point-group">
                                      <div className="inbox-plot-point-header">{plotPoint.title}</div>
                                      {plotPointScenes.map(scene => (
                                        <div
                                          key={scene.id}
                                          className="inbox-scene"
                                          style={{ '--char-color': charColor } as React.CSSProperties}
                                          draggable
                                          onDragStart={(e) => handleDragStart(e, scene)}
                                          onDragEnd={handleDragEnd}
                                        >
                                          <span className="inbox-scene-number">{scene.sceneNumber}.</span>
                                          <span className="inbox-scene-title">{scene.content.replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                                {/* Scenes without plot point */}
                                {charPlotPointMap?.get('no-plot-point')?.map(scene => (
                                  <div
                                    key={scene.id}
                                    className="inbox-scene"
                                    style={{ '--char-color': charColor } as React.CSSProperties}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, scene)}
                                    onDragEnd={handleDragEnd}
                                  >
                                    <span className="inbox-scene-number">{scene.sceneNumber}.</span>
                                    <span className="inbox-scene-title">{scene.content.replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')}</span>
                                  </div>
                                ))}
                              </>
                            ) : (
                              <div className="inbox-empty">All braided</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Floating Editor for braided list view */}
                {listFloatingEditor && (
                  <FloatingEditor
                    scene={listFloatingEditor}
                    draftContent={draftContent[`${listFloatingEditor.characterId}:${listFloatingEditor.sceneNumber}`] || ''}
                    characterName={getCharacterName(listFloatingEditor.characterId)}
                    tags={projectData.tags}
                    connectedScenes={getConnectedScenes(listFloatingEditor.id)}
                    onClose={() => setListFloatingEditor(null)}
                    onSceneChange={handleSceneChange}
                    onTagsChange={handleTagsChange}
                    onCreateTag={handleCreateTag}
                    onStartConnection={() => {
                      setConnectionSource(listFloatingEditor.id);
                      setIsConnecting(true);
                      setListFloatingEditor(null);
                    }}
                    onRemoveConnection={(targetId) => handleRemoveConnection(listFloatingEditor.id, targetId)}
                    onWordCountChange={handleWordCountChange}
                    onDraftChange={handleDraftChange}
                    onOpenInEditor={handleOpenInEditor}
                  />
                )}
              </div>
            )}

            {displayedScenes.length === 0 && (
              <div className="welcome-screen">
                <p>No scenes found{activeFilters.size > 0 ? ' matching current filters' : ''}.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tag Manager Modal */}
      {showTagManager && (
        <TagManager
          tags={projectData.tags}
          onUpdateTag={handleUpdateTag}
          onCreateTag={handleCreateTag}
          onDeleteTag={handleDeleteTag}
          onClose={() => setShowTagManager(false)}
        />
      )}

      {/* Character Manager Modal */}
      {showCharacterManager && (
        <CharacterManager
          characters={projectData.characters}
          characterColors={characterColors}
          onClose={() => setShowCharacterManager(false)}
          onCreateCharacter={handleCreateCharacter}
          onRenameCharacter={handleRenameCharacter}
          onColorChange={handleCharacterColorChange}
          onDeleteCharacter={handleDeleteCharacter}
        />
      )}

      {/* Font Picker Modal */}
      {showFontPicker && (
        <FontPicker
          fontSettings={fontSettings}
          onFontSettingsChange={handleFontSettingsChange}
          onClose={() => setShowFontPicker(false)}
        />
      )}

      {/* Compile Modal */}
      {showCompileModal && projectData && (
        <CompileModal
          scenes={projectData.scenes}
          characters={projectData.characters}
          plotPoints={projectData.plotPoints}
          chapters={braidedChapters}
          draftContent={draftContent}
          onClose={() => setShowCompileModal(false)}
        />
      )}

      {/* Archive Panel Modal */}
      {showArchivePanel && (
        <div className="modal-overlay" onClick={() => setShowArchivePanel(false)}>
          <div className="modal archive-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Archive</h3>
              <button className="modal-close-btn" onClick={() => setShowArchivePanel(false)}>×</button>
            </div>
            <div className="archive-modal-body">
              {archivedScenes.length === 0 ? (
                <p className="archive-empty">No archived scenes. Archived scenes appear here and can be restored at any time.</p>
              ) : (
                <div className="archive-scenes-list">
                  {[...archivedScenes].sort((a, b) => b.archivedAt - a.archivedAt).map(archived => {
                    const charName = projectData?.characters.find(c => c.id === archived.characterId)?.name || 'Unknown';
                    const cleanContent = archived.content
                      .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
                      .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
                    const archivedDate = new Date(archived.archivedAt).toLocaleDateString();
                    return (
                      <div key={archived.id} className="archive-scene-item">
                        <div className="archive-scene-info">
                          <span className="archive-scene-char">{charName}</span>
                          <span className="archive-scene-num">Scene {archived.originalSceneNumber}</span>
                          <span className="archive-scene-date">{archivedDate}</span>
                        </div>
                        <p className="archive-scene-content">{cleanContent || 'Untitled scene'}</p>
                        {archived.notes.length > 0 && (
                          <p className="archive-scene-notes">{archived.notes.length} note{archived.notes.length !== 1 ? 's' : ''}</p>
                        )}
                        <button className="archive-restore-btn" onClick={() => handleRestoreScene(archived)}>
                          Restore
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
