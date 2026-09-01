---
name: Distributed limiter allocation
description: Safety rules for preserving global API rate-limit budgets and bounded shared-store cardinality.
---

Keep rate-limit consumption in a shared store across every application instance. Existing identity buckets may use atomic conditional updates, but allocation for a new identity must remain globally serialized, expiry-aware, and protected by a hard cardinality cap. Normal operation is fail-closed; fail-open is an explicit, temporary incident action.

**Why:** A per-instance budget multiplies during autoscaling, while unconstrained identity churn can exhaust the shared database and turn the protection layer into an availability failure.

**How to apply:** Any replacement store or algorithm must retain cross-process load coverage, one global budget per policy/identity, bounded allocation, trusted-proxy identity derivation, and deterministic tests for both failure modes.