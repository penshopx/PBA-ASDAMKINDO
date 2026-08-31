---
name: Clerk preview wiring
description: Durable guidance for Clerk in this multi-domain Replit workspace.
---

Use Clerk's host-aware publishable-key resolver in the browser and keep the proxy URL configured through environment variables. Apply the Clerk CSS layer and shared appearance when embedding sign-in/sign-up components.

**Why:** The preview hostname and published hostname can differ, while the same app must select the correct Clerk instance without exposing server credentials or hardcoding a domain.

**How to apply:** When changing auth setup, preserve host-aware key selection, proxy-aware `ClerkProvider`, and localized appearance configuration.