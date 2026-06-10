---
name: testing
description: Writing and maintaining fixture specs and test commands for lsd-engine rules, parser, and compiler
triggers:
  - "write a test"
  - "add tests for"
  - "test coverage"
  - "fixture"
  - "test the rule"
---

# Testing

## When to use this skill
When writing tests for any lint rule, parser behavior, or compiler output.

---

## Non-negotiable rules

**Rule 1 — Run `npm test` before every commit. No exceptions.**

`npm test` = `node bin/forge.js lint specs/examples/ --plain`. All golden specs in `specs/examples/` must pass clean. If they don't, do not commit.

**Rule 2 — Tests are part of "done."** Every new rule or parser change must ship with passing spec fixtures. A task is not complete until the fixtures exist and `npm test` exits 0.

**Rule 3 — Paste terminal output.** Never say "lint passes" or "tests pass" without pasting the actual `npm test` output. No output = task is not done.

**Rule 4 — Tests must catch the failure mode, not just the happy path.** A test that only verifies current behavior provides zero regression protection. Design each fixture to fail if the rule it exercises were removed.

---

## Testing strategy

lsd-engine has no test framework. All testing is done via the CLI using fixture `.logic` files:

| Fixture type | Location | Purpose |
|-------------|---------|---------|
| Golden specs | `specs/examples/*.logic` | Must pass clean lint — this IS `npm test` |
| Failure fixtures | `specs/fixtures/bad-*.logic` | Verify a rule fires for a specific violation |
| Edge fixtures | `specs/fixtures/edge-*.logic` | Parser edge cases (missing front matter, malformed YAML) |

---

## For every new lint rule — create two fixtures

### 1. A "should pass" golden spec

Add to `specs/examples/` following the naming convention `LS-YYYY-NNN-<slug>.logic`. Use existing examples as templates. Verify with `npm test` — must exit 0.

### 2. A "should fail" fixture

Create `specs/fixtures/bad-<rule-name>.logic`. Deliberately violate only that rule. Verify it fires:
```bash
node bin/forge.js lint specs/fixtures/bad-<rule-name>.logic --plain
# Expected: exit code 1, error/warning message mentioning the rule and a fix hint
```

Failure fixtures live in `specs/fixtures/` and are NOT run by `npm test` — they are verified manually or in CI with explicit paths.

---

## Verifying rule behavior

### Rule fires on bad fixture
```bash
node bin/forge.js lint specs/fixtures/bad-required-sections.logic --plain
# Must exit 1, must mention the rule name and fix
```

### Rule does NOT fire on golden specs
```bash
npm test
# Must exit 0 — new rule must not false-positive on existing clean specs
```

### Error message is useful
Check that the finding includes:
- `message` — clear, specific statement of what's wrong
- `fix` — actionable instruction for the spec author

### Exit code semantics
```bash
node bin/forge.js lint specs/examples/ --plain; echo "Exit: $?"
# 0 = clean, 1 = errors, 2 = usage error
```

---

## Testing the parser directly

```bash
# Inspect parsed output (meta + sections):
node -e "const {parse}=require('./linter/parser');console.log(JSON.stringify(parse('specs/examples/LS-2026-001-auth-login-redirect.logic'),null,2))"

# Test with a malformed file — should return parseError, not throw:
node -e "const {parse}=require('./linter/parser');const r=parse('specs/fixtures/edge-bad-yaml.logic');console.log(r.parseError)"
```

Parser `parse()` must never throw. It must return `{ parseError: string }` on any read or YAML failure.

---

## Testing the compiler

```bash
# Should compile (clean spec, no errors):
node bin/forge.js compile specs/examples/LS-2026-001-auth-login-redirect.logic
# Expected: payload printed to stdout, exit code 0

# Should be blocked (spec has lint errors):
node bin/forge.js compile specs/fixtures/bad-required-sections.logic
# Expected: "Spec has N lint error(s)" message, exit code 1

# JSON output for inspecting structured intermediate:
node bin/forge.js compile specs/examples/LS-2026-001-auth-login-redirect.logic --json
```

---

## Fixture naming conventions

- Golden specs: `specs/examples/LS-YYYY-NNN-<slug>.logic`
- Failure fixtures: `specs/fixtures/bad-<rule-name>.logic`
- Edge fixtures: `specs/fixtures/edge-<description>.logic`

---

## Hardened honesty rules

- Do not claim a rule "works correctly" without pasting the output from `node bin/forge.js lint <fixture> --plain`
- Do not claim `npm test` passes without pasting the terminal output
- A todo item cannot be marked complete until the output is shown in the conversation
