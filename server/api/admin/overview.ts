import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';

const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY!;
const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID!;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY!;

const LS_API = 'https://api.lemonsqueezy.com/v1';

async function lsFetch(path: string): Promise<any> {
  const res = await fetch(`${LS_API}${path}`, {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`LS API ${path}: ${res.status}`);
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-admin-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const [stats, feedback] = await Promise.all([
      getLemonSqueezyStats(),
      getFeedback(),
    ]);

    return res.status(200).json({ ...stats, feedback });
  } catch (err: any) {
    console.error('Admin overview error:', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard data' });
  }
}

async function getLemonSqueezyStats() {
  const [subsData, ordersData] = await Promise.all([
    lsFetch(`/subscriptions?filter[store_id]=${LEMONSQUEEZY_STORE_ID}&filter[status]=active`),
    lsFetch(`/orders?filter[store_id]=${LEMONSQUEEZY_STORE_ID}`),
  ]);

  const activeSubs = subsData.data || [];
  const orders = ordersData.data || [];

  // Calculate MRR from active subscriptions
  const mrr = activeSubs.reduce((sum: number, sub: any) => {
    const price = sub.attributes?.first_order_item?.price || 0; // cents
    const interval = sub.attributes?.variant_name?.toLowerCase() || '';
    // Normalize annual to monthly
    if (interval.includes('year') || interval.includes('annual')) {
      return sum + price / 12;
    }
    return sum + price;
  }, 0);

  // Total revenue from all orders
  const totalRevenue = orders.reduce((sum: number, order: any) => {
    return sum + (order.attributes?.total || 0);
  }, 0);

  return {
    mrr: Math.round(mrr) / 100,
    activeSubscribers: activeSubs.length,
    totalRevenue: totalRevenue / 100,
    availableBalance: 0, // LemonSqueezy handles payouts directly
    currency: 'usd',
  };
}

async function getFeedback() {
  try {
    const { blobs } = await list({ prefix: 'feedback/' });
    const entries = [];

    for (const blob of blobs) {
      const response = await fetch(blob.url);
      if (response.ok) {
        entries.push(await response.json());
      }
    }

    entries.sort((a: any, b: any) =>
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    return entries;
  } catch {
    return [];
  }
}
