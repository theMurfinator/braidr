import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStripe, getActiveSubscriptionByEmail } from '../_lib/stripe.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const email = req.query.email as string;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const sub = await getActiveSubscriptionByEmail(email);

    if (sub.status === 'none' || !sub.customerId) {
      return res.status(200).json({
        status: 'none',
        plan: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        paymentMethod: null,
        invoices: [],
      });
    }

    const stripe = getStripe();

    // Get payment method
    let paymentMethod: { brand: string; last4: string } | null = null;
    try {
      const methods = await stripe.paymentMethods.list({
        customer: sub.customerId,
        type: 'card',
        limit: 1,
      });
      if (methods.data.length > 0 && methods.data[0].card) {
        paymentMethod = {
          brand: methods.data[0].card.brand,
          last4: methods.data[0].card.last4,
        };
      }
    } catch {
      // Non-fatal — payment method is optional
    }

    // Get last 5 invoices
    let invoices: Array<{ date: string; amount: number; status: string; url: string | null }> = [];
    try {
      const invoiceList = await stripe.invoices.list({
        customer: sub.customerId,
        limit: 5,
      });
      invoices = invoiceList.data.map(inv => ({
        date: new Date(inv.created * 1000).toISOString(),
        amount: inv.amount_paid,
        status: inv.status || 'unknown',
        url: inv.hosted_invoice_url || null,
      }));
    } catch {
      // Non-fatal
    }

    // Get plan info from subscription
    let plan: { name: string; amount: number; interval: string } | null = null;
    if (sub.subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(sub.subscriptionId);
        const item = subscription.items.data[0];
        if (item?.price) {
          plan = {
            name: 'Braidr',
            amount: item.price.unit_amount || 0,
            interval: item.price.recurring?.interval || 'year',
          };
        }
      } catch {
        // Fallback
        plan = { name: 'Braidr', amount: 3900, interval: 'year' };
      }
    }

    return res.status(200).json({
      status: sub.status,
      plan,
      currentPeriodEnd: sub.currentPeriodEnd || null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd || false,
      paymentMethod,
      invoices,
    });
  } catch (err: any) {
    console.error('Subscription details error:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch subscription details' });
  }
}
