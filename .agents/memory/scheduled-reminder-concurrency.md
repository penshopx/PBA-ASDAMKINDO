---
name: Scheduled reminder concurrency
description: Concurrency rule for background reminders whose source item may be resolved while a worker is running.
---

Scheduled reminder creation must recheck and lock the source row in the same transaction that writes the reminder. Keep a unique, state-specific dedupe key as a separate guard against duplicate delivery.

**Why:** A dedupe key prevents two workers from creating the same reminder, but it does not stop a worker from writing a stale reminder after another request has already resolved the source item.

**How to apply:** For any reminder based on mutable eligibility, select eligible source rows with deterministic row locking, then create notifications before committing. Cover parallel workers and concurrent resolution in integration tests.