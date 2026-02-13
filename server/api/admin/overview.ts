import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { list } from '@vercel/blob';
import { verifySession } from '../_lib/auth';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const email = await verifySession(req.headers.authorization);
  if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const [stripeStats, feedback] = await Promise.all([
      getStripeStats(),
      getFeedback(),
    ]);

    return res.status(200).json({ ...stripeStats, feedback });
  } catch (err: any) {
    console.error('Admin overview error:', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard data' });
  }
}

async function getStripeStats() {
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const [subscriptions, balance] = await Promise.all([
    stripe.subscriptions.list({ status: 'active', limit: 100 }),
    stripe.balance.retrieve(),
  ]);

  const activeSubs = subscriptions.data;
  const mrr = activeSubs.reduce((sum, sub) => {
    const item = sub.items.data[0];
    if (!item?.price) return sum;
    const amount = item.price.unit_amount || 0;
    const interval = item.price.recurring?.interval;
    // Normalize to monthly
    if (interval === 'year') return sum + amount / 12;
    return sum + amount; // monthly or default
  }, 0);

  // Get recent charges for total revenue
  const charges = await stripe.charges.list({ limit: 100 });
  const totalRevenue = charges.data
    .filter(c => c.status === 'succeeded')
    .reduce((sum, c) => sum + c.amount, 0);

  return {
    mrr: Math.round(mrr) / 100,
    activeSubscribers: activeSubs.length,
    totalRevenue: totalRevenue / 100,
    availableBalance: balance.available.reduce((sum, b) => sum + b.amount, 0) / 100,
    currency: balance.available[0]?.currency || 'usd',
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
