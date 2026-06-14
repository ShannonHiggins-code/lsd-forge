---
description: LSD FORGE entry point — route to spec authoring, lint, compile, status, coverage, or validate from one command.
---

# /forge — LSD FORGE

Read `.lsd/config.json` now.

$ARGUMENTS

Route on the arguments above:

- **No arguments** — run `npx forge status --plain`, summarize the project's spec health in plain language, and list the available actions: `new`, `lint`, `compile`, `status`, `coverage`, `validate`, `sync`.
- **`new`, a plain-language description of something to build, or a plain-language description of a change to something existing** — read `.lsd/skills/forge-new.md`. Phase 0 of that skill automatically decides whether this is a new spec or an edit to an existing one — do not pre-judge it. This session specs and hardens only; a second session implements.
- **`lint [path]`** — run `npx forge lint <path or specs/> --plain --strict` and report findings with fixes.
- **`compile <file>`** — run `npx forge compile <file>` and return the agent payload.
- **`status`** — run `npx forge status --plain` and summarize.
- **`coverage [--threshold n]`** — run `npx forge coverage --plain` (with threshold if given) and summarize the gap report.
- **`validate`** — run `npx forge validate --plain` and report any cross-spec collisions.
- **`sync [scope]`** — read `.lsd/skills/forge-sync.md` and run the drift detection and sync flow. Scope may be `"all"`, `"drifted"`, or one or more spec IDs (e.g. `sync LS-2026-001`). If no scope is given, default to `"drifted"` — check only specs whose authorized files have changed since `validated_against`.

For any CLI invocation, paste the actual terminal output before your summary — never report results without it.
