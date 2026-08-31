---
name: Idempotent create side effects
description: Concurrency rule for create endpoints that also emit notifications, audit entries, or other first-create effects.
---

Use a database uniqueness constraint as the source of truth for idempotent create operations. Perform the conflict-aware insert and all first-create side effects in one transaction; a request that loses the insert race must return the winning row without repeating those effects.

**Why:** A read-before-insert check cannot prevent two concurrent requests from both proceeding. Retrying or catching a unique violation outside the side-effect transaction can still duplicate notifications or leave partially created state.

**How to apply:** Define the business identity as a unique database key, use conflict-aware insertion, branch on whether the insert returned a row, and cover simultaneous identical requests plus side-effect counts in an integration test.