# Braidr UI Redesign — Reference

*Started 2026-06-11. Source: live UX review (driving the dev app) + consolidation discussion.*

## North star (Brian, 2026-06-11, session close)

> "This will work best when the design is so simple you don't notice it, but has an elegance that is also inspiring."

Direction is right but **the design still gets in the way**. Next iteration must *subtract*: fewer borders, fewer pills, fewer simultaneous accents — the content (scenes, prose, the braid) is the interface. Elegance through restraint and typography, not through visible "design." Test for every element: would you notice it if it were doing its job? If yes, quiet it down.

## Status (end of 2026-06-11 session)

- Browser mockup at `docs/ui-redesign/mockup.html` — open directly, no build. All 4 modes clickable (keys 1–4), Notes slide-over (N), Rails ↔ Weave sub-tabs live.
- Decided: 4-mode architecture; **Rails = hero lens of Braid**; black/white + electric character colors (warm-paper palette rejected); Fraunces/Newsreader/Instrument Sans type stack.
- Open per north star: simplify the mockup — reduce chrome (card borders, pills, badge density), let white space and the rail colors do the work. Then: Plan-as-default question, Narrator column treatment, rails density.
- After look-and-feel sign-off: Phase 0 (inventory map + PostHog view-usage) → Phase 1 (nav shell in the real app).

## Goal

Consumer app on par with Scrivener. Two problems to solve:

1. **Confusion** — 10 peer views of the same novel, no shared spine. Six of them (POV, Braider, Table, Rails, Arc Planning, Timeline) are projections of one scene list, each with its own toolbar, conventions, and scene numbering.
2. **Beauty** — individual surfaces are polished, but the experience must *feel* beautiful end to end. Braidr's existing soul is literary (serif wordmark, warm paper, character-color chips); lean into it rather than adopting SaaS-generic.

The meat to protect: **the Braider and the POV planning view.** Nothing about them changes — they get promoted; everything around them gets folded in or demoted.

## Target architecture: 4 modes

```
PLAN    Outline (today's POV view — default) · sub-tabs: Arc · Table
BRAID   Weave (today's Braider — default)    · sub-tabs: Rails · Timeline
WRITE   Editor (typewriter, drafts, versions)
REVIEW  Analytics · Tasks · Mood · Compile
NOTES   Slide-over panel available in every mode (not a destination)
```

- Arc Planning and Table are the POV outline with different columns → tabs inside Plan, sharing character selector, section hierarchy, bullpen.
- Rails is the braid as columns; Timeline is the braid by story-date → lenses inside Braid, sharing the TO BRAID panel and selection.
- Review absorbs Analytics view + "Goals & Analytics" overflow duplicate + Mood Check-in + Compile. Tasks roll up here; scene-attached tasks surface as indicators on scenes in Plan/Write.
- Characters, Tags, Fonts → project settings modal. Archive, Backup → project menu. "Convert to .braidr" removed for SQLite projects. ⋮ menu shrinks from 12 items to ~5.

### Shared spine (the Scrivener trick)

- **One canonical scene identity** everywhere (e.g. "Maya · 3") — kills the #3 / #11 / "Scene 4" mismatch between POV, Table, and Cmd+K.
- **One toolbar shell**: project/branch left, mode controls center, search/undo right. No tag filters on screens where they do nothing.
- **Selection persistence**: the scene you're on in Plan is the scene Braid scrolls to and Write opens.

## Execution phases

- **Phase 0 — evidence.** Inventory map (every view/control/data touched) + PostHog view-usage numbers to ground keep/kill calls.
- **Phase 1 — navigation shell.** Rail collapses to 4 labeled modes with sub-tabs. Pure routing; existing components mount as sub-views. Biggest confusion win, lowest risk.
- **Phase 2 — shared spine.** Canonical scene numbering, unified toolbar shell, selection persistence. The real work; spec with a strong model before cheap-model execution.
- **Phase 3 — demotions + hygiene.** Notes to slide-over, Tasks to Review + indicators, overflow cleanup, dead controls, menu/Esc/toggle fixes from the UX punch list.
- **Phase 4 — keep/kill.** With usage data, decide whether Table and Timeline earn their tabs.

## Design direction ("feel beautiful")

**Concept: editorial typography on a crisp black/white ground with big pops of color** (Brian: "black/white with big pops of color like ClickUp" — confirmed 2026-06-11; the earlier warm-paper/muted palette was rejected).

- **Type**: Fraunces (display/headings — literary), Newsreader (synopses + manuscript text), Instrument Sans (UI chrome, small-caps labels).
- **Ground**: pure white, near-black ink (#15171C), light neutral hairlines, black pills/buttons for primary actions and active nav.
- **Pops**: electric character colors — Maya #ED2EB4, Kate #6B3DF5, Noah #1B6DFF, Narrator gray. Vivid orange for warnings/over-target, vivid blue/orange status pills.
- **Character rails/threads are the signature visual.** **Rails is the hero lens of Braid mode** (Brian: "the Rails view is more powerful") — character columns with full-height colored rails, scene cards riding the rails at their braid position, word counts on cards, position gutter at left. Weave (interleaved list with woven threads) and Timeline are secondary sub-tabs.
- **Motion**: one staggered reveal on mode entry; lift-on-hover cards; no scattered micro-animations.
- **States with meaning**: over-target counts ("4/3") in orange; synopses is one toggle with visible state; persistent Edited → Saving… → Saved indicator.

## Browser mockup

`docs/ui-redesign/mockup.html` — single self-contained file, open in any browser.
Shows all 4 modes (Plan/Outline fully realized, Braid/Weave with woven threads, Write, Review), the Notes slide-over, and the unified toolbar shell, using real America America content. **It's a look-and-feel artifact, not a spec** — interactions are simulated.

## UX punch list (from 2026-06-11 review — fix during Phases 1–3)

Top items: branch dropdown never closes (Esc/outside-click/nav); menus ignore Esc while modals handle it; weekly hours disagree between Analytics (7.9h) and launcher (6.4h); launcher recents duplicates (demo-project + demo-project.braidr, no remove affordance); scene-numbering mismatch across views; CSP blocks data: SVG chevrons in styles.css; Show/Hide synopses stateless buttons; bullpen doesn't collapse at narrow widths; new scene created with no highlight/focus; no dirty/saving indicator in editor; "Convert to .braidr" shown on .braidr projects; duplicate "Fields" buttons in Braider toolbar; tiptap duplicate-extension warnings.

Robustness verified and held: double-click scene creation (1 row), emoji/unicode persistence, missing-file recents filtered, modal Esc, auto-save end-to-end to SQLite.
