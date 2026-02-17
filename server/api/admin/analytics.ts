import type { VercelRequest, VercelResponse } from '@vercel/node';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY!;
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY!;
const POSTHOG_APP_PROJECT_ID = process.env.POSTHOG_APP_PROJECT_ID!;
const POSTHOG_WEB_PROJECT_ID = process.env.POSTHOG_WEB_PROJECT_ID!;
const POSTHOG_HOST = 'https://us.posthog.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-admin-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!POSTHOG_PERSONAL_API_KEY) {
    return res.status(200).json({
      app: null,
      web: null,
      error: 'PostHog not configured — set POSTHOG_PERSONAL_API_KEY env var',
      generatedAt: new Date().toISOString(),
    });
  }

  try {
    const [appMetrics, webMetrics] = await Promise.all([
      POSTHOG_APP_PROJECT_ID ? getAppMetrics() : null,
      POSTHOG_WEB_PROJECT_ID ? getWebMetrics() : null,
    ]);

    return res.status(200).json({
      app: appMetrics,
      web: webMetrics,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Analytics API error:', err.message);
    return res.status(500).json({ error: 'Failed to load analytics data' });
  }
}

async function posthogQuery(projectId: string, query: string) {
  const response = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PostHog API ${response.status}: ${text}`);
  }
  return response.json();
}

async function getAppMetrics() {
  const [dauResult, sessionsResult, trialResult] = await Promise.all([
    posthogQuery(POSTHOG_APP_PROJECT_ID,
      `SELECT toDate(timestamp) as day, count(DISTINCT distinct_id) as users
       FROM events
       WHERE timestamp > now() - interval 30 day
       GROUP BY day ORDER BY day`
    ),
    posthogQuery(POSTHOG_APP_PROJECT_ID,
      `SELECT count() as sessions,
              sum(toFloat64OrNull(JSONExtractString(properties, 'words_net'))) as total_words
       FROM events
       WHERE event = 'writing_session_ended' AND timestamp > now() - interval 30 day`
    ),
    posthogQuery(POSTHOG_APP_PROJECT_ID,
      `SELECT JSONExtractString(properties, 'license_state') as state,
              count(DISTINCT distinct_id) as users
       FROM events
       WHERE event = 'app_opened' AND timestamp > now() - interval 30 day
       GROUP BY state`
    ),
  ]);

  // Calculate averages
  const dauData = dauResult.results || [];
  const avgDAU = dauData.length > 0
    ? Math.round(dauData.reduce((sum: number, row: any[]) => sum + (row[1] || 0), 0) / dauData.length)
    : 0;

  const sessionsData = sessionsResult.results?.[0] || [0, 0];
  const trialData = trialResult.results || [];

  let trialUsers = 0;
  let licensedUsers = 0;
  for (const row of trialData) {
    if (row[0] === 'trial') trialUsers = row[1];
    if (row[0] === 'licensed') licensedUsers = row[1];
  }

  const trialConversionRate = trialUsers + licensedUsers > 0
    ? Math.round((licensedUsers / (trialUsers + licensedUsers)) * 100)
    : 0;

  return {
    dailyActiveUsers: dauData.map((row: any[]) => ({ date: row[0], users: row[1] })),
    avgDAU,
    totalWritingSessions: sessionsData[0] || 0,
    totalWordsWritten: Math.round(sessionsData[1] || 0),
    trialUsers,
    licensedUsers,
    trialConversionRate,
  };
}

async function getWebMetrics() {
  const [visitorsResult, ctaResult] = await Promise.all([
    posthogQuery(POSTHOG_WEB_PROJECT_ID,
      `SELECT toDate(timestamp) as day, count(DISTINCT distinct_id) as visitors
       FROM events
       WHERE event = '$pageview' AND timestamp > now() - interval 30 day
       GROUP BY day ORDER BY day`
    ),
    posthogQuery(POSTHOG_WEB_PROJECT_ID,
      `SELECT JSONExtractString(properties, 'location') as location, count() as clicks
       FROM events
       WHERE event = 'cta_clicked' AND timestamp > now() - interval 30 day
       GROUP BY location ORDER BY clicks DESC`
    ),
  ]);

  const visitorsData = visitorsResult.results || [];
  const avgDailyVisitors = visitorsData.length > 0
    ? Math.round(visitorsData.reduce((sum: number, row: any[]) => sum + (row[1] || 0), 0) / visitorsData.length)
    : 0;

  const totalVisitors = visitorsData.reduce((sum: number, row: any[]) => sum + (row[1] || 0), 0);
  const ctaData = ctaResult.results || [];
  const totalCtaClicks = ctaData.reduce((sum: number, row: any[]) => sum + (row[1] || 0), 0);
  const ctaClickRate = totalVisitors > 0 ? Math.round((totalCtaClicks / totalVisitors) * 100) : 0;

  return {
    dailyVisitors: visitorsData.map((row: any[]) => ({ date: row[0], visitors: row[1] })),
    avgDailyVisitors,
    ctaClicks: ctaData.map((row: any[]) => ({ location: row[0], clicks: row[1] })),
    totalCtaClicks,
    ctaClickRate,
  };
}
