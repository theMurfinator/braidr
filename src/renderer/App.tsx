import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { Character, Scene, PlotPoint, Tag, TagCategory, ProjectData, BraidedChapter, RecentProject, ProjectTemplate, FontSettings, AllFontSettings, ScreenKey, ArchivedScene, MetadataFieldDef, DraftVersion, NoteMetadata, LicenseStatus } from '../shared/types';
import EditorView, { EditorViewHandle } from './components/EditorView';
import CompileModal from './components/CompileModal';
import { dataService } from './services/dataService';
import SceneCard from './components/SceneCard';
import PlotPointSection from './components/PlotPointSection';
import FilterBar from './components/FilterBar';
import TagManager from './components/TagManager';
import SceneDetailPanel from './components/SceneDetailPanel';
import CharacterManager from './components/CharacterManager';
import RailsView from './components/RailsView';
import TableView from './components/TableView';
import FloatingEditor from './components/FloatingEditor';
import FontPicker from './components/FontPicker';
import NotesView from './components/notes/NotesView';
import WordCountDashboard from './components/WordCountDashboard';
import AccountView from './components/AccountView';
import SearchOverlay from './components/SearchOverlay';
import { useHistory } from './hooks/useHistory';
import { useToast } from './components/ToastContext';
import { extractTodosFromNotes, toggleTodoInNoteHtml, SceneTodo } from './utils/parseTodoWidgets';
import { createSessionTracker, mergeSessionIntoAnalytics, SessionTracker, SessionSummary } from './services/sessionTracker';
import { AnalyticsData, SceneSession, loadAnalytics, saveAnalytics, addManualTime, getSceneSessionsByDate, deleteSceneSession, getSceneSessionsList, appendSceneSession, getTodayStr } from './utils/analyticsStore';
import CheckinModal from './components/CheckinModal';
import FeedbackModal from './components/FeedbackModal';
import { UpdateBanner } from './components/UpdateBanner';
import UpdateModal from './components/UpdateModal';
import TourOverlay from './components/TourOverlay';
import braidrIcon from './assets/braidr-icon.png';
import braidrLogo from './assets/braidr-logo.png';
import { track } from './utils/posthogTracker';

type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'analytics' | 'account';
type BraidedSubMode = 'list' | 'table' | 'rails';

function App() {
  const { addToast } = useToast();
  const {
    state: projectData,
    set: setProjectData,
    undo: undoProjectData,
    redo: redoProjectData,
    canUndo,
    canRedo,
  } = useHistory<ProjectData | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [viewMode, _setViewMode] = useState<ViewMode>('pov');
  const setViewMode = (mode: ViewMode) => {
    _setViewMode(mode);
    localStorage.setItem('braidr-last-view-mode', mode);
    track('screen_viewed', { screen: mode });
  };
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
  const allFontSettingsRef = useRef<AllFontSettings>({ global: {} });
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [canDragScene, setCanDragScene] = useState(false);
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [draggedChapter, setDraggedChapter] = useState<BraidedChapter | null>(null);
  const [addingChapterAtPosition, setAddingChapterAtPosition] = useState<number | null>(null);
  const [draggedPovScene, setDraggedPovScene] = useState<Scene | null>(null);
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [allFontSettings, setAllFontSettings] = useState<AllFontSettings>({ global: {} });
  const sceneListRef = useRef<HTMLDivElement>(null);
  const [braidedSubMode, setBraidedSubMode] = useState<BraidedSubMode>('list');
  const [showRailsConnections, setShowRailsConnections] = useState(true);
  const [listFloatingEditor, setListFloatingEditor] = useState<Scene | null>(null);
  const [listInboxCharFilter, setListInboxCharFilter] = useState<string>('all');
  const [editorInitialSceneKey, setEditorInitialSceneKey] = useState<string | null>(null);
  const lastEditorSceneKeyRef = useRef<string | null>(localStorage.getItem('braidr-last-editor-scene'));
  const scrollToSceneIdRef = useRef<string | null>(null);
  const [archivedScenes, setArchivedScenes] = useState<ArchivedScene[]>([]);
  const archivedScenesRef = useRef<ArchivedScene[]>([]);
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [draftContent, setDraftContent] = useState<Record<string, string>>({});
  const draftContentRef = useRef<Record<string, string>>({});
  const [scratchpadContent, setScratchpadContent] = useState<Record<string, string>>({});
  const scratchpadContentRef = useRef<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftVersion[]>>({});
  const draftsRef = useRef<Record<string, DraftVersion[]>>({});
  const [metadataFieldDefs, setMetadataFieldDefs] = useState<MetadataFieldDef[]>([]);
  const metadataFieldDefsRef = useRef<MetadataFieldDef[]>([]);
  const [sceneMetadata, setSceneMetadata] = useState<Record<string, Record<string, string | string[]>>>({});
  const sceneMetadataRef = useRef<Record<string, Record<string, string | string[]>>>({});
  const [showCompileModal, setShowCompileModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showTour, setShowTour] = useState(() => localStorage.getItem('braidr-tour-version') !== '1');
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [wordCountGoal, setWordCountGoal] = useState(0);
  const wordCountGoalRef = useRef(0);
  const [searchNotesIndex, setSearchNotesIndex] = useState<NoteMetadata[]>([]);
  const [noteContentCache, setNoteContentCache] = useState<Record<string, string>>({});
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorViewHandle>(null);
  const isDirtyRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session tracker for time tracking
  const sessionTrackerRef = useRef<SessionTracker | null>(null);
  const analyticsRef = useRef<AnalyticsData | null>(null);
  const [sceneSessions, setSceneSessions] = useState<SceneSession[]>([]);
  const [pendingSession, setPendingSession] = useState<SessionSummary | null>(null);
  const [showManualCheckin, setShowManualCheckin] = useState(false);
  const pendingSessionRef = useRef<SessionSummary | null>(null);
  const pendingTotalWordsRef = useRef<number>(0);
  const isClosingRef = useRef(false);

  // Global writing timer (persists across view changes)
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerElapsed, setTimerElapsed] = useState(0); // seconds
  const [timerSceneKey, setTimerSceneKey] = useState<string | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerElapsed(prev => prev + 1);
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning]);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleStartTimer = useCallback((sceneKey: string) => {
    setTimerSceneKey(sceneKey);
    setTimerElapsed(0);
    setTimerRunning(true);
  }, []);

  const handleStopTimer = useCallback(() => {
    setTimerRunning(false);
    // Save elapsed time as a session when stopping the timer
    setTimerElapsed(prev => {
      if (prev >= 1 && timerSceneKey && analyticsRef.current && projectData) {
        const durationMs = prev * 1000;
        const now = Date.now();
        const session: SceneSession = {
          id: `timer-${now}-${Math.random().toString(36).slice(2, 8)}`,
          sceneKey: timerSceneKey,
          date: getTodayStr(),
          startTime: now - durationMs,
          endTime: now,
          durationMs,
          wordsNet: 0,
          checkin: null,
        };
        const updated = appendSceneSession(analyticsRef.current, session);
        analyticsRef.current = updated;
        setSceneSessions(updated.sceneSessions || []);
        saveAnalytics(projectData.projectPath, updated);
      }
      return 0; // reset elapsed
    });
    setTimerSceneKey(null);
  }, [timerSceneKey, projectData]);

  const handleResetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimerElapsed(0);
    setTimerSceneKey(null);
  }, []);

  const handleAddManualTime = useCallback((sceneKey: string, minutes: number) => {
    if (!analyticsRef.current || !projectData) return;
    const durationMs = minutes * 60 * 1000;
    const updated = addManualTime(analyticsRef.current, sceneKey, durationMs);
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);
  }, [projectData]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    if (!analyticsRef.current || !projectData) return;
    const updated = deleteSceneSession(analyticsRef.current, sessionId);
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);
  }, [projectData]);

  // Extract todo items from notes for display in editor sidebar
  const sceneTodos = useMemo(() => {
    if (searchNotesIndex.length === 0 || Object.keys(noteContentCache).length === 0) return [];
    return extractTodosFromNotes(noteContentCache, searchNotesIndex);
  }, [noteContentCache, searchNotesIndex]);

  // Inline todos (not linked to notes, per-scene)
  const [inlineTodos, setInlineTodos] = useState<Record<string, SceneTodo[]>>({});
  const inlineTodosRef = useRef<Record<string, SceneTodo[]>>({});

  // Combined todos: note-linked + inline
  const allSceneTodos = useMemo(() => {
    const inline = Object.values(inlineTodos).flat();
    return [...sceneTodos, ...inline];
  }, [sceneTodos, inlineTodos]);

  // Toggle a todo's done state (works for both note-linked and inline)
  const handleTodoToggle = useCallback(async (todo: SceneTodo) => {
    const newDone = !todo.done;

    if (todo.isInline) {
      // Update inline todo
      setInlineTodos(prev => {
        const updated = { ...prev };
        const list = (updated[todo.sceneKey] || []).map(t =>
          t.todoId === todo.todoId ? { ...t, done: newDone } : t
        );
        updated[todo.sceneKey] = list;
        inlineTodosRef.current = updated;
        isDirtyRef.current = true;
        return updated;
      });
    } else if (todo.noteFileName && projectData) {
      // Update note-linked todo: modify note HTML on disk
      try {
        const html = noteContentCache[todo.noteId];
        if (!html) return;
        const updatedHtml = toggleTodoInNoteHtml(html, todo.todoId, newDone);
        if (!updatedHtml) return;
        await dataService.saveNote(projectData.projectPath, todo.noteFileName, updatedHtml);
        // Update cache to reflect the change immediately
        setNoteContentCache(prev => ({ ...prev, [todo.noteId]: updatedHtml }));
      } catch (err) {
        console.error('Failed to toggle todo in note:', err);
      }
    }
  }, [noteContentCache, projectData]);

  // Add an inline todo for a scene
  const handleAddInlineTodo = useCallback((sceneKey: string, description: string) => {
    const newTodo: SceneTodo = {
      todoId: `inline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      noteTitle: '',
      noteId: '',
      noteFileName: '',
      description,
      done: false,
      sceneLabel: '',
      sceneKey,
      isInline: true,
    };
    setInlineTodos(prev => {
      const updated = { ...prev };
      updated[sceneKey] = [...(updated[sceneKey] || []), newTodo];
      inlineTodosRef.current = updated;
      isDirtyRef.current = true;
      return updated;
    });
  }, []);

  // Remove an inline todo
  const handleRemoveInlineTodo = useCallback((sceneKey: string, todoId: string) => {
    setInlineTodos(prev => {
      const updated = { ...prev };
      updated[sceneKey] = (updated[sceneKey] || []).filter(t => t.todoId !== todoId);
      if (updated[sceneKey].length === 0) delete updated[sceneKey];
      inlineTodosRef.current = updated;
      isDirtyRef.current = true;
      return updated;
    });
  }, []);

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

  // Close settings menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showSettingsMenu && settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsMenu]);

  // Fetch license status for account display
  useEffect(() => {
    (window as any).electronAPI?.getLicenseStatus?.().then((result: any) => {
      if (result?.success && result.data) {
        setLicenseStatus(result.data);
      }
    }).catch(() => {});
  }, []);

  // Listen for navigation to account view (from LicenseGate or app menu)
  useEffect(() => {
    const handler = () => setViewMode('account');
    window.addEventListener('braidr-navigate-account', handler);
    const cleanup = (window as any).electronAPI?.onNavigateToAccount?.(handler);
    return () => {
      window.removeEventListener('braidr-navigate-account', handler);
      cleanup?.();
    };
  }, []);

  // Global error handler for uncaught renderer errors
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      track('crash_report', {
        source: 'renderer_global',
        error_message: e.message,
        error_stack: e.error?.stack?.substring(0, 2000),
        filename: e.filename,
        lineno: e.lineno,
      });
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      track('crash_report', {
        source: 'renderer_promise',
        error_message: String(e.reason?.message || e.reason),
        error_stack: e.reason?.stack?.substring(0, 2000),
      });
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
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

      // Cmd+K / Ctrl+K: Open search
      if (modifier && e.key === 'k') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undoProjectData, redoProjectData]);

  // Initialize session tracker when project loads
  useEffect(() => {
    if (!projectData) return;

    // Create the tracker
    const tracker = createSessionTracker();
    sessionTrackerRef.current = tracker;

    // Load analytics data for the project
    loadAnalytics(projectData.projectPath).then(data => {
      analyticsRef.current = data;
      setSceneSessions(data.sceneSessions || []);
    });

    // When a session ends, merge it into analytics and persist (no auto-pop check-in)
    tracker.setOnSessionEnd((summary) => {
      if (!analyticsRef.current || !projectData) return;

      // Calculate total project words from draftContent
      let totalWords = 0;
      for (const html of Object.values(draftContentRef.current)) {
        if (html && html !== '<p></p>') {
          const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          if (text) totalWords += text.split(/\s+/).length;
        }
      }

      // Always save immediately — check-in is manual only
      const updated = mergeSessionIntoAnalytics(analyticsRef.current, summary, totalWords, null);
      analyticsRef.current = updated;
      setSceneSessions(updated.sceneSessions || []);
      saveAnalytics(projectData.projectPath, updated);
      track('writing_session_ended', {
        duration_ms: summary.durationMs,
        words_net: summary.wordsNet,
        scene_key: summary.sceneKey,
        had_checkin: false,
      });
    });

    return () => {
      tracker.destroy();
      sessionTrackerRef.current = null;
    };
  }, [projectData?.projectPath]);

  // Check-in modal handlers
  const handleCheckinSubmit = useCallback((checkin: { energy: number; focus: number; mood: number }) => {
    const summary = pendingSessionRef.current;
    if (!summary || !analyticsRef.current || !projectData) return;

    const updated = mergeSessionIntoAnalytics(
      analyticsRef.current, summary, pendingTotalWordsRef.current, checkin
    );
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);
    track('writing_session_ended', {
      duration_ms: summary.durationMs,
      words_net: summary.wordsNet,
      scene_key: summary.sceneKey,
      had_checkin: true,
      checkin_energy: checkin.energy,
      checkin_focus: checkin.focus,
      checkin_mood: checkin.mood,
    });

    pendingSessionRef.current = null;
    setPendingSession(null);
  }, [projectData]);

  const handleCheckinSkip = useCallback(() => {
    const summary = pendingSessionRef.current;
    if (!summary || !analyticsRef.current || !projectData) return;

    const updated = mergeSessionIntoAnalytics(
      analyticsRef.current, summary, pendingTotalWordsRef.current, null
    );
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);

    pendingSessionRef.current = null;
    setPendingSession(null);
  }, [projectData]);

  // Manual (standalone) check-in handler
  const handleManualCheckinSubmit = useCallback((checkin: { energy: number; focus: number; mood: number }) => {
    if (!analyticsRef.current || !projectData) return;
    const session: SceneSession = {
      id: `ss-manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sceneKey: 'manual:checkin',
      date: getTodayStr(),
      startTime: Date.now(),
      endTime: Date.now(),
      durationMs: 0,
      wordsNet: 0,
      checkin,
    };
    const updated = appendSceneSession(analyticsRef.current, session);
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);
    setShowManualCheckin(false);
  }, [projectData]);

  // End session when switching away from editor view
  useEffect(() => {
    if (viewMode !== 'editor' && sessionTrackerRef.current?.isActive()) {
      // Get current word count for the scene being tracked
      const session = sessionTrackerRef.current.getCurrentSession();
      if (session) {
        const html = draftContentRef.current[session.sceneKey] || '';
        const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        const wordCount = text ? text.split(/\s+/).length : 0;
        sessionTrackerRef.current.endSession(wordCount);
      }
    }
  }, [viewMode]);

  // Lazy-load notes data when search opens or editor view needs todo items
  useEffect(() => {
    if ((showSearch || viewMode === 'editor') && projectData) {
      (async () => {
        try {
          const index = await dataService.loadNotesIndex(projectData.projectPath);
          setSearchNotesIndex(index.notes || []);
          const cache: Record<string, string> = {};
          for (const note of (index.notes || [])) {
            try {
              const content = await dataService.readNote(projectData.projectPath, note.fileName);
              cache[note.id] = content;
            } catch {}
          }
          setNoteContentCache(cache);
        } catch {}
      })();
    }
  }, [showSearch, viewMode]);

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
  const [railOrder, setRailOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('rails-character-order');
    return saved ? JSON.parse(saved) : [];
  });

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

  // Persist rail order to localStorage
  useEffect(() => {
    localStorage.setItem('rails-character-order', JSON.stringify(railOrder));
  }, [railOrder]);

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

    // Load font settings (with backward compat migration)
    let loadedAllFonts: AllFontSettings;
    if (data.allFontSettings) {
      loadedAllFonts = data.allFontSettings;
    } else if (data.fontSettings && Object.keys(data.fontSettings).length > 0) {
      loadedAllFonts = { global: data.fontSettings };
    } else {
      loadedAllFonts = { global: {} };
    }
    setAllFontSettings(loadedAllFonts);
    allFontSettingsRef.current = loadedAllFonts;
    applyFontSettings(loadedAllFonts.global);

    // Load archived scenes
    const loadedArchived = data.archivedScenes || [];
    setArchivedScenes(loadedArchived);
    archivedScenesRef.current = loadedArchived;

    // Load word count goal
    const loadedGoal = data.wordCountGoal || 0;
    setWordCountGoal(loadedGoal);
    wordCountGoalRef.current = loadedGoal;

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
    track('project_opened', {
      character_count: data.characters.length,
      scene_count: data.scenes.length,
      total_words: Object.values(data.wordCounts || {}).reduce((sum: number, wc: number) => sum + wc, 0),
    });

    // Load editor data
    const loadedDraft = data.draftContent || {};
    const loadedDrafts = data.drafts || {};
    const loadedScratchpad = data.scratchpad || {};
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
      ...Object.keys(loadedScratchpad),
      ...Object.keys(loadedMetaData),
    ]);
    const orphanedKeys = [...allStoredKeys].filter(k => !validKeys.has(k));
    if (orphanedKeys.length > 0) {
      for (const key of orphanedKeys) {
        delete loadedDraft[key];
        delete loadedDrafts[key];
        delete loadedScratchpad[key];
        delete loadedMetaData[key];
      }
      console.log('Cleaned up orphaned scene keys:', orphanedKeys);
    }

    setSceneMetadata(loadedMetaData);
    sceneMetadataRef.current = loadedMetaData;
    setDraftContent(loadedDraft);
    draftContentRef.current = loadedDraft;
    setScratchpadContent(loadedScratchpad);
    scratchpadContentRef.current = loadedScratchpad;
    setDrafts(loadedDrafts);
    draftsRef.current = loadedDrafts;

    // Load inline todos from sceneMetadata
    const loadedInlineTodos: Record<string, SceneTodo[]> = {};
    for (const [key, meta] of Object.entries(loadedMetaData)) {
      if (meta._inlineTodos && typeof meta._inlineTodos === 'string') {
        try {
          loadedInlineTodos[key] = JSON.parse(meta._inlineTodos);
        } catch {}
      }
    }
    setInlineTodos(loadedInlineTodos);
    inlineTodosRef.current = loadedInlineTodos;

    // Select first character by default
    if (data.characters.length > 0) {
      setSelectedCharacterId(data.characters[0].id);
    }

    // Restore last view mode
    const savedViewMode = localStorage.getItem('braidr-last-view-mode') as ViewMode | null;
    if (savedViewMode && ['pov', 'braided', 'editor', 'notes', 'analytics', 'account'].includes(savedViewMode)) {
      _setViewMode(savedViewMode);
    }

    // Add to recent projects with summary stats
    const totalWordCount = data.wordCounts
      ? Object.values(data.wordCounts as Record<string, number>).reduce((sum: number, wc: number) => sum + wc, 0)
      : 0;
    await dataService.addRecentProject({
      name,
      path: folderPath,
      lastOpened: Date.now(),
      characterCount: data.characters.length,
      sceneCount: data.scenes.length,
      totalWordCount,
      characterNames: data.characters.map((c: Character) => c.name),
      characterIds: data.characters.map((c: Character) => c.id),
      characterColors: data.characterColors || {},
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
        track('project_created', { template: newProjectTemplate });
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
      addToast('Couldn\u2019t save character rename');
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!projectData) return;

    const character = projectData.characters.find(c => c.id === characterId);
    if (!character) return;

    const sceneCount = projectData.scenes.filter(s => s.characterId === characterId).length;
    const confirmed = window.confirm(
      `Delete "${character.name}" and all ${sceneCount} of their scenes? This cannot be undone.`
    );
    if (!confirmed) return;

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
      track('backup_created');
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

  const extractShortTitle = (content: string): string => {
    const match = content.match(/==\*\*(.+?)\*\*==/);
    if (match) return match[1].replace(/#[a-zA-Z0-9_]+/g, '').trim();
    const cleaned = content
      .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
      .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
    if (cleaned.length > 60) return cleaned.substring(0, 57).trim() + '\u2026';
    return cleaned;
  };

  const cleanSceneContent = (content: string): string => {
    return content
      .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
      .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
  };

  // Apply global font settings to CSS variables on :root
  const applyFontSettings = (settings: FontSettings) => {
    const root = document.documentElement;
    const vars: Array<[keyof FontSettings, string, string?]> = [
      ['sectionTitle', '--font-section-title'],
      ['sectionTitleSize', '--font-section-title-size', 'px'],
      ['sectionTitleColor', '--font-section-title-color'],
      ['sceneTitle', '--font-scene-title'],
      ['sceneTitleSize', '--font-scene-title-size', 'px'],
      ['sceneTitleColor', '--font-scene-title-color'],
      ['body', '--font-body'],
      ['bodySize', '--font-body-size', 'px'],
      ['bodyColor', '--font-body-color'],
    ];
    for (const [key, varName, suffix] of vars) {
      const val = settings[key];
      if (val !== undefined && val !== null) {
        root.style.setProperty(varName, suffix ? `${val}${suffix}` : String(val));
      } else {
        root.style.removeProperty(varName);
      }
    }
    // Bold weight variables
    const boldVars: Array<[keyof FontSettings, string, boolean]> = [
      ['sectionTitleBold', '--font-section-title-weight', true],
      ['sceneTitleBold', '--font-scene-title-weight', true],
      ['bodyBold', '--font-body-weight', false],
    ];
    for (const [key, varName, defaultBold] of boldVars) {
      const val = settings[key];
      if (val !== undefined && val !== null) {
        root.style.setProperty(varName, val ? '700' : '400');
      } else {
        root.style.setProperty(varName, defaultBold ? '700' : '400');
      }
    }
  };

  // Apply per-screen font overrides on .scene-list (overrides :root when set)
  const applyScreenFontOverrides = (screen: ScreenKey | string, all: AllFontSettings) => {
    const el = sceneListRef.current;
    if (!el) return;
    const screenSettings = (all.screens as Record<string, FontSettings> | undefined)?.[screen];
    const vars: Array<[keyof FontSettings, string, string?]> = [
      ['sectionTitle', '--font-section-title'],
      ['sectionTitleSize', '--font-section-title-size', 'px'],
      ['sectionTitleColor', '--font-section-title-color'],
      ['sceneTitle', '--font-scene-title'],
      ['sceneTitleSize', '--font-scene-title-size', 'px'],
      ['sceneTitleColor', '--font-scene-title-color'],
      ['body', '--font-body'],
      ['bodySize', '--font-body-size', 'px'],
      ['bodyColor', '--font-body-color'],
    ];
    for (const [key, varName, suffix] of vars) {
      const val = screenSettings?.[key];
      if (val !== undefined && val !== null) {
        el.style.setProperty(varName, suffix ? `${val}${suffix}` : String(val));
      } else {
        el.style.removeProperty(varName);
      }
    }
    // Bold weight overrides
    const boldVars: Array<[keyof FontSettings, string]> = [
      ['sectionTitleBold', '--font-section-title-weight'],
      ['sceneTitleBold', '--font-scene-title-weight'],
      ['bodyBold', '--font-body-weight'],
    ];
    for (const [key, varName] of boldVars) {
      const val = screenSettings?.[key];
      if (val !== undefined && val !== null) {
        el.style.setProperty(varName, val ? '700' : '400');
      } else {
        el.style.removeProperty(varName);
      }
    }
  };

  // Reapply per-screen overrides when view changes
  useEffect(() => {
    applyScreenFontOverrides(viewMode, allFontSettingsRef.current);
  }, [viewMode]);


  // Handle font settings change (now receives AllFontSettings)
  const handleFontSettingsChange = async (settings: AllFontSettings) => {
    setAllFontSettings(settings);
    allFontSettingsRef.current = settings;
    applyFontSettings(settings.global);
    applyScreenFontOverrides(viewMode, settings);

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

      // Merge inline todos into sceneMetadata for persistence
      const metaWithTodos = { ...sceneMetadataRef.current };
      for (const [sceneKey, todos] of Object.entries(inlineTodosRef.current)) {
        if (!metaWithTodos[sceneKey]) metaWithTodos[sceneKey] = {};
        metaWithTodos[sceneKey] = { ...metaWithTodos[sceneKey], _inlineTodos: JSON.stringify(todos) };
      }
      // Clean up empty inline todo entries
      for (const key of Object.keys(metaWithTodos)) {
        if (!inlineTodosRef.current[key] && metaWithTodos[key]?._inlineTodos) {
          const { _inlineTodos, ...rest } = metaWithTodos[key];
          metaWithTodos[key] = rest;
        }
      }

      await dataService.saveTimeline(positions, connectionKeys, braidedChapters, characterColors, wordCounts, settings.global, archivedScenesRef.current, draftContentRef.current, metadataFieldDefsRef.current, metaWithTodos, draftsRef.current, wordCountGoalRef.current, settings, scratchpadContentRef.current);
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
      track('connection_created');
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

    const newScratchpad = remap(scratchpadContentRef.current);
    setScratchpadContent(newScratchpad);
    scratchpadContentRef.current = newScratchpad;
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
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
        addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
        addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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

    // Capture old keys before swapping scene numbers
    const oldNumbers = buildKeyMapBeforeRenumber([currentScene, prevScene]);

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

    // Remap scene-keyed data (drafts, metadata) to match new numbers
    const swappedScenes = updatedScenes.filter(s => s.id === currentScene.id || s.id === prevScene.id);
    applyKeyRemapAfterRenumber(swappedScenes, oldNumbers);

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const updatedCharScenes = updatedScenes.filter(s => s.characterId === selectedCharacterId);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === selectedCharacterId);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, updatedCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
      track('scene_reordered', { view: 'pov' });
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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

    // Capture old keys before swapping scene numbers
    const oldNumbers = buildKeyMapBeforeRenumber([currentScene, nextScene]);

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

    // Remap scene-keyed data (drafts, metadata) to match new numbers
    const swappedScenes = updatedScenes.filter(s => s.id === currentScene.id || s.id === nextScene.id);
    applyKeyRemapAfterRenumber(swappedScenes, oldNumbers);

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const updatedCharScenes = updatedScenes.filter(s => s.characterId === selectedCharacterId);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === selectedCharacterId);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, updatedCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections, braidedChapters);
      track('scene_reordered', { view: 'pov' });
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
          addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
          addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
      track('scene_created', { character_id: selectedCharacterId });
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
      setSaveStatus('saving');
      // Always use the current characterColors from ref
      // Merge inline todos into sceneMetadata for persistence
      const metaForSave = { ...sceneMetadataRef.current };
      for (const [sk, todos] of Object.entries(inlineTodosRef.current)) {
        if (!metaForSave[sk]) metaForSave[sk] = {};
        metaForSave[sk] = { ...metaForSave[sk], _inlineTodos: JSON.stringify(todos) };
      }
      for (const key of Object.keys(metaForSave)) {
        if (!inlineTodosRef.current[key] && metaForSave[key]?._inlineTodos) {
          const { _inlineTodos, ...rest } = metaForSave[key];
          metaForSave[key] = rest;
        }
      }
      await dataService.saveTimeline(positions, keyConnections, chapters, characterColorsRef.current, sceneWordCounts, allFontSettingsRef.current.global, archivedScenesRef.current, draftContentRef.current, metadataFieldDefsRef.current, metaForSave, draftsRef.current, wordCountGoalRef.current, allFontSettingsRef.current, scratchpadContentRef.current);
      isDirtyRef.current = false;
      setSaveStatus('saved');
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
      saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      addToast('Couldn\u2019t save timeline data');
      setSaveStatus('idle');
    }
  }, []);

  // Auto-save every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (projectData && isDirtyRef.current) {
        // Flush any pending editor content first
        editorViewRef.current?.flush();
        saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [projectData, sceneConnections, braidedChapters, saveTimelineData]);

  // Flush and save on window close / beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      editorViewRef.current?.flush();
      // Trigger a save (best-effort since beforeunload doesn't wait for async)
      if (projectData) {
        saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [projectData, sceneConnections, braidedChapters, saveTimelineData]);

  // Listen for app-closing IPC from main process (graceful quit)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onAppClosing) {
      const cleanup = api.onAppClosing(async () => {
        isClosingRef.current = true;
        editorViewRef.current?.flush();
        // End current writing session before closing
        if (sessionTrackerRef.current?.isActive()) {
          const session = sessionTrackerRef.current.getCurrentSession();
          if (session) {
            const html = draftContentRef.current[session.sceneKey] || '';
            const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
            const wordCount = text ? text.split(/\s+/).length : 0;
            sessionTrackerRef.current.endSession(wordCount);
          }
        }
        if (projectData) {
          await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
        }
        api.safeToClose();
      });
      return cleanup;
    }
  }, [projectData, sceneConnections, braidedChapters, saveTimelineData]);

  // Listen for "Check for Updates" menu click
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onShowUpdateModal) {
      const cleanup = api.onShowUpdateModal(() => {
        setShowUpdateModal(true);
      });
      return cleanup;
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
    track('scene_reordered', { view: 'braided' });
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
    isDirtyRef.current = true;
    const updated = { ...draftContent, [sceneKey]: html };
    setDraftContent(updated);
    draftContentRef.current = updated;

    // Notify session tracker of editing activity
    if (sessionTrackerRef.current) {
      const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const wordCount = text ? text.split(/\s+/).length : 0;
      sessionTrackerRef.current.recordActivity(sceneKey, wordCount);
    }

    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  const handleScratchpadChange = (sceneKey: string, html: string) => {
    isDirtyRef.current = true;
    const updated = { ...scratchpadContentRef.current, [sceneKey]: html };
    setScratchpadContent(updated);
    scratchpadContentRef.current = updated;
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
    track('scene_deleted', { character_id: scene.characterId });

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
        addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
        addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
          addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
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
        {!showUpdateModal && <UpdateBanner />}
        <div className="main-content welcome-main-content">
          <div className="welcome-screen">
            {!showNewProject ? (
              <>
                <div className="welcome-header">
                  <img src={braidrLogo} alt="Braidr" className="welcome-logo" />
                </div>

                <div className="welcome-grid">
                  {/* New Novel card */}
                  <button
                    className="welcome-new-card"
                    onClick={() => setShowNewProject(true)}
                    disabled={loading}
                  >
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M16 10v12M10 16h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span className="welcome-new-label">New Novel</span>
                  </button>

                  {/* Project cards */}
                  {recentProjects.map(project => {
                    const charNames = project.characterNames || [];
                    const charIds = project.characterIds || [];
                    const colors = project.characterColors || {};
                    const defaultColors = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#f59e0b'];
                    // Map each character to their color using ID lookup with fallback
                    const charColors = charNames.map((_, i) => {
                      const id = charIds[i];
                      return (id && colors[id]) || defaultColors[i % defaultColors.length];
                    });
                    const initials = charNames.slice(0, 4).map(name => {
                      const parts = name.trim().split(/\s+/);
                      return parts.length >= 2
                        ? (parts[0][0] + parts[1][0]).toUpperCase()
                        : name.substring(0, 2).toUpperCase();
                    });
                    const extraCount = charNames.length > 4 ? charNames.length - 4 : 0;

                    return (
                      <button
                        key={project.path}
                        className="welcome-project-card"
                        onClick={() => handleOpenRecentProject(project)}
                        disabled={loading}
                      >
                        <div className="welcome-card-color-bar">
                          {charColors.slice(0, 5).map((color, i) => (
                            <span key={i} className="welcome-card-color-segment" style={{ background: color }} />
                          ))}
                        </div>
                        <div className="welcome-card-body">
                          <div className="welcome-card-title">{project.name}</div>
                          <div className="welcome-card-stats">
                            {(project.characterCount || 0) > 0 || (project.sceneCount || 0) > 0 ? (
                              <>
                                {(project.characterCount || 0) > 0 && (
                                  <>{project.characterCount} Perspective{(project.characterCount || 0) !== 1 ? 's' : ''}</>
                                )}
                                {(project.sceneCount || 0) > 0 && (
                                  <>{(project.characterCount || 0) > 0 ? ' · ' : ''}{project.sceneCount} Scene{(project.sceneCount || 0) !== 1 ? 's' : ''}</>
                                )}
                                {(project.totalWordCount ?? 0) > 0 && (
                                  <>{' · '}{((project.totalWordCount || 0) / 1000).toFixed(1)}k words</>
                                )}
                              </>
                            ) : (
                              <>Opened {new Date(project.lastOpened).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                            )}
                          </div>
                          <div className="welcome-card-bottom">
                            <div className="welcome-card-avatars">
                              {initials.map((ini, i) => (
                                <span
                                  key={i}
                                  className="welcome-card-avatar"
                                  style={{ background: charColors[i] || '#9CA3AF' }}
                                >
                                  {ini}
                                </span>
                              ))}
                              {extraCount > 0 && (
                                <span className="welcome-card-avatar welcome-card-avatar-extra">+{extraCount}</span>
                              )}
                            </div>
                            <svg className="welcome-card-arrow" width="18" height="18" viewBox="0 0 20 20" fill="none">
                              <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  className="welcome-import-btn"
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
        {showUpdateModal && (
          <UpdateModal onClose={() => setShowUpdateModal(false)} />
        )}
      </div>
    );
  }

  // Word count goal change handler
  const handleWordCountGoalChange = async (goal: number) => {
    setWordCountGoal(goal);
    wordCountGoalRef.current = goal;
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
    }
  };

  return (
    <div className="app">
      {!showUpdateModal && <UpdateBanner />}
      {licenseStatus?.state === 'trial' && licenseStatus.trialDaysRemaining !== undefined && licenseStatus.trialDaysRemaining <= 3 && (
        <div className="trial-expiry-banner">
          <span>
            {licenseStatus.trialDaysRemaining === 0
              ? 'Your free trial expires today.'
              : `Your free trial expires in ${licenseStatus.trialDaysRemaining} day${licenseStatus.trialDaysRemaining !== 1 ? 's' : ''}.`}
          </span>
          <button onClick={() => (window as any).electronAPI?.openPurchaseUrl?.()}>
            Subscribe Now
          </button>
        </div>
      )}
      {/* Left sidebar navigation */}
      <nav className="app-sidebar" aria-label="Main navigation">
        <img src={braidrIcon} alt="Braidr" className="app-sidebar-logo" />
        <button
          className={`app-sidebar-btn ${viewMode === 'pov' ? 'active' : ''}`}
          onClick={() => setViewMode('pov')}
          title="POV Outline"
          aria-label="POV Outline view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h16M4 12h10M4 18h13"/>
          </svg>
          <span className="app-sidebar-label">Outline</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'braided' ? 'active' : ''}`}
          onClick={() => setViewMode('braided')}
          title="Braided Timeline"
          aria-label="Braided Timeline view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>
          </svg>
          <span className="app-sidebar-label">Timeline</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'editor' ? 'active' : ''}`}
          onClick={() => { setEditorInitialSceneKey(null); setViewMode('editor'); }}
          title="Editor"
          aria-label="Editor view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
          <span className="app-sidebar-label">Editor</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'notes' ? 'active' : ''}`}
          onClick={() => setViewMode('notes')}
          title="Notes"
          aria-label="Notes view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="13" x2="15" y2="13"/>
            <line x1="9" y1="17" x2="13" y2="17"/>
          </svg>
          <span className="app-sidebar-label">Notes</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'analytics' ? 'active' : ''}`}
          onClick={() => setViewMode('analytics')}
          title="Analytics"
          aria-label="Analytics view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="12" width="4" height="9"/>
            <rect x="10" y="6" width="4" height="15"/>
            <rect x="17" y="2" width="4" height="19"/>
          </svg>
          <span className="app-sidebar-label">Analytics</span>
        </button>
        <div className="app-sidebar-spacer" />
        <button
          className="app-sidebar-btn"
          onClick={() => setShowSearch(true)}
          title="Search (Cmd+K)"
          aria-label="Search scenes and notes"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span className="app-sidebar-label">Search</span>
        </button>
      </nav>

      <div className="app-body">
      {/* Unified Toolbar */}
      <div className="app-toolbar">
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
          ) : viewMode === 'braided' ? (
            <div className="sub-view-toggle">
              <button
                className={braidedSubMode === 'list' ? 'active' : ''}
                onClick={() => { setBraidedSubMode('list'); track('braided_subview_changed', { subview: 'list' }); }}
              >
                List
              </button>
              <button
                className={braidedSubMode === 'table' ? 'active' : ''}
                onClick={() => { setBraidedSubMode('table'); track('braided_subview_changed', { subview: 'table' }); }}
              >
                Table
              </button>
              <button
                className={braidedSubMode === 'rails' ? 'active' : ''}
                onClick={() => { setBraidedSubMode('rails'); track('braided_subview_changed', { subview: 'rails' }); }}
              >
                Rails
              </button>
            </div>
          ) : (
            <h1>{projectData.projectName || 'Braidr'}</h1>
          )}
          {viewMode === 'pov' && (
            <>
              <div className="toolbar-divider" />
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
          )}
          {viewMode === 'braided' && (
            <>
              <div className="toolbar-divider" />
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
          {saveStatus !== 'idle' && (
            <span className={`save-indicator ${saveStatus}`}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
          {viewMode !== 'editor' && viewMode !== 'notes' && projectData.tags.length > 0 && (
            <FilterBar
              tags={projectData.tags}
              activeFilters={activeFilters}
              onToggleFilter={handleToggleFilter}
            />
          )}
          {/* Global writing timer indicator */}
          {timerSceneKey && (() => {
            const [charId, sceneNumStr] = timerSceneKey.split(':');
            const char = projectData?.characters.find(c => c.id === charId);
            const label = char ? `${char.name} #${sceneNumStr}` : `Scene ${sceneNumStr}`;
            return (
              <button
                className={`toolbar-timer-pill ${timerRunning ? 'running' : 'paused'}`}
                onClick={() => {
                  if (timerRunning) {
                    handleStopTimer();
                  } else {
                    setTimerRunning(true);
                  }
                }}
                title={timerRunning ? 'Pause timer' : 'Resume timer'}
              >
                <span className={`toolbar-timer-dot ${timerRunning ? 'running' : ''}`} />
                <span className="toolbar-timer-time">{formatTimer(timerElapsed)}</span>
                <span className="toolbar-timer-scene">{label}</span>
              </button>
            );
          })()}
          {timerSceneKey && (
            <button
              className="toolbar-checkin-btn"
              onClick={() => setShowManualCheckin(true)}
              title="Mood check-in"
            >Check in</button>
          )}
          <button
            className="icon-btn"
            onClick={() => setShowSearch(true)}
            title="Search (Cmd+K)"
            aria-label="Search scenes and notes"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button
            className={`icon-btn ${!canUndo ? 'disabled' : ''}`}
            onClick={undoProjectData}
            disabled={!canUndo}
            title="Undo (Cmd+Z)"
            aria-label="Undo"
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
            aria-label="Redo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 7v6h-6"/>
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.4 2.6L21 13"/>
            </svg>
          </button>
          <div className="toolbar-divider" />
          <div className="settings-menu-container" ref={settingsMenuRef}>
            <button
              className={`icon-btn ${showSettingsMenu ? 'active' : ''}`}
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="Settings & Tools"
              aria-label="Settings and tools menu"
              aria-expanded={showSettingsMenu}
              aria-haspopup="true"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <circle cx="12" cy="5" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="12" cy="19" r="2"/>
              </svg>
            </button>
            {showSettingsMenu && (
              <div className="settings-dropdown">
                {licenseStatus && (
                  <>
                    <div className="settings-account-header" style={{ cursor: 'pointer' }} onClick={() => { setViewMode('account'); setShowSettingsMenu(false); }}>
                      <div className="settings-account-icon">
                        {licenseStatus.email ? licenseStatus.email.charAt(0).toUpperCase() : 'B'}
                      </div>
                      <div className="settings-account-info">
                        <span className="settings-account-email">
                          {licenseStatus.email || 'Braidr'}
                        </span>
                        <span className="settings-account-status">
                          {licenseStatus.state === 'licensed'
                            ? (licenseStatus.cancelAtPeriodEnd && licenseStatus.expiresAt
                                ? `Cancels ${new Date(licenseStatus.expiresAt).toLocaleDateString()}`
                                : licenseStatus.expiresAt
                                  ? `Renews ${new Date(licenseStatus.expiresAt).toLocaleDateString()}`
                                  : 'Active')
                            : licenseStatus.state === 'trial' ? `Trial \u2014 ${licenseStatus.trialDaysRemaining} day${licenseStatus.trialDaysRemaining !== 1 ? 's' : ''} left` :
                           licenseStatus.state === 'expired' ? 'Expired' :
                           'Free'}
                          {' \u00B7 v' + (__APP_VERSION__)}
                        </span>
                      </div>
                    </div>
                    <div className="settings-dropdown-divider" />
                  </>
                )}
                <button onClick={() => { setShowCompileModal(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  Compile
                </button>
                <button onClick={() => { setViewMode('analytics'); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="12" width="4" height="9"/>
                    <rect x="10" y="6" width="4" height="15"/>
                    <rect x="17" y="2" width="4" height="19"/>
                  </svg>
                  Goals & Analytics
                </button>
                <button onClick={() => { setShowManualCheckin(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                  Mood Check-in
                </button>
                <div className="settings-dropdown-divider" />
                <button onClick={() => { setShowCharacterManager(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Characters
                </button>
                <button onClick={() => { setShowTagManager(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                  Tags
                </button>
                <button onClick={() => { setShowFontPicker(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 7 4 4 20 4 20 7"/>
                    <line x1="9" y1="20" x2="15" y2="20"/>
                    <line x1="12" y1="4" x2="12" y2="20"/>
                  </svg>
                  Fonts
                </button>
                <button onClick={() => { setShowArchivePanel(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="21 8 21 21 3 21 3 8"/>
                    <rect x="1" y="3" width="22" height="5"/>
                    <line x1="10" y1="12" x2="14" y2="12"/>
                  </svg>
                  Archive{archivedScenes.length > 0 ? ` (${archivedScenes.length})` : ''}
                </button>
                <div className="settings-dropdown-divider" />
                <button onClick={() => { handleBackupProject(); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 15 3 15 7"/>
                  </svg>
                  Backup
                </button>
                <button onClick={async () => {
                  if (isDirtyRef.current) {
                    editorViewRef.current?.flush();
                    if (projectData) {
                      await saveTimelineData(projectData.scenes, sceneConnections, braidedChapters);
                    }
                  }
                  setProjectData(null);
                  setShowSettingsMenu(false);
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                  Switch Project
                </button>
                <div className="settings-dropdown-divider" />
                <button onClick={() => { setViewMode('account'); setShowSettingsMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Account
                  </button>
                <button onClick={() => { setShowTour(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Take a Tour
                </button>
                <button onClick={() => { setShowFeedbackModal(true); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  Send Feedback
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={`main-content main-content--${viewMode}`}
        style={viewMode === 'editor' || viewMode === 'braided' || viewMode === 'notes' || viewMode === 'account'
          ? { flex: 1, display: 'flex', flexDirection: 'column' as const, padding: 0, overflow: 'hidden' }
          : undefined}
      >
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div
            className={`scene-list scene-list--${viewMode}`}
            ref={sceneListRef}
            style={viewMode === 'editor' || viewMode === 'braided' || viewMode === 'notes' || viewMode === 'account'
              ? { flex: 1, display: 'flex', flexDirection: 'column' as const, padding: 0, margin: 0, maxWidth: 'none', minHeight: 0 }
              : undefined}
          >
            {viewMode === 'account' ? (
              <AccountView
                licenseStatus={licenseStatus}
                onLicenseChange={() => {
                  (window as any).electronAPI?.getLicenseStatus?.().then((result: any) => {
                    if (result.success) setLicenseStatus(result.data);
                  });
                }}
              />
            ) : viewMode === 'analytics' ? (
              <WordCountDashboard
                scenes={projectData.scenes}
                characters={projectData.characters}
                plotPoints={projectData.plotPoints}
                characterColors={characterColors}
                draftContent={draftContent}
                sceneMetadata={sceneMetadata}
                metadataFieldDefs={metadataFieldDefs}
                wordCountGoal={wordCountGoal}
                projectPath={projectData.projectPath}
                onGoalChange={handleWordCountGoalChange}
                sceneSessions={sceneSessions}
              />
            ) : viewMode === 'notes' ? (
              <NotesView
                projectPath={projectData.projectPath}
                scenes={projectData.scenes}
                characters={projectData.characters}
                tags={projectData.tags}
                initialNoteId={pendingNoteId}
                onNoteNavigated={() => setPendingNoteId(null)}
              />
            ) : viewMode === 'editor' ? (
              <EditorView
                ref={editorViewRef}
                scenes={projectData.scenes}
                characters={projectData.characters}
                plotPoints={projectData.plotPoints}
                tags={projectData.tags}
                characterColors={characterColors}
                draftContent={draftContent}
                sceneMetadata={sceneMetadata}
                metadataFieldDefs={metadataFieldDefs}
                drafts={drafts}
                sceneSessions={sceneSessions}
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
                onSceneSelect={(key) => { lastEditorSceneKeyRef.current = key; localStorage.setItem('braidr-last-editor-scene', key); }}
                onGoToPov={handleGoToPov}
                onGoToBraid={handleGoToBraid}
                sceneTodos={allSceneTodos}
                onTodoToggle={handleTodoToggle}
                onAddInlineTodo={handleAddInlineTodo}
                onRemoveInlineTodo={handleRemoveInlineTodo}
                timerRunning={timerRunning}
                timerElapsed={timerElapsed}
                timerSceneKey={timerSceneKey}
                onStartTimer={handleStartTimer}
                onStopTimer={handleStopTimer}
                onResetTimer={handleResetTimer}
                onAddManualTime={handleAddManualTime}
                onDeleteSession={handleDeleteSession}
                sceneSessionsByDate={(sceneKey: string) => getSceneSessionsByDate(sceneSessions, sceneKey)}
                sceneSessionsList={(sceneKey: string) => getSceneSessionsList(sceneSessions, sceneKey)}
                notesIndex={searchNotesIndex}
                onGoToNote={(noteId: string) => { setPendingNoteId(noteId); setViewMode('notes'); }}
                scratchpad={scratchpadContent}
                onScratchpadChange={handleScratchpadChange}
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
            ) : braidedSubMode === 'table' ? (
              // Table View
              <>
                <TableView
                  scenes={projectData.scenes}
                  characters={projectData.characters}
                  metadataFieldDefs={metadataFieldDefs}
                  sceneMetadata={sceneMetadata}
                  tags={projectData.tags}
                  tableViews={[]}
                  plotPoints={projectData.plotPoints}
                  characterColors={characterColors}
                  onSceneClick={(sceneKey) => {
                    // Open floating editor for this scene
                    const [characterId, sceneNumberStr] = sceneKey.split(':');
                    const sceneNumber = parseInt(sceneNumberStr, 10);
                    const scene = projectData.scenes.find(
                      s => s.characterId === characterId && s.sceneNumber === sceneNumber
                    );
                    if (scene) {
                      setListFloatingEditor(scene);
                    }
                  }}
                  onMetadataChange={handleMetadataChange}
                  onWordCountChange={handleWordCountChange}
                  onTableViewsChange={() => {}}
                  onSceneChange={handleSceneChange}
                />
                {/* Floating Editor for table view */}
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
                    scratchpadContent={scratchpadContent[`${listFloatingEditor.characterId}:${listFloatingEditor.sceneNumber}`] || ''}
                    onScratchpadChange={handleScratchpadChange}
                  />
                )}
              </>
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
                              }
                            }}
                            onMouseEnter={() => setHoveredSceneId(scene.id)}
                            onMouseLeave={() => setHoveredSceneId(null)}
                            className={`braided-scene-drag-wrapper ${draggedScene?.id === scene.id ? 'dragging' : ''} ${isConnecting && connectionSource !== scene.id ? 'connect-target' : ''}`}
                          >
                            <SceneCard
                              scene={scene}
                              tags={projectData.tags}
                              showCharacter={true}
                              characterName={getCharacterName(scene.characterId)}
                              displayNumber={displayPosition}
                              plotPointTitle={scene.plotPointId ? projectData.plotPoints.find(p => p.id === scene.plotPointId)?.title : undefined}
                              showDragHandle={true}
                              dragHandleRef={(el) => {
                                if (el) {
                                  el.onmousedown = () => setCanDragScene(true);
                                }
                              }}
                              backgroundColor={undefined}
                              onSceneChange={handleSceneChange}
                              onTagsChange={handleTagsChange}
                              onCreateTag={handleCreateTag}
                              onDeleteScene={handleArchiveScene}
                              onDuplicateScene={handleDuplicateScene}
                              connectedScenes={getConnectedScenes(scene.id)}
                              onStartConnection={() => {
                                setConnectionSource(scene.id);
                                setIsConnecting(true);
                              }}
                              onRemoveConnection={(targetId) => handleRemoveConnection(scene.id, targetId)}
                              onWordCountChange={handleWordCountChange}
                              connectableScenes={getConnectableScenes(scene.id)}
                              onCompleteConnection={(targetId) => handleCompleteConnection(scene.id, targetId)}
                              onOpenInEditor={handleOpenInEditor}
                              metadataFieldDefs={metadataFieldDefs}
                              sceneMetadata={sceneMetadata[`${scene.characterId}:${scene.sceneNumber}`]}
                              onMetadataChange={(sceneId, fieldId, value) => {
                                const s = projectData.scenes.find(sc => sc.id === sceneId);
                                if (s) {
                                  handleMetadataChange(`${s.characterId}:${s.sceneNumber}`, fieldId, value);
                                }
                              }}
                              onMetadataFieldDefsChange={handleMetadataFieldDefsChange}
                            />
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
      </div>{/* close .app-body */}

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
          allFontSettings={allFontSettings}
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
          sceneMetadata={sceneMetadata}
          metadataFieldDefs={metadataFieldDefs}
          characterColors={characterColors}
          onClose={() => setShowCompileModal(false)}
        />
      )}

      {/* Word Count Dashboard - kept for settings menu access */}

      {/* Search Overlay */}
      {showSearch && projectData && (
        <SearchOverlay
          scenes={projectData.scenes}
          characters={projectData.characters}
          tags={projectData.tags}
          draftContent={draftContent}
          notesIndex={searchNotesIndex}
          noteContentCache={noteContentCache}
          onNavigateToScene={(sceneId, characterId) => {
            handleGoToPov(sceneId, characterId);
          }}
          onNavigateToDraft={(sceneKey) => {
            handleOpenInEditor(sceneKey);
          }}
          onNavigateToNote={(noteId) => {
            setPendingNoteId(noteId);
            setViewMode('notes');
          }}
          onNavigateToCharacter={(characterId) => {
            setSelectedCharacterId(characterId);
            setViewMode('pov');
          }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Manual Mood Check-in */}
      {showManualCheckin && (
        <CheckinModal
          standalone
          onSubmit={handleManualCheckinSubmit}
          onSkip={() => setShowManualCheckin(false)}
        />
      )}

      {/* Check-in Modal */}
      {pendingSession && projectData && (() => {
        const [charId, sceneNumStr] = pendingSession.sceneKey.split(':');
        const charName = projectData.characters.find(c => c.id === charId)?.name || 'Unknown';
        const scene = projectData.scenes.find(s => s.characterId === charId && String(s.sceneNumber) === sceneNumStr);
        const sceneTitle = scene?.title ? ` — ${scene.title}` : '';
        const sceneLabel = `${charName} — ${sceneNumStr}${sceneTitle}`;
        return (
          <CheckinModal
            sceneLabel={sceneLabel}
            durationMs={pendingSession.durationMs}
            wordsNet={pendingSession.wordsNet}
            onSubmit={handleCheckinSubmit}
            onSkip={handleCheckinSkip}
          />
        );
      })()}

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

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={async (category, message) => {
            try {
              const result = await (window as any).electronAPI.openFeedbackEmail(category, message);
              if (result.success) {
                addToast('Feedback sent — thank you!');
                setShowFeedbackModal(false);
                return true;
              }
              addToast('Couldn\u2019t send feedback — please try again');
              return false;
            } catch {
              addToast('Couldn\u2019t send feedback — please try again');
              return false;
            }
          }}
        />
      )}

      {/* Update Modal (triggered from menu → Check for Updates) */}
      {showUpdateModal && (
        <UpdateModal onClose={() => setShowUpdateModal(false)} />
      )}

      {/* App Tour */}
      {showTour && (
        <TourOverlay
          onComplete={() => {
            setShowTour(false);
            localStorage.setItem('braidr-tour-version', '1');
          }}
          setViewMode={setViewMode}
        />
      )}
    </div>
  );
}

export default App;
