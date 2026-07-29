# PLAN: Homepage hybrid refresh for getbraidr.com

Status: STALE (2026-07-19) - predates the v1 MVP scope cut (analytics/braided-list claims no longer valid) and the $49 price; do not execute without rework
Executor: Sonnet 5
Author: Fable (launch team), 2026-07-03

## Context

Repo: `/Users/brian/braidr/braidr-landing` (own git repo; push to `main` deploys via Vercel).
Target file: `app/(marketing)/page.tsx`. This is a surgical refresh, NOT a rebuild. Keep the page's existing structure, styling system, PostHog capture calls, and section order except where this plan says otherwise. Do not touch `app/(marketing)/new/page.tsx`.

Verified facts driving this plan:
- The hero A/B test never ran ($feature/landing-hero-headline captured on zero events). The variant code is dead.
- Graph view was deleted from the app; all graph claims on the page are false.
- All primary CTAs currently point at a Stripe checkout link; the product's motion is try-first (14-day trial, no card).
- Fresh screenshots (July 2026) replace the April set.

## Changes

### 1. Kill the dead A/B code
In `page.tsx`: remove `useFeatureFlagVariantKey` import/usage, the `headlines` map, and the `heroVariant` logic. The H1 becomes static. KEEP the scroll-depth tracking and all `posthog.capture` calls.

### 2. Hero: rebuild as two-column
Replace the current centered hero AND the separate full-width "HERO SCREEN: EDITOR" section below it with ONE two-column hero section (text left, image right). On small screens it stacks (text above image). Keep the existing fade-up animation classes and the radial background touch if it looks right in the new layout.

- Badge pill (keep): "The complete writing app for multi-POV novelists"
- H1 (static): `The only writing tool built for multi-POV novelists.`
- Subhead: `One outline per character. One braid for the whole novel. Braidr keeps every POV straight while you plan, draft, and finish, in a single file that lives on your computer.`
- Primary CTA button: text `Try Braidr free`, href `#download`, keep `posthog.capture("cta_clicked", { location: "hero" })`.
- Line under CTA: `Free for 14 days. No credit card. $39/year after.`
- Right column image: `/rails.png` in the same rounded/shadow chrome treatment the current hero screen uses.

### 3. Nav CTA
Change the nav "Get Started" (currently Stripe link) to text `Try for free`, href `#download`. Keep its capture call with `location: "nav"`. The PRICING section's "Get Started" button KEEPS its Stripe link; that one is for people ready to buy.

### 4. Graph claim sweep (all false, all must go)
- Views overview card 4: desc `"Wikilinked notebook with backlinks and graph"` becomes `"Wikilinked notebook with backlinks and tags"`
- Section 4 (Notes): eyebrow label becomes `Notes View`; heading becomes `Keep the story bible next to the story`; body paragraph becomes: `A full notebook inside your project. Link notes to scenes and to each other with wikilinks, follow every inbound reference in the backlinks panel, and drop in images, tables, and toggles. Character sheets, worldbuilding, and research live one click from the scene that needs them.`
- Section 4 bullets, replace all six with: `Wikilinks ([[note name]]) to other notes and scenes` / `Backlinks panel shows every inbound reference` / `Images stored inside your project file` / `Slash commands and drag-and-drop blocks` / `Nested notebooks for characters, places, and research` / `Toggles, tables, and multi-column layouts`
- Comparison "With Braidr" list: `"Rails view and knowledge graph show the big picture"` becomes `"Rails view shows every POV side by side"`
- vs. Scrivener card: `"Knowledge graph and wikilinks"` becomes `"Wikilinked notes with backlinks"`
- Pricing subhead: `"Five views, analytics, notes, graph, export"` becomes `"Five views, analytics, notes, export"` (adjust to the actual current sentence, removing only the graph mention)
- Hero subhead already replaced in change 2 (old one mentioned the knowledge graph).

### 5. Braided section: one bullet addition
Add to the braided timeline bullet list: `Outline mode reads your whole braid as flowing text`

### 6. Screenshots
Source folder: `/Users/brian/braidr/Launch/screenshots/` (Brian drops files there; identify each by content/filename). Convert/copy into `public/` with these assignments, replacing the April files:
- POV Outline view shot -> `public/pov.png`
- Rails/braided view shot (character columns + To Braid sidebar) -> `public/rails.png` (used by the new hero)
- Editor view shot -> `public/editor.png` (now used by the EDITOR section, change 7)
- Notes view shot (The One Ring) -> `public/notes.png`
- Table view shot (54 scenes) -> `public/table.png` (new file)
- Analytics shot -> `public/analytics.png` IF a fresh one is in the folder; otherwise keep the existing April analytics.png.
Keep dimensions as provided; do not upscale. If a listed shot is missing from the folder, STOP and report rather than guessing.

### 7. Image placement shuffle (dedupes hero image)
- Editor section (section 3, currently image-less): add `/editor.png` in the standard rounded/shadow chrome, above its three feature cards. Alt text: `Braidr Editor View, rich text editor with scene navigator and metadata panel`.
- Braided section image: switch from `/rails.png` to `/table.png` (rails now lives in the hero; this kills the duplication). Update alt text: `Braidr Table View, every scene in the novel as sortable rows with character badges`.
- All other image usages keep their current placement.

### 8. Copy hygiene
ASCII straight quotes/apostrophes only in all NEW copy (existing code's `&apos;`/`&mdash;` entities elsewhere are out of scope; do not introduce new em dashes in the strings you add). After editing, run:
`python3 -c "import sys; c=open('app/(marketing)/page.tsx').read(); bad=[ch for ch in c if ch in 'CURLY_LEFT_SINGLE CURLY_RIGHT_SINGLE CURLY_LEFT_DOUBLE CURLY_RIGHT_DOUBLE']; print('FAIL:',bad) if bad else print('clean')"` replacing the placeholder list with the actual four curly-quote characters (U+2018, U+2019, U+201C, U+201D). Must print clean.

## Verification (all must pass before commit)
1. `npm run build` succeeds.
2. `npm run start -- -p 3199`; then:
   - `curl -s http://localhost:3199 | grep -c "The only writing tool built for multi-POV novelists"` returns nonzero
   - `curl -s http://localhost:3199 | grep -ci "knowledge graph"` returns 0
   - `curl -s http://localhost:3199 | grep -c "Try Braidr free"` returns nonzero
   - kill the server.
3. Curly-quote check prints clean.
4. Confirm `public/table.png` exists and `public/rails.png`, `public/pov.png`, `public/editor.png`, `public/notes.png` have July 2026 modification dates.

## Ship
Commit only the files this plan touches (page.tsx + public images) with message "Homepage hybrid refresh: two-column hero, try-first CTAs, graph claims removed, fresh screenshots", ending with the line: Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
Push to main. Verify live within ~3 minutes: `curl -s https://getbraidr.com | grep -ci "knowledge graph"` returns 0 and the H1 grep returns nonzero. Update this plan's Status to DONE with commit hash and date. Report files changed, verification outputs, and anything skipped.
