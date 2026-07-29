import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SHAPER_VIEW_DEFAULTS, normalizeShaperViewConfig } from '../shared/types';
import type { ShaperViewConfig } from '../shared/types';

async function freshDb(dir: string) {
  const mod = await import('../main/database');
  return new mod.BraidrDB(path.join(dir, 'shaper-views.braidr'));
}

const view = (over: Partial<ShaperViewConfig> = {}): ShaperViewConfig => ({
  id: 'view-1',
  name: "Noah's build",
  isDefault: false,
  povId: 'c20l9k',
  sectionId: '',
  lineMode: 'pov',
  xMode: 'scene',
  smooth: 'trend',
  curve: 'smooth',
  activeFieldIds: ['builtin-internal-tension'],
  createdAt: 1_700_000_000_000,
  ...over,
});

describe('Shaper saved views', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaper-views-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips a saved view through the database', async () => {
    const db = await freshDb(dir);
    db.replaceShaperViews([view()]);

    const rows = db.getShaperViews();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Noah's build");

    const cfg = normalizeShaperViewConfig(JSON.parse(rows[0].config_json));
    expect(cfg.povId).toBe('c20l9k');
    expect(cfg.lineMode).toBe('pov');
    expect(cfg.smooth).toBe('trend');
    expect(cfg.curve).toBe('smooth');
    expect(cfg.activeFieldIds).toEqual(['builtin-internal-tension']);
  });

  it('replacing views removes ones no longer in the list', async () => {
    const db = await freshDb(dir);
    db.replaceShaperViews([view({ id: 'a', name: 'A' }), view({ id: 'b', name: 'B' })]);
    db.replaceShaperViews([view({ id: 'b', name: 'B' })]);

    const rows = db.getShaperViews();
    expect(rows.map(r => r.id)).toEqual(['b']);
  });

  it('returns views in creation order', async () => {
    const db = await freshDb(dir);
    db.replaceShaperViews([
      view({ id: 'second', createdAt: 2000 }),
      view({ id: 'first', createdAt: 1000 }),
    ]);

    expect(db.getShaperViews().map(r => r.id)).toEqual(['first', 'second']);
  });

  // A saved view written before a new control existed must still load. Without
  // this, every control added to the Shaper silently breaks every saved view.
  it('fills defaults for fields a previously-saved view does not have', () => {
    const cfg = normalizeShaperViewConfig({ povId: 'c20l9k' });

    expect(cfg.povId).toBe('c20l9k');
    expect(cfg.lineMode).toBe(SHAPER_VIEW_DEFAULTS.lineMode);
    expect(cfg.xMode).toBe(SHAPER_VIEW_DEFAULTS.xMode);
    expect(cfg.smooth).toBe(SHAPER_VIEW_DEFAULTS.smooth);
    expect(cfg.curve).toBe(SHAPER_VIEW_DEFAULTS.curve);
    expect(cfg.activeFieldIds).toBeNull();
  });

  it('falls back to defaults when a stored value is not a legal option', () => {
    const cfg = normalizeShaperViewConfig({
      lineMode: 'sideways',
      xMode: 42,
      smooth: null,
      curve: 'wobbly',
    });

    expect(cfg.lineMode).toBe(SHAPER_VIEW_DEFAULTS.lineMode);
    expect(cfg.xMode).toBe(SHAPER_VIEW_DEFAULTS.xMode);
    expect(cfg.smooth).toBe(SHAPER_VIEW_DEFAULTS.smooth);
    expect(cfg.curve).toBe(SHAPER_VIEW_DEFAULTS.curve);
  });

  it('survives a config that is not an object at all', () => {
    expect(normalizeShaperViewConfig(null).lineMode).toBe(SHAPER_VIEW_DEFAULTS.lineMode);
    expect(normalizeShaperViewConfig('garbage').xMode).toBe(SHAPER_VIEW_DEFAULTS.xMode);
  });

  it('keeps only string entries in activeFieldIds', () => {
    const cfg = normalizeShaperViewConfig({ activeFieldIds: ['a', 7, null, 'b'] });
    expect(cfg.activeFieldIds).toEqual(['a', 'b']);
  });
});
