# Audit production readiness PBA

Tanggal audit: 1 September 2026  
Deployment: `https://pba-asdamkindo.replit.app`  
Target: autoscale, public, current build successful

## Executive status

Production memiliki schema yang sama dengan development dan secret Clerk tersedia terpisah pada kedua environment. Database production saat audit berisi tiga program published, tanpa akun, profil, enrollment, transaksi, kebutuhan perusahaan, matching, atau audit log. Karena itu pilot belum membawa data pribadi atau pembayaran pengguna nyata.

Security scan akhir: 0 Critical, 0 High, 1 Moderate, dan 1 Low. SAST dan privacy/dataflow scan tidak menemukan finding. Perubahan remediation harus dipublish ulang sebelum dianggap aktif di production.

## Critical

Tidak ada temuan Critical.

## High

### H-01 — Credentialed CORS menerima origin apa pun — fixed, pending publish

- **Bukti:** API sebelumnya mengaktifkan reflective CORS dengan credentials.
- **Dampak:** browser dari origin tidak tepercaya dapat memperoleh izin cross-origin ber-credential.
- **Perbaikan:** CORS cross-origin dihapus. Web dan API memakai jalur same-origin `/api`, sehingga tidak memerlukan credentialed CORS.
- **Validasi:** request dengan `Origin: https://untrusted.example` tidak menerima `Access-Control-Allow-Origin` atau `Access-Control-Allow-Credentials`.

### H-02 — Health check tidak membuktikan database siap — fixed, pending publish

- **Bukti:** health check sebelumnya selalu menjawab `ok` tanpa query database.
- **Dampak:** instance dapat menerima traffic saat database putus, memicu kegagalan seluruh alur bisnis.
- **Perbaikan:** health check menjalankan query ringan `SELECT 1`, memberi `503` JSON aman saat gagal, dan error server/404 kini konsisten berbentuk JSON tanpa detail internal.
- **Validasi:** integration test readiness dan startup workflow lulus.

### H-03 — Tiga advisory dependency High — fixed, pending publish

- **Bukti awal:** `brace-expansion 5.0.8`, `fast-uri 3.1.4`, dan `js-yaml 4.3.0` memiliki advisory DoS/host-confusion.
- **Perbaikan:** workspace mengunci versi patched `5.0.9`, `3.1.5`, dan `4.3.1`.
- **Validasi:** security scan ulang menunjukkan 0 High dan 0 Critical.

### H-04 — Belum ada checkout payment-provider nyata — contained, pilot sandbox only

- **Bukti:** aplikasi memiliki transaksi, settlement ingestion, dan reconciliation, tetapi tidak memiliki checkout member, webhook provider, signature validation, atau provider event ID.
- **Dampak:** program berbayar dengan uang nyata tidak boleh dioperasikan sebagai alur otomatis.
- **Mitigasi pilot:** hanya gunakan fixture dan settlement sandbox/manual. Jangan menerima kartu, rekening, atau uang nyata sampai payment-provider production menjadi scope terpisah dan lulus audit.

## Medium

### M-01 — Background operations masih memiliki owner terpisah

Reminder SLA, reminder consent expiry, atomic notification pipeline, duplicate shortlist concurrency, reconciliation concurrency, dan failed settlement ingestion memiliki pekerjaan terpisah. Pilot harus mencatat status pekerjaan tersebut dan tidak menganggapnya selesai sebelum perubahan masing-masing merged dan dipublish.

### M-02 — Rate limiting dan abuse controls belum eksplisit

Clerk melindungi auth, tetapi API belum memiliki rate limit aplikasi yang terdokumentasi. Batasi volume pilot, pantau logs, dan evaluasi rate limit sebelum traffic publik diperluas.

### M-03 — Audit log hanya tampilan terbatas

Audit tersedia untuk super admin tetapi belum memiliki export, retention policy, dan pencarian/pagination operasional lengkap. Untuk pilot, simpan catatan sesi dan run ID di luar data fixture.

### M-04 — Advisory build-tool development

`esbuild 0.18.20` masih terdeteksi Moderate melalui dependency tooling. Paket ini bukan runtime production dan advisory berkaitan dengan development server. Jangan mengekspos dev server ke internet; upgrade parent dependency saat versi kompatibel tersedia.

### M-05 — Program production perlu pengesahan bisnis

Production berisi tiga program published. Tidak ada penanda demo atau credential demo, tetapi nama instruktur, harga, jadwal, dan kapasitas tetap harus disahkan pemilik program sebelum pilot publik.

## Low

### L-01 — Advisory esbuild Windows development

`esbuild 0.27.3` memiliki advisory Low untuk development server di Windows. Runtime Replit production tidak menjalankan Vite/esbuild dev server dan host berjalan di Linux.

### L-02 — Route editorial `/video`

Route video publik adalah konten editorial produk, bukan endpoint development. Pastikan narasi dan visual tetap sesuai materi publik sebelum kampanye pilot.

## Environment, auth, database, and privacy evidence

- Clerk terkelola Replit menggunakan user store Development dan Production yang terpisah.
- Publishable key, secret key, frontend publishable key, dan session secret terdaftar pada Development dan Production; nilainya tidak dibaca atau dicetak.
- Production dan development memiliki 19 tabel publik dan signature kolom yang sama saat audit.
- Production baseline: 0 users, 0 member/company profiles, 0 diagnostics, 0 enrollments, 0 requirements, 0 matchings, 0 transactions, dan 0 audit logs.
- Tiga program production berstatus published; tidak ditemukan credential demo, auth bypass, mock user, atau data “Gustafta”.
- Route Admin tanpa session menjawab `401` JSON. Payload matching tetap memakai batas privacy dan opaque candidate identifier yang telah lulus quality gate.
- Mockup sandbox tidak dipublish sebagai bagian aplikasi utama.

## Release gate

1. Publish remediation H-01 sampai H-03.
2. Verifikasi `/api/healthz`, unauthenticated Admin response, JSON 404, dan CORS pada URL production.
3. Konfirmasi backup harian/PITR aktif serta operator restore berwenang.
4. Sahkan tiga program production dan tentukan operator Admin/Super Admin.
5. Jalankan pilot dengan sandbox/manual settlement saja.
6. Jangan memperluas pilot ke uang atau data nyata sebelum seluruh High berstatus fixed/contained dan pekerjaan operasional terkait selesai.