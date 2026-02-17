import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { sendEmail, licenseKeyEmail } from '../_lib/email';

// ─── Environment Variables ──────────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;

// ─── Signature Verification ─────────────────────────────────────────────────

export const config = {
  api: {
    bodyParser: false, // Need raw body for HMAC verification
  },
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

// ─── Webhook Handler ────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify LemonSqueezy signature
  let rawBody: Buffer;
  let payload: any;
  try {
    rawBody = await getRawBody(req);
    const signature = req.headers['x-signature'] as string;
    if (!signature || !verifySignature(rawBody, signature)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    payload = JSON.parse(rawBody.toString());
  } catch (err: any) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const eventName = req.headers['x-event-name'] as string;

  try {
    switch (eventName) {
      case 'order_created': {
        const email = payload.data?.attributes?.user_email || '';
        const orderNumber = payload.data?.attributes?.order_number;
        console.log(`New order #${orderNumber} from ${email}`);
        // License key is emailed via the license_key_created event
        break;
      }

      case 'license_key_created': {
        const licenseKey = payload.data?.attributes?.key;
        const customerEmail = payload.meta?.custom_data?.email
          || payload.data?.attributes?.user_email
          || '';

        if (!licenseKey) {
          console.error('license_key_created event missing key');
          break;
        }

        // Look up customer email from the order if not in the payload directly
        let email = customerEmail;
        if (!email) {
          const orderId = payload.data?.relationships?.order?.data?.id;
          if (orderId) {
            console.log(`License key created for order ${orderId}, but no email in payload`);
          }
        }

        if (email) {
          console.log(`Emailing license key to ${email}`);
          try {
            await sendEmail({
              to: email,
              subject: 'Your Braidr License Key',
              html: licenseKeyEmail(licenseKey),
            });
            console.log(`License key emailed to ${email}`);
          } catch (emailErr: any) {
            console.error(`Failed to email license key: ${emailErr.message}`);
          }
        }

        break;
      }

      case 'subscription_updated': {
        const status = payload.data?.attributes?.status;
        const subId = payload.data?.id;
        console.log(`Subscription ${subId} updated: ${status}`);
        // LS handles license expiry automatically — no action needed
        break;
      }

      case 'subscription_expired': {
        const subId = payload.data?.id;
        console.log(`Subscription ${subId} expired`);
        break;
      }

      case 'subscription_payment_failed': {
        const subId = payload.data?.id;
        console.log(`Payment failed for subscription ${subId}`);
        break;
      }

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
