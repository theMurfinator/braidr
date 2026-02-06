# Launch Planning Conversation Summary
**Date**: February 6, 2025

## Key Decisions Made

### Product Status
- **Current state**: Feature-complete v1.0, way past MVP
- **Missing for launch**: Primarily packaging/polish, not features
- **Name**: Sticking with "Braidr" (unique, memorable, evokes braiding timelines)
- **Pricing**: $49 one-time purchase after 7-day free trial

### Launch Strategy
- **Approach**: Pre-launch validation before full public launch
- **Timeline**: 4-week phased rollout
- **Budget**: $10-20/day ad spend during testing phase
- **Target**: Multi-POV novel writers (fantasy, sci-fi, romance, literary)

### Marketing Philosophy
- Test messaging with small budget first
- Build automated data pipeline for Claude to analyze
- Iterate based on real performance data, not assumptions
- Don't need organized beta - launch with trial and gather feedback directly

## Critical Path Identified

### Week 1: Technical Foundation
1. Apple Developer account ($99)
2. Code signing + notarization
3. Auto-update system
4. License key integration (Gumroad)
5. Professional app icon

### Week 2: Marketing Foundation
1. Landing page (Next.js on Vercel)
2. Demo videos (3 scripts written, user records)
3. Analytics setup (PostHog + GA4)
4. Email capture (ConvertKit)

### Week 3: Soft Launch
1. Small community posts (Reddit, NaNoWriMo forums)
2. $10-15/day Meta ads to waitlist
3. Gather initial feedback
4. Analyze data and iterate

### Week 4: Optimize & Scale
1. Kill losing ads, double down on winners
2. Scale to $20/day on best performers
3. Product Hunt launch
4. Email waitlist with launch offer

## Unique Selling Propositions

### Core Message
"Every other writing tool makes you choose: organize by character OR by reading order. Braidr lets you do both."

### Key Differentiators
1. **Two-view model**: POV view + Braided view (unique to Braidr)
2. **Local markdown files**: User owns data, can use git, edit anywhere
3. **Built specifically for multi-POV**: Not a general tool trying to do everything

### Marketing Hooks to Test
1. "Scrivener can't do this for multi-POV novels"
2. "I built a tool for multi-POV novelists and it changed everything"
3. "Stop using Scrivener for multiple POV characters"
4. "Here's how I manage 5 POV characters without losing my mind"
5. "Finally: A writing tool that understands braided timelines"

## Automation Strategy

### Data Pipeline
Claude will read weekly JSON exports containing:
- Meta ad performance (spend, impressions, clicks, conversions)
- Landing page analytics (visitors, bounce rate, signups)
- Product metrics (trials, trial→paid conversion, revenue)

### Weekly Analysis
Claude provides:
- Performance summary with key metrics
- Creative insights (which ads/hooks are winning)
- Audience insights (which targeting performs best)
- Landing page recommendations (where users drop off)
- Budget allocation suggestions (shift $ to winners)

### Optimization Loop
1. Claude reads data → identifies patterns
2. Recommends: kill losing ads, create new variations of winners
3. Suggests: landing page tweaks, new audiences, budget changes
4. User implements → new data flows in → repeat

## Success Metrics Defined

### Pre-Launch Validation (Week 3-4)
- 100+ waitlist signups = market wants this
- <$10 cost per signup = sustainable economics
- Clear winning message = we know what resonates
- <50% bounce rate = landing page compelling

### Launch Success (Month 1)
- 50+ paid customers
- 15%+ trial→paid conversion rate
- <$30 customer acquisition cost
- Positive qualitative feedback

### Product-Market Fit (Month 2-3)
- Consistent daily signups
- Organic growth starting (word of mouth)
- Users recommending to others
- Sustainable unit economics (CAC < LTV)

## Risk Mitigation

### If Ads Don't Work (CAC > $50)
- Pivot to organic content marketing
- Focus on writing communities
- Partner with writing YouTubers
- Build audience first, monetize later

### If Conversion Rate Low (<10%)
- Product/onboarding issue, not marketing
- Survey trial users for feedback
- Fix friction points
- Don't scale until conversion improves

### If Market Doesn't Respond
- Validate: Is the problem real and big enough?
- Talk to 20+ multi-POV writers
- Understand their actual workflows
- Consider pivot or repositioning

## Technical TODOs (Priority Order)

### Blockers (Can't launch without):
1. Code signing + notarization
2. Auto-update system
3. License key system
4. Professional app icon

### Important (Should have):
5. Backup/restore system
6. First-run onboarding
7. Export to folder
8. Privacy policy

### Nice-to-have (Can wait):
9. Crash reporting
10. Usage analytics
11. In-app feedback

## Budget Breakdown

### Upfront Costs
- Apple Developer: $99/year
- App icon: $50-100 (Fiverr)
- Domain: $12/year
- **Total**: ~$175

### Monthly Ongoing
- Hosting: $0 (Vercel free tier)
- Email: $0 (ConvertKit free up to 1k)
- Analytics: $0 (PostHog free tier)
- Ads: $450-600/month (when scaling)

### Break-Even Analysis
- At $49 price and $10 CAC → need 20% trial→paid conversion
- At $49 price and $15 CAC → need 30% trial→paid conversion
- Industry standard: 15-25% for productivity tools

## User's Context

### Current Situation
- Not ready for full public launch yet
- Exploring/validating the idea
- Willing to invest $10-20/day in testing
- Willing to record demo videos
- Wants automated marketing machine for long-term

### Preferences
- Prefers Option A: Full build (landing page + analytics + automation)
- No strong tech preferences (open to recommendations)
- Wants to save time with automation
- Values data-driven decision making

## Next Actions

### Immediate (This Week)
1. Review TASKS.md and prioritize
2. Sign up for Apple Developer account
3. Commission app icon on Fiverr
4. Start implementing auto-updates

### Short-term (Week 2)
1. Build landing page
2. Record demo videos
3. Set up analytics
4. Write privacy policy

### Medium-term (Week 3-4)
1. Soft launch to communities
2. Start small ad campaigns
3. Gather data
4. Iterate and optimize

## Files Created

All planning materials saved to `/Users/brian/Writing app/Launch/`:

1. **README.md** - Overview, timeline, success metrics
2. **TASKS.md** - Detailed implementation checklist
3. **marketing-plan.md** - Automated marketing workflow
4. **conversation-summary.md** - This file

## Questions to Revisit

1. **Name**: "Braidr" chosen, but keep open to validation from target users
2. **Pricing**: $49 chosen, but consider A/B testing $39/$49/$59
3. **Trial length**: 7 days chosen, but monitor if users need more/less time
4. **Beta program**: Skipped for now, but could revisit if needed
5. **Platform**: macOS only for now, Windows later if demand exists

## Key Insights

1. **Product is ready**: The blocker isn't features, it's packaging and go-to-market
2. **Automation is key**: Build data pipeline first, then iterate fast based on signals
3. **Start small**: Test with $10-15/day before scaling to $100s/day
4. **Validate messaging**: Don't assume, test multiple hooks and let data decide
5. **Local files = strength**: Market this as a feature, not a limitation
6. **Niche is good**: "Multi-POV novelists" is specific enough to target, big enough to scale

## Inspiration & Motivation

User quote: "I am really excited."

This is the energy to maintain through launch. The product is solid, the market exists, the timing is right. Execute methodically, test assumptions, let data guide decisions, and iterate fast.

Ready to build. 🚀
