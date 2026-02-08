import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Heading from '@tiptap/extension-heading';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Scene, Character, PlotPoint, Tag, TagCategory, MetadataFieldDef, DraftVersion } from '../../shared/types';
import SceneSubEditor from './SceneSubEditor';

interface EditorViewProps {
  scenes: Scene[];
  characters: Character[];
  plotPoints: PlotPoint[];
  tags: Tag[];
  characterColors: Record<string, string>;
  draftContent: Record<string, string>;
  drafts: Record<string, DraftVersion[]>;
  sceneMetadata: Record<string, Record<string, string | string[]>>;
  metadataFieldDefs: MetadataFieldDef[];
  onDraftChange: (sceneKey: string, html: string) => void;
  onSaveDraft: (sceneKey: string, content: string) => void;
  onMetadataChange: (sceneKey: string, fieldId: string, value: string | string[]) => void;
  onMetadataFieldDefsChange: (defs: MetadataFieldDef[]) => void;
  onTagsChange: (sceneId: string, newTags: string[]) => void;
  onNotesChange: (sceneId: string, notes: string[]) => void;
  onSceneContentChange?: (sceneId: string, newContent: string) => void;
  onCreateTag: (name: string, category: TagCategory) => void;
  onWordCountChange: (sceneId: string, wordCount: number | undefined) => void;
  initialSceneKey?: string | null;
  onSceneSelect?: (sceneKey: string) => void;
  onGoToPov?: (sceneId: string, characterId: string) => void;
  onGoToBraid?: (sceneId: string) => void;
}

const DEFAULT_STATUSES = [
  { value: 'Outline', color: '#9e9e9e' },
  { value: 'Draft', color: '#4a90d9' },
  { value: 'Revised', color: '#e8973d' },
  { value: 'Final', color: '#4caf7a' },
];

const STATUS_COLORS = ['#9e9e9e', '#4a90d9', '#e8973d', '#4caf7a', '#e74c3c', '#9b59b6', '#1abc9c', '#f39c12'];

function getSceneKey(scene: Scene): string {
  return `${scene.characterId}:${scene.sceneNumber}`;
}

function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

function cleanContent(text: string): string {
  return text
    .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

type DiffChunk = { type: 'same' | 'added' | 'removed'; text: string };

function computeWordDiff(oldText: string, newText: string): DiffChunk[] {
  const oldWords = oldText.split(/\s+/).filter(Boolean);
  const newWords = newText.split(/\s+/).filter(Boolean);
  const m = oldWords.length, n = newWords.length;

  // LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const chunks: DiffChunk[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      chunks.unshift({ type: 'same', text: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      chunks.unshift({ type: 'added', text: newWords[j - 1] });
      j--;
    } else {
      chunks.unshift({ type: 'removed', text: oldWords[i - 1] });
      i--;
    }
  }
  return chunks;
}

export default function EditorView({
  scenes,
  characters,
  plotPoints,
  tags,
  characterColors,
  draftContent,
  drafts,
  sceneMetadata,
  metadataFieldDefs,
  onDraftChange,
  onSaveDraft,
  onMetadataChange,
  onMetadataFieldDefsChange,
  onTagsChange,
  onNotesChange,
  onSceneContentChange,
  onCreateTag,
  onWordCountChange,
  initialSceneKey,
  onSceneSelect,
  onGoToPov,
  onGoToBraid,
}: EditorViewProps) {
  const [selectedCharFilter, setSelectedCharFilter] = useState<string>('all');
  const [selectedSceneKey, setSelectedSceneKey] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [showMetaEditor, setShowMetaEditor] = useState(false);
  const [showMeta, setShowMeta] = useState(() => {
    const saved = localStorage.getItem('editor-show-meta');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showNav, setShowNav] = useState(() => {
    const saved = localStorage.getItem('editor-show-nav');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [navWidth, setNavWidth] = useState(() => {
    const saved = localStorage.getItem('editor-nav-width');
    return saved !== null ? parseInt(saved, 10) : 260;
  });
  const [metaWidth, setMetaWidth] = useState(() => {
    const saved = localStorage.getItem('editor-meta-width');
    return saved !== null ? parseInt(saved, 10) : 240;
  });
  const [scratchpad, setScratchpad] = useState<Record<string, string>>({});
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState<'people' | 'locations' | 'arcs' | 'things' | 'time'>('people');
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef<{ panel: 'nav' | 'meta'; startX: number; initialWidth: number } | null>(null);
  const pendingContentRef = useRef<{ key: string; html: string } | null>(null);
  const settingContentRef = useRef(false);
  const wordCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffVersionA, setDiffVersionA] = useState<number | null>(null);
  const [diffVersionB, setDiffVersionB] = useState<number | null>(null);
  const [showStatusEditor, setShowStatusEditor] = useState(false);
  const [editingStatuses, setEditingStatuses] = useState<{ value: string; color: string }[]>([]);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusPillRef = useRef<HTMLDivElement>(null);

  // Multi-select state (Scrivenings mode)
  const [selectedSceneKeys, setSelectedSceneKeys] = useState<string[]>([]);
  const [primarySceneKey, setPrimarySceneKey] = useState<string | null>(null);
  const [lastClickedKey, setLastClickedKey] = useState<string | null>(null);
  const subEditorsRef = useRef<Map<string, Editor>>(new Map());
  const [activeEditorKey, setActiveEditorKey] = useState<string | null>(null);
  const [subEditorWordCounts, setSubEditorWordCounts] = useState<Record<string, number>>({});

  const isMultiSelect = selectedSceneKeys.length > 1;

  // Get filtered scenes
  const filteredScenes = scenes.filter(s =>
    selectedCharFilter === 'all' || s.characterId === selectedCharFilter
  );

  // Group scenes by character for the navigator
  const groupedScenes = characters.reduce<Record<string, Scene[]>>((acc, char) => {
    const charScenes = filteredScenes
      .filter(s => s.characterId === char.id)
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
    if (charScenes.length > 0) acc[char.id] = charScenes;
    return acc;
  }, {});

  // Braided order: placed scenes sorted by timeline position, then unplaced at bottom
  const braidedPlaced = filteredScenes
    .filter(s => s.timelinePosition !== null)
    .sort((a, b) => (a.timelinePosition as number) - (b.timelinePosition as number));
  const braidedUnplaced = filteredScenes.filter(s => s.timelinePosition === null);

  // Navigator order (placed then unplaced) — used for shift+click range selection
  const navOrderKeys = useMemo(() => {
    return [...braidedPlaced, ...braidedUnplaced].map(s => getSceneKey(s));
  }, [braidedPlaced, braidedUnplaced]);

  // Scenes selected in navigator display order
  const selectedScenesOrdered = useMemo(() => {
    const allScenes = [...braidedPlaced, ...braidedUnplaced];
    return allScenes.filter(s => selectedSceneKeys.includes(getSceneKey(s)));
  }, [braidedPlaced, braidedUnplaced, selectedSceneKeys]);

  // Update selected scene when key changes (use primarySceneKey in multi-select, selectedSceneKey in single)
  useEffect(() => {
    const key = isMultiSelect ? primarySceneKey : selectedSceneKey;
    if (key) {
      const scene = scenes.find(s => getSceneKey(s) === key);
      setSelectedScene(scene || null);
    }
  }, [selectedSceneKey, primarySceneKey, isMultiSelect, scenes]);

  // Select initial scene on mount (uses initialSceneKey if provided)
  useEffect(() => {
    if (scenes.length > 0 && !selectedSceneKey) {
      const key = (initialSceneKey && scenes.some(s => getSceneKey(s) === initialSceneKey))
        ? initialSceneKey
        : getSceneKey(scenes[0]);
      setSelectedSceneKey(key);
      setSelectedSceneKeys([key]);
      setLastClickedKey(key);
      onSceneSelect?.(key);
    }
  }, [scenes, initialSceneKey]);

  // Flush pending content on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingContentRef.current) {
        onDraftChange(pendingContentRef.current.key, pendingContentRef.current.html);
      }
    };
  }, []);

  // Persist panel state
  useEffect(() => {
    localStorage.setItem('editor-show-nav', JSON.stringify(showNav));
  }, [showNav]);

  useEffect(() => {
    localStorage.setItem('editor-show-meta', JSON.stringify(showMeta));
  }, [showMeta]);

  useEffect(() => {
    localStorage.setItem('editor-nav-width', navWidth.toString());
  }, [navWidth]);

  useEffect(() => {
    localStorage.setItem('editor-meta-width', metaWidth.toString());
  }, [metaWidth]);

  // Draggable panel resize
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      if (drag.panel === 'nav') {
        setNavWidth(Math.min(400, Math.max(180, drag.initialWidth + delta)));
      } else {
        setMetaWidth(Math.min(400, Math.max(180, drag.initialWidth - delta)));
      }
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

  const handleResizeStart = (e: React.MouseEvent, panel: 'nav' | 'meta') => {
    e.preventDefault();
    draggingRef.current = {
      panel,
      startX: e.clientX,
      initialWidth: panel === 'nav' ? navWidth : metaWidth,
    };
    document.body.style.userSelect = 'none';
  };

  const flushPending = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (pendingContentRef.current) {
      onDraftChange(pendingContentRef.current.key, pendingContentRef.current.html);
      pendingContentRef.current = null;
    }
  }, [onDraftChange]);

  // Flush before switching scenes (single-select only)
  const handleSceneSelect = (key: string) => {
    if (key === selectedSceneKey) return;
    flushPending();
    setSelectedSceneKey(key);
    setSelectedSceneKeys([key]);
    setLastClickedKey(key);
    setPrimarySceneKey(null);
    setActiveEditorKey(null);
    onSceneSelect?.(key);
  };

  // Multi-select click handler: plain, cmd+click, shift+click
  const handleSceneClick = (key: string, e: React.MouseEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isModClick = isMac ? e.metaKey : e.ctrlKey;
    const isShiftClick = e.shiftKey;

    if (isModClick) {
      // Cmd+click: toggle scene in/out of selection
      setSelectedSceneKeys(prev => {
        const exists = prev.includes(key);
        let next: string[];
        if (exists) {
          next = prev.filter(k => k !== key);
          if (next.length === 0) return prev; // Don't allow empty selection
        } else {
          next = [...prev, key];
        }
        // Update primary/selected keys
        if (next.length === 1) {
          setSelectedSceneKey(next[0]);
          setPrimarySceneKey(null);
          setActiveEditorKey(null);
        } else {
          setPrimarySceneKey(key);
          setActiveEditorKey(key);
        }
        return next;
      });
      setLastClickedKey(key);
      onSceneSelect?.(key);
    } else if (isShiftClick && lastClickedKey && lastClickedKey !== key) {
      // Shift+click: range selection
      const fromIdx = navOrderKeys.indexOf(lastClickedKey);
      const toIdx = navOrderKeys.indexOf(key);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const rangeKeys = navOrderKeys.slice(start, end + 1);
        setSelectedSceneKeys(rangeKeys);
        if (rangeKeys.length === 1) {
          setSelectedSceneKey(rangeKeys[0]);
          setPrimarySceneKey(null);
          setActiveEditorKey(null);
        } else {
          setPrimarySceneKey(key);
          setActiveEditorKey(key);
        }
      }
      // Don't update lastClickedKey for shift+click (allows extending range)
      onSceneSelect?.(key);
    } else {
      // Plain click: single selection
      handleSceneSelect(key);
    }
  };

  // Draft versioning
  const handleSaveDraft = () => {
    const key = isMultiSelect ? primarySceneKey : selectedSceneKey;
    const activeEd = isMultiSelect ? (activeEditorKey ? subEditorsRef.current.get(activeEditorKey) : null) : editor;
    if (!key || !activeEd) return;
    flushPending();
    onSaveDraft(key, activeEd.getHTML());
  };

  const handleRestoreDraft = (version: number) => {
    const key = isMultiSelect ? primarySceneKey : selectedSceneKey;
    const activeEd = isMultiSelect ? (key ? subEditorsRef.current.get(key) : null) : editor;
    if (!key || !activeEd) return;
    const sceneDrafts = drafts[key] || [];
    const draft = sceneDrafts.find(d => d.version === version);
    if (!draft) return;
    if (!isMultiSelect) {
      settingContentRef.current = true;
      activeEd.commands.setContent(draft.content);
      settingContentRef.current = false;
    } else {
      activeEd.commands.setContent(draft.content);
    }
    onDraftChange(key, draft.content);
  };

  // Draft editor
  const editor = useEditor({
    editorProps: {
      attributes: { spellcheck: 'true' },
    },
    extensions: [
      StarterKit,
      Heading.configure({ levels: [2, 3] }),
      HorizontalRule,
      Placeholder.configure({ placeholder: 'Start writing this scene...' }),
    ],
    content: selectedSceneKey ? (draftContent[selectedSceneKey] || '') : '',
    onUpdate: ({ editor }) => {
      if (settingContentRef.current) return;
      if (!selectedSceneKey) return;
      const html = editor.getHTML();
      pendingContentRef.current = { key: selectedSceneKey, html };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (pendingContentRef.current) {
          onDraftChange(pendingContentRef.current.key, pendingContentRef.current.html);
          pendingContentRef.current = null;
        }
      }, 800);
    },
  });

  // Sync editor content when selected scene changes
  useEffect(() => {
    if (editor && selectedSceneKey) {
      const newContent = draftContent[selectedSceneKey] || '';
      settingContentRef.current = true;
      editor.commands.setContent(newContent);
      settingContentRef.current = false;
    }
  }, [selectedSceneKey]);

  // Notes editor
  const selectedSceneRef = useRef(selectedScene);
  selectedSceneRef.current = selectedScene;
  const onNotesChangeRef = useRef(onNotesChange);
  onNotesChangeRef.current = onNotesChange;
  const [notesEditorFocused, setNotesEditorFocused] = useState(false);

  const notesToHtml = (notes: string[]): string => {
    if (notes.length === 0) return '';
    return notes.map(note => `<p>${markdownToHtml(note)}</p>`).join('');
  };

  const htmlToNotes = (html: string): string[] => {
    const div = document.createElement('div');
    div.innerHTML = html;
    const notes: string[] = [];
    const seen = new Set<string>();

    const extractFormatted = (el: Element): string => {
      let result = '';
      el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          result += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const elem = node as Element;
          const tag = elem.tagName.toLowerCase();
          const inner = extractFormatted(elem);
          if (tag === 'strong' || tag === 'b') result += `**${inner}**`;
          else if (tag === 'em' || tag === 'i') result += `*${inner}*`;
          else result += inner;
        }
      });
      return result;
    };

    div.querySelectorAll('li').forEach(el => {
      const text = extractFormatted(el).trim();
      if (text && !seen.has(text)) { notes.push(text); seen.add(text); }
    });
    div.querySelectorAll('p').forEach(el => {
      if (el.closest('li')) return;
      const text = extractFormatted(el).trim();
      if (text && !seen.has(text)) { notes.push(text); seen.add(text); }
    });

    return notes;
  };

  const notesEditor = useEditor({
    editorProps: {
      attributes: { spellcheck: 'true' },
    },
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder: 'Add notes...' }),
    ],
    content: notesToHtml(selectedScene?.notes || []),
    onFocus: () => setNotesEditorFocused(true),
    onBlur: () => {
      setNotesEditorFocused(false);
      if (notesEditor && selectedSceneRef.current) {
        const notes = htmlToNotes(notesEditor.getHTML());
        onNotesChangeRef.current(selectedSceneRef.current.id, notes);
      }
    },
  });

  // Sync notes editor when selected scene changes
  useEffect(() => {
    if (notesEditor && selectedScene) {
      const newHtml = notesToHtml(selectedScene.notes);
      if (!notesEditor.isFocused) {
        notesEditor.commands.setContent(newHtml);
      }
    }
  }, [selectedScene?.id]);

  // Live word count (single-select mode)
  const singleWordCount = editor ? editor.getText().split(/\s+/).filter(Boolean).length : 0;

  // Total word count: aggregated in multi-select, single editor count otherwise
  const totalWordCount = isMultiSelect
    ? Object.values(subEditorWordCounts).reduce((sum, c) => sum + c, 0)
    : singleWordCount;

  // The active editor for toolbar commands
  const activeEditor = isMultiSelect
    ? (activeEditorKey ? subEditorsRef.current.get(activeEditorKey) || null : null)
    : editor;

  // Sub-editor callbacks
  const handleSubEditorFocus = useCallback((sceneKey: string) => {
    setActiveEditorKey(sceneKey);
    setPrimarySceneKey(sceneKey);
    // Update selectedScene to match the focused sub-editor
    const scene = scenes.find(s => getSceneKey(s) === sceneKey);
    if (scene) setSelectedScene(scene);
  }, [scenes]);

  const handleRegisterEditor = useCallback((sceneKey: string, ed: Editor | null) => {
    if (ed) {
      subEditorsRef.current.set(sceneKey, ed);
    } else {
      subEditorsRef.current.delete(sceneKey);
    }
  }, []);

  const handleSubEditorWordCount = useCallback((sceneKey: string, count: number) => {
    setSubEditorWordCounts(prev => {
      if (prev[sceneKey] === count) return prev;
      return { ...prev, [sceneKey]: count };
    });
  }, []);

  // Auto-sync word count to scene — only when a draft actually exists (single-select mode)
  useEffect(() => {
    if (isMultiSelect) return;
    if (!selectedScene || !selectedSceneKey) return;
    const hasDraft = draftContent[selectedSceneKey] && draftContent[selectedSceneKey] !== '<p></p>';
    if (!hasDraft) return;
    if (wordCountDebounceRef.current) clearTimeout(wordCountDebounceRef.current);
    wordCountDebounceRef.current = setTimeout(() => {
      onWordCountChange(selectedScene.id, singleWordCount || undefined);
    }, 1500);
    return () => { if (wordCountDebounceRef.current) clearTimeout(wordCountDebounceRef.current); };
  }, [singleWordCount, selectedScene?.id, isMultiSelect]);

  // Tag picker close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagPicker(false);
      }
    };
    if (showTagPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTagPicker]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (statusPillRef.current && !statusPillRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false);
      }
    };
    if (showStatusDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showStatusDropdown]);

  // Keyboard shortcuts: Cmd+[ toggles nav, Cmd+] toggles meta
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key === '[') {
        e.preventDefault();
        setShowNav(v => !v);
      } else if (modifier && e.key === ']') {
        e.preventDefault();
        setShowMeta(v => !v);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Title editing handlers
  const handleTitleClick = () => {
    if (selectedScene) {
      setEditTitle(cleanContent(selectedScene.content));
      setIsEditingTitle(true);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditTitle(e.target.value);
    if (titleTextareaRef.current) {
      titleTextareaRef.current.style.height = 'auto';
      titleTextareaRef.current.style.height = titleTextareaRef.current.scrollHeight + 'px';
    }
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (selectedScene && editTitle !== cleanContent(selectedScene.content) && onSceneContentChange) {
      onSceneContentChange(selectedScene.id, editTitle);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      if (selectedScene) {
        setEditTitle(cleanContent(selectedScene.content));
      }
      setIsEditingTitle(false);
    }
  };

  // Focus title textarea when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleTextareaRef.current) {
      titleTextareaRef.current.focus();
      titleTextareaRef.current.style.height = 'auto';
      titleTextareaRef.current.style.height = titleTextareaRef.current.scrollHeight + 'px';
      const len = titleTextareaRef.current.value.length;
      titleTextareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditingTitle]);

  const handleToggleTag = (tagName: string) => {
    if (!selectedScene) return;
    const current = selectedScene.tags;
    const updated = current.includes(tagName)
      ? current.filter(t => t !== tagName)
      : [...current, tagName];
    onTagsChange(selectedScene.id, updated);
  };

  const handleCreateNewTag = () => {
    if (!newTagName.trim() || !selectedScene) return;
    const cleanName = newTagName.trim().toLowerCase().replace(/\s+/g, '_').replace(/^#/, '');
    if (!tags.some(t => t.name === cleanName)) {
      onCreateTag(cleanName, newTagCategory);
    }
    if (!selectedScene.tags.includes(cleanName)) {
      onTagsChange(selectedScene.id, [...selectedScene.tags, cleanName]);
    }
    setNewTagName('');
    setNewTagCategory('people'); // Reset to default
    setShowTagPicker(false);
  };

  const getTagCategory = (tagName: string): string => {
    const tag = tags.find(t => t.name === tagName);
    return tag?.category || 'people';
  };

  // Metadata
  const currentMeta = selectedSceneKey ? (sceneMetadata[selectedSceneKey] || {}) : {};
  const statusFieldDef = metadataFieldDefs.find(f => f.id === '_status');
  const statusOptions = statusFieldDef
    ? (statusFieldDef.options || []).map(v => ({ value: v, color: statusFieldDef.optionColors?.[v] || '#9e9e9e' }))
    : DEFAULT_STATUSES;

  const handleMetaChange = (fieldId: string, value: string | string[]) => {
    if (!selectedSceneKey) return;
    onMetadataChange(selectedSceneKey, fieldId, value);
  };

  const toggleMultiselect = (fieldId: string, option: string) => {
    const current = (currentMeta[fieldId] as string[]) || [];
    const updated = current.includes(option)
      ? current.filter(v => v !== option)
      : [...current, option];
    handleMetaChange(fieldId, updated);
  };

  // Metadata field editor
  const [editingFieldDefs, setEditingFieldDefs] = useState<MetadataFieldDef[]>([]);

  const openMetaEditor = () => {
    setEditingFieldDefs(metadataFieldDefs.filter(f => f.id !== '_status'));
    setShowMetaEditor(true);
  };

  const addField = () => {
    setEditingFieldDefs([...editingFieldDefs, {
      id: Math.random().toString(36).substring(2, 11),
      label: 'New Field',
      type: 'text',
      options: [],
      order: editingFieldDefs.length,
    }]);
  };

  const removeField = (id: string) => {
    setEditingFieldDefs(editingFieldDefs.filter(f => f.id !== id));
  };

  const updateField = (id: string, changes: Partial<MetadataFieldDef>) => {
    setEditingFieldDefs(editingFieldDefs.map(f => f.id === id ? { ...f, ...changes } : f));
  };

  const saveMetaFields = () => {
    const statusDef = metadataFieldDefs.find(f => f.id === '_status');
    onMetadataFieldDefsChange(statusDef ? [statusDef, ...editingFieldDefs] : editingFieldDefs);
    setShowMetaEditor(false);
  };

  // Draggable field reorder
  const draggedFieldRef = useRef<string | null>(null);
  const handleFieldDragStart = (e: React.DragEvent, fieldId: string) => {
    draggedFieldRef.current = fieldId;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleFieldDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleFieldDrop = (e: React.DragEvent, targetFieldId: string) => {
    e.preventDefault();
    const draggedId = draggedFieldRef.current;
    if (!draggedId || draggedId === targetFieldId) return;
    draggedFieldRef.current = null;
    const userFields = metadataFieldDefs.filter(f => f.id !== '_status').sort((a, b) => a.order - b.order);
    const fromIdx = userFields.findIndex(f => f.id === draggedId);
    const toIdx = userFields.findIndex(f => f.id === targetFieldId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...userFields];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updated = reordered.map((f, i) => ({ ...f, order: i }));
    const statusDef = metadataFieldDefs.find(f => f.id === '_status');
    onMetadataFieldDefsChange(statusDef ? [statusDef, ...updated] : updated);
  };

  const openStatusEditor = () => {
    setEditingStatuses([...statusOptions]);
    setShowStatusEditor(true);
  };

  const saveStatuses = () => {
    const statusDef: MetadataFieldDef = {
      id: '_status',
      label: 'Status',
      type: 'dropdown',
      options: editingStatuses.map(s => s.value),
      optionColors: Object.fromEntries(editingStatuses.map(s => [s.value, s.color])),
      order: -1,
    };
    const otherDefs = metadataFieldDefs.filter(f => f.id !== '_status');
    onMetadataFieldDefsChange([statusDef, ...otherDefs]);
    setShowStatusEditor(false);
  };

  return (
    <div className="editor-view">
      {/* Left: Scene Navigator */}
      {showNav && <div className="editor-nav" style={{ width: navWidth }}>
        <div className="editor-nav-filter">
          <select value={selectedCharFilter} onChange={e => setSelectedCharFilter(e.target.value)}>
            <option value="all">All Characters</option>
            {characters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="editor-nav-list">
          <>
              {braidedPlaced.map(scene => {
                const key = getSceneKey(scene);
                const char = characters.find(c => c.id === scene.characterId);
                const hasDraft = !!(draftContent[key] && draftContent[key] !== '<p></p>');
                const charColor = characterColors[scene.characterId] || '#888';
                const isActive = selectedSceneKeys.includes(key);
                const isPrimary = isMultiSelect ? (primarySceneKey === key || activeEditorKey === key) : (selectedSceneKey === key);
                return (
                  <div
                    key={key}
                    className={`editor-nav-item ${isPrimary ? 'active' : ''} ${isActive && !isPrimary ? 'multi-selected' : ''} ${hasDraft ? 'has-draft' : ''}`}
                    style={isActive ? { borderLeftColor: charColor, backgroundColor: `${charColor}12` } : undefined}
                    onClick={(e) => handleSceneClick(key, e)}
                  >
                    <div className="editor-nav-item-stack">
                      <span className="editor-nav-item-char-label" style={{ color: charColor }}>{char?.name} {scene.sceneNumber}</span>
                      <span className="editor-nav-item-title">{cleanContent(scene.content)}</span>
                    </div>
                    {hasDraft && <span className="editor-nav-item-draft-indicator" style={{ backgroundColor: charColor }} />}
                  </div>
                );
              })}
              {braidedUnplaced.length > 0 && (
                <>
                  <div className="editor-nav-unplaced-sep">Unplaced</div>
                  {braidedUnplaced.map(scene => {
                    const key = getSceneKey(scene);
                    const char = characters.find(c => c.id === scene.characterId);
                    const hasDraft = !!(draftContent[key] && draftContent[key] !== '<p></p>');
                    const charColor = characterColors[scene.characterId] || '#888';
                    const isActive = selectedSceneKeys.includes(key);
                    const isPrimary = isMultiSelect ? (primarySceneKey === key || activeEditorKey === key) : (selectedSceneKey === key);
                    return (
                      <div
                        key={key}
                        className={`editor-nav-item ${isPrimary ? 'active' : ''} ${isActive && !isPrimary ? 'multi-selected' : ''} ${hasDraft ? 'has-draft' : ''}`}
                        style={isActive ? { borderLeftColor: charColor, backgroundColor: `${charColor}12` } : undefined}
                        onClick={(e) => handleSceneClick(key, e)}
                      >
                        <div className="editor-nav-item-stack">
                          <span className="editor-nav-item-char-label" style={{ color: charColor }}>{char?.name} {scene.sceneNumber}</span>
                          <span className="editor-nav-item-title">{cleanContent(scene.content)}</span>
                        </div>
                        {hasDraft && <span className="editor-nav-item-draft-indicator" style={{ backgroundColor: charColor }} />}
                      </div>
                    );
                  })}
                </>
              )}
            </>
        </div>
      </div>}
      {showNav && <div className="editor-resize-handle" onMouseDown={e => handleResizeStart(e, 'nav')} />}

      {/* Center: Draft Editor */}
      <div className="editor-draft">
        <div className="editor-draft-toolbar">
          <button className="editor-panel-toggle editor-panel-toggle-nav" onClick={() => setShowNav(!showNav)} title={showNav ? 'Hide navigator (Cmd+[)' : 'Show navigator (Cmd+[)'}>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <rect x="0.75" y="0.75" width="16.5" height="12.5" rx="2.25" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="5.5" y1="0.75" x2="5.5" y2="13.25" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          <div className="editor-toolbar-divider" />
          <button className="editor-toolbar-btn" onClick={() => activeEditor?.chain().focus().toggleBold().run()} title="Bold">B</button>
          <button className="editor-toolbar-btn" onClick={() => activeEditor?.chain().focus().toggleItalic().run()} title="Italic"><em>I</em></button>
          <button className="editor-toolbar-btn" onClick={() => activeEditor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">H2</button>
          <button className="editor-toolbar-btn" onClick={() => activeEditor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Sub-heading">H3</button>
          <button className="editor-toolbar-btn" onClick={() => activeEditor?.chain().focus().toggleBulletList().run()} title="Bullet List">≡</button>
          <button className="editor-toolbar-btn" onClick={() => activeEditor?.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">—</button>
          <div className="editor-toolbar-spacer" />
          <button className="editor-panel-toggle editor-panel-toggle-meta" onClick={() => setShowMeta(!showMeta)} title={showMeta ? 'Hide properties (Cmd+])' : 'Show properties (Cmd+])'}>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <rect x="0.75" y="0.75" width="16.5" height="12.5" rx="2.25" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="12.5" y1="0.75" x2="12.5" y2="13.25" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
        </div>
        {isMultiSelect ? (
          <>
            {/* Scrivenings mode: stacked sub-editors */}
            <div className="scrivenings-container">
              {selectedScenesOrdered.map((scene, idx) => {
                const key = getSceneKey(scene);
                const char = characters.find(c => c.id === scene.characterId);
                return (
                  <SceneSubEditor
                    key={key}
                    sceneKey={key}
                    scene={scene}
                    content={draftContent[key] || ''}
                    characterName={char?.name || 'Unknown'}
                    characterColor={characterColors[scene.characterId] || '#888'}
                    isFirst={idx === 0}
                    onContentChange={onDraftChange}
                    onFocus={handleSubEditorFocus}
                    registerEditor={handleRegisterEditor}
                    onWordCountChange={handleSubEditorWordCount}
                  />
                );
              })}
            </div>
            <div className="editor-draft-footer">
              <div className="editor-draft-footer-left">
                <span className="editor-word-count">Word Count: {totalWordCount.toLocaleString()} ({selectedSceneKeys.length} scenes)</span>
                <span className="editor-reading-time">Reading Time: {Math.max(1, Math.round(totalWordCount / 250))} min</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Single scene mode: original behavior */}
            {selectedScene && (
              <div className="editor-draft-scene-header">
                {isEditingTitle ? (
                  <textarea
                    ref={titleTextareaRef}
                    className="editor-draft-scene-title-input"
                    value={editTitle}
                    onChange={handleTitleChange}
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    placeholder="Scene description..."
                  />
                ) : (
                  <h2
                    className="editor-draft-scene-title"
                    onClick={handleTitleClick}
                    title="Click to edit"
                  >
                    {cleanContent(selectedScene.content) || 'Untitled scene'}
                  </h2>
                )}
                <div className="editor-draft-scene-subtitle">
                  <span>{characters.find(c => c.id === selectedScene.characterId)?.name} · Scene {selectedScene.sceneNumber}</span>
                </div>
              </div>
            )}
            <div className="editor-draft-editor">
              <EditorContent editor={editor} />
            </div>
            <div className="editor-draft-footer">
              <div className="editor-draft-footer-left">
                <span className="editor-word-count">Word Count: {singleWordCount.toLocaleString()}</span>
                <span className="editor-reading-time">Reading Time: {Math.max(1, Math.round(singleWordCount / 250))} min</span>
              </div>
              {selectedScene && (
                <span className="editor-scene-label">Last Saved: {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right: Metadata Panel */}
      {showMeta && <div className="editor-resize-handle" onMouseDown={e => handleResizeStart(e, 'meta')} />}
      {showMeta && <div className="editor-meta" style={{ width: metaWidth }}>
        {/* Multi-select indicator */}
        {isMultiSelect && selectedScene && (
          <div className="editor-meta-multi-indicator">
            Showing: {characters.find(c => c.id === selectedScene.characterId)?.name} Scene {selectedScene.sceneNumber}
          </div>
        )}
        {/* Scene Synopsis (formerly Notes) */}
        <div className="editor-meta-section">
          <h4 className="editor-meta-label">Scene Synopsis</h4>
          {notesEditorFocused && notesEditor && (
            <div className="editor-meta-notes-toolbar">
              <button className="notes-toolbar-btn" onClick={() => notesEditor.chain().focus().toggleBold().run()} title="Bold"><strong>B</strong></button>
              <button className="notes-toolbar-btn" onClick={() => notesEditor.chain().focus().toggleItalic().run()} title="Italic"><em>I</em></button>
              <button className="notes-toolbar-btn" onClick={() => notesEditor.chain().focus().toggleBulletList().run()} title="Bullet List">≡</button>
              <button className="notes-toolbar-btn" onClick={() => notesEditor.chain().focus().toggleTaskList().run()} title="Checkbox List">☐</button>
            </div>
          )}
          <EditorContent editor={notesEditor} className="editor-meta-notes-editor" />
        </div>

        {/* Status */}
        <div className="editor-meta-section">
          <div className="editor-meta-label-row">
            <h4 className="editor-meta-label">Status</h4>
            <button className="editor-meta-edit-btn" onClick={openStatusEditor}>Edit</button>
          </div>
          <div className="editor-meta-status-pill-wrap">
            <button
              className="editor-meta-status-pill"
              style={{ '--status-color': (statusOptions.find(s => s.value === (currentMeta['_status'] as string))?.color) || '#9e9e9e' } as React.CSSProperties}
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            >
              {(currentMeta['_status'] as string) || 'No status'}
            </button>
            {showStatusDropdown && (
              <div className="editor-meta-status-dropdown">
                {statusOptions.map(s => (
                  <button
                    key={s.value}
                    className={`editor-meta-status-option ${(currentMeta['_status'] as string) === s.value ? 'active' : ''}`}
                    onClick={() => { handleMetaChange('_status', s.value); setShowStatusDropdown(false); }}
                  >
                    <span className="editor-meta-status-dot" style={{ background: s.color }} />
                    {s.value}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="editor-meta-section">
          <h4 className="editor-meta-label">Tags</h4>
          <div className="editor-meta-tags">
            {selectedScene && selectedScene.tags.map(tagName => (
              <span
                key={tagName}
                className={`tag ${getTagCategory(tagName)} clickable`}
                onClick={() => handleToggleTag(tagName)}
                title="Click to remove"
              >
                #{tagName}
              </span>
            ))}
            <div className="tag-picker-container" ref={tagPickerRef}>
              <button className="add-tag-btn" onClick={() => setShowTagPicker(!showTagPicker)}>+</button>
              {showTagPicker && (
                <div className="tag-picker-dropdown">
                  <div className="tag-picker-create">
                    <input
                      type="text"
                      placeholder="Search or create..."
                      value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateNewTag(); } }}
                      autoFocus
                    />
                    <select
                      className="tag-picker-category"
                      value={newTagCategory}
                      onChange={e => setNewTagCategory(e.target.value as typeof newTagCategory)}
                      title="Tag category"
                    >
                      <option value="people">Person</option>
                      <option value="locations">Location</option>
                      <option value="arcs">Arc</option>
                      <option value="things">Thing</option>
                      <option value="time">Time</option>
                    </select>
                    <button onClick={handleCreateNewTag} disabled={!newTagName.trim()}>Add</button>
                  </div>
                  {tags
                    .filter(t => !(selectedScene?.tags || []).includes(t.name))
                    .filter(t => !newTagName.trim() || t.name.toLowerCase().includes(newTagName.trim().toLowerCase()))
                    .map(tag => (
                      <div key={tag.id} className={`tag-picker-item ${tag.category}`} onClick={() => { handleToggleTag(tag.name); setShowTagPicker(false); setNewTagName(''); }}>
                        #{tag.name}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scratchpad */}
        <div className="editor-meta-section">
          <h4 className="editor-meta-label">Scratchpad</h4>
          <textarea
            className="editor-meta-scratchpad"
            placeholder="Jot down quick notes, ideas, reminders..."
            value={selectedSceneKey ? (scratchpad[selectedSceneKey] || '') : ''}
            onChange={e => {
              if (selectedSceneKey) {
                setScratchpad(prev => ({ ...prev, [selectedSceneKey]: e.target.value }));
              }
            }}
          />
        </div>

        {/* Go-to buttons */}
        {selectedScene && (
          <div className="editor-meta-goto-row">
            <button className="editor-meta-goto-btn" onClick={() => onGoToPov?.(selectedScene.id, selectedScene.characterId)}>POV</button>
            <button className="editor-meta-goto-btn" onClick={() => onGoToBraid?.(selectedScene.id)}>Braid</button>
          </div>
        )}

        {/* History (formerly Drafts) */}
        {selectedScene && (() => {
          const key = getSceneKey(selectedScene);
          const sceneDrafts = drafts[key] || [];
          return (
            <div className="editor-meta-section">
              <div className="editor-meta-label-row">
                <h4 className="editor-meta-label">History</h4>
                <div className="editor-meta-label-row-actions">
                  {sceneDrafts.length >= 2 && (
                    <button className="editor-meta-edit-btn" onClick={() => { setDiffVersionA(sceneDrafts[sceneDrafts.length - 2].version); setDiffVersionB(sceneDrafts[sceneDrafts.length - 1].version); setShowDiffModal(true); }}>Compare</button>
                  )}
                  <button className="editor-meta-save-draft-btn" onClick={handleSaveDraft}>Save Draft</button>
                </div>
              </div>
              {sceneDrafts.length > 0 ? (
                <div className="editor-meta-drafts-list">
                  {[...sceneDrafts].reverse().map(draft => (
                    <div key={draft.version} className="editor-meta-draft-item">
                      <span className="editor-meta-draft-version">V{draft.version}</span>
                      <span className="editor-meta-draft-date">{new Date(draft.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <button className="editor-meta-draft-restore" onClick={() => handleRestoreDraft(draft.version)}>Restore</button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="editor-meta-drafts-empty">No saved drafts yet</span>
              )}
            </div>
          );
        })()}

        {/* Metadata Fields */}
        <div className="editor-meta-section">
          <div className="editor-meta-label-row">
            <h4 className="editor-meta-label">Properties</h4>
            <button className="editor-meta-edit-btn" onClick={openMetaEditor}>Edit...</button>
          </div>
          <div className="editor-meta-fields">
            {metadataFieldDefs.filter(f => f.id !== '_status').sort((a, b) => a.order - b.order).map(field => (
              <div
                key={field.id}
                className="editor-meta-field"
                draggable
                onDragStart={e => handleFieldDragStart(e, field.id)}
                onDragOver={handleFieldDragOver}
                onDrop={e => handleFieldDrop(e, field.id)}
              >
                <div className="editor-meta-field-header">
                  <span className="editor-meta-field-drag-handle">⋮⋮</span>
                  <label className="editor-meta-field-label">{field.label}</label>
                </div>
                {field.type === 'text' && (
                  <input
                    type="text"
                    className="editor-meta-field-input"
                    value={(currentMeta[field.id] as string) || ''}
                    onChange={e => handleMetaChange(field.id, e.target.value)}
                  />
                )}
                {field.type === 'dropdown' && (
                  <select
                    className="editor-meta-field-select"
                    value={(currentMeta[field.id] as string) || ''}
                    onChange={e => handleMetaChange(field.id, e.target.value)}
                  >
                    <option value="">—</option>
                    {(field.options || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {field.type === 'multiselect' && (
                  <div className="editor-meta-multiselect">
                    {(field.options || []).map(opt => {
                      const selected = ((currentMeta[field.id] as string[]) || []).includes(opt);
                      return (
                        <span
                          key={opt}
                          className={`editor-meta-chip ${selected ? 'selected' : ''}`}
                          onClick={() => toggleMultiselect(field.id, opt)}
                        >
                          {opt}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {metadataFieldDefs.filter(f => f.id !== '_status').length === 0 && (
              <p className="editor-meta-empty">No properties yet. Click "Edit..." to add some.</p>
            )}
          </div>
        </div>
      </div>}

      {/* Metadata Field Editor Modal */}
      {showMetaEditor && (
        <div className="modal-overlay" onClick={() => setShowMetaEditor(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Properties</h3>
              <button className="modal-close-btn" onClick={() => setShowMetaEditor(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '16px', minWidth: '360px' }}>
              {editingFieldDefs.map((field, i) => (
                <div key={field.id} className="meta-field-editor-row">
                  <input
                    type="text"
                    className="meta-field-editor-label"
                    value={field.label}
                    onChange={e => updateField(field.id, { label: e.target.value })}
                    placeholder="Field name"
                  />
                  <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as MetadataFieldDef['type'], options: [] })}>
                    <option value="text">Text</option>
                    <option value="dropdown">Dropdown</option>
                    <option value="multiselect">Multiselect</option>
                  </select>
                  {(field.type === 'dropdown' || field.type === 'multiselect') && (
                    <input
                      type="text"
                      className="meta-field-editor-options"
                      value={(field.options || []).join(', ')}
                      onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="Option 1, Option 2..."
                    />
                  )}
                  <button className="meta-field-editor-remove" onClick={() => removeField(field.id)}>×</button>
                </div>
              ))}
              <button className="meta-field-editor-add" onClick={addField}>+ Add Property</button>
              <div className="meta-field-editor-actions">
                <button className="meta-field-editor-save" onClick={saveMetaFields}>Save</button>
                <button className="meta-field-editor-cancel" onClick={() => setShowMetaEditor(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Editor Modal */}
      {showStatusEditor && (
        <div className="modal-overlay" onClick={() => setShowStatusEditor(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Statuses</h3>
              <button className="modal-close-btn" onClick={() => setShowStatusEditor(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '16px', minWidth: '320px' }}>
              {editingStatuses.map((s, i) => (
                <div key={i} className="status-editor-row">
                  <input
                    type="text"
                    className="status-editor-name"
                    value={s.value}
                    onChange={e => { const updated = [...editingStatuses]; updated[i] = { ...s, value: e.target.value }; setEditingStatuses(updated); }}
                  />
                  <div className="status-editor-colors">
                    {STATUS_COLORS.map(color => (
                      <div
                        key={color}
                        className={`status-color-swatch ${s.color === color ? 'active' : ''}`}
                        style={{ background: color }}
                        onClick={() => { const updated = [...editingStatuses]; updated[i] = { ...s, color }; setEditingStatuses(updated); }}
                      />
                    ))}
                  </div>
                  <button className="status-editor-remove" onClick={() => setEditingStatuses(editingStatuses.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button className="meta-field-editor-add" onClick={() => setEditingStatuses([...editingStatuses, { value: 'New', color: '#9e9e9e' }])}>+ Add Status</button>
              <div className="meta-field-editor-actions">
                <button className="meta-field-editor-save" onClick={saveStatuses}>Save</button>
                <button className="meta-field-editor-cancel" onClick={() => setShowStatusEditor(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Comparison Modal */}
      {showDiffModal && selectedScene && (() => {
        const key = getSceneKey(selectedScene);
        const sceneDrafts = drafts[key] || [];
        const vA = sceneDrafts.find(d => d.version === diffVersionA);
        const vB = sceneDrafts.find(d => d.version === diffVersionB);
        const chunks = vA && vB ? computeWordDiff(stripHtml(vA.content), stripHtml(vB.content)) : [];
        return (
          <div className="modal-overlay" onClick={() => setShowDiffModal(false)}>
            <div className="diff-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Compare Drafts</h3>
                <button className="modal-close-btn" onClick={() => setShowDiffModal(false)}>×</button>
              </div>
              <div className="diff-modal-selectors">
                <div className="diff-modal-selector">
                  <label>From</label>
                  <select value={diffVersionA || ''} onChange={e => setDiffVersionA(Number(e.target.value))}>
                    {sceneDrafts.map(d => <option key={d.version} value={d.version}>V{d.version} — {new Date(d.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</option>)}
                  </select>
                </div>
                <div className="diff-modal-selector">
                  <label>To</label>
                  <select value={diffVersionB || ''} onChange={e => setDiffVersionB(Number(e.target.value))}>
                    {sceneDrafts.map(d => <option key={d.version} value={d.version}>V{d.version} — {new Date(d.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</option>)}
                  </select>
                </div>
              </div>
              <div className="diff-modal-legend">
                <span className="diff-legend-added">+ Added</span>
                <span className="diff-legend-removed">− Removed</span>
              </div>
              <div className="diff-modal-body">
                {chunks.map((chunk, i) => (
                  <span key={i} className={`diff-chunk diff-${chunk.type}`}>{chunk.text} </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
