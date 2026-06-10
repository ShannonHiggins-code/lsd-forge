# Skill: Onboarding — Bootstrapping LSD into a Project

Use this skill when you are the first AI model working in a project that has LSD installed
but whose `.lsd/registry.json` is empty (discovered_at is null). This is the discovery
and context-building protocol.

---

## When to run this skill

- First session in a project after `lsd init` was run
- `registry.json` → `discovered_at` is null
- User says "orient yourself" or "map the project"
- You cannot confidently answer "what services does this project use?"

---

## Step 1 — Verify LSD installation

```bash
forge --version
forge lint specs/
```

If `lsd` is not found: the package is not installed. Ask the user to run `npm install lsd-forge --save-dev && npx forge init`.

If `specs/` has lint errors: report them to the user before continuing. Do not start new work on a broken spec baseline.

---

## Step 2 — Read project config and posture

Read these files in order:

1. `.lsd/config.json` — authorization map, stack, verify command
2. Every file listed in `config.posture` — absorb existing project conventions
3. `specs/examples/` — understand what's already been specced

Note any conflicts between posture file conventions and LSD rules. Do not resolve them silently — surface them to the user.

---

## Step 3 — Map services

Search for service connection patterns. For each type, record: `type`, `config file`, and whether it appears in `config.authorized`.

**Databases:**
- Look for `DATABASE_URL`, `POSTGRES_URL`, `MONGODB_URI` in `.env.example` or `.env.sample`
- Look for `prisma/schema.prisma`, `schema.sql`, `ormconfig.*`

**Auth providers:**
- Look for `NEXTAUTH_`, `AUTH0_`, `CLERK_`, `SUPABASE_` env var prefixes
- Look for `auth.config.*`, `passport.*`, `middleware/auth.*`

**External APIs:**
- Look for `_API_KEY`, `_SECRET`, `_TOKEN` suffixes in env files
- Grep `package.json` deps for `stripe`, `sendgrid`, `twilio`, `resend`, `postmark`

**Queues / caches:**
- Look for `REDIS_URL`, `RABBITMQ_URL`, `KAFKA_BROKERS`

**Deployment / CI:**
- Look for `.github/workflows/`, `vercel.json`, `fly.toml`, `.railway/`, `Dockerfile`

---

## Step 4 — Map artifacts

```bash
forge lint specs/ --json
```

Parse the JSON output to get the list of existing specs. Note which ones pass and which have errors.

Also identify:
- Build output directories (`dist/`, `build/`, `.next/`, `out/`)
- Migration directories (`prisma/migrations/`, `db/migrations/`)
- Generated files (anything in `.gitignore` that's auto-generated)

---

## Step 5 — Write registry

Populate `.lsd/registry.json` with your findings. Use this structure:

```json
{
  "discovered_at": "<ISO timestamp>",
  "services": {
    "<service-key>": {
      "type": "<type>",
      "config": "<path to config file>",
      "authorized": <true|false>
    }
  },
  "artifacts": {
    "<artifact-key>": "<path>"
  },
  "ai_posture": [
    { "tool": "<tool name>", "file": "<path>" }
  ],
  "verify_command": "<from config.json>",
  "spec_count": <number>,
  "stale_specs": []
}
```

Set `authorized: false` for any service that handles payments, PII, secrets, or is listed in `config.forbidden`. The AI should not touch these without explicit user instruction.

---

## Step 6 — Surface and confirm

Report the discovered map to the user in plain language:

```
I've completed the discovery protocol. Here's what I found:

Services: [list with authorized/unauthorized status]
Existing specs: [count, any with errors]
AI posture files read: [list]
Gaps: [any major service with no spec covering it]

Anything I missed or that should be excluded from my authorized context?
```

Wait for user confirmation before starting any task.

---

## Step 7 — Identify spec gaps (optional, offer to the user)

Compare services in the registry against existing specs. For each service with no spec:

> "I found a [service type] integration with no .logic spec covering [the key flow]. Would you like me to author one using the RSC-AR loop?"

Do not create specs without user confirmation.
