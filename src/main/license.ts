import { app, shell, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { LicenseData, LicenseStatus } from '../shared/types';

// ─── Configuration ──────────────────────────────────────────────────────────
const LEMONSQUEEZY_STORE_ID = 'braidr';
const LEMONSQUEEZY_STORE_ID_NUM = process.env.LEMONSQUEEZY_STORE_ID || '';

const TRIAL_DAYS = 14;
const PURCHASE_URL = 'https://braidr.lemonsqueezy.com/checkout/buy/1310252';
const BILLING_API_URL = process.env.BILLING_API_URL || 'https://braidr-api.vercel.app/api/portal/billing';
const LICENSE_FILE = 'license.json';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLicensePath(): string {
  return path.join(app.getPath('userData'), LICENSE_FILE);
}

function readLicenseData(): LicenseData {
  const licensePath = getLicensePath();
  if (fs.existsSync(licensePath)) {
    try {
      return JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
    } catch {
      // Corrupted file — start fresh trial
    }
  }
  // First launch: start trial
  const data: LicenseData = {
    trialStartDate: new Date().toISOString(),
  };
  writeLicenseData(data);
  return data;
}

function writeLicenseData(data: LicenseData): void {
  const licensePath = getLicensePath();
  fs.writeFileSync(licensePath, JSON.stringify(data, null, 2), 'utf-8');
}

function trialDaysRemaining(trialStartDate: string): number {
  const start = new Date(trialStartDate).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - elapsed);
}

// ─── LemonSqueezy License API ───────────────────────────────────────────────

async function validateKeyWithLemonSqueezy(licenseKey: string): Promise<{
  valid: boolean;
  expiresAt?: string;
  email?: string;
  detail?: string;
}> {
  try {
    const response = await net.fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ license_key: licenseKey }).toString(),
    });

    const result = await response.json();

    if (result.valid) {
      // Security: verify the license belongs to our store
      if (result.meta?.store_id && LEMONSQUEEZY_STORE_ID_NUM &&
          String(result.meta.store_id) !== String(LEMONSQUEEZY_STORE_ID_NUM)) {
        return { valid: false, detail: 'License key does not belong to this product' };
      }

      return {
        valid: true,
        expiresAt: result.license_key?.expires_at || undefined,
        email: result.meta?.customer_email || undefined,
      };
    }

    return {
      valid: false,
      detail: result.error || 'License key is not valid',
    };
  } catch (error) {
    // Network error — use cached status if available
    return { valid: false, detail: 'Could not connect to license server' };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const data = readLicenseData();

  // If there's a stored license key, validate it
  if (data.licenseKey) {
    const lastValidation = data.lastValidation ? new Date(data.lastValidation) : null;
    const hoursSinceValidation = lastValidation
      ? (Date.now() - lastValidation.getTime()) / (1000 * 60 * 60)
      : Infinity;

    // Re-validate every 24 hours, otherwise use cached status
    if (hoursSinceValidation < 24 && data.cachedStatus) {
      return data.cachedStatus;
    }

    const result = await validateKeyWithLemonSqueezy(data.licenseKey);

    if (result.valid) {
      // Check if the license has expired (annual subscription)
      if (result.expiresAt) {
        const expiryDate = new Date(result.expiresAt);
        if (expiryDate.getTime() < Date.now()) {
          const status: LicenseStatus = {
            state: 'expired',
            licenseKey: data.licenseKey,
            expiresAt: result.expiresAt,
            customerEmail: result.email,
          };
          data.cachedStatus = status;
          data.lastValidation = new Date().toISOString();
          writeLicenseData(data);
          return status;
        }
      }

      const status: LicenseStatus = {
        state: 'licensed',
        licenseKey: data.licenseKey,
        expiresAt: result.expiresAt,
        customerEmail: result.email,
      };
      data.cachedStatus = status;
      data.lastValidation = new Date().toISOString();
      writeLicenseData(data);
      return status;
    }

    // Validation failed but we're offline — be generous, use cached
    if (result.detail?.includes('Could not connect') && data.cachedStatus?.state === 'licensed') {
      return data.cachedStatus;
    }

    // Key is genuinely invalid
    const status: LicenseStatus = {
      state: 'invalid',
      licenseKey: data.licenseKey,
    };
    data.cachedStatus = status;
    data.lastValidation = new Date().toISOString();
    writeLicenseData(data);
    return status;
  }

  // No license key — check trial
  const remaining = trialDaysRemaining(data.trialStartDate);
  if (remaining > 0) {
    return {
      state: 'trial',
      trialDaysRemaining: remaining,
    };
  }

  return {
    state: 'expired',
    trialDaysRemaining: 0,
  };
}

export async function activateLicense(licenseKey: string): Promise<LicenseStatus> {
  const trimmedKey = licenseKey.trim();

  const result = await validateKeyWithLemonSqueezy(trimmedKey);

  if (!result.valid) {
    return {
      state: 'invalid',
      licenseKey: trimmedKey,
    };
  }

  // Check expiry
  if (result.expiresAt) {
    const expiryDate = new Date(result.expiresAt);
    if (expiryDate.getTime() < Date.now()) {
      return {
        state: 'expired',
        licenseKey: trimmedKey,
        expiresAt: result.expiresAt,
      };
    }
  }

  // Save the valid key
  const data = readLicenseData();
  data.licenseKey = trimmedKey;
  data.lastValidation = new Date().toISOString();
  const status: LicenseStatus = {
    state: 'licensed',
    licenseKey: trimmedKey,
    expiresAt: result.expiresAt,
    customerEmail: result.email,
  };
  data.cachedStatus = status;
  writeLicenseData(data);

  return status;
}

export function deactivateLicense(): LicenseStatus {
  const data = readLicenseData();
  delete data.licenseKey;
  delete data.lastValidation;
  delete data.cachedStatus;
  writeLicenseData(data);

  const remaining = trialDaysRemaining(data.trialStartDate);
  if (remaining > 0) {
    return { state: 'trial', trialDaysRemaining: remaining };
  }
  return { state: 'expired', trialDaysRemaining: 0 };
}

export function openPurchaseUrl(): void {
  shell.openExternal(PURCHASE_URL);
}

export async function openBillingPortal(): Promise<{ success: boolean; error?: string }> {
  const data = readLicenseData();
  if (!data.licenseKey) {
    return { success: false, error: 'No license key found' };
  }

  try {
    const response = await net.fetch(BILLING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: data.licenseKey }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: (body as any).error || `Server returned ${response.status}` };
    }

    const result = await response.json() as { url: string };
    await shell.openExternal(result.url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not connect to billing server' };
  }
}
