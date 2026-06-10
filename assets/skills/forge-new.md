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

- User says "forge new", "create a spec", "I want to spec out X", or describes a feature they want to build
- Any time a new `.logic` file needs to be authored from scratch
- As the first step before the RSC-AR loop on a new feature

Do not invoke for edits to an existing spec — that is a lint + edit flow, not an intake flow.

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

Call `forge_spec_list`. Keep the full result in context — you will need it in Phase 2 (file
conflict check) and Phase 6 (dependency discovery).

After the user provides their description in Phase 1, call `forge_search` with that description.
Use the results to pre-populate Phase 6 (dependency candidates) and to warn the user if the
feature sounds like it is already specced.

---

## PHASE 1: INTENT CAPTURE

Ask the user one open question:

> "What do you want to build? Describe it in plain language — no structure needed yet."

Wait for the response. Do not prompt for domain, files, or steps.

### Interpret the description

| Field | How to derive |
|-------|--------------|
| Domain | Infer from the primary noun + verb (e.g. "password reset" → `auth/password-reset`) |
| Runtime | Use `RUNTIME` from config, or ask if config is missing |
| Data stores | Identify external services mentioned (database, email, Stripe, storage, auth provider) |
| Likely authorized paths | Map the domain to the project's `AUTHORIZED` paths |
| Security sensitivity | Flag if domain involves auth, payments, credentials, PII, or billing |

Present your interpretation:

```
I read this as:

  Domain:      auth/password-reset
  Runtime:     TypeScript 5.4 / Next.js 15
  Data stores: Postgres (read-write), Email service (write-only)
  Sensitivity: HIGH — auth flow, token handling

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

---

## PHASE 4: EDGE_CRITICAL_UNHAPPY_PATH

**Derive one edge case per happy path step — do not use generic templates.**

For each step in the confirmed happy path, apply the transformation rule that matches it.
Label each edge with the step it mirrors so the mapping is traceable.

| Happy path step contains | Derive this edge case |
|--------------------------|----------------------|
| User submits / enters / provides X | X is missing, invalid, or malformed — return field-level error, do not proceed |
| System validates X | X validation fails — return the specific reason, do not proceed |
| System calls / requests external API | Service is unavailable or returns non-2xx — return graceful error, do not partially complete |
| System sends email / notification | Delivery service unavailable — return explicit error, do not silently drop or report success |
| System stores / writes / creates / saves | Write fails — return 500, do not leave the system in a partial state |
| System generates / stores token | Token is expired or already used — reject with specific message, prompt re-initiation |
| Payment / Stripe / checkout | Provider returns decline — show user-facing error, do not create order or subscription record |
| System redirects | Redirect target requires auth the user lacks — fall back to safe default, do not expose destination |

If two steps trigger the same rule (e.g. two database writes), derive distinct edges that
reference each step's specific data — do not collapse them into one generic "write fails" entry.

```
EDGE_CRITICAL_UNHAPPY_PATH — derived from your happy path:

  1. (from step 1) Email field is empty or malformed — return 400 with a field-level error,
     do not attempt token generation.
  2. (from step 2) Database write for the reset token fails — return 500, do not send the
     email, do not leave a partial token record.
  3. (from step 3) Email service is unavailable — return an explicit error to the caller,
     do not mark the reset as initiated or report success.
  4. (from step 5) Token is expired or already used — return a specific error message and
     redirect the user to /forgot-password to re-initiate.

Minimum required: ceil(5 / 2) = 3. You have 4 — above minimum.
```

**Gate: confirm edge cases and the count before proceeding.**

---

## PHASE 5: REGRESSION_FENCE

Propose what must not break. Draw from:
- Specs in `forge_spec_list` results that share the same domain
- Endpoints or services mentioned in the happy path
- `VERIFY_COMMAND` from config

```
REGRESSION_FENCE — what must not break:

  - Existing authenticated sessions must remain valid after this change.
  - The /api/auth/logout endpoint must continue to clear cookies correctly.
  - <VERIFY_COMMAND> must continue to exit 0.
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
      response? "Handle gracefully" is not a response. A status code, a redirect, a log
      entry — these are. Flag any edge case that leaves the response unspecified.

  [ ] Are authorization boundaries as tight as they can be? "src/" is not tighter than
      "src/auth/reset/". If a broader path is listed, confirm it is intentional.

  [ ] Is every REGRESSION_FENCE item something I can verify? "Nothing should break" is not
      verifiable. "forge test must exit 0" is. Rewrite any item that is not verifiable.

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

---

## Ingestion template

```
Read .lsd/skills/forge-new.md and .lsd/config.json. I want to author a new .logic spec.

DESCRIPTION
<describe what you want to build in plain language>

Execute Phase 1 now.
```
