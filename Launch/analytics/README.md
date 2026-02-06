# Analytics & Reports

This folder will contain weekly performance reports for Claude to analyze.

## File Format

Each week, export performance data to a JSON file named `week-YYYY-MM-DD.json`

Example: `week-2025-02-10.json`

### Expected JSON Structure

```json
{
  "date_range": "2025-02-10 to 2025-02-17",
  "meta_ads": {
    "spend": 105.50,
    "impressions": 23400,
    "clicks": 450,
    "cpm": 4.51,
    "cpc": 0.23,
    "ctr": 0.0192,
    "signups": 45,
    "cost_per_signup": 2.34,
    "ads": [
      {
        "id": "ad_001",
        "name": "Scrivener can't do this v1",
        "spend": 35.20,
        "clicks": 180,
        "signups": 18,
        "cpc": 0.20
      }
    ]
  },
  "landing_page": {
    "visitors": 450,
    "bounce_rate": 0.42,
    "avg_time_on_page": 67,
    "video_play_rate": 0.31,
    "signups": 45,
    "signup_conversion": 0.10,
    "traffic_sources": {
      "meta_ads": 420,
      "organic": 20,
      "referral": 10
    }
  },
  "product": {
    "trial_starts": 38,
    "active_trials": 32,
    "trial_to_paid": 6,
    "conversion_rate": 0.158,
    "total_revenue": 294.00,
    "refunds": 0
  },
  "email": {
    "list_size": 145,
    "new_subscribers": 45,
    "open_rate": 0.42,
    "click_rate": 0.18,
    "unsubscribes": 2
  }
}
```

## How to Use

1. **Export data weekly** (every Monday)
2. **Save to this folder** as `week-YYYY-MM-DD.json`
3. **Let Claude read it** - Claude will analyze and provide recommendations
4. **Implement changes** based on insights
5. **Repeat**

## Tools to Use

- **Meta Ads**: Export from Ads Manager or use Meta API
- **Google Analytics**: Use GA4 data export
- **PostHog**: Export via API or dashboard
- **ConvertKit**: Export stats from dashboard
- **Gumroad**: Sales data from dashboard

## Alternative: CSV Exports

If JSON is too much work, export CSV files and Claude can still read them:

- `meta-ads-week-YYYY-MM-DD.csv`
- `ga4-week-YYYY-MM-DD.csv`
- `posthog-week-YYYY-MM-DD.csv`

Claude will adapt to whatever format works best for you.
