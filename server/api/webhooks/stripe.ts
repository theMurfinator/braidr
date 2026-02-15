import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { sendEmail, licenseKeyEmail } from '../_lib/email';

// ─── Environment Variables ──────────────────────────────────────────────────
// Set these in Vercel dashboard → Settings → Environment Variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID!;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN!;
const KEYGEN_POLICY_ID = process.env.KEYGEN_POLICY_ID!;

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ─── Keygen API Helpers ─────────────────────────────────────────────────────

async function createKeygenLicense(email: string, stripeSubscriptionId: string): Promise<string> {
  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
      },
      body: JSON.stringify({
        data: {
          type: 'licenses',
          attributes: {
            metadata: {
              email,
              stripeSubscriptionId,
            },
          },
          relationships: {
            policy: {
              data: { type: 'policies', id: KEYGEN_POLICY_ID },
            },
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Keygen license creation failed: ${response.status} ${error}`);
  }

  const result = await response.json();
  return result.data.attributes.key;
}

async function suspendKeygenLicense(stripeSubscriptionId: string): Promise<void> {
  // Find the license by Stripe subscription ID metadata
  const searchResponse = await fetch(
    `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses?` +
      new URLSearchParams({ 'metadata[stripeSubscriptionId]': stripeSubscriptionId }),
    {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
      },
    }
  );

  if (!searchResponse.ok) {
    throw new Error(`Keygen license search failed: ${searchResponse.status}`);
  }

  const searchResult = await searchResponse.json();
  const licenses = searchResult.data;

  if (!licenses || licenses.length === 0) {
    console.log(`No Keygen license found for subscription ${stripeSubscriptionId}`);
    return;
  }

  // Suspend each matching license
  for (const license of licenses) {
    const suspendResponse = await fetch(
      `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses/${license.id}/actions/suspend`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
        },
      }
    );

    if (!suspendResponse.ok) {
      const error = await suspendResponse.text();
      console.error(`Failed to suspend license ${license.id}: ${error}`);
    }
  }
}

// ─── Stripe Webhook Handler ─────────────────────────────────────────────────

export const config = {
  api: {
    bodyParser: false, // Stripe needs the raw body for signature verification
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Stripe signature
  let event: Stripe.Event;
  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'] as string;
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only handle subscription checkouts
        if (session.mode !== 'subscription' || !session.subscription) {
          break;
        }

        const email = session.customer_details?.email || session.customer_email || '';
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;

        console.log(`Creating license for ${email} (subscription: ${subscriptionId})`);
        const licenseKey = await createKeygenLicense(email, subscriptionId);
        console.log(`License created: ${licenseKey.substring(0, 8)}...`);

        // Store the license key in Stripe subscription metadata for reference
        await stripe.subscriptions.update(subscriptionId, {
          metadata: { keygen_license_key: licenseKey },
        });

        // Email the license key to the customer (only if Resend is configured)
        if (email && process.env.RESEND_API_KEY) {
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

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Suspending license for subscription: ${subscription.id}`);
        await suspendKeygenLicense(subscription.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id;

        if (subId) {
          console.log(`Payment failed for subscription: ${subId}`);
          await suspendKeygenLicense(subId);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
