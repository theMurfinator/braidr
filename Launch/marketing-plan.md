# Braidr Marketing Automation Plan

## Vision
Build a highly-automated marketing machine where Claude can read performance data, analyze trends, and provide optimization recommendations with minimal manual intervention.

## Budget
- **Pre-launch**: $0 (building infrastructure)
- **Week 3**: $10-15/day (~$100-150 total)
- **Week 4+**: $15-20/day (~$450-600/month)
- **Adjust based on performance**: If CAC < $10 and conversion > 15%, scale up

---

## Phase 1: Foundation (Week 1-2)

### Landing Page Tech Stack
- **Framework**: Next.js (fast, SEO-friendly, easy deploys)
- **Hosting**: Vercel (free tier, auto-deploy from git)
- **Styling**: Tailwind CSS (fast iteration, looks professional)
- **Analytics**: PostHog (free tier) + Google Analytics 4
- **Email**: ConvertKit or Loops (free up to 1k subscribers)
- **Forms**: Native or Typeform

### Page Structure
```
braidr.app/
├── / (home)
│   ├── Hero: "Finally, a tool built for multi-POV novelists"
│   ├── Problem: Scrivener/Notion don't understand braided timelines
│   ├── Solution: Show POV + Braided views
│   ├── Features: Grid of key features with icons
│   ├── Demo Video: 60-second walkthrough
│   ├── Pricing: $49 one-time, 7-day free trial
│   ├── CTA: "Download Free Trial" (email capture)
│   └── Social Proof: Testimonials (when available)
├── /privacy
└── /terms
```

### Analytics Instrumentation
Track everything:
- Page views by source (organic, ad, referral)
- Time on page
- Scroll depth
- Video play rate
- Button clicks ("Download Trial", "Learn More")
- Email signups
- Conversion funnel: visitor → signup → download → trial → purchase

### Data Export for Claude
Create `/api/analytics` endpoint that exports JSON:
```json
{
  "date_range": "2024-02-06 to 2024-02-13",
  "landing_page": {
    "visitors": 450,
    "bounce_rate": 0.42,
    "avg_time_on_page": 67,
    "video_play_rate": 0.31,
    "signups": 45,
    "signup_conversion": 0.10,
    "top_traffic_source": "meta_ads",
    "exit_points": {
      "hero": 0.15,
      "features": 0.12,
      "pricing": 0.08
    }
  },
  "meta_ads": {
    "spend": 105.50,
    "impressions": 23400,
    "clicks": 450,
    "cpm": 4.51,
    "cpc": 0.23,
    "ctr": 0.0192,
    "signups": 45,
    "cost_per_signup": 2.34,
    "best_performing_ad": "hook_scrivener_cant_v3"
  },
  "product": {
    "trial_starts": 38,
    "trial_to_paid": 6,
    "conversion_rate": 0.158,
    "total_revenue": 294.00,
    "avg_trial_duration": 5.2
  }
}
```

---

## Phase 2: Ad Creative Strategy (Week 2)

### Video Scripts (You Record)

**Script 1: "Scrivener Can't Do This" (30s)**
```
[Screen: Scrivener binder with multiple POV folders]
HOOK: "If you write multiple POV characters, Scrivener has a problem."

[Show clicking between folders]
"You can organize by character... OR by reading order. But not both."

[Switch to Braidr - show POV view]
"With Braidr, work on each character's arc independently..."

[Click to Braided view]
"...then see the reading order and drag scenes around."

[Show drag-and-drop]
"No more jumping between folders. No more spreadsheets."

[CTA screen]
"Try Braidr free for 7 days. Link in bio."
```

**Script 2: "Built for Multi-POV" (45s)**
```
[Screen: Blank Braidr]
HOOK: "I built a writing tool specifically for multi-POV novels."

[Create first character]
"Add your POV characters..."

[Add scenes to POV view]
"...outline each character's arc in order..."

[Switch to Braided view]
"...then switch to Braided view to see the reading order."

[Drag scenes around]
"Drag to reorder. The POV view stays intact."

[Show tags, metadata, notes]
"Tag characters, locations, plot threads. Add notes. Track status."

[CTA]
"Your outline, your data, local markdown files. Try it free."
```

**Script 3: "Your Data Stays Yours" (30s)**
```
[Screen: Finder showing .md files]
HOOK: "Unlike other writing tools, Braidr doesn't lock in your data."

[Open file in VS Code]
"Plain markdown files. Edit in any text editor."

[Show git commit]
"Use version control. Make backups."

[Open in Obsidian]
"Compatible with Obsidian, or just keep them as files."

[Back to Braidr]
"But when you need to braid timelines, Braidr makes it effortless."

[CTA]
"Own your data. Try Braidr free."
```

### Image Ads (For Testing)
- Screenshots of POV → Braided view comparison
- Feature showcase grid
- Before/after (Scrivener chaos vs Braidr clean)

### Ad Copy Templates

**Hook Variations:**
1. "If you write multiple POV characters, stop using Scrivener"
2. "I built a tool for multi-POV novelists and it changed everything"
3. "Scrivener can't do this for multi-POV novels..."
4. "Here's how I manage 5 POV characters without losing my mind"
5. "Finally: A writing tool that understands braided timelines"

**Body Copy Template:**
```
[HOOK]

Every other writing tool makes you choose: organize by character OR by reading order.

Braidr lets you do both.

→ POV View: Work on each character's arc
→ Braided View: See the reading order
→ Your Data: Plain markdown files

Try free for 7 days. No credit card required.
```

---

## Phase 3: Meta Ads Setup (Week 3)

### Campaign Structure

**Campaign 1: Cold Audience (Testing)**
- Budget: $10-15/day
- Objective: Conversions (Email Signup)
- Audiences:
  - Interest: Writing, Creative Writing, Fiction Writing
  - Interest: NaNoWriMo, Scrivener, Plottr
  - Interest: Fantasy Writing, Science Fiction
  - Age: 25-55 (prime novelist age)
  - Location: US, UK, Canada, Australia (English-speaking)

**Ad Sets (Test 3-5 simultaneously):**
1. Hook: "Scrivener can't do this"
2. Hook: "I built a tool for multi-POV"
3. Hook: "Stop using Scrivener"
4. Hook: "Managing 5 POV characters"
5. Hook: "Braided timelines"

**Creative Variations:**
- 3 video scripts → 3 videos
- 2 thumbnail variations per video
- 2 body copy variations
- Total: 12 ad combinations

### Optimization Strategy
**Week 1:**
- Let all ads run, gather data
- Minimum 1000 impressions per ad
- Track: CTR, CPC, signup rate

**Week 2:**
- Kill bottom 50% of ads
- Double budget on top performers
- Create new variations of winners

**Week 3+:**
- Continuous iteration
- New ad every 3-4 days
- Scale winners, kill losers fast

---

## Phase 4: Automated Analysis (Ongoing)

### Weekly Reports (Claude Reads)

**What I Need Access To:**
1. **Meta Ads API** (or CSV exports)
   - Ad performance by ad ID
   - Audience performance
   - Spend, impressions, clicks, conversions

2. **Google Analytics 4 API**
   - Landing page metrics
   - User flow
   - Conversion funnel

3. **Email Platform API** (ConvertKit)
   - List growth
   - Open rates
   - Click rates

4. **Product Analytics** (PostHog or custom)
   - Trial starts
   - Feature usage
   - Trial→Paid conversion

### What I'll Provide Weekly:

**Performance Summary:**
```
📊 Week of Feb 6-13

💰 FINANCIALS
- Ad Spend: $105
- Signups: 45 ($2.34 each)
- Trials: 38
- Purchases: 6 ($17.50 CAC)
- Revenue: $294
- ROAS: 2.79x

📈 TOP PERFORMERS
- Ad: "Scrivener can't do this" - 4.2% CTR, $1.80 CPS
- Audience: Fantasy Writers 25-45 - Best conversion rate
- Time: 7-9pm posts get 2x engagement

🚨 RED FLAGS
- Bounce rate up to 48% (was 42%)
- Video play rate down to 28%
- Trial→Paid conversion at 14% (target: 15%+)

✅ RECOMMENDATIONS
1. Kill ads #3 and #5 (high CPC, low conversion)
2. Create new variation of "Scrivener" hook
3. A/B test landing page: shorter vs current
4. Add testimonial section (reduce bounce)
5. Shift 30% budget to fantasy writer audience
```

**Creative Insights:**
- Which hooks are working
- Which videos get watched
- What copy resonates
- Audience preferences

**Landing Page Optimization:**
- Where users drop off
- What they click
- A/B test ideas
- Copy tweaks

---

## Phase 5: Scaling (Month 2+)

### When to Scale
✅ All green lights:
- Cost per signup < $10
- Trial→Paid conversion > 15%
- Consistent daily signups
- ROAS > 2x
- Cash flow positive

### How to Scale
1. **Increase budget gradually**: +20% per week
2. **Expand audiences**: Lookalike audiences from converters
3. **New channels**:
   - Google Ads (search intent)
   - Reddit ads (r/writing, r/fantasywriters)
   - YouTube pre-roll (writing channels)
4. **Content marketing**: SEO blog posts, YouTube reviews
5. **Partnerships**: Affiliate deals with writing YouTubers

### Long-term Automation Goals
- **Claude reads weekly reports** → provides recommendations
- **Auto-pause losing ads** (via API or Zapier)
- **Auto-generate new ad copy** based on winners
- **A/B test landing pages** automatically
- **Predictive scaling**: "Based on current trends, increase budget to $X"

---

## Success Metrics

### Pre-Launch (Week 3-4)
- ✅ 100+ waitlist signups
- ✅ <$10 cost per signup
- ✅ >40% video view rate
- ✅ <50% bounce rate

### Launch (Month 1)
- ✅ 50+ paid customers
- ✅ 15%+ trial→paid conversion
- ✅ <$30 CAC
- ✅ 2x+ ROAS

### Growth (Month 2-3)
- ✅ 100+ paid customers
- ✅ 20%+ trial→paid conversion
- ✅ <$25 CAC
- ✅ 3x+ ROAS
- ✅ Organic growth starting (word of mouth)

---

## Contingency Plans

### If Ads Don't Work (CAC > $50)
- Pivot to content marketing
- Focus on writing communities (organic)
- Partner with writing YouTubers
- Build audience first, monetize later

### If Conversion Rate is Low (<10%)
- Product issue, not marketing issue
- Survey trial users: why didn't you buy?
- Fix onboarding, add features, reduce friction
- Don't scale until conversion improves

### If Nothing Works
- Validate: Do multi-POV writers actually have this problem?
- Talk to 20 writers, understand their workflow
- Maybe the problem isn't big enough
- Consider pivot or new approach

---

## Next Steps

1. **This Week**: Build landing page infrastructure
2. **Next Week**: Record demo videos, set up ads
3. **Week 3**: Launch, gather data
4. **Week 4+**: Optimize, scale

Ready to build? 🚀
