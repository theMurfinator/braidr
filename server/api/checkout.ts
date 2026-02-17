import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripe } from './_lib/stripe.js';

const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID!;
const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${BASE_URL}/checkout/success.html`,
      cancel_url: `${BASE_URL}/checkout/cancel.html`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('Checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
