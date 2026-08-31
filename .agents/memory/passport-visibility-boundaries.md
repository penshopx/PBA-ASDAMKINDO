---
name: Passport visibility boundaries
description: Privacy semantics for public Professional Passport links and company Talent Pool access.
---

Public-link visibility and Talent Pool consent are independent controls. Turning off the public link does not revoke active company access, while revoking Talent Pool consent does not automatically hide a public passport.

Company Talent Pool access is always scoped to one member-company pair and requires an active, unexpired grant. Legacy global consent must never be backfilled into company access because it does not identify an intended recipient.

**Why:** Members need separate control over open-web sharing and access granted to companies inside PBA. Coupling the switches would make one privacy action silently change the other, while translating a global consent into company grants would silently broaden access.

**How to apply:** Any matching, shortlist, or company-access feature must filter by the requesting company, active status, future expiry, and the member's general data-sharing consent in the database. Public passport routes must require public visibility regardless of consent status.