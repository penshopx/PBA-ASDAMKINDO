---
name: Passport visibility boundaries
description: Privacy semantics for public Professional Passport links and company Talent Pool access.
---

Public-link visibility and Talent Pool consent are independent controls. Turning off the public link does not revoke active company access, while revoking Talent Pool consent does not automatically hide a public passport.

**Why:** Members need separate control over open-web sharing and access granted to companies inside PBA. Coupling the switches would make one privacy action silently change the other.

**How to apply:** Any matching, consent-expiry, or company-access feature must require active Talent Pool consent for company discovery. Public passport routes must require public visibility, regardless of consent status.