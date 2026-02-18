import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStripe, getActiveSubscriptionByEmail } from '../_lib/stripe.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const sub = await getActiveSubscriptionByEmail(email);
    if (!sub.subscriptionId || sub.status === 'none') {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(sub.subscriptionId, {
      cancel_at_period_end: false,
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Reactivate subscription error:', err.message);
    return res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
}
