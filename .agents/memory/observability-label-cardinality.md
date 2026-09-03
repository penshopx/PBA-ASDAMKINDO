---
name: Observability label cardinality
description: Privacy and reliability rule for API metric dimensions and incident correlation.
---

API metrics must use a small, bounded set of route-family labels. Never label metrics with raw URLs, dynamic resource IDs, user IDs, IP addresses, or correlation IDs. Correlation IDs belong in logs and response headers, where they connect an incident to request details without increasing metric cardinality.

**Why:** Raw paths and identities can expose personal or tenant data and create unbounded time-series growth, making the monitoring system expensive and unreliable during an incident.

**How to apply:** When adding an API route, map it to an existing bounded route family or add one explicit family. Keep detailed request context in redacted structured logs, linked by correlation ID.