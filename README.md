# PBA ASDAMKINDO

Aplikasi PBA ASDAMKINDO menghubungkan perjalanan anggota, kebutuhan perusahaan,
verifikasi, pencocokan, dan operasi Admin. Aplikasi terdiri dari web React/Vite,
API Express, serta library bersama dalam workspace pnpm.

## Menjalankan di Replit

Gunakan workflow yang tersedia di Replit:

- `artifacts/pba-asdamkindo: web` untuk aplikasi web.
- `artifacts/api-server: API Server` untuk API.

Web memakai API same-origin pada `/api`. Jangan menambahkan URL localhost atau
alamat preview ke kode aplikasi.

## Pemeriksaan

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run test
```

Suite API memakai database untuk integration test dan mengatur kanal alarm
menjadi receiver aman/stub; suite tidak boleh mengirim alarm sungguhan.

Build rilis web dan API ditentukan oleh konfigurasi artifact masing-masing.
Build workspace penuh juga mencakup mockup sandbox yang membutuhkan `PORT` dan
`BASE_PATH`; sandbox tersebut bukan bagian dari aplikasi PBA yang dipublikasikan.

## Database dan data pilot

Schema dikelola melalui Drizzle. Perubahan schema pengembangan dapat diterapkan
dengan:

```sh
pnpm --filter @workspace/db run push
```

Jangan jalankan perintah tersebut ke database produksi tanpa prosedur dan
persetujuan perubahan schema yang berlaku. Seed dan reset pilot hanya diizinkan
untuk database development dan memerlukan flag konfirmasi; ikuti
[`docs/production-readiness-pilot-runbook.md`](docs/production-readiness-pilot-runbook.md).

## Batasan yang perlu diketahui

- Checkout dan pemrosesan pembayaran nyata belum tersedia. Transaksi pilot
  hanya simulasi sandbox/manual.
- Tombol **Kirim UJI ALARM** menguji kanal pengiriman dan alur ACK, tetapi tidak
  menjadwalkan pengingat ACK Slack. Ikuti
  [`docs/on-call-runbook.md`](docs/on-call-runbook.md); pengujian pengingat
  otomatis memerlukan pemicu khusus.
- Pengujian manual dengan sesi Admin dan penerimaan notifikasi pada perangkat
  tetap harus dilakukan operator; suite otomatis tidak membuktikan keduanya.

## Runbook

- [Operasi alarm piket](docs/on-call-runbook.md)
- [Kesiapan produksi dan pilot](docs/production-readiness-pilot-runbook.md)
- [Pemulihan data anggota](docs/member-data-recovery-runbook.md)
- [Audit kesiapan produksi](docs/production-readiness-audit.md)
