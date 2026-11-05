---
name: Alarm delivery recovery
description: Shared reservation and ambiguous-send policy for operational notifications.
---

Use the shared database as the authority for delivery ownership, deduplication,
and both manual-test and operational cooldowns. Do not send without a committed
reservation or fall back to process-local delivery on database errors.

**Why:** Restarting a process or scaling replicas must not reset the notification
budget and cause a burst of duplicate messages.

**How to apply:** Reserve cooldown and delivery ownership atomically before any
external side effect. Keep deduplication keys even when they leave the visible
dashboard history.

Treat an interrupted delivery as ambiguous, not as permission to replay it.
Terminal delivery keys are not reused; a fresh manual test needs a new key and
must still respect the shared cooldown.

**Why:** The provider may have accepted a message before the sender died or
before its success could be saved. Automatic takeover or treating a database
write failure as a transport failure can send duplicate notifications.

**How to apply:** Expired pending ownership becomes an explicit interrupted
failure on status reads. Check the receiver by key before initiating a new send.
Webhook receivers should honor the deduplication key because transport retries
cannot guarantee exactly-once external delivery.
