import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { verifySession } from '../_lib/auth';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = await verifySession(req.headers.authorization);
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Find the Stripe customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'No billing account found' });
    }

    // Create a Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${BASE_URL}/portal/dashboard`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error('Billing portal error:', err.message);
    return res.status(500).json({ error: 'Failed to create billing session' });
  }
}
