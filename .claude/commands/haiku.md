---
description: Score the current task for Haiku suitability, delegate via Agent(model haiku) if optimal, then run mandatory post-execution verification before committing.
---

# /haiku — Haiku Delegation Gate

## Step 1 — Classify

### ✅ Delegate to Haiku (ALL must be true)
- Describable in ≤1 sentence with no ambiguity
- Pattern already exists in codebase — apply, don't design
- No diagnosis required — root cause known
- No new architecture decisions
- No security-sensitive files (`.gitignore`, `.gitlab-ci.yml`, `.env*`)
- Examples: add a new lint rule following existing pattern, write N fixture specs from template, update reporter formatting, docs/memory updates

### ❌ Stay on Sonnet (ANY of these = stay)
- Root cause unknown / diagnosis needed
- Novel rule design with no existing pattern
- Non-obvious multi-file dependencies (e.g. rule contract change that affects extractor + template)
- Ambiguous task ("improve it", "clean it up")
- Haiku failed twice — escalate, never loop

## Step 2 — Delegate

Spawn `Agent({ model: "haiku", prompt: "..." })` with a fully self-contained briefing including:
1. Exact task description with file paths
2. Numbered steps — ALL steps must be listed explicitly
3. Files to read first (primary + reference pattern file)
4. Codebase conventions block (CommonJS, named exports, no console.log in lib, no ESM, no new deps)
5. DO NOT list (files outside task scope, do not add dependencies)
6. Required return format — Haiku must paste actual command output, not claims

**Required return format in every Haiku briefing:**
```
RETURN FORMAT (fill every field, paste actual output — do not claim pass without running):
Step completion: [each step: "done" or "skipped: reason"]
Files changed: [git diff --name-only output]
Diff line count: [git diff --stat output]
Lint output: [node bin/forge.js lint specs/examples/ --plain — paste actual output]
New symbols: [new function/const names introduced]
Banned pattern check: [grep -n "console\.log" <lib-file> output (should be empty for non-bin files)]
```

## Step 3 — Post-execution verification (MANDATORY before committing)

Never trust Haiku's summary. Run these checks regardless of what Haiku reports.

| Layer | Command | Pass condition |
|-------|---------|----------------|
| 1. Scope | `git diff --name-only` | Only expected files |
| 1. Size | `git diff --stat` | Line count proportional to task |
| 2. Lint gate | `node bin/forge.js lint specs/examples/ --plain` | Exit code 0 |
| 3. console.log | `grep -n "console\.log" <lib-file>` | Empty (for non-bin files) |
| 3. ESM | `grep -n "^import " <file>` | Empty |
| 3. default export | `grep -n "^module\.exports\s*=\s*function" <file>` | Empty (named exports only) |
| 4. Symbols | `grep -n "[key-symbol]" [file]` | All briefing symbols present |
| 5. Section read | Read changed section directly | Values correct, no dead code |
| 6. Completeness | Compare briefing steps vs grep results | All N steps implemented |

**On failure:** Fix directly on Sonnet OR send back to Haiku with exact grep output (not a description). One retry max — escalate to Sonnet on second failure.

## Step 4 — Only then: commit
