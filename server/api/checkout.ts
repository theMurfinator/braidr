import type { VercelRequest, VercelResponse } from '@vercel/node';

const LS_API_KEY = process.env.LEMON_SQUEEZY_API_KEY!;
const LS_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID!;
const LS_VARIANT_ID = process.env.LEMON_SQUEEZY_VARIANT_ID!;
const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Generate a unique checkout ID so we can link the webhook back to this session
    const checkoutId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            product_options: {
              redirect_url: `${BASE_URL}/portal/dashboard?checkout_id=${checkoutId}`,
            },
            checkout_data: {
              custom: {
                checkout_id: checkoutId,
              },
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: LS_STORE_ID } },
            variant: { data: { type: 'variants', id: LS_VARIANT_ID } },
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Lemon Squeezy checkout error:', error);
      throw new Error('Failed to create checkout');
    }

    const result = await response.json();
    const url = result.data.attributes.url;

    return res.status(200).json({ url });
  } catch (err: any) {
    console.error('Checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
