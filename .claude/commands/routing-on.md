---
description: Re-enable Haiku delegation after /routing-off. Restores automatic task classification and subagent spawning.
---

# /routing-on — Re-enable AI Routing

## What this does
Removes `.claude/routing-state.json`, restoring automatic Haiku detection and delegation for all subsequent tasks.

## Action

Delete `.claude/routing-state.json`:
```bash
rm .claude/routing-state.json 2>/dev/null || true
```

Then announce:
> "AI Routing ON — Haiku detection and delegation restored.
> Tasks will be scored against Haiku criteria at the start of each request.
> Use `/routing-off` to disable again."

## After re-enabling

Resume normal operation per `skills/haiku.md`:
- Check routing state at task start (Step 0) — file gone = routing enabled
- Apply Haiku detection on every task
- Spawn parallel agents for N-similar work (N rules, N specs, N fixtures)
- Run verification layers after every Haiku return
