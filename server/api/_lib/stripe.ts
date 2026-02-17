import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Keep backward compat export — lazy getter
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
});

interface SubscriptionInfo {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  customerId?: string;
}

const STATUS_PRIORITY: Record<string, number> = {
  active: 5,
  trialing: 4,
  past_due: 3,
  canceled: 2,
};

export async function getActiveSubscriptionByEmail(email: string): Promise<SubscriptionInfo> {
  const s = getStripe();
  const customers = await s.customers.list({ email, limit: 10 });

  if (customers.data.length === 0) {
    return { status: 'none' };
  }

  let best: SubscriptionInfo = { status: 'none' };
  let bestPriority = 0;

  for (const customer of customers.data) {
    const subs = await s.subscriptions.list({
      customer: customer.id,
      limit: 10,
    });

    for (const sub of subs.data) {
      const mapped = sub.status as string;
      const priority = STATUS_PRIORITY[mapped] || 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        best = {
          status: mapped as SubscriptionInfo['status'],
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          customerId: customer.id,
        };
      }
    }
  }

  return best;
}
