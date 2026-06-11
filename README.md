# LSD FORGE

**Spec-first AI-assisted development. Install once — any AI you connect self-onboards, maps your project, and operates within defined authorization boundaries.**

**[authori.us/lsd-forge](https://authori.us/lsd-forge)** — documentation, guides, and examples

```bash
npm install lsd-forge --save-dev
npx forge init
```

---

## What it does

LSD FORGE enforces a structured workflow between engineers and AI coding agents:

1. **Before an agent writes code, it authors a spec.** A `.logic` file defines exact intent, authorization boundaries, failure cases, and what must not break — verified by machine before any implementation begins.
2. **Every spec is adversarially hardened.** The built-in RSC-AR loop runs a Proposer → Adversary → Resolver cycle. The Adversary stress-tests the spec to breaking. The Resolver merges the surviving changes.
3. **Lint and compile gate the agent.** A spec that doesn't pass `forge lint` cannot be compiled. A spec that doesn't compile cannot be delivered to an agent. The pipeline is enforced, not suggested.
4. **Connected AI models self-onboard.** After `forge init`, any AI working in the project reads `.lsd/onboarding.md`, maps all services and artifacts, loads authorization boundaries, and reports its findings — before touching anything.

---

## How authoring works

LSD FORGE separates authoring from implementation into two distinct sessions. The same AI that writes a spec should not implement it — implementation happens in a clean context with no authoring history.

```
Session 1 — Author                    Session 2 — Implement
─────────────────────────────         ─────────────────────────────
/forge-new                            Paste compiled payload
  │                                     │
  ├─ Intent capture                     └─ Agent reads the brief
  ├─ Section-by-section authoring           and implements
  ├─ Ambiguous language detection
  ├─ Edge cases derived from happy path
  ├─ Cross-spec conflict check
  ├─ Adversarial self-check (2 layers)
  ├─ forge_new → forge_lint → forge_validate
  ├─ RSC-AR Phase 2 (Adversary attacks draft)
  ├─ RSC-AR Phase 3 (Resolver hardens)
  └─ forge_compile → payload delivered
```

The compiled payload is the hand-off artifact. It contains everything the implementing agent needs — no context from the authoring conversation leaks through.

---

## Quick start

```bash
# 1. Install
npm install lsd-forge --save-dev

# 2. Bootstrap — run once per project
npx forge init
```

Open a new session and paste this prompt to your AI:

```
Read .lsd/onboarding.md and execute the discovery protocol in full.
Map every service, app, package, data store, and AI posture file in this project.
Populate .lsd/registry.json with what you find.
Report your findings before touching anything else.
```

```bash
# 3. See what was discovered
forge status
forge coverage
forge validate
```

```bash
# 4. Author a spec — type this in your AI chat
/forge-new
```

The `/forge-new` slash command opens a guided 11-phase conversation. Your AI interprets your intent, builds each section with reasoning, derives edge cases from your happy path, runs an adversarial check, hardens the spec with RSC-AR, and delivers a compiled payload — all without leaving the chat.

```bash
# 5. Open a new agent session and paste the compiled payload as the first message
# That agent implements. The authoring session is complete.
```

---

## What `forge init` installs

`forge init` detects your stack, finds your existing AI posture files, and wires everything together.

```
.lsd/
├── onboarding.md       AI automation trigger — any model reads this on first session and self-onboards
├── config.json         Authorization map: stack, verify oracle, authorized/forbidden paths
├── registry.json       Resource registry — AI populates on first session (services, artifacts, posture)
└── skills/
    ├── forge-new.md        Guided spec authoring conversation — the primary authoring skill
    ├── rsc-ar.md           The FORGE hardening loop (Proposer → Adversary → Resolver)
    ├── spec-authoring.md   .logic format reference and lint rules
    ├── self-refinement.md  Self-correction and CoT verification patterns
    └── onboarding.md       Discovery protocol — maps services and artifacts
```

Also installs:
- **Pre-commit hook** — two checks on every commit:
  1. Staged `.logic` files are linted with `--strict` — blocks the commit on errors
  2. Staged code files are checked against the spec library with `forge touched --staged` — warns (non-blocking) if any staged file is authorized in an existing spec, prompting re-validation
- **`lint:specs` script** in `package.json`
- **LSD block** prepended to any AI posture files found (`CLAUDE.md`, `.cursor/rules`, `.github/copilot-instructions.md`, and others)
- **`/forge-new` shortcut** in the appropriate format for every detected AI tool:

| Tool detected | Shortcut installed | Invocation |
|---|---|---|
| Claude Code (`CLAUDE.md`) | `.claude/commands/forge-new.md` | `/forge-new` |
| GitHub Copilot (`.github/copilot-instructions.md`) | `.github/prompts/forge-new.prompt.md` | `/forge-new` |
| Cursor (`.cursor/rules`) | `.cursor/rules/forge-new.mdc` | `@forge-new` |
| Windsurf (`.windsurf/rules`) | `.windsurf/rules/forge-new.md` | Cascade rule |

---

## Adopting into a mature application

The wrong approach is backfilling specs for everything before using the tool — that is months of work and kills adoption before it starts. The right approach is to spec forward from a date and triage backward by risk.

### Phase 1 — Install and discover (Day 1, ~30 min)

```bash
npm install lsd-forge --save-dev
npx forge init
```

Open a new session and paste this prompt to your AI:

```
Read .lsd/onboarding.md and execute the discovery protocol in full.
Map every service, app, package, data store, and AI posture file in this project.
Populate .lsd/registry.json with what you find.
Report your findings before touching anything else.
```

Then run:

```bash
forge status      # see what was discovered
forge coverage    # expect 0% — that is fine
forge validate    # check for any cross-service collisions
```

### Phase 2 — Triage by risk (Week 1)

Do not spec alphabetically. Work with the AI to rank the registry by blast radius:

| Priority | Service type | Why |
|----------|-------------|-----|
| 1st | Auth / session | Security blast radius |
| 2nd | Payments / billing | Compliance and irreversibility |
| 3rd | Data writes | Cannot undo a bad migration |
| 4th | Public APIs | External contracts |
| 5th | Background jobs | Silent failure surface |
| Last | Read-only views | Lowest risk |

Use `/forge-new` for the top 5. That is enough to validate the workflow and build team muscle memory before going broader.

### Phase 3 — Set a low CI threshold and raise it quarterly

```bash
forge coverage --threshold 20   # week 1
forge coverage --threshold 40   # month 3
forge coverage --threshold 80   # month 6
```

### Phase 4 — The spec-forward rule (ongoing)

Pick a date — the **spec line**. From that date:

- **New feature** → `/forge-new` before a line of code is written
- **Change to a specced service** → update the spec first, lint must pass
- **Change to an unspecced service** → author the spec as part of the ticket

The pre-commit hook fires on two things: staged `.logic` files (blocks on lint errors) and staged code files (warns if any file is authorized in an existing spec). Existing unspecced code is never blocked — only new and modified specs are hard-gated, and code changes in specced domains get a soft warning to re-validate.

### The coverage target

The goal is not 100% coverage. It is 100% coverage of the risk surface and zero unspecced new work. A ten-year-old stable read service with no spec is fine. A new payment flow with no spec is not.

---

## The .logic file format

A `.logic` file is YAML front matter followed by five required markdown sections. It is the authoritative brief for an AI agent — machine-verifiable, not a comment.

```markdown
---
id: LS-2026-001
version: 1.0.0
domain: auth/login-redirect
requires: []
owner: J. Rivera (PA)
validated_against: 2026-06-09
---

## 1. TARGET_BOUNDARIES

runtime: TypeScript 5.4 / Next.js 15
data_stores: Clerk session API (read-only)
authorized_files:
  - src/middleware.ts
forbidden_files:
  - src/db/schema/core.ts
  - .env.production

## 2. INTENT_HAPPY_PATH

1. Unauthenticated user navigates to a protected route.
2. Middleware detects the missing session and redirects to /login.
3. User authenticates and is redirected back to the original destination.

## 3. EDGE_CRITICAL_UNHAPPY_PATH

1. returnUrl contains an external domain — strip it, redirect to /dashboard root.
2. Clerk session check throws a network error — redirect to /login without returnUrl.

## 4. REGRESSION_FENCE

- Existing session tokens must remain valid after this change.
- The /api/auth/logout endpoint must continue to clear cookies correctly.

## 5. CONTEXT_DEBT_NOTE

returnUrl stripping rule added after security review 2026-03-14.
Do not change this behaviour without a new security review.
```

All five sections are required. A spec missing any section will not lint. A spec that does not lint will not compile.

The `requires` field lists spec IDs this spec depends on. `/forge-new` surfaces related specs and asks which are prerequisites before writing the file.

When a spec with `requires` is compiled, the payload automatically includes a **DEPENDENCY CONTRACTS** block — the forbidden files and regression fence items from every required spec are inherited. The implementing agent sees the full constraint surface without reading the dependency specs separately.

```
── DEPENDENCY CONTRACTS ────────────────────────
  [LS-2026-001]  auth/login-redirect
  You MUST NOT touch (inherited from dependency):
    ✗ src/db/schema/core.ts
    ✗ .env.production
  You MUST NOT break (dependency fence):
    ! Existing authenticated sessions must remain valid after this change.
```

---

## Lint rules

| Rule | Severity | What it enforces |
|------|----------|-----------------|
| `required-sections` | error | All 5 sections must be present and non-empty |
| `forbidden-overlap` | error | No file in both `authorized_files` and `forbidden_files` |
| `unhappy-path-ratio` | error | EDGE steps must be ≥ 50% of INTENT steps |
| `ambiguous-language` | error | 17 banned phrases blocked in INTENT sections (e.g. "handle appropriately", "as needed", "ensure security") |
| `stale-validation` | warning | `validated_against` must be within 30 days of today |

Errors block compilation. Warnings do not — unless `--strict` is passed.

---

## The `/forge-new` authoring pipeline

`/forge-new` is the primary way to author a spec. It runs in your AI chat as an 11-phase guided conversation. You describe what you want to build once — the AI does the rest.

### What happens in the conversation

**Phase 1 — Intent capture.** One open question: "What do you want to build?" No forms, no structure yet.

**Phase 2 — Interpretation.** The AI calls `forge_search` with your description to surface related specs, then shows its reading — domain, runtime, data stores, security sensitivity. Related specs are shown as dependency candidates. You correct the interpretation before any sections are touched.

**Phase 3 — TARGET\_BOUNDARIES.** Before proposing files, the AI calls `forge_spec_list` and checks whether any proposed path is already authorized in another spec. Conflicts are surfaced before you confirm.

**Phase 4 — INTENT\_HAPPY\_PATH.** Steps are actor-prefixed and observable. Any step containing a banned phrase is rejected immediately with a specific rewrite offer — it will not proceed until the step is clean.

**Phase 5 — EDGE\_CRITICAL\_UNHAPPY\_PATH.** Edge cases are derived one-per-step from the confirmed happy path, each labelled with the step it mirrors. Generic templates are not used. Every external call, every write, every user input gets its corresponding failure case.

**Phases 6–8 — Regression fence, spec dependencies, context debt.** The AI surfaces related specs and asks which are prerequisites (`requires: []`). Security-sensitive domains cannot leave `CONTEXT_DEBT_NOTE` empty.

**Phase 9 — Adversarial self-check.** Two layers before writing:
- Structural compliance (authorized paths, banned phrases, step count, edge coverage)
- Agent perspective ("can I implement every step without a judgment call not stated here?")

**Phases 10–11 — RSC-AR hardening → compile → deliver.** The draft goes straight into RSC-AR Phase 2 (Adversary). After the Resolver converges, the hardened spec is saved, linted, validated, and compiled. The payload is delivered with a clear close: *"This session is complete. Open a new session. Paste the payload. That agent implements."*

### Invoking `/forge-new`

With an optional description:
```
/forge-new I want to add a password reset flow where users get an email with a one-time link
```

Without — the AI asks:
```
/forge-new
```

On platforms where `/forge-new` is not a slash command, paste the ingestion template from `.lsd/skills/forge-new.md`.

---

## The RSC-AR loop

RSC-AR is the adversarial hardening loop. It is automatically invoked at the end of `/forge-new` — you do not need to run it separately after authoring a spec that way.

For hardening an existing spec or running RSC-AR standalone:

**Phase 1 — Proposer.** Draft the `.logic` spec. No TODOs, no ambiguous language.

**Phase 2 — Adversary.** Invert persona. Attack every claim: authorization violations, hallucinated APIs, missing failure cases, invariant gaps. Every PASS verdict requires a one-line justification.

**Phase 3 — Resolver.** Apply every fix. Output the hardened file. Run `forge lint` — must exit 0 before delivery.

Each phase gates on confirmation. If Phase 3 introduces new assumptions, it re-enters Phase 2 (max 3 cycles).

---

## CLI reference

### `forge init`
Bootstrap LSD FORGE into the current project. Run once per project. Detects Node/Python/Go/Rust stacks, finds AI posture files, writes `.lsd/`, installs `/forge-new` shortcuts for detected AI tools, augments posture files, installs pre-commit hook.

### `forge new`
CLI fallback for authoring a spec without an AI chat. Starts with a plain-language description, interprets intent, and suggests content for each section with lettered/numbered options. Use `/forge-new` in chat when a connected AI is available — it produces a better spec.

```bash
forge new            # interactive terminal wizard
forge new --json     # JSON output (file path + lint findings)
```

### `forge lint [path]`
```bash
forge lint                         # Lint all .logic files in ./specs/
forge lint specs/                  # Lint a directory
forge lint specs/LS-2026-001.logic # Lint a single file
forge lint --strict                # Warnings become errors
forge lint --plain                 # No colour/icons — for CI logs
forge lint --json                  # Machine-readable output
```

### `forge compile <file>`
```bash
forge compile specs/LS-2026-001.logic           # Print agent payload to stdout
forge compile specs/LS-2026-001.logic --out p.txt
forge compile specs/LS-2026-001.logic --json
```
Lint runs first. Specs with errors do not compile.

### `forge status`
Registry health: whether `.lsd/` is initialised, how many specs exist, which registered services have no spec.

### `forge coverage [--threshold n]`
Spec coverage gap report. `--threshold 80` exits 1 if fewer than 80% of registered services have a spec — use as a CI gate.

### `forge validate`
Cross-spec collision detection across all `.logic` files. Finds:
- **forbidden-exposure** (error) — a file is in `authorized_files` for one spec and `forbidden_files` for another
- **domain-overlap** (warning) — two specs share the same domain
- **shared-authorization** (warning) — same file authorized across multiple specs

### `forge search <description>`
Find specs related to a plain-language description. Keyword scoring over domain, intent steps, authorized file paths, and data stores. No external dependencies.

```bash
forge search "add rate limiting to auth endpoints"
forge search "stripe payment webhook handling" --plain
forge search "user profile settings" --json
```

Useful before starting any implementation task — surface the relevant specs before touching code. The `forge_search` MCP tool provides the same capability directly in AI chat.

### `forge touched <file...>`
Show every spec that authorizes any of the given file paths. Groups results by spec, shows the matched files and the exact spec to re-validate.

```bash
forge touched src/middleware.ts
forge touched src/auth/ src/lib/session.ts
forge touched --staged           # reads staged files from git automatically
forge touched --staged --strict  # exits 1 if any specs are affected (for CI)
forge touched src/middleware.ts --json
```

The pre-commit hook runs `forge touched --staged` automatically. The `forge_touched` MCP tool provides the same capability in AI chat — an agent planning to modify files should call this first.

### `forge mcp`
Prints the exact config block to connect the MCP server to your AI client.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Lint or compile error; coverage below threshold |
| `2` | Usage error — bad command or path not found |

---

## MCP integration

LSD FORGE ships a zero-dependency MCP server (`forge-mcp`) that exposes all forge commands as tools any connected AI can call directly within a conversation.

### Available tools

| Tool | What it does |
|------|-------------|
| `forge_new` | Write a new `.logic` spec from structured answers. Accepts `requires` for spec dependencies. |
| `forge_lint` | Lint a `.logic` spec and return findings |
| `forge_compile` | Compile a spec into an agent payload. Resolves `requires` into inherited dependency contracts. |
| `forge_status` | Project integration health |
| `forge_coverage` | Spec coverage gap report |
| `forge_validate` | Cross-spec collision detection |
| `forge_spec_list` | List all specs with ID, domain, pass/fail, and `authorized_files` per spec |
| `forge_search` | Find specs related to a plain-language description. Call at the start of any implementation session to discover relevant specs before touching code. |
| `forge_touched` | Given a list of file paths, return every spec that authorizes any of them. Call before modifying files to understand which specs are affected and which regression fences apply. |

`forge_search` and `forge_touched` are the two tools an AI implementation agent should call before writing any code: search to understand what's already specced, touched to know what must not break.

### Setup

Run `forge mcp` to print the exact config for your client.

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "lsd-forge": {
      "command": "npx",
      "args": ["forge-mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

**VS Code** (`.vscode/mcp.json` in your project):

```json
{
  "servers": {
    "lsd-forge": {
      "type": "stdio",
      "command": "npx",
      "args": ["forge-mcp"]
    }
  }
}
```

---

## CI integration

```yaml
# .github/workflows/specs.yml
- name: Lint specs
  run: npx forge lint specs/ --plain --strict

- name: Coverage gate
  run: npx forge coverage --threshold 80 --plain
```

```yaml
# .gitlab-ci.yml
lint-specs:
  image: node:22-alpine
  script:
    - npm install --silent
    - forge lint specs/ --plain --strict
    - forge coverage --threshold 80 --plain
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

---

## Custom lint rules

Drop a `.js` file in `linter/rules/`. Auto-discovered on next run — no registration required.

```js
// linter/rules/my-rule.js
'use strict';
module.exports = {
  check(parsed) {
    const findings = [];
    // parsed.meta      — front matter fields
    // parsed.sections  — { TARGET_BOUNDARIES, INTENT_HAPPY_PATH, ... }
    // parsed.raw       — full file text
    if (/* your condition */) {
      findings.push({
        rule:     'my-rule',
        severity: 'error',   // or 'warning'
        section:  'INTENT_HAPPY_PATH',
        message:  'What went wrong.',
        fix:      'What to do to fix it.',
      });
    }
    return findings;
  },
};
```

---

## Roadmap

- [x] Linter — validate `.logic` files against structural rules
- [x] Compiler — transform a validated spec into a token-optimised agent payload
- [x] `forge init` — one-command bootstrap with AI auto-onboarding
- [x] RSC-AR loop — adversarial spec authoring skill kit
- [x] Collision engine — detect contradictions across specs in the same domain
- [x] MCP server — deliver compiled payloads directly to connected AI agents
- [x] `/forge-new` — chat-native guided authoring: intent → spec → RSC-AR → compile → payload
- [x] Multi-platform shortcuts — `/forge-new` installed for Claude Code, Copilot, Cursor, Windsurf at `forge init` time
- [x] Two-session model — authoring and implementation explicitly separated
- [x] Spec dependencies — `requires` field captured during authoring, cross-referenced against registry
- [x] Spec composition — compiled payload inherits dependency contracts (forbidden files + regression fence) from all required specs
- [x] Spec search — `forge search` / `forge_search` — keyword-ranked discovery of related specs from plain-language description
- [x] Spec mutation detection — `forge touched` / `forge_touched` — maps file paths to authorizing specs; pre-commit hook warns when staged code touches specced domains
- [ ] Platform adapters — ingest epics and stories from Jira, Linear, GitHub Issues

---

## Author

**Shannon Higgins** — Nagashi Limited, Carson City, NV

Documentation and guides: [authori.us/lsd-forge](https://authori.us/lsd-forge)

Questions, adoption guidance, or collaboration: [shannonhiggins@outlook.com](mailto:shannonhiggins@outlook.com)

Built at [Nagashi Limited](https://authori.us) — the holding company behind the Authori product suite.

---

## License

MIT
