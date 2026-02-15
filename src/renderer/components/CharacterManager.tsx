import React, { useState } from 'react';
import { Character } from '../../shared/types';
import { track } from '../utils/posthogTracker';

interface CharacterManagerProps {
  characters: Character[];
  characterColors: Record<string, string>;
  onClose: () => void;
  onCreateCharacter: (name: string) => void;
  onRenameCharacter: (characterId: string, newName: string) => void;
  onColorChange: (characterId: string, color: string) => void;
  onDeleteCharacter: (characterId: string) => void;
}

function CharacterManager({
  characters,
  characterColors,
  onClose,
  onCreateCharacter,
  onRenameCharacter,
  onColorChange,
  onDeleteCharacter,
}: CharacterManagerProps) {
  const [newCharacterName, setNewCharacterName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    if (newCharacterName.trim()) {
      track('character_created');
      onCreateCharacter(newCharacterName.trim());
      setNewCharacterName('');
    }
  };

  const startEditing = (character: Character) => {
    setEditingId(character.id);
    setEditName(character.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      onRenameCharacter(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="character-manager-overlay" onClick={onClose}>
      <div className="character-manager" onClick={e => e.stopPropagation()}>
        <div className="character-manager-header">
          <h2>Characters</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="character-manager-content">
          {/* Create new character section */}
          <div className="create-character-section">
            <h3>Add New Character</h3>
            <div className="create-character-form">
              <input
                type="text"
                placeholder="Character name..."
                value={newCharacterName}
                onChange={e => setNewCharacterName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleCreate();
                  }
                }}
              />
              <button onClick={handleCreate} disabled={!newCharacterName.trim()}>
                Add
              </button>
            </div>
          </div>

          {/* Character list */}
          <div className="character-list">
            <h3>Existing Characters</h3>
            {characters.length === 0 ? (
              <p className="no-characters">No characters yet</p>
            ) : (
              characters.map(character => (
                <div key={character.id} className="character-item">
                  {editingId === character.id ? (
                    <div className="character-edit-row">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                      />
                      <button onClick={saveEdit}>Save</button>
                      <button onClick={cancelEdit} className="cancel-btn">Cancel</button>
                    </div>
                  ) : (
                    <div className="character-display-row">
                      <input
                        type="color"
                        className="character-color-picker-lg"
                        value={characterColors[character.id] || '#3b82f6'}
                        onChange={e => onColorChange(character.id, e.target.value)}
                        title="Set character color"
                      />
                      <span className="character-name">{character.name}</span>
                      <span className="character-file">{character.filePath.split('/').pop()}</span>
                      {confirmDeleteId === character.id ? (
                        <div className="delete-confirm-row">
                          <span className="delete-confirm-text">Delete {character.name}?</span>
                          <button className="delete-confirm-btn" onClick={() => { track('character_deleted'); onDeleteCharacter(character.id); setConfirmDeleteId(null); }}>Yes, delete</button>
                          <button className="delete-cancel-btn" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button className="rename-btn" onClick={() => startEditing(character)}>Rename</button>
                          <button className="delete-btn" onClick={() => setConfirmDeleteId(character.id)}>Delete</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CharacterManager;
