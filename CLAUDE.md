# CLAUDE.md — LSD FORGE

## 1. Project Identity

LSD FORGE (Logic-Spec Development hardening engine) is a Node.js CLI tool that lints, compiles, and bootstraps `.logic` requirement files for AI coding agents. A `.logic` file is a structured specification document that an agent reads to understand what to build, what constraints apply, and what edge cases must be handled — without ambiguity. The engine enforces structural rules (required sections, unhappy-path coverage ratio, forbidden file overlaps, ambiguous language, stale validation dates), then compiles a validated spec into a clean agent payload string.

Primary language: JavaScript (CommonJS). Runtime: Node.js. No framework. One production dependency: `gray-matter` for YAML front matter parsing. Entry points (`package.json` `bin`): `bin/forge.js` is the `forge` CLI and `bin/forge-mcp.js` is the `forge-mcp` MCP server. Package manager: npm (CI runs `npm install`; a `pnpm-lock.yaml` is also tracked).

---

## 2. Repository Map

```
/
├── bin/
│   ├── forge.js                  # CLI entry (`forge`) — argument parsing, command dispatch, all console output
│   └── forge-mcp.js              # MCP stdio server (`forge-mcp`): JSON-RPC 2.0, Content-Length framing, no MCP SDK
├── linter/
│   ├── index.js                  # lintFile(), lintDir() — orchestrates rules, returns result objects
│   ├── parser.js                 # parse() — reads file, extracts gray-matter front matter + sections
│   ├── reporter.js               # formatFile(), formatSummary(), formatJSON() — output rendering
│   └── rules/
│       ├── required-sections.js  # ERROR: all 5 required sections must be present
│       ├── forbidden-overlap.js  # ERROR: no file in both authorized_files and forbidden_files
│       ├── unhappy-path-ratio.js # ERROR: EDGE steps must be ≥ ceil(happy steps / 2) — blocks compile
│       ├── ambiguous-language.js # ERROR: flags vague phrases in INTENT sections — blocks compile
│       └── stale-validation.js   # WARN: validated_against must be within 30 days of today
├── compiler/
│   ├── index.js                  # compile() — lint gate → extract → render → payload string
│   ├── extractor.js              # extract() — builds structured object from parsed sections; resolves `requires` into dependency contracts
│   └── template.js               # render() — formats structured data as agent payload text
├── init/
│   ├── index.js                  # init() — orchestrates all bootstrap steps; `--upgrade` refreshes without touching registry.json, and changes only `lsd_version` in config.json
│   ├── detect.js                 # detectStack(), detectTestCommand(), detectPostureFiles(), detectProjectName()
│   ├── scaffold.js               # writeLsdDir(), upgradeLsdDir(), upgradeHook(), scaffoldSpecs(), patchPackageJson(), installPreCommitHook(), installShortcuts()
│   └── augment.js                # augmentPostureFiles() — prepends LSD block to AI posture files
├── forge/
│   ├── status.js                 # status() — registry health, spec count, unspecced services
│   ├── coverage.js               # coverage() — gap report: services vs. existing specs
│   ├── validate.js               # validate() — cross-spec collision detection (forbidden-exposure, domain-overlap, shared-authorization)
│   ├── new.js                    # newSpec() — intake answers → .logic file + lint; generateId(), buildLogicFile()
│   ├── interpret.js              # interpret(description, config) — derives domain/files/steps from plain-language description
│   ├── search.js                 # search(): keyword-ranked spec discovery (`forge search`)
│   ├── touched.js                # touched(): maps file paths to the specs that authorize them (`forge touched`)
│   ├── version-check.js          # update notice for `forge status`: reads registry.npmjs.org/lsd-forge/latest, cached 24h in .lsd/version-check.json
│   └── mcp.js                    # TOOLS, callTool(), SERVER_INFO — one definition and handler per `forge_*` MCP tool (README "MCP integration" lists them)
├── assets/                       # Shipped in the npm package and copied into adopter projects by `forge init`
│   ├── onboarding.md             # AI automation trigger template (slots filled at init time)
│   ├── starter.logic             # Starter .logic file copied into specs/examples/ on init
│   ├── skills/                   # Every .md here is copied to .lsd/skills/
│   │   ├── forge-new.md          # Chat-native spec authoring: Phase 0 new/edit routing through Phase 11 compile and deliver
│   │   ├── forge-sync.md         # Spec drift detection and sync (`/forge sync`)
│   │   ├── rsc-ar.md             # RSC-AR spec authoring loop (universal, model-agnostic)
│   │   ├── spec-authoring.md     # .logic file format reference and lint rules
│   │   ├── self-refinement.md    # Self-correction, CoT verification, self-consistency patterns
│   │   ├── onboarding.md         # Discovery protocol — maps services, artifacts, AI posture
│   │   └── upgrade.md            # `forge init --upgrade` protocol
│   ├── commands/                 # forge.md (/forge router) + forge-new.md → .claude/commands/ (always installed)
│   ├── copilot-prompts/          # forge.prompt.md + forge-new.prompt.md → .github/prompts/
│   ├── cursor-rules/             # forge.mdc + forge-new.mdc → .cursor/rules/
│   └── windsurf-rules/           # forge.md + forge-new.md → .windsurf/rules/
├── skills/                       # Skills for working on this repo (see Skills Index)
├── .claude/
│   ├── commands/                 # /haiku, /routing-off, /routing-on, /forge-new
│   └── settings.json             # PreToolUse hook: lints specs/examples/ before a Bash command that starts with `git commit` (see Commit gates)
├── specs/
│   ├── examples/
│   │   ├── LS-2026-001-auth-login-redirect.logic   # Golden fixture: auth login redirect flow
│   │   └── LS-2026-042-auth-session-sync.logic     # Golden fixture: session sync flow
│   └── fixtures/                 # bad-<rule>.logic failure fixtures (one per rule) + edge-malformed-yaml.logic
├── README.md                     # Public readme (npm + GitLab)
├── TERMS.md                      # Terms of Service, shipped in the npm package
├── .gitlab-ci.yml                # lint-specs job (see Architecture Decisions)
├── .mcp.json                     # Project MCP config (GitLab server); holds no credentials
├── package.json
├── package-lock.json
├── pnpm-lock.yaml
└── .gitignore
```

**Never touch:** `node_modules/`, `.git/`. Never add production dependencies without discussion.

---

## 3. `.logic` File Format

A `.logic` file is a YAML front matter block followed by markdown sections.

### Front Matter (parsed by gray-matter)

| Field | Required | Format | Example |
|-------|----------|--------|---------|
| `id` | yes | `LS-YYYY-NNN` | `LS-2026-001` |
| `version` | yes | semver | `1.0.0` |
| `domain` | yes | slash-separated path | `auth/login-redirect` |
| `requires` | yes | array of spec IDs | `[]` or `['LS-2026-001']` |
| `owner` | yes | name and role | `J. Rivera (PA)` |
| `validated_against` | yes | ISO date | `2026-06-01` |

### Required Sections (all 5 must be present)

Sections are identified by `## N. SECTION_NAME` headings — uppercase, underscored:

| Section | Purpose |
|---------|---------|
| `TARGET_BOUNDARIES` | `runtime`, `data_stores`, `authorized_files`, `forbidden_files` — scopes what the agent may touch |
| `INTENT_HAPPY_PATH` | Numbered list of steps — the primary success flow |
| `EDGE_CRITICAL_UNHAPPY_PATH` | Numbered list of failure cases — must have ≥ 50% as many steps as happy path |
| `REGRESSION_FENCE` | Dependencies that must not break; preservation rules |
| `CONTEXT_DEBT_NOTE` | Rationale for non-obvious decisions (security choices, UX overrides, deferred work) |

---

## 4. Linting Rules System

Each rule is a CommonJS module in `linter/rules/` exporting `{ check(parsed) }`.

**Rule contract:**
```js
'use strict';

module.exports = {
  check(parsed) {
    const findings = [];
    // checks...
    findings.push({
      severity: 'error', // or 'warning'
      rule:     'my-rule',   // string — rule name goes in the finding, not the module export
      section:  'INTENT_HAPPY_PATH',
      message:  'What is wrong',
      fix:      'How to fix it',
    });
    return findings;
  },
};
```

Rules are auto-discovered from `linter/rules/*.js`, sorted alphabetically. Adding a file is enough — no registration required. Rules must never throw; they return findings. The engine calls `rule.check()` — it does NOT read a `name` property from the module.

**Severity:**
- `error` — blocks compilation; exits 1
- `warning` — reported but does not block; `--strict` promotes all warnings to errors

**Current rules:**

| File | Severity | What it checks |
|------|----------|----------------|
| `required-sections.js` | **error** | All 5 sections present and non-empty |
| `forbidden-overlap.js` | **error** | No file in both `authorized_files` and `forbidden_files` |
| `unhappy-path-ratio.js` | **error** | EDGE steps ≥ `ceil(happy steps / 2)` |
| `ambiguous-language.js` | **error** | No phrase from `AMBIGUOUS_PHRASES` in INTENT sections |
| `stale-validation.js` | warning | `validated_against` within 30 days of today |

`AMBIGUOUS_PHRASES`: `'handle appropriately'`, `'handle accordingly'`, `'as needed'`, `'as appropriate'`, `'process the request'`, `'deal with'`, `'manage the error'`, `'validate input'`, `'ensure security'`, `'handle the error'`, `'if necessary'`, `'when applicable'`, `'in some cases'`, `'etc.'`, `'and so on'`, `'various'`, `'somehow'`.

---

## 5. Compiler System

`compile(filePath, { skipLint })` → `{ ok, filePath, payload, structured, lintErrors, lintWarnings, error }`

Pipeline: **lint gate** → **extract** (`extractor.js`) → **render** (`template.js`) → payload string

The payload is designed to be pasted directly into an AI agent's context. `skipLint: true` is an escape hatch for testing only — never use it in CI.

---

## 6. Development Workflows

```bash
forge init                                          # Bootstrap LSD FORGE into a project (run once)
forge init --upgrade                                # Refresh skills, onboarding, shortcuts and hook; keeps registry.json, changes only lsd_version in config.json
forge new                                           # Interactive intake wizard — author a new .logic spec
forge status                                        # Registry health + spec count + gaps
forge coverage                                      # Gap report: services without specs
forge coverage --threshold 80                       # Fail CI if coverage < 80%
forge validate                                      # Cross-spec collision detection
forge search "<description>"                        # Specs related to a plain-language description
forge touched <file...>                             # Specs that authorize these files
forge touched --staged                              # Same, for staged git files (--strict exits 1 if any match)
forge mcp                                           # Print MCP client setup instructions
npm test                                          # Lint all golden specs — the golden-spec gate (CI does not run it; see section 8)
forge lint specs/examples/ --plain      # Same, explicit
forge lint specs/examples/ --strict     # Fail on warnings too
forge lint specs/examples/ --json       # Machine-readable output
forge lint <file>                       # Lint a single spec
forge compile <file>                    # Compile to stdout
forge compile <file> --out payload.txt  # Write payload to file
forge compile <file> --json             # Structured JSON output
forge --help                            # Full usage + exit codes
forge --version                         # Print version
```

Inside this repo, run each command as `node bin/forge.js <command>` (as `npm test` does). The bare `forge` command exists only where the package is installed.

**`forge lint <dir>` does not scan subfolders.** `lintDir()` reads only the `.logic` files directly inside the folder unless it is called with `{ recursive: true }`, which `forge coverage` (CLI and MCP) and the `forge_spec_list` MCP tool do. `forge lint` with no path therefore lints the top level of `./specs/` only, and in this repo that folder holds no `.logic` files directly.

**Adding a new lint rule:**
1. Create `linter/rules/<name>.js` exporting `{ check(parsed) }` (no `name` property; the engine does not read it)
2. Run `npm test` — rule is auto-loaded; verify it doesn't false-positive on golden specs
3. Create `specs/fixtures/bad-<name>.logic` — verify the rule fires on it
4. See `skills/new-rule.md` for the full workflow

**Adding a compiler feature:**
1. Edit `compiler/extractor.js` to extract the new field from `parsed.sections`
2. Edit `compiler/template.js` to render it into the payload
3. Run `node bin/forge.js compile specs/examples/LS-2026-001-auth-login-redirect.logic` to verify output

**Commit convention:** `type(scope): message` — e.g. `feat(rules): add required-meta-fields rule`, `fix(parser): handle missing front matter gracefully`, `docs(claude): update CLAUDE.md`.

**Commit gates:**
- `.claude/settings.json` holds a Claude Code PreToolUse hook. A Bash command that starts with `git commit` first runs `node bin/forge.js lint specs/examples/ --plain` and is blocked if that exits non-zero. A command that only contains `git commit` later (for example `cd x && git commit`) skips the hook, so run `npm test` yourself before committing. The hook changes into a hard-coded path for the owner's main checkout and a pinned Node binary, so from a git worktree it lints the main checkout, not the worktree.
- On the owner's Mac a global secret guard (gitleaks, in `~/.config/git/hooks`) scans every commit and then runs this repo's own `.git/hooks`. If it blocks a commit, stop and tell the owner. Never bypass it with `--no-verify`, `NAGASHI_SECRET_GUARD=off`, `-c core.hooksPath=...`, or by editing or removing the hook.
- `.claude/settings.local.json` is personal, git-ignored since 2026-11-21 (`9774c41`), and can hold credentials. Never commit it. Stage files by name and read `git status` before every commit.

**Keys:** this repo's code reads no environment variables and needs no development keys to lint, compile or test. Never write a real key, token or password into any tracked file, including `.mcp.json`. Where Nagashi keys live is documented in `security/README.md` of the owner's local authori-nagashi checkout, section "Key storage: one home per key".

---

## 7. Code Style & Conventions

**Module system:** CommonJS only — `require()` and `module.exports`. No ESM (`import`/`export`). No TypeScript.

**Files:** kebab-case (`required-sections.js`, `stale-validation.js`).

**Exports:** Named exports only — `module.exports = { check }`. Never `module.exports = function`. The `name` property is not read by the engine — put the rule name in each finding object as `rule: 'name'`.

**Functions:** camelCase. Module-level constants: SCREAMING_SNAKE_CASE.

**No console.log in library code.** `bin/forge.js` may use `console.log`/`console.error` freely. `linter/` and `compiler/` modules must not write to stdout/stderr — they return data. Violations fail the post-Haiku check Layer 3a.

**No external dependencies in rules.** Rules use only Node.js builtins and helpers exported from `linter/parser.js`. Keep the dependency count minimal.

**Error handling:** `try/catch` around all file I/O. Return structured error objects rather than throwing. Rules' `check()` must never throw.

**Comments:** Only when the WHY is non-obvious.

---

## 8. Architecture Decisions & Constraints

**Rules are auto-discovered.** `linter/index.js` reads all `.js` files from `linter/rules/` sorted alphabetically. No registration, no index file. Name rules with a numeric prefix (`01-`, `02-`) only if sort order matters for reporting.

**Rules are pure functions.** `check(parsed)` takes the parsed spec and returns findings — no file I/O, no shared state. This makes rules trivially testable.

**Compiler is lint-gated.** `compile()` runs lint first by default. `skipLint: true` is for testing only — never use in CI or pre-commit hooks.

**Exit codes are strict:**
- `0` = clean lint or successful compile
- `1` = lint error or compile error; also `forge coverage` below `--threshold`, `forge validate` with collision errors, and `forge touched --strict` when any spec is affected
- `2` = usage error (bad command, path not found)

Never exit 1 for a warning (unless `--strict`). Never exit 0 when there are errors.

**`--plain` is for CI.** All color/icon output is conditional on `!flags.plain`. The GitLab CI job (`lint-specs` in `.gitlab-ci.yml`, image `node:22-alpine`, on merge requests and the default branch) runs `node bin/forge.js lint specs/ --plain --strict`, and the `lint:ci` script passes the same flags. Because `forge lint` does not scan subfolders and every spec here lives in `specs/examples/` or `specs/fixtures/`, that job currently finds no `.logic` files and passes without linting anything. Changing it needs the owner's instruction (see AI Collaboration Rules).

**`gray-matter` is the only production dependency.** Do not add more without explicit approval. If a rule needs complex parsing, add a helper to `linter/parser.js` and export it.

**Section keys are case-sensitive.** `extractSections()` in `parser.js` matches uppercase headings only. `## 3. EDGE_CRITICAL_UNHAPPY_PATH` → key `EDGE_CRITICAL_UNHAPPY_PATH`. Lowercase headings in a `.logic` file will not be recognized as valid sections.

---

## 9. Testing Philosophy

**The test suite is `npm test`.** It runs `node bin/forge.js lint specs/examples/ --plain`. All golden specs in `specs/examples/` must pass clean before any commit.

**Fixture types:**
- `specs/examples/*.logic` — golden specs; this is `npm test`
- `specs/fixtures/bad-*.logic` — failure fixtures; verify rules fire; excluded from `npm test`
- `specs/fixtures/edge-*.logic` — parser edge cases

**Hardened honesty rules — non-negotiable:**
- A task cannot be marked complete until the actual terminal output from `npm test` is pasted in the conversation. No output = task is not done.
- Never write "lint passes" or "tests pass" without the terminal output to prove it.
- A task that includes writing tests is not done until the fixtures exist and `npm test` exits 0.

**What to test:**
- Every new rule: a golden spec that passes it AND a failure fixture that triggers it
- Parser: edge cases — missing front matter, malformed YAML, missing sections, lowercase headings
- Compiler: happy path output, lint-blocked compile, `--json` output shape

See `skills/testing.md` for the full procedure.

---

## 10. AI Collaboration Rules

**Proceed autonomously:** Adding a new lint rule following existing pattern, editing `reporter.js` formatting, fixing a parser edge case, writing fixture specs, updating `CLAUDE.md` and memory files, updating the Skills Index below.

**Ask before proceeding:** Changing the `.logic` file format (adding/removing required sections or meta fields), changing exit code semantics, adding a production dependency, renaming existing rule files (breaks CI configs), changing the compiled payload format (breaks downstream agent parsers).

**Never do without explicit instruction:** Removing an existing lint rule, modifying `.gitlab-ci.yml`, modifying `.gitignore`, bumping the package version.

**Ambiguous requirements:** Default to `'error'` severity for structural violations, `'warning'` for style/quality. Default to no new dependencies.

### Model Routing (token cost control)

Switch models in Claude Code CLI (terminal only) with `/model <id>`. Haiku costs ~20× less and runs 3-5× faster on mechanical tasks. **Note: `/model` does not work in the VSCode extension** — use `Agent({ model: 'haiku', ... })` instead. **`.claude/commands/` slash commands (`/haiku`, `/routing-off`, `/routing-on`) DO work in the VSCode extension.**

| Task type | Model |
|-----------|-------|
| Diagnosing an unknown parse or rule failure | **Sonnet** |
| Designing a novel rule with non-obvious cross-section logic | **Sonnet** |
| Refactoring parser or extractor (multi-file dependencies) | **Sonnet** |
| Writing a new rule following existing `check(parsed)` pattern | **Haiku** |
| Writing golden specs or failure fixtures | **Haiku** |
| N similar things (N rules, N specs, N fixtures) | **Haiku (parallel agents)** |
| Reporter formatting changes | **Haiku** |
| CLAUDE.md updates, memory writes, documentation | **Haiku** |
| Novel compiler output format design | **Sonnet** |

**Routing state — check FIRST on every task:**
Read `.claude/routing-state.json`. If it exists and `enabled: false` → routing is OFF, proceed on the model specified. Use `/routing-off` to disable, `/routing-on` to re-enable. **This file is gitignored** (session-local — committing it silently disables routing across all future sessions).

**Proactive Haiku detection:** Invoke `skills/haiku.md` at the start of every task. Check routing state (Step 0) → score the task → if Haiku-optimal, announce and delegate. For N-similar tasks, spawn N parallel Haiku agents in a single message.

---

## 11. Skills Index

| File | When to use |
|------|-------------|
| `skills/haiku.md` | **Apply on every task** — routing state check, Haiku detection, parallel agent spawning |
| `.claude/commands/routing-off.md` | Disable Haiku delegation — complex dev, unknown bugs, novel design |
| `.claude/commands/routing-on.md` | Re-enable delegation after routing-off |
| `.claude/commands/haiku.md` | `/haiku`: score one task for Haiku, delegate, then run the mandatory post-execution verification |
| `.claude/commands/forge-new.md` | `/forge-new`: a copy of `assets/commands/forge-new.md`. When you edit either file, copy it over the other and check with `cmp`. It reads `.lsd/`, which this repo does not have, so it only works in a project that has run `forge init` |
| `skills/new-rule.md` | Adding any new lint rule end-to-end |
| `skills/testing.md` | Writing fixture specs and verifying rule behavior |
| `skills/debugging.md` | Diagnosing rule failures, parser issues, CLI errors |
| `skills/self-refinement.md` | Non-trivial implementation, design decisions, architectural choices — self-correction, CoT verification, self-consistency |
| `assets/skills/forge-new.md` | **Chat-native spec authoring** — guided intake conversation for adopter projects; Phase 0 decides between a new spec and an edit to an existing one, then the AI interprets intent, builds sections, stress-tests, calls `forge_new` MCP tool |
| `assets/skills/forge-sync.md` | Spec drift detection and sync for adopter projects; run by `/forge sync` |
| `assets/skills/upgrade.md` | `forge init --upgrade` protocol shipped to adopter projects |
| `assets/skills/rsc-ar.md` | **Universal RSC-AR loop** — spec authoring for any project that has run `forge init`; Phase 3 outputs a `.logic` file |
| `assets/skills/spec-authoring.md` | `.logic` format reference — use when writing or reviewing specs for adopter projects |
| `assets/skills/self-refinement.md` | Model-agnostic self-refinement — the version shipped to adopter projects via `forge init` |
| `assets/skills/onboarding.md` | Discovery protocol shipped to adopter projects — maps services, artifacts, and posture on first session |
| `assets/commands/forge.md` | `/forge` router (status, new, lint, compile, coverage, validate, sync) installed into adopter projects; twins in `assets/copilot-prompts/`, `assets/cursor-rules/`, `assets/windsurf-rules/` |

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| `.logic` file | A structured requirement specification for an AI coding agent. Front matter + markdown sections. |
| Golden spec | A `.logic` file in `specs/examples/` that must always pass clean lint. The `npm test` gate. |
| Failure fixture | A `.logic` file in `specs/fixtures/bad-*.logic` that deliberately violates a rule. Used to verify the rule fires. |
| Edge fixture | A `.logic` file in `specs/fixtures/edge-*.logic` for parser edge cases. |
| Finding | An object returned by a rule's `check()`: `{ severity, rule, message, fix }`. |
| Lint gate | The step in `compile()` that runs all rules before extraction. Blocks compilation on errors. |
| Payload | The compiled output string — formatted for pasting into an AI agent's context. |
| Structured object | The intermediate representation produced by `extractor.js` — between parsed sections and the rendered payload. |
| `--strict` | Flag that promotes all warnings to errors. Used by the CI `lint-specs` job and the `lint:ci` script. |
| `--plain` | Flag that strips all ANSI color codes and icons from output. Required for CI log readability. |
| `--skip-lint` | Compiler flag that bypasses the lint gate. For advanced/testing use only — never in CI. |
| `REQUIRED_SECTIONS` | Array of 5 section name strings exported from `parser.js`. |
| `countNumberedSteps(text)` | Parser helper — counts `1. `, `2. `, etc. in a text block. |
| `countListItems(text)` | Parser helper — counts both numbered and bulleted list items. |
