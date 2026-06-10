# Skill: Self-Refinement — Reasoning Patterns for Accurate Delivery

Three patterns that catch errors before delivery. Apply them when being wrong has a meaningful
consequence. These patterns are model-agnostic — any AI assistant can apply them.

---

## When to use which pattern

| Pattern | Apply when | Skip when |
|---------|-----------|-----------|
| **Self-Correction** | Any non-trivial spec or code change | Trivial one-liners, formatting-only edits |
| **CoT + Verification** | Multi-step tasks, any claim about the codebase | Single-file mechanical changes |
| **Self-Consistency** | Architectural decisions, severity calls, format choices | Tasks with one obviously correct answer |

---

## Pattern 1 — Self-Correction

Generate a draft, evaluate it against explicit criteria, refine before delivering.
Never deliver the unreviewed draft.

### Evaluation checklist

- Does it do exactly what was asked? (Re-read the request against the output.)
- What assumptions did I make that were never stated in the task?
- What edge cases does this not handle?
- Does any part contradict `.lsd/config.json`, an existing spec, or the project's posture files?
- Would `VERIFY_COMMAND` fail after this change?
- Is there a simpler approach that achieves the same result?

### Output format

```
DRAFT:
[initial response]

SELF-EVALUATION:
- Assumption not in task: [what I assumed]
- Edge case not handled: [what breaks]
- Contradiction: [any conflict with config or posture]
- Simpler approach: [yes — what / no]
- Verify impact: [would VERIFY_COMMAND fail?]

REFINED:
[improved version]
Changes made: [what changed and why]
```

---

## Pattern 2 — Chain of Thought with Verification

Break reasoning into numbered steps. At every step that makes a factual claim about the
codebase, **verify it against the actual code before proceeding**.

A plan built on unverified premises produces confident, internally consistent output that is
wrong about reality. Verification at each step prevents this.

### Process

1. Write out the full reasoning chain before implementing anything.
2. At each step that makes a factual claim — stop and verify it with a terminal command or
   file read. Do not move on if the claim is unverified.
3. If verification contradicts the assumption — revise all downstream steps before continuing.
4. Only implement after the full chain is verified.

### Output format

```
REASONING CHAIN:
Step 1: [claim] → verify: [command] → result: [output] → ✓ / ✗
Step 2: [claim depending on step 1] → verify: [command] → result: [output] → ✓ / ✗

PLAN REVISION (if any step failed):
[revised approach — which step failed and why]

IMPLEMENTATION:
[output produced after the verified chain]
```

---

## Pattern 3 — Self-Consistency

Generate N independent answers, cross-check them, synthesise the most consistent result.

Use when the task is a **decision** — multiple defensible approaches exist and you need
to find which is most robust.

### Process

1. Generate Answer A completely. Do not second-guess mid-generation.
2. Generate Answer B independently. Start reasoning from scratch — do not reference A.
3. Cross-check: where both agree → high confidence. Where they disagree → analyse why.
4. Synthesise: merge the strongest elements. Resolve contradictions explicitly.

### Output format

```
ANSWER A:
[complete first answer]

ANSWER B:
[complete second answer — generated independently]

CROSS-CHECK:
- Both agree on: [shared conclusions]
- Disagree on: [specific point of difference]
  Why they differ: [different assumption / different interpretation / genuine ambiguity]
- A stronger because: [what A handles that B misses]
- B stronger because: [what B handles that A misses]

FINAL (synthesised):
[merged answer — contradictions resolved]
```

---

## Combining all three — for high-stakes work

```
1. CoT + Verification   → build a verified reasoning chain (premises are known-true)
         ↓
2. Self-Consistency     → generate multiple answers from verified premises
         ↓
3. Self-Correction      → apply evaluation checklist to the synthesised answer
```

---

## Non-negotiable rule

Never claim a response has been self-corrected or verified without showing the intermediate
steps. Stating "I verified this" without the verification output is equivalent to no
verification. The steps are the evidence.
