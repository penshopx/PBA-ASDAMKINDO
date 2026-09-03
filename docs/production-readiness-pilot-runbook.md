# PBA production-readiness and pilot runbook

## Scope and controls

Pilot fixtures are non-authenticating, clearly prefixed data for Admin/backoffice validation only. They never create credentials or Clerk accounts and are not the identities used in interactive scenarios. Run `pnpm --filter @workspace/scripts pilot:seed -- --target development --allow-pilot-data --confirm-pilot` in development only; record the printed fixed-length run ID. The tool denies every target other than development, refuses production/deployment markers, and verifies that `DATABASE_URL` matches the platform-provided development database identity. To remove one run only, use `pilot:reset` with the same target, both flags, and its exact `--run-id`. Fixed-length run IDs prevent one run from being a prefix of another.

Before an interactive pilot, provision separate fictional Clerk **Development** users with `example.test` email addresses for Member and Company, plus an authorized Admin test user. Use the product UI to create the Member/Company profiles and consent; never bind seed-fixture users to Clerk or reuse production identities. Record their Clerk user IDs for the scoped cleanup command, then delete the Clerk Development accounts after their local rows are removed.

Use `--dry-run` with either command to validate flags, environment protection, and run-ID scoping without changing the database.

## Backup, restore, and rollback

Before any pilot reset or operational bulk action, verify that Replit's daily database backups are enabled and that the team can access the production backup/restore controls. Replit production restore/PITR restores database data to a selected recovery point; it is a data recovery operation, not an application rollback. Current documented retention is up to 7 days for Core and up to 28 days for Pro/Enterprise. Follow Replit's official database backup and point-in-time recovery guidance in the Database tool settings, select the recovery point, obtain change approval, and validate the restored data before reopening access.

Code rollback is separate: use Replit Deployments to redeploy a known-good prior release (or revert the approved source change and publish). Do not assume a database restore changes deployed code, and do not use code rollback as a substitute for restoring data. Record the backup/PITR point, deployment version, approver, operator, and validation result in the incident record.

Target RPO/RTO, quarterly isolated restore drill, integrity command, evidence template, and PII retention/deletion rules are defined in [the member-data recovery runbook](./member-data-recovery-runbook.md). A pilot reset must not be treated as proof that production backup restoration works.

## Daily Admin checklist

1. Confirm the current deployment health and that no emergency change is in progress.
2. Review new enrollments, pending evidence verifications, and member/company access anomalies.
3. Review open requirements, shortlist status, and consent status/expiry dates.
4. Review transactions, sandbox/manual settlement entries, reconciliation exceptions, and supporting records.
5. Review audit activity for privileged operations and unexpected pilot-prefix data.
6. Confirm pilot data remains isolated; reset completed runs after approval.
7. Log issues, owner, priority, and next review time; escalate suspected data exposure immediately.

## API rate-limit operations

Limiter memakai fixed window 60 detik. Semua instance melakukan atomic upsert ke shared PostgreSQL table `api_rate_limit_buckets`, sehingga penambahan instance tidak menambah budget efektif. Bucket kedaluwarsa dibersihkan berkala dan tidak menyimpan payload request, token, alamat lengkap di log, atau data profil.

| Policy | Endpoint | Identitas | Budget |
| --- | --- | --- | ---: |
| `ingress` | seluruh request `/api`, sebelum parsing body dan Clerk | client IP | 300/menit |
| `health` | `GET /api/healthz` | client IP | 120/menit |
| `public-read` | `GET /api/programs`, `GET /api/passport/{slug}` | client IP | 60/menit |
| `auth-sensitive` | read lain, termasuk endpoint terautentikasi | Clerk user ID bila ada; selain itu client IP | 30/menit |
| `write` | `POST`, `PUT`, `PATCH`, `DELETE` | Clerk user ID bila ada; selain itu client IP | 20/menit |

Budget dapat diubah tanpa mengubah kode melalui `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_INGRESS_MAX`, `RATE_LIMIT_HEALTH_MAX`, `RATE_LIMIT_PUBLIC_READ_MAX`, `RATE_LIMIT_AUTH_MAX`, dan `RATE_LIMIT_WRITE_MAX`. Shared store dibatasi keras oleh `RATE_LIMIT_MAX_BUCKETS` (default 10.000, maksimum 100.000); identitas baru ditolak sesuai failure mode bila kapasitas penuh, sedangkan bucket lama dibersihkan sebelum alokasi baru dan secara berkala. Nilai default `RATE_LIMIT_TRUSTED_PROXY_HOPS=1` ditujukan untuk tepat satu hop edge terkelola Replit; port origin artifact tidak boleh diekspos langsung ke internet. Set `0` bila server benar-benar menerima koneksi client langsung; jangan memakai trust-all. Nilai di atas lima hop ditolak. Limiter hanya mengambil alamat IP valid pada posisi di belakang jumlah proxy tepercaya yang dikonfigurasi, membatasi pembacaan header menjadi lima entri paling kanan, dan jatuh kembali ke alamat socket. Jangan menaikkan hop hanya untuk membuat alamat di header diterima.

Respons yang ditolak adalah `429` JSON aman dengan `code=RATE_LIMITED`, `retryAfterSeconds`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, dan `Retry-After`. Client harus menunggu `Retry-After`, tidak melakukan retry loop rapat.

Pantau 429 secara global dari log deployment seluruh instance dengan message `Rate limit exceeded`, lalu kelompokkan berdasarkan `rateLimitPolicy` dan `rateLimitStore=postgres`. Log hanya menyimpan jenis identitas (`user` atau `ip`), bukan nilainya. Buat alert bila total global 429 melebihi 10 per menit selama 5 menit, lebih dari 5% request pada satu policy selama 15 menit, atau user normal berulang kali terblokir. Korelasikan dengan latency, error database, dan volume request sebelum menyimpulkan penyalahgunaan. Pantau juga message `Distributed API rate limiter failed` dan `Rate limiter fail-open allowed request`; kemunculan salah satunya adalah insiden kontrol traffic, bukan 429 normal.

Mode kegagalan default adalah fail-closed (`RATE_LIMIT_FAILURE_MODE=closed` atau nilai tidak dikenal): kegagalan shared store menghasilkan `503` dan request tidak mencapai route. Gunakan ini untuk operasi normal, terutama write dan endpoint sensitif. Fail-open (`RATE_LIMIT_FAILURE_MODE=open`) hanya boleh diaktifkan sementara oleh operator berwenang ketika shared store bermasalah dan penghentian total lebih berbahaya daripada hilangnya pembatasan. Sebelum mengaktifkan fail-open, konfirmasi edge/WAF tetap aktif, batasi traffic bila memungkinkan, catat approver dan waktu, aktifkan alert message fail-open, lalu publish/restart. Pulihkan `closed` segera setelah database sehat, publish/restart lagi, verifikasi bucket bertambah lintas instance, dan tutup insiden. Health route tetap melakukan query database sendiri sehingga fail-open tidak menyamarkan database yang tidak sehat.

Untuk penyesuaian budget, catat baseline dan alasan, ubah satu threshold maksimum 25% per langkah, publish/restart, lalu pantau sedikitnya 24 jam. Jangan menaikkan limit untuk menyamarkan query lambat atau serangan; perbaiki akar masalah atau blokir sumber di edge. Rollback ke nilai sebelumnya bila latency/error meningkat atau false positive tetap terjadi. Sebelum ekspansi traffic, jalankan integration test rate limit: dua server harus berbagi satu bucket, request ke-61 untuk `public-read` harus menjadi satu-satunya 429, dan count shared store harus 61—bukan 61 per instance.

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

## Pilot cohort and evaluation dashboard

Use one published program whose category is exactly `Bimtek`, one open requirement, and the company that owns that requirement. In **Admin → Pusat operasi → Evaluasi pilot**, select those two anchors. The cohort is the set of unique members whose enrollment belongs to the selected program and is not cancelled. The dashboard target is 20 participants; it does not create, invite, or automatically cap accounts.

The report is aggregate-only. It does not return participant names, contact details, Clerk IDs, member/company IDs, consent versions, or candidate IDs. Anchor IDs are used only by the protected selector request. Interpret metrics as follows:

- **Registrasi cohort:** unique, non-cancelled enrollment members for the selected program.
- **Diagnostik selesai:** cohort members with a saved readiness diagnostic.
- **Peserta berbayar:** unique cohort members whose selected-program enrollment has a `program` transaction in `paid` status. For the pilot, `paid` must come only from sandbox/manual simulation.
- **Completion rate:** selected-program enrollments in `completed` status divided by cohort registrations. A zero-member cohort reports 0%, not an invented conversion.
- **Consent aktif:** cohort members with `dataConsent` enabled and an active, unexpired company-pair Talent Pool consent for the selected requirement's company.
- **Talenta terverifikasi:** cohort members with a Professional Passport and at least one evidence item in `verified` status.
- **Matched:** cohort members with a non-declined matching record for the selected requirement.
- **Shortlist / pipeline:** cohort members in `shortlisted`, `interview`, or `placed`.
- **Placement simulation:** cohort members in `placed`; this remains a simulation and does not trigger employment, settlement, or messaging.
- **Keluhan / feedback:** non-sensitive operational feedback recorded for the selected anchors. Never put participant names, contacts, credentials, health information, government IDs, or payment details in the note.
- **Waktu respons Admin:** average elapsed hours from feedback creation to resolution, using only resolved feedback. The dashboard displays `N/A` until at least one item is resolved.

Refresh the dashboard after changing enrollment, diagnostic, transaction, consent, verification, matching, or feedback state. Record the selected program, requirement, company, session time, target 20, actual cohort count, and all displayed metrics in the approved pilot session record.

## Exactly 10 pilot operating scenarios

1. **Prepare the anchors:** in Development only, confirm exactly one intended published `Bimtek` program, one partner company, and one open workforce requirement are ready; record their display names and obtain approval before the session.
2. **Prepare the cohort:** invite no more than 20 fictional/consented pilot members, complete onboarding through the product UI, and confirm the selected program shows the intended non-cancelled enrollment count.
3. **Measure diagnostic conversion:** have pilot members complete readiness diagnostics, refresh Evaluasi pilot, and reconcile **Diagnostik selesai** against the session attendance record.
4. **Simulate program payment:** create only sandbox/manual `paid` program transactions linked to selected-program enrollments; confirm **Peserta berbayar** counts unique members rather than transactions.
5. **Measure completion:** update only genuinely completed pilot enrollments to `completed`; refresh and verify **Completion rate** uses all non-cancelled cohort members as its denominator.
6. **Validate passport, verification, and consent:** use fictional evidence, complete verification, grant time-bounded consent to the selected partner, and compare **Talenta terverifikasi** and **Consent aktif** without exposing participant details in the report.
7. **Validate matching and shortlist:** generate/review matches for only the selected requirement, move approved candidates through shortlist/interview, and verify the report counts unique cohort members without changing matching weights.
8. **Simulate placement:** mark only the approved pilot record `placed`, confirm **Placement simulation**, and verify this creates no real employment action, message, or settlement.
9. **Record and resolve feedback:** add one non-sensitive operational note in Evaluasi pilot, confirm it appears as open, resolve it, refresh, and verify **Keluhan / feedback** plus **Waktu respons Admin** update.
10. **Close and clean up:** capture the aggregate report, verify privileged controls remain role-protected, run `pilot:cleanup-user`, delete fictional Clerk Development accounts, run the exact `pilot:reset` command, and confirm the selected cohort, feedback audit entries, and run-prefixed rows are gone.

## Known limitations and ownership

There is no real payment-provider checkout. Payment pilot activity is sandbox/manual settlement simulation only. This runbook and seed tool do not change matching or consent logic. Separate existing tasks own: SLA worker, duplicate shortlist prevention, notification atomicity, consent-expiry reminder, reconciliation concurrency, and failed settlement ingestion.