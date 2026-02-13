# Braidr Launch - Task Checklist

## Phase 1: Technical Foundation (Week 1)

### Apple Developer Setup
- [x] Sign up for Apple Developer account ($99/year)
- [x] Generate code signing certificate
- [x] Set up notarization workflow
- [ ] Run `npm run package` with APPLE_ID and APPLE_ID_PASSWORD set
- [ ] Test: DMG should install without "unidentified developer" warning

### Auto-Update System
- [x] Install electron-updater package
- [x] Configure auto-update in main.ts
- [x] Set up update server (GitHub Releases)
- [ ] Test: App should check for updates on launch
- [ ] Add "Check for Updates" menu item

### License Key System
- [x] Sign up for Keygen (replaced Gumroad)
- [x] Stripe integration for payments
- [x] Stripe webhook -> Keygen license creation -> email delivery
- [x] Implement license key validation in Electron
- [x] Customer portal at /portal (view license, manage billing)
- [ ] Implement trial logic (7 days from first launch)
- [ ] Add "Purchase License" link in app (opens Stripe payment link)

### App Icon
- [x] Professional icon created
- [x] Replace Electron default icon
- [x] Update build configuration with new icon
- [x] macOS dock icon works correctly

### Data Safety
- [x] Implement backup system (manual backup to user-selected location)
- [ ] Implement auto-backup system (every save, keep last 10 versions)
- [ ] Add "Restore from Backup" UI (menu -> show backup list -> preview -> restore)
- [ ] Test: Corrupt a file, restore from backup

---

## Phase 2: Product Polish (Week 1-2)

### First-Run Experience
- [ ] Create welcome screen ("Welcome to Braidr" + create/demo buttons)
- [x] Demo project included (LOTR characters)
- [ ] Add quick start tooltips (optional)
- [ ] Test: New user can get started in <60 seconds

### Export Functionality
- [x] Compile/export to PDF and DOCX
- [x] Export from braided view and editor
- [ ] Include timeline.json for re-import
- [ ] Test: Export -> import should preserve everything

### Error Handling
- [ ] Add user-friendly error messages for common failures
- [ ] Graceful handling of corrupted files
- [ ] Log errors to file for debugging
- [ ] Set up Sentry for crash reporting (PostHog covers basic errors)

### Privacy Policy
- [ ] Draft privacy policy (data stored locally, PostHog analytics, no cloud sync)
- [ ] Add to landing page footer
- [ ] Add Help -> Privacy Policy menu item

---

## Phase 3: Marketing Foundation (Week 2)

### Landing Page
- [x] Landing page project on Vercel (getbraider.com)
- [ ] Pages:
  - [ ] Home (hero + features + demo video + CTA)
  - [ ] Privacy Policy
  - [ ] Terms of Service (simple)
- [ ] Email capture (ConvertKit integration)
- [x] Analytics setup (PostHog)
- [ ] Test: Visitors -> signups tracked correctly

### Demo Videos
- [ ] Script 1: "The Problem with Scrivener" (30s)
- [ ] Script 2: "Feature Demo" (60s)
- [ ] Script 3: "Local Files, Your Data" (30s)
- [ ] Record videos
- [ ] Basic editing (CapCut/iMovie)
- [ ] Upload to Vimeo/YouTube

### Analytics & Admin Infrastructure
- [x] PostHog integrated in Electron app (22 tracked events)
- [x] Super properties: total_scenes, total_words, character_count on every event
- [x] Admin dashboard at /admin with Clerk auth
- [x] Revenue stats from Stripe (MRR, subscribers, total revenue, balance)
- [x] Monthly revenue bar chart (12 months)
- [x] Cumulative subscriber line chart (12 months)
- [x] Feedback inbox from Vercel Blob
- [x] PostHog website pageviews + unique visitors charts (when configured)
- [ ] **Deploy**: Merge branch to main and redeploy to Vercel
- [ ] **Env vars**: Set up ADMIN_EMAILS, Blob store, POSTHOG_PROJECT_ID, POSTHOG_PERSONAL_API_KEY
- [ ] **Routing**: Add /admin rewrite to getbraider.com project
- [ ] Test: Submit feedback from app -> shows on dashboard
- [ ] Test: PostHog events flowing in PostHog Activity view

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
- [x] In-app feedback modal (Bug Report / Feature Request / General)
- [x] Feedback stored in Vercel Blob (works without Resend)
- [x] Feedback visible in admin dashboard
- [ ] Optional: Set up Resend for email backup (RESEND_API_KEY)
- [ ] Set up email drip workflow (ConvertKit)
  - Day 1: Welcome + quick start guide
  - Day 3: "How's it going?"
  - Day 5: "Trial ending soon"
  - Day 8: "Thanks for trying" + discount code
- [ ] Respond to every feedback personally

---

## Phase 5: Iterate & Scale (Week 4+)

### Data Analysis
- [ ] Weekly performance review using admin dashboard
  - Ad metrics: CPM, CPC, CTR, conversion rate
  - Landing page: bounce rate, time on page, signup rate
  - Product: trial starts, trial->paid conversion, feature usage (PostHog)
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

### Ready for Soft Launch
- [x] Code signing works
- [ ] Auto-updates tested end-to-end
- [x] License key system works
- [x] Professional icon
- [ ] Landing page live with content
- [ ] At least 1 demo video
- [ ] Trial logic implemented

### Ready for Scale
- 100+ waitlist signups
- <$10 cost per signup
- 15%+ trial->paid conversion
- No critical bugs

### Product-Market Fit
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
- Bundle pricing
- Subscription option: $9/month or $49/year (currently subscription via Stripe)
