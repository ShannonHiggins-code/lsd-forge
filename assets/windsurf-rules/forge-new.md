---
trigger: user_initiated
description: Guided .logic spec authoring session in chat
---

# forge-new

When the user wants to create a new .logic spec, or says "forge new" or "create a spec":

Read `.lsd/skills/forge-new.md` and `.lsd/config.json`, then execute Phase 1 — ask what the user wants to build.

If the user has already provided a description in their message, skip Phase 1's open question and go directly to Phase 1's interpretation step.
