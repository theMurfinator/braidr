import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;

const stripe = new Stripe(STRIPE_SECRET_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session.subscription) {
      return res.status(404).json({ error: 'No subscription found for this session' });
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const licenseKey = subscription.metadata?.keygen_license_key;

    if (!licenseKey) {
      // Webhook hasn't fired yet — tell the client to retry
      return res.status(202).json({ ready: false });
    }

    return res.status(200).json({
      ready: true,
      licenseKey,
      email: session.customer_details?.email || session.customer_email || '',
    });
  } catch (err: any) {
    console.error('Session lookup error:', err.message);
    return res.status(500).json({ error: 'Failed to look up session' });
  }
}
