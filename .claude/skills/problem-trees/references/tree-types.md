# The Three Trees — detail and worked examples

All three trees share the same MECE discipline (see `mece-and-facilitation.md`). They differ
in their root question, their leaf type, and the output they produce. Choosing the wrong type
is the most common and most expensive mistake — it means the team spends effort producing an
answer nobody needed.

---

## Why-tree — finds causes

- **Root:** "Why is `<observed problem>` happening?"
- **Leaves:** candidate causes, grouped into families.
- **Output:** a set of **testable hypotheses** — each leaf should be phrased so it can be
  confirmed or refuted with evidence.
- **Use when:** you can observe a problem but don't yet know what's driving it.
- **Cut lenses that tend to be MECE:** by funnel/journey stage, by system layer
  (data → logic → UI), by actor (user / product / market), by lifecycle stage.

A good Why-tree leaf reads like a claim you could test, not a vague area. Prefer
"First-run setup requires a folder choice most users abandon" over "onboarding problems."

```text
WHY: Why is new-user activation underperforming?        [lens: by funnel stage]
├── 1. Acquisition mismatch — wrong users arrive
│   ├── 1.1 Traffic skews to users outside the target writer segment
│   └── 1.2 Store listing over-promises a capability the app doesn't lead with
├── 2. First-run friction — right users, blocked early
│   ├── 2.1 Mandatory folder/setup step abandoned before first value
│   └── 2.2 No sample project, so an empty app on first open
└── 3. Value not reached — users start but don't hit the "aha"
    ├── 3.1 Core payoff (the braid view) is buried behind setup
    └── 3.2 First session ends before a second POV is added
Output: testable hypotheses (each 1.x/2.x/3.x is a claim evidence can confirm or refute)
```

---

## What-tree — breaks down work

- **Root:** "What does producing `<deliverable>` require us to unpack?"
- **Leaves:** units of **work**, each tagged by kind:
  - `[ANALYSIS]` — evidence to gather or study
  - `[DECISION]` — a choice someone must make
  - `[COMMITMENT]` — ownership, scope, or resourcing to confirm
  - `[ARTIFACT]` — a concrete thing to produce (doc, spec, asset)
  - `[PROCESS]` — a recurring workflow to stand up
  - `[SYNTHESIS]` — the integrating step that depends on other branches
- **Output:** a **sequenced workplan** — leaves ordered by dependency, synthesis last.
- **Use when:** the deliverable is agreed and you need the plan to produce it.
- **Cut lenses:** evidence → choices → agreements → synthesis; or by phase; or by owner.

```text
WHAT: What does producing an activation plan require us to unpack?   [lens: evidence→choice→agree→synth]
├── 1. Evidence
│   ├── 1.1 [ANALYSIS] Funnel instrumentation: where exactly do first-run users drop?
│   └── 1.2 [ANALYSIS] Session replays of the first five minutes
├── 2. Choices
│   ├── 2.1 [DECISION] Is there a sample project on first open? (depends on 1.2)
│   └── 2.2 [DECISION] Does folder-setup move after first value, or stay first?
├── 3. Agreements
│   └── 3.1 [COMMITMENT] Who owns onboarding changes, and by when?
└── 4. Synthesis
    └── 4.1 [SYNTHESIS] The activation plan itself (depends on branches 1–3)
Output: sequenced workplan (do 1 → 2 → 3 → 4; nothing in 4 starts before 1–3 resolve)
```

---

## How-tree — lists options

- **Root:** "How might we reach `<chosen goal>`?"
- **Leaves:** concrete **actions**, ideally each tied to a confirmed cause or an explicit
  constraint.
- **Output:** a set of **ranked options** — ranked by expected value within stated
  constraints.
- **Use when:** the cause is already known (often from a completed Why-tree) and you're
  choosing an intervention.
- **Cut lenses:** by cause addressed, by cost/effort tier, by reversibility, by owner.

```text
HOW: How might we raise new-user activation?            [lens: by confirmed cause]
├── 1. Fix first-run friction (addresses confirmed cause 2.1)
│   ├── 1.1 Ship a sample project pre-loaded on first open
│   └── 1.2 Defer folder choice until after the first braid is seen
├── 2. Surface value sooner (addresses confirmed cause 3.1)
│   └── 2.1 Open directly into the braid view with demo content
└── 3. Tighten acquisition (addresses confirmed cause 1.2)
    └── 3.1 Rewrite the store listing to lead with the multi-POV braid
Output: ranked options (rank by lift × confidence ÷ effort, within the "no dark patterns" constraint)
```

---

## Choosing between them — the activation example

> "Our new-user activation is underperforming. We need to decide what to do."

- **Why** fits *here*: the team knows activation is low but hasn't found the cause. Start here.
- **How** would fit *after* Why, once a cause is confirmed and you're picking interventions.
- **What** would fit if the deliverable were "produce an activation plan" and you needed the
  work sequence to get there.

The trees often chain: **Why → (confirm hypotheses with evidence) → How → What** (to plan the
chosen option's rollout). Build one tree at a time; don't collapse the chain into one diagram.
