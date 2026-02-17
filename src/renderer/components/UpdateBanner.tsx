import React, { useState, useEffect } from 'react';

type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'not-available' }
  | { status: 'error'; message: string };

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateStatus>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    const cleanup = window.electronAPI.onUpdateStatus((data: any) => {
      setUpdate((prev) => {
        // Only re-show banner when status genuinely changes (not on every progress tick)
        if (data.status !== prev.status && data.status !== 'not-available' && data.status !== 'idle') {
          setDismissed(false);
        }
        return data;
      });
    });
    return cleanup;
  }, []);

  if (dismissed) return null;

  // Don't show anything for idle, checking, or not-available states
  if (update.status === 'idle' || update.status === 'checking' || update.status === 'not-available') {
    return null;
  }

  return (
    <div className={`update-banner update-banner-${update.status}`}>
      <div className="update-banner-content">
        {update.status === 'available' && (
          <>
            <div className="update-banner-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="update-banner-text">
              Version {update.version} is available
            </span>
            <button className="update-banner-action" onClick={() => {
              setUpdate({ status: 'downloading', percent: 0 });
              window.electronAPI.updateDownload();
            }}>
              Download
            </button>
          </>
        )}

        {update.status === 'downloading' && (
          <>
            <div className="update-banner-icon update-banner-icon-spin">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1a7 7 0 1 0 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="update-banner-text">
              Downloading update... {Math.round(update.percent)}%
            </span>
            <div className="update-banner-progress">
              <div className="update-banner-progress-fill" style={{ width: `${update.percent}%` }} />
            </div>
          </>
        )}

        {update.status === 'downloaded' && (
          <>
            <div className="update-banner-icon update-banner-icon-ready">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="update-banner-text">
              Update ready — restart to install v{update.version}
            </span>
            <button className="update-banner-action update-banner-action-install" onClick={() => window.electronAPI.updateInstall()}>
              Restart Now
            </button>
          </>
        )}

        {update.status === 'error' && (
          <>
            <div className="update-banner-icon update-banner-icon-error">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="update-banner-text">
              Update failed: {update.message}
            </span>
          </>
        )}
      </div>

      <button className="update-banner-dismiss" onClick={() => setDismissed(true)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
