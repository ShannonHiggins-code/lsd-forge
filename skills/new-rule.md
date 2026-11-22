---
name: new-rule
description: End-to-end workflow for adding a new lint rule to lsd-engine
triggers:
  - "add a rule"
  - "new rule"
  - "add lint rule"
  - "add a check"
  - "add validation"
---

# Adding a New Lint Rule

## When to use this skill
Adding any new validation to the linter — from simple missing-field checks to complex cross-section analysis.

---

## Decision: error or warning?

| Use `'error'` | Use `'warning'` |
|---------------|-----------------|
| Structural violation — spec is unusable | Style or best-practice concern |
| Missing required data (section, field) | Potentially problematic pattern |
| `authorized_files` / `forbidden_files` conflict | Stale or ambiguous content |
| Would make the compiler fail or produce garbage | Deserves attention but not a blocker |

Default: prefer `'error'` for structural issues, `'warning'` for style/quality issues. When in doubt, ask.

---

## Step-by-step

### 1. Create the rule file

```
linter/rules/<name>.js
```

Use descriptive kebab-case. If order matters relative to other rules, prefix with a number (`01-required-sections.js`). Rules sort alphabetically — later rules run after earlier ones.

```js
'use strict';

// Rules export { check } only — the engine does NOT read a `name` property.
// Put the rule name in each finding object as rule: 'my-rule-name'.
module.exports = {
  check(parsed) {
    const findings = [];
    const { meta, sections } = parsed;

    // Example: check a meta field
    if (!meta.id) {
      findings.push({
        severity: 'error',
        rule:     'my-rule-name',
        section:  'front-matter',
        message:  'Missing required meta field: id',
        fix:      'Add "id: LS-YYYY-NNN" to the front matter',
      });
    }

    // Example: check section content
    const section = sections['INTENT_HAPPY_PATH'];
    if (section && /\bhandle appropriately\b/i.test(section)) {
      findings.push({
        severity: 'error',
        rule:     'my-rule-name',
        section:  'INTENT_HAPPY_PATH',
        message:  'Ambiguous phrase found: "handle appropriately"',
        fix:      'Replace with a specific observable outcome',
      });
    }

    return findings;
  },
};
```

### 2. Verify the rule is auto-loaded

```bash
node -e "const path=require('path'),fs=require('fs');console.log(fs.readdirSync(path.join('linter','rules')).filter(f=>f.endsWith('.js')).sort())"
```

Your new file must appear in the list.

### 3. Verify it doesn't break existing golden specs

```bash
npm test
# Must exit 0 — new rule must not false-positive on clean examples
```

If it does fire on a golden spec, either fix the rule's detection logic or update the golden spec to comply.

### 4. Create a failure fixture

```
specs/fixtures/bad-<rule-name>.logic
```

Deliberately violate only this rule. Verify it fires:
```bash
node bin/forge.js lint specs/fixtures/bad-<rule-name>.logic --plain
# Expected: error/warning with your rule's name and fix hint
# Exit code 1 for an error rule; a warning rule exits 0 unless you add --strict
echo "Exit: $?"
```

### 5. Run the full test suite and paste output

```bash
npm test
# Must exit 0 — paste actual output in the conversation
```

---

## Available helpers from parser.js

```js
const { parse, countNumberedSteps, countListItems } = require('../linter/parser');
```

| Helper | What it counts |
|--------|---------------|
| `countNumberedSteps(text)` | Lines matching `^\s*\d+\.\s+\S` — numbered list items |
| `countListItems(text)` | Lines matching `^\s*[-*\d]+[.)]\s+\S` — bullets or numbered |

In `check(parsed)`:
- `parsed.meta` — gray-matter front matter object (strings, arrays, dates)
- `parsed.sections['SECTION_NAME']` — trimmed content string for each `## SECTION_NAME` heading
- `parsed.raw` — full raw file content (for regex matching across the entire file)
- `parsed.filePath` — absolute path to the `.logic` file

---

## What NOT to do

- Do not write to stdout/stderr in the rule — return findings only
- Do not `require` external packages — use only Node.js builtins and `linter/parser.js`
- Do not `throw` — catch exceptions inside `check()` and push an error finding instead
- Do not use default exports — always `module.exports = { check }` (no `name` property needed)
- Do not mutate `parsed` — treat it as read-only

---

## Reference: existing rules

| File | Severity | What it checks |
|------|----------|----------------|
| `required-sections.js` | error | All 5 required sections present |
| `forbidden-overlap.js` | error | No file in both `authorized_files` and `forbidden_files` |
| `unhappy-path-ratio.js` | error | EDGE steps ≥ `ceil(happy path steps / 2)` |
| `ambiguous-language.js` | error | No phrase from its exported `AMBIGUOUS_PHRASES` list (e.g. "handle appropriately", "as needed"; CLAUDE.md section 4 lists them all) in `INTENT_HAPPY_PATH` or `EDGE_CRITICAL_UNHAPPY_PATH` |
| `stale-validation.js` | warning | `validated_against` within `STALE_DAYS` (30) days of today |
