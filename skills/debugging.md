---
name: debugging
description: Diagnosing and fixing bugs in lsd-engine — rule failures, parser issues, CLI errors, compiler output
triggers:
  - "bug"
  - "not working"
  - "error"
  - "broken"
  - "failing"
  - "debug"
  - "diagnose"
---

# Debugging

## When to use this skill
When a lint rule isn't firing (or fires incorrectly), the parser produces wrong output, the compiler generates bad payloads, or the CLI exits with the wrong code.

---

## Diagnostic approach by symptom

### Rule not firing when it should

1. Verify the rule file name ends in `.js` and lives in `linter/rules/` — the auto-loader skips anything without a `.js` extension.
2. Confirm the rule uses a named export object: `module.exports = { name, check }`. A rule that exports a bare function (`module.exports = function check(...)`) will be loaded but `check()` won't be called → silent skip.
3. Confirm `check(parsed)` returns an array — even on zero findings it must return `[]`. Returning `undefined` causes a crash in `lintFile`.
4. Log the parsed input to diagnose what the rule actually sees:
   ```bash
   node -e "const {parse}=require('./linter/parser');console.log(JSON.stringify(parse('path/to/spec.logic'),null,2))"
   ```
5. Section keys are exact uppercase heading names extracted by `extractSections()`. `## 3. EDGE_CRITICAL_UNHAPPY_PATH` → key `EDGE_CRITICAL_UNHAPPY_PATH`. Lowercase or differently-spelled headings won't match.
6. Check what rules are loaded:
   ```bash
   node -e "const path=require('path'),fs=require('fs');console.log(fs.readdirSync(path.join('linter','rules')).filter(f=>f.endsWith('.js')).sort())"
   ```

### Rule firing when it shouldn't (false positive)

1. Log the section content your rule sees:
   ```bash
   node -e "const {parse}=require('./linter/parser');const r=parse('path/to/spec.logic');console.log(r.sections['INTENT_HAPPY_PATH'])"
   ```
2. `extractSections()` calls `.trim()` — leading/trailing whitespace is stripped before your rule sees the content.
3. Check `countNumberedSteps` / `countListItems` helpers — test them directly with your content string:
   ```bash
   node -e "const {countNumberedSteps}=require('./linter/parser');console.log(countNumberedSteps('1. First step\n2. Second step'))"
   ```

### Parser returning `parseError: null` but sections are empty

The section heading regex requires uppercase: `## N. SECTION_NAME`. A heading like `## 2. intent_happy_path` (lowercase) won't be recognized. This is by design — `.logic` files must use uppercase section names.

### CLI exiting code 2 when you expect code 1

- Exit code 2 = usage error (bad path, unknown command)
- Exit code 1 = lint error (errors in spec)
- If you're seeing 2 when you expect 1, the file path doesn't exist or the command token is unrecognized:
  ```bash
  node -e "require('fs').statSync('path/to/spec.logic')"
  ```

### Compiler output looks wrong

1. Run with `--json` to inspect the structured intermediate:
   ```bash
   node bin/forge.js compile specs/examples/LS-2026-001-auth-login-redirect.logic --json
   ```
2. Check `compiler/extractor.js` — verify the field you expect is being extracted from `parsed.sections`.
3. Check `compiler/template.js` — verify the field is being rendered into the payload string.

### gray-matter front matter not parsing

gray-matter requires `---` delimiters on their own line with no trailing spaces. Common cause: Windows line endings (CRLF) can cause `---\r` which gray-matter doesn't recognize.

Fix: ensure the fixture file uses LF line endings. Check with:
```bash
node -e "const fs=require('fs');const raw=fs.readFileSync('path/to/spec.logic','utf8');console.log(raw.charCodeAt(3))"
# 10 = LF (correct), 13 = CR (CRLF problem)
```

### `npm test` exiting 1 after adding a new rule

Your new rule is false-positiving on the existing golden specs. Diagnose with:
```bash
node bin/forge.js lint specs/examples/ --plain
# Read the error message — it will name the rule and the file
```

Then check whether the golden spec actually violates the rule, or whether your rule's detection logic is too broad.

---

## Useful diagnostic commands

```bash
# Full parsed output (meta + sections):
node -e "const {parse}=require('./linter/parser');console.log(JSON.stringify(parse('specs/examples/LS-2026-001-auth-login-redirect.logic'),null,2))"

# Just section keys (to verify headings are recognized):
node -e "const {parse}=require('./linter/parser');console.log(Object.keys(parse('specs/examples/LS-2026-001-auth-login-redirect.logic').sections))"

# Compiled JSON (structured intermediate + payload):
node bin/forge.js compile specs/examples/LS-2026-001-auth-login-redirect.logic --json

# Which rules are loaded (and in what order):
node -e "const path=require('path'),fs=require('fs');console.log(fs.readdirSync(path.join('linter','rules')).filter(f=>f.endsWith('.js')).sort())"

# Run a single bad fixture to verify rule fires:
node bin/forge.js lint specs/fixtures/bad-required-sections.logic --plain; echo "Exit: $?"

# Check exit code explicitly:
node bin/forge.js lint specs/examples/ --plain; echo "Exit: $?"

# Test a specific rule check() in isolation:
node -e "const rule=require('./linter/rules/required-sections');const {parse}=require('./linter/parser');console.log(rule.check(parse('specs/examples/LS-2026-001-auth-login-redirect.logic')))"
```
