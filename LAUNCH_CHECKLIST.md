# Braidr Launch Checklist

## Server Deployment (Vercel)
- [x] Deploy braidr-api to Vercel (separate repo: github.com/theMurfinator/braidr-api)
- [x] Set environment variables in Vercel:
  - [x] `STRIPE_SECRET_KEY` (live)
  - [x] `STRIPE_PRICE_ID` (live: `price_1SzpJRJg5TeECfv9YGq5oTEl`)
  - [x] `STRIPE_WEBHOOK_SECRET` (live)
  - [x] `RESEND_API_KEY`
  - [x] `FROM_EMAIL` (`Braidr <brian@getbraidr.com>`)
  - [x] `ADMIN_API_KEY`
  - [x] `BASE_URL` (`https://braidr-api.vercel.app`)
  - [x] `CRON_SECRET`
  - [x] `REDIS_URL` (Vercel KV)
- [x] Verify all API endpoints working:
  - [x] `GET /api/license` — subscription status check
  - [x] `POST /api/checkout` — Stripe Checkout session creation
  - [x] `GET /api/subscription?action=details` — rich subscription data
  - [x] `POST /api/subscription?action=cancel` — cancel at period end
  - [x] `POST /api/subscription?action=reactivate` — undo cancel
  - [x] `POST /api/webhooks/stripe` — webhook handler
  - [x] `POST /api/users?action=register` — trial user registration
  - [x] `GET /api/cron/trial-emails` — drip email cron (daily 2pm UTC)
  - [x] `POST /api/portal/billing` — Stripe billing portal session

## Stripe
- [x] Create product ($39/year subscription)
- [x] Register webhook URL: `https://braidr-api.vercel.app/api/webhooks/stripe`
- [x] Webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Test purchase end-to-end with real card

## Email (Resend)
- [x] Set up Resend account
- [x] Verify domain (getbraidr.com) — DKIM, SPF, DMARC
- [x] Sending from `brian@getbraidr.com`
- [x] Welcome email template (on checkout.session.completed)
- [x] Payment failed email template (on invoice.payment_failed)
- [x] 14-day trial drip campaign (days 1–14, via cron)
- [x] Unsubscribe flow with HMAC-signed links
- [ ] Test welcome email delivery (triggered by real checkout)
- [ ] Test drip email delivery (triggered by cron)

## Apple Code Signing & Notarization
- [x] Enroll in Apple Developer Program
- [x] Create Developer ID Application certificate
- [x] Export certificate as `.p12` file
- [x] Create app-specific password at appleid.apple.com
- [x] Add GitHub repository secrets:
  - [x] `CSC_LINK` (base64-encoded .p12)
  - [x] `CSC_KEY_PASSWORD`
  - [x] `APPLE_ID`
  - [x] `APPLE_ID_PASSWORD` (app-specific password)

## Release Pipeline
- [x] Auto-release on merge to main (GitHub Actions)
- [x] Builds for macOS (.dmg), Windows (.exe), Linux (.AppImage)
- [x] Code signing and notarization working
- [x] Latest release: v1.5.1+ with AccountView, scratchpad persistence
- [ ] Verify auto-updater works (install older version, confirm it detects new release)

## In-App Features
- [x] Email-based trial (14 days, no license key needed)
- [x] Stripe checkout from app (opens in BrowserWindow)
- [x] Native Account view (subscription details, invoices, cancel/reactivate)
- [x] LicenseGate flow: unlicensed → enter email → trial → subscribe/expired
- [x] Scratchpad persistence (saved to timeline.json)

## Website (getbraidr.com)
- [x] Landing page live with hero, features, pricing ($39/year)
- [x] "Get Started" buttons link to Stripe checkout
- [x] Download links for macOS and Windows
- [ ] Verify download links point to latest release
- [ ] Test full flow: visit site → buy → receive email → download → activate

## End-to-End Smoke Test
- [ ] New user visits getbraidr.com → clicks Get Started → completes Stripe checkout
- [ ] Webhook fires → user marked as converted in Vercel KV
- [ ] Customer receives welcome email via Resend
- [ ] Customer downloads app from website
- [ ] App shows trial banner → user enters email → trial starts
- [ ] User clicks "I already subscribed" → Account view shows active subscription
- [ ] In-app Account view: plan details, payment method, invoices all display
- [ ] Cancel flow: cancel → "Cancels on {date}" → reactivate works
- [ ] Drip emails send during trial (check cron logs)
- [ ] Expired trial shows subscribe CTA
