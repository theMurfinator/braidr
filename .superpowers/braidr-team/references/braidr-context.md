# Braidr — Product Context for the Launch Team

## What Braidr Is

A multi-POV narrative outlining tool for novelists. Writers managing stories with multiple point-of-view characters can plan, braid, and write their entire structure inside Braidr.

Core concepts:
- **The braid** — the chronological reading order across all POV characters. The reader's experience.
- **Plot points** — structural story beats organizing scenes within a character's arc.
- **POV view** — one character's story in their narrative order, fully editable.
- **Rails view** — all POV characters visible simultaneously in parallel columns, timeline rows downward.
- **Table view** — spreadsheet view of all scenes with sortable, filterable custom metadata columns.
- **Scene metadata** — user-defined fields (text, dropdown, multiselect) attached to scenes.

Differentiator: **structural discipline**, not free-form binders. Typed levels (Novel → Arc → Plot point → Chapter → Scene), per-level metadata fields, binary placement (placed or bullpen — never floating). Scrivener's untyped binder is what Braidr deliberately is not.

## Current State (June 2026)

### App
- **Platform:** macOS + Windows desktop (Electron + React + Vite)
- **Version:** v1.5.183+, shipping via GitHub Releases
- **Data format:** Single `.braidr` SQLite file per project (fully migrated from legacy markdown)
- **Release pipeline:** Fully automated — merge to main → codesign + notarize → publish. Takes ~10 min.
- **Feature status:** Feature-complete for v1. Views: POV, Braid (List + Rails + Table), Arc, Editor, Notes (BlockNote), Tasks, Analytics, Export
- **Known rough area:** Draft Branches — ships but UX is choppy; not to be spotlighted
- **iOS:** Excluded from launch scope
- **Tech debt:** App.tsx at 5,370 lines, no typecheck/ESLint gate, ~60 console.* in prod — not blocking but noted

### Payment & Commerce
- **Price:** $39/yr, one plan, all features included
- **Stripe:** Buy link live and tested (`buy.stripe.com/eVq00k3m761132Z13pa3u00`)
- **Trial:** 14-day free trial, email-based activation
- **License API:** `https://braidr-api.vercel.app` — validates email against Stripe subscriptions
- **In-app:** `LicenseGate` component handles trial, expired, and unlicensed states

### Website
- **Stack:** Next.js + Tailwind, deployed (or being deployed) to Vercel
- **Pages:** `/` landing, `/changelog`, `/privacy`, `/guide/*` (7+ sections), `/new` (alt hero)
- **A/B test:** Hero headline via PostHog feature flag (3 variants active)
- **⚠️ Known issue:** Download links point to v1.5.56 — need updating to latest release
- **❌ Missing:** Terms of Service page

### Analytics
- PostHog on landing (scroll depth, CTA clicks, downloads) and in-app (main process events)
- No crash reporting yet (no Sentry or equivalent)

## What Still Needs to Happen Before Launch

1. Fix stale download links on landing page
2. Add Terms of Service page
3. Verify Vercel deployment is live
4. Confirm electron-updater auto-update works end-to-end
5. Add crash reporting
6. UI polish pass (current aesthetic is functional but developer-built)

## Brian's Values (Non-Negotiable)

Braidr is a passion project. Brian loves writers. He is not here to manipulate or extract money from them.

- Pricing that a writer who is also probably broke can actually consider
- No dark patterns, fake urgency, or psychological pressure
- Marketing that earns attention, not hijacks it
- Community that is genuinely useful, not a funnel

## Distribution Strategy (Current Thinking)

- Direct download from website as primary channel (not App Store — desktop Electron app)
- GitHub Releases as download host
- Brian's podcast as a natural content channel
- Slow-burn organic growth preferred over paid acquisition
- Reddit writing communities as a seeding ground (context doc at `docs/braidr-reddit-context.md`)

## Tech Stack

- Electron + React (Vite) desktop app
- SQLite (better-sqlite3) — single `.braidr` file per project, local only
- TipTap (editor), BlockNote (notes), d3-force (graph view), dnd-kit (drag and drop)
- PostHog (analytics), Stripe (payments), Vercel (landing + license API)
- No cloud sync — local-first is a feature, not a limitation

## Brian's Working Style

- Thinks in layers: data model first, then design, then distribution
- Does not want to be cheerled or have feedback softened
- Wants a thought partner and honest editor
- Does not want prose or content generated unless he asks explicitly
- Prefers to think through an approach before executing
- Heavy Claude usage as primary collaborator (Claude Code CLI for app work)
- Tracking ~15 hours/week writing time as a personal focus
