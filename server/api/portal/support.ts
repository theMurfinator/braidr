import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, message, licenseKey } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    email: email || 'unknown',
    licenseKey: licenseKey ? licenseKey.substring(0, 8) + '...' : 'none',
    message: message.trim(),
    source: 'portal',
    receivedAt: new Date().toISOString(),
  };

  try {
    await put(`support/${id}.json`, JSON.stringify(entry, null, 2), {
      contentType: 'application/json',
      access: 'public',
    });
  } catch (err: any) {
    console.error('Failed to store support request:', err.message);
  }

  console.log('SUPPORT_REQUEST', JSON.stringify(entry));
  return res.status(200).json({ received: true, id });
}
