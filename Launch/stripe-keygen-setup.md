# Stripe + Keygen Setup Guide

## Overview
- **Stripe** handles payments ($39/year subscription)
- **Keygen** manages license keys (creation, validation, expiry)
- **Webhook** connects them: Stripe payment → Keygen license created

---

## Step 1: Keygen Setup

### 1a. Get your Account ID
1. Log into [app.keygen.sh](https://app.keygen.sh)
2. Your Account ID is the UUID in the URL: `app.keygen.sh/accounts/{ACCOUNT_ID}`
3. Save this — you'll need it in 3 places

### 1b. Create a Product
1. Go to **Products** → **New Product**
2. Name: `Braidr`
3. Save the Product ID

### 1c. Create a Policy
1. Go to **Policies** → **New Policy**
2. Settings:
   - Name: `Braidr Annual`
   - Duration: `31557600` (365.25 days in seconds)
   - Scheme: `ED25519_SIGN` (or keep default)
   - Max machines: leave blank (no machine limit)
   - Require check-in: **No** (we validate on our own schedule)
3. Link to the `Braidr` product
4. Save the Policy ID

### 1d. Create a Product API Token
1. Go to **Tokens** → **New Token**
2. Type: **Product** token
3. Link to `Braidr` product
4. Copy the token — this is your `KEYGEN_PRODUCT_TOKEN`

---

## Step 2: Stripe Setup

### 2a. Create the Product & Price
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Products** → **Add Product**
   - Name: `Braidr - Multi-POV Writing Tool`
   - Description: `Annual license for Braidr desktop app`
3. Add a Price:
   - $39.00 / year (recurring)
4. Copy the Price ID (starts with `price_...`)

### 2b. Set up Webhook
1. **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://getbraider.com/api/webhooks/stripe`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the signing secret (starts with `whsec_...`)

---

## Step 3: Environment Variables

### For the Electron app (`src/main/license.ts`)
Set these before building:
```
KEYGEN_ACCOUNT_ID=your-account-uuid
KEYGEN_PRODUCT_ID=your-product-uuid
```
Or replace the placeholder values directly in the file.

### For getbraider.com (Next.js `.env.local`)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
KEYGEN_ACCOUNT_ID=your-account-uuid
KEYGEN_PRODUCT_TOKEN=prod-...
KEYGEN_POLICY_ID=your-policy-uuid
NEXT_PUBLIC_SITE_URL=https://getbraider.com
```

---

## Step 4: Wire Up the Site (Tomorrow)

### Files to add to your Next.js project:
1. Copy `stripe-keygen-webhook.ts` → `app/api/webhooks/stripe/route.ts`
2. Copy `stripe-checkout.ts` → `app/api/checkout/route.ts`

### "Buy Now" button on landing page:
```tsx
async function handleBuy() {
  const res = await fetch('/api/checkout', { method: 'POST' });
  const { url } = await res.json();
  window.location.href = url;
}
```

### Thank you page (`app/thanks/page.tsx`):
Show a message like:
> "Thanks for purchasing Braidr! Check your email for your license key.
> Open Braidr → Help → Manage License → paste the key."

---

## Step 5: Email Delivery

When a license is created, you need to email the key to the customer.
Options (pick one):

### Option A: Keygen's built-in email (simplest)
- Keygen can email license keys automatically
- Go to **Settings** → **Notifications** → enable email delivery

### Option B: Custom email via webhook
- In `stripe-keygen-webhook.ts`, uncomment the email section
- Use Resend, SendGrid, or any transactional email service
- Template the email with the license key

---

## How It All Works

```
User clicks "Buy Now" on getbraider.com
    ↓
Stripe Checkout ($39/year)
    ↓
Payment succeeds → Stripe fires webhook
    ↓
Webhook creates Keygen license (auto-generated key, 1-year expiry)
    ↓
License key emailed to customer
    ↓
Customer opens Braidr → Help → Manage License → pastes key
    ↓
App validates key against Keygen API → unlocked!

--- 1 year later ---

Stripe charges $39 renewal → webhook renews Keygen license
OR
Customer cancels → webhook suspends license → app shows "expired"
```

---

## Testing

Just use live keys and buy it yourself. The ~5% Stripe fee is worth avoiding test/live key-swapping complexity.

- [ ] Buy Braidr through the real checkout flow
- [ ] Verify webhook creates a Keygen license
- [ ] Verify license key email arrives
- [ ] Paste key into Braidr → should show "Licensed"
- [ ] Test expired license behavior (create one with past expiry in Keygen)
- [ ] Test offline behavior (disconnect internet, reopen app)
- [ ] Test invalid key (type garbage, should show error)
