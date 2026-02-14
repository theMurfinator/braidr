import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID!;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN!;
const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

const stripe = new Stripe(STRIPE_SECRET_KEY);

/**
 * Validate a license key with Keygen and return the associated email.
 */
async function getEmailFromLicenseKey(licenseKey: string): Promise<string | null> {
  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses/actions/validate-key`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
      },
      body: JSON.stringify({
        meta: { key: licenseKey },
      }),
    }
  );

  if (!response.ok) return null;

  const result = await response.json();
  if (!result.meta?.valid) return null;

  return result.data?.attributes?.metadata?.email?.toLowerCase() || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { licenseKey } = req.body || {};
  if (!licenseKey || typeof licenseKey !== 'string') {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    const email = await getEmailFromLicenseKey(licenseKey);
    if (!email) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

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
