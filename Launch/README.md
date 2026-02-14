# Braidr Launch Plan

## Product Overview
**Braidr** - A writing tool built specifically for novelists managing multiple POV characters.

### Core Value Proposition
- **POV View**: Work on each character's arc independently
- **Braided View**: See the reading order, reorder scenes with drag-and-drop
- **Your Data**: Plain markdown files you own forever

### Target Market
Writers working on multi-POV novels (fantasy, sci-fi, romance, literary fiction)

### Pricing Model
- **14-day free trial** → **$39/year subscription**
- Payments via Stripe, license keys via Keygen

---

## Current Status

### Product State
✅ **Feature-complete v1.0** - all MVP features implemented
- POV outline view with full editing
- Braided timeline view
- Drag-and-drop reordering
- Tag database with autocomplete
- Metadata properties system
- Editor view with draft prose
- Rails visualization
- Scene connections

### What's Missing for Launch

**Critical (Blockers):**
- [x] Apple Developer account ($99/year)
- [x] Code signing + notarization setup
- [x] Auto-update system (electron-updater)
- [x] License key system (Stripe + Keygen integration)
- [x] Server/API deployed to Vercel (Stripe webhooks, customer portal, admin dashboard)
- [x] Verify Stripe webhook + env vars configured in dashboards
- [ ] End-to-end purchase test
- [x] Professional app icon

**Important (Should-have):**
- [ ] Backup system (auto-save to ~/Library/Application Support/Braidr/backups/)
- [ ] First-run welcome screen
- [ ] Export to folder functionality
- [ ] Privacy policy
- [ ] Swap Clerk test keys to production

**Nice-to-have (Can wait):**
- [ ] Crash reporting (Sentry)
- [ ] Usage analytics (PostHog)
- [ ] In-app feedback button
- [ ] Restrict CORS to production domain

---

## Launch Timeline

### Week 1: Technical Foundation
- Get Apple Developer account
- Implement code signing + auto-updates
- Commission app icon on Fiverr
- Set up Gumroad for payments

### Week 2: Marketing Foundation
- Build landing page (braidr.app)
- Record demo videos
- Set up analytics infrastructure
- Write privacy policy

### Week 3: Soft Launch
- Post in writing communities (Reddit, NaNoWriMo)
- Start $10/day Meta ads to waitlist
- Gather feedback
- Iterate on messaging

### Week 4: Scale & Optimize
- Analyze data, double down on winners
- Scale to $20/day on best-performing ads
- Launch on Product Hunt / Indie Hackers
- Email waitlist with launch offer

---

## Success Metrics

### Pre-Launch Validation (Week 3-4)
- 100+ waitlist signups = people want this
- Sub-$10 cost per signup = sustainable CAC
- Clear winning message = we know what resonates
- Bounce rate <50% = landing page is compelling

### Launch Success (Month 1-3)
- 50+ paid customers in first month
- 15%+ trial → paid conversion rate
- <$30 customer acquisition cost (CAC)
- 4+ star average rating/feedback

---

## Budget

### Initial Investment
- Apple Developer: $99/year
- App icon design: $50-100 (Fiverr)
- Domain (braidr.app): $12/year
- Hosting (Vercel): $0 (free tier)
- Email (ConvertKit): $0 (free tier up to 1k subscribers)
- Analytics (PostHog): $0 (free tier)
- **Total upfront**: ~$175

### Monthly Ad Spend
- Weeks 1-2: $0 (building)
- Week 3: $10-15/day = ~$100-150
- Week 4+: $15-20/day = ~$450-600/month
- Adjust based on performance

### Break-Even Analysis
- At $49/purchase and $10 CAC → need 20% trial→paid conversion
- At $49/purchase and $15 CAC → need 30% trial→paid conversion
- Industry standard for productivity tools: 15-25%

---

## Key Documents
- `TASKS.md` - Implementation checklist
- `marketing-plan.md` - Automated marketing workflow
- `messaging.md` - Ad copy, landing page copy
- `analytics/` - Weekly performance reports

---

## Next Steps
1. Review TASKS.md and prioritize
2. Get Apple Developer account
3. Start technical implementation
4. Commission app icon
5. Begin marketing foundation build
