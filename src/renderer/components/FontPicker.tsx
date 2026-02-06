import { useState, useEffect } from 'react';
import { FontSettings } from '../../shared/types';

interface FontPickerProps {
  fontSettings: FontSettings;
  onFontSettingsChange: (settings: FontSettings) => void;
  onClose: () => void;
}

const AVAILABLE_FONTS = [
  { name: 'PT Serif', value: "'PT Serif', Georgia, serif" },
  { name: 'Merriweather', value: "'Merriweather', Georgia, serif" },
  { name: 'Lora', value: "'Lora', Georgia, serif" },
  { name: 'Crimson Text', value: "'Crimson Text', Georgia, serif" },
  { name: 'Source Serif Pro', value: "'Source Serif Pro', Georgia, serif" },
  { name: 'Libre Baskerville', value: "'Libre Baskerville', Georgia, serif" },
  { name: 'EB Garamond', value: "'EB Garamond', Georgia, serif" },
  { name: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { name: 'Georgia', value: "Georgia, serif" },
  { name: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { name: 'System Sans', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32];

const DEFAULT_FONT = "'PT Serif', Georgia, serif";
const DEFAULT_SECTION_SIZE = 18;
const DEFAULT_SCENE_SIZE = 15;
const DEFAULT_BODY_SIZE = 14;

function FontPicker({ fontSettings, onFontSettingsChange, onClose }: FontPickerProps) {
  const [sectionTitle, setSectionTitle] = useState(fontSettings.sectionTitle || DEFAULT_FONT);
  const [sectionTitleSize, setSectionTitleSize] = useState(fontSettings.sectionTitleSize || DEFAULT_SECTION_SIZE);
  const [sceneTitle, setSceneTitle] = useState(fontSettings.sceneTitle || DEFAULT_FONT);
  const [sceneTitleSize, setSceneTitleSize] = useState(fontSettings.sceneTitleSize || DEFAULT_SCENE_SIZE);
  const [body, setBody] = useState(fontSettings.body || DEFAULT_FONT);
  const [bodySize, setBodySize] = useState(fontSettings.bodySize || DEFAULT_BODY_SIZE);

  useEffect(() => {
    setSectionTitle(fontSettings.sectionTitle || DEFAULT_FONT);
    setSectionTitleSize(fontSettings.sectionTitleSize || DEFAULT_SECTION_SIZE);
    setSceneTitle(fontSettings.sceneTitle || DEFAULT_FONT);
    setSceneTitleSize(fontSettings.sceneTitleSize || DEFAULT_SCENE_SIZE);
    setBody(fontSettings.body || DEFAULT_FONT);
    setBodySize(fontSettings.bodySize || DEFAULT_BODY_SIZE);
  }, [fontSettings]);

  const handleSave = () => {
    onFontSettingsChange({
      sectionTitle,
      sectionTitleSize,
      sceneTitle,
      sceneTitleSize,
      body,
      bodySize,
    });
    onClose();
  };

  const handleReset = () => {
    setSectionTitle(DEFAULT_FONT);
    setSectionTitleSize(DEFAULT_SECTION_SIZE);
    setSceneTitle(DEFAULT_FONT);
    setSceneTitleSize(DEFAULT_SCENE_SIZE);
    setBody(DEFAULT_FONT);
    setBodySize(DEFAULT_BODY_SIZE);
  };

  return (
    <div className="font-picker-overlay" onClick={onClose}>
      <div className="font-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="font-picker-header">
          <h2>Font Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="font-picker-content">
          <div className="font-setting">
            <label>Section Titles</label>
            <div className="font-controls">
              <select
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                style={{ fontFamily: sectionTitle }}
                className="font-family-select"
              >
                {AVAILABLE_FONTS.map((font) => (
                  <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                    {font.name}
                  </option>
                ))}
              </select>
              <select
                value={sectionTitleSize}
                onChange={(e) => setSectionTitleSize(Number(e.target.value))}
                className="font-size-select"
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
            <label>Scene Titles</label>
            <div className="font-controls">
              <select
                value={sceneTitle}
                onChange={(e) => setSceneTitle(e.target.value)}
                style={{ fontFamily: sceneTitle }}
                className="font-family-select"
              >
                {AVAILABLE_FONTS.map((font) => (
                  <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                    {font.name}
                  </option>
                ))}
              </select>
              <select
                value={sceneTitleSize}
                onChange={(e) => setSceneTitleSize(Number(e.target.value))}
                className="font-size-select"
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
            <label>Body Text</label>
            <div className="font-controls">
              <select
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ fontFamily: body }}
                className="font-family-select"
              >
                {AVAILABLE_FONTS.map((font) => (
                  <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                    {font.name}
                  </option>
                ))}
              </select>
              <select
                value={bodySize}
                onChange={(e) => setBodySize(Number(e.target.value))}
                className="font-size-select"
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
        </div>

        <div className="font-picker-footer">
          <button className="reset-btn" onClick={handleReset}>Reset to Default</button>
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
