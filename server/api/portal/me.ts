import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyMagicToken } from '../_lib/auth';

const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID!;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string;
  if (!session) {
    return res.status(401).json({ error: 'No session token' });
  }

  const email = verifyMagicToken(session);
  if (!email) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Look up license in Keygen by email metadata
  try {
    const searchResponse = await fetch(
      `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses?` +
        new URLSearchParams({ 'metadata[email]': email }),
      {
        headers: {
          'Accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
        },
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`Keygen search failed: ${searchResponse.status}`);
    }

    const result = await searchResponse.json();
    const licenses = result.data || [];

    const activeLicense = licenses.find(
      (l: any) => l.attributes.status !== 'SUSPENDED'
    );

    return res.status(200).json({
      email,
      license: activeLicense
        ? {
            key: activeLicense.attributes.key,
            status: activeLicense.attributes.status,
            expiry: activeLicense.attributes.expiry,
            created: activeLicense.attributes.created,
          }
        : null,
      hasLicense: !!activeLicense,
    });
  } catch (err: any) {
    console.error('Portal lookup error:', err.message);
    return res.status(500).json({ error: 'Failed to look up license' });
  }
}
