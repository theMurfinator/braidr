import posthog from 'posthog-js';

const POSTHOG_KEY = 'phc_MbxRLT0ahWowPOEwK6s136eboMxzQK8oaMvjWCkTmZV';
const POSTHOG_HOST = 'https://us.i.posthog.com';

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    persistence: 'localStorage',
  });
  initialized = true;
}

export function identify(userId: string, properties?: Record<string, any>) {
  if (!initialized) return;
  posthog.identify(userId, properties);
}

export function track(event: string, properties?: Record<string, any>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

/** Register properties that get sent with every subsequent event */
export function setProjectContext(props: { total_scenes: number; total_words: number; character_count: number }) {
  if (!initialized) return;
  posthog.register(props);
}
