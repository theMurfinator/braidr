import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';
import { stripe } from '../_lib/stripe';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-admin-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const [stats, feedback] = await Promise.all([
      getStripeStats(),
      getFeedback(),
    ]);

    return res.status(200).json({ ...stats, feedback });
  } catch (err: any) {
    console.error('Admin overview error:', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard data' });
  }
}

async function getStripeStats() {
  const [activeSubs, charges] = await Promise.all([
    stripe.subscriptions.list({ status: 'active', limit: 100 }),
    stripe.charges.list({ limit: 100 }),
  ]);

  // Calculate MRR from active subscriptions
  const mrr = activeSubs.data.reduce((sum, sub) => {
    const amount = sub.items.data[0]?.price?.unit_amount || 0; // cents
    const interval = sub.items.data[0]?.price?.recurring?.interval || 'year';
    if (interval === 'year') {
      return sum + amount / 12;
    }
    return sum + amount;
  }, 0);

  // Total revenue from successful charges
  const totalRevenue = charges.data
    .filter(c => c.status === 'succeeded')
    .reduce((sum, charge) => sum + charge.amount, 0);

  return {
    mrr: Math.round(mrr) / 100,
    activeSubscribers: activeSubs.data.length,
    totalRevenue: totalRevenue / 100,
    availableBalance: 0,
    currency: 'usd',
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
