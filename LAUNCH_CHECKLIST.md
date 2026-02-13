# Braidr Launch Checklist

## Server Deployment (Vercel)
- [ ] Deploy server to Vercel: `cd server && vercel --prod`
- [ ] Set environment variables in Vercel dashboard:
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `STRIPE_WEBHOOK_SECRET`
  - [ ] `STRIPE_PRICE_ID` (price for $39/year subscription)
  - [ ] `KEYGEN_ACCOUNT_ID`
  - [ ] `KEYGEN_POLICY_ID`
  - [ ] `KEYGEN_PRODUCT_TOKEN`
  - [ ] `RESEND_API_KEY`
  - [ ] `FROM_EMAIL`
  - [ ] `CLERK_SECRET_KEY`
  - [ ] `BASE_URL` (https://braidr-api.vercel.app)

## Stripe
- [ ] Register webhook URL in Stripe dashboard: `https://braidr-api.vercel.app/api/webhooks/stripe`
- [ ] Enable webhook events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Configure Payment Link redirect → `https://braidr-api.vercel.app/portal/dashboard`
- [ ] Test purchase with Stripe test card end-to-end

## Apple Code Signing & Notarization
- [x] Enroll in Apple Developer Program
- [x] Create Developer ID Application certificate
- [x] Export certificate as `.p12` file
- [x] Create app-specific password at appleid.apple.com
- [x] Add GitHub repository secrets:
  - [x] `CSC_LINK` (base64-encoded .p12: `base64 -i cert.p12 | pbcopy`)
  - [x] `CSC_KEY_PASSWORD` (.p12 export password)
  - [x] `APPLE_ID` (your Apple ID email)
  - [x] `APPLE_ID_PASSWORD` (app-specific password, NOT your Apple password)

## First Release
- [x] Tag and push: `git tag v1.3.0 && git push origin v1.3.0`
- [ ] Verify GitHub Actions builds complete for macOS, Windows, Linux
- [ ] Verify release artifacts appear at github.com/theMurfinator/braidr/releases
- [ ] Download and test each platform build
- [ ] Verify auto-updater works (install old version, confirm it detects new release)

## Website (getbraider.com)
- [ ] Update design, images, copy
- [ ] Add pricing section ($39/year)
- [ ] Wire up "Buy Now" button → Stripe Payment Link (or POST /api/checkout)
- [ ] Add download links pointing to GitHub Releases
- [ ] Add link to customer portal (https://braidr-api.vercel.app/portal)
- [ ] Test full flow: visit site → buy → receive email → download → activate

## End-to-End Smoke Test
- [ ] New user clicks Buy on website → completes Stripe checkout
- [ ] Webhook fires → license created in Keygen
- [ ] Customer receives license key email
- [ ] Customer downloads app from GitHub Releases / website
- [ ] App shows 14-day trial banner
- [ ] User activates license via Braidr → Manage License
- [ ] Customer portal shows license key, status, billing management
- [ ] Stripe billing portal works (manage payment, cancel)
- [ ] Cancellation suspends Keygen license
- [ ] Failed payment suspends Keygen license
