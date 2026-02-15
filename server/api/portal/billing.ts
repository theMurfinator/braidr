import type { VercelRequest, VercelResponse } from '@vercel/node';

const LS_API_KEY = process.env.LEMON_SQUEEZY_API_KEY!;
const LS_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { licenseKey } = req.body || {};
  if (!licenseKey || typeof licenseKey !== 'string') {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    // Validate key → get customer_id
    const validateRes = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new URLSearchParams({ license_key: licenseKey.trim() }),
    });

    if (!validateRes.ok) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    const data = await validateRes.json();
    if (String(data.meta?.store_id) !== LS_STORE_ID) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    const customerId = data.meta?.customer_id;
    if (!customerId) {
      return res.status(404).json({ error: 'No customer found' });
    }

    // Fetch subscription to get the pre-signed customer portal URL
    const subsRes = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=${LS_STORE_ID}&filter[customer_id]=${customerId}`,
      {
        headers: {
          'Accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${LS_API_KEY}`,
        },
      }
    );

    if (!subsRes.ok) {
      return res.status(500).json({ error: 'Failed to look up subscription' });
    }

    const subsData = await subsRes.json();
    const sub = subsData.data?.[0];
    const portalUrl = sub?.attributes?.urls?.customer_portal;

    if (!portalUrl) {
      return res.status(404).json({ error: 'No billing portal available' });
    }

    return res.status(200).json({ url: portalUrl });
  } catch (err: any) {
    console.error('Billing portal error:', err.message);
    return res.status(500).json({ error: 'Failed to open billing portal' });
  }
}
