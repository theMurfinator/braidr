import { useState } from 'react';
import { NoteMetadata, Scene, Character } from '../../../shared/types';

interface BacklinksPanelProps {
  currentNoteId: string;
  allNotes: NoteMetadata[];
  scenes: Scene[];
  characters: Character[];
  onNavigateNote: (noteId: string) => void;
  onRemoveOutgoingLink: (targetId: string) => void;
  onRemoveIncomingLink: (sourceNoteId: string) => void;
  width?: number;
}

export default function BacklinksPanel({
  currentNoteId,
  allNotes,
  scenes,
  characters,
  onNavigateNote,
  onRemoveOutgoingLink,
  onRemoveIncomingLink,
  width,
}: BacklinksPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Find notes that link TO this note
  const linkedNotes = allNotes.filter(
    n => n.id !== currentNoteId && n.outgoingLinks.includes(currentNoteId)
  );

  // Find notes that link FROM this note (outgoing)
  const currentNote = allNotes.find(n => n.id === currentNoteId);
  const outgoingNotes = currentNote
    ? allNotes.filter(n => currentNote.outgoingLinks.includes(n.id))
    : [];

  // Find scene links
  const linkedScenes = currentNote
    ? currentNote.sceneLinks.map(sceneKey => {
        const [characterId, sceneNum] = sceneKey.split(':');
        const scene = scenes.find(s => s.characterId === characterId && s.sceneNumber === parseInt(sceneNum));
        const character = characters.find(c => c.id === characterId);
        return scene && character
          ? { key: sceneKey, scene, character }
          : null;
      }).filter(Boolean) as { key: string; scene: Scene; character: Character }[]
    : [];

  return (
    <div className="backlinks-panel" style={width ? { width } : undefined}>
      <div className="backlinks-panel-header">
        <span className="backlinks-panel-title">Links</span>
      </div>

      <div className="backlinks-panel-content">
        {/* Incoming links */}
        <div className="backlinks-section">
          <button
            className="backlinks-section-header"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`backlinks-chevron ${isExpanded ? 'expanded' : ''}`}>
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Linked from ({linkedNotes.length})
          </button>
          {isExpanded && (
            <div className="backlinks-list">
              {linkedNotes.length === 0 ? (
                <div className="backlinks-empty">No incoming links</div>
              ) : (
                linkedNotes.map(note => (
                  <div key={note.id} className="backlinks-item-row">
                    <button
                      className="backlinks-item"
                      onClick={() => onNavigateNote(note.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="2" y="1.5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/>
                        <path d="M4 4.5h4M4 6.5h3" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
                      </svg>
                      {note.title || 'Untitled'}
                    </button>
                    <button
                      className="backlinks-remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveIncomingLink(note.id); }}
                      title="Remove this link"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Outgoing links */}
        {outgoingNotes.length > 0 && (
          <div className="backlinks-section">
            <div className="backlinks-section-header">
              Links to ({outgoingNotes.length})
            </div>
            <div className="backlinks-list">
              {outgoingNotes.map(note => (
                <div key={note.id} className="backlinks-item-row">
                  <button
                    className="backlinks-item"
                    onClick={() => onNavigateNote(note.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="1.5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/>
                      <path d="M4 4.5h4M4 6.5h3" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
                    </svg>
                    {note.title || 'Untitled'}
                  </button>
                  <button
                    className="backlinks-remove-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveOutgoingLink(note.id); }}
                    title="Remove this link"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scene links */}
        {linkedScenes.length > 0 && (
          <div className="backlinks-section">
            <div className="backlinks-section-header">
              Scenes ({linkedScenes.length})
            </div>
            <div className="backlinks-list">
              {linkedScenes.map(({ key, scene, character }) => (
                <div key={key} className="backlinks-item-row">
                  <div className="backlinks-item backlinks-scene-item">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="1.5" y="2" width="9" height="8" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/>
                      <path d="M1.5 4.5h9" stroke="currentColor" strokeWidth="0.8"/>
                    </svg>
                    <span>{character.name} — Scene {scene.sceneNumber}</span>
                  </div>
                  <button
                    className="backlinks-remove-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveOutgoingLink(key); }}
                    title="Remove this link"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
