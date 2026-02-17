import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listUsers } from '../_lib/users';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-admin-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const status = (req.query.status as string) || 'all';
    const filter = ['trial', 'converted', 'expired', 'all'].includes(status)
      ? status as 'trial' | 'converted' | 'expired' | 'all'
      : 'all';

    const users = await listUsers(filter);
    return res.status(200).json({ count: users.length, users });
  } catch (err: any) {
    console.error('Admin users error:', err.message);
    return res.status(500).json({ error: 'Failed to list users' });
  }
}
