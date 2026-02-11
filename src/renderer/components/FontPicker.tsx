import { useState, useEffect } from 'react';
import { FontSettings, AllFontSettings, ScreenKey } from '../../shared/types';

interface FontPickerProps {
  allFontSettings: AllFontSettings;
  onFontSettingsChange: (settings: AllFontSettings) => void;
  contentPadding: number;
  onContentPaddingChange: (value: number) => void;
  onClose: () => void;
}

const AVAILABLE_FONTS = [
  { name: 'Lora', value: "'Lora', Georgia, serif" },
  { name: 'PT Serif', value: "'PT Serif', Georgia, serif" },
  { name: 'Merriweather', value: "'Merriweather', Georgia, serif" },
  { name: 'Crimson Text', value: "'Crimson Text', Georgia, serif" },
  { name: 'Source Serif 4', value: "'Source Serif 4', Georgia, serif" },
  { name: 'Libre Baskerville', value: "'Libre Baskerville', Georgia, serif" },
  { name: 'EB Garamond', value: "'EB Garamond', Georgia, serif" },
  { name: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { name: 'Bitter', value: "'Bitter', Georgia, serif" },
  { name: 'Alegreya', value: "'Alegreya', Georgia, serif" },
  { name: 'Cormorant Garamond', value: "'Cormorant Garamond', Georgia, serif" },
  { name: 'Spectral', value: "'Spectral', Georgia, serif" },
  { name: 'Georgia', value: "Georgia, serif" },
  { name: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { name: 'System Sans', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32];

const DEFAULT_FONT = "'Lora', Georgia, serif";
const DEFAULT_SECTION_SIZE = 18;
const DEFAULT_SCENE_SIZE = 15;
const DEFAULT_BODY_SIZE = 14;

type TabKey = 'global' | ScreenKey;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'global', label: 'All Screens' },
  { key: 'pov', label: 'Outline' },
  { key: 'braided', label: 'Timeline' },
  { key: 'editor', label: 'Editor' },
  { key: 'notes', label: 'Notes' },
];

// Helper to get the resolved value for a field (screen override or global fallback)
function getResolved(all: AllFontSettings, tab: TabKey, field: keyof FontSettings): string | number | undefined {
  if (tab === 'global') {
    return all.global[field];
  }
  const screenVal = all.screens?.[tab]?.[field];
  if (screenVal !== undefined) return screenVal;
  return all.global[field];
}

// Check if a screen field is overridden (not just inherited from global)
function isOverridden(all: AllFontSettings, tab: TabKey, field: keyof FontSettings): boolean {
  if (tab === 'global') return false;
  return all.screens?.[tab]?.[field] !== undefined;
}

function FontPicker({ allFontSettings, onFontSettingsChange, contentPadding, onContentPaddingChange, onClose }: FontPickerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('global');
  const [localSettings, setLocalSettings] = useState<AllFontSettings>(allFontSettings);

  useEffect(() => {
    setLocalSettings(allFontSettings);
  }, [allFontSettings]);

  // Get the effective values for the current tab
  const sectionTitle = (getResolved(localSettings, activeTab, 'sectionTitle') as string) || DEFAULT_FONT;
  const sectionTitleSize = (getResolved(localSettings, activeTab, 'sectionTitleSize') as number) || DEFAULT_SECTION_SIZE;
  const sceneTitle = (getResolved(localSettings, activeTab, 'sceneTitle') as string) || DEFAULT_FONT;
  const sceneTitleSize = (getResolved(localSettings, activeTab, 'sceneTitleSize') as number) || DEFAULT_SCENE_SIZE;
  const body = (getResolved(localSettings, activeTab, 'body') as string) || DEFAULT_FONT;
  const bodySize = (getResolved(localSettings, activeTab, 'bodySize') as number) || DEFAULT_BODY_SIZE;

  // Update a field — on 'global' tab updates global, on screen tabs updates screen override
  const updateField = (field: keyof FontSettings, value: string | number) => {
    setLocalSettings(prev => {
      if (activeTab === 'global') {
        return { ...prev, global: { ...prev.global, [field]: value } };
      }
      const screens = { ...prev.screens };
      screens[activeTab] = { ...(screens[activeTab] || {}), [field]: value };
      return { ...prev, screens };
    });
  };

  // Reset a single field to inherit from global (only on screen tabs)
  const resetField = (field: keyof FontSettings) => {
    if (activeTab === 'global') return;
    setLocalSettings(prev => {
      const screens = { ...prev.screens };
      const screenSettings = { ...(screens[activeTab] || {}) };
      delete screenSettings[field];
      // If screen has no overrides left, remove it entirely
      if (Object.keys(screenSettings).length === 0) {
        delete screens[activeTab];
      } else {
        screens[activeTab] = screenSettings;
      }
      return { ...prev, screens };
    });
  };

  const handleSave = () => {
    onFontSettingsChange(localSettings);
    onClose();
  };

  const handleReset = () => {
    if (activeTab === 'global') {
      setLocalSettings(prev => ({
        ...prev,
        global: {
          sectionTitle: DEFAULT_FONT,
          sectionTitleSize: DEFAULT_SECTION_SIZE,
          sceneTitle: DEFAULT_FONT,
          sceneTitleSize: DEFAULT_SCENE_SIZE,
          body: DEFAULT_FONT,
          bodySize: DEFAULT_BODY_SIZE,
        },
      }));
    } else {
      // Clear all overrides for this screen
      setLocalSettings(prev => {
        const screens = { ...prev.screens };
        delete screens[activeTab];
        return { ...prev, screens };
      });
    }
  };

  const sectionTitleOverridden = isOverridden(localSettings, activeTab, 'sectionTitle') || isOverridden(localSettings, activeTab, 'sectionTitleSize');
  const sceneTitleOverridden = isOverridden(localSettings, activeTab, 'sceneTitle') || isOverridden(localSettings, activeTab, 'sceneTitleSize');
  const bodyOverridden = isOverridden(localSettings, activeTab, 'body') || isOverridden(localSettings, activeTab, 'bodySize');
  const isScreenTab = activeTab !== 'global';

  return (
    <div className="font-picker-overlay" onClick={onClose}>
      <div className="font-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="font-picker-header">
          <h2>Font Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="font-picker-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`font-picker-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="font-picker-content">
          <div className="font-setting">
            <div className="font-setting-header">
              <label>Section Titles</label>
              {isScreenTab && (
                sectionTitleOverridden
                  ? <button className="font-setting-reset-link" onClick={() => { resetField('sectionTitle'); resetField('sectionTitleSize'); }}>Reset to global</button>
                  : <span className="font-setting-inherited">Inherited</span>
              )}
            </div>
            <div className="font-controls">
              <select
                value={sectionTitle}
                onChange={(e) => updateField('sectionTitle', e.target.value)}
                style={{ fontFamily: sectionTitle }}
                className={`font-family-select ${isScreenTab && !isOverridden(localSettings, activeTab, 'sectionTitle') ? 'inherited' : ''}`}
              >
                {AVAILABLE_FONTS.map((font) => (
                  <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                    {font.name}
                  </option>
                ))}
              </select>
              <select
                value={sectionTitleSize}
                onChange={(e) => updateField('sectionTitleSize', Number(e.target.value))}
                className={`font-size-select ${isScreenTab && !isOverridden(localSettings, activeTab, 'sectionTitleSize') ? 'inherited' : ''}`}
              >
                {FONT_SIZES.map((size) => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </select>
            </div>
            <div className="font-preview" style={{ fontFamily: sectionTitle, fontWeight: 600, fontSize: `${sectionTitleSize}px` }}>
              Act One: The Beginning
            </div>
          </div>

          <div className="font-setting">
            <div className="font-setting-header">
              <label>Scene Titles</label>
              {isScreenTab && (
                sceneTitleOverridden
                  ? <button className="font-setting-reset-link" onClick={() => { resetField('sceneTitle'); resetField('sceneTitleSize'); }}>Reset to global</button>
                  : <span className="font-setting-inherited">Inherited</span>
              )}
            </div>
            <div className="font-controls">
              <select
                value={sceneTitle}
                onChange={(e) => updateField('sceneTitle', e.target.value)}
                style={{ fontFamily: sceneTitle }}
                className={`font-family-select ${isScreenTab && !isOverridden(localSettings, activeTab, 'sceneTitle') ? 'inherited' : ''}`}
              >
                {AVAILABLE_FONTS.map((font) => (
                  <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                    {font.name}
                  </option>
                ))}
              </select>
              <select
                value={sceneTitleSize}
                onChange={(e) => updateField('sceneTitleSize', Number(e.target.value))}
                className={`font-size-select ${isScreenTab && !isOverridden(localSettings, activeTab, 'sceneTitleSize') ? 'inherited' : ''}`}
              >
                {FONT_SIZES.map((size) => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </select>
            </div>
            <div className="font-preview" style={{ fontFamily: sceneTitle, fontWeight: 600, fontSize: `${sceneTitleSize}px` }}>
              1. The protagonist wakes up in a strange place
            </div>
          </div>

          <div className="font-setting">
            <div className="font-setting-header">
              <label>Body Text</label>
              {isScreenTab && (
                bodyOverridden
                  ? <button className="font-setting-reset-link" onClick={() => { resetField('body'); resetField('bodySize'); }}>Reset to global</button>
                  : <span className="font-setting-inherited">Inherited</span>
              )}
            </div>
            <div className="font-controls">
              <select
                value={body}
                onChange={(e) => updateField('body', e.target.value)}
                style={{ fontFamily: body }}
                className={`font-family-select ${isScreenTab && !isOverridden(localSettings, activeTab, 'body') ? 'inherited' : ''}`}
              >
                {AVAILABLE_FONTS.map((font) => (
                  <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                    {font.name}
                  </option>
                ))}
              </select>
              <select
                value={bodySize}
                onChange={(e) => updateField('bodySize', Number(e.target.value))}
                className={`font-size-select ${isScreenTab && !isOverridden(localSettings, activeTab, 'bodySize') ? 'inherited' : ''}`}
              >
                {FONT_SIZES.map((size) => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </select>
            </div>
            <div className="font-preview" style={{ fontFamily: body, fontSize: `${bodySize}px`, lineHeight: 1.6 }}>
              This is how your notes and descriptions will appear. The quick brown fox jumps over the lazy dog.
            </div>
          </div>

          <div className="font-setting">
            <label>Content Width</label>
            <div className="content-width-setting">
              <span className="content-width-label">Narrow</span>
              <input
                type="range"
                min="20"
                max="400"
                value={contentPadding}
                onChange={(e) => onContentPaddingChange(parseInt(e.target.value, 10))}
                className="content-width-range"
              />
              <span className="content-width-label">Wide</span>
            </div>
          </div>
        </div>

        <div className="font-picker-footer">
          <button className="reset-btn" onClick={handleReset}>
            {isScreenTab ? 'Clear Overrides' : 'Reset to Default'}
          </button>
          <div className="footer-actions">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button className="save-btn" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FontPicker;
