import { FontSettings } from '../../../shared/types';

// Same font list as FontPicker.tsx — keep in sync
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
const DEFAULT_BODY_SIZE = 14;
const DEFAULT_H1_SIZE = 28;
const DEFAULT_H2_SIZE = 22;
const DEFAULT_H3_SIZE = 18;

interface Section {
  label: string;
  fontKey: keyof FontSettings;
  sizeKey: keyof FontSettings;
  defaultSize: number;
  preview: string;
}

const SECTIONS: Section[] = [
  {
    label: 'Body',
    fontKey: 'body',
    sizeKey: 'bodySize',
    defaultSize: DEFAULT_BODY_SIZE,
    preview: 'The quick brown fox jumps over the lazy dog.',
  },
  {
    label: 'Heading 1',
    fontKey: 'heading1',
    sizeKey: 'heading1Size',
    defaultSize: DEFAULT_H1_SIZE,
    preview: 'Chapter One',
  },
  {
    label: 'Heading 2',
    fontKey: 'heading2',
    sizeKey: 'heading2Size',
    defaultSize: DEFAULT_H2_SIZE,
    preview: 'Section Title',
  },
  {
    label: 'Heading 3',
    fontKey: 'heading3',
    sizeKey: 'heading3Size',
    defaultSize: DEFAULT_H3_SIZE,
    preview: 'Subsection',
  },
];

interface NotesFontEditorProps {
  settings: FontSettings;
  onChange: (patch: Partial<FontSettings>) => void;
  onClose: () => void;
}

export default function NotesFontEditor({ settings, onChange, onClose }: NotesFontEditorProps) {
  return (
    <div className="notes-font-editor-overlay" onClick={onClose}>
      <div className="notes-font-editor" onClick={(e) => e.stopPropagation()}>
        <div className="notes-font-editor-header">
          <span className="notes-font-editor-title">Notes Fonts</span>
          <button className="notes-font-editor-close" onClick={onClose}>&times;</button>
        </div>
        <div className="notes-font-editor-body">
          {SECTIONS.map((section) => {
            const fontValue = (settings[section.fontKey] as string | undefined) ?? DEFAULT_FONT;
            const sizeValue = (settings[section.sizeKey] as number | undefined) ?? section.defaultSize;

            return (
              <div key={section.label} className="notes-font-editor-section">
                <div className="notes-font-editor-section-label">{section.label}</div>
                <div className="notes-font-editor-controls">
                  <select
                    className="notes-font-editor-family"
                    value={fontValue}
                    style={{ fontFamily: fontValue }}
                    onChange={(e) => onChange({ [section.fontKey]: e.target.value } as Partial<FontSettings>)}
                  >
                    {AVAILABLE_FONTS.map((f) => (
                      <option key={f.name} value={f.value} style={{ fontFamily: f.value }}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="notes-font-editor-size"
                    value={sizeValue}
                    onChange={(e) => onChange({ [section.sizeKey]: Number(e.target.value) } as Partial<FontSettings>)}
                  >
                    {FONT_SIZES.map((sz) => (
                      <option key={sz} value={sz}>{sz}px</option>
                    ))}
                  </select>
                </div>
                <div
                  className="notes-font-editor-preview"
                  style={{ fontFamily: fontValue, fontSize: `${sizeValue}px` }}
                >
                  {section.preview}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
