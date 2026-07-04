# Braidr — Launch Readiness Assessment
_Last updated: 2026-06-25_

---

## Summary Verdict

**Closer than the 6/25 version of this doc said — updated 2026-07-04.** Download links, ToS, and crash reporting all turned out to already be solved (fixed 2026-07-03, this doc just hadn't caught up). The only real remaining launch blocker is confirming the Vercel deployment, which is already in motion as part of the homepage refresh. Biggest honest risk is still design — the current UI is "built by a developer," and Brian's flagged 5 specific screens (Braided, Outline, Analytics, Timeline, Notes) as imperfect, not launch-blocking but a real gap.

---

## 1. Payment & Licensing

| Item | Status | Notes |
|---|---|---|
| Stripe checkout link | ✅ Wired | `buy.stripe.com` link live on landing, $49/yr |
| 14-day trial | ✅ Shipped | `LicenseGate` + `src/main/license.ts` |
| License activation | ✅ Shipped | Email-based, validates against `braidr-api.vercel.app` |
| License deactivation | ✅ Shipped | Clears local `license.json` |
| Server-side validation | ✅ Functional | Vercel API endpoint validates email against Stripe |
| Subscription expired state | ✅ Handled | `LicenseGate` surfaces expired screen |
| Billing portal link | ✅ In Account View | Users can manage subscription |
| License bypass hardening | ⚠️ Not audited | Client-side only; key/email stored locally. Bypassable by a determined user. Acceptable for v1, worth hardening post-launch. |
| Pricing page | ✅ Live | One plan, all features, $49/yr clearly stated |

**Verdict:** Functional for launch. Not hardened, but acceptable for a small indie app.

---

## 2. Website / Landing Page

| Item | Status | Notes |
|---|---|---|
| Landing page exists | ✅ | Next.js app in `braidr-landing/` |
| Hero copy | ✅ | A/B tested via PostHog feature flag (3 variants) |
| Feature sections | ✅ | POV, Braid, Notes, Write flow illustrated |
| Pricing section | ✅ | $49/yr, Stripe CTA |
| Download section | ✅ Fixed 2026-07-03 | `/api/download/[mac\|windows]` redirects to the latest GitHub release asset (5-min revalidate) — no more hardcoded version, can't go stale again |
| Changelog page | ✅ | `/changelog` exists |
| Privacy policy | ✅ | `/privacy` exists |
| Terms of service | ✅ Shipped 2026-07-03 | `/terms` — real content, not a stub |
| Guide / docs | ✅ | `/guide` with 7+ sections (getting started, views, export, etc.) |
| Waitlist capture | ✅ | `/api/waitlist` → Loops integration |
| Logo / branding | ✅ | SVG logo, icon present |
| OG / SEO meta | ⚠️ Partial | `metadata` in layout.tsx but no per-page OG images |
| Deployed | ⚠️ In progress | Folded into the homepage refresh work (see `STATUS.md`) — not independently verified live yet |

**Verdict:** Closer than the 6/25 version of this doc said. Download links and ToS are done; deployment verification is riding along with the homepage refresh.

---

## 3. App — Core Functionality

| Area | Status | Notes |
|---|---|---|
| POV Outline View | ✅ Solid | Sections, bullpen, drag-drop, filter, synopses |
| Braided List View | ✅ Solid | Inbox, chapters, drag-drop |
| Rails View | ✅ Solid | Gap counts, connectors, scene preview |
| Table View | ✅ Solid | Sort, filter, custom columns, view tabs (just shipped) |
| Arc View | ⚠️ Hidden | Folded into Table view; not surfaced to users — acceptable |
| Editor View | ✅ Solid | TipTap, drafts, versioning, comments, timer, auto-save |
| Notes View | ✅ Solid | BlockNote, wikilinks, backlinks, images, graph view — rebuilt June 2026 |
| Tasks View | ✅ Solid | Subtasks, timer, custom fields, saved views |
| Analytics View | ✅ Solid | Weekly hours, word counts, session history, 12-week trend |
| Draft Branches | ⚠️ Rough | Brian's own assessment: "REALLY choppy." Shipped but needs UX rework. Not a blocker if not featured prominently. |
| Compile / Export | ✅ Solid | Markdown, HTML, DOCX, PDF |
| Search (Cmd+K) | ✅ Solid | Full-text across scenes and notes |
| Custom Metadata | ✅ Solid | Field editor now accessible from Table view too |
| Chapters | ✅ Solid | |
| Split Panes / Tabs | ✅ Solid | Multi-tab workspace |

**Verdict:** Feature-complete for a v1. Branches is the one area to avoid spotlighting.

---

## 4. Data & Storage

| Item | Status | Notes |
|---|---|---|
| SQLite migration | ✅ Complete | All data in single `.braidr` file |
| Legacy project import | ✅ Complete | Folder → `.braidr` conversion on first open |
| Auto-backup on open | ✅ Shipped | Timestamped `.braidr.backup-*` sidecars |
| Empty-overwrite guard | ✅ Shipped | DB won't write empty content over real data (fixed after note-wipe incident) |
| iCloud compatibility | ✅ Confirmed | Live projects in iCloud CloudDocs work correctly |
| Data loss bugs | ✅ Fixed | Save-timeline guard + load-abort fix both shipped |
| Analytics storage | ✅ Confirmed | Scene sessions in `settings` table; task time in `time_entries` |
| Project lock (multi-device) | ✅ Shipped | Heartbeat-based `.braidr/lock.json` with takeover dialog |
| MCP server | ✅ Functional | Reads `.braidr` SQLite; registered in Claude Desktop |

**Verdict:** Solid. The data layer is the strongest part of the stack.

---

## 5. Distribution

| Item | Status | Notes |
|---|---|---|
| macOS build | ✅ Automated | GitHub Actions on merge to main; codesigned + notarized |
| Windows build | ✅ Automated | Same workflow |
| Linux build | ✅ Automated | Built but untested (no stated audience) |
| GitHub Releases | ✅ Live | Auto-published on merge |
| Current version | v1.5.183+ | |
| Landing download links | ⚠️ **v1.5.56** | **Must update before any real traffic** |
| Auto-update in app | ✅ Confirmed working | `UpdateBanner`/`UpdateModal` + electron-updater verified end-to-end as of 2026-06-28 |

**Verdict:** Builds are solid. Update the landing links immediately.

---

## 6. Analytics & Observability

| Item | Status | Notes |
|---|---|---|
| PostHog on landing | ✅ | Scroll depth, CTA clicks, download clicks tracked |
| PostHog in app | ✅ | `src/main/posthog.ts` — main process events |
| A/B test on hero headline | ✅ | Feature flag `landing-hero-headline` with 3 variants |
| Error tracking | ✅ Functional, no dedicated dashboard | No Sentry, but `main.ts` (`uncaughtException`/`unhandledRejection`) and `App.tsx` (`window.onerror`/`unhandledrejection`) both capture full error name/message/stack to PostHog as `crash_report` events. Real gap: nobody's watching for a spike — no alert wired to it. `console.*` calls still ship to prod (54→60 open calls). |
| Funnel: landing → trial → paid | ⚠️ Partial | Events exist but funnel stitching (landing visitor = app user) likely not connected |

**Verdict:** Usable for early-stage tracking. No crash reporting is a gap for post-launch monitoring.

---

## 7. UX & Design

| Item | Status | Notes |
|---|---|---|
| Functional usability | ✅ | App is usable; UX bugs from June 11 review all fixed |
| Design polish | ⚠️ Developer-built | Current aesthetic is functional but not "beautiful writer's tool" |
| UI redesign (4-mode overhaul) | 🔴 Not started | Plan exists (`docs/ui-redesign/PLAN.md`), mockup built, not implemented |
| Onboarding (first run) | ✅ | `TourOverlay` walkthrough exists |
| Feedback in-app | ✅ | `FeedbackModal` opens email |
| Empty states | ⚠️ Inconsistent | Some views handle no-data gracefully, others don't |
| Keyboard shortcuts | ✅ | Documented in guide; Cmd+K search, Cmd+S save, etc. |

**Verdict:** Works, but the design gap is the biggest soft risk for perception. If you're launching to writers who care how their tools look, this matters more than any technical gap.

---

## 8. Code Quality / Tech Debt

Not a launch blocker, but relevant for sustainability:

| Item | Status |
|---|---|
| `App.tsx` line count | 5,370+ lines — biggest ongoing maintenance cost |
| TypeScript errors | ~6 (renderer errors not caught by build; no typecheck gate) |
| ESLint | Not wired (no `eslint.config.js`) |
| Test coverage | 19 test files for 47k+ LOC — thin outside core data layer |
| `console.*` in prod | ~60 calls ship unstripped |
| Branches feature debt | Acknowledged; rework planned after data substrate settles |
| Dead drag-and-drop remnants | `_dropTargetIndex`, `canDragSceneRef`, `draggedPovSceneRef` in `App.tsx` — leftover from pre-dnd-kit HTML5 drag, confirmed still present 2026-07-04 |

---

## 9. Missing Before Launch (Priority Order)

1. ~~Fix landing download links~~ → fixed 2026-07-03, now self-updating
2. ~~Add Terms of Service page~~ → shipped 2026-07-03
3. **Verify Vercel deployment** → riding along with the homepage refresh; still needs a real check once that ships
4. ~~Wire auto-update~~ → confirmed working end-to-end as of 2026-06-28
5. ~~Add crash reporting~~ → PostHog-based capture already works (main + renderer, full stack traces); optional follow-up is wiring an alert on `crash_report` spikes, not a launch blocker
6. **UI polish pass** → not a "kill features" pass — Brian flagged 5 specific screens he uses regularly and finds imperfect: Braided, Outline, Analytics, Timeline, Notes. Real scope, ties into the screen-info-contracts UX overhaul (see `STATUS.md`).

**Remaining launch blocker, for real this time:** just #3 (deployment verification), which is already in motion. Everything else on this list is done.

---

## 10. What's Actually Ready to Ship Right Now

- Data layer (SQLite, backup, migration)
- Payment + licensing + trial
- All core writing features (POV, Braid, Rails, Table, Editor, Notes, Tasks, Analytics)
- macOS + Windows builds, automated
- Landing page (modulo download links and ToS)
- Guide / documentation
- PostHog analytics
