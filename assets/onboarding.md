---
lsd_version: "{{LSD_VERSION}}"
trigger: onboard
auto_execute: true
---

# LSD Onboarding Trigger — {{PROJECT_NAME}}

You are reading the Logic-Spec Development (LSD) automation trigger for this project.
Execute the DISCOVERY PROTOCOL below before starting any task.

## What LSD Is

LSD is a spec-first methodology. Before writing code, you author a `.logic` file that defines
intent, edge cases, and authorization boundaries in a machine-verifiable format. The `lsd` CLI
lints specs for completeness and compiles them into an agent payload you execute against.

Every task in this project follows this sequence:
```
Author .logic spec  →  lsd lint  →  lsd compile  →  execute payload
```

---

## DISCOVER — read these assets first

1. `.lsd/config.json` — authorization map, stack config, verification oracle
2. `.lsd/skills/` — read all skill files before starting any task
3. `specs/examples/` — reference specs; the ground truth for correct `.logic` output
4. Existing AI posture files: {{POSTURE_FILES}}

---

## DISCOVER — run these commands to orient yourself

```
forge --version
forge lint specs/
```

Report the output of both commands before proceeding.

---

## DISCOVERY PROTOCOL — run automatically on first session

Your registry (`.lsd/registry.json`) is empty until you populate it. Execute these steps now.

**Step 1 — Map services**
- Read `.env.example` or `.env.sample` → find DATABASE_URL, external API keys, auth providers
- Read `prisma/schema.prisma` or `schema.sql` if present → extract data models
- Read `package.json` dependencies → identify connected services (payments, email, auth, etc.)
- Read `docker-compose.yml` if present → map service topology

**Step 2 — Map artifacts**
- List all files in `specs/` → catalog existing `.logic` specs
- Read `package.json` scripts → understand build/test/deploy pipeline
- Identify build output directories

**Step 3 — Map AI posture**
- Read every file listed under `posture` in `.lsd/config.json`
- Note any convention in those files that conflicts with an LSD rule — do not resolve silently

**Step 4 — Write registry**
Populate `.lsd/registry.json` with your findings.
See `.lsd/skills/onboarding.md` for the full registry schema and guidance.

**Step 5 — Report and confirm**
Show the discovered map to the user in plain language.
Ask: "Is anything missing or out of bounds before I start?"

---

## AUTHORIZE — boundaries

Read `.lsd/config.json` → `authorized` and `forbidden`.

- Do NOT write to any `forbidden` path for any reason.
- Do NOT add a dependency not in `authorized_deps` without asking first.
- If a spec's `authorized_files` lists a path not in `config.authorized` → surface the conflict.

---

## VERIFY — correctness oracle

Run `{{VERIFY_COMMAND}}` to confirm your work is correct.
Never report task completion without pasting the actual terminal output.

---

## SKILL ENTRY POINT

Load skills from `.lsd/skills/` before starting any task:

| Skill | When to use |
|-------|-------------|
| `forge-new.md` | **Author a new spec in chat** — guided intake conversation; interprets intent, builds each section, stress-tests before writing |
| `rsc-ar.md` | Harden an existing draft — Proposer → Adversary → Resolver loop |
| `spec-authoring.md` | `.logic` format reference and lint rules |
| `self-refinement.md` | Self-correction, chain-of-thought verification, self-consistency for decisions |
| `onboarding.md` | Full discovery protocol — run on first session or when registry is stale |

---

## INTEGRATE — existing project conventions

LSD is additive. It does not override existing project conventions.
If any instruction in `.lsd/` conflicts with a posture file → surface the conflict to the user.
Do not resolve convention conflicts silently.
