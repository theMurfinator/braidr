import { useEffect, useRef, useState } from 'react';
import type { Scene, Chapter } from '../../shared/types';

interface OutlineViewProps {
  scenes: Scene[]; // braid order, already filtered
  chapters: Chapter[];
  outlines: Record<string, string>;
  getCharacterName: (characterId: string) => string;
  getCharacterHexColor: (characterId: string) => string;
  onOutlineChange: (sceneId: string, text: string) => void;
}

const TARGET_WORDS = 250;
const MAX_WORDS = 300;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

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
}

function Passage({ scene, number, characterName, accent, value, onChange, onWritingChange }: PassageProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);

  useEffect(() => {
    if (value !== latest.current) {
      latest.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (text !== value) onChange(scene.id, text);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); onChange(scene.id, latest.current); } }, []);

  const handleChange = (next: string) => {
    setText(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(scene.id, next), 600);
  };

  const words = countWords(text);
  const isEmpty = words === 0;

  return (
    <section className={`ms-passage${isEmpty ? ' is-empty' : ''}${focused ? ' is-focused' : ''}`}>
      <div className="ms-head">
        <span className="ms-slug">
          <span className="ms-slug__num">{String(number).padStart(2, '0')}</span>
          <span className="ms-slug__sep">|</span>
          <span className="ms-slug__pov" style={{ color: accent }}>{characterName}</span>
        </span>
        {scene.title && <h2 className="ms-title">{scene.title}</h2>}
      </div>
      <textarea
        ref={taRef}
        className="ms-body"
        value={text}
        rows={1}
        spellCheck
        placeholder="What happens here…"
        onFocus={() => { setFocused(true); onWritingChange?.(true); }}
        onBlur={() => { setFocused(false); flush(); onWritingChange?.(false); }}
        onChange={(e) => handleChange(e.target.value)}
      />
      <div className="ms-passage__count" aria-hidden={!focused}>
        {words > 0 && (
          <span className={words > MAX_WORDS ? 'over' : words > TARGET_WORDS ? 'near' : ''}>
            {words} {words === 1 ? 'word' : 'words'}
          </span>
        )}
      </div>
    </section>
  );
}

export default function OutlineView({ scenes, chapters, outlines, getCharacterName, getCharacterHexColor, onOutlineChange }: OutlineViewProps) {
  const [writing, setWriting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const armed = useRef(false);
  const restScroll = useRef(0);

  const groups = buildGroups(scenes, chapters);
  const flat = groups.flatMap(g => g.scenes);
  const flatIndexById = new Map(flat.map((s, i) => [s.id, i]));
  const active = focusedId ?? activeId ?? flat[0]?.id ?? null;

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
        if (top) setActiveId(top.target.getAttribute('data-scene-id'));
      },
      { root, rootMargin: '-12% 0px -70% 0px', threshold: 0 }
    );
    root.querySelectorAll('[data-scene-id]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [flat.length, focusedId]);

  // Focus a scene: it stays exactly where it is; the others just go transparent.
  // Scrolling then reveals them back proportional to how far you scroll.
  const REVEAL_PX = 600;
  const enterFocus = (id: string) => {
    armed.current = false;
    containerRef.current?.style.setProperty('--reveal', '0');
    setFocusedId(id);
    const el = mainRef.current?.querySelector(`[data-scene-id="${id}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const ta = el?.querySelector('textarea') as HTMLTextAreaElement | null;
    setTimeout(() => {
      ta?.focus({ preventScroll: true });
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
                    value={outlines[s.id] || ''}
                    onChange={onOutlineChange}
                    onWritingChange={setWriting}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <nav className="ms-nav">
        <div className="ms-nav__top">
          <span className="ms-nav__title">Scenes</span>
        </div>
        {groups.map(g => (
          <div key={g.key} className="ms-nav__group">
            {g.title !== null && <div className="ms-nav__chapter">{g.title}</div>}
            <ul className="ms-nav__list">
              {g.scenes.map(s => {
                const gi = flatIndexById.get(s.id) ?? 0;
                const outlined = (outlines[s.id] || '').trim().length > 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`ms-nav__item${s.id === active ? ' is-active' : ''}${outlined ? '' : ' is-empty'}`}
                      style={{ '--pov': getCharacterHexColor(s.characterId) } as Record<string, string>}
                      onClick={() => enterFocus(s.id)}
                      title={s.title || 'Untitled scene'}
                    >
                      <span className="ms-nav__dot" />
                      <span className="ms-nav__num">{String(gi + 1).padStart(2, '0')}</span>
                      <span className="ms-nav__title-text">{s.title || 'Untitled scene'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
