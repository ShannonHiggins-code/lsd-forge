---
name: self-refinement
description: Three reasoning patterns that catch errors before delivery — self-correction, CoT with verification, and self-consistency. Apply to any non-trivial implementation, design, or architectural decision.
triggers:
  - "self-correct"
  - "refine"
  - "verify your reasoning"
  - "check your work"
  - "self-consistency"
  - "architectural decision"
  - "design choice"
---

# Self-Refinement Patterns

## When to use which pattern

These patterns cost tokens and time. Apply them when being wrong has a meaningful consequence.

| Pattern | Apply when | Skip when |
|---------|-----------|-----------|
| **Self-Correction** | Any non-trivial code change; any response that will be acted on directly | Trivial one-liners, documentation-only edits |
| **CoT + Verification** | Multi-step tasks, debugging, any reasoning that touches multiple files or makes factual claims about the codebase | Single-file mechanical changes following an existing pattern |
| **Self-Consistency** | Architectural decisions, new rule design, API/payload shape choices, severity calls (`error` vs `warning`) | Tasks with one obviously correct answer |

All three can be combined — and should be for high-stakes work. The combination sequence is at the bottom of this file.

---

## Pattern 1 — Self-Correction / Self-Refinement

Generate an initial response, evaluate it against explicit criteria, then refine before delivering. Never deliver the draft.

### Steps

**1. Generate the draft**
Produce the initial code, rule, or response as you normally would.

**2. Evaluate the draft — answer each question explicitly:**
- Does it do exactly what was asked? (Re-read the request against the output, not your memory of the request.)
- What assumptions did I make that were never stated in the task?
- What edge cases does this not handle?
- Does any part contradict CLAUDE.md, an existing rule's contract, or the `.logic` file format spec?
- Could this cause `npm test` to fail?
- Is there a simpler implementation that achieves the same result?

**3. Refine based on the evaluation**
Make specific changes to address each weakness found. If evaluation found nothing wrong, state that explicitly — never skip the evaluation step and claim the draft was clean.

**4. Deliver the refined version only**

### Output format
```
DRAFT:
[initial code or response]

SELF-EVALUATION:
- Assumption not in task: [what I assumed]
- Edge case not handled: [input or condition that breaks this]
- Contradiction with codebase/spec: [any conflict]
- Simpler approach possible: [yes — what / no]
- npm test impact: [will this cause test failures?]

REFINED:
[improved version addressing the findings above]
Changes made: [what specifically changed from draft to refined, and why]
```

---

## Pattern 2 — Chain of Thought with Verification

Break reasoning into numbered steps. At every step that makes a factual claim about the codebase, **verify it against the actual code before proceeding**. Do not move to the next step if the current step's claim is unverified.

The discipline: a plan built on unverified premises produces confident, internally consistent code that is wrong about the real world. Verification at each step prevents this.

### Steps

**1. Write out the full reasoning chain before implementing anything**
Every assumption and inference is a discrete numbered step. Anything that "seems right" is an unverified claim.

**2. At each step that makes a factual claim — stop and verify:**

| Claim type | Verification command |
|------------|---------------------|
| "This rule exports `check`" | `node -e "console.log(Object.keys(require('./linter/rules/rule-name')))"` |
| "This rule fires on input X" | `node bin/forge.js lint specs/fixtures/bad-<rule>.logic --plain` |
| "This section key is SECTION_NAME" | `node -e "const {parse}=require('./linter/parser');console.log(Object.keys(parse('path/to/spec.logic').sections))"` |
| "This field exists in parsed.meta" | `node -e "const {parse}=require('./linter/parser');console.log(parse('path/to/spec.logic').meta)"` |
| "npm test passes after this change" | `npm test` — paste actual output |
| "This phrase triggers ambiguous-language" | `node -e "const r=require('./linter/rules/ambiguous-language');console.log(r.AMBIGUOUS_PHRASES)"` |

**3. If verification contradicts the assumption — update the downstream plan before continuing**
Do not proceed on a false premise. Revise steps that depend on the failed assumption.

**4. Only implement after the full chain is verified**

### Output format
```
REASONING CHAIN:
Step 1: [claim] → verify: [command] → result: [pasted output] → ✓ confirmed / ✗ wrong
Step 2: [claim depending on step 1] → verify: [command] → result: [pasted output] → ✓ / ✗
Step 3: [claim] → verify: [command] → result: [pasted output] → ✓ / ✗

PLAN REVISION (if any step failed):
[revised approach based on what verification revealed — be specific about which step failed and why]

IMPLEMENTATION:
[code produced after the verified chain]
```

---

## Pattern 3 — Self-Consistency

Generate N independent answers to the same question, cross-check them, then synthesise the most consistent and accurate final response.

Use this when the task is a **decision** — not a mechanical implementation. Multiple defensible approaches exist; you need to find which is most robust.

### Steps

**1. Generate Answer A** — produce a complete response. Do not second-guess it mid-generation.

**2. Generate Answer B** — produce a second complete response, independently. Do not look at Answer A while generating B. Start the reasoning from scratch.

**3. Generate Answer C** (optional, for high-stakes decisions) — a third independent answer.

**4. Cross-check for agreements and contradictions**
- Where all answers agree → high confidence, proceed with that element
- Where answers disagree → analyse WHY (different assumptions, different interpretation of the spec, genuine ambiguity in the requirement)
- Which answer handles the most edge cases?
- Which answer is simplest while still correct?

**5. Synthesise the final answer**
The final answer is not a "winner" — it merges the strongest elements from each and explicitly resolves contradictions. State which element came from which answer and why.

### Output format
```
ANSWER A:
[complete first answer]

ANSWER B:
[complete second answer — generated independently]

CROSS-CHECK:
- Both agree on: [shared conclusions — high confidence]
- A and B disagree on: [the specific point of difference]
  Why they differ: [different assumption / different interpretation / genuine ambiguity]
- A is stronger because: [what A handles that B misses]
- B is stronger because: [what B handles that A misses]

FINAL (synthesised):
[merged answer — strongest elements from A and B, contradictions resolved]
What changed from A: [specific differences]
What changed from B: [specific differences]
```

### When self-consistency is most valuable for lsd-engine:
- **Severity decisions** — should a new rule be `'error'` or `'warning'`? Two independent evaluations often disagree, and the disagreement reveals real ambiguity in the requirement.
- **AMBIGUOUS_PHRASES additions** — is a given phrase vague enough to block compile, or merely imprecise? Generate two independent verdicts.
- **Compiler output format** — should a new field appear in the payload or only in `--json` output? Two answers often reveal an unstated assumption about the audience.
- **Haiku delegation decisions** — when the task is on the boundary, two independent classifications often converge and confirm the call, or reveal it's genuinely ambiguous (→ stay on Sonnet).

---

## Combining all three — sequence for high-stakes work

For architectural decisions, new rule design, or any task where getting it wrong has a cascading cost:

```
1. CoT + Verification   → build a verified reasoning chain so premises are known-true
          ↓
2. Self-Consistency     → generate multiple answers from the verified premises
          ↓
3. Self-Correction      → apply the evaluation checklist to the synthesised answer before delivering
```

This sequence prevents the most expensive failure class: confident, internally consistent output that is wrong about reality.

---

## Non-negotiable rule

Never claim a response has been self-corrected, chain-verified, or consistency-checked without showing the intermediate steps in the conversation. Stating "I verified this" without pasting the verification output is identical to no verification at all. The intermediate steps are the evidence — not a summary of them.
