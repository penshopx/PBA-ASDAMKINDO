---
name: Atomic terminal transitions
description: Concurrency rule for one-way state changes that emit audit or other winner-only side effects.
---

For terminal state transitions, lock the source row and recheck its current state inside the same transaction that performs the update and writes the audit entry. A request that finds the terminal state after waiting for the lock must return a conflict without side effects.

**Why:** A read-before-transaction check lets concurrent requests both observe the old state, overwrite actor metadata nondeterministically, and emit duplicate audits.

**How to apply:** Use this pattern for resolve, approve, settle, close, and similar one-way actions. Cover simultaneous requests in an integration test and assert one success, one conflict, and one winner-only side effect.