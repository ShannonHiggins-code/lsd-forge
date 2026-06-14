# Skill: forge-sync — Spec Drift Detection and Codebase Sync

`forge-sync` keeps `.logic` specs accurate as the codebase evolves. It detects drift
(specs that describe behaviour that no longer matches the code), identifies which sections
are stale, and walks through updating only what changed.

Run this:
- After a sprint or significant implementation session
- Any time `/forge sync` is invoked
- When a spec's `validated_against` date is more than 30 days old
- When an implementing agent modifies files covered by a spec and signals completion

---

## Before starting

Read `.lsd/config.json`. Extract `SPECS_DIR` (default: `specs/`).

Call `forge_spec_list` to get all current specs with their `id`, `domain`,
`validated_against`, and `authorized_files`.

---

## PHASE 1: DRIFT DETECTION

For each spec in the list, run a git log check against its authorized files:

```
git log --oneline --since="<validated_against date>" -- <authorized_file_1> <authorized_file_2> ...
```

Classify each spec:

| Status | Condition |
|--------|-----------|
| **Current** | No commits to authorized files since `validated_against` |
| **Drifted** | One or more commits to authorized files since `validated_against` |
| **Stale** | `validated_against` is more than 30 days ago, regardless of commits |
| **Missing** | A file in `authorized_files` no longer exists in the repo |

Present the findings to the user in plain language before proceeding:

```
Spec sync report — [date]

  Current (no changes needed):
    LS-YYYY-NNN  [plain-language domain]  — last validated [date]

  Drifted (code changed since spec was validated):
    LS-YYYY-NNN  [plain-language domain]  — [N] commits since [date]
      Changed files: [file list]
    LS-YYYY-MMM  [plain-language domain]  — [N] commits since [date]
      Changed files: [file list]

  Stale (over 30 days old, confirm still accurate):
    LS-YYYY-NNN  [plain-language domain]  — last validated [date]

  Missing files (authorized files no longer exist):
    LS-YYYY-NNN  — [file] not found in repo

Which specs do you want to sync? (Enter IDs, or say "all drifted" / "all")
```

**Gate: confirm which specs to sync before proceeding.**

---

## PHASE 2: CHANGE ASSESSMENT (per spec)

For each spec selected for sync, load the full `.logic` file and the git diff for its
authorized files since `validated_against`:

```
git diff <validated_against date>..HEAD -- <authorized_files>
```

Read the diff. Read the current versions of the changed files. Then compare what the
spec asserts against what the code now does. Identify divergences by section:

**Check INTENT_HAPPY_PATH:**
- Are there steps in the spec that the code no longer performs?
- Are there things the code now does that the spec never described?
- Has the order of operations changed?

**Check EDGE_CRITICAL_UNHAPPY_PATH:**
- Have any error conditions been added, removed, or changed?
- Has the system response to any existing edge case changed?

**Check REGRESSION_FENCE:**
- Are there items that no longer apply (the thing they protected was removed)?
- Are there new things that must not break that aren't listed?

**Check TARGET_BOUNDARIES:**
- Are there new files the feature now touches that aren't in `authorized_files`?
- Are there files listed that the feature no longer touches?

**Check CONTEXT_DEBT_NOTE:**
- Have the reasons behind any decisions changed?
- Were any deferred items from the note now resolved or abandoned?

Present the assessment in plain language:

```
Assessment for LS-YYYY-NNN — [plain-language domain]:

  Happy path — [N changes found / no changes]
    • Step 3 no longer matches: the code now [what it does] instead of [what spec says]
    • New behaviour not in spec: [description]

  What can go wrong — [N changes found / no changes]
    • Edge case 4 removed: [what was removed and why, based on diff]

  What must not break — [1 change found / no changes]
    • Item about [X] no longer applies — [X] was removed in commit [hash]

  File boundaries — [no changes / changes found]
    • [file] was added to the feature but is not in authorized_files

  Decisions — [no changes needed / note to add]
    • [deferred item] from CONTEXT_DEBT_NOTE was implemented in [commit]

Proposed updates: [N items across [M] sections]

Proceed with updates? (Yes / skip this spec / show me the diff first)
```

**Gate: confirm before making any changes to the spec file.**

---

## PHASE 3: SPEC UPDATE

For each confirmed divergence, apply the minimum change needed to bring the spec into
alignment with the current code. Do not rewrite sections that have not drifted.

Follow the same language rules as forge-new (human-first language, jargon substitution).

**Version bump rules:**
- Patch (0.0.x): wording only — no behaviour, no file, no step changes
- Minor (0.x.0): steps added/removed, edge cases updated, regression items changed
- Major (x.0.0): happy path restructured, authorized_files changed, or domain redefined

Update `validated_against` to today's date.

After applying changes, run `forge lint <file> --strict`. Fix any errors before proceeding.

Present a plain-language changelog:

```
Updated LS-YYYY-NNN  [domain]  →  version [new version]

  Changes made:
    • [section]: [what changed, in plain English]
    • [section]: [what changed]

  validated_against updated: [old date] → [today]

  Lint: clean
```

---

## PHASE 4: DEPENDENCY CASCADE

After syncing individual specs, check whether any change invalidates a dependent spec.

For each synced spec, check `forge_spec_list` for specs that list it in `requires: []`.

If a dependent spec exists:
1. Load it
2. Check whether the change in the upstream spec affects any behaviour the dependent spec assumes
3. If yes — add it to the sync queue and process it in the next round

Present cascade findings before acting:

```
Cascade check:

  LS-YYYY-NNN (just updated) is listed as a dependency of:
    LS-YYYY-MMM — [plain-language domain]

  The change to step [N] in LS-YYYY-NNN may affect LS-YYYY-MMM because:
  [plain-language explanation]

  Add LS-YYYY-MMM to this sync session? (Yes / No / Show me that spec first)
```

**Gate: confirm before cascading.**

---

## PHASE 5: COMPILE AND DELIVER

After all selected specs are updated and linted cleanly, offer to recompile each one:

```
Sync complete. [N] specs updated.

  LS-YYYY-NNN  version [new]  lint: clean
  LS-YYYY-MMM  version [new]  lint: clean

Compile updated specs now to generate fresh agent payloads? (Yes / No)
```

If yes, run `forge compile` on each updated spec and deliver the payloads.

---

## Auto-sync trigger (for implementing agents)

When an implementing agent completes work that modifies files covered by a spec, it should:

1. Identify which spec(s) authorize the files it modified (from `forge_spec_list`)
2. Run Phase 2 (Change Assessment) for those specs only
3. If divergences are found, present them to the user immediately:

```
I modified files covered by LS-YYYY-NNN. I checked the spec against my changes
and found [N] places where the spec no longer matches:

  [plain-language list of divergences]

Update the spec now, or defer to the next sync session?
```

If the user defers, note the spec ID and the unsynced state in the session summary.
Never silently leave a spec out of sync after implementation.

---

## Ingestion template

```
Read .lsd/skills/forge-sync.md and .lsd/config.json. I want to sync specs with the codebase.

SCOPE
<"all" / "drifted only" / specific spec IDs / "check LS-YYYY-NNN">

Execute Phase 1 now.
```
