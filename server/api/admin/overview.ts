import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { list } from '@vercel/blob';
import { verifySession } from '../_lib/auth';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const email = await verifySession(req.headers.authorization);
  if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const [stripeStats, feedback, posthogStats] = await Promise.all([
      getStripeStats(),
      getFeedback(),
      getPostHogStats(),
    ]);

    return res.status(200).json({ ...stripeStats, feedback, posthog: posthogStats });
  } catch (err: any) {
    console.error('Admin overview error:', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard data' });
  }
}

async function getStripeStats() {
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // Get all subscriptions (active + canceled) for timeline
  const [activeSubs, allSubs, balance] = await Promise.all([
    stripe.subscriptions.list({ status: 'active', limit: 100 }),
    stripe.subscriptions.list({ limit: 100 }),
    stripe.balance.retrieve(),
  ]);

  // Current MRR
  const mrr = activeSubs.data.reduce((sum, sub) => {
    const item = sub.items.data[0];
    if (!item?.price) return sum;
    const amount = item.price.unit_amount || 0;
    const interval = item.price.recurring?.interval;
    if (interval === 'year') return sum + amount / 12;
    return sum + amount;
  }, 0);

  // Get charges for revenue timeline (last 12 months)
  const twelveMonthsAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
  const charges = await stripe.charges.list({
    limit: 100,
    created: { gte: twelveMonthsAgo },
  });

  // Group revenue by month
  const revenueByMonth: Record<string, number> = {};
  for (const charge of charges.data) {
    if (charge.status !== 'succeeded') continue;
    const date = new Date(charge.created * 1000);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    revenueByMonth[key] = (revenueByMonth[key] || 0) + charge.amount;
  }

  // Build subscriber growth timeline (cumulative active subs by month)
  const subEvents: { month: string; delta: number }[] = [];
  for (const sub of allSubs.data) {
    const created = new Date(sub.created * 1000);
    const createdKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
    subEvents.push({ month: createdKey, delta: 1 });

    if (sub.canceled_at) {
      const canceled = new Date(sub.canceled_at * 1000);
      const canceledKey = `${canceled.getFullYear()}-${String(canceled.getMonth() + 1).padStart(2, '0')}`;
      subEvents.push({ month: canceledKey, delta: -1 });
    }
  }

  // Build sorted monthly labels for last 12 months
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Revenue chart data
  const revenueChart = months.map(m => ({
    month: m,
    revenue: Math.round((revenueByMonth[m] || 0)) / 100,
  }));

  // Subscriber chart data (cumulative)
  const subsByMonth: Record<string, number> = {};
  for (const ev of subEvents) {
    subsByMonth[ev.month] = (subsByMonth[ev.month] || 0) + ev.delta;
  }
  let cumulative = 0;
  // Count subs before our window
  const allMonthsSorted = Object.keys(subsByMonth).sort();
  for (const m of allMonthsSorted) {
    if (m < months[0]) {
      cumulative += subsByMonth[m];
    }
  }
  const subscriberChart = months.map(m => {
    cumulative += (subsByMonth[m] || 0);
    return { month: m, subscribers: cumulative };
  });

  const totalRevenue = charges.data
    .filter(c => c.status === 'succeeded')
    .reduce((sum, c) => sum + c.amount, 0);

  return {
    mrr: Math.round(mrr) / 100,
    activeSubscribers: activeSubs.data.length,
    totalRevenue: totalRevenue / 100,
    availableBalance: balance.available.reduce((sum, b) => sum + b.amount, 0) / 100,
    currency: balance.available[0]?.currency || 'usd',
    revenueChart,
    subscriberChart,
  };
}

async function getPostHogStats() {
  if (!POSTHOG_PERSONAL_API_KEY || !POSTHOG_PROJECT_ID) {
    return null;
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
    const dateTo = now.toISOString().split('T')[0];

    // Query PostHog for pageviews and unique users (last 30 days, daily)
    const [pageviewTrend, uniqueUsersTrend] = await Promise.all([
      queryPostHogTrend('$pageview', dateFrom, dateTo),
      queryPostHogTrend('$pageview', dateFrom, dateTo, true),
    ]);

    return {
      pageviews: pageviewTrend,
      uniqueVisitors: uniqueUsersTrend,
    };
  } catch (err: any) {
    console.error('PostHog query failed:', err.message);
    return null;
  }
}

async function queryPostHogTrend(
  event: string,
  dateFrom: string,
  dateTo: string,
  unique = false,
): Promise<{ labels: string[]; data: number[] } | null> {
  const body = {
    events: [{
      id: event,
      math: unique ? 'dau' : 'total',
    }],
    date_from: dateFrom,
    date_to: dateTo,
    interval: 'day',
  };

  const response = await fetch(
    `https://us.i.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/trend/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) return null;

  const result = await response.json();
  const series = result.result?.[0];
  if (!series) return null;

  return {
    labels: (series.labels || []).map((l: string) => l.split(' ')[0]),
    data: series.data || [],
  };
}

async function getFeedback() {
  try {
    const { blobs } = await list({ prefix: 'feedback/' });
    const entries = [];

    for (const blob of blobs) {
      const response = await fetch(blob.url);
      if (response.ok) {
        entries.push(await response.json());
      }
    }

    entries.sort((a: any, b: any) =>
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    return entries;
  } catch {
    return [];
  }
}
