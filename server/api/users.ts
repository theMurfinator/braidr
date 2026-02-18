import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { registerUser, unsubscribeUser } from './_lib/users.js';

const UNSUBSCRIBE_SECRET = process.env.ADMIN_API_KEY || 'braidr-unsub';

function generateUnsubscribeToken(email: string): string {
  return crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(email.toLowerCase()).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action as string;

  if (action === 'register' && req.method === 'POST') {
    return handleRegister(req, res);
  } else if (action === 'unsubscribe' && req.method === 'GET') {
    return handleUnsubscribe(req, res);
  }

  return res.status(400).json({ error: 'Invalid action. Use ?action=register|unsubscribe' });
}

async function handleRegister(req: VercelRequest, res: VercelResponse) {
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

async function handleUnsubscribe(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string;
  const token = req.query.token as string;

  if (!email || !token) {
    return res.status(400).send(page('Missing parameters', 'Invalid unsubscribe link.'));
  }

  const expected = generateUnsubscribeToken(email);
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid.'));
  }

  try {
    await unsubscribeUser(email);
    return res.status(200).send(page('Unsubscribed', "You've been unsubscribed from Braidr emails. You'll still receive transactional emails about your subscription status."));
  } catch (err: any) {
    console.error('Unsubscribe error:', err.message);
    return res.status(500).send(page('Error', 'Something went wrong. Please try again.'));
  }
}

function page(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} — Braidr</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa;color:#1a1a1a}.card{text-align:center;max-width:440px;padding:48px 32px}h1{font-size:24px;margin:0 0 12px}p{font-size:16px;color:#6b7280;line-height:1.6}</style>
</head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}
