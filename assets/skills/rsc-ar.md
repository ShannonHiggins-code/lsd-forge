# Skill: RSC-AR — Recursive Self-Correction with Adversarial Reasoning

RSC-AR is the spec authoring loop for LSD. It produces a hardened `.logic` file through three
user-confirmed phases: a Proposer drafts, an Adversary stress-tests, and a Resolver converges.
Phase 3 output IS the `.logic` spec — not a code implementation.

---

## When to use this skill

- Any non-trivial feature, service, or integration that needs a spec before code is written
- When the task involves design decisions with real alternatives
- When the user wants a checkpoint before adversarial critique is run
- For any change that touches authorization boundaries, data flows, or external services

Skip RSC-AR for mechanical one-liners. Use it when being wrong has a cascading cost.

---

## Before starting — load project context

Read `.lsd/config.json`. Extract these values — they populate the phase constraints:

```
PROJECT_NAME     config.project_name
VERIFY_COMMAND   config.verify_command
STACK_LANGUAGE   config.stack.language
STACK_FRAMEWORK  config.stack.framework
AUTHORIZED       config.authorized   (array of allowed paths)
FORBIDDEN        config.forbidden    (array of off-limits paths)
```

---

## PHASE 1: PROPOSER SYNTHESIS

Analyze the task. Draft a `.logic` spec using the five required sections.

### Constraints
1. **No drift** — every section must contain real content. No `TBD`, no `TODO`, no pseudo-spec.
2. **Authorization compliance** — `authorized_files` must only contain paths from `config.authorized`. Nothing from `config.forbidden`.
3. **Step completeness** — `INTENT_HAPPY_PATH` must have numbered steps covering the full success flow. `EDGE_CRITICAL_UNHAPPY_PATH` must have at least `ceil(happy_steps / 2)` steps.
4. **No ambiguous language** — do not use: *handle appropriately, handle accordingly, as needed, as appropriate, process the request, deal with, manage the error, validate input, ensure security, handle the error, if necessary, when applicable, in some cases, etc., and so on, various, somehow*.
5. **`validated_against`** — set to today's date in ISO format.

### Output format

```
### [PHASE 1: PROPOSER SYNTHESIS]

---
id: LS-YYYY-NNN
version: 1.0.0
domain: <area/feature>
requires: []
owner: <name (role)>
validated_against: <YYYY-MM-DD>
---

## 1. TARGET_BOUNDARIES

runtime: <runtime environment>
data_stores: <databases or caches accessed>
authorized_files:
  - <path from config.authorized>
forbidden_files:
  - <path from config.forbidden>

## 2. INTENT_HAPPY_PATH

1. <first step — specific, observable action>
2. <second step>
...

## 3. EDGE_CRITICAL_UNHAPPY_PATH

1. <failure case — specific trigger> → <specific system response>
2. <failure case> → <response>
...

## 4. REGRESSION_FENCE

- <dependency that must not break>
- <preservation rule>

## 5. CONTEXT_DEBT_NOTE

<rationale for non-obvious decisions — security choices, UX overrides, deferred work>
```

**Stop here. Wait for user to say "Proceed to Phase 2" before continuing.**

---

## PHASE 2: ADVERSARIAL CRITIQUE

Invert your persona. You are now a hostile auditor whose job is to break Phase 1.
Assume Phase 1 contains fatal flaws. Prove it.

### Universal checklist (applies to all projects)

- [ ] Does Phase 1 reference any path not in `config.authorized`?
- [ ] Does Phase 1 touch any path in `config.forbidden`?
- [ ] Does Phase 1 use any ambiguous phrase from the banned list?
- [ ] Does Phase 1 invent a method, endpoint, field, or service that does not exist in the codebase?
- [ ] Does Phase 1 assume behavior not documented in any posture file or existing spec?
- [ ] Is the `EDGE_CRITICAL_UNHAPPY_PATH` step count ≥ `ceil(happy_steps / 2)`? Count them.
- [ ] Would `VERIFY_COMMAND` fail after implementing this spec? Why?
- [ ] Does `CONTEXT_DEBT_NOTE` explain every non-obvious decision, or does it dodge?

### Stack-specific checklist (add based on `config.stack`)

**node / typescript:**
- [ ] Does any step blindly trust an external payload without runtime validation?
- [ ] Are there implicit async race conditions between steps?
- [ ] Does the spec create circular dependencies between modules?

**python:**
- [ ] Does any step assume a library version behavior that may differ across environments?
- [ ] Are there unhandled exception paths in async flows?

**go / rust:**
- [ ] Does the spec handle all error return paths explicitly?
- [ ] Are there ownership or concurrency assumptions not stated?

### Anti-sycophancy rule

**A clean verdict must be earned, not assumed.** Every checklist item must be explicitly
evaluated and marked PASS or FAIL with a one-line justification. An item marked PASS with
no justification is treated as a Phase 2 failure and the cycle repeats from Phase 2.

If after a full checklist pass you find zero fatal flaws, state that explicitly:
*"Adversarial review complete. Zero fatal flaws found. Justification: [per-item reasoning]."*
Do not omit the reasoning. The absence of flaws is a finding that requires evidence.

### Output format

```
### [PHASE 2: ADVERSARIAL CRITIQUE]

Universal findings:
- [PASS] <checklist item>: <one-line justification why this is clean>
- [FAIL] <checklist item>: <specific finding — what is wrong and where>
...

Stack-specific findings:
- [PASS/FAIL] <checklist item>: <justification>
...

Fatal flaws (must fix before Phase 3):
1. <specific issue + location in spec>

Non-fatal weaknesses (should fix):
1. <issue>

Verdict: <N fatal flaws, M non-fatal weaknesses> / <"Zero fatal flaws — justified above">
```

**Stop here. Wait for user to say "Execute Phase 3" before continuing.**

---

## PHASE 3: RESOLVER — FINAL HARDENED SPEC

Reconcile Phase 1 and Phase 2. Apply every fix. Output the final `.logic` file.

### Constraints
1. Address every fatal flaw from Phase 2 with a specific change.
2. Address every non-fatal weakness unless there is a documented reason to defer.
3. Run `forge lint <output-file>` on the result. It must exit 0.
4. If lint fails, fix and re-lint before delivering.

### Output format

```
### [PHASE 3: FINAL HARDENED SPEC]

Changes from Phase 1:
- <what changed and why — reference the Phase 2 finding>

<complete .logic file content — ready to save>

Lint result:
<paste actual output of: forge lint <file> --plain>
```

### Re-trigger condition

If any fix applied in Phase 3 introduces a new constraint, path, or behavioral assumption
not present in Phase 1, **do not deliver** — re-enter at Phase 2 with the revised spec as
the new input. This is cycle 2 of the loop. Maximum 3 cycles total.

If cycle 3 still produces fatal flaws, halt and surface to the user:
*"RSC-AR has not converged after 3 cycles. Unresolved flaws: [list]. User decision required."*

---

## Multi-agent implementation

For critical specs — anything touching authorization boundaries, external services, or
compiler output format — deploy two separate model instances: the Proposer at low temperature
(0.2–0.5) for structured, deterministic reasoning, and the Adversary at higher temperature
(0.7+) to maximize edge-case diversity and prevent the sycophancy failure mode. Pass the
Proposer's full output as input to the Adversary instance; pass the Adversary's critique back
to the Proposer instance for revision. The same three-phase structure and convergence rules apply.

---

## Ingestion template

Use this to start an RSC-AR cycle on a specific task:

```
Read .lsd/skills/rsc-ar.md and .lsd/config.json. I am initiating an RSC-AR cycle.

TARGET OBJECTIVE
<describe what needs to be specced — feature, integration, service, or flow>

EXISTING CONTEXT
- Relevant specs already in specs/: <list or "none">
- Services this touches: <from .lsd/registry.json>
- Key constraints: <anything not in config.json>

Execute Phase 1 now. Do not proceed to Phase 2 until I confirm.
```
