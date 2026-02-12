/**
 * Stripe Webhook Handler for Braidr License Management
 *
 * Drop this into your Next.js site as: app/api/webhooks/stripe/route.ts
 *
 * Flow:
 *   1. User clicks "Buy Now" → Stripe Checkout ($39/year)
 *   2. Stripe fires checkout.session.completed → this webhook creates a Keygen license
 *   3. User receives license key via email (from Keygen or your email provider)
 *   4. On subscription renewal: Keygen license auto-renews (expiry extended)
 *   5. On cancellation: Keygen license suspended
 *
 * Environment variables needed:
 *   STRIPE_SECRET_KEY       - Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET   - Stripe webhook signing secret (whsec_...)
 *   KEYGEN_ACCOUNT_ID       - Your Keygen account ID (UUID from dashboard URL)
 *   KEYGEN_PRODUCT_TOKEN    - Keygen product API token (for creating licenses)
 *   KEYGEN_POLICY_ID        - Keygen policy ID for Braidr licenses
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface KeygenLicenseResponse {
  data: {
    id: string;
    attributes: {
      key: string;
      expiry: string;
    };
  };
}

// ─── Keygen helpers ─────────────────────────────────────────────────────────

const KEYGEN_API = 'https://api.keygen.sh/v1/accounts';

async function createKeygenLicense(opts: {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}): Promise<{ key: string; expiresAt: string }> {
  const accountId = process.env.KEYGEN_ACCOUNT_ID!;
  const token = process.env.KEYGEN_PRODUCT_TOKEN!;
  const policyId = process.env.KEYGEN_POLICY_ID!;

  const res = await fetch(`${KEYGEN_API}/${accountId}/licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      data: {
        type: 'licenses',
        attributes: {
          metadata: {
            email: opts.email,
            stripeCustomerId: opts.stripeCustomerId,
            stripeSubscriptionId: opts.stripeSubscriptionId,
          },
        },
        relationships: {
          policy: {
            data: { type: 'policies', id: policyId },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Keygen license creation failed: ${res.status} ${err}`);
  }

  const body: KeygenLicenseResponse = await res.json();
  return {
    key: body.data.attributes.key,
    expiresAt: body.data.attributes.expiry,
  };
}

async function findKeygenLicenseBySubscription(subscriptionId: string): Promise<string | null> {
  const accountId = process.env.KEYGEN_ACCOUNT_ID!;
  const token = process.env.KEYGEN_PRODUCT_TOKEN!;

  const res = await fetch(
    `${KEYGEN_API}/${accountId}/licenses?metadata[stripeSubscriptionId]=${subscriptionId}`,
    {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) return null;

  const body = await res.json();
  if (body.data && body.data.length > 0) {
    return body.data[0].id;
  }
  return null;
}

async function suspendKeygenLicense(licenseId: string): Promise<void> {
  const accountId = process.env.KEYGEN_ACCOUNT_ID!;
  const token = process.env.KEYGEN_PRODUCT_TOKEN!;

  await fetch(`${KEYGEN_API}/${accountId}/licenses/${licenseId}/actions/suspend`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${token}`,
    },
  });
}

async function renewKeygenLicense(licenseId: string): Promise<void> {
  const accountId = process.env.KEYGEN_ACCOUNT_ID!;
  const token = process.env.KEYGEN_PRODUCT_TOKEN!;

  // Reinstate if suspended
  await fetch(`${KEYGEN_API}/${accountId}/licenses/${licenseId}/actions/reinstate`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${token}`,
    },
  });

  // Renew the license (extends expiry based on policy duration)
  await fetch(`${KEYGEN_API}/${accountId}/licenses/${licenseId}/actions/renew`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${token}`,
    },
  });
}

// ─── Stripe signature verification ─────────────────────────────────────────

async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Parse the Stripe-Signature header
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
  const v1Sig = parts.find(p => p.startsWith('v1='))?.split('=')[1];

  if (!timestamp || !v1Sig) return false;

  // Compute expected signature
  const payload = `${timestamp}.${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return expected === v1Sig;
}

// ─── Webhook handler (Next.js App Router) ───────────────────────────────────

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const isValid = await verifyStripeSignature(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (!isValid) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        // Only process subscription checkouts
        if (session.mode !== 'subscription') break;

        const email = session.customer_email || session.customer_details?.email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!email || !subscriptionId) {
          console.error('Missing email or subscription ID in checkout session');
          break;
        }

        // Create a Keygen license for this subscription
        const license = await createKeygenLicense({
          email,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });

        console.log(`License created for ${email}: ${license.key} (expires ${license.expiresAt})`);

        // TODO: Send license key to customer via email
        // You can use Resend, SendGrid, or any email service here.
        // Example:
        // await sendEmail({
        //   to: email,
        //   subject: 'Your Braidr License Key',
        //   body: `Here's your license key: ${license.key}\n\nOpen Braidr → Help → Manage License → paste the key.`,
        // });

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;

        // If subscription was renewed (status stays active), renew the license
        if (subscription.status === 'active') {
          const licenseId = await findKeygenLicenseBySubscription(subscription.id);
          if (licenseId) {
            await renewKeygenLicense(licenseId);
            console.log(`License ${licenseId} renewed for subscription ${subscription.id}`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        // Subscription cancelled — suspend the license
        const licenseId = await findKeygenLicenseBySubscription(subscription.id);
        if (licenseId) {
          await suspendKeygenLicense(licenseId);
          console.log(`License ${licenseId} suspended for cancelled subscription ${subscription.id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          const licenseId = await findKeygenLicenseBySubscription(subscriptionId);
          if (licenseId) {
            await suspendKeygenLicense(licenseId);
            console.log(`License ${licenseId} suspended due to payment failure`);
          }
        }
        break;
      }

      default:
        // Unhandled event type — that's fine
        break;
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Return 200 anyway so Stripe doesn't retry indefinitely
    // Errors should be logged and investigated
  }

  return new Response('OK', { status: 200 });
}
