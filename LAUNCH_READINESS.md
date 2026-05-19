# Braidr — Launch Readiness

Master checklist for commercial launch. Everything here is required before actively promoting Braidr.

**Status:** `[ ]` not started · `[~]` in progress · `[x]` done  
**Last updated:** 2026-05-19

---

## 1. Data & Architecture

### Chapters
The biggest open design question. Most writers organize by chapter, so this needs to be first-class throughout the data model and all views.

- [ ] **Design chapters data model** — decide: are chapters a first-class entity (table with scenes assigned to chapters) or a grouping/display concept? How do they relate to plot points in POV view? How do they appear in braided view (column headers? separators?)? Does a scene belong to one chapter or can it span?
- [ ] **Schema** — add `chapters` table and `scene_chapter` assignment to `database.ts`
- [ ] **IPC handlers** — chapter CRUD in `braidrIpc.ts`
- [ ] **Importer** — handle legacy projects with no chapters (default assignment or leave unassigned)
- [ ] **POV view** — chapters visible alongside plot points, or as a separate layer?
- [ ] **Braided view** — chapter headers/dividers in list, table, and rails modes
- [ ] **Editor** — chapter shown in scene header / navigation
- [ ] **Compile modal** — chapters respected in output structure

### Code Audit
- [ ] **App.tsx split** — ~4200 lines; extract logical hooks and sub-components to get the file under 800 lines
- [ ] **Dead `_migrated` block** — `loadProjectFromPath` lines ~884–930; this block never fires in SQLite format, remove it along with the `migrateNotesSceneLinks` import and usage
- [ ] **Dead state** — remove `_dropTargetIndex`, dead HTML5 DnD refs (`canDragSceneRef`, `draggedPovSceneRef`), archived-scene reconciliation block (was for iCloud-synced `.md` files, not relevant in SQLite)
- [ ] **Dead scene renumbering** — `loadProjectFromPath` lines ~993–1004; scene numbers are stable in SQLite, remove the re-parse loop
- [ ] **Pre-existing TypeScript errors** — unused imports and vars scattered across the codebase; fix file by file
- [ ] **Task data-loss: object-arg refactor** — `dataService.saveTimeline` has 22 positional args; refactor callers to use the already-typed `SaveTimelinePayload` object to prevent silent drops
- [ ] **Task data-loss: load-gate** — add `loadInProgressRef` guard in `App.tsx` so auto-save cannot fire between `setProjectData` and the later ref population

### Analytics
- [ ] **Data accuracy audit** — word counts, session times, and weekly hours calculations need a full review; output is currently unreliable
- [ ] **Weekly hours tracker** — verify Sat–Fri week boundaries, configurable target, and that task time + scene time combine correctly
- [ ] **Fix incorrect calculations** — once audit is done, fix any broken aggregations

### Stability
- [ ] **Unhandled promise rejections** — audit all save/load paths; any silent failure is a data-loss risk
- [ ] **User feedback on failure** — every operation that can fail should show a toast or error state; no silent drops
- [ ] **IPC error handling consistency** — all 19 handlers in `braidrIpc.ts` should return `{ success: false, error }` and be caught by callers
- [ ] **Crash recovery UX** — what does the user see if the app crashes mid-session? Is there a recovery path?
- [ ] **Auto-save reliability** — stress-test the 800ms debounce under rapid edits and project switching

### Security
- [ ] **License bypass audit** — can the trial/license gate be defeated client-side? Check `AccountView` and `LicenseGate` logic
- [ ] **Notes XSS surface** — notes are stored and rendered as rich HTML; audit for injection vectors via TipTap
- [ ] **Electron security checklist** — verify `contextIsolation: true`, `nodeIntegration: false`, `webSecurity` not disabled in any `BrowserWindow`
- [ ] **Path traversal in IPC** — notes and draft handlers take filenames from the renderer; validate that paths cannot escape the project folder

---

## 2. Design

All design work is blocked on the first item — choose direction before touching anything else.

- [ ] **Choose visual direction** — screenshot all major views, then decide on aesthetic (writer warmth / craft-tool precision / something else). This decision gates every other design item.
- [ ] **Left sidebar navigation** — rearrange screen order, improve visual hierarchy, make the active state and transitions feel intentional
- [ ] **Editor right sidebar redesign** — currently too much information, too clunky; full redesign to make it genuinely useful without overwhelming
- [ ] **POV view: section synopsis text** — too small; increase to a readable size
- [ ] **Three-dot settings menu** — feels unpolished; redesign the entry point to settings and project actions
- [ ] **Typography pass** — the Literata/DM Sans split is in place; audit for inconsistent sizes, weights, and line heights across all views
- [ ] **Spacing system** — establish consistent padding/margin values and apply across all components
- [ ] **Color pass** — audit the full palette; ensure contrast ratios meet accessibility minimums

---

## 3. UX & Features

### Drag & Drop
Full dnd-kit migration — 12 remaining contexts still on HTML5 DnD. Each ships as its own PR.

- [ ] **RailsView + RailsSceneCard** — Phase 2; grid shape, rails inbox drag
- [ ] **BullpenPanel** — migrate internal drag; also enables cross-system drag from POV/braided to bullpen
- [ ] **TableView** — row reorder
- [ ] **TimelineGrid + TimelineSidebar** — event and scene drag in timeline view
- [ ] **EditorView** — scene reorder drag within editor
- [ ] **NotesSidebar** — note reorder
- [ ] **OptionEditor** — plot point option reorder
- [ ] **panes/TabBar** — tab reorder
- [ ] **PlotPointSection / OutlineSceneRow** — any remaining HTML5 remnants
- [ ] **cursor: grab / grabbing** — add to all sortable items across the app

### Bullpen Behavior
- [ ] **Remove bullpen scenes from braided view** — scenes sitting in the bullpen are unplaced; they should not appear in the braided timeline
- [ ] **Remove bullpen scenes from editor view** — same; bullpen scenes should not be traversable in editor
- [ ] **Visual treatment** — make the "unplaced" state clear so writers understand what the bullpen is for

### Home Screen
- [ ] **Delete project** — add delete action to project cards on the home screen (with confirmation)
- [ ] **Project stats on cards** — show word count, scene count, character count, last opened date
- [ ] **Home screen redesign** — the current screen is a bare project picker; make it a proper home with visual polish, clear calls to action for new vs. existing projects, and an empty state for first-time users

### Chapters UI
*(Depends on §1 Data & Architecture — chapters model must be designed first)*
- [ ] **POV view integration** — chapter groupings visible in the outline
- [ ] **Braided view integration** — chapter dividers in list/table/rails
- [ ] **Editor integration** — chapter shown in scene context
- [ ] **Compile modal** — chapter-aware output

---

## 4. Commercial Model

### Pricing
- [ ] **Research comps** — Scrivener ($59.99 one-time), iA Writer ($49.99 one-time), Ulysses ($5.99/mo ≈ $72/yr), Atticus ($147 one-time), Plottr ($99/yr)
- [ ] **Make the pricing decision** — stay at $39/yr, raise to $59–79/yr, or switch to a one-time purchase model; document the rationale
- [ ] **Consider freemium tier** — 1 project free (no trial needed)? Reduces friction but complicates the model
- [ ] **Update Stripe + website** if price changes

### Trial & Onboarding
- [ ] **Audit current trial UX** — does the email → 14-day trial → subscribe CTA flow feel smooth? Where do people drop off?
- [ ] **First-run experience** — is it obvious what to do when you open the app for the first time? Is there a demo project or guided flow?
- [ ] **Empty state** — new project should have a template or example to orient the user
- [ ] **Upgrade prompt quality** — when and how the subscribe CTA appears; should not feel aggressive but must be visible

### Distribution
- [ ] **Decide: website-only vs. Mac App Store** — MAS brings discoverability but adds sandboxing constraints and 30% cut; document the tradeoff
- [ ] **Setapp evaluation** — subscription bundle (~$10/mo to users, revenue share to devs); good for discoverability in the writer niche
- [ ] **Windows strategy** — website build exists; is Windows a launch target or deferred?

### Marketing & Positioning
- [ ] **Define the target user** — multi-POV novelist specifically? Any fiction writer? Screenwriters? Nailing this shapes every other message
- [ ] **One-line value prop** — what is Braidr in one sentence that makes a writer immediately understand why they need it?
- [ ] **Website copy audit** — does the landing page explain the POV/braid concept clearly to someone who has never heard of it?
- [ ] **Screenshot refresh** — current screenshots may not reflect the current UI; retake all of them
- [ ] **Demo video** — short (60–90s) screen recording showing the core POV → braided workflow
- [ ] **Community strategy** — identify target subreddits (r/writing, r/worldbuilding, r/nanowrimo, r/scrivener), forums, and communities; plan a soft launch post
- [ ] **ProductHunt launch plan** — hunter, tagline, first comment, timing

---

## 5. Infrastructure & Distribution

Everything in the original `LAUNCH_CHECKLIST.md` is believed complete. One full smoke test before announcing.

- [ ] **End-to-end smoke test** — visit getbraidr.com → Get Started → complete Stripe checkout → receive welcome email → download app → enter email → trial starts → "I already subscribed" → Account view shows active subscription → cancel → reactivate → verify drip emails are queued → let trial expire → confirm expired CTA appears
- [ ] **Auto-updater** — install an older build, confirm it detects and offers the latest release
- [ ] **ImprovMX email forwarding** — set up `help@getbraidr.com` → personal Gmail if not done

---

## Superseded docs

- `LAUNCH_CHECKLIST.md` — infrastructure detail; superseded by §5 above
- `docs/monetization-roadmap.md` — priority order 1–7; superseded by this doc (items 1–2 complete)
