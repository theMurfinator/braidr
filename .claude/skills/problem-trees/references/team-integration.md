# Folding `problem-trees` into the launch team

`problem-trees` is a standalone method skill. The `braidr-launch-team` skill *invokes* it —
the method lives in one place and every team applies it grounded in Braidr's context, rather
than each team re-deriving the structure by hand.

## The wiring
A section titled **"Disentangle Before You Opine"** is added to `braidr-launch-team/SKILL.md`
(under "How the Team Works"). It instructs the responsible senior — or Alex, when a prompt
spans teams — to invoke `problem-trees` whenever a prompt is tangled (mixes cause / plan /
options, or is one big messy question) *before* the team starts researching or opining. The
team then works the tree's output: hypotheses to test (Why), a workplan to execute (What), or
options to rank (How). Brian owns the problem statement and the prune.

The exact block applied to the live team skill is reproduced below so this branch is the full
record of the integration, even though `braidr-launch-team` lives in the personal skills
directory rather than this repo.

```markdown
### Disentangle before you opine

When a prompt is tangled — it mixes cause, plan, and solution, or it's one big messy question
nobody has framed — the team does **not** start researching yet. The responsible senior (or
Alex, if it spans teams) invokes the `problem-trees` skill first to:

1. Decide what answer Brian actually needs — a **cause** (Why-tree), a **work plan**
   (What-tree), or a set of **options** (How-tree).
2. Frame the root question, cut the first-level branches, and run the MECE check (name one
   gap and one overlap).
3. Hand the team the tree's output — testable hypotheses, a sequenced workplan, or ranked
   options — which becomes what the juniors and mid-levels actually work.

Brian owns the problem statement and decides which branches to prune. This keeps the room
from answering three different questions at once. Don't run the full tree for a simple
factual ask ("what's the App Store cut?") — reserve it for genuinely messy problems.
```
