import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID!;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN!;
const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { licenseKey } = req.body || {};
  if (!licenseKey || typeof licenseKey !== 'string') {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    // Validate key with Keygen — allow suspended/expired so they can manage billing
    const keygenRes = await fetch(
      `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses/actions/validate-key`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          'Accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
        },
        body: JSON.stringify({ meta: { key: licenseKey.trim() } }),
      }
    );

    if (!keygenRes.ok) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    const keygenData = await keygenRes.json();
    const code = keygenData.meta?.code;
    const valid = keygenData.meta?.valid === true;
    if (!valid && code !== 'SUSPENDED' && code !== 'EXPIRED') {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    const stripeSubscriptionId = keygenData.data?.attributes?.metadata?.stripeSubscriptionId;
    const email = keygenData.data?.attributes?.metadata?.email?.toLowerCase();

    // Try to find the Stripe customer via subscription ID first, fall back to email
    let customerId: string | null = null;

    if (stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
      } catch {
        // Subscription may have been deleted, fall through to email lookup
      }
    }

    if (!customerId && email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    if (!customerId) {
      return res.status(404).json({ error: 'No billing account found' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${BASE_URL}/portal/dashboard`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error('Billing portal error:', err.message);
    return res.status(500).json({ error: 'Failed to create billing session' });
  }
}
