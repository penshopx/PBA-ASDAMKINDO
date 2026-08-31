# PBA production-readiness and pilot runbook

## Scope and controls

Pilot fixtures are non-authenticating, clearly prefixed data for Admin/backoffice validation only. They never create credentials or Clerk accounts and are not the identities used in interactive scenarios. Run `pnpm --filter @workspace/scripts pilot:seed -- --target development --allow-pilot-data --confirm-pilot` in development only; record the printed fixed-length run ID. The tool denies every target other than development, refuses production/deployment markers, and verifies that `DATABASE_URL` matches the platform-provided development database identity. To remove one run only, use `pilot:reset` with the same target, both flags, and its exact `--run-id`. Fixed-length run IDs prevent one run from being a prefix of another.

Before an interactive pilot, provision separate fictional Clerk **Development** users with `example.test` email addresses for Member and Company, plus an authorized Admin test user. Use the product UI to create the Member/Company profiles and consent; never bind seed-fixture users to Clerk or reuse production identities. Record their Clerk user IDs for the scoped cleanup command, then delete the Clerk Development accounts after their local rows are removed.

Use `--dry-run` with either command to validate flags, environment protection, and run-ID scoping without changing the database.

## Backup, restore, and rollback

Before any pilot reset or operational bulk action, verify that Replit's daily database backups are enabled and that the team can access the production backup/restore controls. Replit production restore/PITR restores database data to a selected recovery point; it is a data recovery operation, not an application rollback. Current documented retention is up to 7 days for Core and up to 28 days for Pro/Enterprise. Follow Replit's official database backup and point-in-time recovery guidance in the Database tool settings, select the recovery point, obtain change approval, and validate the restored data before reopening access.

Code rollback is separate: use Replit Deployments to redeploy a known-good prior release (or revert the approved source change and publish). Do not assume a database restore changes deployed code, and do not use code rollback as a substitute for restoring data. Record the backup/PITR point, deployment version, approver, operator, and validation result in the incident record.

## Daily Admin checklist

1. Confirm the current deployment health and that no emergency change is in progress.
2. Review new enrollments, pending evidence verifications, and member/company access anomalies.
3. Review open requirements, shortlist status, and consent status/expiry dates.
4. Review transactions, sandbox/manual settlement entries, reconciliation exceptions, and supporting records.
5. Review audit activity for privileged operations and unexpected pilot-prefix data.
6. Confirm pilot data remains isolated; reset completed runs after approval.
7. Log issues, owner, priority, and next review time; escalate suspected data exposure immediately.

## Pilot data handling and reset

Use only fictional names, `example.test` addresses, and non-sensitive example phone numbers. Do not paste production data, payment details, government IDs, files, or participant credentials into pilot fixtures. Keep each run ID with the session record. Reset at the end of an approved session:

```sh
pnpm --filter @workspace/scripts pilot:reset -- --target development --run-id <printed-run-id> --allow-pilot-data --confirm-pilot
```

The reset is transactional and scoped to the run prefix; it does not truncate tables or delete unrelated rows. If a reset fails, stop, preserve the error and run ID, and have an approved operator investigate—do not issue broad SQL deletes.

Remove local rows for the fictional interactive users first. The command accepts only Clerk-linked local users whose stored email ends in `@example.test`, uses the same development database identity guard, and deletes their dependent rows in foreign-key-safe order:

```sh
pnpm --filter @workspace/scripts pilot:cleanup-user -- --target development --user-id <member-clerk-user-id> --user-id <company-clerk-user-id> --user-id <admin-clerk-user-id> --allow-pilot-data --confirm-pilot --confirm-delete-test-user
```

## Exactly 10 no-code pilot scenarios

1. **Public visitor** opens the landing page and program catalog, checks Indonesian copy, and confirms no credential, mockup, or internal identifier is visible.
2. **Member** signs in with the fictional Clerk Development user, completes Member onboarding, signs out/in, and confirms the Member dashboard remains available.
3. **Member** submits a readiness diagnostic and fictional evidence, reloads the page, and confirms the score, answers, and evidence persist.
4. **Member** creates a professional passport, toggles the public link, and confirms private fields remain hidden from the public view.
5. **Company** signs in with the fictional Clerk Development user, completes Company onboarding, creates one open requirement, and confirms only that company can edit it.
6. **Member** grants time-bounded Talent Pool access to the fictional Company; **Company** confirms the candidate appears without contact or internal IDs.
7. **Company** reviews the match explanation and adds the candidate to shortlist; **Member** revokes consent; **Company** refreshes and confirms the candidate and shortlist access disappear.
8. **Admin** reviews the clearly labeled seeded program, enrollment/progress, pending verification, and paid sandbox/manual-settlement record without treating it as real payment.
9. **Admin** opens the Funnel view, confirms all eight definitions and Refresh behavior, then verifies privileged audit/transaction controls remain limited to Super Admin.
10. **Operator** records findings, runs the scoped interactive-user cleanup command, deletes the fictional Clerk Development accounts, runs the exact seed reset command, and confirms no test-user or run-prefixed rows remain.

## Known limitations and ownership

There is no real payment-provider checkout. Payment pilot activity is sandbox/manual settlement simulation only. This runbook and seed tool do not change matching or consent logic. Separate existing tasks own: SLA worker, duplicate shortlist prevention, notification atomicity, consent-expiry reminder, reconciliation concurrency, and failed settlement ingestion.