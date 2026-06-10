# Skill: forge-new — Guided Spec Authoring Conversation

`forge-new` is the conversational intake protocol for authoring a new `.logic` spec inside the
AI chat. The AI conducts the session — asking questions, interpreting intent, deriving sections
from the accumulated context, and stress-testing the result before writing the file. The user
never leaves the chat to fill in a form.

After `forge-new` completes, the output is a lint-clean `.logic` file ready for RSC-AR hardening
or immediate compilation into an agent payload.

---

## When to invoke

- User says "forge new", "create a spec", "I want to spec out X", or describes a feature they want to build
- Any time a new `.logic` file needs to be authored from scratch
- As the first step before running the RSC-AR loop on a new feature

Do not invoke for edits to an existing spec — that is a lint + edit flow, not an intake flow.

---

## Before starting — load project context

Read `.lsd/config.json`. Extract these values for use throughout the session:

```
RUNTIME          config.stack.language + config.stack.framework
AUTHORIZED       config.authorized   (paths the agent may touch)
FORBIDDEN        config.forbidden    (paths the agent must never touch)
OWNER_HINT       config.owner        (if present — pre-fill owner field)
SPECS_DIR        config.specs_dir    (where to write the file — default: specs/)
```

Also scan `specs/` for existing `.logic` files. Note the highest `LS-YYYY-NNN` ID in use —
the new spec will increment from it.

---

## PHASE 1: INTENT CAPTURE

Ask the user one open question:

> "What do you want to build? Describe it in plain language — no structure needed yet."

Wait for the response. Do not prompt for domain, files, or steps.

### Interpret the description

From the plain-language response, derive:

| Field | How to derive |
|-------|--------------|
| Domain | Infer from the primary noun + verb (e.g. "password reset" → `auth/password-reset`) |
| Runtime | Use `RUNTIME` from config, or ask if config is missing |
| Data stores | Identify external services mentioned (database, email, Stripe, storage, auth provider) |
| Likely authorized paths | Map the domain to the project's `AUTHORIZED` paths |
| Security sensitivity | Flag if domain involves auth, payments, credentials, PII, or billing |

Present your interpretation in a structured block:

```
I read this as:

  Domain:      auth/password-reset
  Runtime:     TypeScript 5.4 / Next.js 15
  Data stores: Postgres (read-write), Email service (write-only)
  Sensitivity: HIGH — auth flow, token handling

Does this match what you have in mind? Correct anything before we go section by section.
```

**Gate: do not proceed to Phase 2 until the user confirms or corrects the interpretation.**

---

## PHASE 2: TARGET_BOUNDARIES

Using the confirmed interpretation as context, propose the section content:

```
TARGET_BOUNDARIES

  runtime: <from config or confirmed above>
  data_stores: <services identified in Phase 1>

  Authorized files (files the agent may modify):
    - <most specific path from AUTHORIZED that covers this domain>
    - <supporting lib or helper path>

  Forbidden files (files the agent must never touch):
    - <entries from FORBIDDEN plus any obvious off-limits paths for this domain>
```

**Explain each suggestion** — connect it back to the description. Example: "I suggested
`src/lib/auth/reset.ts` because your description mentions generating a token, which is logic
that belongs in the auth library layer."

Ask: "Do these boundaries look right? Any files to add, remove, or change?"

**Constraint — authorization compliance:**
- `authorized_files` must only contain paths that fall within `AUTHORIZED`
- If the user requests a path outside `AUTHORIZED`, surface it: *"That path is outside the
  authorized boundary in config.json — adding it here would make the spec uncompilable unless
  config is updated first. Should we update config, or use a different path?"*
- `forbidden_files` must include all `FORBIDDEN` entries relevant to this domain

**Gate: confirm boundaries before proceeding.**

---

## PHASE 3: INTENT_HAPPY_PATH

Propose a numbered list of steps covering the full success flow. Each step must be:
- **One discrete action** — not a paragraph, not a vague summary
- **Observable** — someone reading it can verify whether it happened
- **Actor-prefixed** — start with "User" or "System" to make the actor explicit

Derive the steps from the confirmed description and boundaries. Show them:

```
INTENT_HAPPY_PATH — proposed steps:

  1. User navigates to /forgot-password and submits their email address.
  2. System validates the email, generates a signed one-time reset token, and stores it
     with a 15-minute expiry in the database.
  3. System sends a password reset email containing the token link via the email service.
  4. User clicks the link and is directed to the reset form with the token pre-filled.
  5. User submits a new password; system validates the token, updates credentials, and
     invalidates the token.

Any changes? You can add steps, remove steps, or reword any step.
```

### Anti-sycophancy rule — ambiguous language

If the user provides or approves a step containing any of these phrases, **do not accept it**:

> handle appropriately, handle accordingly, as needed, as appropriate, process the request,
> deal with, manage the error, validate input, ensure security, handle the error, if necessary,
> when applicable, in some cases, etc., and so on, various, somehow

Reject immediately with a specific alternative:

> *"That step contains 'validate input' which is a banned phrase — it will fail lint because
> an AI agent cannot act on it deterministically. Instead, try: 'System validates that the
> email field is non-empty and matches RFC 5322 format; return 400 with a field-level error
> if not.' Want me to rewrite it?"*

**Gate: every step must be free of banned phrases before proceeding.**

---

## PHASE 4: EDGE_CRITICAL_UNHAPPY_PATH

**Derive edge cases directly from the confirmed happy path — do not use generic templates.**

For each happy path step, ask: *what is the most likely way this step fails?* Apply these
transformation rules:

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

Show the derived edges and explain which happy path step each one mirrors:

```
EDGE_CRITICAL_UNHAPPY_PATH — derived from your happy path:

  1. (from step 1) Email field is empty or malformed — return a 400 with a field-level
     error message, do not attempt token generation.
  2. (from step 2) Database write for the reset token fails — return 500, do not send
     the email, do not leave a partial token record.
  3. (from step 3) Email service is unavailable — return an explicit error to the caller,
     do not mark the reset as initiated or report success.
  4. (from step 5) Token is expired or has already been used — return a specific error
     message and redirect the user to /forgot-password to re-initiate.

Minimum required: ceil(5 / 2) = 3. You have 4 — above minimum.
```

**Minimum enforcement:** The spec requires `ceil(happy_steps / 2)` edge steps. Count out loud.
If the derived edges fall short, propose additional generic failure modes until the minimum is met.

**Gate: confirm edge cases, including the count, before proceeding.**

---

## PHASE 5: REGRESSION_FENCE

Propose what must not break as a result of implementing this spec. Draw from:
- Other specs in `specs/` that share the same domain
- Services or endpoints mentioned in the happy path
- The `verify_command` in config (running it should still pass)

```
REGRESSION_FENCE — what must not break:

  - Existing authenticated sessions must remain valid after this change.
  - The /api/auth/logout endpoint must continue to clear cookies correctly.
  - <verify_command> must continue to exit 0.
```

Ask: "Anything else that must be preserved?"

---

## PHASE 6: CONTEXT_DEBT_NOTE

**This section is not optional for security-sensitive domains.** If the domain involves auth,
payments, credentials, PII, or billing, explicitly prompt:

> "This is a security-sensitive spec. The CONTEXT_DEBT_NOTE must document the rationale for
> any non-obvious security decisions — token expiry duration, rate limits, enumeration
> prevention, retry behaviour. What's the reasoning behind the key decisions here?"

For non-sensitive domains, ask once: "Any non-obvious decisions, deferred work, or constraints
worth documenting for the agent?"

If the user says nothing: write a minimal note referencing the security property most relevant
to the domain (e.g. "Token expiry set to 15 minutes — balances usability against replay window.
Enumeration prevented by returning success regardless of email existence.").

**Do not leave this section empty for auth or payments domains.**

---

## PHASE 7: ADVERSARIAL SELF-CHECK

Before writing the file, conduct a self-adversarial review. Check each item. Mark PASS or FAIL
with one-line justification. Do not skip any item.

```
Adversarial self-check:

  [ ] All authorized_files paths fall within config.authorized
  [ ] No forbidden_files path is referenced in any step
  [ ] Every external call in the happy path has a corresponding edge case
  [ ] Every edge case maps to a specific happy path step (no floating generics)
  [ ] Zero banned phrases across all steps (checked above in Phase 3 gate)
  [ ] CONTEXT_DEBT_NOTE is non-empty if domain is security-sensitive
  [ ] Edge step count ≥ ceil(happy step count / 2) — count both
  [ ] No step says what to build rather than what the system does (no implementation details)
```

If any item is FAIL, fix it before proceeding. State what changed.

**If all items PASS:** state "Adversarial check complete — zero issues. Proceeding to write."

---

## PHASE 8: WRITE AND VERIFY

Call the `forge_new` MCP tool with all confirmed answers:

```json
{
  "domain": "<confirmed domain>",
  "owner": "<confirmed owner>",
  "runtime": "<confirmed runtime>",
  "data_stores": "<confirmed stores>",
  "authorized_files": ["<...>"],
  "forbidden_files": ["<...>"],
  "happy_path_steps": ["<step 1>", "<step 2>", "..."],
  "edge_steps": ["<edge 1>", "<edge 2>", "..."],
  "regression_fence": ["<...>"],
  "context_debt": "<confirmed note>"
}
```

After `forge_new` returns, call `forge_lint` on the output file path.

**The session is not complete until `forge_lint` exits 0.**

If lint fails:
- Return to the specific section that failed
- Fix the issue
- Re-run `forge_lint`
- Repeat until clean

On success, report:

```
Spec written: specs/LS-YYYY-NNN-<slug>.logic
Lint: clean

Next step: run the RSC-AR loop to harden this spec before compiling it into an agent payload.
Invoke: read .lsd/skills/rsc-ar.md and run Phase 1 on the spec above.
```

---

## Conversation principles

**One section at a time.** Do not ask about steps and edge cases in the same message. Each
phase gets its own exchange.

**Explain, don't just list.** When proposing content, connect it to what the user described.
"I suggested X because you mentioned Y" builds trust and surfaces mismatches.

**Push back on vague answers.** If the user says "just add the usual edge cases" — that is not
acceptable. Ask which specific failures they want covered. Vague answers produce vague specs
that fail lint and give agents no deterministic behaviour to implement.

**The spec is for the agent, not the user.** Every step must be something an AI coding agent
can execute without asking a follow-up question. If you would need to ask, the step is not
specific enough.

---

## Ingestion template

Paste this to start a `forge-new` session:

```
Read .lsd/skills/forge-new.md and .lsd/config.json. I want to author a new .logic spec.

DESCRIPTION
<describe what you want to build in plain language>

Execute Phase 1 now.
```
