---
name: Clerk E2E preview auth
description: Testing limitation observed when programmatic Clerk sessions cross the path-routed development preview.
---

Programmatic Clerk browser sign-in can set testing cookies while `/api/me` still returns 401 through the path-routed development preview.

**Why:** A browser E2E attempt received Clerk testing cookies but the API middleware did not recognize the session, blocking authenticated UI automation even though normal builds and workflows were healthy.

**How to apply:** Try the Clerk testing helper first. If the API remains unauthenticated, do not weaken runtime auth; use an isolated Express router integration harness with injected users for lifecycle and permission checks, and separately verify the frontend build/runtime.