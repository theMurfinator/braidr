import type { VercelRequest, VercelResponse } from '@vercel/node';

const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID!;
const LEMONSQUEEZY_VARIANT_ID = process.env.LEMONSQUEEZY_VARIANT_ID!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const checkoutUrl = `https://braidr.lemonsqueezy.com/checkout/buy/${LEMONSQUEEZY_VARIANT_ID}`;
  return res.status(200).json({ url: checkoutUrl });
}
