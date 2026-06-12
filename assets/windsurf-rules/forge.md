---
trigger: user_initiated
description: LSD FORGE entry point — route to spec authoring, lint, compile, status, coverage, or validate from one command.
---

# forge — LSD FORGE

When the user says "forge" with no other context, or asks for forge with a subcommand:

Read `.lsd/config.json`, then route:

- **No arguments** — run `npx forge status --plain`, summarize spec health, and list the available actions: `new`, `lint`, `compile`, `status`, `coverage`, `validate`.
- **`new` or a plain-language description of something to build** — read `.lsd/skills/forge-new.md` and follow the forge-new flow: this session specs and hardens only; a second session implements.
- **`lint [path]`** — run `npx forge lint <path or specs/> --plain --strict` and report findings with fixes.
- **`compile <file>`** — run `npx forge compile <file>` and return the agent payload.
- **`status`** — run `npx forge status --plain` and summarize.
- **`coverage [--threshold n]`** — run `npx forge coverage --plain` and summarize the gap report.
- **`validate`** — run `npx forge validate --plain` and report any cross-spec collisions.

For any CLI invocation, paste the actual terminal output before your summary — never report results without it.
