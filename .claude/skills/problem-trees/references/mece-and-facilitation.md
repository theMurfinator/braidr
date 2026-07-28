# MECE checks & facilitation

## MECE, concretely

MECE = **M**utually **E**xclusive, **C**ollectively **E**xhaustive. Applied at *every level*
of the tree, not just the top.

### Mutually Exclusive — hunt for overlap
Two branches are not mutually exclusive if a single finding, cause, or task could plausibly
live in either. Overlap costs you twice:
- effort gets double-counted (two workstreams investigate the same thing), and
- the team argues about which branch "owns" a result instead of acting on it.

**Drill:** point at two branches and ask "could the same item belong to both?" If yes, either
merge them or move the boundary until each item has exactly one home.

### Collectively Exhaustive — hunt for gaps
The branches are collectively exhaustive if every important part of the problem lands in some
branch. A gap is more dangerous than an overlap because it's *invisible*: a whole cause,
workstream, or option silently never gets considered.

**Drill:** ask "what important area does no branch cover?" Common blind spots — the market/
external factors, the boundary/edge cases, the "do nothing / it's measurement error" branch,
and second-order effects.

### The forcing function
On every tree, before you trust it, **name at least one overlap you fixed and one gap you
added.** Writing them into the output (`MECE: overlap fixed → …; gap added → …`) makes the
check visible to reviewers. If you truly find neither, say so explicitly rather than skipping
the line — a silent skip and a clean pass look identical otherwise.

### What MECE does *not* do
MECE is a check on *structure*, not *truth*. A tree can be perfectly MECE and completely
wrong about the actual causes. Don't let a tidy diagram substitute for evidence. After the
tree is built and checked, the real work — testing hypotheses, doing the analyses, evaluating
the options — still has to happen.

## Facilitation — human and AI roles

The method is repeatable on purpose, so a team gets the same rigor on every problem instead
of depending on one person's discipline.

**The human (PM) owns judgment:**
- the problem statement and its exact wording
- naming the single main problem (resisting the urge to solve three at once)
- which branches to keep and which to prune as out of scope
- deciding when the tree is good enough to act on

**This skill owns the repeatable mechanics:**
- proposing the branch lens and drafting branches
- building and rendering the tree consistently
- running both MECE drills every time, the same way
- flagging where it's unsure so the human can decide

When facilitating live: draft fast, then slow down for the MECE pass — that pass is where the
tree earns its keep. Offer the human explicit choices at the prune step ("I'd drop branch 3
as out of scope for this quarter — keep or cut?") rather than deciding scope for them.

## Handoff
The text tree is the working artifact. When the human wants to socialize or expand it, offer
to reformat for Miro / FigJam / a canvas tool (one node per branch, output line as a sticky).
Keep the `Output:` and `MECE:` lines attached — they're how a reviewer checks the tree
without rebuilding it.
