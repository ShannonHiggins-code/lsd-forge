---
description: Disable Haiku delegation and lock all work to a single model (sonnet or opus). Use for complex new development, novel architecture, or when routing has caused issues. Pass "opus" as arg for maximum reasoning.
---

# /routing-off — Disable AI Routing

## What this does
Writes `.claude/routing-state.json` to disable Haiku delegation for all subsequent tasks in any session until `/routing-on` is called. All work runs on the specified model — no automatic Haiku detection, no delegation, no subagent spawning.

## When to use
- Designing a new lint rule with non-obvious cross-section analysis
- Refactoring the parser or extractor (multi-file dependencies)
- After a Haiku misclassification caused a regression
- Debugging an unknown parser or rule failure
- Any time you want full Sonnet/Opus reasoning without delegation interruptions

## Action

Write `.claude/routing-state.json`:

```json
{
  "enabled": false,
  "model": "sonnet",
  "reason": "[user's stated reason or 'complex development']",
  "set_at": "[current date]"
}
```

If user passed "opus" as argument, set `"model": "opus"`.

Then announce:
> "AI Routing OFF — all tasks will run on [model] until you type `/routing-on`.
> No Haiku delegation. No subagent spawning. Full [model] reasoning on every task.
> Current session and all future sessions will respect this until explicitly re-enabled."

## Model guidance while routing is OFF

**Sonnet mode:** Standard operation. Handle all tasks directly regardless of complexity or repetition. Do not spawn subagents.

**Opus mode:** Maximum reasoning. Use for: novel rule architecture with high regression risk, complex parser refactors, diagnosing hard bugs where being wrong has serious consequences.
Announce at task start: "Running on Opus — [brief reason why this warrants Opus]."
