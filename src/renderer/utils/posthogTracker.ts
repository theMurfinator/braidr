const api = (window as any).electronAPI;

/**
 * Track an event via PostHog (sends to main process via IPC).
 * Fire-and-forget — never blocks the UI.
 * Respects telemetry opt-out preference.
 */
export function track(event: string, properties: Record<string, any> = {}): void {
  if (localStorage.getItem('braidr-telemetry-opt-out') === 'true') return;
  api?.captureAnalyticsEvent?.(event, properties).catch(() => {
    // Silently ignore tracking failures
  });
}
