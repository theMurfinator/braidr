import type { VercelRequest, VercelResponse } from '@vercel/node';
import { registerUser } from '../_lib/users';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, source } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    await registerUser(email, source);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('User registration error:', err.message);
    return res.status(500).json({ error: 'Failed to register user' });
  }
}
