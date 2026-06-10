# Skill: Spec Authoring — Writing a Valid .logic File

A `.logic` file is a structured requirement specification for an AI coding agent. It tells the
agent what to build, what it may touch, what edge cases must be handled, and what must not break
— without ambiguity. This skill covers the format, rules, and common mistakes.

---

## File format

```
---
<YAML front matter>
---

## 1. SECTION_NAME
<content>
```

Front matter is parsed by gray-matter. Sections are identified by `## N. SECTION_NAME` headings
in uppercase with underscores. Lowercase headings are not recognized.

---

## Required front matter fields

| Field | Format | Example |
|-------|--------|---------|
| `id` | `LS-YYYY-NNN` | `LS-2026-001` |
| `version` | semver | `1.0.0` |
| `domain` | slash-separated path | `auth/login-redirect` |
| `requires` | array of spec IDs | `[]` or `['LS-2026-001']` |
| `owner` | name and role | `J. Rivera (PA)` |
| `validated_against` | ISO date (within 30 days of today) | `2026-06-09` |

All six fields are required. A missing field causes a lint error.

---

## Required sections (all 5 must be present and non-empty)

### 1. TARGET_BOUNDARIES

Scopes what the agent may touch. Must define:
- `runtime` — the execution environment
- `data_stores` — databases, caches, or queues accessed
- `authorized_files` — paths the agent may read or write (from `config.authorized`)
- `forbidden_files` — paths the agent must never touch (from `config.forbidden`)

```
## 1. TARGET_BOUNDARIES

runtime: Node.js 20 on Vercel Edge
data_stores: PostgreSQL via Prisma
authorized_files:
  - src/lib/auth/
  - src/app/api/session/
forbidden_files:
  - prisma/migrations/
  - .env
```

### 2. INTENT_HAPPY_PATH

The primary success flow. Numbered list. Each step must be a specific, observable action —
not a vague description.

```
## 2. INTENT_HAPPY_PATH

1. User submits login form with valid email and password.
2. System checks credentials against the users table.
3. System creates a session record and sets a signed HTTP-only cookie.
4. System redirects the user to /dashboard.
```

**Step count matters.** The edge section must have at least `ceil(happy_steps / 2)` steps.
4 happy steps → minimum 2 edge steps. 7 happy steps → minimum 4 edge steps.

### 3. EDGE_CRITICAL_UNHAPPY_PATH

Failure cases. Each entry: `<specific trigger> → <specific system response>`.

```
## 3. EDGE_CRITICAL_UNHAPPY_PATH

1. User submits an email not found in the users table → return 401, do not reveal which field failed.
2. User submits correct email but wrong password → return 401, increment failed_attempts counter.
3. User account is locked (failed_attempts ≥ 5) → return 423 with unlock instructions.
```

### 4. REGRESSION_FENCE

Dependencies that must not break. Preservation rules. Think: what would you be embarrassed to
break silently?

```
## 4. REGRESSION_FENCE

- Existing session tokens must remain valid after this change.
- The /api/auth/logout endpoint must continue to clear cookies correctly.
- Rate limiting on /api/auth/login must not be affected.
```

### 5. CONTEXT_DEBT_NOTE

Rationale for non-obvious decisions. If a future reader would ask "why?", answer it here.

```
## 5. CONTEXT_DEBT_NOTE

- Credentials are checked via bcrypt with a fixed-time comparison to prevent timing attacks.
  Using constant-time comparison even on missing users (dummy hash) to prevent user enumeration.
- Session cookie is HTTP-only and SameSite=Strict — cannot be read by client JS.
- failed_attempts counter is stored in Redis, not Postgres, to avoid write amplification on
  high-traffic login endpoints.
```

---

## Banned phrases (ambiguous language — causes lint error)

These phrases are too vague to be machine-executable. Any of them in an INTENT section
blocks compilation:

> handle appropriately · handle accordingly · as needed · as appropriate ·
> process the request · deal with · manage the error · validate input ·
> ensure security · handle the error · if necessary · when applicable ·
> in some cases · etc. · and so on · various · somehow

**Replace with:** a specific observable outcome. Instead of "handle the error", write
"return 422 with the field name and constraint violated".

---

## Lint rules summary

| Rule | Severity | What triggers it |
|------|----------|-----------------|
| required-sections | error | Any of the 5 sections missing or empty |
| forbidden-overlap | error | Same file in both `authorized_files` and `forbidden_files` |
| unhappy-path-ratio | error | EDGE steps < `ceil(happy steps / 2)` |
| ambiguous-language | error | Banned phrase in any INTENT section |
| stale-validation | warning | `validated_against` > 30 days ago |

All errors block compilation. Fix them before running `forge compile`.

---

## Verification workflow

```bash
forge lint specs/my-spec.logic --plain        # check for errors
forge lint specs/my-spec.logic --strict       # check for warnings too
forge compile specs/my-spec.logic             # produce agent payload (stdout)
forge compile specs/my-spec.logic --out payload.txt  # write to file
```

A spec is complete when `forge lint --strict` exits 0.

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Lowercase section heading (`## intent_happy_path`) | Use uppercase: `## INTENT_HAPPY_PATH` |
| Vague step ("System handles the request") | Specific: "System validates the JWT signature and returns 401 if invalid" |
| Too few edge cases (2 happy, 0 edge) | Add at least `ceil(2/2) = 1` edge case |
| `authorized_files` contains a `forbidden` path | Remove the conflict — one list only |
| `validated_against` set to a future date | Set to today's date |
| Missing `CONTEXT_DEBT_NOTE` section | Add the section — even one sentence is valid |
