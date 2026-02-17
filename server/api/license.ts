import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getActiveSubscriptionByEmail } from './_lib/stripe';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const email = req.query.email as string;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const sub = await getActiveSubscriptionByEmail(email);
    return res.status(200).json({
      email,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd || null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd || false,
    });
  } catch (err: any) {
    console.error('License check error:', err.message, err.stack);
    return res.status(500).json({
      error: 'Failed to check subscription status',
      detail: err.message,
    });
  }
}
