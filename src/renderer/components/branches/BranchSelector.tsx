import { useState, useEffect, useRef } from 'react';
import { BranchIndex } from '../../../shared/types';

interface BranchSelectorProps {
  branchIndex: BranchIndex;
  onCreateBranch: (name: string, description?: string) => void;
  onSwitchBranch: (name: string | null) => void;
  onDeleteBranch: (name: string) => void;
  onCompare: () => void;
  onMerge: (branchName: string) => void;
}

function sanitizeBranchName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function BranchSelector({
  branchIndex,
  onCreateBranch,
  onSwitchBranch,
  onDeleteBranch,
  onCompare,
  onMerge,
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  // Focus name input when creating
  useEffect(() => {
    if (creating && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [creating]);

  const activeName = branchIndex.activeBranch || 'main';
  const hasBranches = branchIndex.branches.length > 0;
  const isOnBranch = branchIndex.activeBranch !== null;

  function handleCreate() {
    const sanitized = sanitizeBranchName(newName);
    if (!sanitized) return;
    onCreateBranch(sanitized, newDesc.trim() || undefined);
    setNewName('');
    setNewDesc('');
    setCreating(false);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      setCreating(false);
    }
  }

  return (
    <div className="branch-selector" ref={containerRef}>
      <button
        className="branch-selector-toggle"
        onClick={() => setOpen(!open)}
        title={`Branch: ${activeName}`}
      >
        <svg
          className="branch-selector-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="5" cy="4" r="2" />
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="8" r="2" />
          <line x1="5" y1="6" x2="5" y2="10" />
          <path d="M5 6 C5 8 12 6 12 8" />
        </svg>
        <span className="branch-selector-name">{activeName}</span>
        <svg
          className="branch-selector-chevron"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3 4 L5 6 L7 4" />
        </svg>
      </button>

      {open && (
        <div className="branch-selector-dropdown">
          {/* Main branch */}
          <div className="branch-item-row">
            <button
              className={`branch-item ${!isOnBranch ? 'active' : ''}`}
              onClick={() => {
                onSwitchBranch(null);
                setOpen(false);
              }}
            >
              <span className="branch-item-name">main</span>
            </button>
          </div>

          {/* Other branches */}
          {branchIndex.branches.map((branch) => (
            <div className="branch-item-row" key={branch.name}>
              <button
                className={`branch-item ${branchIndex.activeBranch === branch.name ? 'active' : ''}`}
                onClick={() => {
                  onSwitchBranch(branch.name);
                  setOpen(false);
                }}
              >
                <span className="branch-item-name">{branch.name}</span>
                {branch.description && (
                  <span className="branch-desc">{branch.description}</span>
                )}
              </button>
              {branchIndex.activeBranch !== branch.name && (
                <button
                  className="branch-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBranch(branch.name);
                  }}
                  title={`Delete branch "${branch.name}"`}
                >
                  &times;
                </button>
              )}
            </div>
          ))}

          <div className="branch-dropdown-divider" />

          {/* Create form or button */}
          {creating ? (
            <div className="branch-create-form">
              <input
                ref={nameInputRef}
                className="branch-create-input"
                type="text"
                placeholder="branch-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <input
                className="branch-create-input"
                type="text"
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="branch-create-actions">
                <button onClick={handleCreate} disabled={!sanitizeBranchName(newName)}>
                  Create
                </button>
                <button onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="branch-action" onClick={() => setCreating(true)}>
              + New Branch
            </button>
          )}

          {/* Compare & Merge actions */}
          {hasBranches && (
            <>
              <button
                className="branch-action"
                onClick={() => {
                  onCompare();
                  setOpen(false);
                }}
              >
                Compare
              </button>
              {isOnBranch && (
                <button
                  className="branch-action"
                  onClick={() => {
                    onMerge(branchIndex.activeBranch!);
                    setOpen(false);
                  }}
                >
                  Merge to Main
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
