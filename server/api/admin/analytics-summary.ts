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
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send('PostHog not configured — set POSTHOG_PERSONAL_API_KEY env var');
  }

  try {
    const analyticsRes = await fetch(
      `https://${req.headers.host}/api/admin/analytics`,
      { headers: { 'X-Admin-Key': apiKey as string } }
    );
    const data = await analyticsRes.json();

    const format = req.query.format;

    if (format === 'text') {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(formatAsText(data));
    }

    // Default: return the same JSON with a summary block added
    return res.status(200).json({
      ...data,
      summary: formatAsText(data),
    });
  } catch (err: any) {
    console.error('Analytics summary error:', err.message);
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
}

function formatAsText(data: any): string {
  const lines: string[] = [];

  lines.push('BRAIDR ANALYTICS SUMMARY');
  lines.push(`Generated: ${data.generatedAt || new Date().toISOString()}`);
  lines.push('');

  if (data.app) {
    lines.push('=== APP METRICS (Last 30 Days) ===');
    lines.push(`Daily Active Users (avg): ${data.app.avgDAU}`);
    lines.push(`Total Writing Sessions: ${data.app.totalWritingSessions}`);
    lines.push(`Total Words Written: ${data.app.totalWordsWritten?.toLocaleString()}`);
    lines.push(`Trial Users: ${data.app.trialUsers}`);
    lines.push(`Licensed Users: ${data.app.licensedUsers}`);
    lines.push(`Trial-to-License Conversion Rate: ${data.app.trialConversionRate}%`);
    lines.push('');
  } else {
    lines.push('=== APP METRICS ===');
    lines.push('Not configured (POSTHOG_APP_PROJECT_ID missing)');
    lines.push('');
  }

  if (data.web) {
    lines.push('=== WEBSITE METRICS (Last 30 Days) ===');
    lines.push(`Daily Unique Visitors (avg): ${data.web.avgDailyVisitors}`);
    lines.push(`CTA Click Rate: ${data.web.ctaClickRate}%`);
    lines.push(`Total CTA Clicks: ${data.web.totalCtaClicks}`);
    if (data.web.ctaClicks?.length > 0) {
      lines.push(`CTA Clicks by Location:`);
      for (const cta of data.web.ctaClicks) {
        lines.push(`  - ${cta.location}: ${cta.clicks}`);
      }
    }
    lines.push('');
  } else {
    lines.push('=== WEBSITE METRICS ===');
    lines.push('Not configured (POSTHOG_WEB_PROJECT_ID missing)');
    lines.push('');
  }

  lines.push('=== FUNNEL (estimated) ===');
  if (data.web && data.app) {
    lines.push(`Website Visit → CTA Click → Trial Start → License Purchase`);
    lines.push(`${data.web.avgDailyVisitors}/day → ${data.web.totalCtaClicks} clicks → ${data.app.trialUsers} trials → ${data.app.licensedUsers} licensed`);
  } else {
    lines.push('Insufficient data for funnel analysis');
  }

  return lines.join('\n');
}
