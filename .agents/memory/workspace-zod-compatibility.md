---
name: Workspace Zod compatibility
description: Compatibility rule for Drizzle-Zod schema generation in this pnpm workspace.
---

Database schema files that infer types from Drizzle-generated Zod schemas must import the workspace-compatible Zod v4 entrypoint.

**Why:** The installed `drizzle-zod` types are based on the Zod v4 compatibility surface; importing a different Zod type surface causes TypeScript incompatibility even when the runtime schema is valid.

**How to apply:** Keep schema imports consistent when adding or editing database tables, then run the workspace library typecheck before wiring API routes.