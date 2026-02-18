import React, { useState, useEffect } from 'react';
import { LicenseStatus } from '../../shared/types';

const api = (window as any).electronAPI;

interface LicenseGateProps {
  children: React.ReactNode;
  onNavigateToAccount?: () => void;
}

/**
 * Wraps the app and checks license status on mount.
 * Shows email entry, trial expired, or subscription expired screens as needed.
 * Lets the app render normally when licensed or in trial.
 */
export default function LicenseGate({ children, onNavigateToAccount }: LicenseGateProps) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  useEffect(() => {
    checkLicense();
    const cleanup = api.onShowLicenseDialog?.(() => {
      setShowAccountDialog(true);
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
      setStatus({ state: 'licensed' });
    }
    setLoading(false);
  }

  async function handleStartTrial() {
    if (!emailInput.trim()) return;
    setActivating(true);
    setActivateError(null);

    try {
      const result = await api.startTrial(emailInput.trim());
      if (result.success) {
        setStatus(result.data);
        setEmailInput('');
      } else {
        setActivateError('Could not start trial. Please try again.');
      }
    } catch {
      setActivateError('Could not connect. Please check your internet connection.');
    }
    setActivating(false);
  }

  async function handleActivate() {
    const email = emailInput.trim() || status?.email;
    if (!email) return;
    setActivating(true);
    setActivateError(null);

    try {
      const result = await api.activateLicense(email);
      if (result.success) {
        const newStatus: LicenseStatus = result.data;
        if (newStatus.state === 'licensed') {
          setStatus(newStatus);
          setShowAccountDialog(false);
          setEmailInput('');
        } else {
          setActivateError('No active subscription found for this email.');
        }
      } else {
        setActivateError('Could not validate. Check your internet connection.');
      }
    } catch {
      setActivateError('Could not connect to server.');
    }
    setActivating(false);
  }

  function handlePurchase() {
    api.openPurchaseUrl();
  }

  async function handleSignOut() {
    await api.deactivateLicense();
    setShowAccountDialog(false);
    setStatus({ state: 'unlicensed' });
  }

  if (loading) {
    return (
      <div className="license-loading">
        <div className="license-loading-spinner" />
      </div>
    );
  }

  // First launch — email input + start trial
  if (status && status.state === 'unlicensed') {
    return (
      <div className="license-expired-screen">
        <div className="license-expired-card">
          <h2>Welcome to Braidr</h2>
          <p>Enter your email to start a 14-day free trial. No credit card required.</p>
          <input
            type="email"
            className="license-key-input"
            placeholder="you@example.com"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStartTrial()}
            autoFocus
          />
          {activateError && <p className="license-error">{activateError}</p>}
          <div className="license-expired-actions">
            <button className="license-btn-primary" onClick={handleStartTrial} disabled={activating || !emailInput.trim()}>
              {activating ? 'Starting...' : 'Start Free Trial'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Trial expired — prompt to subscribe
  if (status && status.state === 'trial_expired') {
    return (
      <div className="license-expired-screen">
        <div className="license-expired-card">
          <h2>Your free trial has ended</h2>
          <p>Subscribe to keep writing with Braidr. Your projects are still here.</p>
          <div className="license-expired-actions">
            <button className="license-btn-primary" onClick={handlePurchase}>
              Subscribe — $39/year
            </button>
            <button className="license-btn-secondary" onClick={handleActivate} disabled={activating}>
              {activating ? 'Checking...' : 'I already subscribed'}
            </button>
          </div>
          {activateError && <p className="license-error">{activateError}</p>}
        </div>
      </div>
    );
  }

  // Subscription expired / canceled
  if (status && (status.state === 'expired' || status.state === 'invalid')) {
    return (
      <div className="license-expired-screen">
        <div className="license-expired-card">
          <h2>Your subscription has expired</h2>
          <p>Renew your subscription to continue using Braidr.</p>
          <div className="license-expired-actions">
            <button className="license-btn-primary" onClick={handlePurchase}>
              Renew — $39/year
            </button>
            <button className="license-btn-secondary" onClick={() => { onNavigateToAccount?.(); }}>
              Manage Subscription
            </button>
            <button className="license-btn-secondary" onClick={handleActivate} disabled={activating}>
              {activating ? 'Checking...' : 'I already renewed'}
            </button>
          </div>
          {activateError && <p className="license-error">{activateError}</p>}
        </div>
      </div>
    );
  }

  // Licensed or trial — render the app
  return (
    <>
      {children}

      {/* Account dialog (from menu) */}
      {showAccountDialog && (
        <div className="modal-overlay" onClick={() => setShowAccountDialog(false)}>
          <div className="license-dialog" onClick={e => e.stopPropagation()}>
            <h3>Account</h3>
            {status?.email && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{status.email}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#71717a' }}>
                  {status.state === 'licensed' ? 'Active subscription' :
                   status.state === 'trial' ? `Trial — ${status.trialDaysRemaining} day${status.trialDaysRemaining !== 1 ? 's' : ''} left` :
                   'No active subscription'}
                  {status.cancelAtPeriodEnd && status.expiresAt && (
                    <> — cancels {new Date(status.expiresAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            )}
            {status?.state === 'licensed' && (
              <button className="license-btn-secondary" style={{ width: '100%', marginBottom: 8 }} onClick={() => { setShowAccountDialog(false); onNavigateToAccount?.(); }}>
                Manage Subscription
              </button>
            )}
            {status?.state === 'trial' && (
              <button className="license-btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={() => { handlePurchase(); setShowAccountDialog(false); }}>
                Subscribe — $39/year
              </button>
            )}
            <div className="license-dialog-actions">
              <button className="license-btn-secondary" onClick={() => setShowAccountDialog(false)}>
                Close
              </button>
              <button className="license-btn-secondary" style={{ color: '#ef4444', marginTop: 8 }} onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
