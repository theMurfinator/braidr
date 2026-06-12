import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Character, Scene, PlotPoint, Tag, TagCategory, ProjectData, Chapter, RecentProject, ProjectTemplate, FontSettings, AllFontSettings, ScreenKey, ArchivedScene, ArchivedNote, MetadataFieldDef, DraftVersion, NoteMetadata, NotesIndex, LicenseStatus, SceneComment, Task, TaskFieldDef, TaskViewConfig, TableViewConfig, WorldEvent, BranchIndex, BranchCompareData, Act, CharacterPsychology, ArcFieldDef, ArcTemplate } from '../shared/types';
import EditorView, { EditorViewHandle } from './components/EditorView';
import CompileModal from './components/CompileModal';
import { dataService } from './services/dataService';
import { migrateNotesSceneLinks } from './services/migration';
import PovOutlineView from './components/PovOutlineView';
import BullpenPanel from './components/BullpenPanel';
import ArcBullpenPanel from './components/ArcBullpenPanel';
import FilterBar from './components/FilterBar';
import TagManager from './components/TagManager';
import CharacterManager from './components/CharacterManager';
import RailsView from './components/RailsView';
import TableView from './components/TableView';
import FloatingEditor from './components/FloatingEditor';
import FontPicker from './components/FontPicker';
import NotesView from './components/notes/NotesView';
import TasksView from './components/tasks/TasksView';
import TimelineView from './components/timeline/TimelineView';
import WordCountDashboard from './components/WordCountDashboard';
import AccountView from './components/AccountView';
import SearchOverlay from './components/SearchOverlay';
import { useHistory } from './hooks/useHistory';
import { useToast } from './components/ToastContext';
import { extractTodosFromNotes, toggleTodoInNoteHtml, SceneTodo } from './utils/parseTodoWidgets';
import { indexPlotPoints, isSceneInPlay, isScenePlaced, enforceBraidingInvariant } from '../shared/placement';
import { createSessionTracker, mergeSessionIntoAnalytics, SessionTracker, SessionSummary } from './services/sessionTracker';
import { AnalyticsData, SceneSession, CustomCheckinCategory, loadAnalytics, saveAnalytics, getSceneSessionsByDate, getSceneSessionsList, appendSceneSession, getTodayStr, getWeekSaturday, getWeekDays, toLocalDateStr, recordManuscriptSnapshot, applyAnalyticsPatch } from './utils/analyticsStore';
import CheckinModal from './components/CheckinModal';
import FeedbackModal from './components/FeedbackModal';
import { UpdateBanner } from './components/UpdateBanner';
import UpdateModal from './components/UpdateModal';
import braidrIcon from './assets/braidr-icon.png';
import { track } from './utils/posthogTracker';
import LandingScreen from './components/LandingScreen';
import { useTimers } from './hooks/useTimers';
import { TabParams, defaultTabTitle } from '../shared/paneTypes';
import { PaneProvider } from './components/panes/PaneContext';
import { ViewRendererProvider } from './components/panes/TabContent';
import { usePaneLayout, createTab } from './components/panes/usePaneLayout';
import { findLeafPane, findTabByType } from './components/panes/paneUtils';
import PaneManager from './components/panes/PaneManager';
import { useAutoScrollOnDrag } from './hooks/useAutoScrollOnDrag';
import { DndContext, DragOverlay, closestCenter, DragStartEvent, DragEndEvent, DragCancelEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useSortableSensors, DragPreviewCard } from './dnd';
import { arcCollisionDetection, resolveArcDrop } from './utils/arcDnd';
import BraidedListView from './components/BraidedListView';
import { BranchSelector } from './components/branches/BranchSelector';
import { MergeDialog } from './components/branches/MergeDialog';
import { CompareView } from './components/branches/CompareView';
import ArcView, { buildSectionDetailFields } from './components/ArcView';
import ArcDetailModal from './components/ArcDetailModal';
import ScenePreviewPanel from './components/ScenePreviewPanel';
import CharacterHubPanel from './components/CharacterHubPanel';

type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'tasks' | 'timeline' | 'analytics' | 'account' | 'arc';
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

  // Pane/tab system
  const { layout: paneLayout, dispatch: paneDispatch } = usePaneLayout();
  const activePane = findLeafPane(paneLayout.root, paneLayout.activePaneId);
  const activePaneRef = activePane || (paneLayout.root as import('../shared/paneTypes').LeafPane);
  const activeTab = activePaneRef.tabs.find(t => t.id === activePaneRef.activeTabId) || activePaneRef.tabs[0];

  // Derive viewMode from active tab for backward compatibility
  const viewMode = (activeTab?.params.type || 'pov') as ViewMode;
  const setViewMode = useCallback((mode: ViewMode) => {
    // Navigate the active tab to this view type (don't create new tabs)
    const pane = findLeafPane(paneLayout.root, paneLayout.activePaneId);
    if (pane) {
      const existingTabId = findTabByType(pane, mode);
      if (existingTabId) {
        paneDispatch({ type: 'SET_ACTIVE_TAB', paneId: pane.id, tabId: existingTabId });
      } else {
        // Replace the active tab's content instead of opening a new tab
        paneDispatch({ type: 'UPDATE_TAB_PARAMS', paneId: pane.id, tabId: pane.activeTabId, params: { type: mode } as TabParams, title: defaultTabTitle(mode) });
      }
    }
    localStorage.setItem('braidr-last-view-mode', mode);
    track('screen_viewed', { screen: mode });
  }, [paneLayout.root, paneLayout.activePaneId, paneDispatch]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedScene, setDraggedScene] = useState<Scene | null>(null);
  const [_dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  // Compute which braided scenes are out of POV order (per character)
  const povReorderedScenes = useMemo(() => {
    if (!projectData) return new Set<string>();
    const outOfOrder = new Set<string>();
    const braidedByChar = new Map<string, Scene[]>();
    for (const scene of projectData.scenes) {
      if (scene.timelinePosition === null) continue;
      const list = braidedByChar.get(scene.characterId) || [];
      list.push(scene);
      braidedByChar.set(scene.characterId, list);
    }
    const plotPointOrder = new Map(projectData.plotPoints.map(pp => [pp.id, pp.order]));
    for (const [, charScenes] of braidedByChar) {
      if (charScenes.length < 2) continue;
      const braidedOrder = [...charScenes].sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
      const povOrder = [...charScenes].sort((a, b) => {
        const ppA = plotPointOrder.get(a.plotPointId ?? '') ?? 0;
        const ppB = plotPointOrder.get(b.plotPointId ?? '') ?? 0;
        return ppA !== ppB ? ppA - ppB : a.sceneNumber - b.sceneNumber;
      });
      const povRankMap = new Map(povOrder.map((s, i) => [s.id, i]));
      const ranks = braidedOrder.map(s => povRankMap.get(s.id)!);

      // O(n²) LIS — finds the largest subset already in POV order so only
      // the minimum displaced scenes are highlighted, not cascading neighbours.
      const dp = new Array(ranks.length).fill(1);
      const parent = new Array(ranks.length).fill(-1);
      for (let i = 1; i < ranks.length; i++) {
        for (let j = 0; j < i; j++) {
          if (ranks[j] < ranks[i] && dp[j] + 1 > dp[i]) {
            dp[i] = dp[j] + 1;
            parent[i] = j;
          }
        }
      }
      let maxLen = 0, endIdx = 0;
      for (let i = 0; i < dp.length; i++) {
        if (dp[i] > maxLen) { maxLen = dp[i]; endIdx = i; }
      }
      const lisIds = new Set<string>();
      let curr = endIdx;
      while (curr !== -1) { lisIds.add(braidedOrder[curr].id); curr = parent[curr]; }

      for (const scene of braidedOrder) {
        if (!lisIds.has(scene.id)) outOfOrder.add(scene.id);
      }
    }
    return outOfOrder;
  }, [projectData]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showPovColors, setShowPovColors] = useState(true);
  const [hideSectionHeaders, setHideSectionHeaders] = useState<Record<string, boolean>>({});
  const [hideScenes, setHideScenes] = useState<Record<string, boolean>>({});
  const [sectionSynopsisModes, setSectionSynopsisModes] = useState<Record<string, 'inline' | 'expand'>>({});
  const [previousPlotPointIds, setPreviousPlotPointIds] = useState<Record<string, string>>({});
  const [inlineMetadataFields, setInlineMetadataFields] = useState<string[]>([]);
  const inlineMetadataFieldsRef = useRef<string[]>([]);
  const [showInlineLabels, setShowInlineLabels] = useState(true);
  const showInlineLabelsRef = useRef(true);
  const [showFieldsDropdown, setShowFieldsDropdown] = useState(false);
  const fieldsDropdownRef = useRef<HTMLDivElement>(null);
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [showAddChapterInput, setShowAddChapterInput] = useState(false);
  const newDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [sceneConnections, setSceneConnections] = useState<Record<string, string[]>>({});
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const chaptersRef = useRef<Chapter[]>([]);
  const [tableViews, setTableViews] = useState<TableViewConfig[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [characterPsychologies, setCharacterPsychologies] = useState<Record<string, CharacterPsychology>>({});
  const [characterColors, setCharacterColors] = useState<Record<string, string>>({});
  const characterColorsRef = useRef<Record<string, string>>({});
  const allFontSettingsRef = useRef<AllFontSettings>({ global: {} });
  const canDragSceneRef = useRef(false);
  const draggedPovSceneRef = useRef<Scene | null>(null);
  const [povActiveId, setPovActiveId] = useState<string | null>(null);
  const povSensors = useSortableSensors();
  const draggedArcSceneRef = useRef<Scene | null>(null);
  const [arcActiveId, setArcActiveId] = useState<string | null>(null);
  const arcSensors = useSortableSensors();
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [allFontSettings, setAllFontSettings] = useState<AllFontSettings>({ global: {} });

  const [braidedSubMode, setBraidedSubMode] = useState<BraidedSubMode>(() => {
    if (activeTab?.params.type === 'braided' && 'subMode' in activeTab.params && activeTab.params.subMode) {
      return activeTab.params.subMode;
    }
    return 'list';
  });
  useEffect(() => {
    if (activeTab?.params.type === 'braided' && 'subMode' in activeTab.params && activeTab.params.subMode) {
      setBraidedSubMode(activeTab.params.subMode);
    }
  }, [activeTab]);
  const [showRailsConnections] = useState(true);
  const [listFloatingEditor, setListFloatingEditor] = useState<Scene | null>(null);
  const [listInboxCharFilter, setListInboxCharFilter] = useState<Record<string, string>>({});
  const [editorInitialSceneKey, setEditorInitialSceneKey] = useState<string | null>(null);
  const lastEditorSceneKeyRef = useRef<string | null>(localStorage.getItem('braidr-last-editor-scene'));
  const scrollToSceneIdRef = useRef<string | null>(null);
  const [archivedScenes, setArchivedScenes] = useState<ArchivedScene[]>([]);
  const archivedScenesRef = useRef<ArchivedScene[]>([]);
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [archivedNotes, setArchivedNotes] = useState<ArchivedNote[]>([]);
  const [typewriterMode, setTypewriterMode] = useState(() => {
    const saved = localStorage.getItem('editor-typewriter-mode');
    return saved === 'true';
  });
  const [draftContent, setDraftContent] = useState<Record<string, string>>({});
  const draftContentRef = useRef<Record<string, string>>({});
  const [arcPreviewSceneId, setArcPreviewSceneId] = useState<string | null>(null);
  const [povPreviewSceneId, setPovPreviewSceneId] = useState<string | null>(null);
  const [povDetailSectionId, setPovDetailSectionId] = useState<string | null>(null);
  const [scratchpadContent, setScratchpadContent] = useState<Record<string, string>>({});
  const scratchpadContentRef = useRef<Record<string, string>>({});
  const [sceneComments, setSceneComments] = useState<Record<string, SceneComment[]>>({});
  const sceneCommentsRef = useRef<Record<string, SceneComment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftVersion[]>>({});
  const draftsRef = useRef<Record<string, DraftVersion[]>>({});
  const [metadataFieldDefs, setMetadataFieldDefs] = useState<MetadataFieldDef[]>([]);
  const metadataFieldDefsRef = useRef<MetadataFieldDef[]>([]);
  const [sceneMetadata, setSceneMetadata] = useState<Record<string, Record<string, string | string[]>>>({});
  const sceneMetadataRef = useRef<Record<string, Record<string, string | string[]>>>({});
  const [arcFieldDefs, setArcFieldDefs] = useState<ArcFieldDef[]>([]);
  const [arcFieldValues, setArcFieldValues] = useState<Record<string, Record<string, string | string[]>>>({});
  const [arcFieldSections, setArcFieldSections] = useState<Record<string, string>>({});
  const [arcTemplates, setArcTemplates] = useState<ArcTemplate[]>([]);
  const [hiddenArcBuiltins_section, setHiddenArcBuiltins_section] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('arc-hidden-builtin-ids:section');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [hiddenArcCustoms_section, setHiddenArcCustoms_section] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('arc-hidden-custom-ids:section');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [showCompileModal, setShowCompileModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [wordCountGoal, setWordCountGoal] = useState(0);
  const wordCountGoalRef = useRef(0);
  const [searchNotesIndex, setSearchNotesIndex] = useState<NoteMetadata[]>([]);
  const [noteContentCache, setNoteContentCache] = useState<Record<string, string>>({});
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  useAutoScrollOnDrag(timelineRef, !!draggedScene);
  const editorViewRef = useRef<EditorViewHandle>(null);
  const isDirtyRef = useRef(false);
  const loadInProgressRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Branch state
  const [branchIndex, setBranchIndex] = useState<BranchIndex>({ branches: [], activeBranch: null });
  const [showCompareView, setShowCompareView] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState<string | null>(null);
  const [mergeCompareData, setMergeCompareData] = useState<BranchCompareData | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);

  // Lock state
  const [lockConflict, setLockConflict] = useState<{ projectPath: string; projectName?: string; heldBy: string } | null>(null);
  const [takenOverBy, setTakenOverBy] = useState<string | null>(null);


  // Session tracker for time tracking
  const sessionTrackerRef = useRef<SessionTracker | null>(null);
  const analyticsRef = useRef<AnalyticsData | null>(null);
  const [sceneSessions, setSceneSessions] = useState<SceneSession[]>([]);
  const [pendingSession, setPendingSession] = useState<SessionSummary | null>(null);
  const [showManualCheckin, setShowManualCheckin] = useState(false);
  const pendingSessionRef = useRef<SessionSummary | null>(null);
  const pendingTotalWordsRef = useRef<number>(0);
  const isClosingRef = useRef(false);

  // Reset drag ref on mouseup (in case drag is cancelled without dragEnd firing)
  useEffect(() => {
    const resetDrag = () => { canDragSceneRef.current = false; };
    document.addEventListener('mouseup', resetDrag);
    return () => document.removeEventListener('mouseup', resetDrag);
  }, []);

  // Extract todo items from notes for display in editor sidebar
  const sceneTodos = useMemo(() => {
    if (searchNotesIndex.length === 0 || Object.keys(noteContentCache).length === 0) return [];
    return extractTodosFromNotes(noteContentCache, searchNotesIndex);
  }, [noteContentCache, searchNotesIndex]);

  // Inline todos (not linked to notes, per-scene)
  const [inlineTodos, setInlineTodos] = useState<Record<string, SceneTodo[]>>({});
  const inlineTodosRef = useRef<Record<string, SceneTodo[]>>({});

  // Task board state
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const [taskFieldDefs, setTaskFieldDefs] = useState<TaskFieldDef[]>([]);
  const taskFieldDefsRef = useRef<TaskFieldDef[]>([]);
  const [taskViews, setTaskViews] = useState<TaskViewConfig[]>([]);
  const taskViewsRef = useRef<TaskViewConfig[]>([]);
  const [taskColumnWidths, setTaskColumnWidths] = useState<Record<string, number>>({});
  const taskColumnWidthsRef = useRef<Record<string, number>>({});
  const [taskVisibleColumns, setTaskVisibleColumns] = useState<string[] | undefined>(undefined);
  const taskVisibleColumnsRef = useRef<string[] | undefined>(undefined);

  const {
    timerRunning,
    timerElapsed,
    timerSceneKey,
    taskTimerRunning,
    taskTimerElapsed,
    taskTimerTaskId,
    formatTimer,
    handleStartTimer,
    handleStopTimer,
    handleResetTimer,
    handleResumeTimer,
    handleResumeTaskTimer,
    handleStartTaskTimer,
    handleStopTaskTimer,
    handleAddManualTime,
    handleUpdateSession,
    handleDeleteSession,
  } = useTimers({
    projectData,
    analyticsRef,
    setSceneSessions,
    tasks,
    setTasks,
    tasksRef,
    isDirtyRef,
  });

  // Timeline state
  const [timelineDates, setTimelineDates] = useState<Record<string, string>>({});
  const timelineDatesRef = useRef<Record<string, string>>({});
  const [timelineEndDates, setTimelineEndDates] = useState<Record<string, string>>({});
  const timelineEndDatesRef = useRef<Record<string, string>>({});
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const worldEventsRef = useRef<WorldEvent[]>([]);
  const tagsRef = useRef<Tag[]>([]);

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

  // Task mutation callbacks
  const handleTasksChange = useCallback((newTasks: Task[]) => {
    setTasks(newTasks);
    tasksRef.current = newTasks;
    isDirtyRef.current = true;
  }, []);

  const handleTaskFieldDefsChange = useCallback((newDefs: TaskFieldDef[]) => {
    setTaskFieldDefs(newDefs);
    taskFieldDefsRef.current = newDefs;
    isDirtyRef.current = true;
  }, []);

  const handleTaskViewsChange = useCallback((newViews: TaskViewConfig[]) => {
    setTaskViews(newViews);
    taskViewsRef.current = newViews;
    isDirtyRef.current = true;
  }, []);

  const handleTaskColumnConfigChange = useCallback((widths: Record<string, number>, visible: string[]) => {
    setTaskColumnWidths(widths);
    taskColumnWidthsRef.current = widths;
    setTaskVisibleColumns(visible);
    taskVisibleColumnsRef.current = visible;
    isDirtyRef.current = true;
  }, []);

  const handleTimelineDatesChange = useCallback((dates: Record<string, string>) => {
    setTimelineDates(dates);
    timelineDatesRef.current = dates;
    isDirtyRef.current = true;
  }, []);

  const handleTimelineEndDatesChange = useCallback((dates: Record<string, string>) => {
    setTimelineEndDates(dates);
    timelineEndDatesRef.current = dates;
    isDirtyRef.current = true;
  }, []);

  const handleWorldEventsChange = useCallback((events: WorldEvent[]) => {
    setWorldEvents(events);
    worldEventsRef.current = events;
    isDirtyRef.current = true;
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

  // Close fields dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fieldsDropdownRef.current && !fieldsDropdownRef.current.contains(e.target as Node)) {
        setShowFieldsDropdown(false);
      }
    };
    if (showFieldsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFieldsDropdown]);

  // Close new dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newDropdownRef.current && !newDropdownRef.current.contains(e.target as Node)) {
        setShowNewDropdown(false);
      }
    };
    if (showNewDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNewDropdown]);

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
  }, [setViewMode]);

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
        isDirtyRef.current = true;
      }

      // Cmd+K / Ctrl+K: Open search
      if (modifier && e.key === 'k') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }

      // Tab keyboard shortcuts
      if (modifier && e.key === 't' && !e.shiftKey) {
        // Cmd+T: New tab
        e.preventDefault();
        const tab = createTab({ type: 'editor' } as TabParams, defaultTabTitle('editor'));
        paneDispatch({ type: 'OPEN_TAB', paneId: paneLayout.activePaneId, tab, makeActive: true });
      }
      if (modifier && e.key === 'r' && !e.shiftKey) {
        // Cmd+R: Split right with new blank tab
        e.preventDefault();
        paneDispatch({ type: 'SPLIT_PANE', paneId: paneLayout.activePaneId, direction: 'horizontal' });
      }
      if (modifier && e.key === 'w' && e.shiftKey) {
        // Cmd+Shift+W: Close active pane (unsplit)
        e.preventDefault();
        paneDispatch({ type: 'CLOSE_PANE', paneId: paneLayout.activePaneId });
      }
      if (modifier && e.key === 'w' && !e.shiftKey) {
        // Cmd+W: Close active tab
        e.preventDefault();
        const pane = findLeafPane(paneLayout.root, paneLayout.activePaneId);
        if (pane && pane.tabs.length > 1) {
          paneDispatch({ type: 'CLOSE_TAB', paneId: pane.id, tabId: pane.activeTabId });
        }
      }
      if (modifier && e.shiftKey && e.key === ']') {
        // Cmd+Shift+]: Next tab
        e.preventDefault();
        const pane = findLeafPane(paneLayout.root, paneLayout.activePaneId);
        if (pane && pane.tabs.length > 1) {
          const idx = pane.tabs.findIndex(t => t.id === pane.activeTabId);
          const nextIdx = (idx + 1) % pane.tabs.length;
          paneDispatch({ type: 'SET_ACTIVE_TAB', paneId: pane.id, tabId: pane.tabs[nextIdx].id });
        }
      }
      if (modifier && e.shiftKey && e.key === '[') {
        // Cmd+Shift+[: Previous tab
        e.preventDefault();
        const pane = findLeafPane(paneLayout.root, paneLayout.activePaneId);
        if (pane && pane.tabs.length > 1) {
          const idx = pane.tabs.findIndex(t => t.id === pane.activeTabId);
          const prevIdx = (idx - 1 + pane.tabs.length) % pane.tabs.length;
          paneDispatch({ type: 'SET_ACTIVE_TAB', paneId: pane.id, tabId: pane.tabs[prevIdx].id });
        }
      }
      if (modifier && e.key === '\\' && !e.shiftKey) {
        // Cmd+\: Split pane horizontally (side-by-side)
        e.preventDefault();
        paneDispatch({ type: 'SPLIT_PANE', paneId: paneLayout.activePaneId, direction: 'horizontal' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undoProjectData, redoProjectData, paneLayout, paneDispatch]);

  // Total manuscript word count, computed live across all scene drafts.
  const computeTotalManuscriptWords = useCallback(() => {
    let total = 0;
    for (const html of Object.values(draftContentRef.current)) {
      if (html && html !== '<p></p>') {
        const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) total += text.split(/\s+/).length;
      }
    }
    return total;
  }, []);

  // Seed/refresh today's manuscript snapshot once drafts + analytics are loaded.
  // Establishes today's baseline (carried over from prior days, or seeded from
  // words already counted today on first run) so the dashboard can show the real
  // manuscript difference for the day. Runs once per project load.
  const manuscriptSeededRef = useRef<string | null>(null);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  useEffect(() => {
    if (!projectData?.projectPath || !analyticsLoaded || !analyticsRef.current) return;
    if (Object.keys(draftContentRef.current).length === 0) return;
    if (manuscriptSeededRef.current === projectData.projectPath) return;
    manuscriptSeededRef.current = projectData.projectPath;

    const today = getTodayStr();
    const total = computeTotalManuscriptWords();
    const todaySessionWords = (analyticsRef.current.sceneSessions || [])
      .filter(s => s.date === today && s.sceneKey !== 'manual:checkin')
      .reduce((sum, s) => sum + s.wordsNet, 0);
    const updated = recordManuscriptSnapshot(analyticsRef.current, today, total, { seedWordsToday: todaySessionWords });
    analyticsRef.current = updated;
    saveAnalytics(projectData.projectPath, updated);
  }, [projectData?.projectPath, analyticsLoaded, draftContent, computeTotalManuscriptWords]);

  // Initialize session tracker when project loads
  useEffect(() => {
    if (!projectData) return;

    // Create the tracker
    const tracker = createSessionTracker();
    sessionTrackerRef.current = tracker;

    // Load analytics data for the project
    setAnalyticsLoaded(false);
    loadAnalytics(projectData.projectPath).then(data => {
      analyticsRef.current = data;
      setSceneSessions(data.sceneSessions || []);
      setAnalyticsLoaded(true);
    });

    // When a session ends, merge it into analytics and persist (no auto-pop check-in)
    tracker.setOnSessionEnd((summary) => {
      if (!analyticsRef.current || !projectData) return;

      const totalWords = computeTotalManuscriptWords();

      // Always save immediately — check-in is manual only
      const merged = mergeSessionIntoAnalytics(analyticsRef.current, summary, totalWords, null);
      const updated = recordManuscriptSnapshot(merged, getTodayStr(), totalWords);
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
  const handleCheckinSubmit = useCallback((checkin: { energy: number; focus: number; mood: number; custom?: Record<string, number> }) => {
    const summary = pendingSessionRef.current;
    if (!summary || !analyticsRef.current || !projectData) return;

    const merged = mergeSessionIntoAnalytics(
      analyticsRef.current, summary, pendingTotalWordsRef.current, checkin
    );
    const updated = recordManuscriptSnapshot(merged, getTodayStr(), pendingTotalWordsRef.current);
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

    const merged = mergeSessionIntoAnalytics(
      analyticsRef.current, summary, pendingTotalWordsRef.current, null
    );
    const updated = recordManuscriptSnapshot(merged, getTodayStr(), pendingTotalWordsRef.current);
    analyticsRef.current = updated;
    setSceneSessions(updated.sceneSessions || []);
    saveAnalytics(projectData.projectPath, updated);

    pendingSessionRef.current = null;
    setPendingSession(null);
  }, [projectData]);

  // Manual (standalone) check-in handler
  const handleManualCheckinSubmit = useCallback((checkin: { energy: number; focus: number; mood: number; custom?: Record<string, number> }) => {
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

  // Custom check-in category management
  const handleAddCheckinCategory = useCallback((category: CustomCheckinCategory) => {
    if (!analyticsRef.current || !projectData) return;
    const existing = analyticsRef.current.customCheckinCategories || [];
    const updated = {
      ...analyticsRef.current,
      customCheckinCategories: [...existing, category],
    };
    analyticsRef.current = updated;
    saveAnalytics(projectData.projectPath, updated);
  }, [projectData]);

  const handleRemoveCheckinCategory = useCallback((categoryId: string) => {
    if (!analyticsRef.current || !projectData) return;
    const existing = analyticsRef.current.customCheckinCategories || [];
    const updated = {
      ...analyticsRef.current,
      customCheckinCategories: existing.filter(c => c.id !== categoryId),
    };
    analyticsRef.current = updated;
    saveAnalytics(projectData.projectPath, updated);
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
    if (!(showSearch || viewMode === 'editor') || !projectData) return;
    let cancelled = false;
    (async () => {
      try {
        const index = await dataService.loadNotesIndex(projectData.projectPath);
        if (cancelled) return;
        setSearchNotesIndex(index.notes || []);
        const cache: Record<string, string> = {};
        for (const note of (index.notes || [])) {
          try {
            const content = await dataService.readNote(projectData.projectPath, note.fileName);
            if (cancelled) return;
            cache[note.id] = content;
          } catch {}
        }
        setNoteContentCache(cache);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [showSearch, viewMode, projectData?.projectPath]);

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

  // Get scenes for current view
  const displayedScenes = useMemo(() => {
    if (!projectData) return [];

    let scenes: Scene[];

    if (viewMode === 'pov' && selectedCharacterId) {
      // POV view: only scenes from selected character
      scenes = projectData.scenes.filter(s => s.characterId === selectedCharacterId);
      scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
    } else {
      // Braided view: only scenes that are braided AND still placed. The
      // isScenePlaced guard defends the rails against stale timelinePositions
      // (e.g. a section set aside or an act deleted by older builds).
      const ppIndex = indexPlotPoints(projectData.plotPoints);
      scenes = projectData.scenes.filter(s => s.timelinePosition !== null && isScenePlaced(s, ppIndex));
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
    for (const [, plotPointMap] of grouped) {
      for (const [, scenes] of plotPointMap) {
        scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
      }
    }

    return grouped;
  }, [projectData, viewMode]);

  // Get plot points for current character
  const displayedPlotPoints = useMemo(() => {
    if (!projectData || !selectedCharacterId || viewMode !== 'pov') return [];
    return projectData.plotPoints
      .filter(p => p.characterId === selectedCharacterId && !p.inBullpen)
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
    // Lock files live in the project folder's .braidr/ dir. If folderPath points
    // directly to the .braidr SQLite file, derive the folder from it.
    const lockBasePath = folderPath.endsWith('.braidr')
      ? folderPath.substring(0, folderPath.lastIndexOf('/'))
      : folderPath;

    loadInProgressRef.current = true;
    // Acquire project lock
    try {
      const lockResult = await dataService.acquireProjectLock(lockBasePath);
      if (!lockResult.acquired) {
        loadInProgressRef.current = false;
        setLockConflict({ projectPath: lockBasePath, projectName: projectName, heldBy: lockResult.heldBy || 'another device' });
        return;
      }
    } catch (err) {
      console.warn('Lock acquisition failed, proceeding anyway:', err);
    }
    try {
    const data = await dataService.loadProject(folderPath);

    // Self-healed from a corrupted file — let the user know they may be slightly behind.
    if ((data as { recoveredFromBackup?: string | null }).recoveredFromBackup) {
      addToast('Your project file was corrupted and was automatically restored from the most recent healthy backup.');
    }

    // If legacy keys were migrated to stable IDs, persist the changes immediately
    if (data._migrated) {
      console.log('Migrating to stable scene IDs — saving .md files and timeline data');
      // Save all character outlines to embed <!-- sid:xxx --> in .md files
      for (const character of data.characters) {
        const charScenes = data.scenes.filter(s => s.characterId === character.id);
        const charPlotPoints = data.plotPoints.filter(p => p.characterId === character.id);
        try {
          await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
        } catch (err) {
          console.error(`Failed to save migrated outline for ${character.name}:`, err);
        }
      }
      // Save migrated timeline data (positions, connections, etc. now use scene.id keys)
      const positions: Record<string, number> = {};
      const wordCounts: Record<string, number> = {};
      for (const scene of data.scenes) {
        if (scene.timelinePosition !== null) positions[scene.id] = scene.timelinePosition;
        if (scene.wordCount !== undefined) wordCounts[scene.id] = scene.wordCount;
      }
      try {
        await dataService.saveTimeline({
          positions, connections: data.connections,
          characterColors: data.characterColors, wordCounts,
          fontSettings: data.fontSettings, archivedScenes: data.archivedScenes,
          metadataFieldDefs: data.metadataFieldDefs, sceneMetadata: data.sceneMetadata,
          wordCountGoal: data.wordCountGoal, allFontSettings: data.allFontSettings,
          tasks: data.tasks, taskFieldDefs: data.taskFieldDefs, taskViews: data.taskViews,
          inlineMetadataFields: data.inlineMetadataFields, showInlineLabels: data.showInlineLabels,
          taskColumnWidths: data.taskColumnWidths, taskVisibleColumns: data.taskVisibleColumns,
          timelineDates: data.timelineDates, worldEvents: data.worldEvents,
        });
      } catch (err) {
        console.error('Failed to save migrated timeline data:', err);
      }
      // Migrate notes sceneLinks from old keys to stable IDs
      try {
        const notesIdx = await dataService.loadNotesIndex(folderPath);
        const notesMigration = migrateNotesSceneLinks(data.scenes, notesIdx);
        if (notesMigration.migrated) {
          await dataService.saveNotesIndex(folderPath, notesMigration.notesIndex);
          console.log('Migrated notes sceneLinks to stable IDs');
        }
      } catch {
        // Notes may not exist yet — that's fine
      }
    }

    // Derive project name from folder if not provided
    const name = projectName || folderPath.split('/').pop() || 'Untitled';

    // Connections are already keyed by scene.id (migrated in dataService)
    setSceneConnections(data.connections);
    setChapters(data.chapters);
    chaptersRef.current = data.chapters;
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
    // Apply per-screen overrides immediately (the viewMode effect already ran on mount with empty settings)
    applyScreenFontOverrides(viewMode, loadedAllFonts);
    // Ensure screen overrides apply after React renders the .scene-list
    requestAnimationFrame(() => {
      applyScreenFontOverrides(viewMode, loadedAllFonts);
    });

    // Load archived scenes
    const loadedArchived = data.archivedScenes || [];
    setArchivedScenes(loadedArchived);
    archivedScenesRef.current = loadedArchived;

    // Load archived notes count for badge
    try {
      const notesIdx = await dataService.loadNotesIndex(folderPath);
      setArchivedNotes(notesIdx.archivedNotes || []);
    } catch {}

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
        console.log(`Removed ${beforeCount - data.scenes.length} archived scenes that persisted in markdown`);
      }
    }

    // Always renumber scenes per character to ensure sequential 1-based numbering.
    // Scenes are ordered by their position in the file (plot point order, then scene order
    // within each plot point), so we sort by the parsed sceneNumber and re-assign sequentially.
    const byChar: Record<string, Scene[]> = {};
    for (const s of data.scenes) {
      if (!byChar[s.characterId]) byChar[s.characterId] = [];
      byChar[s.characterId].push(s);
    }
    for (const charScenes of Object.values(byChar)) {
      charScenes.sort((a: Scene, b: Scene) => a.sceneNumber - b.sceneNumber);
      charScenes.forEach((s: Scene, i: number) => { s.sceneNumber = i + 1; });
    }

    setProjectData({ ...data, projectName: name });
    tagsRef.current = data.tags || [];
    track('project_opened', {
      character_count: data.characters.length,
      scene_count: data.scenes.length,
      total_words: data.scenes.reduce((sum: number, s: Scene) => sum + (s.wordCount || 0), 0),
    });

    // Load branch index. Never let a branch-subsystem failure abort the rest of
    // the project load — tasks/acts/metadata are loaded below and must survive a
    // branch error (a 2026-06-03 bug aborted the whole load here, leaving the UI
    // with scenes but no tasks/acts/metadata/branches).
    try {
      const brIndex = await dataService.listBranches(folderPath);
      setBranchIndex(brIndex);
    } catch (e) {
      console.error('Failed to load branch index (non-fatal):', e);
    }

    // Load editor data
    const loadedDraft = data.draftContent || {};
    const loadedDrafts = data.drafts || {};
    const loadedScratchpad = data.scratchpad || {};
    const loadedComments = data.sceneComments || {};
    const loadedMetaDefs = data.metadataFieldDefs || [];
    setMetadataFieldDefs(loadedMetaDefs);
    metadataFieldDefsRef.current = loadedMetaDefs;
    const loadedInlineFields = data.inlineMetadataFields || [];
    setInlineMetadataFields(loadedInlineFields);
    inlineMetadataFieldsRef.current = loadedInlineFields;
    const loadedShowLabels = data.showInlineLabels !== undefined ? data.showInlineLabels : true;
    setShowInlineLabels(loadedShowLabels);
    showInlineLabelsRef.current = loadedShowLabels;
    const loadedMetaData = data.sceneMetadata || {};

    // Note: orphan cleanup was removed — it was destroying draft content
    // when scene numbers shifted from archiving/reordering.

    setSceneMetadata(loadedMetaData);
    sceneMetadataRef.current = loadedMetaData;
    const loadedArcFieldDefs = data.arcFieldDefs ?? [];
    const loadedArcFieldValues = data.arcFieldValues ?? {};
    setArcFieldDefs(loadedArcFieldDefs);
    setArcFieldValues(loadedArcFieldValues);
    dataService.getArcUiPref('arc-field-sections').then((raw: string | null) => {
      try { if (raw) setArcFieldSections(JSON.parse(raw)); } catch { /* ignore */ }
    });
    dataService.getArcUiPref('arc-templates').then((raw: string | null) => {
      try { if (raw) setArcTemplates(JSON.parse(raw) as ArcTemplate[]); } catch { /* ignore */ }
    });

    // Derive backward-compat scene metadata state from unified arc tables (post-migration)
    const sceneDefs = loadedArcFieldDefs.filter(d => d.scope === 'scene');
    if (sceneDefs.length > 0) {
      const derivedMetaDefs: MetadataFieldDef[] = sceneDefs.map(d => ({
        id: d.id, label: d.label,
        type: d.type as MetadataFieldDef['type'],
        options: d.options, optionColors: d.optionColors, order: d.order,
      }));
      setMetadataFieldDefs(derivedMetaDefs);
      metadataFieldDefsRef.current = derivedMetaDefs;
      const derivedSceneMeta: Record<string, Record<string, string | string[]>> = {};
      for (const [key, vals] of Object.entries(loadedArcFieldValues)) {
        if (key.startsWith('scene:')) derivedSceneMeta[key.slice(6)] = vals;
      }
      setSceneMetadata(derivedSceneMeta);
      sceneMetadataRef.current = derivedSceneMeta;
    }
    setDraftContent(loadedDraft);
    draftContentRef.current = loadedDraft;
    setScratchpadContent(loadedScratchpad);
    scratchpadContentRef.current = loadedScratchpad;
    setSceneComments(loadedComments);
    sceneCommentsRef.current = loadedComments;
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

    // Load tasks
    const loadedTasks: Task[] = (data as any).tasks || [];

    // Migrate inline todos to tasks (one-time, only if no tasks exist yet)
    if (!loadedTasks.length) {
      const migratedTasks: Task[] = [];
      let order = 0;
      for (const [sk, todos] of Object.entries(loadedInlineTodos)) {
        for (const todo of todos) {
          migratedTasks.push({
            id: todo.todoId || crypto.randomUUID(),
            title: todo.description,
            status: todo.done ? 'done' : 'open',
            priority: 'none',
            tags: [],
            characterIds: [data.scenes.find(s => s.id === sk)?.characterId].filter(Boolean) as string[],
            sceneKey: sk,
            timeEntries: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            order: order++,
            customFields: {},
          });
        }
      }
      if (migratedTasks.length) {
        setTasks(migratedTasks);
        tasksRef.current = migratedTasks;
        isDirtyRef.current = true; // trigger save to persist migration
      } else {
        setTasks(loadedTasks);
        tasksRef.current = loadedTasks;
      }
    } else {
      setTasks(loadedTasks);
      tasksRef.current = loadedTasks;
    }
    const loadedTaskFieldDefs: TaskFieldDef[] = (data as any).taskFieldDefs || [];
    setTaskFieldDefs(loadedTaskFieldDefs);
    taskFieldDefsRef.current = loadedTaskFieldDefs;
    const loadedTaskViews: TaskViewConfig[] = (data as any).taskViews || [];
    setTaskViews(loadedTaskViews);
    taskViewsRef.current = loadedTaskViews;
    const loadedTaskColumnWidths: Record<string, number> = (data as any).taskColumnWidths || {};
    setTaskColumnWidths(loadedTaskColumnWidths);
    taskColumnWidthsRef.current = loadedTaskColumnWidths;
    const loadedTaskVisibleColumns: string[] | undefined = (data as any).taskVisibleColumns;
    setTaskVisibleColumns(loadedTaskVisibleColumns);
    taskVisibleColumnsRef.current = loadedTaskVisibleColumns;
    const loadedTimelineDates: Record<string, string> = (data as any).timelineDates || {};
    setTimelineDates(loadedTimelineDates);
    timelineDatesRef.current = loadedTimelineDates;
    const loadedTimelineEndDates: Record<string, string> = (data as any).timelineEndDates || {};
    setTimelineEndDates(loadedTimelineEndDates);
    timelineEndDatesRef.current = loadedTimelineEndDates;
    const loadedWorldEvents: WorldEvent[] = (data as any).worldEvents || [];
    setWorldEvents(loadedWorldEvents);
    worldEventsRef.current = loadedWorldEvents;

    const loadedTableViews = await dataService.loadTableViews();
    setTableViews(loadedTableViews);

    // Load acts for all characters
    const allActs: Act[] = [];
    for (const char of data.characters) {
      const charActs = await dataService.loadActs(char.id);
      allActs.push(...charActs);
    }
    setActs(allActs);

    // Select first character by default
    if (data.characters.length > 0) {
      setSelectedCharacterId(data.characters[0].id);
    }

    // View mode is now restored via the pane layout system (usePaneLayout)

    // Add to recent projects with summary stats
    const totalWordCount = data.scenes.reduce((sum: number, s: Scene) => sum + (s.wordCount || 0), 0);
    const analyticsForRecent = await loadAnalytics(folderPath);
    const thisWeekSat = getWeekSaturday(new Date());
    const thisWeekDays = getWeekDays(thisWeekSat);
    const recentSessions: SceneSession[] = analyticsForRecent.sceneSessions || [];
    const recentTasks: Task[] = (data as any).tasks || [];
    const dayLabels = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const perDayWords = new Array(7).fill(0);
    const perDayMs = new Array(7).fill(0);
    for (const ss of recentSessions) {
      if (ss.sceneKey === 'manual:checkin') continue;
      const idx = thisWeekDays.indexOf(ss.date);
      if (idx >= 0) { perDayWords[idx] += ss.wordsNet; perDayMs[idx] += ss.durationMs; }
    }
    for (const task of recentTasks) {
      for (const te of task.timeEntries) {
        const idx = thisWeekDays.indexOf(toLocalDateStr(new Date(te.startedAt)));
        if (idx >= 0) perDayMs[idx] += te.duration;
      }
    }
    const todayStr = getTodayStr();
    const weeklyTodayIdx = thisWeekDays.indexOf(todayStr);
    const weeklyWords = perDayWords.reduce((a: number, b: number) => a + b, 0);
    const weeklyHours = perDayMs.reduce((a: number, b: number) => a + b, 0) / 3600000;
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
      weeklyWords,
      weeklyHours,
      weeklyPerDayWords: perDayWords,
      weeklyPerDayHours: perDayMs.map((ms: number) => ms / 3600000),
      weeklyDayLabels: dayLabels,
      weeklyTodayIdx,
      weeklyHoursTarget: analyticsForRecent.weeklyGoal?.enabled ? analyticsForRecent.weeklyGoal.targetHours : 0,
      weeklyWordsTarget: analyticsForRecent.deadlineGoal?.enabled && analyticsForRecent.deadlineGoal.targetWords > 0
        ? Math.ceil((analyticsForRecent.deadlineGoal.targetWords - totalWordCount) /
            Math.max(1, Math.ceil((new Date(analyticsForRecent.deadlineGoal.deadlineDate + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000) + 1)) * 7
        : 0,
    });

    // Refresh recent projects list
    const projects = await dataService.getRecentProjects();
    setRecentProjects(projects);

    // Start lock heartbeat
    dataService.startLockHeartbeat(lockBasePath, (byDeviceName) => {
      if (isDirtyRef.current) {
        editorViewRef.current?.flush();
      }
      dataService.stopLockHeartbeat();
      setTakenOverBy(byDeviceName);
      setProjectData(null);
    });
    } finally {
      loadInProgressRef.current = false;
    }
  };

  // Branch handlers
  const handleCreateBranch = async (name: string, description?: string) => {
    if (!projectData?.projectPath) return;
    const updated = await dataService.createBranch(projectData.projectPath, name, description);
    setBranchIndex(updated);
    await loadProjectFromPath(projectData.projectPath);
  };

  const handleSwitchBranch = async (name: string | null) => {
    if (!projectData?.projectPath) return;
    const updated = await dataService.switchBranch(projectData.projectPath, name);
    setBranchIndex(updated);
    await loadProjectFromPath(projectData.projectPath);
  };

  const handleDeleteBranch = async (name: string) => {
    if (!projectData?.projectPath) return;
    const currentActive = branchIndex.activeBranch;
    const updated = await dataService.deleteBranch(projectData.projectPath, name);
    setBranchIndex(updated);
    if (currentActive === name) {
      await loadProjectFromPath(projectData.projectPath);
    }
  };

  // Load compare data when merge dialog opens
  useEffect(() => {
    if (showMergeDialog && projectData?.projectPath) {
      setMergeLoading(true);
      setMergeCompareData(null);
      dataService.compareBranches(projectData.projectPath, null, showMergeDialog)
        .then(data => { setMergeCompareData(data); setMergeLoading(false); })
        .catch(() => setMergeLoading(false));
    }
  }, [showMergeDialog]);

  async function handleMerge(sceneIds: string[]) {
    if (!showMergeDialog || !projectData?.projectPath) return;
    await dataService.mergeBranch(projectData.projectPath, showMergeDialog, sceneIds);
    setShowMergeDialog(null);
    await handleSwitchBranch(null);
  }

  const handleSelectFolder = async () => {
    try {
      setLoading(true);
      setError(null);

      const filePath = await dataService.selectBraidrFile();
      if (!filePath) {
        setLoading(false);
        return;
      }

      await loadProjectFromPath(filePath);
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
      .map(s => s.id);
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
    await saveTimelineData(updatedScenes, updatedConnections);
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

  const getCharacterName = useCallback((characterId: string): string => {
    const character = projectData?.characters.find(c => c.id === characterId);
    return character?.name || 'Unknown';
  }, [projectData?.characters]);

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

  // Apply per-screen font overrides on :root.
  // Re-applies global first so switching screens never leaves stale overrides.
  const applyScreenFontOverrides = (screen: ScreenKey | string, all: AllFontSettings) => {
    applyFontSettings(all.global);
    const root = document.documentElement;
    const screenSettings = (all.screens as Record<string, FontSettings> | undefined)?.[screen];
    if (!screenSettings) return;
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
      const val = screenSettings[key];
      if (val !== undefined && val !== null) {
        root.style.setProperty(varName, suffix ? `${val}${suffix}` : String(val));
      }
    }
    const boldVars: Array<[keyof FontSettings, string]> = [
      ['sectionTitleBold', '--font-section-title-weight'],
      ['sceneTitleBold', '--font-scene-title-weight'],
      ['bodyBold', '--font-body-weight'],
    ];
    for (const [key, varName] of boldVars) {
      const val = screenSettings[key];
      if (val !== undefined && val !== null) {
        root.style.setProperty(varName, val ? '700' : '400');
      }
    }
  };

  // Reapply per-screen overrides when view changes
  useEffect(() => {
    applyScreenFontOverrides(viewMode, allFontSettingsRef.current);
  }, [viewMode]);

  // Reapply global + screen font settings whenever allFontSettings state changes
  // (covers HMR, Fast Refresh, or any state restoration that bypasses loadProjectFromPath)
  useEffect(() => {
    if (Object.keys(allFontSettings.global).length > 0) {
      applyFontSettings(allFontSettings.global);
      applyScreenFontOverrides(viewMode, allFontSettings);
    }
  }, [allFontSettings]);

  // Handle font settings change (now receives AllFontSettings)
  const handleFontSettingsChange = async (settings: AllFontSettings) => {
    setAllFontSettings(settings);
    allFontSettingsRef.current = settings;
    applyFontSettings(settings.global);
    applyScreenFontOverrides(viewMode, settings);

    // Save via the standard save path (avoids parameter drift)
    if (projectData) {
      try {
        await saveTimelineData(projectData.scenes, sceneConnections);
      } catch (err) {
        console.error('Failed to save font settings:', err);
        addToast('Failed to save font settings');
        // Ensure auto-save will retry
        isDirtyRef.current = true;
      }
    }
  };

  const getConnectedScenes = useCallback((sceneId: string): { id: string; label: string }[] => {
    const connections = sceneConnections[sceneId] || [];
    return connections.map(connId => {
      const scene = projectData?.scenes.find(s => s.id === connId);
      if (!scene) return { id: connId, label: 'Unknown scene' };
      const charName = getCharacterName(scene.characterId);
      return { id: connId, label: `${charName} - Scene ${scene.sceneNumber}` };
    });
  }, [sceneConnections, projectData?.scenes, getCharacterName]);

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
    await saveTimelineData(projectData.scenes, newConnections);
  };

  // Table view handler
  const handleSaveTableViews = useCallback(async (views: TableViewConfig[]) => {
    setTableViews(views);
    await dataService.saveTableViews(views);
  }, []);

  // Arc handlers
  const handleSaveAct = useCallback(async (act: Act) => {
    setActs(prev => {
      const idx = prev.findIndex(a => a.id === act.id);
      return idx >= 0 ? prev.map(a => a.id === act.id ? act : a) : [...prev, act];
    });
    await dataService.saveAct(act);
  }, []);

  const handleDeleteAct = useCallback(async (actId: string) => {
    setActs(prev => prev.filter(a => a.id !== actId));
    await dataService.deleteAct(actId);
    if (!projectData) return;
    // Sections in the deleted act simply lose their act (actId → null). Act is
    // optional for placement, so their scenes stay in play, in POV, and braided;
    // the sections surface in the arc bullpen/holding panel to be re-filed.
    const affected = projectData.plotPoints.filter(pp => pp.actId === actId);
    if (affected.length === 0) return;
    const updatedPlotPoints = projectData.plotPoints.map(pp => pp.actId === actId ? { ...pp, actId: null } : pp);
    const updatedScenes = enforceBraidingInvariant(projectData.scenes, updatedPlotPoints);
    setProjectData({ ...projectData, plotPoints: updatedPlotPoints, scenes: updatedScenes });
    try {
      for (const pp of affected) await dataService.savePlotPointArcFields(pp.id, { actId: null });
      if (updatedScenes !== projectData.scenes) await saveTimelineData(updatedScenes, sceneConnections);
    } catch {
      addToast('Couldn’t save your changes — check that the project folder still exists');
    }
  }, [projectData]);

  const handleSavePlotPointArcFields = useCallback(async (plotPointId: string, fields: Partial<Pick<PlotPoint, 'actId' | 'inBullpen' | 'startingState' | 'endingState' | 'polarity' | 'transformation' | 'dilemma' | 'propellingAction' | 'title' | 'description' | 'synopsis'>>) => {
    if (!projectData) return;
    const updatedPlotPoints = projectData.plotPoints.map(pp => pp.id === plotPointId ? { ...pp, ...fields } : pp);
    // Setting a section aside (inBullpen) un-places its scenes; enforce the
    // invariant (bullpen ⇒ not braided) so they leave the rails in step. Act
    // assignment does not affect placement, so it never unbraids.
    const affectsPlacement = 'inBullpen' in fields;
    const updatedScenes = affectsPlacement
      ? enforceBraidingInvariant(projectData.scenes, updatedPlotPoints)
      : projectData.scenes;
    setProjectData({ ...projectData, plotPoints: updatedPlotPoints, scenes: updatedScenes });
    try {
      await dataService.savePlotPointArcFields(plotPointId, fields);
      if (updatedScenes !== projectData.scenes) {
        await saveTimelineData(updatedScenes, sceneConnections);
      }
    } catch {
      addToast('Could not save section changes');
    }
    // saveTimelineData/sceneConnections are intentionally not in deps: this
    // callback is recreated whenever projectData changes (every edit), so they
    // are captured fresh, and listing the later-declared saveTimelineData here
    // would trip a temporal-dead-zone error at render.
  }, [projectData]);

  const handleSaveSceneArcFields = useCallback(async (sceneId: string, fields: { polarity?: string; transformation?: string; dilemma?: string; propellingAction?: string; synopsis?: string; startingState?: string; endingState?: string; title?: string }) => {
    if (!projectData) return;
    const { synopsis, ...arcFields } = fields;
    setProjectData({
      ...projectData,
      scenes: projectData.scenes.map(s => s.id === sceneId ? {
        ...s,
        ...arcFields,
        ...(synopsis !== undefined ? { content: synopsis } : {}),
      } : s),
    });
    try {
      await dataService.saveSceneArcFields(sceneId, fields);
    } catch {
      addToast('Could not save scene changes');
    }
  }, [projectData]);

  const handleSaveArcFieldDefs = useCallback(async (defs: ArcFieldDef[]) => {
    setArcFieldDefs(defs);
    try {
      await dataService.saveArcFieldDefs(defs);
    } catch {
      addToast('Could not save field definitions');
    }
  }, []);

  const handleSaveArcTemplate = useCallback((draft: Omit<ArcTemplate, 'id'>) => {
    const next = [...arcTemplates, { ...draft, id: crypto.randomUUID() }];
    setArcTemplates(next);
    dataService.setArcUiPref('arc-templates', JSON.stringify(next)).catch(() => {});
  }, [arcTemplates]);

  const handleDeleteArcTemplate = useCallback((id: string) => {
    const next = arcTemplates.filter(t => t.id !== id);
    setArcTemplates(next);
    dataService.setArcUiPref('arc-templates', JSON.stringify(next)).catch(() => {});
  }, [arcTemplates]);

  const handleToggleArcBuiltin_section = useCallback((id: string) => {
    setHiddenArcBuiltins_section(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('arc-hidden-builtin-ids:section', JSON.stringify([...next])); } catch { /* ignore */ }
      dataService.setArcUiPref('arc-hidden-builtin-ids:section', JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const handleToggleArcCustom_section = useCallback((id: string) => {
    setHiddenArcCustoms_section(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('arc-hidden-custom-ids:section', JSON.stringify([...next])); } catch { /* ignore */ }
      dataService.setArcUiPref('arc-hidden-custom-ids:section', JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const handleSaveArcFieldValues = useCallback(async (entityType: 'act' | 'section' | 'scene', entityId: string, values: Record<string, string | string[]>) => {
    setArcFieldValues(prev => ({ ...prev, [`${entityType}:${entityId}`]: values }));
    try {
      await dataService.saveArcFieldValues(entityType, entityId, values);
    } catch {
      addToast('Could not save field values');
    }
  }, []);

  const handleSaveSceneFieldDefs = useCallback(async (defs: ArcFieldDef[]) => {
    // Update arcFieldDefs: replace scene-scoped entries, keep arc-scoped
    setArcFieldDefs(prev => [...prev.filter(d => d.scope !== 'scene'), ...defs]);
    // Keep metadataFieldDefs in sync for TableView/CompileModal backward compat
    const metaDefs: MetadataFieldDef[] = defs.map(d => ({
      id: d.id, label: d.label,
      type: d.type as MetadataFieldDef['type'],
      options: d.options, optionColors: d.optionColors, order: d.order,
    }));
    setMetadataFieldDefs(metaDefs);
    metadataFieldDefsRef.current = metaDefs;
    try {
      await dataService.saveArcFieldDefs(defs);
    } catch {
      addToast('Could not save scene field definitions');
    }
  }, []);

  const handleSaveSceneFieldValues = useCallback(async (sceneId: string, values: Record<string, string | string[]>) => {
    setArcFieldValues(prev => ({ ...prev, [`scene:${sceneId}`]: values }));
    // Keep sceneMetadata in sync for TableView/CompileModal backward compat
    setSceneMetadata(prev => ({ ...prev, [sceneId]: values }));
    sceneMetadataRef.current = { ...sceneMetadataRef.current, [sceneId]: values };
    try {
      await dataService.saveArcFieldValues('scene', sceneId, values);
    } catch {
      addToast('Could not save scene field values');
    }
  }, []);

  // Save the scene synopsis (stored as scene.notes) from the arc view, without
  // touching title/content. Persists via the bulk outline save (replaceSceneNotes).
  const handleSaveSceneNotes = useCallback(async (sceneId: string, notes: string[]) => {
    if (!projectData) return;
    const updatedScenes = projectData.scenes.map(s => s.id === sceneId ? { ...s, notes } : s);
    setProjectData({ ...projectData, scenes: updatedScenes });
    const scene = updatedScenes.find(s => s.id === sceneId);
    if (!scene) return;
    const character = projectData.characters.find(c => c.id === scene.characterId);
    if (!character) return;
    try {
      await dataService.saveCharacterOutline(
        character,
        projectData.plotPoints.filter(p => p.characterId === character.id),
        updatedScenes.filter(s => s.characterId === character.id),
      );
    } catch {
      addToast('Could not save synopsis');
    }
  }, [projectData]);

  const handleSaveCharacterPsychology = useCallback(async (psychology: CharacterPsychology) => {
    setCharacterPsychologies(prev => ({ ...prev, [psychology.characterId]: psychology }));
    await dataService.saveCharacterPsychology(psychology);
  }, []);

  const handleLoadCharacterPsychology = useCallback(async (characterId: string): Promise<CharacterPsychology | null> => {
    if (characterPsychologies[characterId]) return characterPsychologies[characterId];
    const p = await dataService.loadCharacterPsychology(characterId);
    if (p) setCharacterPsychologies(prev => ({ ...prev, [characterId]: p }));
    return p;
  }, [characterPsychologies]);

  // Character Hub panel (opened from the arc bullpen)
  const [showArcHub, setShowArcHub] = useState(false);
  const arcHubLoadedRef = useRef(false);
  const openArcHub = useCallback(async () => {
    if (!selectedCharacterId) return;
    if (!arcHubLoadedRef.current) {
      await handleLoadCharacterPsychology(selectedCharacterId);
      arcHubLoadedRef.current = true;
    }
    setShowArcHub(true);
  }, [selectedCharacterId, handleLoadCharacterPsychology]);
  useEffect(() => {
    arcHubLoadedRef.current = false;
    setShowArcHub(false);
  }, [selectedCharacterId]);

  // Chapter handlers
  const handleAddChapter = async (title: string) => {
    const newChapter: Chapter = {
      id: crypto.randomUUID(),
      title: title.trim(),
      order: chaptersRef.current.length,
    };
    const updated = [...chaptersRef.current, newChapter];
    setChapters(updated);
    chaptersRef.current = updated;
    try {
      await dataService.saveChapter(newChapter);
    } catch {
      addToast("Couldn't save chapter");
    }
  };

  const handleUpdateChapter = async (
    chapterId: string,
    updates: Partial<Pick<Chapter, 'title' | 'description'>>
  ) => {
    const updated = chaptersRef.current.map(ch =>
      ch.id === chapterId ? { ...ch, ...updates } : ch
    );
    setChapters(updated);
    chaptersRef.current = updated;
    const chapter = updated.find(ch => ch.id === chapterId);
    if (chapter) {
      try {
        await dataService.saveChapter(chapter);
      } catch {
        addToast("Couldn't save chapter");
      }
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    const updated = chaptersRef.current.filter(ch => ch.id !== chapterId);
    setChapters(updated);
    chaptersRef.current = updated;
    try {
      await dataService.deleteChapter(chapterId);
    } catch {
      addToast("Couldn't delete chapter");
    }
  };

  const handleReorderChapters = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map((id, idx) => {
        const ch = chaptersRef.current.find(c => c.id === id);
        return ch ? { ...ch, order: idx } : null;
      })
      .filter((ch): ch is Chapter => ch !== null);
    setChapters(reordered);
    chaptersRef.current = reordered;
    try {
      await dataService.reorderChapters(orderedIds);
    } catch {
      addToast("Couldn't reorder chapters");
    }
  };

  const handleAssignSceneToChapter = async (
    sceneId: string,
    chapterId: string | null,
    sceneOrder: number
  ) => {
    if (!projectData) return;
    setProjectData({
      ...projectData,
      scenes: projectData.scenes.map(s =>
        s.id === sceneId ? { ...s, chapterId, sceneOrder } : s
      ),
    });
    try {
      await dataService.assignSceneToChapter(sceneId, chapterId, sceneOrder);
    } catch {
      addToast("Couldn't assign scene to chapter");
    }
  };

  const handlePovSceneDrop = async (targetSceneNumber: number, targetPlotPointId: string) => {
    const scene = draggedPovSceneRef.current;
    if (!projectData || !scene || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    // Get all scenes for this character, sorted by scene number
    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    // Find the dragged scene index
    const draggedIndex = charScenes.findIndex(s => s.id === scene.id);
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

    // Renumber all scenes (stable IDs mean no data remapping needed)
    charScenes.forEach((scene, idx) => {
      scene.sceneNumber = idx + 1;
    });

    // Update the full scenes array
    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...charScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }
  };

  const handlePovDndStart = (e: DragStartEvent) => {
    setPovActiveId(String(e.active.id));
  };

  const handleSectionReorder = async (activeSectionId: string, overSectionId: string) => {
    if (!projectData || !selectedCharacterId) return;
    const charSections = projectData.plotPoints
      .filter(pp => pp.characterId === selectedCharacterId)
      .sort((a, b) => a.order - b.order);
    const activeIdx = charSections.findIndex(s => s.id === activeSectionId);
    const overIdx = charSections.findIndex(s => s.id === overSectionId);
    if (activeIdx < 0 || overIdx < 0 || activeIdx === overIdx) return;

    const reordered = arrayMove(charSections, activeIdx, overIdx);
    const updatedPlotPoints = projectData.plotPoints.map(pp => {
      const newIdx = reordered.findIndex(s => s.id === pp.id);
      return newIdx >= 0 ? { ...pp, order: newIdx } : pp;
    });
    const updatedData = { ...projectData, plotPoints: updatedPlotPoints };
    setProjectData(updatedData);

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (character) {
      const charScenes = projectData.scenes.filter(s => s.characterId === character.id);
      try {
        await dataService.saveCharacterOutline(character, updatedPlotPoints.filter(pp => pp.characterId === selectedCharacterId), charScenes);
      } catch {
        addToast("Couldn't save section order");
      }
    }
  };

  const handlePovDndEnd = (e: DragEndEvent) => {
    setPovActiveId(null);
    const { active, over } = e;
    if (!over || !projectData || !selectedCharacterId) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeType = (active.data.current as Record<string, unknown> | undefined)?.type;

    // Section drag — reorder sections
    if (activeType === 'section') {
      // over might be another section or a scene; find the target section either way
      const overType = (over.data.current as Record<string, unknown> | undefined)?.type;
      let targetSectionId = overId;
      if (overType === 'scene') {
        const sectionId = (over.data.current as Record<string, unknown>)?.sectionId as string | undefined;
        targetSectionId = sectionId ?? overId;
      }
      handleSectionReorder(activeId, targetSectionId);
      return;
    }

    // Scene drag
    const activeScene = projectData.scenes.find(s => s.id === activeId);
    if (!activeScene) return;

    // POV scene dragged onto bullpen → set aside
    if (overId === 'bullpen') {
      if (activeScene.plotPointId) handleSetAside(activeId);
      return;
    }

    let targetSectionId: string | null;
    let targetSceneNumber: number;

    if (overId.startsWith('section-empty:')) {
      targetSectionId = overId.slice('section-empty:'.length);
      targetSceneNumber = 1;
    } else {
      const overType = (over.data.current as Record<string, unknown> | undefined)?.type;
      if (overType === 'section') {
        // Dragging a scene onto a section header → drop at start of that section
        targetSectionId = overId;
        targetSceneNumber = 1;
      } else {
        const overScene = projectData.scenes.find(s => s.id === overId);
        if (!overScene?.plotPointId) return;
        targetSectionId = overScene.plotPointId;

        // Determine before/after using the flat in-section scene order
        const inSectionScenes = (displayedScenes ?? [])
          .filter(s => s.plotPointId !== null)
          .sort((a, b) => a.sceneNumber - b.sceneNumber);
        const activeIndex = inSectionScenes.findIndex(s => s.id === activeId);
        const overIndex = inSectionScenes.findIndex(s => s.id === overId);
        const dropsAfterOver = activeIndex < 0 || (activeIndex >= 0 && overIndex >= 0 && activeIndex < overIndex);
        targetSceneNumber = dropsAfterOver ? overScene.sceneNumber + 1 : overScene.sceneNumber;
      }
    }

    if (!targetSectionId) return;
    draggedPovSceneRef.current = activeScene;
    handlePovSceneDrop(targetSceneNumber, targetSectionId);
    draggedPovSceneRef.current = null;
  };

  const handlePovDndCancel = (_e: DragCancelEvent) => {
    setPovActiveId(null);
  };

  const handleArcDndStart = (e: DragStartEvent) => {
    setArcActiveId(String(e.active.id));
  };

  const handleArcDndCancel = () => {
    setArcActiveId(null);
  };

  const handleArcSceneDrop = async (targetSceneNumber: number, targetPlotPointId: string) => {
    const scene = draggedArcSceneRef.current;
    if (!projectData || !scene || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    const draggedIndex = charScenes.findIndex(s => s.id === scene.id);
    if (draggedIndex === -1) return;

    let targetIndex = charScenes.findIndex(s => s.sceneNumber >= targetSceneNumber);
    if (targetIndex === -1) targetIndex = charScenes.length;
    if (draggedIndex < targetIndex) targetIndex -= 1;

    const [movedScene] = charScenes.splice(draggedIndex, 1);
    movedScene.plotPointId = targetPlotPointId;
    targetIndex = Math.max(0, Math.min(targetIndex, charScenes.length));
    charScenes.splice(targetIndex, 0, movedScene);
    charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });

    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...charScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
    } catch {
      addToast('Couldn\'t save your changes — check that the project folder still exists');
    }
  };

  const handleArcReorderScenesInSection = async (sectionId: string, orderedIds: string[]) => {
    if (!projectData || !selectedCharacterId) return;
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;
    const charScenes = [...projectData.scenes.filter(s => s.characterId === selectedCharacterId)]
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    // Grab the sceneNumbers currently assigned to the section (in sorted order) and
    // redistribute them across the new scene order — other scenes stay untouched.
    const sectionNumbers = charScenes
      .filter(s => s.plotPointId === sectionId)
      .map(s => s.sceneNumber);
    const updated = charScenes.map(s => {
      const newPos = orderedIds.indexOf(s.id);
      return newPos >= 0 ? { ...s, sceneNumber: sectionNumbers[newPos] } : s;
    });
    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...updated];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, updated);
      await saveTimelineData(updatedScenes, sceneConnections);
    } catch {
      addToast('Couldn\'t save your changes — check that the project folder still exists');
    }
  };

  const handleAddSceneToSection = async (sectionId: string) => {
    if (!projectData || !selectedCharacterId) return;
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;
    const charScenes = [...projectData.scenes.filter(s => s.characterId === selectedCharacterId)]
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: selectedCharacterId,
      sceneNumber: charScenes.length + 1,
      title: '', content: '', tags: [],
      timelinePosition: null, isHighlighted: false, notes: [],
      plotPointId: sectionId, chapterId: null, sceneOrder: 0, stationId: null,
      polarity: '', transformation: '', dilemma: '', propellingAction: '', startingState: '', endingState: '',
    };
    const newCharScenes = [...charScenes, newScene];
    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...newCharScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, newCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
    } catch { addToast('Couldn\'t save your changes'); }
  };

  const handleAssignSceneToSection = async (sceneId: string, sectionId: string) => {
    if (!projectData || !selectedCharacterId) return;
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;
    const charScenes = [...projectData.scenes.filter(s => s.characterId === selectedCharacterId)]
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    const draggedIndex = charScenes.findIndex(s => s.id === sceneId);
    if (draggedIndex === -1) return;
    const sectionScenes = charScenes.filter(s => s.plotPointId === sectionId);
    const lastInSection = sectionScenes[sectionScenes.length - 1];
    let targetIndex = lastInSection
      ? charScenes.findIndex(s => s.id === lastInSection.id) + 1
      : charScenes.length;
    if (draggedIndex < targetIndex) targetIndex -= 1;
    const [movedScene] = charScenes.splice(draggedIndex, 1);
    movedScene.plotPointId = sectionId;
    charScenes.splice(Math.min(targetIndex, charScenes.length), 0, movedScene);
    charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });
    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...charScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
    } catch { addToast('Couldn\'t save your changes'); }
  };

  const handleArcDndEnd = (e: DragEndEvent) => {
    setArcActiveId(null);
    const { active, over } = e;
    if (!over || !projectData || !selectedCharacterId) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const activeScene = projectData.scenes.find(s => s.id === activeId);
    if (!activeScene) return;

    const overType = (over.data.current as Record<string, unknown> | undefined)?.type as string | undefined;
    const action = resolveArcDrop({
      activeId,
      activeHasSection: !!activeScene.plotPointId,
      overId,
      overType,
    });

    switch (action.kind) {
      case 'setAside':
        handleSetAside(activeId);
        return;
      case 'assignToSection':
        handleAssignSceneToSection(activeId, action.sectionId);
        return;
      case 'dropAtSectionStart':
        draggedArcSceneRef.current = activeScene;
        handleArcSceneDrop(1, action.sectionId);
        draggedArcSceneRef.current = null;
        return;
      case 'reorderAtScene': {
        const overScene = projectData.scenes.find(s => s.id === action.overSceneId);
        if (!overScene?.plotPointId) return;
        const targetSectionId = overScene.plotPointId;
        const sectionScenes = projectData.scenes
          .filter(s => s.plotPointId === targetSectionId)
          .sort((a, b) => a.sceneNumber - b.sceneNumber);
        const activeIdx = sectionScenes.findIndex(s => s.id === activeId);
        const overIdx = sectionScenes.findIndex(s => s.id === action.overSceneId);
        const dropsAfter = activeIdx < 0 || (activeIdx >= 0 && overIdx >= 0 && activeIdx < overIdx);
        const targetSceneNumber = dropsAfter ? overScene.sceneNumber + 1 : overScene.sceneNumber;
        draggedArcSceneRef.current = activeScene;
        handleArcSceneDrop(targetSceneNumber, targetSectionId);
        draggedArcSceneRef.current = null;
        return;
      }
      default:
        return;
    }
  };

  const handleSetAside = async (sceneId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    if (scene.plotPointId) {
      setPreviousPlotPointIds(prev => ({ ...prev, [sceneId]: scene.plotPointId! }));
    }
    scene.plotPointId = null;
    scene.timelinePosition = null;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });

    const updatedData = { ...projectData, scenes: [...projectData.scenes] };
    setProjectData(updatedData);

    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedData.scenes, sceneConnections);
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }
  };

  const handleReturnFromBullpen = async (sceneId: string, targetPlotPointId: string) => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // All other char scenes sorted by current sceneNumber (includes other bullpen scenes)
    const otherCharScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId && s.id !== sceneId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    // Find insertion point: after the last in-section scene belonging to the target
    // section or any section ordered before it \u2014 so the returned scene lands at the
    // end of the target section rather than at its old (arbitrary) sceneNumber position.
    const charPlotPoints = projectData.plotPoints
      .filter(p => p.characterId === character.id)
      .sort((a, b) => a.order - b.order);

    const targetSection = charPlotPoints.find(p => p.id === targetPlotPointId);
    if (!targetSection) return;

    let insertAfterIdx = 0;
    for (let i = 0; i < otherCharScenes.length; i++) {
      const s = otherCharScenes[i];
      if (!s.plotPointId) continue;
      const sSection = charPlotPoints.find(p => p.id === s.plotPointId);
      if (sSection && sSection.order <= targetSection.order) {
        insertAfterIdx = i + 1;
      }
    }

    scene.plotPointId = targetPlotPointId;

    const charScenes = [
      ...otherCharScenes.slice(0, insertAfterIdx),
      scene,
      ...otherCharScenes.slice(insertAfterIdx),
    ];
    charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });

    const updatedData = { ...projectData, scenes: [...projectData.scenes] };
    setProjectData(updatedData);

    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedData.scenes, sceneConnections);
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }
  };

  const handleToggleSynopsisMode = (plotPointId: string) => {
    setSectionSynopsisModes(prev => ({
      ...prev,
      [plotPointId]: prev[plotPointId] === 'expand' ? 'inline' : 'expand',
    }));
  };

  const handleSetAllSynopsisModes = (mode: 'inline' | 'expand') => {
    if (!projectData) return;
    const modes: Record<string, 'inline' | 'expand'> = {};
    projectData.plotPoints
      .filter(p => p.characterId === selectedCharacterId)
      .forEach(p => { modes[p.id] = mode; });
    setSectionSynopsisModes(modes);
  };

  const handleAddBullpenScene = async () => {
    if (!projectData || !selectedCharacterId) return;

    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === selectedCharacterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    const characterTag = character.name.toLowerCase().replace(/\s+/g, '_');

    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: selectedCharacterId,
      sceneNumber: charScenes.length + 1,
      title: 'New scene',
      content: 'New scene',
      tags: [characterTag],
      timelinePosition: null,
      isHighlighted: false,
      notes: [],
      plotPointId: null,
      chapterId: null,
      sceneOrder: 0,
      stationId: null,
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '', startingState: '', endingState: '',
    };

    const newCharScenes = [...charScenes, newScene];
    const otherScenes = projectData.scenes.filter(s => s.characterId !== selectedCharacterId);
    const updatedScenes = [...otherScenes, ...newCharScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, newCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }
  };



  const DEFAULT_HEX_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#f59e0b'];

  const getCharacterHexColor = useCallback((characterId: string): string => {
    if (characterColors[characterId]) return characterColors[characterId];
    if (!projectData) return DEFAULT_HEX_COLORS[0];
    const index = projectData.characters.findIndex(c => c.id === characterId);
    return DEFAULT_HEX_COLORS[index % DEFAULT_HEX_COLORS.length];
  }, [characterColors, projectData]);

  const handleCharacterColorChange = async (characterId: string, color: string) => {
    const newColors = { ...characterColors, [characterId]: color };
    setCharacterColors(newColors);
    characterColorsRef.current = newColors;
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections);
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
      actId: null,
      inBullpen: false,
      title: 'New Section',
      expectedSceneCount: null,
      description: '',
      synopsis: '',
      order: maxOrder + 1,
      startingState: '',
      endingState: '',
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '',
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

  const handleCreateArcSection = async () => {
    if (!projectData || !selectedCharacterId) return;
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === selectedCharacterId);
    const maxOrder = charPlotPoints.length > 0 ? Math.max(...charPlotPoints.map(p => p.order)) : -1;
    const newPlotPoint: PlotPoint = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: selectedCharacterId,
      actId: null,
      inBullpen: false,
      title: 'New Section',
      expectedSceneCount: null,
      description: '',
      synopsis: '',
      order: maxOrder + 1,
      startingState: '',
      endingState: '',
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '',
    };
    const updatedPlotPoints = [...projectData.plotPoints, newPlotPoint];
    setProjectData({ ...projectData, plotPoints: updatedPlotPoints });
    const charScenes = projectData.scenes.filter(s => s.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, updatedPlotPoints.filter(p => p.characterId === character.id), charScenes);
    } catch {
      addToast('Could not save your changes');
    }
  };

  const handleCreateArcBullpenScene = async () => {
    if (!projectData || !selectedCharacterId) return;
    const character = projectData.characters.find(c => c.id === selectedCharacterId);
    if (!character) return;
    const charScenes = projectData.scenes.filter(s => s.characterId === selectedCharacterId).sort((a, b) => a.sceneNumber - b.sceneNumber);
    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId: selectedCharacterId,
      sceneNumber: charScenes.length + 1,
      title: 'New scene',
      content: 'New scene',
      tags: [character.name.toLowerCase().replace(/\s+/g, '_')],
      timelinePosition: null,
      isHighlighted: false,
      notes: [],
      plotPointId: null,
      chapterId: null,
      sceneOrder: 0,
      stationId: null,
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '', startingState: '', endingState: '',
    };
    const updatedScenes = [...projectData.scenes, newScene];
    setProjectData({ ...projectData, scenes: updatedScenes });
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, updatedScenes.filter(s => s.characterId === selectedCharacterId));
      await saveTimelineData(updatedScenes, sceneConnections);
    } catch {
      addToast('Could not save your changes');
    }
  };

  // Send a scene to the bullpen from the arc view: clear its section assignment
  // and unbraid it (loose scenes can't be braided), mirroring handleDeletePlotPoint.
  const handleSendSceneToBullpen = async (sceneId: string) => {
    if (!projectData) return;
    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    if (!scene.plotPointId && scene.timelinePosition === null) return; // already loose
    const updatedScenes = projectData.scenes.map(s =>
      s.id === sceneId ? { ...s, plotPointId: null, timelinePosition: null } : s
    );
    setProjectData({ ...projectData, scenes: updatedScenes });
    try {
      const character = projectData.characters.find(c => c.id === scene.characterId);
      const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === scene.characterId);
      if (character) {
        await dataService.saveCharacterOutline(character, charPlotPoints, updatedScenes.filter(s => s.characterId === scene.characterId));
      }
    } catch {
      addToast('Could not send scene to bullpen');
    }
  };

  const handleDeletePlotPoint = async (plotPointId: string) => {
    if (!projectData) return;

    const plotPoint = projectData.plotPoints.find(p => p.id === plotPointId);
    if (!plotPoint) return;

    // Unassign scenes from this section (set plotPointId to null so they float).
    // Loose scenes can't be braided, so drop them from the rails too.
    const updatedScenes = projectData.scenes.map(s =>
      s.plotPointId === plotPointId ? { ...s, plotPointId: null, timelinePosition: null } : s
    );

    // Remove the plot point
    const updatedPlotPoints = projectData.plotPoints.filter(p => p.id !== plotPointId);

    const updatedData = { ...projectData, scenes: updatedScenes, plotPoints: updatedPlotPoints };
    setProjectData(updatedData);

    // Save to file
    const character = projectData.characters.find(c => c.id === plotPoint.characterId);
    if (character) {
      const charScenes = updatedScenes.filter(s => s.characterId === character.id);
      const charPlotPoints = updatedPlotPoints.filter(p => p.characterId === character.id);
      try {
        await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
        await saveTimelineData(updatedScenes, sceneConnections);
      } catch (err) {
        addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
      }
    }
  };

  // Save timeline positions, connections, and chapters to file
  const saveTimelineData = useCallback(async (
    scenes: Scene[],
    connections: Record<string, string[]>,
  ) => {
    const positions: Record<string, number> = {};
    const clearedPositions: string[] = [];
    const sceneWordCounts: Record<string, number> = {};

    for (const scene of scenes) {
      if (scene.timelinePosition !== null) {
        positions[scene.id] = scene.timelinePosition;
      } else {
        clearedPositions.push(scene.id);
      }
      if (scene.wordCount !== undefined) {
        sceneWordCounts[scene.id] = scene.wordCount;
      }
    }

    try {
      setSaveStatus('saving');
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
      // Connections are already keyed by scene.id at runtime — save directly
      await dataService.saveTimeline({
        positions, clearedPositions, connections,
        characterColors: characterColorsRef.current,
        wordCounts: sceneWordCounts,
        fontSettings: allFontSettingsRef.current.global,
        archivedScenes: archivedScenesRef.current,
        // Scene metadata now managed via braidrSaveArcFieldDefs/braidrSaveArcFieldValues — no-op in applySaveTimeline
        wordCountGoal: wordCountGoalRef.current,
        allFontSettings: allFontSettingsRef.current,
        tasks: tasksRef.current,
        taskFieldDefs: taskFieldDefsRef.current,
        taskViews: taskViewsRef.current,
        inlineMetadataFields: inlineMetadataFieldsRef.current,
        showInlineLabels: showInlineLabelsRef.current,
        taskColumnWidths: taskColumnWidthsRef.current,
        taskVisibleColumns: taskVisibleColumnsRef.current,
        timelineDates: timelineDatesRef.current,
        worldEvents: worldEventsRef.current,
        timelineEndDates: timelineEndDatesRef.current,
        tags: tagsRef.current,
      });
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
      if (projectData && isDirtyRef.current && !loadInProgressRef.current) {
        // Flush any pending editor content first
        editorViewRef.current?.flush();
        saveTimelineData(projectData.scenes, sceneConnections);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [projectData, sceneConnections, saveTimelineData]);

  // Flush and save on window close / beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      editorViewRef.current?.flush();
      // Trigger a save (best-effort since beforeunload doesn't wait for async)
      if (projectData && !loadInProgressRef.current) {
        saveTimelineData(projectData.scenes, sceneConnections);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [projectData, sceneConnections, saveTimelineData]);

  // Listen for app-closing IPC from main process (graceful quit)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onAppClosing) {
      const cleanup = api.onAppClosing(async () => {
        isClosingRef.current = true;
        editorViewRef.current?.flush();
        // Commit any in-flight task timer before saving (no-op if not running)
        handleStopTaskTimer();
        // End current writing session before closing
        if (sessionTrackerRef.current?.isActive()) {
          const session = sessionTrackerRef.current.getCurrentSession();
          if (session) {
            const html = draftContentRef.current[session.sceneKey] || '';
            const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
            const wordCount = text ? text.split(/\s+/).length : 0;
            sessionTrackerRef.current.endSession(wordCount);
            // onSessionEnd updates analyticsRef.current synchronously but its saveAnalytics
            // is fire-and-forget — await it explicitly so the snapshot survives the close.
            if (projectData && analyticsRef.current) {
              await saveAnalytics(projectData.projectPath, analyticsRef.current);
            }
          }
        }
        if (projectData) {
          await saveTimelineData(projectData.scenes, sceneConnections);
        }
        if (projectData) {
          try {
            await dataService.releaseProjectLock(projectData.projectPath);
          } catch { /* best-effort */ }
        }
        api.safeToClose();
      });
      return cleanup;
    }
  }, [projectData, sceneConnections, saveTimelineData, handleStopTaskTimer]);

  // Auto-dismiss the "taken over" toast after 5 seconds
  useEffect(() => {
    if (!takenOverBy) return;
    const timer = setTimeout(() => setTakenOverBy(null), 5000);
    return () => clearTimeout(timer);
  }, [takenOverBy]);

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

  const handleDropOnTimeline = async (e: React.DragEvent | null, targetIndex: number) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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

    await saveTimelineData(finalScenes, sceneConnections);
    track('scene_reordered', { view: 'braided' });
  };

  const handleDropOnInbox = async (e: React.DragEvent | null) => {
    if (e) {
      e.preventDefault();
    }
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

    await saveTimelineData(finalScenes, sceneConnections);
  };

  // dnd-kit handlers for BraidedListView (separate from HTML5 drag handlers used by RailsView)
  const handleBraidedReorder = useCallback(async (activeId: string, overId: string) => {
    if (!projectData) return;
    const braidedScenes = projectData.scenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
    const oldIndex = braidedScenes.findIndex(s => s.id === activeId);
    const newIndex = braidedScenes.findIndex(s => s.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(braidedScenes, oldIndex, newIndex);
    const newPositions = new Map(reordered.map((s, i) => [s.id, i + 1]));
    const finalScenes = projectData.scenes.map(s => {
      const pos = newPositions.get(s.id);
      return pos !== undefined ? { ...s, timelinePosition: pos } : s;
    });
    setProjectData({ ...projectData, scenes: finalScenes });
    await saveTimelineData(finalScenes, sceneConnections);
    track('scene_reordered', { view: 'braided' });
  }, [projectData, sceneConnections, saveTimelineData]);

  const handleBraidedMoveToInbox = useCallback(async (sceneId: string) => {
    if (!projectData) return;
    const updatedScenes = projectData.scenes.map(s =>
      s.id === sceneId ? { ...s, timelinePosition: null } : s
    );
    const braidedRemaining = updatedScenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
    const finalScenes = updatedScenes.map(scene => {
      const idx = braidedRemaining.findIndex(s => s.id === scene.id);
      return idx !== -1 ? { ...scene, timelinePosition: idx + 1 } : scene;
    });
    setProjectData({ ...projectData, scenes: finalScenes });
    await saveTimelineData(finalScenes, sceneConnections);
  }, [projectData, sceneConnections, saveTimelineData]);

  const handleBraidedMoveFromInbox = useCallback(async (sceneId: string, overSceneId: string) => {
    if (!projectData) return;
    const braidedScenes = projectData.scenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
    const overIndex = braidedScenes.findIndex(s => s.id === overSceneId);
    const insertAt = overIndex === -1 ? braidedScenes.length : overIndex;
    const inboxScene = projectData.scenes.find(s => s.id === sceneId);
    if (!inboxScene) return;
    const withInbox = [...braidedScenes];
    withInbox.splice(insertAt, 0, inboxScene);
    const newPositions = new Map(withInbox.map((s, i) => [s.id, i + 1]));
    const finalScenes = projectData.scenes.map(s => {
      const pos = newPositions.get(s.id);
      return pos !== undefined ? { ...s, timelinePosition: pos } : s;
    });
    setProjectData({ ...projectData, scenes: finalScenes });
    await saveTimelineData(finalScenes, sceneConnections);
  }, [projectData, sceneConnections, saveTimelineData]);

  // Tag management handlers
  const handleUpdateTag = (tagId: string, category: TagCategory) => {
    if (!projectData) return;
    const updatedTags = projectData.tags.map(tag =>
      tag.id === tagId ? { ...tag, category } : tag
    );
    setProjectData({ ...projectData, tags: updatedTags });
    tagsRef.current = updatedTags;
    isDirtyRef.current = true;
  };

  const handleCreateTag = (name: string, category: TagCategory) => {
    if (!projectData) return;
    const newTag: Tag = {
      id: Math.random().toString(36).substring(2, 11),
      name,
      category,
    };
    const updatedTags = [...projectData.tags, newTag];
    setProjectData({ ...projectData, tags: updatedTags });
    tagsRef.current = updatedTags;
    isDirtyRef.current = true;
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
    tagsRef.current = updatedTags;
    isDirtyRef.current = true;
  };

  const handleOpenInEditor = (sceneKey: string) => {
    setEditorInitialSceneKey(sceneKey);
    setViewMode('editor');
    setListFloatingEditor(null);
  };

  const handleInsertSceneAtPosition = async (position: number, characterId: string, plotPointId: string) => {
    if (!projectData) return;

    const character = projectData.characters.find(c => c.id === characterId);
    if (!character) return;

    // Get character's scenes sorted by sceneNumber
    const charScenes = projectData.scenes
      .filter(s => s.characterId === characterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    const newSceneNumber = charScenes.length + 1;
    const characterTag = character.name.toLowerCase().replace(/\s+/g, '_');

    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId,
      sceneNumber: newSceneNumber,
      title: 'New scene',
      content: 'New scene',
      tags: [characterTag],
      timelinePosition: null, // will be set below
      isHighlighted: false,
      notes: [],
      plotPointId,
      chapterId: null,
      sceneOrder: 0,
      stationId: null,
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '', startingState: '', endingState: '',
    };

    // Add new scene to character's scenes
    const newCharScenes = [...charScenes, newScene];

    // Update the full scenes array
    const otherScenes = projectData.scenes.filter(s => s.characterId !== characterId);
    const updatedScenes = [...otherScenes, ...newCharScenes];

    // Insert into braided timeline at position and renumber
    const braidedScenes = updatedScenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));
    braidedScenes.splice(position, 0, newScene);

    // Assign new timeline positions
    const positionMap = new Map<string, number>();
    braidedScenes.forEach((s, idx) => { positionMap.set(s.id, idx + 1); });

    const finalScenes = updatedScenes.map(s => {
      const newPos = positionMap.get(s.id);
      if (newPos !== undefined) return { ...s, timelinePosition: newPos };
      return s;
    });

    const updatedData = { ...projectData, scenes: finalScenes };
    setProjectData(updatedData);

    // Save character outline + timeline
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    const finalCharScenes = finalScenes.filter(s => s.characterId === characterId).sort((a, b) => a.sceneNumber - b.sceneNumber);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, finalCharScenes);
      await saveTimelineData(finalScenes, sceneConnections);
      track('scene_created', { character_id: characterId, source: 'braided_insert' });
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }

  };

  const handleAddSceneToInbox = async (characterId: string) => {
    if (!projectData) return;
    const character = projectData.characters.find(c => c.id === characterId);
    if (!character) return;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === characterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId,
      sceneNumber: charScenes.length + 1,
      title: 'New scene',
      content: 'New scene',
      tags: [character.name.toLowerCase().replace(/\s+/g, '_')],
      timelinePosition: null,
      isHighlighted: false,
      notes: [],
      plotPointId: null,
      chapterId: null,
      sceneOrder: 0,
      stationId: null,
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '', startingState: '', endingState: '',
    };

    const updatedScenes = [...projectData.scenes, newScene];
    setProjectData({ ...projectData, scenes: updatedScenes });

    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    const finalCharScenes = updatedScenes.filter(s => s.characterId === characterId).sort((a, b) => a.sceneNumber - b.sceneNumber);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, finalCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
      track('scene_created', { character_id: characterId, source: 'toolbar_inbox' });
    } catch (_err) {
      addToast("Couldn't save your changes — check that the project folder still exists");
    }
  };

  const handleMovePovSceneFromTable = useCallback((sceneId: string, targetIndex: number, targetPlotPointId: string | null) => {
    if (!projectData) return;
    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const charScenes = projectData.scenes
      .filter(s => s.characterId === scene.characterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    const [movedScene] = charScenes.splice(charScenes.findIndex(s => s.id === sceneId), 1);
    movedScene.plotPointId = targetPlotPointId;
    charScenes.splice(targetIndex, 0, movedScene);
    charScenes.forEach((s, idx) => { s.sceneNumber = idx + 1; });
    const updatedScenes = [...projectData.scenes.filter(s => s.characterId !== scene.characterId), ...charScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);
    saveTimelineData(updatedScenes, sceneConnections);
  }, [projectData, saveTimelineData, sceneConnections]);

  const handleAddSceneForCharacterFromTable = useCallback(async (characterId: string) => {
    if (!projectData) return;
    await handleAddSceneToInbox(characterId);
  }, [projectData, handleAddSceneToInbox]);

  const handleReorderScenesFromTable = useCallback((orderedIds: string[]) => {
    if (!projectData) return;
    // orderedIds is the visible (possibly filtered) scenes in new order.
    // Re-insert them into the full scene list at their original position slots,
    // then assign sequential timelinePositions to everything.
    const visibleSet = new Set(orderedIds);
    const allSorted = [...projectData.scenes]
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0));

    // Build new order: walk allSorted, replacing visible scenes with the new order
    let visibleIdx = 0;
    const newOrder = allSorted.map(s => {
      if (visibleSet.has(s.id)) {
        return projectData.scenes.find(sc => sc.id === orderedIds[visibleIdx++])!;
      }
      return s;
    });

    const updatedScenes = projectData.scenes.map(s => {
      const pos = newOrder.findIndex(o => o.id === s.id);
      return pos !== -1 ? { ...s, timelinePosition: pos + 1 } : s;
    });

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);
    saveTimelineData(updatedScenes, sceneConnections);
  }, [projectData, sceneConnections, saveTimelineData]);

  const handleInsertSceneOnTimeline = async (characterId: string, plotPointId: string, date: string): Promise<string | null> => {
    if (!projectData) return null;

    const character = projectData.characters.find(c => c.id === characterId);
    if (!character) return null;

    const charScenes = projectData.scenes
      .filter(s => s.characterId === characterId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    const newSceneNumber = charScenes.length + 1;
    const characterTag = character.name.toLowerCase().replace(/\s+/g, '_');

    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      characterId,
      sceneNumber: newSceneNumber,
      title: 'New scene',
      content: 'New scene',
      tags: [characterTag],
      timelinePosition: null,
      isHighlighted: false,
      notes: [],
      plotPointId,
      chapterId: null,
      sceneOrder: 0,
      stationId: null,
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '', startingState: '', endingState: '',
    };

    const newCharScenes = [...charScenes, newScene];
    const otherScenes = projectData.scenes.filter(s => s.characterId !== characterId);
    const updatedScenes = [...otherScenes, ...newCharScenes];

    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Assign the date
    const updatedDates = { ...timelineDatesRef.current, [newScene.id]: date };
    handleTimelineDatesChange(updatedDates);

    // Save
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, newCharScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
      track('scene_created', { character_id: characterId, source: 'timeline_insert' });
    } catch (err) {
      addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
    }

    return newScene.id;
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
    const updated = { ...draftContentRef.current, [sceneKey]: html };
    setDraftContent(updated);
    draftContentRef.current = updated;

    // Save directly to individual file
    if (projectData?.projectPath) {
      try {
        await dataService.saveDraft(projectData.projectPath, sceneKey, html);
      } catch (err) {
        console.error('Failed to save draft:', err);
      }
    }

    // Notify session tracker of editing activity
    if (sessionTrackerRef.current) {
      const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const wordCount = text ? text.split(/\s+/).length : 0;
      sessionTrackerRef.current.recordActivity(sceneKey, wordCount);
    }
  };

  const handleScratchpadChange = (sceneKey: string, html: string) => {
    isDirtyRef.current = true;
    const updated = { ...scratchpadContentRef.current, [sceneKey]: html };
    setScratchpadContent(updated);
    scratchpadContentRef.current = updated;

    if (projectData?.projectPath) {
      dataService.saveScratchpad(projectData.projectPath, sceneKey, html)
        .catch(err => console.error('Failed to save scratchpad:', err));
    }
  };

  const handleAddComment = (sceneKey: string, text: string) => {
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
  };

  const handleDeleteComment = (sceneKey: string, commentId: string) => {
    isDirtyRef.current = true;
    const existing = sceneCommentsRef.current[sceneKey] || [];
    const updated = { ...sceneCommentsRef.current, [sceneKey]: existing.filter(c => c.id !== commentId) };
    setSceneComments(updated);
    sceneCommentsRef.current = updated;

    if (projectData?.projectPath) {
      dataService.saveSceneComments(projectData.projectPath, sceneKey, updated[sceneKey])
        .catch(err => console.error('Failed to save comments:', err));
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

    if (projectData?.projectPath) {
      dataService.saveDraftVersions(projectData.projectPath, sceneKey, draftsRef.current[sceneKey])
        .catch(err => console.error('Failed to save draft versions:', err));
    }
  };

  const handleMetadataChange = async (sceneKey: string, fieldId: string, value: string | string[]) => {
    const sceneValues = { ...(sceneMetadataRef.current[sceneKey] || {}), [fieldId]: value };
    const updated = { ...sceneMetadataRef.current, [sceneKey]: sceneValues };
    setSceneMetadata(updated);
    sceneMetadataRef.current = updated;
    // Also keep arcFieldValues in sync and persist via arc IPC
    setArcFieldValues(prev => ({ ...prev, [`scene:${sceneKey}`]: sceneValues }));
    try {
      await dataService.saveArcFieldValues('scene', sceneKey, sceneValues);
    } catch {
      addToast('Could not save scene metadata');
    }
  };

  const handleInlineMetadataFieldsChange = (fields: string[]) => {
    setInlineMetadataFields(fields);
    inlineMetadataFieldsRef.current = fields;
    if (projectData) {
      saveTimelineData(projectData.scenes, sceneConnections);
    }
  };

  const handleShowInlineLabelsChange = (show: boolean) => {
    setShowInlineLabels(show);
    showInlineLabelsRef.current = show;
    if (projectData) {
      saveTimelineData(projectData.scenes, sceneConnections);
    }
  };

  const handleMetadataFieldDefsChange = async (defs: MetadataFieldDef[]) => {
    setMetadataFieldDefs(defs);
    metadataFieldDefsRef.current = defs;
    // Keep arcFieldDefs in sync and persist via arc IPC
    const arcDefs: ArcFieldDef[] = defs.map(d => ({
      id: d.id, label: d.label, type: d.type as ArcFieldDef['type'],
      options: d.options, optionColors: d.optionColors, order: d.order, scope: 'scene' as const,
    }));
    setArcFieldDefs(prev => [...prev.filter(d => d.scope !== 'scene'), ...arcDefs]);
    try {
      await dataService.saveArcFieldDefs(arcDefs);
    } catch {
      addToast('Could not save scene field definitions');
    }
  };

  const handleArchiveScene = async (sceneId: string) => {
    if (!projectData) return;

    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Create archived copy — preserve title and draft content so unarchive restores everything
    const archived: ArchivedScene = {
      id: scene.id,
      characterId: scene.characterId,
      originalSceneNumber: scene.sceneNumber,
      plotPointId: scene.plotPointId,
      title: scene.title,
      content: scene.content,
      draftContent: draftContentRef.current[scene.id] || undefined,
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

    // Remove the archived scene's keyed data
    const newDC = { ...draftContentRef.current };
    delete newDC[scene.id];
    draftContentRef.current = newDC;
    setDraftContent(newDC);
    const newDr = { ...draftsRef.current };
    delete newDr[scene.id];
    draftsRef.current = newDr;
    setDrafts(newDr);
    const newSM = { ...sceneMetadataRef.current };
    delete newSM[scene.id];
    sceneMetadataRef.current = newSM;
    setSceneMetadata(newSM);

    charScenes.forEach((s, idx) => {
      s.sceneNumber = idx + 1;
    });

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
        await saveTimelineData(updatedScenes, newConnections);
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
      title: archived.title ?? archived.content,
      content: archived.content,
      tags: archived.tags,
      timelinePosition: null,
      isHighlighted: archived.isHighlighted,
      notes: archived.notes,
      plotPointId: targetPlotPointId,
      wordCount: archived.wordCount,
      chapterId: null,
      sceneOrder: 0,
      stationId: null,
      polarity: '',
      transformation: '',
      dilemma: '',
      propellingAction: '', startingState: '', endingState: '',
    };

    // Restore draft content if it was preserved
    if (archived.draftContent) {
      const updatedDC = { ...draftContentRef.current, [archived.id]: archived.draftContent };
      draftContentRef.current = updatedDC;
      setDraftContent(updatedDC);
    }

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
        await saveTimelineData(updatedScenes, sceneConnections);
      } catch (err) {
        addToast('Couldn\u2019t save your changes \u2014 check that the project folder still exists');
      }
    }
  };

  // Load archived notes when archive panel opens
  useEffect(() => {
    if (showArchivePanel && projectData) {
      (async () => {
        try {
          const index = await dataService.loadNotesIndex(projectData.projectPath);
          setArchivedNotes(index.archivedNotes || []);
        } catch {}
      })();
    }
  }, [showArchivePanel, projectData?.projectPath]);

  const handleRestoreNote = async (archived: ArchivedNote) => {
    if (!projectData) return;
    const fileName = `${archived.id}.html`;

    try {
      // Recreate the .html file
      await dataService.createNote(projectData.projectPath, fileName);
      await dataService.saveNote(projectData.projectPath, fileName, archived.content);

      // Load current notes index, add note back as root, remove from archive
      const index = await dataService.loadNotesIndex(projectData.projectPath);
      const rootNotes = (index.notes || []).filter(n => !n.parentId);
      const maxOrder = rootNotes.reduce((max, n) => Math.max(max, n.order ?? 0), -1);

      const restoredMeta: NoteMetadata = {
        id: archived.id,
        title: archived.title,
        fileName,
        parentId: null, // Restore as root — original parent may not exist
        order: maxOrder + 1,
        createdAt: archived.originalMetadata.createdAt,
        modifiedAt: Date.now(),
        outgoingLinks: archived.outgoingLinks,
        sceneLinks: archived.sceneLinks,
        tags: archived.tags,
      };

      const updatedIndex: NotesIndex = {
        ...index,
        notes: [...(index.notes || []), restoredMeta],
        archivedNotes: (index.archivedNotes || []).filter(a => a.id !== archived.id),
        version: 2,
      };
      await dataService.saveNotesIndex(projectData.projectPath, updatedIndex);
      setArchivedNotes(updatedIndex.archivedNotes || []);
      addToast(`Restored "${archived.title}"`);
      track('note_restored');
    } catch (err) {
      addToast('Couldn\u2019t restore note');
    }
  };

  const handlePermanentlyDeleteNote = async (archived: ArchivedNote) => {
    const confirmed = window.confirm(`Permanently delete "${archived.title}"? This cannot be undone.`);
    if (!confirmed || !projectData) return;

    try {
      const index = await dataService.loadNotesIndex(projectData.projectPath);
      const updatedIndex: NotesIndex = {
        ...index,
        archivedNotes: (index.archivedNotes || []).filter(a => a.id !== archived.id),
        version: 2,
      };
      await dataService.saveNotesIndex(projectData.projectPath, updatedIndex);
      setArchivedNotes(updatedIndex.archivedNotes || []);
    } catch (err) {
      addToast('Couldn\u2019t delete note');
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
      chapterId: null,
      sceneOrder: 0,
      stationId: null,
      polarity: scene.polarity,
      transformation: scene.transformation,
      dilemma: scene.dilemma,
      propellingAction: scene.propellingAction,
      startingState: scene.startingState,
      endingState: scene.endingState,
    };

    // Insert duplicate after original
    charScenes.splice(originalIndex + 1, 0, duplicateScene);

    // Renumber all scenes (stable IDs mean no data remapping needed)
    charScenes.forEach((s, idx) => {
      s.sceneNumber = idx + 1;
    });

    // Update the full scenes array
    const otherScenes = projectData.scenes.filter(s => s.characterId !== scene.characterId);
    const updatedScenes = [...otherScenes, ...charScenes];
    const updatedData = { ...projectData, scenes: updatedScenes };
    setProjectData(updatedData);

    // Save to file
    const charPlotPoints = projectData.plotPoints.filter(p => p.characterId === character.id);
    try {
      await dataService.saveCharacterOutline(character, charPlotPoints, charScenes);
      await saveTimelineData(updatedScenes, sceneConnections);
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
    await saveTimelineData(updatedScenes, sceneConnections);
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

    const updatedTags = [...projectData.tags, ...newMasterTags];
    const updatedData = {
      ...projectData,
      scenes: updatedScenes,
      tags: updatedTags,
    };
    setProjectData(updatedData);
    tagsRef.current = updatedTags;

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
    return (
      <LandingScreen
        recentProjects={recentProjects}
        loading={loading}
        error={error}
        showUpdateModal={showUpdateModal}
        onCloseUpdateModal={() => setShowUpdateModal(false)}
        showNewProject={showNewProject}
        onSetShowNewProject={setShowNewProject}
        newProjectName={newProjectName}
        onNewProjectNameChange={setNewProjectName}
        newProjectLocation={newProjectLocation}
        onNewProjectLocationChange={setNewProjectLocation}
        newProjectTemplate={newProjectTemplate}
        onTemplateChange={setNewProjectTemplate}
        onCreateNewProject={handleCreateNewProject}
        onSelectFolder={handleSelectFolder}
        onOpenRecentProject={handleOpenRecentProject}
        onSelectLocation={handleSelectLocation}
        onClearError={() => setError(null)}
        lockConflict={lockConflict}
        onCloseLockConflict={() => setLockConflict(null)}
        onTakeOver={async (projectPath, projectName) => {
          setLockConflict(null);
          await dataService.acquireProjectLock(projectPath, true);
          await loadProjectFromPath(projectPath, projectName);
        }}
      />
    );
  }

  // Word count goal change handler
  const handleWordCountGoalChange = async (goal: number) => {
    setWordCountGoal(goal);
    wordCountGoalRef.current = goal;
    if (projectData) {
      await saveTimelineData(projectData.scenes, sceneConnections);
    }
  };

  // Render function for pane system — maps TabParams to the appropriate view JSX
  const renderView = (tabParams: TabParams, tabId: string): React.ReactElement | null => {
    const mode = tabParams.type as ViewMode;
    return (
      <div
        className={`main-content main-content--${mode}`}
        style={mode === 'editor' || mode === 'braided' || mode === 'notes' || mode === 'tasks' || mode === 'timeline' || mode === 'account' || mode === 'arc' || mode === 'pov'
          ? { flex: 1, display: 'flex', flexDirection: 'column' as const, padding: 0, overflow: 'hidden' }
          : undefined}
      >
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div
            className={`scene-list scene-list--${mode}`}

            style={mode === 'editor' || mode === 'braided' || mode === 'notes' || mode === 'tasks' || mode === 'timeline' || mode === 'account' || mode === 'arc'
              ? { flex: 1, display: 'flex', flexDirection: 'column' as const, padding: 0, margin: 0, maxWidth: 'none', minHeight: 0 }
              : undefined}
          >
            {mode === 'account' ? (
              <AccountView
                licenseStatus={licenseStatus}
                onLicenseChange={() => {
                  (window as any).electronAPI?.getLicenseStatus?.().then((result: any) => {
                    if (result.success) setLicenseStatus(result.data);
                  });
                }}
              />
            ) : mode === 'analytics' ? (
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
                onAnalyticsChange={(patch) => {
                  // Keep App's authoritative analytics copy in sync with goal
                  // edits made in the dashboard, then persist from that copy so a
                  // later session/timer save can't revert the change. See Bug 2.
                  if (!analyticsRef.current || !projectData) return;
                  const updated = applyAnalyticsPatch(analyticsRef.current, patch);
                  analyticsRef.current = updated;
                  saveAnalytics(projectData.projectPath, updated);
                }}
                sceneSessions={sceneSessions}
                customCheckinCategories={analyticsRef.current?.customCheckinCategories}
                tasks={tasks}
              />
            ) : mode === 'notes' ? (
              <NotesView
                projectPath={projectData.projectPath}
                scenes={projectData.scenes}
                characters={projectData.characters}
                tags={projectData.tags}
                initialNoteId={pendingNoteId}
                onNoteNavigated={() => setPendingNoteId(null)}
                storagePrefix={tabId}
              />
            ) : mode === 'tasks' ? (
              <TasksView
                tasks={tasks}
                taskFieldDefs={taskFieldDefs}
                taskViews={taskViews}
                tags={projectData.tags}
                characters={projectData.characters}
                scenes={projectData.scenes}
                onTasksChange={handleTasksChange}
                onTaskFieldDefsChange={handleTaskFieldDefsChange}
                onTaskViewsChange={handleTaskViewsChange}
                initialColumnWidths={taskColumnWidths}
                initialVisibleColumns={taskVisibleColumns}
                onColumnConfigChange={handleTaskColumnConfigChange}
                activeTimerTaskId={taskTimerTaskId}
                taskTimerElapsed={taskTimerElapsed}
                onStartTimer={handleStartTaskTimer}
                onStopTimer={handleStopTaskTimer}
              />
            ) : mode === 'timeline' ? (
              <TimelineView
                scenes={projectData.scenes}
                characters={projectData.characters}
                characterColors={characterColors}
                tags={projectData.tags}
                plotPoints={projectData.plotPoints}
                timelineDates={timelineDates}
                timelineEndDates={timelineEndDates}
                worldEvents={worldEvents}
                connections={sceneConnections}
                onTimelineDatesChange={handleTimelineDatesChange}
                onTimelineEndDatesChange={handleTimelineEndDatesChange}
                onWorldEventsChange={handleWorldEventsChange}
                onSceneChange={handleSceneChange}
                onTagsChange={handleTagsChange}
                onCreateTag={handleCreateTag}
                onRemoveConnection={handleRemoveConnection}
                onInsertScene={handleInsertSceneOnTimeline}
                onOpenInEditor={handleOpenInEditor}
              />
            ) : mode === 'editor' ? (
              <EditorView
                ref={editorViewRef}
                storagePrefix={tabId}
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
                onUpdateSession={handleUpdateSession}
                onDeleteSession={handleDeleteSession}
                sceneSessionsByDate={(sceneKey: string) => getSceneSessionsByDate(sceneSessions, sceneKey)}
                sceneSessionsList={(sceneKey: string) => getSceneSessionsList(sceneSessions, sceneKey)}
                notesIndex={searchNotesIndex}
                onGoToNote={(noteId: string) => { setPendingNoteId(noteId); setViewMode('notes'); }}
                scratchpad={scratchpadContent}
                onScratchpadChange={handleScratchpadChange}
                sceneComments={sceneComments}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onDeleteScene={handleArchiveScene}
                onDuplicateScene={handleDuplicateScene}
                typewriterMode={typewriterMode}
                tasks={tasks}
                onTasksChange={handleTasksChange}
                chapters={chapters}
                arcFieldDefs={arcFieldDefs}
                onSaveSceneFieldDefs={handleSaveSceneFieldDefs}
                onSaveSceneFieldValues={handleSaveSceneFieldValues}
              />
            ) : mode === 'arc' ? (
              // Arc Planning View
              selectedCharacterId ? (
                <DndContext
                  sensors={arcSensors}
                  collisionDetection={arcCollisionDetection}
                  onDragStart={handleArcDndStart}
                  onDragEnd={handleArcDndEnd}
                  onDragCancel={handleArcDndCancel}
                >
                  <div className="arc-layout">
                    <div className="arc-main-content">
                      <ArcView
                        characters={projectData.characters}
                        selectedCharacterId={selectedCharacterId}
                        onSelectCharacter={setSelectedCharacterId}
                        acts={acts.filter(a => a.characterId === selectedCharacterId)}
                        plotPoints={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId)}
                        scenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId)}
                        draftContent={draftContent}
                        onDraftChange={handleDraftChange}
                        onGoToScene={handleOpenInEditor}
                        previewSceneId={arcPreviewSceneId}
                        onSetPreviewScene={setArcPreviewSceneId}
                        characterColors={characterColors}
                        psychology={characterPsychologies[selectedCharacterId] ?? null}
                        onSaveAct={handleSaveAct}
                        onDeleteAct={handleDeleteAct}
                        onSavePlotPointArcFields={handleSavePlotPointArcFields}
                        onSaveSceneArcFields={handleSaveSceneArcFields}
                        onSaveSceneNotes={handleSaveSceneNotes}
                        onSendSceneToBullpen={handleSendSceneToBullpen}
                        onSavePsychology={handleSaveCharacterPsychology}
                        arcActiveId={arcActiveId}
                        arcFieldDefs={arcFieldDefs}
                        arcFieldValues={arcFieldValues}
                        onSaveArcFieldDefs={handleSaveArcFieldDefs}
                        onSaveArcFieldValues={handleSaveArcFieldValues}
                        arcFieldSections={arcFieldSections}
                        onSaveArcFieldSections={(sections) => {
                          setArcFieldSections(sections);
                          dataService.setArcUiPref('arc-field-sections', JSON.stringify(sections));
                        }}
                        onReorderSceneInSection={handleArcReorderScenesInSection}
                        onAddSceneToSection={handleAddSceneToSection}
                        onAssignSceneToSection={handleAssignSceneToSection}
                        onDeleteSection={handleDeletePlotPoint}
                      />
                    </div>
                    <ArcBullpenPanel
                      acts={acts.filter(a => a.characterId === selectedCharacterId)}
                      sections={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId)}
                      bullpenSections={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId && (pp.inBullpen || pp.actId === null))}
                      bullpenScenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId && !s.plotPointId)}
                      scenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId)}
                      previewSceneId={arcPreviewSceneId}
                      onPreviewScene={setArcPreviewSceneId}
                      onAssignSectionToAct={(sectionId, actId) => handleSavePlotPointArcFields(sectionId, { actId, inBullpen: false })}
                      onDeleteSection={handleDeletePlotPoint}
                      onAssignSceneToSection={handleAssignSceneToSection}
                      onDeleteScene={(sceneId) => handleArchiveScene(sceneId)}
                      onAddSection={handleCreateArcSection}
                      onAddScene={handleCreateArcBullpenScene}
                      onOpenCharacterHub={openArcHub}
                    />
                    {showArcHub && (
                      <CharacterHubPanel
                        characterName={projectData.characters.find(c => c.id === selectedCharacterId)?.name || ''}
                        characterColor={characterColors[selectedCharacterId] || '#6366f1'}
                        psychology={characterPsychologies[selectedCharacterId] ?? null}
                        selectedCharacterId={selectedCharacterId}
                        onSave={handleSaveCharacterPsychology}
                        onClose={() => setShowArcHub(false)}
                      />
                    )}
                  </div>
                  <DragOverlay>
                    {arcActiveId && (() => {
                      const s = projectData.scenes.find(sc => sc.id === arcActiveId);
                      const accentColor = characterColors[selectedCharacterId] || '#6366f1';
                      return s ? (
                        <DragPreviewCard
                          title={s.title || s.content.replace(/<[^>]*>/g, '').trim().slice(0, 60) || 'Untitled scene'}
                          accentColor={accentColor}
                        />
                      ) : null;
                    })()}
                  </DragOverlay>
                </DndContext>
              ) : (
                <div className="loading">Select a character to view arc planning.</div>
              )
            ) : mode === 'pov' ? (
              // POV View with plot points and table of contents
              <DndContext
                sensors={povSensors}
                collisionDetection={closestCenter}
                onDragStart={handlePovDndStart}
                onDragEnd={handlePovDndEnd}
                onDragCancel={handlePovDndCancel}
              >
              <div className={`pov-layout ${isConnecting ? 'is-connecting' : ''}`}>
                <div className="pov-main-content">
                <div className="pov-scroll">
                <div className="pov-content">
                {isConnecting && (
                  <div className="connecting-banner">
                    Click another scene to connect, or <button onClick={() => { setIsConnecting(false); setConnectionSource(null); }}>cancel</button>
                  </div>
                )}
                <PovOutlineView
                  sections={displayedPlotPoints}
                  scenes={displayedScenes.filter(s => isSceneInPlay(s, indexPlotPoints(projectData.plotPoints)))}
                  chapters={chapters}
                  onAssignSceneToChapter={handleAssignSceneToChapter}
                  synopsisModes={sectionSynopsisModes}
                  hideHeaders={hideSectionHeaders[tabId] ?? false}
                  hideScenes={hideScenes[tabId] ?? false}
                  onSetAside={handleSetAside}
                  onToggleSynopsisMode={handleToggleSynopsisMode}
                  onSceneChange={handleSceneChange}
                  onPreview={setPovPreviewSceneId}
                  onSectionChange={handlePlotPointChange}
                  onDeleteSection={handleDeletePlotPoint}
                  onOpenSectionDetails={setPovDetailSectionId}
                  getCharacterName={getCharacterName}
                  povReorderedScenes={povReorderedScenes}
                />
                <button className="add-section-btn" onClick={handleCreatePlotPoint}>
                  + Add Section
                </button>
                </div>
                </div>

                <ScenePreviewPanel
                  variant="overlay"
                  sceneId={povPreviewSceneId}
                  title={projectData.scenes.find(s => s.id === povPreviewSceneId)?.title || ''}
                  draftContent={draftContent}
                  onDraftChange={handleDraftChange}
                  onGoToScene={handleOpenInEditor}
                  onClose={() => setPovPreviewSceneId(null)}
                />
                {povDetailSectionId && (() => {
                  const pp = projectData.plotPoints.find(p => p.id === povDetailSectionId);
                  if (!pp) return null;
                  const sectionScenes = projectData.scenes.filter(s => s.plotPointId === pp.id).sort((a, b) => a.sceneNumber - b.sceneNumber);
                  const bullpenScenes = projectData.scenes.filter(s => s.characterId === selectedCharacterId && !s.plotPointId).sort((a, b) => a.sceneNumber - b.sceneNumber);
                  return (
                    <ArcDetailModal
                      title={pp.title || 'Unnamed section'}
                      subtitle="Section"
                      entityType="section"
                      fields={buildSectionDetailFields(pp, arcFieldDefs, arcFieldValues, handleSavePlotPointArcFields, handleSaveArcFieldValues, arcFieldSections)}
                      arcFieldDefs={arcFieldDefs}
                      onSaveDefs={handleSaveArcFieldDefs}
                      onClose={() => setPovDetailSectionId(null)}
                      storageKey="arc-field-order:section"
                      hiddenBuiltinIds={hiddenArcBuiltins_section}
                      onToggleBuiltin={handleToggleArcBuiltin_section}
                      hiddenCustomIds={hiddenArcCustoms_section}
                      onToggleCustom={handleToggleArcCustom_section}
                      fieldSections={arcFieldSections}
                      onSaveAllSections={(sections) => {
                        setArcFieldSections(sections);
                        dataService.setArcUiPref('arc-field-sections', JSON.stringify(sections));
                      }}
                      templates={arcTemplates}
                      onSaveTemplate={handleSaveArcTemplate}
                      onDeleteTemplate={handleDeleteArcTemplate}
                      scenes={sectionScenes}
                      bullpenScenes={bullpenScenes}
                      onReorderScenes={orderedIds => handleArcReorderScenesInSection(pp.id, orderedIds)}
                      onAddScene={() => handleAddSceneToSection(pp.id)}
                      onSendToBullpen={handleSendSceneToBullpen}
                      onPullFromBullpen={sceneId => handleAssignSceneToSection(sceneId, pp.id)}
                      draftContent={draftContent}
                      onDraftChange={handleDraftChange}
                      onGoToScene={handleOpenInEditor}
                      sceneArcFieldDefs={arcFieldDefs}
                      sceneArcFieldValues={arcFieldValues}
                      onSaveSceneBuiltins={(sceneId, partial) => {
                        const { notes, ...rest } = partial as { notes?: string[] } & Record<string, unknown>;
                        if (notes) handleSaveSceneNotes(sceneId, notes);
                        if (Object.keys(rest).length > 0) handleSaveSceneArcFields(sceneId, rest as any);
                      }}
                      onSaveSceneArcFields={(sceneId, values) => handleSaveArcFieldValues('scene', sceneId, values)}
                      hiddenBuiltinIds_scene={hiddenArcBuiltins_section}
                      onToggleBuiltin_scene={handleToggleArcBuiltin_section}
                      hiddenCustomIds_scene={hiddenArcCustoms_section}
                      onToggleCustom_scene={handleToggleArcCustom_section}
                      fieldSections_scene={arcFieldSections}
                      templates_scene={arcTemplates}
                      onSaveTemplate_scene={handleSaveArcTemplate}
                      onDeleteTemplate_scene={handleDeleteArcTemplate}
                    />
                  );
                })()}
                </div>

                <BullpenPanel
                  scenes={displayedScenes.filter(s => !s.plotPointId)}
                  plotPoints={displayedPlotPoints}
                  getCharacterName={getCharacterName}
                  onReturnScene={handleReturnFromBullpen}
                  onSceneChange={handleSceneChange}
                  previousPlotPointIds={previousPlotPointIds}
                  onAddScene={handleAddBullpenScene}
                  bullpenSections={projectData.plotPoints.filter(pp => pp.characterId === selectedCharacterId && pp.inBullpen)}
                  sectionScenes={projectData.scenes.filter(s => s.characterId === selectedCharacterId && s.plotPointId !== null && projectData.plotPoints.find(p => p.id === s.plotPointId)?.inBullpen)}
                />
              </div>
              <DragOverlay>
                {povActiveId && (() => {
                  const accentColor = getCharacterHexColor(selectedCharacterId ?? '');
                  // Section drag overlay
                  const activeSection = displayedPlotPoints.find(pp => pp.id === povActiveId);
                  if (activeSection) {
                    return <DragPreviewCard title={activeSection.title || 'Section'} accentColor={accentColor} />;
                  }
                  // Scene drag overlay
                  const inSectionScenes = displayedScenes
                    .filter(s => s.plotPointId !== null)
                    .sort((a, b) => a.sceneNumber - b.sceneNumber);
                  const s = projectData.scenes.find(sc => sc.id === povActiveId);
                  const displayNum = inSectionScenes.findIndex(sc => sc.id === povActiveId) + 1 || s?.sceneNumber;
                  return s ? (
                    <DragPreviewCard
                      title={s.title || s.content || 'Untitled scene'}
                      number={displayNum}
                      accentColor={accentColor}
                    />
                  ) : null;
                })()}
              </DragOverlay>
              </DndContext>
            ) : braidedSubMode === 'table' ? (
              // Table View
              <>
                <TableView
                  scenes={projectData.scenes}
                  characters={projectData.characters}
                  chapters={chapters}
                  metadataFieldDefs={metadataFieldDefs}
                  sceneMetadata={sceneMetadata}
                  tags={projectData.tags}
                  tableViews={tableViews}
                  plotPoints={projectData.plotPoints}
                  characterColors={characterColors}
                  povReorderedScenes={povReorderedScenes}
                  onSceneClick={(sceneKey) => {
                    const scene = projectData.scenes.find(s => s.id === sceneKey);
                    if (scene) {
                      setListFloatingEditor(scene);
                    }
                  }}
                  onMetadataChange={handleMetadataChange}
                  onWordCountChange={handleWordCountChange}
                  onTableViewsChange={handleSaveTableViews}
                  onMovePovScene={handleMovePovSceneFromTable}
                  onAddSceneForCharacter={handleAddSceneForCharacterFromTable}
                  onReorderScenes={handleReorderScenesFromTable}
                  onSceneChange={handleSceneChange}
                />
                {listFloatingEditor && (
                  <FloatingEditor
                    scene={listFloatingEditor}
                    draftContent={draftContent[listFloatingEditor.id] || ''}
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
                    scratchpadContent={scratchpadContent[listFloatingEditor.id] || ''}
                    onScratchpadChange={handleScratchpadChange}
                  />
                )}
              </>
            ) : braidedSubMode === 'rails' ? (
              // Rails View
              <RailsView
                scenes={displayedScenes}
                characters={railsDisplayCharacters}
                chapters={chapters}
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
                      saveTimelineData(projectData.scenes, newConnections);
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
                povReorderedScenes={povReorderedScenes}
                onInsertSceneAtPosition={handleInsertSceneAtPosition}
                onDeleteChapter={handleDeleteChapter}
              />
            ) : (
              <BraidedListView
                displayedScenes={displayedScenes}
                unbraidedScenesByCharacter={unbraidedScenesByCharacter}
                characters={projectData.characters}
                plotPoints={projectData.plotPoints}
                chapters={chapters}
                getCharacterName={getCharacterName}
                getCharacterHexColor={getCharacterHexColor}
                povReorderedScenes={povReorderedScenes}
                inboxCharFilter={listInboxCharFilter[tabId] ?? 'all'}
                onInboxCharFilterChange={(v) => setListInboxCharFilter(prev => ({ ...prev, [tabId]: v }))}
                synopsisVisible={false}
                onSceneChange={handleSceneChange}
                onReorderTimeline={handleBraidedReorder}
                onMoveToInbox={handleBraidedMoveToInbox}
                onMoveFromInbox={handleBraidedMoveFromInbox}
                onAddChapter={handleAddChapter}
                onUpdateChapter={handleUpdateChapter}
                onDeleteChapter={handleDeleteChapter}
                onReorderChapters={handleReorderChapters}
                onAssignSceneToChapter={handleAssignSceneToChapter}
                showAddChapterInput={showAddChapterInput}
                onDismissAddChapter={() => setShowAddChapterInput(false)}
                onOpenInEditor={handleOpenInEditor}
              />
            )}

            {displayedScenes.length === 0 && (
              <div className="welcome-screen">
                <p>No scenes found{activeFilters.size > 0 ? ' matching current filters' : ''}.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <PaneProvider layout={paneLayout} dispatch={paneDispatch}>
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
          className={`app-sidebar-btn ${viewMode === 'arc' ? 'active' : ''}`}
          onClick={() => setViewMode('arc')}
          title="Arc Planning"
          aria-label="Arc view"
        >
          <span className="app-sidebar-icon">◈</span>
          <span className="app-sidebar-label">Arc</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'pov' ? 'active' : ''}`}
          onClick={() => setViewMode('pov')}
          title="POV"
          aria-label="POV view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h16M4 12h10M4 18h13"/>
          </svg>
          <span className="app-sidebar-label">POV</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'braided' && braidedSubMode === 'list' ? 'active' : ''}`}
          onClick={() => { setBraidedSubMode('list'); setViewMode('braided'); const p = findLeafPane(paneLayout.root, paneLayout.activePaneId); if (p) { const tid = findTabByType(p, 'braided') || p.activeTabId; paneDispatch({ type: 'UPDATE_TAB_PARAMS', paneId: p.id, tabId: tid, params: { type: 'braided', subMode: 'list' } as TabParams }); } track('braided_subview_changed', { subview: 'list' }); }}
          title="Braider"
          aria-label="Braider list view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>
          </svg>
          <span className="app-sidebar-label">Braider</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'braided' && braidedSubMode === 'table' ? 'active' : ''}`}
          onClick={() => { setBraidedSubMode('table'); setViewMode('braided'); const p = findLeafPane(paneLayout.root, paneLayout.activePaneId); if (p) { const tid = findTabByType(p, 'braided') || p.activeTabId; paneDispatch({ type: 'UPDATE_TAB_PARAMS', paneId: p.id, tabId: tid, params: { type: 'braided', subMode: 'table' } as TabParams }); } track('braided_subview_changed', { subview: 'table' }); }}
          title="Table"
          aria-label="Table view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
          <span className="app-sidebar-label">Table</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'braided' && braidedSubMode === 'rails' ? 'active' : ''}`}
          onClick={() => { setBraidedSubMode('rails'); setViewMode('braided'); const p = findLeafPane(paneLayout.root, paneLayout.activePaneId); if (p) { const tid = findTabByType(p, 'braided') || p.activeTabId; paneDispatch({ type: 'UPDATE_TAB_PARAMS', paneId: p.id, tabId: tid, params: { type: 'braided', subMode: 'rails' } as TabParams }); } track('braided_subview_changed', { subview: 'rails' }); }}
          title="Rails"
          aria-label="Rails view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="5" y1="3" x2="5" y2="21"/>
            <line x1="12" y1="3" x2="12" y2="21"/>
            <line x1="19" y1="3" x2="19" y2="21"/>
            <line x1="3" y1="8" x2="21" y2="8"/>
            <line x1="3" y1="16" x2="21" y2="16"/>
          </svg>
          <span className="app-sidebar-label">Rails</span>
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
          className={`app-sidebar-btn ${viewMode === 'tasks' ? 'active' : ''}`}
          onClick={() => setViewMode('tasks')}
          title="Tasks"
          aria-label="Tasks view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span className="app-sidebar-label">Tasks</span>
        </button>
        <button
          className={`app-sidebar-btn ${viewMode === 'timeline' ? 'active' : ''}`}
          onClick={() => setViewMode('timeline')}
          title="Timeline"
          aria-label="Timeline view"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <circle cx="7" cy="12" r="2"/>
            <circle cx="14" cy="12" r="2"/>
            <circle cx="19" cy="12" r="2"/>
          </svg>
          <span className="app-sidebar-label">Timeline</span>
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
        <button
          className={`app-sidebar-btn ${viewMode === 'account' ? 'active' : ''}`}
          onClick={() => setViewMode('account')}
          title="Account"
          aria-label="Account"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span className="app-sidebar-label">Account</span>
        </button>
      </nav>

      <div className="app-body">
      {/* Unified Toolbar */}
      <div className="app-toolbar">
        <div className="toolbar-left">
          {(viewMode === 'pov' || viewMode === 'arc') ? (
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
            <h1>{projectData.projectName || 'Braidr'}</h1>
          )}
          {(viewMode === 'pov' || (viewMode === 'braided' && braidedSubMode !== 'rails' && braidedSubMode !== 'table')) && (
            <>
              <div className="toolbar-divider" />
              {viewMode === 'pov' ? (
                <button
                  className="toolbar-btn toolbar-btn--primary"
                  onClick={() => selectedCharacterId && handleAddSceneToInbox(selectedCharacterId)}
                  title="Add a new scene to inbox"
                >
                  + New Scene
                </button>
              ) : (
                <div className="toolbar-dropdown-container" ref={newDropdownRef}>
                  <button
                    className="toolbar-btn toolbar-btn--primary"
                    onClick={() => setShowNewDropdown(o => !o)}
                  >
                    + New ▾
                  </button>
                  {showNewDropdown && (
                    <div className="add-dropdown-menu">
                      {projectData.characters.map(char => (
                        <button
                          key={char.id}
                          className="add-dropdown-item"
                          onClick={() => { handleAddSceneToInbox(char.id); setShowNewDropdown(false); }}
                        >
                          <span className="add-dropdown-color" style={{ background: characterColors[char.id] || '#888' }} />
                          New {char.name} Scene
                        </button>
                      ))}
                      <div className="add-dropdown-divider" />
                      <button
                        className="add-dropdown-item"
                        onClick={() => { setShowAddChapterInput(true); setShowNewDropdown(false); }}
                      >
                        New Chapter
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="toolbar-divider" />
              <button
                className="toolbar-btn"
                onClick={() => handleSetAllSynopsisModes('inline')}
                title="Show all synopses"
              >
                Show synopses
              </button>
              <button
                className="toolbar-btn"
                onClick={() => handleSetAllSynopsisModes('expand')}
                title="Hide all synopses"
              >
                Hide synopses
              </button>
              <button
                className={`toolbar-btn ${!(hideSectionHeaders[activeTab.id] ?? false) ? 'active' : ''}`}
                onClick={() => setHideSectionHeaders(prev => ({ ...prev, [activeTab.id]: !(prev[activeTab.id] ?? false) }))}
                title={(hideSectionHeaders[activeTab.id] ?? false) ? 'Show Sections' : 'Hide Sections'}
              >
                Sections
              </button>
              <button
                className={`toolbar-btn ${!(hideScenes[activeTab.id] ?? false) ? 'active' : ''}`}
                onClick={() => setHideScenes(prev => ({ ...prev, [activeTab.id]: !(prev[activeTab.id] ?? false) }))}
                title={(hideScenes[activeTab.id] ?? false) ? 'Show Scenes' : 'Hide Scenes'}
              >
                Scenes
              </button>
              {viewMode !== 'pov' && (
              <div className="toolbar-dropdown-container" ref={fieldsDropdownRef}>
                <button
                  className={`toolbar-btn ${inlineMetadataFields.length > 0 ? 'active' : ''}`}
                  onClick={() => setShowFieldsDropdown(!showFieldsDropdown)}
                  title="Choose metadata fields to show inline"
                >
                  Fields
                </button>
                {showFieldsDropdown && (
                  <div className="toolbar-fields-dropdown">
                    {metadataFieldDefs.filter(f => f.id !== '_status').length === 0 ? (
                      <div className="toolbar-fields-empty">No metadata fields defined yet</div>
                    ) : (
                      <>
                        {metadataFieldDefs
                          .filter(f => f.id !== '_status')
                          .sort((a, b) => a.order - b.order)
                          .map(field => (
                            <label key={field.id} className="toolbar-fields-item">
                              <input
                                type="checkbox"
                                checked={inlineMetadataFields.includes(field.id)}
                                onChange={() => {
                                  const updated = inlineMetadataFields.includes(field.id)
                                    ? inlineMetadataFields.filter(id => id !== field.id)
                                    : [...inlineMetadataFields, field.id];
                                  handleInlineMetadataFieldsChange(updated);
                                }}
                              />
                              {field.label}
                            </label>
                          ))}
                        <div className="toolbar-fields-divider" />
                        <label className="toolbar-fields-item">
                          <input
                            type="checkbox"
                            checked={showInlineLabels}
                            onChange={() => handleShowInlineLabelsChange(!showInlineLabels)}
                          />
                          Show Labels
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>
              )}
            </>
          )}
          {viewMode === 'braided' && braidedSubMode !== 'rails' && braidedSubMode !== 'table' && (
            <>
              <div className="toolbar-divider" />
              <button
                className={`toolbar-btn ${showPovColors ? 'active' : ''}`}
                onClick={() => setShowPovColors(!showPovColors)}
                title="Toggle Colors"
              >
                Colors
              </button>
              <div className="toolbar-dropdown-container" ref={fieldsDropdownRef}>
                <button
                  className={`toolbar-btn ${inlineMetadataFields.length > 0 ? 'active' : ''}`}
                  onClick={() => setShowFieldsDropdown(!showFieldsDropdown)}
                  title="Choose metadata fields to show inline"
                >
                  Fields
                </button>
                {showFieldsDropdown && (
                  <div className="toolbar-fields-dropdown">
                    {metadataFieldDefs.filter(f => f.id !== '_status').length === 0 ? (
                      <div className="toolbar-fields-empty">No metadata fields defined yet</div>
                    ) : (
                      <>
                        {metadataFieldDefs
                          .filter(f => f.id !== '_status')
                          .sort((a, b) => a.order - b.order)
                          .map(field => (
                            <label key={field.id} className="toolbar-fields-item">
                              <input
                                type="checkbox"
                                checked={inlineMetadataFields.includes(field.id)}
                                onChange={() => {
                                  const updated = inlineMetadataFields.includes(field.id)
                                    ? inlineMetadataFields.filter(id => id !== field.id)
                                    : [...inlineMetadataFields, field.id];
                                  handleInlineMetadataFieldsChange(updated);
                                }}
                              />
                              {field.label}
                            </label>
                          ))}
                        <div className="toolbar-fields-divider" />
                        <label className="toolbar-fields-item">
                          <input
                            type="checkbox"
                            checked={showInlineLabels}
                            onChange={() => handleShowInlineLabelsChange(!showInlineLabels)}
                          />
                          Show Labels
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {projectData && (
            <>
              <div className="toolbar-divider" />
              <BranchSelector
                branchIndex={branchIndex}
                onCreateBranch={handleCreateBranch}
                onSwitchBranch={handleSwitchBranch}
                onDeleteBranch={handleDeleteBranch}
                onCompare={() => setShowCompareView(true)}
                onMerge={(name) => setShowMergeDialog(name)}
              />
            </>
          )}
          {projectData && viewMode === 'arc' && selectedCharacterId && (
            <>
              <div className="toolbar-divider" />
              <button className="arc-toolbar-btn" onClick={() => handleSaveAct({
                id: Math.random().toString(36).substring(2, 11),
                characterId: selectedCharacterId,
                name: '', synopsis: '', startingState: '', endingState: '', polarity: '',
                transformation: '', dilemma: '', propellingAction: '',
                order: acts.filter(a => a.characterId === selectedCharacterId).length,
              })}>+ Act</button>
              <button className="arc-toolbar-btn" onClick={handleCreateArcSection}>+ Section</button>
            </>
          )}
        </div>

        <div className="toolbar-right">
          {saveStatus !== 'idle' && (
            <span className={`save-indicator ${saveStatus}`}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
          {viewMode !== 'editor' && viewMode !== 'notes' && viewMode !== 'pov' && !(viewMode === 'braided' && braidedSubMode === 'table') && projectData.tags.length > 0 && (
            <FilterBar
              tags={projectData.tags}
              activeFilters={activeFilters}
              onToggleFilter={handleToggleFilter}
            />
          )}
          {/* Global writing timer indicator */}
          {timerSceneKey && (() => {
            const timerScene = projectData?.scenes.find(s => s.id === timerSceneKey);
            const char = timerScene ? projectData?.characters.find(c => c.id === timerScene.characterId) : null;
            const label = char && timerScene ? `${char.name} #${timerScene.sceneNumber}` : timerSceneKey;
            return (
              <button
                className={`toolbar-timer-pill ${timerRunning ? 'running' : 'paused'}`}
                onClick={() => {
                  if (timerRunning) {
                    handleStopTimer();
                  } else {
                    handleResumeTimer();
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
          {taskTimerTaskId && (() => {
            const activeTask = tasks.find(t => t.id === taskTimerTaskId);
            const label = activeTask?.title || 'Task';
            return (
              <button
                className={`toolbar-timer-pill ${taskTimerRunning ? 'running' : 'paused'}`}
                onClick={() => {
                  if (taskTimerRunning) {
                    handleStopTaskTimer();
                  } else {
                    handleResumeTaskTimer();
                  }
                }}
                title={taskTimerRunning ? 'Stop task timer' : 'Resume task timer'}
              >
                <span className={`toolbar-timer-dot ${taskTimerRunning ? 'running' : ''}`} />
                <span className="toolbar-timer-time">{formatTimer(Math.floor(taskTimerElapsed / 1000))}</span>
                <span className="toolbar-timer-scene">{label}</span>
              </button>
            );
          })()}
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
                  Archive{(archivedScenes.length + archivedNotes.length) > 0 ? ` (${archivedScenes.length + archivedNotes.length})` : ''}
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
                  setShowSettingsMenu(false);
                  const api = (window as any).electronAPI;
                  const result = await api.convertToBraidr(projectData!.projectPath);
                  if (result?.success) {
                    alert(`Converted! Saved to: ${result.dbPath}`);
                  } else {
                    alert(`Conversion failed: ${result?.error}`);
                  }
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Convert to .braidr
                </button>
                {viewMode === 'editor' && (
                  <button onClick={() => { editorViewRef.current?.print(); setShowSettingsMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9"/>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    Print
                  </button>
                )}
                <button onClick={() => { setTypewriterMode(!typewriterMode); localStorage.setItem('editor-typewriter-mode', String(!typewriterMode)); setShowSettingsMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="14" rx="2"/>
                    <line x1="6" y1="22" x2="18" y2="22"/>
                    <line x1="12" y1="18" x2="12" y2="22"/>
                    <line x1="6" y1="11" x2="18" y2="11" strokeOpacity="0.4"/>
                  </svg>
                  Typewriter Mode {typewriterMode ? 'On' : 'Off'}
                </button>
                <button onClick={async () => {
                  if (timerRunning) handleStopTimer();
                  if (taskTimerRunning) handleStopTaskTimer();
                  if (isDirtyRef.current) {
                    editorViewRef.current?.flush();
                    if (projectData) {
                      await saveTimelineData(projectData.scenes, sceneConnections);
                    }
                  }
                  if (projectData) {
                    await dataService.releaseProjectLock(projectData.projectPath);
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

      <ViewRendererProvider renderer={renderView}>
        <PaneManager />
      </ViewRendererProvider>
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
          chapters={chapters}
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
          customCategories={analyticsRef.current?.customCheckinCategories}
          onSubmit={handleManualCheckinSubmit}
          onSkip={() => setShowManualCheckin(false)}
          onAddCategory={handleAddCheckinCategory}
          onRemoveCategory={handleRemoveCheckinCategory}
        />
      )}

      {/* Check-in Modal */}
      {pendingSession && projectData && (() => {
        const pendingScene = projectData.scenes.find(s => s.id === pendingSession.sceneKey);
        const charName = pendingScene ? (projectData.characters.find(c => c.id === pendingScene.characterId)?.name || 'Unknown') : 'Unknown';
        const sceneTitle = pendingScene?.title ? ` — ${pendingScene.title}` : '';
        const sceneLabel = `${charName} — ${pendingScene?.sceneNumber ?? '?'}${sceneTitle}`;
        return (
          <CheckinModal
            sceneLabel={sceneLabel}
            durationMs={pendingSession.durationMs}
            wordsNet={pendingSession.wordsNet}
            customCategories={analyticsRef.current?.customCheckinCategories}
            onSubmit={handleCheckinSubmit}
            onSkip={handleCheckinSkip}
            onAddCategory={handleAddCheckinCategory}
            onRemoveCategory={handleRemoveCheckinCategory}
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
              {archivedNotes.length === 0 && archivedScenes.length === 0 ? (
                <p className="archive-empty">No archived items. Archived notes and scenes appear here and can be restored at any time.</p>
              ) : (
                <>
                  {archivedNotes.length > 0 && (
                    <>
                      <div className="archive-section-header">Notes</div>
                      <div className="archive-scenes-list">
                        {[...archivedNotes].sort((a, b) => b.archivedAt - a.archivedAt).map(archived => {
                          const preview = archived.content
                            .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
                            .slice(0, 120);
                          const archivedDate = new Date(archived.archivedAt).toLocaleDateString();
                          return (
                            <div key={archived.id} className="archive-note-item">
                              <div className="archive-scene-info">
                                <span className="archive-scene-char">{archived.title || 'Untitled'}</span>
                                <span className="archive-scene-date">{archivedDate}</span>
                              </div>
                              {preview && <p className="archive-scene-content">{preview}</p>}
                              {archived.tags.length > 0 && (
                                <div className="archive-note-tags">
                                  {archived.tags.slice(0, 4).map(t => (
                                    <span key={t} className="note-tag-pill">#{t}</span>
                                  ))}
                                </div>
                              )}
                              <div className="archive-note-actions">
                                <button className="archive-restore-btn" onClick={() => handleRestoreNote(archived)}>
                                  Restore
                                </button>
                                <button className="archive-delete-btn" onClick={() => handlePermanentlyDeleteNote(archived)}>
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {archivedScenes.length > 0 && (
                    <>
                      {archivedNotes.length > 0 && <div className="archive-section-header">Scenes</div>}
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
                    </>
                  )}
                </>
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

      {/* Compare View */}
      {showCompareView && projectData?.projectPath && (
        <CompareView
          projectPath={projectData.projectPath}
          branchIndex={branchIndex}
          characterColors={characterColors}
          onClose={() => setShowCompareView(false)}
          onMerge={async (name, sceneIds) => {
            if (!projectData?.projectPath) return;
            await dataService.mergeBranch(projectData.projectPath, name, sceneIds);
            setShowCompareView(false);
            await handleSwitchBranch(null);
          }}
        />
      )}

      {/* Merge Dialog */}
      {showMergeDialog && (
        <MergeDialog
          branchName={showMergeDialog}
          compareData={mergeCompareData}
          loading={mergeLoading}
          onMerge={handleMerge}
          onClose={() => setShowMergeDialog(null)}
        />
      )}

      {/* Lock Takeover Dialog */}
      {lockConflict && (
        <div className="lock-takeover-overlay" onClick={() => setLockConflict(null)}>
          <div className="lock-takeover-dialog" onClick={e => e.stopPropagation()}>
            <h3>Project already open</h3>
            <p>
              This project is currently being edited on <strong>{lockConflict.heldBy}</strong>.
            </p>
            <p>Taking over will close the project on that device.</p>
            <div className="lock-takeover-actions">
              <button onClick={() => setLockConflict(null)}>Cancel</button>
              <button
                className="lock-takeover-confirm"
                onClick={async () => {
                  const { projectPath, projectName } = lockConflict;
                  try {
                    await dataService.acquireProjectLock(projectPath, true);
                    setLockConflict(null);
                    await loadProjectFromPath(projectPath, projectName);
                  } catch (err) {
                    addToast('Failed to take over project — please try again.');
                  }
                }}
              >
                Take Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Taken Over Toast */}
      {takenOverBy && (
        <div className="lock-taken-over-toast" onClick={() => setTakenOverBy(null)}>
          Editing moved to {takenOverBy}. Project closed.
        </div>
      )}

      {/* Update Modal (triggered from menu → Check for Updates) */}
      {showUpdateModal && (
        <UpdateModal onClose={() => setShowUpdateModal(false)} />
      )}

    </div>
    </PaneProvider>
  );
}

export default App;
