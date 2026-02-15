import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { put } from '@vercel/blob';

const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!;

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifySignature(rawBody: Buffer, signature: string): boolean {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = hmac.update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-signature'] as string;

  if (!signature || !verifySignature(rawBody, signature)) {
    console.error('Webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody.toString());
  const eventName = event.meta?.event_name;
  const customData = event.meta?.custom_data || {};

  console.log(`LS webhook: ${eventName}`);

  try {
    switch (eventName) {
      case 'license_key_created': {
        const licenseKey = event.data.attributes.key;
        const checkoutId = customData.checkout_id;

        if (checkoutId && licenseKey) {
          // Store license key so the post-checkout dashboard can pick it up
          await put(`checkouts/${checkoutId}.json`, JSON.stringify({
            licenseKey,
            createdAt: new Date().toISOString(),
          }), {
            contentType: 'application/json',
            access: 'public',
          });
          console.log(`Stored license key for checkout ${checkoutId}`);
        }
        break;
      }

      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_cancelled':
      case 'subscription_expired':
      case 'subscription_paused':
      case 'subscription_unpaused':
        console.log(`Subscription event: ${eventName}`, event.data.id);
        break;

      case 'order_created':
        console.log('Order created:', event.data.id);
        break;

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
