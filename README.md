# LSD FORGE

**Spec-first AI-assisted development. Install once — any AI you connect self-onboards, maps your project, and operates within defined authorization boundaries.**

```bash
npm install lsd-forge --save-dev
npx forge init
```

---

## What it does

LSD FORGE enforces a structured workflow between engineers and AI coding agents:

1. **Before an agent writes code, it authors a spec.** A `.logic` file defines exact intent, authorization boundaries, failure cases, and what must not break — verified by machine before any implementation begins.
2. **Every spec is adversarially hardened.** The built-in RSC-AR loop runs a three-phase Proposer → Adversary → Resolver cycle. The Adversary stress-tests the spec to breaking. The Resolver merges the surviving changes.
3. **Lint and compile gate the agent.** A spec that doesn't pass `forge lint` cannot be compiled. A spec that doesn't compile cannot be delivered to an agent. The pipeline is enforced, not suggested.
4. **Connected AI models self-onboard.** After `forge init`, any AI working in the project reads `.lsd/onboarding.md`, maps all services and artifacts, loads authorization boundaries, and reports its findings — before touching anything.

---

## Quick start

```bash
# 1. Install
npm install lsd-forge --save-dev

# 2. Bootstrap — run once per project
npx forge init

# 3. Check integration health
forge status

# 4. Author a spec using the RSC-AR loop (see .lsd/skills/rsc-ar.md)
# then lint it
forge lint specs/my-spec.logic

# 5. Compile to an agent payload
forge compile specs/my-spec.logic
```

---

## What `forge init` installs

`forge init` detects your stack, finds your existing AI posture files, and wires everything together in one command.

```
.lsd/
├── onboarding.md       AI automation trigger — any model reads this on first session and self-onboards
├── config.json         Authorization map: stack, verify oracle, authorized/forbidden paths
├── registry.json       Resource registry — AI populates on first session (services, artifacts, posture)
└── skills/
    ├── rsc-ar.md           The FORGE authoring loop (Proposer → Adversary → Resolver)
    ├── spec-authoring.md   .logic format reference and lint rules
    ├── self-refinement.md  Self-correction and CoT verification patterns
    └── onboarding.md       Discovery protocol — maps services and artifacts
```

Also installs:
- **Pre-commit hook** — staged `.logic` files are linted with `--strict` before every commit
- **`lint:specs` script** in `package.json`
- **LSD block** prepended to any AI posture files found (`CLAUDE.md`, `.cursor/rules`, `.github/copilot-instructions.md`, and others)

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

## The RSC-AR loop

The universal authoring skill is in `.lsd/skills/rsc-ar.md` after `forge init`. It runs three phases that any connected AI model can execute:

**Phase 1 — Proposer.** Draft the `.logic` spec. No TODOs, no placeholders, no ambiguous language.

**Phase 2 — Adversary.** Invert persona. Attack every claim in the draft: authorization violations, hallucinated APIs, missing failure cases, invariant gaps. Every PASS verdict must include a one-line justification — an unjustified clean verdict triggers a Phase 2 repeat.

**Phase 3 — Resolver.** Apply every fix. Output the hardened `.logic` file. Run `forge lint`. It must exit 0 before delivery.

Each phase gates on confirmation — you see the draft before the Adversary attacks it, and you see the attack before the Resolver converges. Phases do not bleed. If Phase 3 introduces new assumptions, it re-enters Phase 2 (max 3 cycles).

---

## CLI reference

### `forge init`
Bootstrap LSD FORGE into the current project. Run once. Detects Node/Python/Go/Rust stacks, finds AI posture files, writes `.lsd/`, augments posture files, installs pre-commit hook.

### `forge new`
Interactive wizard that authors a new `.logic` spec through a structured questionnaire. Asks for domain, owner, runtime, data stores, authorized files, forbidden files, happy path steps, edge cases, regression fence, and context note. Auto-assigns an ID, writes the file, and runs lint.

```bash
forge new            # interactive terminal wizard
forge new --json     # wizard output as JSON (file path + lint findings)
```

The same intake is available as the `forge_new` MCP tool for AI-driven authoring — the connected AI asks the questions in conversation, then calls the tool with the collected answers.

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

LSD FORGE ships a zero-dependency MCP server (`forge-mcp`) that exposes all forge commands as tools any connected AI can call directly within a conversation — no copy-paste required.

```
Author spec via RSC-AR loop  →  forge_compile  →  agent payload in-session  →  agent executes
```

### Available tools

| Tool | What it does |
|------|-------------|
| `forge_new` | Collect answers from the user and create a new `.logic` spec |
| `forge_lint` | Lint a `.logic` spec and return findings |
| `forge_compile` | Compile a spec and return the agent payload string |
| `forge_status` | Project integration health |
| `forge_coverage` | Spec coverage gap report |
| `forge_validate` | Cross-spec collision detection |
| `forge_spec_list` | List all specs with ID, domain, and pass/fail |

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
- [ ] Platform adapters — ingest epics and stories from Jira, Linear, GitHub Issues
- [ ] PA intake form — guided questionnaire that compiles to a `.logic` file

---

## License

MIT
