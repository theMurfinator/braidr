import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripe } from '../_lib/stripe.js';

const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'No customer found for this email' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: BASE_URL,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('Billing portal error:', err.message);
    return res.status(500).json({ error: 'Failed to create billing session' });
  }
}
