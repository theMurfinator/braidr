import { app, net, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { LicenseData, LicenseStatus } from '../shared/types';

// ─── Configuration ──────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE_URL || 'https://braidr-api.vercel.app';
const TRIAL_DAYS = 14;
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
      // Corrupted file — start fresh
    }
  }
  const data: LicenseData = {};
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

// ─── Server API ─────────────────────────────────────────────────────────────

async function validateEmailWithServer(email: string): Promise<{
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}> {
  try {
    const response = await net.fetch(`${API_BASE}/api/license?email=${encodeURIComponent(email)}`);
    if (!response.ok) {
      return { status: 'none' };
    }
    return await response.json() as any;
  } catch {
    return { status: 'none' };
  }
}

// ─── Exported helpers ────────────────────────────────────────────────────────

export function getStoredEmail(): string | undefined {
  return readLicenseData().email;
}

export function getApiBase(): string {
  return API_BASE;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const data = readLicenseData();

  // Migration: old license key exists but no email — prompt re-entry
  if (data.licenseKey && !data.email) {
    return { state: 'unlicensed' };
  }

  // If there's a stored email, validate with server
  if (data.email) {
    const lastValidation = data.lastValidation ? new Date(data.lastValidation) : null;
    const hoursSinceValidation = lastValidation
      ? (Date.now() - lastValidation.getTime()) / (1000 * 60 * 60)
      : Infinity;

    // Re-validate every 24 hours, otherwise use cached status
    if (hoursSinceValidation < 24 && data.cachedStatus) {
      return data.cachedStatus;
    }

    const result = await validateEmailWithServer(data.email);

    // Map Stripe status to app states
    if (result.status === 'active' || result.status === 'trialing' || result.status === 'past_due') {
      const status: LicenseStatus = {
        state: 'licensed',
        email: data.email,
        expiresAt: result.currentPeriodEnd,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      };
      data.cachedStatus = status;
      data.lastValidation = new Date().toISOString();
      writeLicenseData(data);
      return status;
    }

    if (result.status === 'canceled') {
      const status: LicenseStatus = {
        state: 'expired',
        email: data.email,
        expiresAt: result.currentPeriodEnd,
      };
      data.cachedStatus = status;
      data.lastValidation = new Date().toISOString();
      writeLicenseData(data);
      return status;
    }

    // status === 'none' — check if offline and be generous
    if (data.cachedStatus?.state === 'licensed') {
      return data.cachedStatus;
    }

    // No subscription found — check if still in trial
    if (data.trialStartDate) {
      const remaining = trialDaysRemaining(data.trialStartDate);
      if (remaining > 0) {
        return { state: 'trial', email: data.email, trialDaysRemaining: remaining };
      }
      return { state: 'trial_expired', email: data.email };
    }

    return { state: 'trial_expired', email: data.email };
  }

  // No email stored — require email entry even if local trial exists
  // (handles migration from pre-email trial versions)

  // First launch — unlicensed (user must enter email to start trial)
  return { state: 'unlicensed' };
}

export async function startTrial(email: string): Promise<LicenseStatus> {
  const data = readLicenseData();
  data.email = email.toLowerCase().trim();
  data.trialStartDate = data.trialStartDate || new Date().toISOString();
  writeLicenseData(data);

  // Register with server (fire and forget)
  try {
    await net.fetch(`${API_BASE}/api/users?action=register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, source: 'app' }),
    });
  } catch {
    // Non-fatal — trial still works locally
  }

  return {
    state: 'trial',
    email: data.email,
    trialDaysRemaining: TRIAL_DAYS,
  };
}

export async function activateLicense(email: string): Promise<LicenseStatus> {
  const trimmedEmail = email.toLowerCase().trim();
  const result = await validateEmailWithServer(trimmedEmail);

  if (result.status === 'active' || result.status === 'trialing' || result.status === 'past_due') {
    const data = readLicenseData();
    data.email = trimmedEmail;
    data.lastValidation = new Date().toISOString();
    const status: LicenseStatus = {
      state: 'licensed',
      email: trimmedEmail,
      expiresAt: result.currentPeriodEnd,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
    };
    data.cachedStatus = status;
    writeLicenseData(data);
    return status;
  }

  return {
    state: 'invalid',
    email: trimmedEmail,
  };
}

export function deactivateLicense(): LicenseStatus {
  const data = readLicenseData();
  delete data.email;
  delete data.licenseKey;
  delete data.lastValidation;
  delete data.cachedStatus;
  writeLicenseData(data);

  return { state: 'unlicensed' };
}

export async function openPurchaseUrl(): Promise<void> {
  const data = readLicenseData();
  try {
    const response = await net.fetch(`${API_BASE}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email || '' }),
    });
    const result = await response.json() as any;
    if (result.url) {
      shell.openExternal(result.url);
    }
  } catch {
    // Fallback: open base URL
    shell.openExternal('https://getbraider.com');
  }
}

export async function openBillingPortal(): Promise<{ success: boolean; url?: string; error?: string }> {
  const data = readLicenseData();

  if (!data.email) {
    return { success: false, error: 'No email on file' };
  }

  try {
    const response = await net.fetch(`${API_BASE}/api/portal/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email }),
    });
    const result = await response.json() as any;
    if (result.url) {
      return { success: true, url: result.url };
    }
    return { success: false, error: result.error || 'Could not open billing portal' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not open customer portal' };
  }
}
