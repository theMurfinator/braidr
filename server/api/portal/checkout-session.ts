import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const stripe = new Stripe(STRIPE_SECRET_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sessionId = req.query.session_id as string;
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Checkout must be complete (works for both paid and trial)
    if (session.status !== 'complete') {
      return res.status(400).json({ error: 'Checkout session is not complete' });
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as any)?.id;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const licenseKey = subscription.metadata?.keygen_license_key;

    if (!licenseKey) {
      // Webhook hasn't fired yet — tell frontend to retry
      return res.status(202).json({ status: 'pending' });
    }

    return res.status(200).json({
      licenseKey,
      email: session.customer_details?.email || session.customer_email || '',
    });
  } catch (err: any) {
    console.error('Checkout session lookup error:', err.message);
    return res.status(500).json({ error: 'Failed to look up checkout session' });
  }
}
