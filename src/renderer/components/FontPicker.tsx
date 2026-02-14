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

// Define which font sections are visible per tab, with context-specific labels
type FontSection = {
  field: 'section' | 'scene' | 'body';
  label: string;
  preview: string;
};

const TAB_SECTIONS: Record<TabKey, FontSection[]> = {
  global: [
    { field: 'section', label: 'Plot Point Headers', preview: 'Act One: The Beginning' },
    { field: 'scene', label: 'Scene Titles', preview: '1. The protagonist wakes up in a strange place' },
    { field: 'body', label: 'Body Text', preview: 'This is how your notes and descriptions will appear. The quick brown fox jumps over the lazy dog.' },
  ],
  pov: [
    { field: 'section', label: 'Plot Point Headers', preview: 'Act One: The Beginning' },
    { field: 'scene', label: 'Scene Descriptions', preview: '1. The protagonist wakes up in a strange place' },
    { field: 'body', label: 'Notes & Synopsis', preview: 'This is how your notes and descriptions will appear. The quick brown fox jumps over the lazy dog.' },
  ],
  braided: [
    { field: 'scene', label: 'Scene Labels', preview: 'Kate 3 — Meeting at the cathedral' },
    { field: 'body', label: 'Synopsis Text', preview: 'This is how your notes and descriptions will appear. The quick brown fox jumps over the lazy dog.' },
  ],
  editor: [
    { field: 'scene', label: 'Scene Title', preview: 'Press tour — taking an interview' },
    { field: 'body', label: 'Draft Text', preview: 'This is how your draft prose will appear. The quick brown fox jumps over the lazy dog.' },
  ],
  notes: [
    { field: 'section', label: 'Note Title', preview: 'My Research Notes' },
    { field: 'body', label: 'Notes Body', preview: 'This is how your notes will appear. The quick brown fox jumps over the lazy dog.' },
  ],
};

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

  // Font values are now resolved dynamically in the render loop

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
          sectionTitleBold: true,
          sceneTitle: DEFAULT_FONT,
          sceneTitleSize: DEFAULT_SCENE_SIZE,
          sceneTitleBold: true,
          body: DEFAULT_FONT,
          bodySize: DEFAULT_BODY_SIZE,
          bodyBold: false,
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
          {TAB_SECTIONS[activeTab].map((section) => {
            // Map section field to the corresponding font setting keys
            const fontKey = section.field === 'section' ? 'sectionTitle'
              : section.field === 'scene' ? 'sceneTitle'
              : 'body';
            const sizeKey = section.field === 'section' ? 'sectionTitleSize'
              : section.field === 'scene' ? 'sceneTitleSize'
              : 'bodySize';
            const boldKey = section.field === 'section' ? 'sectionTitleBold'
              : section.field === 'scene' ? 'sceneTitleBold'
              : 'bodyBold';

            const fontValue = (getResolved(localSettings, activeTab, fontKey) as string) || DEFAULT_FONT;
            const sizeValue = (getResolved(localSettings, activeTab, sizeKey) as number)
              || (section.field === 'section' ? DEFAULT_SECTION_SIZE : section.field === 'scene' ? DEFAULT_SCENE_SIZE : DEFAULT_BODY_SIZE);
            const boldValue = getResolved(localSettings, activeTab, boldKey);
            const isBold = boldValue !== undefined ? Boolean(boldValue) : section.field !== 'body';
            const isOvr = isOverridden(localSettings, activeTab, fontKey) || isOverridden(localSettings, activeTab, sizeKey) || isOverridden(localSettings, activeTab, boldKey);

            return (
              <div key={section.field} className="font-setting">
                <div className="font-setting-header">
                  <label>{section.label}</label>
                  {isScreenTab && (
                    isOvr
                      ? <button className="font-setting-reset-link" onClick={() => { resetField(fontKey); resetField(sizeKey); resetField(boldKey); }}>Reset to global</button>
                      : <span className="font-setting-inherited">Inherited</span>
                  )}
                </div>
                <div className="font-controls">
                  <select
                    value={fontValue}
                    onChange={(e) => updateField(fontKey, e.target.value)}
                    style={{ fontFamily: fontValue }}
                    className={`font-family-select ${isScreenTab && !isOverridden(localSettings, activeTab, fontKey) ? 'inherited' : ''}`}
                  >
                    {AVAILABLE_FONTS.map((font) => (
                      <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                        {font.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sizeValue}
                    onChange={(e) => updateField(sizeKey, Number(e.target.value))}
                    className={`font-size-select ${isScreenTab && !isOverridden(localSettings, activeTab, sizeKey) ? 'inherited' : ''}`}
                  >
                    {FONT_SIZES.map((size) => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                  <button
                    className={`font-bold-toggle ${isBold ? 'active' : ''}`}
                    onClick={() => updateField(boldKey, isBold ? false : true)}
                    title={isBold ? 'Bold (on)' : 'Bold (off)'}
                  >
                    <strong>B</strong>
                  </button>
                </div>
                <div className="font-preview" style={{
                  fontFamily: fontValue,
                  fontWeight: isBold ? 700 : 400,
                  fontSize: `${sizeValue}px`,
                  lineHeight: section.field === 'body' ? 1.6 : undefined,
                }}>
                  {section.preview}
                </div>
              </div>
            );
          })}

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
