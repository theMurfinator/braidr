import React, { useState, useMemo } from 'react';
import { Scene, Character, PlotPoint, BraidedChapter } from '../../shared/types';

interface CompileModalProps {
  scenes: Scene[];
  characters: Character[];
  plotPoints: PlotPoint[];
  chapters: BraidedChapter[];
  draftContent: Record<string, string>;
  onClose: () => void;
}

function getSceneKey(scene: Scene): string {
  return `${scene.characterId}:${scene.sceneNumber}`;
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

export default function CompileModal({ scenes, characters, plotPoints, chapters, draftContent, onClose }: CompileModalProps) {
  const [title, setTitle] = useState('My Novel');
  const [authorName, setAuthorName] = useState('');
  const [format, setFormat] = useState<'md' | 'pdf' | 'docx'>('md');
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());

  // Build ordered scene list (braided order by timelinePosition)
  const orderedScenes = useMemo(() => {
    return scenes
      .filter(s => s.timelinePosition !== null)
      .sort((a, b) => (a.timelinePosition as number) - (b.timelinePosition as number));
  }, [scenes]);

  const unplacedScenes = useMemo(() => {
    return scenes.filter(s => s.timelinePosition === null);
  }, [scenes]);

  // Initialize selected scenes with all scenes that have drafts
  React.useEffect(() => {
    const scenesWithDrafts = new Set<string>();
    orderedScenes.forEach(scene => {
      const key = getSceneKey(scene);
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

  // Build preview with chapter breaks (filtered by selected scenes)
  const previewItems = useMemo(() => {
    const items: { type: 'chapter' | 'scene'; scene?: Scene; chapterTitle?: string; hasDraft?: boolean; isSelected?: boolean }[] = [];
    const sortedChapters = [...chapters].sort((a, b) => a.beforePosition - b.beforePosition);
    let chapterIdx = 0;

    orderedScenes.forEach((scene, i) => {
      const pos = i + 1; // 1-indexed display position
      // Insert chapter markers before this position
      while (chapterIdx < sortedChapters.length && sortedChapters[chapterIdx].beforePosition <= pos) {
        items.push({ type: 'chapter', chapterTitle: sortedChapters[chapterIdx].title });
        chapterIdx++;
      }
      const key = getSceneKey(scene);
      items.push({
        type: 'scene',
        scene,
        hasDraft: !!(draftContent[key] && draftContent[key] !== '<p></p>'),
        isSelected: selectedSceneIds.has(scene.id)
      });
    });

    // Remaining chapters after last scene
    while (chapterIdx < sortedChapters.length) {
      items.push({ type: 'chapter', chapterTitle: sortedChapters[chapterIdx].title });
      chapterIdx++;
    }

    return items;
  }, [orderedScenes, chapters, draftContent, selectedSceneIds]);

  const draftedCount = orderedScenes.filter(s => {
    const key = getSceneKey(s);
    return draftContent[key] && draftContent[key] !== '<p></p>';
  }).length;

  const exportMarkdown = () => {
    let md = `# ${title}\n\n`;
    if (authorName) {
      md += `*by ${authorName}*\n\n`;
    }

    previewItems.forEach(item => {
      if (item.type === 'chapter') {
        md += `\n## ${item.chapterTitle}\n\n`;
      } else if (item.scene && item.hasDraft && item.isSelected) {
        const key = getSceneKey(item.scene);
        const charName = characters.find(c => c.id === item.scene!.characterId)?.name || '';
        md += `*${charName}*\n\n`;
        md += htmlToMarkdown(draftContent[key]);
        md += '\n\n---\n\n';
      }
    });

    // Download as .md file
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportHTML = () => {
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
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${title}</h1>\n`;
    if (authorName) {
      html += `<p class="author">by ${authorName}</p>\n`;
    }

    previewItems.forEach(item => {
      if (item.type === 'chapter') {
        html += `<h2>${item.chapterTitle}</h2>\n`;
      } else if (item.scene && item.hasDraft && item.isSelected) {
        const key = getSceneKey(item.scene);
        const charName = characters.find(c => c.id === item.scene!.characterId)?.name || '';
        html += `<p class="char-label">${charName}</p>\n`;
        html += draftContent[key];
        html += `\n<p class="scene-break">* * *</p>\n`;
      }
    });

    html += `</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (format === 'md') {
      exportMarkdown();
    } else if (format === 'docx' || format === 'pdf') {
      alert(`${format.toUpperCase()} export coming soon! For now, export as HTML and convert using a tool like Pandoc or save as PDF from your browser's print dialog.`);
    } else {
      exportHTML();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal compile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Compile Manuscript</h3>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
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
                <option value="docx">Word (.docx) - Coming Soon</option>
                <option value="pdf">PDF - Coming Soon</option>
              </select>
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
              <button className="compile-export-btn compile-export-primary" onClick={handleExport}>Export {format.toUpperCase()}</button>
            </div>
          </div>

          {/* Scene order preview */}
          <div className="compile-preview">
            <h4>Select Scenes to Include</h4>
            {previewItems.map((item, i) => (
              item.type === 'chapter' ? (
                <div key={`ch-${i}`} className="compile-preview-chapter">{item.chapterTitle}</div>
              ) : (
                <div key={`sc-${item.scene!.id}`} className={`compile-preview-scene ${item.hasDraft ? 'has-draft' : 'no-draft'} ${item.isSelected ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    className="compile-scene-checkbox"
                    checked={item.isSelected || false}
                    onChange={() => toggleSceneSelection(item.scene!.id)}
                    disabled={!item.hasDraft}
                  />
                  <span className="compile-preview-char">{characters.find(c => c.id === item.scene!.characterId)?.name}</span>
                  <span className="compile-preview-title">Scene {item.scene!.sceneNumber}</span>
                  {!item.hasDraft && <span className="compile-preview-badge">No draft</span>}
                </div>
              )
            ))}
            {unplacedScenes.length > 0 && (
              <>
                <div className="compile-preview-chapter compile-preview-unplaced">Unplaced Scenes (not exported)</div>
                {unplacedScenes.map(scene => (
                  <div key={scene.id} className="compile-preview-scene no-draft">
                    <span className="compile-preview-char">{characters.find(c => c.id === scene.characterId)?.name}</span>
                    <span className="compile-preview-title">Scene {scene.sceneNumber}</span>
                    <span className="compile-preview-badge">Unplaced</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
