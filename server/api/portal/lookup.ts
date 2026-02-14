import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID!;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN!;

const stripe = new Stripe(STRIPE_SECRET_KEY);

/**
 * Validate a license key with Keygen and return associated metadata.
 */
async function validateLicenseKey(licenseKey: string): Promise<{
  valid: boolean;
  email?: string;
  expiresAt?: string;
} | null> {
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
  const attrs = result.data?.attributes;

  return {
    valid: result.meta?.valid ?? false,
    email: attrs?.metadata?.email?.toLowerCase(),
    expiresAt: attrs?.expiry,
  };
}

/**
 * Look up a Stripe customer's subscription details by email.
 */
async function getSubscriptionDetails(email: string): Promise<{
  customerId: string;
  subscriptionStatus: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  planName: string;
  licenseKey?: string;
} | null> {
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length === 0) return null;

  const customer = customers.data[0];
  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    limit: 1,
  });

  if (subscriptions.data.length === 0) return null;

  const sub = subscriptions.data[0];
  const priceId = sub.items.data[0]?.price?.id;
  let planName = 'Braidr';

  if (priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
      const product = price.product as Stripe.Product;
      planName = product.name || 'Braidr';
    } catch {
      // Fall back to default name
    }
  }

  return {
    customerId: customer.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    planName,
    licenseKey: sub.metadata?.keygen_license_key,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { licenseKey, email } = req.body || {};

  if (!licenseKey && !email) {
    return res.status(400).json({ error: 'License key or email is required' });
  }

  try {
    let customerEmail: string | undefined;
    let licenseValid = false;
    let licenseExpiry: string | undefined;

    // If license key provided, validate with Keygen first
    if (licenseKey) {
      const keyResult = await validateLicenseKey(licenseKey);
      if (!keyResult) {
        return res.status(401).json({ error: 'Could not validate license key' });
      }
      licenseValid = keyResult.valid;
      licenseExpiry = keyResult.expiresAt;
      customerEmail = keyResult.email;
    } else if (email) {
      customerEmail = email.toLowerCase().trim();
    }

    if (!customerEmail) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    // Look up Stripe subscription
    const subDetails = await getSubscriptionDetails(customerEmail);
    if (!subDetails) {
      return res.status(404).json({ error: 'No subscription found for this account' });
    }

    return res.status(200).json({
      email: customerEmail,
      licenseKey: licenseKey || subDetails.licenseKey,
      licenseValid,
      licenseExpiry,
      subscriptionStatus: subDetails.subscriptionStatus,
      currentPeriodEnd: subDetails.currentPeriodEnd,
      cancelAtPeriodEnd: subDetails.cancelAtPeriodEnd,
      planName: subDetails.planName,
    });
  } catch (err: any) {
    console.error('Portal lookup error:', err.message);
    return res.status(500).json({ error: 'Failed to look up account' });
  }
}
