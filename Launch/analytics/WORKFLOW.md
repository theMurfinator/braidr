# Weekly Analytics Workflow

Every Monday, spend ~15 minutes pulling data from each source. Fill in `template.json`, save as `week-YYYY-MM-DD.json`, and paste to Claude with the analysis prompt from `claude-prompt.md`.

---

## 1. PostHog (2 min)

1. Go to [PostHog](https://us.posthog.com) > Web Analytics
2. Set date range to **last 7 days**
3. Note:
   - Unique visitors
   - Pageviews
   - Avg session duration
   - Bounce rate
4. Go to **Events** > filter for `waitlist_signup`
5. Note the count

## 2. Google Analytics (2 min)

1. Go to [GA4](https://analytics.google.com)
2. Reports > Acquisition > **Traffic acquisition**
3. Set date range to last 7 days
4. Note sessions by channel: Paid Social, Organic Search, Direct, Referral
5. Reports > Engagement > **Events** > look for `generate_lead` count

## 3. Meta Ads Manager (5 min)

1. Go to [Meta Ads Manager](https://adsmanager.facebook.com)
2. Set date range to last 7 days
3. Note totals: Spend, Impressions, Clicks, CTR, CPC, Results (Leads), Cost per Result
4. Note per-ad breakdown (same metrics for each ad)
5. Optional: Export as CSV

## 4. Email Service — Loops (2 min)

1. Go to [Loops](https://app.loops.so) > Audience
2. Note: Total contacts, new this week
3. Go to **Campaigns** or **Automations**
4. Note: Open rate, click rate, unsubscribes

## 5. Product Sales — Gumroad (2 min)

1. Go to [Gumroad](https://gumroad.com) > Dashboard
2. Note: Sales, revenue, refunds
3. (Pre-launch: these will be 0)

## 6. A/B Test Results (2 min)

1. Go to PostHog > **Experiments** or **Feature Flags**
2. For each active test, note per-variant: visitors, signups, conversion rate
3. Check if any test has reached statistical significance

---

## Save the Data

1. Copy `template.json`
2. Fill in all numbers
3. Save as `week-YYYY-MM-DD.json` (e.g., `week-2026-03-10.json`)
4. Open Claude and paste the JSON with the prompt from `claude-prompt.md`

## What You Get Back

Claude will provide:
- Executive summary (3 sentences)
- Metrics vs targets table
- Top 3 things working
- Top 3 things needing attention
- Prioritized recommendations for next week
- Budget allocation suggestion
- A/B test recommendations
