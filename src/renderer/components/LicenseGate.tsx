import React, { useState, useEffect } from 'react';
import { LicenseStatus } from '../../shared/types';

const api = (window as any).electronAPI;

interface LicenseGateProps {
  children: React.ReactNode;
}

/**
 * Wraps the app and checks license status on mount.
 * Shows trial banner, license activation dialog, or expired modal as needed.
 * Lets the app render normally when licensed or in active trial.
 */
export default function LicenseGate({ children }: LicenseGateProps) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Toggle body class for trial banner offset
  // NOTE: This useEffect MUST be before any conditional returns to respect Rules of Hooks
  useEffect(() => {
    if (status?.state === 'trial') {
      document.body.classList.add('has-trial-banner');
    } else {
      document.body.classList.remove('has-trial-banner');
    }
    return () => document.body.classList.remove('has-trial-banner');
  }, [status?.state]);

  useEffect(() => {
    checkLicense();
    // Listen for menu-triggered license dialog
    const cleanup = api.onShowLicenseDialog?.(() => {
      setShowActivateDialog(true);
    });
    return () => cleanup?.();
  }, []);

  async function checkLicense() {
    setLoading(true);
    try {
      const result = await api.getLicenseStatus();
      if (result.success) {
        setStatus(result.data);
      }
    } catch {
      // If license check fails, allow usage (offline grace)
      setStatus({ state: 'trial', trialDaysRemaining: 14 });
    }
    setLoading(false);
  }

  async function handleActivate() {
    if (!licenseKeyInput.trim()) return;
    setActivating(true);
    setActivateError(null);

    try {
      const result = await api.activateLicense(licenseKeyInput.trim());
      if (result.success) {
        const newStatus: LicenseStatus = result.data;
        if (newStatus.state === 'licensed') {
          setStatus(newStatus);
          setShowActivateDialog(false);
          setLicenseKeyInput('');
        } else if (newStatus.state === 'expired') {
          setActivateError('This license has expired. Please renew your subscription.');
        } else {
          setActivateError('Invalid license key. Please check and try again.');
        }
      } else {
        setActivateError('Could not validate license. Check your internet connection.');
      }
    } catch {
      setActivateError('Could not connect to license server.');
    }
    setActivating(false);
  }

  async function handleDeactivate() {
    try {
      const result = await api.deactivateLicense();
      if (result.success) {
        setStatus(result.data);
      }
    } catch { /* ignore */ }
  }

  function handlePurchase() {
    api.openPurchaseUrl();
  }

  if (loading) {
    return (
      <div className="license-loading">
        <div className="license-loading-spinner" />
      </div>
    );
  }

  // Trial expired or license expired — block the app
  if (status && status.state === 'expired' && !status.licenseKey) {
    return (
      <div className="license-expired-screen">
        <div className="license-expired-card">
          <h2>Your trial has ended</h2>
          <p>Thanks for trying Braidr! To keep using it, activate a license key.</p>
          <div className="license-expired-actions">
            <button className="license-btn-primary" onClick={handlePurchase}>
              Get a License - $39/year
            </button>
            <button className="license-btn-secondary" onClick={() => setShowActivateDialog(true)}>
              I have a license key
            </button>
          </div>
        </div>

        {showActivateDialog && (
          <div className="modal-overlay" onClick={() => setShowActivateDialog(false)}>
            <div className="license-dialog" onClick={e => e.stopPropagation()}>
              <h3>Activate License</h3>
              <p>Enter the license key from your purchase confirmation email.</p>
              <input
                type="text"
                className="license-key-input"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={licenseKeyInput}
                onChange={e => setLicenseKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                autoFocus
              />
              {activateError && <p className="license-error">{activateError}</p>}
              <div className="license-dialog-actions">
                <button className="license-btn-secondary" onClick={() => setShowActivateDialog(false)}>
                  Cancel
                </button>
                <button className="license-btn-primary" onClick={handleActivate} disabled={activating || !licenseKeyInput.trim()}>
                  {activating ? 'Validating...' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // License expired (had a key but subscription lapsed)
  if (status && status.state === 'expired' && status.licenseKey) {
    return (
      <div className="license-expired-screen">
        <div className="license-expired-card">
          <h2>Your license has expired</h2>
          <p>Your annual subscription has ended. Renew to continue using Braidr.</p>
          <div className="license-expired-actions">
            <button className="license-btn-primary" onClick={handlePurchase}>
              Renew - $39/year
            </button>
            <button className="license-btn-secondary" onClick={() => setShowActivateDialog(true)}>
              Enter new license key
            </button>
          </div>
        </div>

        {showActivateDialog && (
          <div className="modal-overlay" onClick={() => setShowActivateDialog(false)}>
            <div className="license-dialog" onClick={e => e.stopPropagation()}>
              <h3>Activate License</h3>
              <input
                type="text"
                className="license-key-input"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={licenseKeyInput}
                onChange={e => setLicenseKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                autoFocus
              />
              {activateError && <p className="license-error">{activateError}</p>}
              <div className="license-dialog-actions">
                <button className="license-btn-secondary" onClick={() => setShowActivateDialog(false)}>
                  Cancel
                </button>
                <button className="license-btn-primary" onClick={handleActivate} disabled={activating || !licenseKeyInput.trim()}>
                  {activating ? 'Validating...' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Invalid license key
  if (status && status.state === 'invalid') {
    return (
      <div className="license-expired-screen">
        <div className="license-expired-card">
          <h2>License key is invalid</h2>
          <p>The stored license key could not be validated. Please enter a valid key or purchase a new license.</p>
          <div className="license-expired-actions">
            <button className="license-btn-primary" onClick={() => setShowActivateDialog(true)}>
              Enter license key
            </button>
            <button className="license-btn-secondary" onClick={handlePurchase}>
              Get a License - $39/year
            </button>
            <button className="license-btn-text" onClick={handleDeactivate}>
              Remove stored key
            </button>
          </div>
        </div>

        {showActivateDialog && (
          <div className="modal-overlay" onClick={() => setShowActivateDialog(false)}>
            <div className="license-dialog" onClick={e => e.stopPropagation()}>
              <h3>Activate License</h3>
              <input
                type="text"
                className="license-key-input"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={licenseKeyInput}
                onChange={e => setLicenseKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                autoFocus
              />
              {activateError && <p className="license-error">{activateError}</p>}
              <div className="license-dialog-actions">
                <button className="license-btn-secondary" onClick={() => setShowActivateDialog(false)}>
                  Cancel
                </button>
                <button className="license-btn-primary" onClick={handleActivate} disabled={activating || !licenseKeyInput.trim()}>
                  {activating ? 'Validating...' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active trial or licensed — render the app
  return (
    <>
      {/* Trial banner */}
      {status?.state === 'trial' && (
        <div className="license-trial-banner">
          <span>
            Trial: {status.trialDaysRemaining} day{status.trialDaysRemaining !== 1 ? 's' : ''} remaining
          </span>
          <div className="license-trial-banner-actions">
            <button className="license-banner-btn" onClick={() => setShowActivateDialog(true)}>
              Enter License Key
            </button>
            <button className="license-banner-btn-primary" onClick={handlePurchase}>
              Buy Now
            </button>
          </div>
        </div>
      )}

      {children}

      {/* Activate dialog (from trial banner) */}
      {showActivateDialog && (
        <div className="modal-overlay" onClick={() => setShowActivateDialog(false)}>
          <div className="license-dialog" onClick={e => e.stopPropagation()}>
            <h3>Activate License</h3>
            <p>Enter the license key from your purchase confirmation email.</p>
            <input
              type="text"
              className="license-key-input"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={licenseKeyInput}
              onChange={e => setLicenseKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleActivate()}
              autoFocus
            />
            {activateError && <p className="license-error">{activateError}</p>}
            <div className="license-dialog-actions">
              <button className="license-btn-secondary" onClick={() => setShowActivateDialog(false)}>
                Cancel
              </button>
              <button className="license-btn-primary" onClick={handleActivate} disabled={activating || !licenseKeyInput.trim()}>
                {activating ? 'Validating...' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
