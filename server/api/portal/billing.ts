import type { VercelRequest, VercelResponse } from '@vercel/node';

const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY!;

/**
 * Validate a license key with LemonSqueezy and return the customer portal URL.
 */
async function getCustomerPortalUrl(licenseKey: string): Promise<string | null> {
  // Validate the license key to get the customer ID
  const validateRes = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ license_key: licenseKey }),
  });

  if (!validateRes.ok) return null;
  const validateData = await validateRes.json();
  if (!validateData.valid) return null;

  const customerId = validateData.meta?.customer_id;
  if (!customerId) return null;

  // Fetch the customer object to get the signed portal URL
  const customerRes = await fetch(`https://api.lemonsqueezy.com/v1/customers/${customerId}`, {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
    },
  });

  if (!customerRes.ok) return null;
  const customerData = await customerRes.json();
  return customerData.data?.attributes?.urls?.customer_portal || null;
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
    const portalUrl = await getCustomerPortalUrl(licenseKey);
    if (!portalUrl) {
      return res.status(401).json({ error: 'Invalid license key or customer not found' });
    }

    return res.status(200).json({ url: portalUrl });
  } catch (err: any) {
    console.error('Billing portal error:', err.message);
    return res.status(500).json({ error: 'Failed to create billing session' });
  }
}
