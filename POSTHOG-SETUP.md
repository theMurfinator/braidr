# PostHog Setup Guide

## Overview

Braidr uses two separate PostHog projects to track the desktop app and landing page independently.

| Project | Tracks | Library | Key env var |
|---------|--------|---------|-------------|
| **Braidr App** | Electron desktop app | `posthog-node` | `VITE_POSTHOG_KEY` |
| **Braidr Web** | Landing page (braidr-landing) | `posthog-js` | `NEXT_PUBLIC_POSTHOG_KEY` |

The dashboard (braidr-dashboard) reads from both projects via the PostHog API.

---

## Step 1: Create Two PostHog Projects

PostHog requires a paid plan for multiple projects. Once subscribed:

1. Go to [https://us.posthog.com](https://us.posthog.com)
2. Click your project name (top left) → **New project**
3. Create **Braidr App** (for the desktop app)
4. Create **Braidr Web** (for the landing page)
5. Note each project's **Project API Key** (`phc_...`) and **Project ID** (number)

---

## Step 2: Configure the Desktop App (braidr)

The PostHog key is baked into the Electron build via GitHub Actions.

1. Go to GitHub → `theMurfinator/braidr` → **Settings** → **Secrets and variables** → **Actions**
2. Add these repository secrets:
   - `VITE_POSTHOG_KEY` = the `phc_...` key from **Braidr App** project
   - `VITE_POSTHOG_HOST` = `https://us.i.posthog.com`
3. The next release build will include PostHog tracking

**What gets tracked:** See `POSTHOG-TRACKING.md` for the full event list (app_opened, writing sessions, scene/character CRUD, license events, etc.)

**User opt-out:** Users can disable telemetry by setting `localStorage['braidr-telemetry-opt-out'] = 'true'` in the app.

---

## Step 3: Configure the Landing Page (braidr-landing)

The landing page uses client-side PostHog via `posthog-js`.

1. Go to Vercel → `braidr-landing` project → **Settings** → **Environment Variables**
2. Add:
   - `NEXT_PUBLIC_POSTHOG_KEY` = the `phc_...` key from **Braidr Web** project
   - `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`
3. Redeploy the site (push to main or trigger manual deploy)

**What gets tracked:** Pageviews, page leaves, autocaptured clicks, CTA clicks (with location: nav/hero/pricing/final_cta), scroll depth.

---

## Step 4: Configure the Dashboard (braidr-dashboard)

The dashboard queries both projects server-side.

1. Go to Vercel → `braidr-dashboard` project → **Settings** → **Environment Variables**
2. Update these vars:
   - `POSTHOG_API_KEY` = your **personal API key** (`phx_...`) — already set
   - `POSTHOG_PROJECT_ID` = the Project ID of whichever project you want the main dashboard to show (probably **Braidr App**)
   - `POSTHOG_HOST` = `https://us.posthog.com` — already set
3. Redeploy

To query **both** projects from the dashboard, also set:
   - `POSTHOG_APP_PROJECT_ID` = Braidr App project ID
   - `POSTHOG_WEB_PROJECT_ID` = Braidr Web project ID

These are used by the server-side analytics endpoints in `braidr/server/api/admin/`.

---

## Step 5: Filter Out Your Own Traffic

In **each** PostHog project:

1. Go to **Settings** → **Project** → **Filter out internal and test users**
2. Add a filter: **$ip** → **is not** → your IP address
3. This adds a toggle to every insight — "Filter out internal and test users"

To find your IP: visit [https://whatismyip.com](https://whatismyip.com)

---

## Step 6: Configure the Server Admin Analytics (braidr/server)

The server has admin endpoints that aggregate data from both PostHog projects.

1. Go to Vercel → `braidr` server project → **Settings** → **Environment Variables**
2. Add:
   - `POSTHOG_PERSONAL_API_KEY` = your personal API key (`phx_...`)
   - `POSTHOG_APP_PROJECT_ID` = Braidr App project ID
   - `POSTHOG_WEB_PROJECT_ID` = Braidr Web project ID

---

## Summary of All Environment Variables

### GitHub Actions (braidr repo secrets)
| Secret | Value |
|--------|-------|
| `VITE_POSTHOG_KEY` | `phc_...` from Braidr App |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` |

### Vercel: braidr-landing
| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_...` from Braidr Web |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` |

### Vercel: braidr-dashboard
| Variable | Value |
|----------|-------|
| `POSTHOG_API_KEY` | `phx_...` (personal API key) |
| `POSTHOG_PROJECT_ID` | Braidr App project ID |
| `POSTHOG_HOST` | `https://us.posthog.com` |
| `DASHBOARD_SECRET` | Password for dashboard login |

### Vercel: braidr server
| Variable | Value |
|----------|-------|
| `POSTHOG_PERSONAL_API_KEY` | `phx_...` (personal API key) |
| `POSTHOG_APP_PROJECT_ID` | Braidr App project ID |
| `POSTHOG_WEB_PROJECT_ID` | Braidr Web project ID |
