import { PostHog } from 'posthog-node';
import { app } from 'electron';
import * as crypto from 'crypto';

let client: PostHog | null = null;
let distinctId: string = '';
let appOpenedAt: number = Date.now();

function getAnonymousId(): string {
  const machineId = app.getPath('userData');
  return 'anon_' + crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 16);
}

export function initPostHog(): void {
  const apiKey = process.env.VITE_POSTHOG_KEY;
  if (!apiKey || apiKey === 'phc_YOUR_KEY_HERE') return;

  client = new PostHog(apiKey, {
    host: process.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 20,
    flushInterval: 30000,
  });

  distinctId = getAnonymousId();
  appOpenedAt = Date.now();
}

export function identifyUser(licenseState: string, properties: Record<string, any> = {}): void {
  if (!client) return;
  client.identify({
    distinctId,
    properties: {
      license_state: licenseState,
      app_version: app.getVersion(),
      platform: process.platform,
      os_version: process.getSystemVersion(),
      ...properties,
    },
  });
}

export function aliasUser(licenseKey: string): void {
  if (!client) return;
  const hashedKey = crypto.createHash('sha256').update(licenseKey).digest('hex').substring(0, 16);
  client.alias({ distinctId: 'license_' + hashedKey, alias: distinctId });
}

export function captureEvent(event: string, properties: Record<string, any> = {}): void {
  if (!client) return;
  client.capture({
    distinctId,
    event,
    properties: {
      app_version: app.getVersion(),
      platform: process.platform,
      ...properties,
    },
  });
}

export function getSessionDurationMs(): number {
  return Date.now() - appOpenedAt;
}

export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  await client.shutdown();
}
