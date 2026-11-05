---
name: Clerk E2E preview auth
description: Testing limitation observed when programmatic Clerk sessions cross the path-routed development preview.
---

Programmatic Clerk browser sign-in can set testing cookies while `/api/me` still returns 401 through the path-routed development preview.

**Why:** A browser E2E attempt received Clerk testing cookies but the API middleware did not recognize the session, blocking authenticated UI automation even though normal builds and workflows were healthy.

**How to apply:** Try the Clerk testing helper first. If the API remains unauthenticated, do not weaken runtime auth; use an isolated Express router integration harness with injected users for lifecycle and permission checks, and separately verify the frontend build/runtime.

The helper may also yield a valid `/api/me` session without custom name/email
claims, leaving a default member with an app-generated name/email. Those fallback
fields do not prove the helper authenticated the wrong Clerk account.

**Why:** A protected-page test initially stopped on the fallback profile, but the
Clerk user ID and actual Clerk email verified ownership of the isolated fixture.
Clerk lowercases email addresses, so compare normalized addresses.

**How to apply:** Match the authenticated Clerk ID against the helper-created
identity and actual Clerk email before changing a test user's role. Only then
seed privileges for that isolated fixture and clean it up. If ownership cannot
be established, stop protected browser testing without changing any role; keep
permission checks in the router harness and use a legitimate admin session.