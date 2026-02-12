import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyMagicToken, generateMagicToken } from '../_lib/auth';

const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.query.token as string;
  if (!token) {
    return res.redirect('/portal?error=missing_token');
  }

  const email = verifyMagicToken(token);
  if (!email) {
    return res.redirect('/portal?error=invalid_token');
  }

  // Generate a fresh session token (1 hour)
  const sessionToken = generateMagicToken(email);

  return res.redirect(`/portal/dashboard?session=${encodeURIComponent(sessionToken)}`);
}
