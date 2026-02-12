import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateMagicToken } from '../_lib/auth';
import { sendEmail, magicLinkEmail } from '../_lib/email';

const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const trimmedEmail = email.toLowerCase().trim();

  try {
    const token = generateMagicToken(trimmedEmail);
    const magicLink = `${BASE_URL}/api/portal/verify?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: trimmedEmail,
      subject: 'Sign in to Braidr',
      html: magicLinkEmail(magicLink),
    });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('Failed to send magic link:', err.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
