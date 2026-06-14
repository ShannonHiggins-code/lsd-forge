# Skill: forge-new — Guided Spec Authoring Conversation

`forge-new` is the conversational intake protocol for authoring a new `.logic` spec inside the
AI chat. The AI conducts the session — asking questions, interpreting intent, deriving sections
from the accumulated context, and stress-testing the result before writing the file. The user
never leaves the chat to fill in a form.

`forge-new` runs the full LSD pipeline in one continuous session:

```
Intent capture → spec draft → adversarial hardening (RSC-AR) → compile → payload delivery
```

**This session authors and hardens only. A second session does the implementation.**
When this skill completes, it delivers a compiled payload. The user opens a new agent session
and pastes that payload as the first message. That agent implements. This agent does not.

---

## When to invoke

- User says "forge new", "create a spec", "I want to spec out X", describes a feature they want to build, or describes a change to something that already exists
- Phase 0 (below) determines automatically whether this is a new spec or an edit to an existing one — do not pre-judge from the user's phrasing alone

---

## Before starting — load project context

Read `.lsd/config.json`. Extract:

```
RUNTIME          config.stack.language + config.stack.framework
AUTHORIZED       config.authorized   (paths the agent may touch)
FORBIDDEN        config.forbidden    (paths the agent must never touch)
OWNER_HINT       config.owner        (if present — pre-fill owner field)
SPECS_DIR        config.specs_dir    (default: specs/)
VERIFY_COMMAND   config.verify_command
```

Call `forge_spec_list`. Keep the full result in context — you will need it for the routing
decision in Phase 0, the file conflict check in Phase 2, and dependency discovery in Phase 6.

---

## PHASE 0: NEW vs EDIT ROUTING DECISION

**Run this before Phase 1. Do not skip it.**

Ask the user one open question:

> "What do you want to build or change? Describe it in plain language — no structure needed yet."

Wait for the response. Then apply the routing rules below.

### Routing rules

Score each existing spec against the description on two signals:

| Signal | How to check |
|--------|-------------|
| Domain overlap | Does the description mention the same product area, page, flow, or integration as an existing spec's `domain`? |
| File overlap | Do the files the user would likely need to touch fall inside an existing spec's `authorized_files`? |

**Route to EDIT if either signal matches.** Route to NEW only when neither matches.

**Ask before routing** when: the description is large enough that it could be a full replacement rather than an amendment, or when two or more existing specs partially overlap with it.

### Presenting the routing decision

Always surface the decision and its reason before proceeding. Never silently enter edit mode.

**If routing to EDIT:**

```
This sounds like a change to an existing spec rather than a brand-new feature.

  Existing spec:  LS-YYYY-NNN — [plain-language description of what it covers]
  Last validated: [validated_against date]
  Covers:         [plain-language summary of authorized files]

I'll work within that spec — editing the relevant sections and bumping the version —
rather than creating a second spec for the same area (which would cause a conflict).

What specifically do you want to change? You can describe it freely, or I can show
you what the spec currently says section by section.
```

**If routing to NEW:**

```
I checked existing specs and nothing covers this area yet.

I'll author a new spec from scratch. Let's start with what you want to build.
```

**If ambiguous:**

```
I found [N] existing specs that partially overlap with what you described:

  LS-YYYY-NNN — [domain] — overlaps on: [files or domain area]
  LS-YYYY-MMM — [domain] — overlaps on: [files or domain area]

Options:
  A) Edit one of the existing specs to include the new behaviour
  B) Create a new spec with a tighter scope that doesn't overlap
  C) Split the change across both existing specs

Which fits what you have in mind?
```

**Gate: confirm the routing decision before proceeding.**

---

## EDIT MODE (entered when routing decision = EDIT)

Load the target spec file. Read every section. Present a plain-language summary:

```
Here is what LS-YYYY-NNN currently says:

  What it does:         [plain-language summary of INTENT_HAPPY_PATH]
  What can go wrong:    [plain-language summary of EDGE_CRITICAL_UNHAPPY_PATH]
  What must not break:  [plain-language summary of REGRESSION_FENCE]
  Key decisions:        [plain-language summary of CONTEXT_DEBT_NOTE]

Tell me what you want to change.
```

Once the user describes the changes, identify which sections are affected and run only the phases for those sections:

| Section to change | Phases to run |
|---|---|
| What the feature does (add/remove/reorder steps) | Phase 3, then Phase 4 to re-derive edges for changed steps |
| What can go wrong | Phase 4 only |
| What must not break | Phase 5 only |
| What files the change touches | Phase 2 only |
| The reasoning behind decisions | Phase 7 only |
| Multiple sections | Corresponding phases in order |

After confirming all changed sections, run Phase 8 (adversarial self-check) against the **full updated spec** — a change in one section can invalidate another.

**Version bump before writing:**
- Patch (0.0.x): wording clarification only, no behaviour change
- Minor (0.x.0): steps added or removed, edge cases updated, regression items changed
- Major (x.0.0): happy path restructured, authorized files changed, or domain redefined

Update `validated_against` to today's date. Then proceed to Phase 9 and Phase 10 as normal.

---

## PHASE 1: INTENT CAPTURE

*(Reached only when routing decision = NEW. The description was already captured in Phase 0 — do not ask again.)*

### Interpret the description

| Field | How to derive |
|-------|--------------|
| Domain | Infer from the primary noun + verb (e.g. "password reset" → `auth/password-reset`) |
| Runtime | Use `RUNTIME` from config, or ask if config is missing |
| Data stores | Identify external services mentioned (database, email, Stripe, storage, auth provider) |
| Likely authorized paths | Map the domain to the project's `AUTHORIZED` paths |
| Security sensitivity | Flag if domain involves auth, payments, credentials, PII, or billing |

Present your interpretation in plain language (see Human-first language rule in Conversation principles):

```
I read this as:

  What it does:         [plain-language description of the feature]
  Where it runs:        [plain-language runtime description]
  What it reads/writes: [plain-language list of services and data]
  Sensitivity:          [HIGH / STANDARD — reason]

Does this match what you have in mind? Correct anything before we go section by section.
```

**Gate: do not proceed until the user confirms or corrects the interpretation.**

---

## PHASE 2: TARGET_BOUNDARIES

### File conflict pre-check

Before presenting your suggestions, scan the `forge_spec_list` results for any existing spec
that authorizes any of the same paths you are about to propose. If a conflict exists:

> "⚠ [path] is already authorized in spec [ID] ([domain]). Authorizing it here too will cause
> `forge_validate` to flag a shared-authorization conflict. I suggest using a more specific
> subpath, or confirm this overlap is intentional."

Surface every conflict. Do not silently skip them.

### Propose boundaries

```
TARGET_BOUNDARIES

  runtime: <from config>
  data_stores: <services identified in Phase 1>

  Authorized files (files the agent may modify):
    - <most specific path from AUTHORIZED that covers this domain>
    - <supporting lib or helper path>

  Forbidden files (files the agent must never touch):
    - <entries from FORBIDDEN plus obvious off-limits paths for this domain>
```

**Explain each suggestion** — connect it back to what the user described.

**Constraint:** `authorized_files` must only contain paths within `AUTHORIZED`. If the user
requests a path outside `AUTHORIZED`, surface it:
> "That path is outside the authorized boundary in config.json — the spec will not compile
> unless config is updated first. Should we update config, or use a different path?"

**Gate: confirm boundaries before proceeding.**

---

## PHASE 3: INTENT_HAPPY_PATH

Propose a numbered list of steps covering the full success flow. Each step must be:
- **One discrete action** — not a paragraph, not a vague summary
- **Observable** — someone reading it can verify whether it happened
- **Actor-prefixed** — start with "User" or "System"

Derive the steps from the confirmed description and boundaries:

```
INTENT_HAPPY_PATH — proposed steps:

  1. User navigates to /forgot-password and submits their email address.
  2. System validates the email, generates a signed one-time reset token, and stores it
     with a 15-minute expiry in the database.
  3. System sends a password reset email containing the token link via the email service.
  4. User clicks the link and is directed to the reset form with the token pre-filled.
  5. User submits a new password; system validates the token, updates credentials, and
     invalidates the token.

Any changes?
```

### Anti-sycophancy rule — ambiguous language

If the user provides or approves a step containing any of these phrases, **do not accept it**.
Reject immediately with a specific rewrite offer:

> handle appropriately, handle accordingly, as needed, as appropriate, process the request,
> deal with, manage the error, validate input, ensure security, handle the error, if necessary,
> when applicable, in some cases, etc., and so on, various, somehow

> *"That step contains '[phrase]' which is a banned phrase — an AI agent cannot act on it
> deterministically and it will fail lint. Instead try: '[specific rewrite]'. Want me to apply
> that?"*

**Gate: every step must be free of banned phrases before proceeding.**

### Jargon substitution rule — technical terms

When proposing, reviewing, or rewriting steps with the user, replace developer terms with
plain business English. Apply this to every step you write or receive from the user:

| Avoid | Use instead |
|-------|------------|
| upsert | update if it exists, create it if it doesn't |
| null / undefined | empty / not provided |
| boolean / true / false flag | yes/no setting |
| payload | submitted data / form answers |
| return 400 / return 4xx | the system tells the customer what went wrong and does not proceed |
| return 500 / return 5xx | the system signals a failure |
| row / record (database context) | saved entry |
| schema validation | checking that all required fields are filled in correctly |
| idempotency / idempotency check | duplicate-prevention check |
| throws / exception | fails unexpectedly |
| endpoint | the address the request is sent to |
| non-2xx | an error response from the service |
| exit 0 | passes / succeeds |
| pre-hydration | before the page finishes loading |
| layout shift | the page jumping or repositioning |
| database write / write to DB | saving to the database |
| log / log a warning | record the error internally |

If a step contains any term in the left column, offer the substitution before accepting:
*"'[term]' is developer language — a business analyst reading this would need a developer to
translate it. I'd rewrite it as: '[plain version]'. Want me to apply that?"*

---

## PHASE 4: EDGE_CRITICAL_UNHAPPY_PATH

**Derive one edge case per happy path step — do not use generic templates.**

For each step in the confirmed happy path, apply the transformation rule that matches it.
Label each edge with the step it mirrors so the mapping is traceable.

| Happy path step contains | Derive this edge case |
|--------------------------|----------------------|
| Customer submits / enters / provides X | X is missing, invalid, or incorrectly formatted — the system highlights each problem field and tells the customer what to correct; nothing is saved or sent |
| System validates / checks X | X is not valid — the system tells the customer the specific reason and does not continue |
| System calls / requests external service | The service is unavailable or returns an error — the system signals failure without completing any part of the action; nothing is saved or sent |
| System sends email / notification | The delivery service is unavailable — the system signals failure explicitly; it does not silently drop the message or report success |
| System saves / stores / creates / writes | The save fails — the system signals failure and leaves nothing partially saved; the customer is asked to try again |
| System generates / stores a link or code | The link or code is expired or already used — the system tells the customer it is no longer valid and directs them to start again |
| Payment / checkout | The payment provider declines — the customer sees a clear error message; no order or subscription is created |
| System redirects | The destination requires access the customer does not have — the system redirects to a safe fallback and does not reveal the intended destination |

If two steps trigger the same rule (e.g. two saves), derive distinct edges that reference each
step's specific data — do not collapse them into one generic entry.

```
EDGE_CRITICAL_UNHAPPY_PATH — derived from your happy path:

  1. (from step 1) Email address field is empty or not a valid email — the system highlights
     the field and tells the customer to correct it; no reset link is generated.
  2. (from step 2) Saving the reset link fails — the system signals failure and does not
     send the email; the customer is asked to try again.
  3. (from step 3) Email delivery service is unavailable — the system signals failure
     explicitly; the reset is not marked as sent and no success message is shown.
  4. (from step 5) Reset link is expired or has already been used — the system tells the
     customer the link is no longer valid and directs them back to the request page.

Minimum required: ceil(5 / 2) = 3. You have 4 — above minimum.
```

**Gate: confirm edge cases and the count before proceeding.**

---

## PHASE 5: REGRESSION_FENCE

Propose what must not break. Draw from:
- Specs in `forge_spec_list` results that share the same domain
- Features or services mentioned in the happy path
- `VERIFY_COMMAND` from config

```
REGRESSION_FENCE — what must not break:

  - Customers who are already signed in must remain signed in after this change.
  - Signing out must continue to work correctly.
  - All automated tests must continue to pass.
```

Ask: "Anything else that must be preserved?"

---

## PHASE 6: SPEC DEPENDENCIES

Call `forge_spec_list` results (already loaded). Scan for specs whose domain overlaps with
or is a prerequisite of this spec's domain.

Present any relevant specs:

```
Existing specs in related domains:

  LS-2026-001  auth/login-redirect    — handles session auth and redirect flow
  LS-2026-042  auth/session-sync      — handles session token synchronisation

Does this spec depend on either of these? If the feature you're building assumes the behaviour
defined in another spec, list it in requires: [].

Enter spec IDs to list as dependencies, or press Enter to skip:
```

If the user identifies dependencies, record them as `requires: ["LS-2026-001"]`.
If none, record `requires: []`.

**Gate: confirm dependencies before proceeding.**

---

## PHASE 7: CONTEXT_DEBT_NOTE

**This section is not optional for security-sensitive domains.** If the domain involves auth,
payments, credentials, PII, or billing:

> "This is a security-sensitive spec. CONTEXT_DEBT_NOTE must document the rationale for
> non-obvious security decisions — token expiry duration, rate limits, enumeration prevention,
> retry behaviour. What is the reasoning behind the key decisions here?"

For non-sensitive domains: "Any non-obvious decisions, deferred work, or constraints worth
documenting for the agent?"

If the user says nothing, write a minimal note from the domain context. **Do not leave empty
for auth or payments domains.**

---

## PHASE 8: ADVERSARIAL SELF-CHECK

Two layers. Both must pass before writing.

### Layer A — Structural compliance

```
  [ ] All authorized_files paths fall within config.authorized
  [ ] No forbidden_files path is referenced in any step
  [ ] Every external call in the happy path has a corresponding edge case
  [ ] Every edge case labels which happy path step it mirrors
  [ ] Zero banned phrases across all steps
  [ ] CONTEXT_DEBT_NOTE is non-empty for security-sensitive domains
  [ ] Edge step count ≥ ceil(happy step count / 2) — count both out loud
  [ ] No step describes implementation (no "create a React component", no "add a database column")
```

### Layer B — Agent perspective

Read the entire spec as if you are the AI coding agent about to implement it. Answer each:

```
  [ ] Can I implement every happy path step without making a design decision not stated
      in the spec? If any step requires a judgment call, it is under-specified — name it.

  [ ] Does every edge case give me both the exact trigger condition AND the exact system
      response? "Handle gracefully" is not a response. What the customer sees or receives,
      and what the system saves, sends, or skips — these are. Flag any edge case that
      leaves the response unspecified.

  [ ] Are authorization boundaries as tight as they can be? "src/" is not tighter than
      "src/auth/reset/". If a broader path is listed, confirm it is intentional.

  [ ] Is every REGRESSION_FENCE item verifiable by walking through a real user scenario
      or checking whether the product still behaves correctly? "Nothing should break" is
      not verifiable. "Customers who completed checkout before this change must still
      receive their documents" is. Rewrite any item that is not verifiable in plain terms.

  [ ] Would I need to read any file outside authorized_files to understand the full feature?
      If yes, that file should be listed as authorized (read-only) or the step is missing context.
```

Fix every FAIL before proceeding. State each change.

**Only when both layers show all PASS:** "Adversarial check complete. Proceeding to write."

---

## PHASE 9: WRITE AND VERIFY

Call `forge_new` with all confirmed answers:

```json
{
  "domain": "<confirmed>",
  "owner": "<confirmed>",
  "runtime": "<confirmed>",
  "data_stores": "<confirmed>",
  "authorized_files": ["<...>"],
  "forbidden_files": ["<...>"],
  "happy_path_steps": ["<...>"],
  "edge_steps": ["<...>"],
  "regression_fence": ["<...>"],
  "context_debt": "<confirmed>",
  "requires": ["<LS-YYYY-NNN>"]
}
```

Call `forge_lint` on the output file. If lint fails, return to the specific section, fix, re-lint.

Call `forge_validate`. Surface any cross-spec conflicts found. If a conflict is critical, fix
the spec before continuing. If it is a warning, note it for the user.

**The session is not complete until forge_lint exits 0.**

---

## PHASE 10: RSC-AR HARDENING

Do not stop after a clean lint. The draft spec is not ready for compilation. Transition automatically:

```
Draft written: specs/LS-YYYY-NNN-<slug>.logic
forge_lint:    clean
forge_validate: <result>

Entering RSC-AR Phase 2 — attacking the draft now.
```

Read `.lsd/skills/rsc-ar.md`.

**Skip RSC-AR Phase 1.** The spec written in Phase 9 IS the Proposer draft. Begin at **Phase 2
(Adversary)** — run the full adversarial checklist against the draft content and report all findings.

Wait for the user to say "Execute Phase 3" before resolving.

---

## PHASE 11: SAVE HARDENED SPEC → COMPILE → DELIVER

After RSC-AR Phase 3 (Resolver) produces the final hardened spec:

**Step 1 — Save.** Overwrite the draft file (`specs/LS-YYYY-NNN-<slug>.logic`) with the
Phase 3 content exactly as output. Do not summarise or paraphrase — write the full file.

**Step 2 — Lint.** Call `forge_lint` on the saved file. If it fails, fix and re-lint.
Do not proceed until lint exits 0.

**Step 3 — Compile.** Call `forge_compile` on the hardened spec file.

**Step 4 — Deliver.** Show the compiled payload in full, then close the session with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Spec:     specs/LS-YYYY-NNN-<slug>.logic
  Lint:     clean
  Validate: <result>
  Compiled: ✓

  THIS SESSION IS COMPLETE.

  To implement:
  1. Open a new agent session (new chat, new context window)
  2. Paste the compiled payload above as your first message
  3. The agent implements from the payload — nothing else

  Do not implement in this session.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Hard rule: do not write any implementation code in this session after delivering the payload.**
If the user asks to implement here, decline and restate the instruction above. The payload exists
precisely so implementation happens in a clean context with no authoring history.

---

## Conversation principles

**One section at a time.** Each phase is its own exchange.

**Explain, don't just list.** Connect every suggestion to what the user described.

**Push back on vague answers.** "Just add the usual edge cases" is not an answer. Ask which
specific failures they want covered.

**The spec is for the agent, not the user.** Every step must be executable without a follow-up
question. If you would need to ask, the step is not specific enough.

**Human-first language during the session.** The `.logic` file format uses uppercase section
names and technical field labels because they are parsed by the linter. The *conversation*
must use plain business English. Translate section names whenever you introduce a phase:

| Section name | Say to the user |
|---|---|
| TARGET_BOUNDARIES | "What this feature is allowed to touch — and what it must never change" |
| INTENT_HAPPY_PATH | "The main success flow, step by step — what happens when everything works" |
| EDGE_CRITICAL_UNHAPPY_PATH | "What can go wrong and exactly how the system responds each time" |
| REGRESSION_FENCE | "What must not break — existing behaviour this change must preserve" |
| CONTEXT_DEBT_NOTE | "Why we made these decisions — context a future developer would need" |

Never present a section header to the user without first naming what it is in plain English.
When showing your Phase 1 interpretation, present it as labelled descriptions, not raw field
names (`data_stores`, `runtime`).

---

## Ingestion template

```
Read .lsd/skills/forge-new.md and .lsd/config.json. I want to spec out a change or new feature.

DESCRIPTION
<describe what you want to build or change in plain language>

Execute Phase 0 now.
```
