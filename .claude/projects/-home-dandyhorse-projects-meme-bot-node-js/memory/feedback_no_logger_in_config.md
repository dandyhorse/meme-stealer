---
name: No logger in config.ts
description: Never import systemLogger in config.ts — causes circular dependency that user cannot resolve yet
type: feedback
---

Do not import or use systemLogger in `src/utils/config.ts` — it creates a circular dependency.

**Why:** User has encountered this circular dep before and hasn't found a way to fix it yet. It's a known pain point.

**How to apply:** When adding proxy/logging/debug output to config.ts, use plain `console.log` if absolutely needed, but prefer keeping logging out of config entirely.
