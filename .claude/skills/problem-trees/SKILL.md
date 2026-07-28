---
name: problem-trees
description: >
  Disentangle a messy product or business problem into a rigorous issue tree (the McKinsey
  method) before analysis begins. Use when a question mixes cause, plan, and solution — or
  when someone asks "why is X happening", "what will it take to do Y", or "how might we reach
  Z" and the team hasn't agreed what problem they're actually solving. Builds a Why-tree
  (causes → testable hypotheses), a What-tree (work → sequenced plan), or a How-tree (paths →
  ranked options), then runs MECE checks to find gaps and overlaps. Also triggers on:
  "issue tree", "problem tree", "MECE", "root cause vs plan vs options", "structure this
  problem", "break this down properly". The human owns the problem statement and what to
  prune; this skill owns the structure and the checks.
---

# Problem Trees

Most product and business analysis goes wrong *before* it starts, because the team never
agreed what problem they were solving. One vague question makes each person answer a
different thing — one guesses a cause, another proposes a fix, a third scopes a plan. This
skill forces the split, then builds a clean tree of exactly one kind.

## The one rule that prevents most of the mess

**Decide what answer you need before you draw anything.**

| You need to find… | Use a… | Root question | Leaves are… | Output |
|---|---|---|---|---|
| the **cause** | **Why-tree** | "Why is X happening?" | candidate causes | testable hypotheses |
| the **work** to produce something | **What-tree** | "What does producing Y require?" | analyses, decisions, commitments, artifacts, processes | a sequenced workplan |
| the **options** to reach a set goal | **How-tree** | "How might we reach Z?" | concrete actions | ranked options |

Pick Why when the cause is unknown. Pick How when the cause is known and you're choosing an
intervention. Pick What when the deliverable is agreed and you need the plan to produce it.
**Never mix two types in one tree** — a leaf that's a cause and a leaf that's an action can't
be compared or checked against each other.

If you can't tell which one the person needs, ask them one question: *"Do you need the
cause, a work plan, or a set of options?"* Don't guess — the whole method depends on it.

## Procedure

1. **State the problem in one sentence** (the human owns this wording). Name the main
   problem, not three tangled ones.
2. **Pick the tree type** using the table above. Say which and why in one line.
3. **Frame the root question** in the exact form for that type.
4. **Cut the first level** into 3–5 branches. This "cut" is the most important decision —
   it's the lens (by user journey stage? by system layer? by funnel step?). Name the lens.
5. **Run the MECE check** on that level (see below) *before* going deeper. Fix gaps and
   overlaps now, not after you've expanded fifty leaves.
6. **Expand each branch** into leaves of the correct output type, tagging What-tree leaves
   with their kind (`[ANALYSIS]`, `[DECISION]`, `[COMMITMENT]`, `[ARTIFACT]`, `[PROCESS]`,
   `[SYNTHESIS]`).
7. **Order the leaves.** Why-tree: by testability/likelihood. What-tree: by dependency (the
   `[SYNTHESIS]` leaf comes last, after the branches it depends on). How-tree: by expected
   value within the stated constraints.
8. **Render** as a text tree (below), and offer to hand off to Miro or another canvas.

## The MECE check (this is where the value is)

At **each level**, ask two questions:

- **Mutually Exclusive — where do branches overlap?** Find one pair that covers the same
  ground and either merge them or sharpen the boundary. Overlap means you'll double-count
  effort and argue about which branch owns a finding.
- **Collectively Exhaustive — what's missing?** Find one important area no branch covers and
  add it. A gap means a whole cause/workstream/option silently drops out of the analysis.

Force the drill: on every tree, name **at least one overlap and one gap** before you trust
it. If you genuinely find none, say so explicitly — "checked for overlap and gaps at the
top level, none found" — rather than skipping the step.

**Structural checks cannot prove the tree is true.** MECE tells you the tree is *complete
and non-redundant*, not that its branches are *correct*. A perfectly MECE Why-tree can still
list the wrong causes. The tree organizes the thinking; evidence still has to do the rest.

## Division of labor (human vs. this skill)

The human (the PM) decides:
- what problem to study and how to word it
- what the main problem is
- which branches to keep and which to prune as out of scope

This skill does the repeatable work:
- drafting branches and building the tree
- running the MECE checks every time, the same way
- rendering a clean, reviewable tree so a reviewer can see *why* it was built this way

This split is the point: one PM can build one tree by hand, but a team needs the same rigor
on every problem. Automate the structure and the checks so people spend their time on the
judgment.

## Output format

Always show the root, the branch lens, the leaves, and the **Output** line naming what the
tree produces. Example templates for all three tree types and fuller worked examples live in
`references/tree-types.md`. The MECE drill and facilitation notes are in
`references/mece-and-facilitation.md`.

```text
WHY: Why is <observed problem> happening?           [lens: by <how you cut it>]
├── 1. <candidate cause family A>
├── 2. <candidate cause family B>
└── 3. <candidate cause family C>
Output: testable hypotheses
MECE: overlap fixed → <what>; gap added → <what>
```

Read `references/tree-types.md` before building your first tree of a session.
