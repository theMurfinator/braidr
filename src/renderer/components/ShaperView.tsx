import { useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import type { Character, Scene, PlotPoint, ArcFieldDef } from '../../shared/types';
import {
  TENSION_SCALE_MAX,
  TENSION_FIELD_IDS,
  TENSION_FIELD_SEEDS,
  isShaperPlottable,
} from '../../shared/types';

// ── Series palette ───────────────────────────────────────────────────────────
// Fixed order, never cycled. The hues live in styles.css (--shaper-series-N)
// per design-system rule 1; a 9th plotted field is never given a generated hue,
// so the picker caps at eight.
const MAX_SERIES = 8;
const SERIES_VARS = Array.from({ length: MAX_SERIES }, (_, i) => `var(--shaper-series-${i + 1})`);
const FALLBACK_COLOR = 'var(--text-muted)';

// Below this many points a rolling mean is arithmetic, not a trend — it draws a
// near-flat line that reads like a finding. Suppress rather than mislead.
const MIN_POINTS_TO_SMOOTH = 12;

type LineMode = 'book' | 'pov';
type XMode = 'scene' | 'section';
type SmoothMode = 'raw' | 'both' | 'trend';

interface Point {
  scene: Scene;
  pov: string;
  povId: string;
  section: string;
  values: Record<string, number | null>;
}

interface GroupPoint {
  label: string;
  count: number;
  values: Record<string, number | null>;
}

interface Series {
  id: string;
  label: string;
  color: string;
  pts: { i: number; v: number | null }[];
}

export interface ShaperViewProps {
  characters: Character[];
  scenes: Scene[];
  plotPoints: PlotPoint[];
  characterColors: Record<string, string>;
  arcFieldDefs: ArcFieldDef[];
  arcFieldValues: Record<string, Record<string, string | string[]>>;
  onSaveArcFieldValues: (
    entityType: 'act' | 'section' | 'scene',
    entityId: string,
    values: Record<string, string | string[]>
  ) => void;
  onSaveArcFieldDefs: (defs: ArcFieldDef[]) => void;
  onGoToScene?: (sceneKey: string) => void;
}

// Centred rolling mean over scored points only. Returns null where the window
// holds too few real values to mean anything.
function rollingMean(pts: { i: number; v: number | null }[], win: number) {
  const half = Math.floor(win / 2);
  return pts.map((p, idx) => {
    const vals: number[] = [];
    for (let j = Math.max(0, idx - half); j <= Math.min(pts.length - 1, idx + half); j++) {
      const v = pts[j].v;
      if (v != null) vals.push(v);
    }
    return { i: p.i, v: vals.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
}

export default function ShaperView({
  characters,
  scenes,
  plotPoints,
  characterColors,
  arcFieldDefs,
  arcFieldValues,
  onSaveArcFieldValues,
  onSaveArcFieldDefs,
  onGoToScene,
}: ShaperViewProps) {
  const [povId, setPovId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [lineMode, setLineMode] = useState<LineMode>('book');
  const [xMode, setXMode] = useState<XMode>('scene');
  const [smooth, setSmooth] = useState<SmoothMode>('both');
  const [activeFieldIds, setActiveFieldIds] = useState<string[] | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; idx: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 400 });
  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: node.clientWidth, h: node.clientHeight });
    });
    ro.observe(node);
    setSize({ w: node.clientWidth, h: node.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── fields ─────────────────────────────────────────────────────────────────
  const plottable = useMemo(() => {
    const defs = arcFieldDefs.filter(isShaperPlottable);
    // built-in tension fields sort to the front, everything else keeps its order
    const rank = (d: ArcFieldDef) =>
      d.id === TENSION_FIELD_IDS.internal ? -2 : d.id === TENSION_FIELD_IDS.external ? -1 : d.order;
    return [...defs].sort((a, b) => rank(a) - rank(b));
  }, [arcFieldDefs]);

  const hasTensionFields = plottable.some(
    d => d.id === TENSION_FIELD_IDS.internal || d.id === TENSION_FIELD_IDS.external
  );

  // default selection: the two tension fields, else the first two plottable
  const activeFields = useMemo(() => {
    const chosen = activeFieldIds ?? plottable.slice(0, 2).map(d => d.id);
    return plottable.filter(d => chosen.includes(d.id)).slice(0, MAX_SERIES);
  }, [activeFieldIds, plottable]);

  const colorOf = useCallback(
    (fieldId: string) => SERIES_VARS[plottable.findIndex(d => d.id === fieldId) % MAX_SERIES],
    [plottable]
  );

  const addTensionFields = useCallback(() => {
    const maxOrder = arcFieldDefs.reduce((m, d) => Math.max(m, d.order), -1);
    const additions: ArcFieldDef[] = TENSION_FIELD_SEEDS
      .filter(seed => !arcFieldDefs.some(d => d.id === seed.id))
      .map((seed, i) => ({
        id: seed.id,
        label: seed.label,
        type: 'rating' as const,
        ratingMax: TENSION_SCALE_MAX,
        order: maxOrder + 1 + i,
        scope: 'arc' as const,
      }));
    if (!additions.length) return;
    onSaveArcFieldDefs([...arcFieldDefs.filter(d => (d.scope ?? 'arc') === 'arc'), ...additions]);
  }, [arcFieldDefs, onSaveArcFieldDefs]);

  // ── data ───────────────────────────────────────────────────────────────────
  const povName = useMemo(
    () => Object.fromEntries(characters.map(c => [c.id, c.name])),
    [characters]
  );
  const sectionTitle = useMemo(
    () => Object.fromEntries(plotPoints.map(p => [p.id, p.title])),
    [plotPoints]
  );

  const readValue = useCallback(
    (sceneId: string, fieldId: string): number | null => {
      const raw = arcFieldValues[`scene:${sceneId}`]?.[fieldId];
      if (raw == null || Array.isArray(raw) || raw === '') return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
    [arcFieldValues]
  );

  // Only braided scenes are ever plotted. A scene with no timeline position has
  // no place in reading order, so it does not appear in any scope.
  const points: Point[] = useMemo(() => {
    return scenes
      .filter(s => s.timelinePosition != null)
      .filter(s => !povId || s.characterId === povId)
      .filter(s => !sectionId || s.plotPointId === sectionId)
      .sort((a, b) => (a.timelinePosition as number) - (b.timelinePosition as number))
      .map(s => ({
        scene: s,
        pov: povName[s.characterId] ?? 'Unknown',
        povId: s.characterId,
        section: (s.plotPointId && sectionTitle[s.plotPointId]) || 'No section',
        values: Object.fromEntries(activeFields.map(f => [f.id, readValue(s.id, f.id)])),
      }));
  }, [scenes, povId, sectionId, povName, sectionTitle, activeFields, readValue]);

  // Section rollup: consecutive runs of the same section collapse to one mean.
  const groups: GroupPoint[] = useMemo(() => {
    const runs: { section: string; rows: Point[] }[] = [];
    for (const p of points) {
      const last = runs[runs.length - 1];
      if (last && last.section === p.section) last.rows.push(p);
      else runs.push({ section: p.section, rows: [p] });
    }
    return runs.map(run => ({
      label: run.section,
      count: run.rows.length,
      values: Object.fromEntries(
        activeFields.map(f => {
          const vals = run.rows.map(r => r.values[f.id]).filter((v): v is number => v != null);
          return [f.id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null];
        })
      ),
    }));
  }, [points, activeFields]);

  const sectionsForPov = useMemo(
    () => (povId ? plotPoints.filter(p => p.characterId === povId) : []),
    [plotPoints, povId]
  );
  const sceneCountInSection = useCallback(
    (ppId: string) =>
      scenes.filter(s => s.plotPointId === ppId && s.timelinePosition != null).length,
    [scenes]
  );

  // ── series ─────────────────────────────────────────────────────────────────
  const soloPov = !!povId;
  const usingGroups = xMode === 'section';
  const n = usingGroups ? groups.length : points.length;

  const series: Series[] = useMemo(() => {
    if (usingGroups || lineMode === 'book' || soloPov) {
      return activeFields.map(f => ({
        id: f.id,
        label: f.label,
        color: colorOf(f.id),
        pts: usingGroups
          ? groups.map((g, i) => ({ i, v: g.values[f.id] }))
          : points.map((p, i) => ({ i, v: p.values[f.id] })),
      }));
    }
    // One line per POV, showing a single field. Two different kinds of "no
    // value" must not look alike: a scene belonging to another POV is simply
    // not on this line (skip it, connect across), while this POV's own unscored
    // scene breaks the line.
    const field = activeFields[0];
    if (!field) return [];
    const ids = [...new Set(points.map(p => p.povId))];
    return ids.map(id => ({
      id,
      label: povName[id] ?? 'Unknown',
      color: characterColors[id] || FALLBACK_COLOR,
      pts: points
        .map((p, i) => ({ i, v: p.values[field.id], owner: p.povId }))
        .filter(x => x.owner === id)
        .map(({ i, v }) => ({ i, v })),
    }));
  }, [usingGroups, lineMode, soloPov, activeFields, groups, points, colorOf, povName, characterColors]);

  // ── geometry ───────────────────────────────────────────────────────────────
  const W = Math.max(320, size.w);
  const H = Math.max(260, Math.min(size.h, 470));
  const M = { t: 16, r: 20, b: usingGroups ? 46 : 74, l: 40 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const X = (i: number) => M.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v: number) => M.t + ih - ((v - 1) / (TENSION_SCALE_MAX - 1)) * ih;

  const enoughToSmooth = n >= MIN_POINTS_TO_SMOOTH;
  const showTrend = smooth !== 'raw' && !usingGroups && enoughToSmooth;
  const showRaw = smooth !== 'trend' || !showTrend;
  const win = Math.max(3, (Math.min(7, Math.round(n / 7)) | 1));

  const pathFor = (pts: { i: number; v: number | null }[]) => {
    let d = '';
    let pen = false;
    for (const p of pts) {
      if (p.v == null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)} `;
      pen = true;
    }
    return d;
  };

  const selectedScene = selectedSceneId ? scenes.find(s => s.id === selectedSceneId) ?? null : null;
  const selectedIdx = selectedSceneId ? points.findIndex(p => p.scene.id === selectedSceneId) : -1;

  const setScore = (sceneId: string, fieldId: string, value: number | null) => {
    const existing = arcFieldValues[`scene:${sceneId}`] ?? {};
    const next = { ...existing };
    if (value == null) delete next[fieldId];
    else next[fieldId] = String(value);
    onSaveArcFieldValues('scene', sceneId, next);
  };

  // ── empty states ───────────────────────────────────────────────────────────
  if (!plottable.length) {
    return (
      <div className="shaper-empty">
        <h2>Nothing to plot yet</h2>
        <p>
          The Shaper draws 1&ndash;{TENSION_SCALE_MAX} rating fields. Add the two built-in tension
          fields and every scene, section and act gets a place to score them.
        </p>
        <button className="shaper-primary-btn" onClick={addTensionFields}>
          Add tension fields
        </button>
      </div>
    );
  }

  const braidedCount = scenes.filter(s => s.timelinePosition != null).length;
  if (!braidedCount) {
    return (
      <div className="shaper-empty">
        <h2>No braided scenes</h2>
        <p>
          The Shaper plots scenes in braided reading order. None of your scenes have a position
          on the braid yet, so there is no shape to draw. Braid some scenes and come back.
        </p>
      </div>
    );
  }

  const hoveredPoint = hover ? (usingGroups ? groups[hover.idx] : points[hover.idx]) : null;

  return (
    <div className="shaper-root">
      <header className="shaper-hdr">
        <div className="shaper-hdr-top">
          <h1>Shaper</h1>
          <span className="shaper-crumb">
            {povId ? povName[povId] : 'Whole story'}
            {sectionId ? ` · ${sectionTitle[sectionId]}` : ''}
          </span>
        </div>

        <div className="shaper-controls">
          <div className="shaper-ctl">
            <label htmlFor="shaper-pov">POV</label>
            <select
              id="shaper-pov"
              value={povId}
              onChange={e => { setPovId(e.target.value); setSectionId(''); setSelectedSceneId(null); }}
            >
              <option value="">All POVs</option>
              {characters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="shaper-ctl">
            <label htmlFor="shaper-sec">Section</label>
            <select
              id="shaper-sec"
              value={sectionId}
              disabled={!povId}
              title={povId ? '' : 'Sections belong to a POV — pick one first'}
              onChange={e => { setSectionId(e.target.value); setSelectedSceneId(null); }}
            >
              <option value="">All sections</option>
              {sectionsForPov.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title} ({sceneCountInSection(p.id)})
                </option>
              ))}
            </select>
          </div>

          <div className="shaper-ctl">
            <span className="shaper-ctl-label">Lines</span>
            <div className="shaper-seg">
              <button
                className={lineMode === 'book' ? 'on' : ''}
                disabled={soloPov}
                onClick={() => setLineMode('book')}
              >
                One line for book
              </button>
              <button
                className={lineMode === 'pov' && !soloPov ? 'on' : ''}
                disabled={soloPov}
                title={soloPov ? 'Nothing to separate inside a single POV' : ''}
                onClick={() => setLineMode('pov')}
              >
                One line per POV
              </button>
            </div>
          </div>

          <div className="shaper-ctl">
            <span className="shaper-ctl-label">X axis</span>
            <div className="shaper-seg">
              <button className={xMode === 'scene' ? 'on' : ''} onClick={() => setXMode('scene')}>Scene</button>
              <button className={xMode === 'section' ? 'on' : ''} onClick={() => setXMode('section')}>Section</button>
            </div>
          </div>

          <div className="shaper-ctl">
            <span className="shaper-ctl-label">Line</span>
            <div className="shaper-seg">
              <button className={smooth === 'raw' ? 'on' : ''} onClick={() => setSmooth('raw')}>Raw</button>
              <button className={smooth === 'both' ? 'on' : ''} onClick={() => setSmooth('both')}>Raw + trend</button>
              <button className={smooth === 'trend' ? 'on' : ''} onClick={() => setSmooth('trend')}>Trend only</button>
            </div>
          </div>
        </div>

        <div className="shaper-series-picker">
          {plottable.map(f => {
            const on = activeFields.some(a => a.id === f.id);
            return (
              <button
                key={f.id}
                className={`shaper-chip${on ? '' : ' off'}`}
                onClick={() => {
                  const current = activeFields.map(a => a.id);
                  if (on && current.length === 1) return; // never zero series
                  const next = on ? current.filter(id => id !== f.id) : [...current, f.id];
                  setActiveFieldIds(next.slice(0, MAX_SERIES));
                }}
              >
                <span className="shaper-swatch" style={{ background: on ? colorOf(f.id) : 'transparent', boxShadow: on ? undefined : 'inset 0 0 0 1.5px currentColor' }} />
                {f.label}
              </button>
            );
          })}
          {!hasTensionFields && (
            <button className="shaper-link-btn" onClick={addTensionFields}>+ add tension fields</button>
          )}
        </div>
      </header>

      <div className="shaper-body">
        <div className="shaper-chart-wrap" ref={wrapRef}>
          <svg
            className="shaper-chart"
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            role="img"
            aria-label={`Tension across ${n} ${usingGroups ? 'sections' : 'scenes'} in braided reading order`}
          >
            {/* POV ribbon (story scope) — sections belong to a POV, so they do not
                form contiguous bands once the braid interleaves them. */}
            {!usingGroups && !soloPov && points.map((p, i) => {
              const step = n > 1 ? iw / (n - 1) : iw;
              return (
                <rect
                  key={p.scene.id}
                  x={X(i) - step / 2}
                  y={M.t + ih + 9}
                  width={Math.max(1.5, step - 1.5)}
                  height={11}
                  rx={1.5}
                  style={{ fill: characterColors[p.povId] || FALLBACK_COLOR }}
                />
              );
            })}
            {!usingGroups && !soloPov && (
              <>
                <text x={M.l} y={M.t + ih + 36} className="shaper-ax-title">POV</text>
                {[...new Set(points.map(p => p.povId))].map((id, i, all) => {
                  const x = M.l + 30 + all.slice(0, i).reduce((acc, pid) => acc + 22 + (povName[pid] ?? '').length * 5.6, 0);
                  return (
                    <g key={id}>
                      <rect x={x} y={M.t + ih + 29} width={9} height={9} rx={1.5} style={{ fill: characterColors[id] || FALLBACK_COLOR }} />
                      <text x={x + 13} y={M.t + ih + 37} className="shaper-pov-tick">{povName[id]}</text>
                    </g>
                  );
                })}
              </>
            )}

            {/* Section bands (single-POV scope, where runs really are contiguous) */}
            {!usingGroups && soloPov && (() => {
              const bands: { from: number; to: number; label: string }[] = [];
              points.forEach((p, i) => {
                const last = bands[bands.length - 1];
                if (last && last.label === p.section) last.to = i;
                else bands.push({ from: i, to: i, label: p.section });
              });
              const step = n > 1 ? iw / (n - 1) : iw;
              return (
                <>
                  {bands.map((b, bi) => {
                    const x0 = X(b.from) - step / 2;
                    const x1 = X(b.to) + step / 2;
                    const wpx = x1 - x0;
                    const fits = Math.floor(wpx / 5.4) - 1;
                    const label = wpx < 26 ? '' : b.label.length > fits ? `${b.label.slice(0, Math.max(1, fits))}…` : b.label;
                    return (
                      <g key={`${b.label}-${bi}`}>
                        <rect x={x0} y={M.t + ih + 8} width={Math.max(1, wpx)} height={17} rx={2}
                          className={`shaper-band${bi % 2 ? ' alt' : ''}`} />
                        <text x={(x0 + x1) / 2} y={M.t + ih + 20} className="shaper-band-txt" textAnchor="middle">{label}</text>
                      </g>
                    );
                  })}
                  <text x={M.l} y={H - 24} className="shaper-ax-title">SECTION</text>
                </>
              );
            })()}

            {/* grid + y ticks */}
            {[1, 4, 7, 10].map(v => (
              <g key={v}>
                <line x1={M.l} x2={M.l + iw} y1={Y(v)} y2={Y(v)} className="shaper-grid" />
                <text x={M.l - 8} y={Y(v) + 3.5} className="shaper-tick" textAnchor="end">{v}</text>
              </g>
            ))}
            <line x1={M.l} x2={M.l + iw} y1={Y(1)} y2={Y(1)} className="shaper-axis" />

            {selectedIdx >= 0 && !usingGroups && (
              <line x1={X(selectedIdx)} x2={X(selectedIdx)} y1={M.t} y2={M.t + ih} className="shaper-sel-line" />
            )}
            {hover && (
              <line x1={X(hover.idx)} x2={X(hover.idx)} y1={M.t} y2={M.t + ih} className="shaper-crosshair" />
            )}

            {/* series */}
            {series.map(s => (
              <g key={s.id}>
                {showRaw && (
                  <>
                    <path
                      d={pathFor(s.pts)}
                      className="shaper-path"
                      style={{ stroke: s.color }}
                      strokeWidth={showTrend ? 1.25 : 2}
                      opacity={showTrend ? 0.34 : 1}
                    />
                    {s.pts.map(p => p.v == null ? null : (
                      <circle
                        key={p.i}
                        cx={X(p.i)}
                        cy={Y(p.v)}
                        r={showTrend ? 2.6 : 4}
                        style={{ fill: s.color }}
                        className="shaper-pt"
                        strokeWidth={showTrend ? 1.2 : 2}
                        opacity={showTrend ? 0.5 : 1}
                      />
                    ))}
                  </>
                )}
                {showTrend && (
                  <path d={pathFor(rollingMean(s.pts, win))} className="shaper-path" style={{ stroke: s.color }} strokeWidth={2.5} />
                )}
              </g>
            ))}

            {/* hit areas */}
            {Array.from({ length: n }, (_, i) => {
              const step = n > 1 ? iw / (n - 1) : iw;
              return (
                <rect
                  key={i}
                  x={X(i) - step / 2}
                  y={M.t}
                  width={step}
                  height={ih}
                  fill="transparent"
                  className="shaper-hit"
                  onMouseMove={e => setHover({ x: e.clientX, y: e.clientY, idx: i })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => { if (!usingGroups) setSelectedSceneId(points[i].scene.id); }}
                />
              );
            })}
          </svg>

          <div className="shaper-legend-note">
            {usingGroups
              ? `${groups.length} sections · each point is the mean of its scenes`
              : `${n} scenes in braided reading order · ${points.filter(p => activeFields.every(f => p.values[f.id] == null)).length} unscored (line breaks) · y axis fixed 1–${TENSION_SCALE_MAX}`}
            {lineMode === 'pov' && !soloPov && !usingGroups && activeFields.length > 1
              ? ` · per-POV lines show one field at a time (${activeFields[0].label})`
              : ''}
          </div>
        </div>

        {selectedScene && (
          <aside className="shaper-panel">
            <div className="shaper-panel-hd">
              <div className="shaper-panel-eyebrow">
                <span className="shaper-swatch" style={{ background: characterColors[selectedScene.characterId] || FALLBACK_COLOR }} />
                {povName[selectedScene.characterId]} · scene {selectedScene.timelinePosition}
              </div>
              <h2>{selectedScene.title || 'Untitled scene'}</h2>
              <div className="shaper-panel-crumb">
                {(selectedScene.plotPointId && sectionTitle[selectedScene.plotPointId]) || 'No section'}
              </div>
            </div>

            <div className="shaper-panel-bd">
              <div className="shaper-panel-nav">
                <button
                  disabled={selectedIdx <= 0}
                  onClick={() => setSelectedSceneId(points[selectedIdx - 1].scene.id)}
                >← Prev scene</button>
                <button
                  disabled={selectedIdx < 0 || selectedIdx >= points.length - 1}
                  onClick={() => setSelectedSceneId(points[selectedIdx + 1].scene.id)}
                >Next scene →</button>
              </div>

              {activeFields.map(f => {
                const v = readValue(selectedScene.id, f.id);
                return (
                  <div className="shaper-fld" key={f.id}>
                    <div className="shaper-fld-hd">
                      <span className="shaper-swatch" style={{ background: colorOf(f.id) }} />
                      <span className="shaper-fld-name">{f.label}</span>
                      <span className={`shaper-fld-num${v == null ? ' empty' : ''}`}>{v == null ? 'unscored' : v}</span>
                    </div>
                    <div className="shaper-steps">
                      {Array.from({ length: TENSION_SCALE_MAX }, (_, i) => i + 1).map(step => (
                        <button
                          key={step}
                          className={v === step ? 'on' : ''}
                          style={v === step ? { background: colorOf(f.id), borderColor: colorOf(f.id) } : undefined}
                          onClick={() => setScore(selectedScene.id, f.id, v === step ? null : step)}
                        >{step}</button>
                      ))}
                    </div>
                    {v != null && (
                      <button className="shaper-clr" onClick={() => setScore(selectedScene.id, f.id, null)}>clear</button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="shaper-panel-ft">
              {onGoToScene && (
                <button className="shaper-link-btn" onClick={() => onGoToScene(`${selectedScene.characterId}:${selectedScene.sceneNumber}`)}>Open in editor</button>
              )}
              <button className="shaper-link-btn" onClick={() => setSelectedSceneId(null)}>Close</button>
            </div>
          </aside>
        )}

        {!selectedScene && (
          <aside className="shaper-panel shaper-panel-empty">
            Click any point on the line to score that scene without leaving this screen.
          </aside>
        )}
      </div>

      {hover && hoveredPoint && (
        <div
          className="shaper-tip"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 275),
            top: Math.max(8, hover.y - 20),
          }}
        >
          <div className="shaper-tip-title">
            {usingGroups ? (hoveredPoint as GroupPoint).label : (hoveredPoint as Point).scene.title || 'Untitled scene'}
          </div>
          <div className="shaper-tip-meta">
            {usingGroups
              ? `${(hoveredPoint as GroupPoint).count} scenes`
              : `${(hoveredPoint as Point).pov} · ${(hoveredPoint as Point).section} · #${(hoveredPoint as Point).scene.timelinePosition}`}
          </div>
          {activeFields.some(f => hoveredPoint.values[f.id] != null) ? (
            activeFields.map(f => {
              const v = hoveredPoint.values[f.id];
              if (v == null) return null;
              return (
                <div className="shaper-tip-row" key={f.id}>
                  <span className="shaper-swatch" style={{ background: colorOf(f.id) }} />
                  {f.label}
                  <span className="shaper-tip-val">{usingGroups ? v.toFixed(1) : v}</span>
                </div>
              );
            })
          ) : (
            <div className="shaper-tip-none">Not scored yet — line breaks here</div>
          )}
        </div>
      )}
    </div>
  );
}
