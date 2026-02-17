import { useState, useEffect } from 'react';

export function UpdateBanner() {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    const cleanup = window.electronAPI.onUpdateStatus((data: any) => {
      if (data.status === 'available' && data.version) {
        setAvailableVersion(data.version);
        setDismissed(false);
      }
    });
    return cleanup;
  }, []);

  if (dismissed || !availableVersion) return null;

  return (
    <div className="update-banner">
      <span className="update-banner-text">
        Version {availableVersion} is available. Use <strong>Check for Updates</strong> in Settings to install.
      </span>
      <button className="update-banner-dismiss" onClick={() => setDismissed(true)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
