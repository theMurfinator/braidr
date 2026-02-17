import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripe } from '../_lib/stripe';
import { markConverted } from '../_lib/users';
import { sendEmail, welcomeEmail, paymentFailedEmail } from '../_lib/email';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export const config = {
  api: {
    bodyParser: false,
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

  let event;
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
        const session = event.data.object;
        const email = session.customer_email || session.customer_details?.email;
        if (email) {
          console.log(`Checkout completed for ${email}`);
          await markConverted(email);
          try {
            await sendEmail({
              to: email,
              subject: 'Welcome to Braidr — Your subscription is active',
              html: welcomeEmail(),
            });
          } catch (emailErr: any) {
            console.error(`Failed to send welcome email: ${emailErr.message}`);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        console.log(`Subscription ${sub.id} updated: ${sub.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        console.log(`Subscription ${sub.id} canceled`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const email = invoice.customer_email;
        if (email) {
          console.log(`Payment failed for ${email}`);
          try {
            await sendEmail({
              to: email,
              subject: 'Braidr — Payment failed',
              html: paymentFailedEmail(),
            });
          } catch (emailErr: any) {
            console.error(`Failed to send payment failed email: ${emailErr.message}`);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
