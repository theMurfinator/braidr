import { useState, useEffect, useCallback } from 'react';
import { LicenseStatus } from '../../shared/types';

const api = (window as any).electronAPI;

interface SubscriptionDetails {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  plan: { name: string; amount: number; interval: string } | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentMethod: { brand: string; last4: string } | null;
  invoices: Array<{ date: string; amount: number; status: string; url: string | null }>;
}

interface AccountViewProps {
  licenseStatus: LicenseStatus | null;
  onLicenseChange: () => void;
}

export default function AccountView({ licenseStatus, onLicenseChange }: AccountViewProps) {
  const [details, setDetails] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getSubscriptionDetails();
      if (result.success) {
        setDetails(result.data);
      } else {
        setError(result.error || 'Could not load subscription details.');
      }
    } catch {
      setError('Could not connect to server.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  async function handleCancel() {
    setCanceling(true);
    try {
      const result = await api.cancelSubscription();
      if (result.success) {
        setShowCancelConfirm(false);
        await fetchDetails();
        onLicenseChange();
      } else {
        setError(result.error || 'Could not cancel subscription.');
      }
    } catch {
      setError('Could not connect to server.');
    }
    setCanceling(false);
  }

  async function handleReactivate() {
    setReactivating(true);
    try {
      const result = await api.reactivateSubscription();
      if (result.success) {
        await fetchDetails();
        onLicenseChange();
      } else {
        setError(result.error || 'Could not reactivate subscription.');
      }
    } catch {
      setError('Could not connect to server.');
    }
    setReactivating(false);
  }

  function handleSubscribe() {
    api.openPurchaseUrl();
  }

  function handleUpdatePayment() {
    api.openBillingPortal();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatAmount(cents: number) {
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
  }

  function capitalizeFirst(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Card brand icons (simple text fallback)
  function cardBrandLabel(brand: string) {
    const brands: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'Amex',
      discover: 'Discover',
    };
    return brands[brand] || capitalizeFirst(brand);
  }

  const state = licenseStatus?.state;
  const isTrial = state === 'trial';
  const isLicensed = state === 'licensed';
  const isExpired = state === 'expired' || state === 'trial_expired' || state === 'invalid';

  if (loading) {
    return (
      <div className="account-view">
        <div className="account-view-inner">
          <div className="account-loading">
            <div className="license-loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-view">
      <div className="account-view-inner">
        <h1 className="account-title">Account</h1>

        {error && (
          <div className="account-error">
            {error}
            <button className="account-error-dismiss" onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* Email & Status */}
        <section className="account-section">
          <div className="account-section-row">
            <span className="account-label">Email</span>
            <span className="account-value">{licenseStatus?.email || '—'}</span>
          </div>
          <div className="account-section-row">
            <span className="account-label">Status</span>
            <span className="account-value">
              {isTrial && (
                <span className="account-badge account-badge--trial">
                  Free Trial — {licenseStatus?.trialDaysRemaining} day{licenseStatus?.trialDaysRemaining !== 1 ? 's' : ''} remaining
                </span>
              )}
              {isLicensed && !details?.cancelAtPeriodEnd && (
                <span className="account-badge account-badge--active">Active</span>
              )}
              {isLicensed && details?.cancelAtPeriodEnd && (
                <span className="account-badge account-badge--canceling">
                  Cancels {details.currentPeriodEnd ? formatDate(details.currentPeriodEnd) : 'at period end'}
                </span>
              )}
              {isExpired && (
                <span className="account-badge account-badge--expired">Expired</span>
              )}
            </span>
          </div>
        </section>

        {/* Trial CTA */}
        {isTrial && (
          <section className="account-section account-cta-section">
            <p className="account-cta-text">
              Subscribe to keep your projects, unlimited scenes, and all features.
            </p>
            <button className="license-btn-primary" onClick={handleSubscribe}>
              Subscribe — $39/year
            </button>
          </section>
        )}

        {/* Expired CTA */}
        {isExpired && (
          <section className="account-section account-cta-section">
            <p className="account-cta-text">
              Your subscription has expired. Resubscribe to continue using Braidr.
            </p>
            <button className="license-btn-primary" onClick={handleSubscribe}>
              Resubscribe — $39/year
            </button>
          </section>
        )}

        {/* Plan & Billing (licensed users) */}
        {isLicensed && details?.plan && (
          <section className="account-section">
            <h2 className="account-section-title">Plan</h2>
            <div className="account-section-row">
              <span className="account-label">{details.plan.name}</span>
              <span className="account-value">
                {formatAmount(details.plan.amount)}/{details.plan.interval}
              </span>
            </div>
            {details.currentPeriodEnd && !details.cancelAtPeriodEnd && (
              <div className="account-section-row">
                <span className="account-label">Next billing date</span>
                <span className="account-value">{formatDate(details.currentPeriodEnd)}</span>
              </div>
            )}
          </section>
        )}

        {/* Payment Method */}
        {isLicensed && details?.paymentMethod && (
          <section className="account-section">
            <h2 className="account-section-title">Payment Method</h2>
            <div className="account-section-row">
              <span className="account-value">
                {cardBrandLabel(details.paymentMethod.brand)} &bull;&bull;&bull;&bull; {details.paymentMethod.last4}
              </span>
              <button className="account-link-btn" onClick={handleUpdatePayment}>
                Update
              </button>
            </div>
          </section>
        )}

        {/* Billing History */}
        {details && details.invoices.length > 0 && (
          <section className="account-section">
            <h2 className="account-section-title">Billing History</h2>
            <table className="account-invoices-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {details.invoices.map((inv, i) => (
                  <tr key={i}>
                    <td>{formatDate(inv.date)}</td>
                    <td>{formatAmount(inv.amount)}</td>
                    <td>
                      <span className={`account-invoice-status account-invoice-status--${inv.status}`}>
                        {capitalizeFirst(inv.status)}
                      </span>
                    </td>
                    <td>
                      {inv.url && (
                        <button
                          className="account-link-btn"
                          onClick={() => window.open(inv.url!, '_blank')}
                        >
                          Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Cancel / Reactivate */}
        {isLicensed && (
          <section className="account-section account-danger-section">
            {details?.cancelAtPeriodEnd ? (
              <div className="account-reactivate">
                <p className="account-danger-text">
                  Your subscription is set to cancel{details.currentPeriodEnd ? ` on ${formatDate(details.currentPeriodEnd)}` : ''}. You'll keep access until then.
                </p>
                <button
                  className="license-btn-secondary"
                  onClick={handleReactivate}
                  disabled={reactivating}
                >
                  {reactivating ? 'Reactivating...' : 'Reactivate Subscription'}
                </button>
              </div>
            ) : (
              <>
                {!showCancelConfirm ? (
                  <button
                    className="account-cancel-btn"
                    onClick={() => setShowCancelConfirm(true)}
                  >
                    Cancel subscription
                  </button>
                ) : (
                  <div className="account-cancel-confirm">
                    <p className="account-danger-text">
                      Your access continues until{details?.currentPeriodEnd ? ` ${formatDate(details.currentPeriodEnd)}` : ' the end of your billing period'}. You can reactivate anytime before then.
                    </p>
                    <div className="account-cancel-confirm-actions">
                      <button
                        className="account-cancel-confirm-btn"
                        onClick={handleCancel}
                        disabled={canceling}
                      >
                        {canceling ? 'Canceling...' : 'Confirm Cancellation'}
                      </button>
                      <button
                        className="account-link-btn"
                        onClick={() => setShowCancelConfirm(false)}
                      >
                        Never mind
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
