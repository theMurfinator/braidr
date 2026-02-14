# Braidr Launch - Task Checklist

## Phase 1: Technical Foundation (Week 1)

### Apple Developer Setup
- [ ] Sign up for Apple Developer account ($99/year)
  - URL: https://developer.apple.com/programs/enroll/
  - Wait time: ~24-48 hours for approval
- [ ] Generate code signing certificate
- [ ] Set up notarization workflow
- [ ] Test: DMG should install without "unidentified developer" warning

### Auto-Update System
- [ ] Install electron-updater package
  ```bash
  npm install electron-updater
  ```
- [ ] Configure auto-update in main.js
- [ ] Set up update server (GitHub Releases or custom)
- [ ] Test: App should check for updates on launch
- [ ] Add "Check for Updates" menu item

### Payment & License System (Stripe + Keygen)
- [x] Stripe checkout flow (creates subscription → triggers webhook)
- [x] Stripe webhook handler (checkout.session.completed, subscription.deleted, invoice.payment_failed)
- [x] Keygen license creation (auto-created on purchase via webhook)
- [x] Keygen license suspension (on cancellation or payment failure)
- [x] License key emailed to customer via Resend
- [x] Implement trial logic (14 days from first launch)
- [x] Keygen license validation in Electron app (with 24hr cache + offline grace)
- [x] "Enter License Key" dialog (LicenseGate component)
- [x] Trial banner with days remaining
- [x] Trial expired / license expired / invalid key screens
- [x] "Buy Now" button opens Stripe checkout link
- [x] Stripe billing portal for subscription management
- [ ] Test: Full end-to-end purchase flow (Stripe → webhook → Keygen → email → activate in app)
- [ ] Swap Clerk test publishable key to production key in portal HTML

### Server Deployment (Vercel)
- [x] Vercel project configured (vercel.json with rewrites, CORS headers)
- [x] API routes: /api/checkout, /api/webhooks/stripe, /api/portal/me, /api/portal/billing, /api/admin/overview, /api/feedback
- [x] Customer portal HTML (sign-in, dashboard with license display + download links)
- [x] Admin dashboard HTML (MRR, subscribers, revenue, feedback feed)
- [x] Clerk auth integration for portal/admin routes
- [x] Feedback system with Vercel Blob storage
- [ ] Verify server is deployed and accessible at braidr-api.vercel.app
- [ ] Verify all environment variables set in Vercel dashboard
- [ ] Register Stripe webhook URL in Stripe dashboard (https://braidr-api.vercel.app/api/webhooks/stripe)
- [ ] Enable 3 webhook events in Stripe (checkout.session.completed, customer.subscription.deleted, invoice.payment_failed)
- [ ] Restrict CORS from wildcard (*) to production domain before launch

### App Icon
- [ ] Commission professional icon on Fiverr/Upwork
  - Budget: $50-100
  - Requirements:
    - 512x512 PNG
    - 1024x1024 PNG (for marketing)
    - .icns file for macOS
  - Style: Clean, modern, evokes "braiding" or "weaving"
- [ ] Replace Electron default icon
- [ ] Update build configuration with new icon
- [ ] Test: New icon shows in Dock, Finder, App Switcher

### Data Safety
- [ ] Implement auto-backup system
  - Save to: `~/Library/Application Support/Braidr/backups/`
  - Frequency: Every save (keep last 10 versions)
  - Format: Timestamped folder copies
- [ ] Add "Restore from Backup" feature
  - Menu: File → Restore from Backup
  - Show list of backup dates
  - Preview before restore
- [ ] Test: Corrupt a file, restore from backup

---

## Phase 2: Product Polish (Week 1-2)

### First-Run Experience
- [ ] Create welcome screen
  - "Welcome to Braidr"
  - "Create your first project" button
  - "See a demo project" option (pre-loaded 3-character example)
- [ ] Add quick start tooltips (optional)
- [ ] Test: New user can get started in <60 seconds

### Export Functionality
- [ ] Add "Export Project" menu item
  - File → Export → Export to Folder
- [ ] Export all markdown files to user-selected folder
- [ ] Include timeline.json for re-import
- [ ] Test: Export → import should preserve everything

### Error Handling
- [ ] Add user-friendly error messages
- [ ] Graceful handling of corrupted files
- [ ] "Something went wrong" dialog with support email
- [ ] Log errors to file for debugging

### Privacy Policy
- [ ] Use template (e.g., getterms.io)
- [ ] Customize for Braidr:
  - Data stored locally
  - No cloud sync (yet)
  - Analytics via PostHog (if added)
- [ ] Add to landing page footer
- [ ] Add Help → Privacy Policy menu item

---

## Phase 3: Marketing Foundation (Week 2)

### Landing Page
- [ ] Set up Next.js project
- [ ] Deploy to Vercel
- [ ] Connect domain (braidr.app)
- [ ] Pages:
  - [ ] Home (hero + features + demo video + CTA)
  - [ ] Privacy Policy
  - [ ] Terms of Service (simple)
- [ ] Email capture (ConvertKit integration)
- [ ] Analytics setup (PostHog + GA4)
- [ ] Test: Visitors → signups tracked correctly

### Demo Videos
- [ ] Script 1: "The Problem with Scrivener" (30s)
  - Hook: "If you write multiple POV characters..."
  - Problem: Current tools don't understand braided timelines
  - Solution: Show POV → Braided views
- [ ] Script 2: "Feature Demo" (60s)
  - Show full workflow: Create character → Add scenes → Braid → Editor
- [ ] Script 3: "Local Files, Your Data" (30s)
  - Emphasize markdown files, no lock-in, git compatible
- [ ] Record videos (iPhone is fine)
- [ ] Basic editing (CapCut/iMovie)
- [ ] Upload to Vimeo/YouTube

### Analytics Infrastructure
- [ ] PostHog setup
  - Track: page views, signups, button clicks
  - Session recordings
  - Heatmaps
- [ ] Google Analytics 4
  - Track: conversions, user flow
- [ ] Data export endpoint
  - `/api/analytics` returns JSON for me to read
  - Weekly automated export

---

## Phase 4: Soft Launch (Week 3)

### Community Posts
- [ ] r/writing - "I built a tool for multi-POV novelists"
- [ ] r/fantasywriters
- [ ] r/scifiwriting
- [ ] NaNoWriMo forums
- [ ] Absolute Write forums
- [ ] Format: Show, don't sell. Offer free trial, ask for feedback.

### Meta Ads Setup
- [ ] Create Facebook Business account
- [ ] Set up ad account
- [ ] Install Meta Pixel on landing page
- [ ] Create audiences:
  - [ ] Interest: Writing, NaNoWriMo, Scrivener
  - [ ] Lookalike: Website visitors (once you have data)
- [ ] Create 3-5 ad variations
- [ ] Budget: $10-15/day
- [ ] Test for 7 days

### Feedback Collection
- [ ] Set up email workflow (ConvertKit)
  - Day 1: Welcome + quick start guide
  - Day 3: "How's it going?" (ask for feedback)
  - Day 5: "Trial ending soon" (upgrade CTA)
  - Day 8: "Thanks for trying" (discount code)
- [ ] Create feedback form (Typeform or Google Form)
- [ ] Respond to every email personally

---

## Phase 5: Iterate & Scale (Week 4+)

### Data Analysis
- [ ] Weekly performance review
  - Ad metrics: CPM, CPC, CTR, conversion rate
  - Landing page: bounce rate, time on page, signup rate
  - Product: trial starts, trial→paid conversion, feature usage
- [ ] Kill losing ads, double down on winners
- [ ] A/B test landing page variations
- [ ] Iterate messaging based on data

### Scale
- [ ] Increase ad spend to $20/day on best performers
- [ ] Launch on Product Hunt
- [ ] Post on Indie Hackers
- [ ] Reach out to writing YouTubers for reviews
- [ ] Join writing Discord servers (add value, don't spam)

### Product Improvements
- [ ] Based on feedback, prioritize features
- [ ] Fix critical bugs immediately
- [ ] Nice-to-have features go in backlog
- [ ] Use auto-update to push improvements

---

## Success Checkpoints

### ✅ Ready for Soft Launch
- Code signing works
- Auto-updates work
- License keys work
- Professional icon
- Landing page live
- At least 1 demo video

### ✅ Ready for Scale
- 100+ waitlist signups
- <$10 cost per signup
- 15%+ trial→paid conversion
- No critical bugs

### ✅ Product-Market Fit
- Consistent daily signups
- Positive qualitative feedback
- Users recommending to others
- Sustainable unit economics (CAC < LTV)

---

## Notes & Ideas

### Future Features (Post-Launch)
- Windows version
- Web app with cloud sync
- Collaboration features
- Timeline visualization
- Scrivener import
- Word/PDF compile
- Mobile companion app

### Marketing Channels to Explore
- Writing YouTube channels (sponsorships)
- Writing podcasts (interviews)
- Writing conferences (booth/speaking)
- Affiliate program (give reviewers 30% commission)
- Bundle with other writing tools

### Pricing Experiments
- A/B test: $39 vs $49 vs $59
- Launch discount: $35 for first 100 customers
- Bundle pricing: Braidr + something else
- Subscription option: $9/month or $49/year
