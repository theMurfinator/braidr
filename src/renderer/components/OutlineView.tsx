import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Scene, Chapter, MetadataFieldDef } from '../../shared/types';
import { MetaRichField, CreatableMultiSelect, cleanContent } from './EditorView';

// Outline notes used to be stored as plain text (newline-separated). Existing
// content still comes back that way; wrap it as paragraphs the first time it
// loads into the rich editor. New saves go out as real HTML from then on.
function legacyOutlineToHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return raw; // already HTML
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return trimmed.split(/\n+/).filter(Boolean).map(line => `<p>${esc(line)}</p>`).join('');
}

interface OutlineViewProps {
  scenes: Scene[]; // braid order, already filtered
  chapters: Chapter[];
  outlines: Record<string, string>;
  draftContent: Record<string, string>;
  metadataFieldDefs: MetadataFieldDef[];
  sceneMetadata: Record<string, Record<string, string | string[]>>;
  getCharacterName: (characterId: string) => string;
  getCharacterHexColor: (characterId: string) => string;
  onOutlineChange: (sceneId: string, text: string) => void;
  onDraftChange: (sceneId: string, html: string) => void;
  onMetadataChange: (sceneId: string, fieldId: string, value: string | string[]) => void;
  onMetadataFieldDefsChange: (defs: MetadataFieldDef[]) => void;
  onTitleChange: (sceneId: string, newTitle: string) => void;
  timerRunning?: boolean;
  timerSceneKey?: string | null;
  onStartTimer?: (sceneKey: string) => void;
  onStopTimer?: () => void;
}

const LAST_SCENE_KEY = 'braidr-outline-last-scene';

function countHtmlWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

const TARGET_WORDS = 250;
const MAX_WORDS = 300;

interface Group {
  key: string;
  title: string | null; // null = no header (flat)
  scenes: Scene[];
}

// Group braided scenes by chapter (the braid's structural unit). Sections/plot
// points are POV-specific and don't cross characters, so they're not used here.
function buildGroups(scenes: Scene[], chapters: Chapter[]): Group[] {
  if (!chapters || chapters.length === 0) return [{ key: 'all', title: null, scenes }];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const groups: Group[] = [];
  const seen = new Set<string>();
  for (const ch of sorted) {
    const chScenes = scenes
      .filter(s => s.chapterId === ch.id)
      .sort((a, b) => a.sceneOrder - b.sceneOrder);
    if (chScenes.length) {
      groups.push({ key: ch.id, title: ch.title || 'Untitled chapter', scenes: chScenes });
      chScenes.forEach(s => seen.add(s.id));
    }
  }
  const unassigned = scenes.filter(s => !seen.has(s.id)); // keeps braid order
  if (unassigned.length) groups.push({ key: '__unassigned', title: 'Unassigned', scenes: unassigned });
  return groups;
}

interface PassageProps {
  scene: Scene;
  number: number;
  characterName: string;
  accent: string;
  value: string;
  onChange: (sceneId: string, text: string) => void;
  onWritingChange?: (writing: boolean) => void;
  onOpenMeta: (sceneId: string) => void;
  onOpenText: (sceneId: string) => void;
  onTitleChange: (sceneId: string, newTitle: string) => void;
}

function Passage({ scene, number, characterName, accent, value, onChange, onWritingChange, onOpenMeta, onOpenText, onTitleChange }: PassageProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(() => cleanContent(scene.content) || scene.title || '');

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed !== (cleanContent(scene.content) || scene.title || '')) onTitleChange(scene.id, trimmed);
  };
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const isFocusedRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wordCount, setWordCount] = useState(() => countHtmlWords(value));

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'What happens here…' })],
    content: value || '',
    onFocus: () => { isFocusedRef.current = true; setFocused(true); onWritingChange?.(true); },
    onBlur: ({ editor: e }) => {
      isFocusedRef.current = false;
      setFocused(false);
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      onChangeRef.current(scene.id, e.isEmpty ? '' : e.getHTML());
      onWritingChange?.(false);
    },
    onUpdate: ({ editor: e }) => {
      setWordCount(countHtmlWords(e.getHTML()));
      if (!isFocusedRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onChangeRef.current(scene.id, e.isEmpty ? '' : e.getHTML());
      }, 600);
    },
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      if (editor && !editor.isDestroyed) onChangeRef.current(scene.id, editor.isEmpty ? '' : editor.getHTML());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editor || editor.isDestroyed || isFocusedRef.current) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || '');
      setWordCount(countHtmlWords(value));
    }
  }, [editor, value]);

  const isEmpty = wordCount === 0;

  return (
    <section className={`ms-passage${isEmpty ? ' is-empty' : ''}${focused ? ' is-focused' : ''}`}>
      <div className="ms-head">
        <span
          className="ms-slug"
          role="button"
          tabIndex={0}
          onClick={() => onOpenMeta(scene.id)}
        >
          <span className="ms-slug__num">{String(number).padStart(2, '0')}</span>
          <span className="ms-slug__sep">|</span>
          <span className="ms-slug__pov" style={{ color: accent }}>{characterName}</span>
        </span>
        {editingTitle ? (
          <input
            className="ms-title-input"
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { setTitleDraft(cleanContent(scene.content) || scene.title || ''); setEditingTitle(false); }
            }}
          />
        ) : (
          <h2
            className="ms-title"
            role="button"
            tabIndex={0}
            title="Click to edit"
            onClick={e => { e.stopPropagation(); setTitleDraft(cleanContent(scene.content) || scene.title || ''); setEditingTitle(true); }}
          >
            {cleanContent(scene.content) || scene.title || 'Untitled scene'}
          </h2>
        )}
        <button
          type="button"
          className="ms-head__preview-btn"
          onClick={() => onOpenText(scene.id)}
        >
          Preview
        </button>
      </div>
      <EditorContent editor={editor} className="ms-body" />
      <div className="ms-passage__count" aria-hidden={!focused}>
        {wordCount > 0 && (
          <span className={wordCount > MAX_WORDS ? 'over' : wordCount > TARGET_WORDS ? 'near' : ''}>
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        )}
      </div>
    </section>
  );
}

interface MetaPanelProps {
  scene: Scene;
  chapter: Chapter | undefined;
  characterName: string;
  accent: string;
  wordCount: number;
  fieldDefs: MetadataFieldDef[];
  values: Record<string, string | string[]>;
  onFieldChange: (fieldId: string, value: string | string[]) => void;
  onFieldDefsChange: (defs: MetadataFieldDef[]) => void;
  onTitleChange: (sceneId: string, newTitle: string) => void;
  timerRunning?: boolean;
  timerSceneKey?: string | null;
  onStartTimer?: (sceneKey: string) => void;
  onStopTimer?: () => void;
  onOpenText: () => void;
  onClose: () => void;
}

function MetaPanel({ scene, chapter, characterName, accent, wordCount, fieldDefs, values, onFieldChange, onFieldDefsChange, onTitleChange, timerRunning, timerSceneKey, onStartTimer, onStopTimer, onOpenText, onClose }: MetaPanelProps) {
  const isTimerForThisScene = timerSceneKey === scene.id;
  const sortedFields = fieldDefs.filter(f => f.id !== '_status').sort((a, b) => a.order - b.order);
  const currentTitle = cleanContent(scene.content) || scene.title || '';
  const [titleDraft, setTitleDraft] = useState(currentTitle);
  useEffect(() => setTitleDraft(currentTitle), [scene.id, currentTitle]);

  return (
    <div className="ms-panel">
      <div className="ms-panel__header">
        <button type="button" className="ms-panel__close" onClick={onClose} title="Close">×</button>
        <button type="button" className="ms-panel__preview-btn" onClick={onOpenText}>Preview</button>
      </div>
      <div className="ms-panel__body">
        <div className="ms-panel__field">
          <span className="ms-panel__label">Title</span>
          <input
            className="ms-panel__title-input"
            value={titleDraft}
            placeholder="Untitled scene"
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { if (titleDraft.trim() !== currentTitle) onTitleChange(scene.id, titleDraft.trim()); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        <div className="ms-panel__field">
          <span className="ms-panel__label">Character</span>
          <span className="ms-panel__value" style={{ color: accent }}>{characterName}</span>
        </div>
        <div className="ms-panel__field">
          <span className="ms-panel__label">Chapter</span>
          <span className="ms-panel__value">{chapter?.title || 'Unassigned'}</span>
        </div>
        <div className="ms-panel__field">
          <span className="ms-panel__label">Word count</span>
          <span className="ms-panel__value">{wordCount}</span>
        </div>
        {onStartTimer && (
          <div className="ms-panel__field">
            <span className="ms-panel__label">Timer</span>
            {isTimerForThisScene && timerRunning ? (
              <button type="button" className="editor-timer-btn stop" onClick={() => onStopTimer?.()}>Stop</button>
            ) : (
              <button type="button" className="editor-timer-btn start" onClick={() => onStartTimer(scene.id)}>Start</button>
            )}
          </div>
        )}

        {/* Same custom-properties editor as Editor view's meta panel. */}
        <div className="editor-meta-section">
          <div className="editor-meta-label-row">
            <h4 className="editor-meta-label">Properties</h4>
          </div>
          <div className="editor-meta-fields">
            {sortedFields.map(field => (
              <div key={field.id} className="editor-meta-field">
                <div className="editor-meta-field-header">
                  <label className="editor-meta-field-label">{field.label}</label>
                </div>
                {field.type === 'text' && (
                  <MetaRichField
                    value={(values[field.id] as string) || ''}
                    onChange={v => onFieldChange(field.id, v)}
                  />
                )}
                {field.type === 'dropdown' && (
                  <select
                    className="editor-meta-field-select"
                    value={(values[field.id] as string) || ''}
                    onChange={e => onFieldChange(field.id, e.target.value)}
                  >
                    <option value="">—</option>
                    {(field.options || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {field.type === 'multiselect' && (
                  <CreatableMultiSelect
                    fieldId={field.id}
                    options={field.options || []}
                    optionColors={field.optionColors}
                    value={(values[field.id] as string[]) || []}
                    onValueChange={v => onFieldChange(field.id, v)}
                    onAddOption={(fid, opt, color) => {
                      const updatedDefs = fieldDefs.map(f =>
                        f.id === fid ? { ...f, options: [...(f.options || []), opt], optionColors: { ...(f.optionColors ?? {}), [opt]: color } } : f
                      );
                      onFieldDefsChange(updatedDefs);
                    }}
                  />
                )}
              </div>
            ))}
            {sortedFields.length === 0 && (
              <p className="editor-meta-empty">No properties yet — add some from Editor view.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TextPanelProps {
  scene: Scene;
  draftHtml: string;
  onDraftChange: (sceneId: string, html: string) => void;
  onClose: () => void;
}

function TextPanel({ scene, draftHtml, onDraftChange, onClose }: TextPanelProps) {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editableRef.current) editableRef.current.innerHTML = draftHtml || '<p></p>';
    return () => { if (timer.current) clearTimeout(timer.current); };
    // Only re-sync the editable DOM when the panel switches scene, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  const handleInput = () => {
    const html = editableRef.current?.innerHTML ?? '';
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onDraftChange(scene.id, html), 600);
  };

  return (
    <div className="ms-text-panel">
      <div className="ms-panel__header">
        <button type="button" className="ms-panel__close" onClick={onClose} title="Close">×</button>
        <span className="ms-panel__title-label">{scene.title || 'Untitled scene'}</span>
      </div>
      <div
        ref={editableRef}
        className="ms-text-panel__body"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
      />
    </div>
  );
}

export default function OutlineView({
  scenes, chapters, outlines, draftContent, metadataFieldDefs, sceneMetadata,
  getCharacterName, getCharacterHexColor, onOutlineChange, onDraftChange, onMetadataChange, onMetadataFieldDefsChange,
  onTitleChange, timerRunning, timerSceneKey, onStartTimer, onStopTimer,
}: OutlineViewProps) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [navFilter, setNavFilter] = useState('');
  const mainRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const armed = useRef(false);
  const restScroll = useRef(0);
  const restoredScroll = useRef(false);

  const groups = buildGroups(scenes, chapters);
  const flat = groups.flatMap(g => g.scenes);
  const flatIndexById = new Map(flat.map((s, i) => [s.id, i]));
  const active = focusedId ?? activeId ?? flat[0]?.id ?? null;

  const openMeta = (id: string) => { setActiveSceneId(id); setMetaOpen(true); };
  const openText = (id: string) => { setActiveSceneId(id); setMetaOpen(true); setTextOpen(true); };
  const closeMeta = () => { setMetaOpen(false); setTextOpen(false); };
  const closeText = () => setTextOpen(false);

  // Scroll-spy: highlight whichever scene is nearest the top of the view.
  useEffect(() => {
    if (focusedId) return;
    const root = mainRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = top?.target.getAttribute('data-scene-id') ?? null;
        if (id) {
          setActiveId(id);
          if (restoredScroll.current) localStorage.setItem(LAST_SCENE_KEY, id);
        }
      },
      { root, rootMargin: '-12% 0px -70% 0px', threshold: 0 }
    );
    root.querySelectorAll('[data-scene-id]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [flat.length, focusedId]);

  // On first mount, jump straight to wherever the writer left off instead of
  // resetting to the top of the manuscript every time this view is switched to.
  useEffect(() => {
    const lastId = localStorage.getItem(LAST_SCENE_KEY);
    const root = mainRef.current;
    if (lastId && root) {
      const el = root.querySelector(`[data-scene-id="${lastId}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'start' });
    }
    restoredScroll.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus a scene: it stays exactly where it is; the others just go transparent.
  // Scrolling then reveals them back proportional to how far you scroll.
  const REVEAL_PX = 600;
  const enterFocus = (id: string) => {
    armed.current = false;
    containerRef.current?.style.setProperty('--reveal', '0');
    setFocusedId(id);
    localStorage.setItem(LAST_SCENE_KEY, id);
    const el = mainRef.current?.querySelector(`[data-scene-id="${id}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const editable = el?.querySelector('[contenteditable="true"]') as HTMLElement | null;
    setTimeout(() => {
      editable?.focus({ preventScroll: true });
      restScroll.current = mainRef.current?.scrollTop ?? 0;
      armed.current = true;
    }, 420);
  };
  const exitFocus = () => { armed.current = false; setFocusedId(null); };

  // Drive sibling opacity directly from scroll distance (ref, no re-render).
  const handleScroll = () => {
    if (!focusedId || !armed.current) return;
    const main = mainRef.current;
    const container = containerRef.current;
    if (!main || !container) return;
    const reveal = Math.min(1, Math.abs(main.scrollTop - restScroll.current) / REVEAL_PX);
    container.style.setProperty('--reveal', String(reveal));
    if (reveal >= 1) exitFocus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (focusedId && e.key === 'Escape') { e.preventDefault(); exitFocus(); return; }
      if (!focusedId || !(e.metaKey || e.ctrlKey)) return;
      const i = flatIndexById.get(focusedId) ?? 0;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); if (flat[i + 1]) enterFocus(flat[i + 1].id); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); if (flat[i - 1]) enterFocus(flat[i - 1].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (flat.length === 0) {
    return (
      <div className="ms-scroll">
        <div className="ms-sheet">
          <div className="ms-empty">Nothing braided here yet. Braid some scenes to start outlining the arc.</div>
        </div>
      </div>
    );
  }

  const panelScene = activeSceneId ? flat.find(s => s.id === activeSceneId) : undefined;

  return (
    <div ref={containerRef} className={`ms-focus${writing ? ' is-writing' : ''}${focusedId ? ' is-focusing' : ''}`}>
      <div
        className="ms-focus-main"
        ref={mainRef}
        onScroll={handleScroll}
      >
        <div className="ms-sheet">
          {groups.map(g => (
            <div key={g.key} className="ms-group">
              {g.title !== null && <div className="ms-chapter">{g.title}</div>}
              {g.scenes.map(s => (
                <div
                  key={s.id}
                  className={`ms-anchor${s.id === focusedId ? ' is-current' : ''}`}
                  data-scene-id={s.id}
                >
                  <Passage
                    scene={s}
                    number={(flatIndexById.get(s.id) ?? 0) + 1}
                    characterName={getCharacterName(s.characterId)}
                    accent={getCharacterHexColor(s.characterId)}
                    value={legacyOutlineToHtml(outlines[s.id] || '')}
                    onChange={onOutlineChange}
                    onWritingChange={setWriting}
                    onOpenMeta={openMeta}
                    onOpenText={openText}
                    onTitleChange={onTitleChange}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {metaOpen && panelScene ? (
        <>
          <MetaPanel
            scene={panelScene}
            chapter={chapters.find(c => c.id === panelScene.chapterId)}
            characterName={getCharacterName(panelScene.characterId)}
            accent={getCharacterHexColor(panelScene.characterId)}
            wordCount={panelScene.wordCount ?? countHtmlWords(draftContent[panelScene.id] || '')}
            fieldDefs={metadataFieldDefs}
            values={sceneMetadata[panelScene.id] || {}}
            onFieldChange={(fieldId, value) => onMetadataChange(panelScene.id, fieldId, value)}
            onFieldDefsChange={onMetadataFieldDefsChange}
            onTitleChange={onTitleChange}
            timerRunning={timerRunning}
            timerSceneKey={timerSceneKey}
            onStartTimer={onStartTimer}
            onStopTimer={onStopTimer}
            onOpenText={() => openText(panelScene.id)}
            onClose={closeMeta}
          />
          {textOpen && (
            <TextPanel
              scene={panelScene}
              draftHtml={draftContent[panelScene.id] || ''}
              onDraftChange={onDraftChange}
              onClose={closeText}
            />
          )}
        </>
      ) : (
        <nav className="ms-nav">
          <div className="ms-nav__top">
            <span className="ms-nav__title">Scenes</span>
          </div>
          <input
            type="text"
            className="ms-nav__filter"
            placeholder="Go to scene…"
            value={navFilter}
            onChange={e => setNavFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              const q = navFilter.trim().toLowerCase();
              if (!q) return;
              const match = flat.find(s => {
                const title = (cleanContent(s.content) || s.title || '').toLowerCase();
                return title.includes(q) || getCharacterName(s.characterId).toLowerCase().includes(q);
              });
              if (match) { enterFocus(match.id); setNavFilter(''); }
            }}
          />
          {groups.map(g => {
            const navQuery = navFilter.trim().toLowerCase();
            const visibleScenes = navQuery
              ? g.scenes.filter(s => {
                  const title = (cleanContent(s.content) || s.title || '').toLowerCase();
                  return title.includes(navQuery) || getCharacterName(s.characterId).toLowerCase().includes(navQuery);
                })
              : g.scenes;
            if (visibleScenes.length === 0) return null;
            return (
              <div key={g.key} className="ms-nav__group">
                {g.title !== null && <div className="ms-nav__chapter">{g.title}</div>}
                <ul className="ms-nav__list">
                  {visibleScenes.map(s => {
                    const gi = flatIndexById.get(s.id) ?? 0;
                    const outlined = (outlines[s.id] || '').trim().length > 0;
                    const title = cleanContent(s.content) || s.title || 'Untitled scene';
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`ms-nav__item${s.id === active ? ' is-active' : ''}${outlined ? '' : ' is-empty'}`}
                          style={{ '--pov': getCharacterHexColor(s.characterId) } as Record<string, string>}
                          onClick={() => enterFocus(s.id)}
                          title={title}
                        >
                          <span className="ms-nav__dot" />
                          <span className="ms-nav__num">{String(gi + 1).padStart(2, '0')}</span>
                          <span className="ms-nav__title-text">{title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
