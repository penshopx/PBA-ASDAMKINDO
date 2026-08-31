---
name: Development schema drift
description: How to distinguish route regressions from unapplied development database schema changes.
---

When an integration query references a field or constraint that clearly exists in the current source schema, verify the live development database metadata before changing application code.

**Why:** Task branches can contain additive schema declarations that have not yet reached the shared development database. The resulting query failure looks like a route bug even though the runtime code is correct.

**How to apply:** Compare the affected table's live columns and indexes with the source schema. If drift is confirmed, apply only the already-declared additive change, avoid unrelated schema operations, and rerun the full suite.