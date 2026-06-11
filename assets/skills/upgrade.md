# Skill: upgrade — LSD FORGE Version Upgrade Protocol

Use this skill when a new version of `lsd-forge` is available and the project needs to pick up
the changes — new skills, updated onboarding templates, new forge commands, new lint rules, or
changed compiled payload formats.

The upgrade path is safe by design: `forge init --upgrade` refreshes the files owned by
lsd-forge (skills, onboarding, shortcut commands, pre-commit hook) and never touches the
project-owned files (`config.json`, `registry.json`, or any spec).

---

## When to run this protocol

- A new version of `lsd-forge` is published and the team wants to pick up new skills or commands
- The pre-commit hook is behaving unexpectedly and may be stale
- `/forge-new` or other shortcut commands seem outdated compared to published documentation
- `forge lint` is producing unexpected results after a package update
- The team is onboarding a new AI tool (Cursor, Windsurf, etc.) and wants the shortcut installed

---

## Before starting — verify current state

Run these three commands and report the results before touching anything:

```bash
forge --version                       # current installed version
forge lint specs/ --plain --strict    # baseline — note any failures
forge status                          # registry health
```

If `forge lint` already has failures before the upgrade, resolve them first. Upgrading onto a
broken baseline makes it harder to attribute regressions to the version change.

---

## STEP 1: Update the package

```bash
# npm
npm update lsd-forge

# pnpm
pnpm update lsd-forge

# yarn
yarn upgrade lsd-forge
```

Confirm the new version:
```bash
forge --version
```

---

## STEP 2: Refresh skills, onboarding, and shortcuts

```bash
npx forge init --upgrade
```

This overwrites:
- `.lsd/onboarding.md` — updated automation trigger template
- `.lsd/skills/*.md` — all skill files (forge-new, rsc-ar, spec-authoring, self-refinement, onboarding, upgrade)
- `.claude/commands/`, `.cursor/rules/`, `.windsurf/rules/`, `.github/prompts/` — shortcut command files for detected AI tools
- `.git/hooks/pre-commit` — updated hook script (preserves custom content before the LSD FORGE marker)

This preserves:
- `.lsd/config.json` — all project-specific authorization paths, stack config, and dependencies
- `.lsd/registry.json` — discovered services and artifacts
- `specs/` — all your spec files are never touched

---

## STEP 3: Review what changed

```bash
git diff .lsd/
```

Read the diff. Key things to look for:
- New skills added to `.lsd/skills/` — these expand what your AI can do; read them
- Changes to `.lsd/onboarding.md` — the AI's boot instructions; check that project-specific context (names, paths) is still correct
- Changes to `/forge-new` command files — note if the pipeline phases have changed

If the onboarding template slots (`{{PROJECT_NAME}}`, `{{VERIFY_COMMAND}}`) filled incorrectly,
edit `.lsd/config.json` and re-run `forge init --upgrade` to regenerate.

---

## STEP 4: Validate existing specs against new rules

New versions of `lsd-forge` may add lint rules or tighten existing ones. Run a strict lint:

```bash
forge lint specs/ --plain --strict
```

If any specs now fail that were passing before:
- Read the error and its fix suggestion
- Update the spec to comply — the new rule exists for a reason
- If the fix changes the spec's meaning, run a mini RSC-AR cycle on just that spec

Do not use `--skip-lint` to work around new rule failures. The rule caught something real.

---

## STEP 5: Check for compiled payload format changes

If the compiled payload format changed (visible in the release notes or git history), any agent
currently holding a compiled payload from a previous version may behave differently. To be safe:

```bash
forge compile specs/<your-spec>.logic --out payload.txt
```

Compare against any previously compiled payloads in use. If the structure changed significantly,
inform any agent sessions currently operating from the old payload.

---

## STEP 6: Confirm project health

```bash
forge status
forge coverage
forge validate
```

All three should return clean results. If `forge validate` surfaces a new cross-spec conflict
that wasn't present before (possible if the collision engine was updated), resolve it before
continuing.

---

## STEP 7: Commit the updated .lsd/ files

```bash
git add .lsd/ .claude/commands/ .cursor/rules/ .windsurf/rules/ .github/prompts/
git commit -m "chore(lsd): upgrade lsd-forge to v<version>"
```

Commit the upgraded skill kit so the rest of the team and CI pick it up.

---

## Rollback

If the upgrade causes unexpected problems:

```bash
git restore .lsd/
git restore .claude/commands/ .cursor/rules/ .windsurf/rules/ .github/prompts/
```

This restores the previous skill kit. The `lsd-forge` package version in `node_modules` can be
pinned in `package.json` until the issue is resolved.

---

## Notes for the lsd-forge maintainer

When shipping a new version that changes the skill kit, `config.json` schema, or lint rules:

1. Update `CHANGELOG.md` with what changed and any migration steps
2. Test `forge init --upgrade` on a real adopter project before publishing
3. If a new lint rule may break existing specs, call it out explicitly in release notes
4. If `config.json` gains a new required field, add a migration note — upgrading projects
   will have the old config and will need to add the field manually
