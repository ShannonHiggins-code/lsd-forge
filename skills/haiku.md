---
name: haiku
description: Detect whether the current task is Haiku-optimal and delegate via Agent(model haiku) if so. Apply proactively on every task.
triggers:
  - "haiku"
  - "delegate"
  - "use haiku"
  - "switch to haiku"
---

# Haiku Delegation Gate

## Step 0 — Routing state check (FIRST — before any detection)

Check if `.claude/routing-state.json` exists:
```bash
cat .claude/routing-state.json 2>/dev/null
```
If it exists and `"enabled": false` → **routing is OFF**. Announce:
> "AI Routing is OFF — running on [model from state file]. Type `/routing-on` to re-enable delegation."

Then proceed on the specified model (sonnet or opus) for all work. Skip the rest of this skill.

---

## Step 1 — Detection scoring

### ✅ Haiku-optimal (delegate if ALL true)
| Signal | Examples |
|--------|---------|
| One-sentence description, no ambiguity | "Add a lint rule that checks for missing `id` meta field" |
| Pattern already exists in codebase | New rule following the `check(parsed)` contract in `linter/rules/` |
| No diagnosis needed — root cause known | Known bug with known fix |
| No architecture decisions | Following established rule/extractor/template pattern |
| No security-sensitive files | Not touching `.gitignore`, `.gitlab-ci.yml`, `.env*` |
| Repetitive across N files | N example specs, N fixture files, N similar rules |

### ❌ Keep on Sonnet (ANY of these = stay)
| Signal | Examples |
|--------|---------|
| Root cause unknown / diagnosis needed | "Why does this spec fail to parse?" |
| Novel rule design with no existing pattern | New section type, new meta schema |
| Non-obvious multi-file dependencies | Rule contract change that affects extractor + template |
| Ambiguous task | "Improve the output", "clean it up" |
| Haiku failed twice | Escalate immediately, never loop |

---

## Step 2 — Parallel vs sequential decision

**If task is N-similar (N rules, N specs, N fixture files):**
Spawn N Haiku agents simultaneously in a single message — one per item.
Each agent gets an independent self-contained briefing for its specific item.
All run in parallel; collect all results before running verification.

**If task is single file / single concern:** one sequential Haiku agent.

---

## Step 3 — Agent briefing template

**Ordering rule:** CONVENTIONS block first, byte-for-byte identical every call (maximises implicit prefix caching). Task-specific content follows.

**Step format rule:** Every numbered step must end with `→ verify: [exact grep command]` naming the symbol that proves the step was completed.

```
You are executing a well-defined task on lsd-forge (Node.js CLI, CommonJS, no framework — a lint/compile tool for .logic requirement files for AI coding agents).

CONVENTIONS (read before anything else):
- CommonJS only — require() and module.exports, never import/export or ESM syntax
- No TypeScript — plain JavaScript
- kebab-case file names
- Named exports only — module.exports = { check } — never module.exports = function, never add a name property
- Rules in linter/rules/ export { check(parsed) } only — check() returns findings array [], never throws
- Finding shape: { severity: 'error'|'warning', rule: string, message: string, fix: string }
- Library modules (linter/, compiler/) must NOT write to stdout/stderr — return data only
- No console.log in library code (bin/forge.js may use it freely; nothing else)
- No new external dependencies — use only Node.js builtins and linter/parser.js helpers
- Error handling: try/catch around file I/O, return structured error objects, don't throw from check()
- Comments: only when WHY is non-obvious

TASK:
[exact description — what to change, in which files, why]

FILES TO READ FIRST (in order):
1. [primary file to edit]
2. [reference file showing the pattern to follow]

NUMBERED STEPS (complete ALL — do not skip):
1. [step description] → verify: grep -n "[symbol-that-proves-this-step]" [file]
2. [step description] → verify: grep -n "[symbol-that-proves-this-step]" [file]

DO NOT edit files not listed above. Do not add new dependencies.

RETURN FORMAT (paste actual command output — do not claim pass without running):
Step completion: [each step: "done — grep confirms [symbol] at line N" or "skipped: reason"]
Files changed: [paste: git diff --name-only]
Diff stat: [paste: git diff --stat]
Lint output: [paste: node bin/forge.js lint specs/examples/ --plain]
New symbols: [comma-separated list of new function/const/module.exports names]
Banned patterns: [paste: grep -n "console\.log" [lib-file] (empty = pass) && grep -n "^import " [file] (empty = pass)]
```

---

## Step 4 — Post-execution verification (MANDATORY — run after every Haiku return)

Never trust Haiku's summary. Run Layers 1–4 minimum on every task.
Run verification commands in parallel where independent.

| Layer | Command | Pass condition |
|-------|---------|----------------|
| 1a. Scope | `git diff --name-only` | Only expected files changed |
| 1b. Size | `git diff --stat` | Line count proportional to task |
| 2. Lint gate | `node bin/forge.js lint specs/examples/ --plain` | Exit code 0, no errors |
| 3a. console.log | `grep -n "console\.log" [lib-file]` | Empty (for non-bin files) |
| 3b. ESM | `grep -n "^import " [file]` | Empty |
| 3c. default export | `grep -n "^module\.exports\s*=" [file]` | Must be `{ ... }` object, not a function |
| 4. Symbols | `grep -n "[verify: symbol from each step]" [file]` | All step symbols present |
| 5. Section read | Read changed sections directly | Values correct, wired correctly, no dead code |
| 6. Completeness | Each step's `→ verify:` grep returns a hit | All N steps implemented — objective, not judgment |

**On failure:** Fix on Sonnet OR send back to Haiku with exact grep output. One retry max — escalate to Sonnet on second failure. Log the misclassification in memory so the same task type isn't sent to Haiku again.

---

## Proactive application rule

Invoke this skill explicitly at the start of EVERY coding task — do not rely on memory of these heuristics. Check routing state first (Step 0). If Haiku-optimal: announce and delegate. If N-similar: spawn parallel agents. Never silently proceed on Sonnet for mechanical work.
