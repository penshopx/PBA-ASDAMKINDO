---
name: OpenAPI identifier unions
description: How to model request bodies that accept one of several identifiers without breaking generated Zod date coercion.
---

When an OpenAPI request body requires at least one of multiple identifiers and also contains date-time fields, define `anyOf` as complete object variants rather than adding identifier-only `anyOf` branches beside shared object properties.

**Why:** The workspace generator can emit an intersection between the identifier union and the shared object. Zod then fails at runtime with an unmergeable intersection when both sides transform the same date-time field.

**How to apply:** Repeat the shared request properties in each complete `anyOf` object variant, make the relevant identifier required per variant, regenerate the client and Zod schemas, and exercise `safeParse` in an integration test.