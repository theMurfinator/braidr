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
    // Validate the license key with Lemon Squeezy's License API
    const validateRes = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new URLSearchParams({ license_key: licenseKey.trim() }),
    });

    if (!validateRes.ok) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    const data = await validateRes.json();

    // Verify this key belongs to our store
    if (String(data.meta?.store_id) !== LS_STORE_ID) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    const keyStatus = data.license_key?.status; // active, expired, disabled
    if (!keyStatus) {
      return res.status(401).json({ error: 'Invalid license key' });
    }

    // Fetch subscription data from Lemon Squeezy API
    let subscription: any = null;
    const customerId = data.meta?.customer_id;

    if (customerId) {
      try {
        const subsRes = await fetch(
          `https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=${LS_STORE_ID}&filter[customer_id]=${customerId}`,
          {
            headers: {
              'Accept': 'application/vnd.api+json',
              'Authorization': `Bearer ${LS_API_KEY}`,
            },
          }
        );

        if (subsRes.ok) {
          const subsData = await subsRes.json();
          const sub = subsData.data?.[0];
          if (sub) {
            subscription = {
              id: sub.id,
              status: sub.attributes.status, // on_trial, active, cancelled, expired, paused, past_due, unpaid
              renewsAt: sub.attributes.renews_at,
              endsAt: sub.attributes.ends_at,
              trialEndsAt: sub.attributes.trial_ends_at,
              customerPortalUrl: sub.attributes.urls?.customer_portal,
            };
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch subscription:', err.message);
      }
    }

    return res.status(200).json({
      license: {
        key: licenseKey.trim(),
        status: keyStatus,
        activationLimit: data.license_key?.activation_limit,
        activationUsage: data.license_key?.activation_usage,
        expiresAt: data.license_key?.expires_at,
      },
      customer: {
        id: customerId,
        name: data.meta?.customer_name,
        email: data.meta?.customer_email,
      },
      subscription,
    });
  } catch (err: any) {
    console.error('Portal session error:', err.message);
    return res.status(500).json({ error: 'Failed to load account data' });
  }
}
