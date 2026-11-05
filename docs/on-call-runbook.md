# Alarm piket PBA ASDAMKINDO

## Kanal dan tanggung jawab

- Kanal yang dipilih pengguna: Slack **#social**.
- Penanggung jawab yang ditunjuk pengguna: **Wuryanto**.
- Jadwal uji yang diminta pengguna: **tanggal 25 setiap bulan**.
- Pengaturan yang disetujui pengguna: Wuryanto menjadi petugas tetap tanpa
  rotasi; belum ada petugas cadangan. Uji dilakukan pukul **09.00 WIB**
  (**Asia/Jakarta**) setiap tanggal 25.
- Jadwal di atas adalah jadwal **uji manual**, bukan otomatisasi bulanan.

**Alasan:** pengguna menyetujui pengaturan tersebut. Selama belum ada cadangan,
ketidakhadiran Wuryanto berarti tidak ada penerima pengganti yang disepakati.

## Konfigurasi aman

Integrasi Slack menyediakan autentikasi melalui Replit Connectors SDK.
Jangan menyalin token Slack ke kode, chat, atau log.

Konfigurasi non-rahasia untuk lingkungan yang akan menerima alarm:

```text
ON_CALL_CHANNEL=slack
ON_CALL_SLACK_CHANNEL_ID=C0CBJC5BMFH
```

Konfigurasi pengiriman yang sudah ada tetap berlaku:
`ON_CALL_WEBHOOK_MAX_ATTEMPTS` (default 3),
`ON_CALL_WEBHOOK_RETRY_BASE_MS` (default 250 ms),
`ON_CALL_WEBHOOK_TIMEOUT_MS` (default 5000 ms).
Untuk kembali menggunakan webhook, pilih `ON_CALL_CHANNEL=webhook` dan simpan
`ON_CALL_WEBHOOK_URL` melalui Secrets. Tidak ada perpindahan otomatis ke kanal
lain ketika Slack gagal.

Konfigurasi saat pengembangan tidak membuktikan konfigurasi pada aplikasi utama
atau produksi. Setelah perubahan digabung, pastikan integrasi Slack dan variabel
tersebut tersedia di lingkungan tujuan. Jangan menerbitkan aplikasi hanya untuk
melakukan uji ini.

## Uji penerimaan nyata

1. Penanggung jawab memastikan petugas sudah bergabung ke #social, mengaktifkan
   notifikasi perangkat, dan memeriksa pengaturan jangan-ganggu. Jangan menganggap
   pesan kanal otomatis membunyikan perangkat.
2. Admin masuk ke **Operasional → Alarm piket** lalu menekan **Kirim UJI ALARM**
   satu kali. Pesan jelas berlabel uji, bukan insiden.
3. Periksa status **delivered**, waktu, jumlah percobaan, dan ID di dashboard.
   Endpoint yang sama tersedia untuk admin:
   `POST /api/admin/observability/test-alert`.
   Pemeriksaan status: `GET /api/admin/observability`.
4. Petugas mengonfirmasi bahwa notifikasi benar-benar diterima di perangkat,
   bukan hanya menemukan pesan setelah membuka Slack. Balas pesan uji di Slack
   dengan waktu penerimaan. Simpan bukti penerimaan dalam catatan operasional.
5. Bila perangkat tidak berbunyi, uji belum lulus meskipun status `delivered`.
   Periksa notifikasi Slack/perangkat dan pertimbangkan layanan paging dengan
   eskalasi jika Slack tidak cukup.

Ulangi uji setiap tanggal 25, setelah pergantian petugas/perangkat, atau perubahan
integrasi. Pembatasan satu uji per menit berlaku per proses server, termasuk
permintaan bersamaan. Jangan mengubah metrik produksi untuk memicu alarm uji.

## Arti status dan batasan

- `disabled`: kanal belum dikonfigurasi.
- `pending`: pengiriman sedang berlangsung.
- `delivered`: penyedia menerima pesan; **bukan** konfirmasi penerimaan manusia.
- `failed`: seluruh percobaan pengiriman gagal. Periksa kode kegagalan di
  dashboard dan kesehatan integrasi. Slack HTTP 200 dengan `ok:false` tetap gagal.

Status dan deduplikasi lokal disimpan dalam memori proses, dibatasi jumlahnya,
dan direset saat server dimulai ulang. Pada beberapa instance, riwayat
masing-masing berbeda. ID pengiriman tetap sama saat retry; pesan yang sudah
tercatat delivered tidak dikirim ulang oleh proses yang sama.
Riwayat ini bukan arsip audit insiden permanen.

## Bukti uji pengembangan

Pada 5 November 2026 pukul 09.50 WIB, satu alarm berlabel
`UJI ALARM — PBA ASDAMKINDO (bukan insiden)` dikirim dari tombol admin:

- API pengiriman: HTTP 200, `delivered`, percobaan 1.
- Dashboard dari server yang sama: `delivered`, tanpa delivery gagal/tertunda.
- Pesan ditemukan kembali melalui API Slack di kanal tujuan #social.
- ID pengiriman: `17e030a0-50e8-4796-a6ff-9b234e0ab5bb`.
- Penerimaan notifikasi pada perangkat Wuryanto: **dikonfirmasi oleh pengguna
  pada 5 November 2026** melalui jawaban “Ya, notifikasi perangkat diterima”.

Hasil ini membuktikan pengiriman di lingkungan pengembangan dan penerimaan
notifikasi pada perangkat berdasarkan konfirmasi pengguna. Hasil ini bukan
bukti aktivasi pada lingkungan produksi.

## Keselamatan pengujian otomatis

Test runner menonaktifkan kanal nyata sebelum menjalankan suite. Pengujian retry,
kontrak, cooldown, dan izin menggunakan receiver lokal atau stub konektor Slack.
Jangan menjalankan suite dengan konfigurasi yang mengirim alarm sungguhan.
