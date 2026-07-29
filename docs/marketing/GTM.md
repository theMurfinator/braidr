# Braidr — Go-To-Market Plan

*Drafted 2026-06-11. Working document. Companion docs: `braidr-reddit-context.md` (audience/channel detail), `monetization-roadmap.md` (readiness gates), `docs/ui-redesign/PLAN.md` + `docs/data-model/` (the product work this plan is gated on).*

**Operating constraint:** solo founder, ~15 hrs/week total, most of it product. Marketing gets **2–3 hrs/week** — every channel below is chosen to fit that budget. No paid ads until organic proves the message.

---

## 1. Positioning

**The wedge: own "multi-POV" outright.** Don't fight Scrivener for "writing software." Braidr is the only tool whose core object is the *braid* — the relationship between each character's arc and the reader's experience of the whole. Everything in the plan hammers one sentence:

> **Braidr — outline every character's arc. Braid them into one novel.**

Supporting messages (in priority order):
1. **Two views of the same story** — your character's arc (POV) and your reader's experience (Braid). No other tool has this as its center.
2. **Simpler than Scrivener, built for structure** — opinionated where Scrivener is infinitely configurable.
3. **One local file, yours forever** — no cloud account required, works offline, back it up like any file.

⚠️ **Positioning fix required:** retire all "plain Markdown / edit in any tool / use git" claims (still in `braidr-reddit-context.md`) — untrue post-SQLite. "Local-first, single file, no subscription lock-in on your data" is the honest, still-strong version.

**Competitive frame** (one line each, for comparison content later):
- *Scrivener* — the everything-tool; wins on manuscript compilation, loses on structure-across-POVs and approachability.
- *Plottr* — timeline/plotting focus, but card-on-timeline, not arc-vs-braid; weak on per-character outlining depth.
- *Dabble/Campfire/World Anvil* — cloud-first, subscription-everything; Braidr wins local-first writers.
- *Obsidian/Notion/spreadsheets* — the real competitor. Most multi-POV writers are in DIY systems and feeling the pain. **Primary acquisition target.**

## 2. Audience (ICP)

**Primary:** novelists actively drafting/outlining **multi-POV fiction** — epic fantasy, romantasy (alternating POV), thrillers (POV + timeline games). Serious-hobbyist to indie-professional. Found in: r/fantasywriters, r/writing, r/romancewriters, writing Discords, AuthorTube comment sections.

**Secondary:** Scrivener owners who bounced off it; Obsidian-for-fiction users with elaborate broken vaults; NaNo-legacy community writers who outline every October.

**Anti-ICP (don't chase):** screenwriters, academic writers, single-POV literary writers, worldbuilders-who-never-draft (World Anvil's crowd).

## 3. Pricing & packaging

Current: **$39/year, free trial** (Stripe + license infra already built). Keep it — it undercuts Dabble (~$120/yr), sits above Plottr, and reads "serious tool, fair price."

- Trial: **14 days, full-featured**, no card required. The braid moment must happen in the trial (see §6).
- Launch lever: **founding-member price** ($29/yr locked forever) for the first cohort — rewards early believers, creates urgency without discount-coupon energy.
- Parked, revisit post-traction: one-time "own this version forever" tier (resonates with the local-first audience), education/NaNo-season discount.

## 4. Readiness gates (sequenced against the real roadmap)

GTM phases are gated on product milestones — marketing a confusing app wastes the one first impression with each niche community (they're small; you don't get a second launch in r/fantasywriters).

| Gate | Unblocks | Status |
|---|---|---|
| G1: First-run experience designed + UX punch-list blockers fixed | Quiet beta (Phase 1) | Not started (flagged in UI redesign plan) |
| G2: Data layer Class B save paths retired (no data-loss class remaining) | Charging strangers confidently | AS-IS/RESEARCH done, TO-BE pending |
| G3: 4-mode redesign shipped (look = the mockup) | Public launch (Phase 2) | Mockup approved direction |
| G4: License hardening pass (roadmap §5) | Scale spend/effort | Not started |

## 5. Phases

### Phase 0 — Foundations (start now, parallel to product work; ~2 hrs/wk)
- **Landing page** (braidr.app or similar): hero = the Rails view (the braid IS the demo), one-sentence positioning, email capture ("get the launch price"). Static site, an afternoon.
- **Email list from day one.** Every future phase feeds it; it's the only owned channel.
- **PostHog funnel defined now:** download → first open → project created → ≥2 POVs created → first braid drag → trial start → paid. The "≥2 POVs + braid drag" step is the activation event; instrument it before beta so Phase 1 produces learning, not anecdotes.
- **Lurk-and-learn on Reddit** using the existing monitoring doc — *no promotion yet*; collect exact phrases writers use (this becomes landing-page copy and SEO targets).

### Phase 1 — Quiet beta (after G1; 6–10 weeks; ~3 hrs/wk)
- Recruit **15–25 multi-POV writers** via DM/comment on high-priority Reddit threads (the monitoring doc's tier-1 list), writing Discords, and any personal network. Free year for structured feedback.
- Weekly: watch PostHog funnel + 2–3 user conversations. Goal: **activation rate** (new project → braid drag) and the words testimonial-givers use unprompted.
- Exit criteria: ≥50% of beta writers active in week 4; 5+ quotable testimonials; activation funnel not leaking at one obvious step.

### Phase 2 — Public niche launch (after G3; one concentrated push)
- **Reddit, done right:** founder-story posts ("I built a tool because I lost track of my own four-POV novel") in 2–3 primary subs, spaced weeks apart, written as a writer first — plus continued genuine comment participation. This is the highest-leverage single channel for this audience.
- **AuthorTube / writing newsletters:** 10–15 outreach emails with free licenses to mid-size (5k–50k) writing YouTubers and newsletter authors (the Scrivener-tutorial economy is large and always hunting for content). One good "I outlined my trilogy in this" video outperforms any ad spend.
- **Product Hunt:** cheap awareness + backlink; don't over-invest, writers aren't there.
- **The November season** (Preptober/NaNo-legacy communities): time the launch or a major moment to **October** — it's when the entire audience shops for outlining tools. If launch lands earlier, October gets its own campaign (braid-your-NaNo-outline content + seasonal trial extension).

### Phase 3 — Compounding engine (post-launch, ongoing 2 hrs/wk)
- **SEO/content:** comparison pages (Braidr vs Scrivener / Plottr / Notion-for-novelists), and craft content that only Braidr can illustrate — "how to structure a 4-POV fantasy," "braided narrative pacing," with Rails-view screenshots. Craft posts get shared in the same subreddits organically.
- **Template library:** Save the Cat / Hero's Journey / romantasy dual-POV starter projects — shareable artifacts, each a small acquisition loop.
- **In-app loop:** "made with Braidr" moment at compile/export; referral = extra trial month later.

## 6. The activation moment (product-marketing seam)

Everything funnels to one experience: **a new user must feel the braid within 10 minutes** — two characters, a handful of scenes, drag one scene in the braid view and *see* the story change shape. The first-run experience (G1) should script exactly this, with a pre-seeded example novel as fallback. Marketing promises the braid; onboarding must deliver it before the trial's day one ends.

## 7. Metrics (all in PostHog, already integrated)

- North star: **weekly braiding writers** (≥1 braid interaction in week).
- Funnel: visits → downloads → activation (≥2 POVs + braid drag) → trial → paid → 12-mo renewal.
- Honest first-year frame: this is a niche tool at $39 — **1,000 paying writers ≈ $39k ARR** is a strong year-one outcome and entirely achievable from Reddit + YouTube + November alone. Plan costs accordingly (≈$0 beyond time and ~$200 of infrastructure).

## 8. Next actions (in order, each ≤ one session)

1. Update positioning language in `braidr-reddit-context.md` (kill Markdown claims).
2. Define + instrument the activation event in PostHog.
3. Landing page + email capture live.
4. Begin lurk-and-learn Reddit log (existing doc's process, output to `docs/marketing/voice-of-customer.md`).
5. Beta recruit list (target 40 names to land 20).
