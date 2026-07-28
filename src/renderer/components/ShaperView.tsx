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
type CurveMode = 'straight' | 'smooth';

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

type Pt = { x: number; y: number };

function straightRun(r: Pt[]): string {
  if (!r.length) return '';
  return `M${r.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}`;
}

// Monotone cubic (Fritsch-Carlson), NOT a plain cardinal spline. On a hard 1-10
// axis a cardinal spline overshoots past a peak — a run of 9,10,9 would bulge
// above 10 and draw tension the writer never scored. Monotone interpolation is
// the version that cannot overshoot its own data points.
function smoothRun(r: Pt[]): string {
  const nPts = r.length;
  if (nPts < 3) return straightRun(r);

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < nPts - 1; i++) {
    dx.push(r[i + 1].x - r[i].x);
    slope.push((r[i + 1].y - r[i].y) / (r[i + 1].x - r[i].x));
  }

  const m: number[] = new Array(nPts);
  m[0] = slope[0];
  m[nPts - 1] = slope[nPts - 2];
  for (let i = 1; i < nPts - 1; i++) {
    // a local extremum gets a flat tangent, which is what kills the overshoot
    if (slope[i - 1] * slope[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }

  let d = `M${r[0].x.toFixed(1)},${r[0].y.toFixed(1)}`;
  for (let i = 0; i < nPts - 1; i++) {
    const t = dx[i] / 3;
    d += `C${(r[i].x + t).toFixed(1)},${(r[i].y + m[i] * t).toFixed(1)}` +
         ` ${(r[i + 1].x - t).toFixed(1)},${(r[i + 1].y - m[i + 1] * t).toFixed(1)}` +
         ` ${r[i + 1].x.toFixed(1)},${r[i + 1].y.toFixed(1)}`;
  }
  return d;
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
  const [curve, setCurve] = useState<CurveMode>('straight');
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
  // Cap the aspect as well as the width. A line chart that fills a tall window
  // stretches the y axis and turns ordinary scene-to-scene variation into cliffs;
  // the shape should read the same on a laptop and a 32" monitor.
  const H = Math.max(300, Math.min(size.h, Math.round(W * 0.58)));
  // Bottom band stacks under the plot: scene strip, then the POV ribbon (story
  // scope) or section bands (single-POV scope), then the axis caption.
  const SCENE_STRIP_Y = 8;
  const SCENE_STRIP_H = 14;
  // Scene titles run at 45°, so their width is bounded by the height we give
  // them rather than by pill width. Horizontal labels truncate to ~8 characters
  // at 24 scenes, which cuts exactly the half of a title that distinguishes it.
  const LABEL_ANGLE = 45;
  const LABEL_MAX_CHARS = 22;
  // whole-story scope draws no scene labels, so it reserves no band for them
  const showSceneLabels = !usingGroups && (soloPov || !!sectionId);
  const LABEL_BAND = showSceneLabels ? 84 : 0;
  const LABEL_Y = SCENE_STRIP_Y + SCENE_STRIP_H + 6;
  const ROW2_Y = LABEL_Y + LABEL_BAND + 4;
  // story scope now needs only a legend row under the strip; single-POV scope
  // still stacks section bands beneath it
  const M = { t: 16, r: 20, b: usingGroups ? 46 : ROW2_Y + (soloPov ? 40 : 16), l: 40 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const X = (i: number) => M.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v: number) => M.t + ih - ((v - 1) / (TENSION_SCALE_MAX - 1)) * ih;

  const enoughToSmooth = n >= MIN_POINTS_TO_SMOOTH;
  const showTrend = smooth !== 'raw' && !usingGroups && enoughToSmooth;
  const showRaw = smooth !== 'trend' || !showTrend;
  const win = Math.max(3, (Math.min(7, Math.round(n / 7)) | 1));

  const pathFor = (pts: { i: number; v: number | null }[]) => {
    // Split into contiguous scored runs; a null is a real break in the line.
    const runs: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    for (const p of pts) {
      if (p.v == null) { if (run.length) runs.push(run); run = []; continue; }
      run.push({ x: X(p.i), y: Y(p.v) });
    }
    if (run.length) runs.push(run);

    return runs.map(r => (curve === 'smooth' ? smoothRun(r) : straightRun(r))).join(' ');
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

          <div className="shaper-ctl">
            <span className="shaper-ctl-label">Shape</span>
            <div className="shaper-seg">
              <button className={curve === 'straight' ? 'on' : ''} onClick={() => setCurve('straight')}>Straight</button>
              <button className={curve === 'smooth' ? 'on' : ''} onClick={() => setCurve('smooth')}>Smooth</button>
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
        <div className="shaper-chart-wrap">
          <div className="shaper-chart-area" ref={wrapRef}>
          <svg
            className="shaper-chart"
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            role="img"
            aria-label={`Tension across ${n} ${usingGroups ? 'sections' : 'scenes'} in braided reading order`}
          >
            {/* Scene strip — one pill per scene, coloured by POV. This carries the
                scene progression AND the braid rhythm in a single row; a separate
                POV ribbon underneath was the same information stacked twice.
                Pills butt together inside a POV run and gap at each switch, so
                the chunking ("three Noahs, one Maya") reads without counting. */}
            {!usingGroups && (() => {
              const step = n > 1 ? iw / (n - 1) : iw;
              const RUN_GAP = Math.min(5, Math.max(2, step * 0.28));
              const INNER_GAP = step > 14 ? 1 : 0.5;

              return points.map((p, i) => {
                const scored = activeFields.some(f => p.values[f.id] != null);
                const selected = p.scene.id === selectedSceneId;
                const startsRun = i === 0 || points[i - 1].povId !== p.povId;
                const endsRun = i === points.length - 1 || points[i + 1].povId !== p.povId;

                const leftGap = (startsRun ? RUN_GAP : INNER_GAP) / 2;
                const rightGap = (endsRun ? RUN_GAP : INNER_GAP) / 2;
                const x0 = X(i) - step / 2 + leftGap;
                const pillW = Math.max(1.5, step - leftGap - rightGap);

                const povColor = characterColors[p.povId] || FALLBACK_COLOR;
                return (
                  <g key={`strip-${p.scene.id}`}>
                    <rect
                      x={x0}
                      y={M.t + ih + SCENE_STRIP_Y}
                      width={pillW}
                      height={SCENE_STRIP_H}
                      rx={startsRun || endsRun ? 3 : 1}
                      className={`shaper-scene-pill${selected ? ' selected' : ''}${scored ? ' scored' : ''}`}
                      style={selected ? undefined : { fill: povColor, fillOpacity: scored ? 1 : 0.28 }}
                      onMouseMove={e => setHover({ x: e.clientX, y: e.clientY, idx: i })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setSelectedSceneId(p.scene.id)}
                    />
                  </g>
                );
              });
            })()}

            {/* Scene titles at 45°, POV/Section scope only. On whole-story scope
                there are 100+ scenes at ~12px each: no label survives that, and
                anything written along the bottom competes with the line for
                attention. Identifying a single scene there is what hover is for;
                reading the shape is what that view is actually for. */}
            {showSceneLabels && (() => {
              const step = n > 1 ? iw / (n - 1) : iw;
              // at 45° the perpendicular gap between baselines is step / sqrt(2)
              const every = step / Math.SQRT2 >= 11 ? 1 : Math.ceil(11 / (step / Math.SQRT2));
              return points.map((p, i) => {
                if (i % every !== 0 && p.scene.id !== selectedSceneId) return null;
                const selected = p.scene.id === selectedSceneId;
                const raw = p.scene.title || `Scene ${p.scene.timelinePosition ?? ''}`;
                const label = raw.length > LABEL_MAX_CHARS
                  ? `${raw.slice(0, LABEL_MAX_CHARS - 1)}…`
                  : raw;
                const lx = X(i);
                const ly = M.t + ih + LABEL_Y;
                return (
                  <text
                    key={`lbl-${p.scene.id}`}
                    x={lx}
                    y={ly}
                    transform={`rotate(-${LABEL_ANGLE} ${lx} ${ly})`}
                    textAnchor="end"
                    className={`shaper-scene-label${selected ? ' selected' : ''}`}
                    onMouseMove={e => setHover({ x: e.clientX, y: e.clientY, idx: i })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSelectedSceneId(p.scene.id)}
                  >{label}</text>
                );
              });
            })()}

            {/* POV legend — the strip above is now the ribbon, so this is just the key */}
            {!usingGroups && !soloPov && (
              <>
                <text x={M.l} y={M.t + ih + ROW2_Y + 8} className="shaper-ax-title">POV</text>
                {[...new Set(points.map(p => p.povId))].map((id, i, all) => {
                  const x = M.l + 30 + all.slice(0, i).reduce((acc, pid) => acc + 22 + (povName[pid] ?? '').length * 5.6, 0);
                  return (
                    <g key={id}>
                      <rect x={x} y={M.t + ih + ROW2_Y} width={9} height={9} rx={1.5} style={{ fill: characterColors[id] || FALLBACK_COLOR }} />
                      <text x={x + 13} y={M.t + ih + ROW2_Y + 8} className="shaper-pov-tick">{povName[id]}</text>
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
                        <rect x={x0} y={M.t + ih + ROW2_Y} width={Math.max(1, wpx)} height={17} rx={2}
                          className={`shaper-band${bi % 2 ? ' alt' : ''}`} />
                        <text x={(x0 + x1) / 2} y={M.t + ih + ROW2_Y + 12} className="shaper-band-txt" textAnchor="middle">{label}</text>
                      </g>
                    );
                  })}
                  <text x={M.l} y={M.t + ih + ROW2_Y + 30} className="shaper-ax-title">SECTION</text>
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
          </div>

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
