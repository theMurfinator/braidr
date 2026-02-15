import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID!;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN!;

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function validateLicenseKey(licenseKey: string): Promise<{
  allowed: boolean;
  valid: boolean;
  code?: string;
  email?: string;
  expiresAt?: string;
  status?: string;
  stripeSubscriptionId?: string;
}> {
  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses/actions/validate-key`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
      },
      body: JSON.stringify({ meta: { key: licenseKey } }),
    }
  );

  if (!response.ok) return { allowed: false, valid: false };

  const result = await response.json();
  const valid = result.meta?.valid === true;
  const code = result.meta?.code;
  const attrs = result.data?.attributes;

  // Allow login for valid, suspended, or expired licenses (so users can manage billing)
  const allowed = valid || code === 'SUSPENDED' || code === 'EXPIRED';

  return {
    allowed,
    valid,
    code,
    email: attrs?.metadata?.email,
    expiresAt: attrs?.expiry,
    status: attrs?.status,
    stripeSubscriptionId: attrs?.metadata?.stripeSubscriptionId,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { licenseKey } = req.body || {};
  if (!licenseKey || typeof licenseKey !== 'string') {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    const license = await validateLicenseKey(licenseKey.trim());
    if (!license.allowed) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    // Look up Stripe subscription for billing details
    let subscription: any = null;
    if (license.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(license.stripeSubscriptionId);
        subscription = {
          status: sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
          trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        };
      } catch (err: any) {
        console.error('Failed to fetch Stripe subscription:', err.message);
      }
    }

    return res.status(200).json({
      license: {
        key: licenseKey.trim(),
        status: license.status,
        expiresAt: license.expiresAt,
        code: license.code,
      },
      customer: {
        email: license.email,
      },
      subscription,
    });
  } catch (err: any) {
    console.error('Portal session error:', err.message);
    return res.status(500).json({ error: 'Failed to load account data' });
  }
}
