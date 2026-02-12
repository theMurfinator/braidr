/**
 * Stripe Checkout Session Creator for Braidr
 *
 * Drop this into your Next.js site as: app/api/checkout/route.ts
 *
 * Called when user clicks "Buy Now" on getbraider.com.
 * Creates a Stripe Checkout session and redirects to the payment page.
 *
 * Environment variables needed:
 *   STRIPE_SECRET_KEY     - Stripe secret key
 *   STRIPE_PRICE_ID       - Price ID for the $39/year subscription
 *   NEXT_PUBLIC_SITE_URL  - Your site URL (https://getbraider.com)
 */

export async function POST(request: Request) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
  const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID!;
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://getbraider.com';

  // Create Stripe Checkout Session via API (no SDK needed)
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      'success_url': `${SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${SITE_URL}/#pricing`,
      'allow_promotion_codes': 'true',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Stripe checkout error:', err);
    return new Response('Failed to create checkout session', { status: 500 });
  }

  const session = await res.json();

  return Response.json({ url: session.url });
}
