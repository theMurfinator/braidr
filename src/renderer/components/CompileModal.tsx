import { useState, useMemo, useEffect, type CSSProperties } from 'react';
import { Scene, Character, PlotPoint, BraidedChapter, MetadataFieldDef } from '../../shared/types';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { track } from '../utils/posthogTracker';

interface CompileModalProps {
  scenes: Scene[];
  characters: Character[];
  plotPoints: PlotPoint[];
  chapters: BraidedChapter[];
  draftContent: Record<string, string>;
  sceneMetadata: Record<string, Record<string, string | string[]>>;
  metadataFieldDefs: MetadataFieldDef[];
  characterColors: Record<string, string>;
  onClose: () => void;
}


function cleanSceneContent(text: string): string {
  return text
    .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
}

// Convert TipTap HTML to plain Markdown
function htmlToMarkdown(html: string): string {
  if (!html) return '';
  let md = html;
  // Block elements first
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1');
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1');
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  // Inline
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, '');
  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

// Strip HTML tags, convert block elements to newlines
function htmlToPlainText(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

export default function CompileModal({ scenes, characters, plotPoints, chapters, draftContent, sceneMetadata, metadataFieldDefs, characterColors, onClose }: CompileModalProps) {
  const [title, setTitle] = useState('My Novel');
  const [authorName, setAuthorName] = useState('');
  const [format, setFormat] = useState<'md' | 'pdf' | 'docx'>('md');
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [filterCharacter, setFilterCharacter] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'preview'>('settings');
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);


  // Output toggle options
  const [includeChapterHeadings, setIncludeChapterHeadings] = useState(true);
  const [includeCharacterNames, setIncludeCharacterNames] = useState(true);
  const [includeSceneBreaks, setIncludeSceneBreaks] = useState(true);
  const [includeSceneNumbers, setIncludeSceneNumbers] = useState(false);

  // Get status options from metadata field defs
  const statusFieldDef = metadataFieldDefs.find(f => f.id === '_status');
  const statusOptions = statusFieldDef ? (statusFieldDef.options || []) : [];

  // Build ordered scene list (braided order by timelinePosition) with filters applied
  const orderedScenes = useMemo(() => {
    let filtered = scenes.filter(s => s.timelinePosition !== null);

    // Apply character filter
    if (filterCharacter !== 'all') {
      filtered = filtered.filter(s => s.characterId === filterCharacter);
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(s => {
        const key = s.id;
        const meta = sceneMetadata[key];
        const status = meta?.['_status'] as string | undefined;
        return status === filterStatus;
      });
    }

    return filtered.sort((a, b) => (a.timelinePosition as number) - (b.timelinePosition as number));
  }, [scenes, filterCharacter, filterStatus, sceneMetadata]);

  const unplacedScenes = useMemo(() => {
    return scenes.filter(s => s.timelinePosition === null);
  }, [scenes]);

  // Initialize selected scenes with all scenes that have drafts
  useEffect(() => {
    const scenesWithDrafts = new Set<string>();
    orderedScenes.forEach(scene => {
      const key = scene.id;
      if (draftContent[key] && draftContent[key] !== '<p></p>') {
        scenesWithDrafts.add(scene.id);
      }
    });
    setSelectedSceneIds(scenesWithDrafts);
  }, [orderedScenes, draftContent]);

  const toggleSceneSelection = (sceneId: string) => {
    setSelectedSceneIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSceneIds(new Set(orderedScenes.map(s => s.id)));
  };

  const deselectAll = () => {
    setSelectedSceneIds(new Set());
  };

  // Track scene number across selected scenes for scene numbering
  const previewItems = useMemo(() => {
    const items: { type: 'chapter' | 'scene'; scene?: Scene; chapterTitle?: string; hasDraft?: boolean; isSelected?: boolean; sceneNumber?: number }[] = [];
    const sortedChapters = [...chapters].sort((a, b) => a.beforePosition - b.beforePosition);
    let chapterIdx = 0;
    let sceneNum = 0;

    orderedScenes.forEach((scene, i) => {
      const pos = i + 1; // 1-indexed display position
      // Insert chapter markers before this position
      while (chapterIdx < sortedChapters.length && sortedChapters[chapterIdx].beforePosition <= pos) {
        items.push({ type: 'chapter', chapterTitle: sortedChapters[chapterIdx].title });
        chapterIdx++;
      }
      const key = scene.id;
      const hasDraft = !!(draftContent[key] && draftContent[key] !== '<p></p>');
      const isSelected = selectedSceneIds.has(scene.id);
      if (hasDraft && isSelected) sceneNum++;
      items.push({
        type: 'scene',
        scene,
        hasDraft,
        isSelected,
        sceneNumber: (hasDraft && isSelected) ? sceneNum : undefined,
      });
    });

    // Remaining chapters after last scene
    while (chapterIdx < sortedChapters.length) {
      items.push({ type: 'chapter', chapterTitle: sortedChapters[chapterIdx].title });
      chapterIdx++;
    }

    return items;
  }, [orderedScenes, chapters, draftContent, selectedSceneIds]);

  // Check if a chapter at index i has at least one selected scene with a draft after it
  const chapterHasContent = (items: typeof previewItems, startIdx: number) => {
    for (let k = startIdx + 1; k < items.length; k++) {
      if (items[k].type === 'chapter') return false; // hit next chapter
      if (items[k].scene && items[k].hasDraft && items[k].isSelected) return true;
    }
    return false;
  };

  // Build HTML string for export (shared between HTML and PDF export)
  const buildExportHTML = () => {
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: 'Georgia', serif; max-width: 700px; margin: 0 auto; padding: 40px 20px; line-height: 1.8; color: #222; }
  h1 { text-align: center; font-size: 28px; margin-bottom: 8px; }
  .author { text-align: center; font-style: italic; color: #666; margin-bottom: 40px; }
  h2 { text-align: center; font-size: 20px; margin: 40px 0 20px; color: #555; }
  h3 { font-size: 16px; margin: 24px 0 8px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 32px auto; width: 40%; }
  .scene-break { text-align: center; color: #999; margin: 24px 0; }
  .char-label { font-style: italic; color: #777; margin-bottom: 8px; }
  .scene-num { font-style: italic; color: #999; font-size: 0.9em; margin-bottom: 4px; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${title}</h1>\n`;
    if (authorName) {
      html += `<p class="author">by ${authorName}</p>\n`;
    }

    previewItems.forEach((item, idx) => {
      if (item.type === 'chapter' && includeChapterHeadings && chapterHasContent(previewItems, idx)) {
        html += `<h2>${item.chapterTitle}</h2>\n`;
      } else if (item.scene && item.hasDraft && item.isSelected) {
        const key = item.scene.id;
        const charName = characters.find(c => c.id === item.scene!.characterId)?.name || '';
        if (includeSceneNumbers && item.sceneNumber) {
          html += `<p class="scene-num">Scene ${item.sceneNumber}</p>\n`;
        }
        if (includeCharacterNames) {
          html += `<p class="char-label">${charName}</p>\n`;
        }
        html += draftContent[key];
        if (includeSceneBreaks) {
          html += `\n<p class="scene-break">* * *</p>\n`;
        }
      }
    });

    html += `</body></html>`;
    return html;
  };

  const safeFileName = title.replace(/[^a-z0-9]/gi, '_');

  const exportMarkdown = async () => {
    let md = `# ${title}\n\n`;
    if (authorName) {
      md += `*by ${authorName}*\n\n`;
    }

    previewItems.forEach((item, idx) => {
      if (item.type === 'chapter' && includeChapterHeadings && chapterHasContent(previewItems, idx)) {
        md += `\n## ${item.chapterTitle}\n\n`;
      } else if (item.scene && item.hasDraft && item.isSelected) {
        const key = item.scene.id;
        const charName = characters.find(c => c.id === item.scene!.characterId)?.name || '';
        if (includeSceneNumbers && item.sceneNumber) {
          md += `*Scene ${item.sceneNumber}*\n\n`;
        }
        if (includeCharacterNames) {
          md += `*${charName}*\n\n`;
        }
        md += htmlToMarkdown(draftContent[key]);
        if (includeSceneBreaks) {
          md += '\n\n---\n\n';
        } else {
          md += '\n\n';
        }
      }
    });

    const data = Array.from(new TextEncoder().encode(md));
    const result = await window.electronAPI.exportFile(data, `${safeFileName}.md`, [{ name: 'Markdown', extensions: ['md'] }]);
    if (!result.success && !result.cancelled) throw new Error(result.error || 'Export failed');
    if (result.cancelled) return false;
    return true;
  };

  const exportHTML = async () => {
    const html = buildExportHTML();
    const data = Array.from(new TextEncoder().encode(html));
    const result = await window.electronAPI.exportFile(data, `${safeFileName}.html`, [{ name: 'HTML', extensions: ['html'] }]);
    if (!result.success && !result.cancelled) throw new Error(result.error || 'Export failed');
    if (result.cancelled) return false;
    return true;
  };

  const exportDocx = async () => {
    const paragraphs: Paragraph[] = [];

    // Title
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 56 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }));

    if (authorName) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: `by ${authorName}`, italics: true, color: '666666', size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      }));
    }

    previewItems.forEach((item, idx) => {
      if (item.type === 'chapter' && includeChapterHeadings && chapterHasContent(previewItems, idx)) {
        paragraphs.push(new Paragraph({
          text: item.chapterTitle || '',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        }));
      } else if (item.scene && item.hasDraft && item.isSelected) {
        const key = item.scene.id;
        const charName = characters.find(c => c.id === item.scene!.characterId)?.name || '';
        const plainText = htmlToPlainText(draftContent[key]);

        if (includeSceneNumbers && item.sceneNumber) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: `Scene ${item.sceneNumber}`, italics: true, color: '999999', size: 22 })],
            spacing: { before: 200 },
          }));
        }
        if (includeCharacterNames) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: charName, italics: true, color: '777777' })],
            spacing: { before: 100, after: 100 },
          }));
        }

        // Split plain text into paragraphs
        const textParagraphs = plainText.split(/\n\n+/);
        textParagraphs.forEach(para => {
          const trimmed = para.trim();
          if (trimmed) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: trimmed, size: 24 })],
              spacing: { after: 200 },
            }));
          }
        });

        if (includeSceneBreaks) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: '* * *', color: '999999' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 300 },
          }));
        }
      }
    });

    const doc = new Document({
      sections: [{ children: paragraphs }],
    });

    const blob = await Packer.toBlob(doc);
    const arrayBuf = await blob.arrayBuffer();
    const data = Array.from(new Uint8Array(arrayBuf));
    const result = await window.electronAPI.exportFile(data, `${safeFileName}.docx`, [{ name: 'Word Document', extensions: ['docx'] }]);
    if (!result.success && !result.cancelled) throw new Error(result.error || 'Export failed');
    if (result.cancelled) return false;
    return true;
  };

  const exportPDF = async () => {
    const html = buildExportHTML();
    const pdfResult = await window.electronAPI.printToPDF(html);
    if (!pdfResult.success || !pdfResult.data) {
      throw new Error(pdfResult.error || 'PDF export failed');
    }
    const result = await window.electronAPI.exportFile(pdfResult.data, `${safeFileName}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }]);
    if (!result.success && !result.cancelled) throw new Error(result.error || 'Export failed');
    if (result.cancelled) return false;
    return true;
  };

  const handleExport = async () => {
    track('compile_started', { format });
    setExporting(true);
    setExportError(null);
    try {
      let saved = true;
      if (format === 'md') {
        saved = await exportMarkdown();
      } else if (format === 'docx') {
        saved = await exportDocx();
      } else if (format === 'pdf') {
        saved = await exportPDF();
      } else {
        saved = await exportHTML();
      }
      if (saved) setExportComplete(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setExportError(message);
    } finally {
      setExporting(false);
    }
  };

  // Live preview HTML — builds a styled body-only preview from the same data as export
  const previewHTML = useMemo(() => {
    let html = `<div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 24px 20px; line-height: 1.8; color: #222;">`;
    html += `<h1 style="text-align: center; font-size: 24px; margin-bottom: 6px; font-weight: 700;">${title || 'Untitled'}</h1>\n`;
    if (authorName) {
      html += `<p style="text-align: center; font-style: italic; color: #666; margin-bottom: 32px;">by ${authorName}</p>\n`;
    } else {
      html += `<div style="margin-bottom: 32px;"></div>`;
    }

    let hasContent = false;
    previewItems.forEach((item, idx) => {
      if (item.type === 'chapter' && includeChapterHeadings && chapterHasContent(previewItems, idx)) {
        html += `<h2 style="text-align: center; font-size: 18px; margin: 32px 0 16px; color: #555; font-weight: 600;">${item.chapterTitle}</h2>\n`;
      } else if (item.scene && item.hasDraft && item.isSelected) {
        hasContent = true;
        const key = item.scene.id;
        const charName = characters.find(c => c.id === item.scene!.characterId)?.name || '';
        if (includeSceneNumbers && item.sceneNumber) {
          html += `<p style="font-style: italic; color: #999; font-size: 0.9em; margin-bottom: 4px;">Scene ${item.sceneNumber}</p>\n`;
        }
        if (includeCharacterNames) {
          html += `<p style="font-style: italic; color: #777; margin-bottom: 8px;">${charName}</p>\n`;
        }
        html += draftContent[key];
        if (includeSceneBreaks) {
          html += `\n<p style="text-align: center; color: #999; margin: 24px 0;">* * *</p>\n`;
        }
      }
    });

    if (!hasContent) {
      html += `<p style="text-align: center; color: #aaa; margin-top: 60px; font-style: italic;">No scenes selected with draft content.</p>`;
    }

    html += `</div>`;
    return html;
  }, [title, authorName, previewItems, includeChapterHeadings, includeCharacterNames, includeSceneBreaks, includeSceneNumbers, draftContent, characters]);

  const confettiPieces = useMemo(() => {
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#4caf50', '#ffeb3b', '#ff9800'];
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * 360 + (Math.random() * 30 - 15);
      const distance = 80 + Math.random() * 120;
      const x = Math.cos((angle * Math.PI) / 180) * distance;
      const y = Math.sin((angle * Math.PI) / 180) * distance;
      const rotation = Math.random() * 720 - 360;
      return {
        color: colors[i % colors.length],
        style: {
          '--confetti-x': `${x}px`,
          '--confetti-y': `${y}px`,
          '--confetti-r': `${rotation}deg`,
          animationDelay: `${Math.random() * 0.15}s`,
        } as CSSProperties,
      };
    });
  }, [exportComplete]);

  return (
    <div className="modal-overlay" onClick={exportComplete ? undefined : onClose}>
      <div className="modal compile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Compile Manuscript</h3>
          <div className="compile-tabs">
            <button className={`compile-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Settings
            </button>
            <button className={`compile-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Preview
            </button>
          </div>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        {exportComplete ? (
          <div className="compile-modal-body">
            <div className="compile-completion-overlay">
              <div className="compile-confetti-container">
                {confettiPieces.map((piece, i) => (
                  <span
                    key={i}
                    className="compile-confetti-piece"
                    style={{ backgroundColor: piece.color, ...piece.style }}
                  />
                ))}
              </div>
              <div className="compile-completion-icon">🚀</div>
              <div className="compile-completion-message">Your compile is complete!</div>
              <button className="compile-error-close-btn" style={{ animationDelay: '0.4s' }} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : exportError ? (
          <div className="compile-modal-body">
            <div className="compile-completion-overlay error">
              <div className="compile-completion-icon">⚠️</div>
              <div className="compile-completion-message">Export failed</div>
              <div className="compile-error-detail">{exportError}</div>
              <button className="compile-error-close-btn" onClick={() => setExportError(null)}>
                Try Again
              </button>
            </div>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="compile-modal-body">
            {/* Title + Export controls */}
            <div className="compile-controls">
              <div className="compile-title-row">
                <label>Title:</label>
                <input type="text" className="compile-title-input" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="compile-title-row">
                <label>Author:</label>
                <input type="text" className="compile-title-input" value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Optional" />
              </div>
              <div className="compile-title-row">
                <label>Format:</label>
                <select className="compile-format-select" value={format} onChange={e => setFormat(e.target.value as 'md' | 'pdf' | 'docx')}>
                  <option value="md">Markdown (.md)</option>
                  <option value="docx">Word (.docx)</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
              <div className="compile-filters-row">
                <div className="compile-filter">
                  <label>Character:</label>
                  <select className="compile-filter-select" value={filterCharacter} onChange={e => setFilterCharacter(e.target.value)}>
                    <option value="all">All Characters</option>
                    {characters.map(char => (
                      <option key={char.id} value={char.id}>{char.name}</option>
                    ))}
                  </select>
                </div>
                <div className="compile-filter">
                  <label>Status:</label>
                  <select className="compile-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">All Statuses</option>
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="compile-options-row">
                <label className="compile-option">
                  <input type="checkbox" checked={includeChapterHeadings} onChange={e => setIncludeChapterHeadings(e.target.checked)} />
                  Chapter headings
                </label>
                <label className="compile-option">
                  <input type="checkbox" checked={includeCharacterNames} onChange={e => setIncludeCharacterNames(e.target.checked)} />
                  Character names
                </label>
                <label className="compile-option">
                  <input type="checkbox" checked={includeSceneBreaks} onChange={e => setIncludeSceneBreaks(e.target.checked)} />
                  Scene breaks
                </label>
                <label className="compile-option">
                  <input type="checkbox" checked={includeSceneNumbers} onChange={e => setIncludeSceneNumbers(e.target.checked)} />
                  Scene numbers
                </label>
              </div>
              <div className="compile-stats">
                {selectedSceneIds.size} of {orderedScenes.length} scenes selected
                {unplacedScenes.length > 0 && ` · ${unplacedScenes.length} unplaced`}
              </div>
              <div className="compile-scene-select-controls">
                <button className="compile-select-btn" onClick={selectAll}>Select All</button>
                <button className="compile-select-btn" onClick={deselectAll}>Deselect All</button>
              </div>
              <div className="compile-export-buttons">
                <button className="compile-export-btn compile-export-primary" onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
                </button>
              </div>
            </div>

            {/* Scene order preview */}
            <div className="compile-preview">
              <h4>What to compile</h4>
              {previewItems.map((item, idx) => (
                item.type === 'chapter' ? (
                  chapterHasContent(previewItems, idx) ? (
                    <div key={`ch-${idx}`} className="compile-preview-chapter" style={{ opacity: includeChapterHeadings ? 1 : 0.4 }}>
                      {item.chapterTitle}
                    </div>
                  ) : null
                ) : (
                  <div key={`sc-${item.scene!.id}`} className={`compile-preview-scene ${item.hasDraft ? 'has-draft' : 'no-draft'} ${item.isSelected ? 'selected' : ''}`} style={{ borderLeftColor: characterColors[item.scene!.characterId] || 'transparent' }}>
                    <input
                      type="checkbox"
                      className="compile-scene-checkbox"
                      checked={item.isSelected || false}
                      onChange={() => toggleSceneSelection(item.scene!.id)}
                      disabled={!item.hasDraft}
                    />
                    <span className="compile-preview-char">
                      {characters.find(c => c.id === item.scene!.characterId)?.name}
                      {item.sceneNumber && ` — Scene ${item.sceneNumber}`}
                    </span>
                    <span className="compile-preview-title">{cleanSceneContent(item.scene!.content) || `Scene ${item.scene!.sceneNumber}`}</span>
                    {!item.hasDraft && <span className="compile-preview-badge">No draft</span>}
                  </div>
                )
              ))}
              {unplacedScenes.length > 0 && (
                <>
                  <div className="compile-preview-chapter compile-preview-unplaced">Unplaced Scenes (not exported)</div>
                  {unplacedScenes.map(scene => (
                    <div key={scene.id} className="compile-preview-scene no-draft" style={{ borderLeftColor: characterColors[scene.characterId] || 'transparent' }}>
                      <span className="compile-preview-char">{characters.find(c => c.id === scene.characterId)?.name}</span>
                      <span className="compile-preview-title">{cleanSceneContent(scene.content) || `Scene ${scene.sceneNumber}`}</span>
                      <span className="compile-preview-badge">Unplaced</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="compile-modal-body compile-preview-body">
            <div className="compile-live-preview" dangerouslySetInnerHTML={{ __html: previewHTML }} />
          </div>
        )}
      </div>
    </div>
  );
}
