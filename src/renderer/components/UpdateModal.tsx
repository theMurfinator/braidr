interface UpdateModalProps {
  currentVersion: string;
  latestVersion: string;
  changelog: string;
  onUpdate: () => void;
  onDismiss: () => void;
}

export default function UpdateModal({ currentVersion, latestVersion, changelog, onUpdate, onDismiss }: UpdateModalProps) {
  return (
    <div className="update-overlay" onClick={onDismiss}>
      <div className="update-modal" onClick={e => e.stopPropagation()}>
        <div className="update-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <h3 className="update-title">Update Available</h3>
        <p className="update-versions">
          <span className="update-version-old">v{currentVersion}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
          <span className="update-version-new">v{latestVersion}</span>
        </p>
        {changelog && (
          <div className="update-changelog">
            <p className="update-changelog-label">What's new</p>
            <p className="update-changelog-text">{changelog}</p>
          </div>
        )}
        <div className="update-actions">
          <button className="update-dismiss-btn" onClick={onDismiss}>Later</button>
          <button className="update-download-btn" onClick={onUpdate}>Download Update</button>
        </div>
      </div>
    </div>
  );
}
