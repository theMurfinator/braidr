import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const checkoutId = req.query.checkout_id as string;
  if (!checkoutId) {
    return res.status(400).json({ error: 'checkout_id is required' });
  }

  try {
    // Look up the license key stored by the LS webhook
    const { blobs } = await list({ prefix: `checkouts/${checkoutId}.json` });

    if (blobs.length === 0) {
      // Webhook hasn't fired yet — tell frontend to retry
      return res.status(202).json({ status: 'pending' });
    }

    const response = await fetch(blobs[0].url);
    if (!response.ok) {
      return res.status(202).json({ status: 'pending' });
    }

    const data = await response.json();
    return res.status(200).json({ licenseKey: data.licenseKey });
  } catch (err: any) {
    console.error('Checkout lookup error:', err.message);
    return res.status(500).json({ error: 'Failed to look up checkout' });
  }
}
