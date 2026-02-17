import { useState, useEffect } from 'react';

type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'not-available' }
  | { status: 'error'; message: string };

interface UpdateModalProps {
  onClose: () => void;
}

export default function UpdateModal({ onClose }: UpdateModalProps) {
  const [update, setUpdate] = useState<UpdateStatus>({ status: 'checking' });

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    const cleanup = window.electronAPI.onUpdateStatus((data: any) => {
      setUpdate(data);
    });
    return cleanup;
  }, []);

  return (
    <div className="update-modal-overlay" onClick={onClose}>
      <div className="update-modal" onClick={e => e.stopPropagation()}>
        {update.status === 'checking' && (
          <>
            <div className="update-modal-icon update-modal-spin">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4a12 12 0 1 0 12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="update-modal-title">Checking for updates...</h3>
            <p className="update-modal-subtitle">This won't take long</p>
          </>
        )}

        {update.status === 'not-available' && (
          <>
            <div className="update-modal-icon update-modal-icon-ok">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2"/>
                <path d="M11 16.5l3.5 3.5L21 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="update-modal-title">You're up to date</h3>
            <p className="update-modal-subtitle">Braidr is running the latest version</p>
            <div className="update-modal-actions">
              <button className="update-modal-btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {update.status === 'available' && (
          <>
            <div className="update-modal-icon update-modal-icon-new">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4v18M10 14l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 26h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="update-modal-title">Update available</h3>
            <p className="update-modal-subtitle">Version {update.version} is ready to download</p>
            <div className="update-modal-actions">
              <button className="update-modal-btn secondary" onClick={onClose}>Later</button>
              <button className="update-modal-btn primary" onClick={() => {
                setUpdate({ status: 'downloading', percent: 0 });
                window.electronAPI.updateDownload();
              }}>Download</button>
            </div>
          </>
        )}

        {update.status === 'downloading' && (
          <>
            <div className="update-modal-icon update-modal-spin">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4a12 12 0 1 0 12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="update-modal-title">Downloading update...</h3>
            <div className="update-modal-progress">
              <div className="update-modal-progress-bar">
                <div className="update-modal-progress-fill" style={{ width: `${update.percent}%` }} />
              </div>
              <span className="update-modal-percent">{Math.round(update.percent)}%</span>
            </div>
          </>
        )}

        {update.status === 'downloaded' && (
          <>
            <div className="update-modal-icon update-modal-icon-ok">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2"/>
                <path d="M11 16.5l3.5 3.5L21 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="update-modal-title">Update ready</h3>
            <p className="update-modal-subtitle">Version {update.version} will install on restart</p>
            <div className="update-modal-actions">
              <button className="update-modal-btn secondary" onClick={onClose}>Later</button>
              <button className="update-modal-btn primary" onClick={() => window.electronAPI.updateInstall()}>Restart Now</button>
            </div>
          </>
        )}

        {update.status === 'error' && (
          <>
            <div className="update-modal-icon update-modal-icon-error">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 11v7M16 21v1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="update-modal-title">Update failed</h3>
            <p className="update-modal-subtitle">{update.message}</p>
            <div className="update-modal-actions">
              <button className="update-modal-btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
