# Runbook pemulihan data anggota

## Sasaran dan ruang lingkup

Runbook ini berlaku untuk `users`, profil anggota/perusahaan, Professional Passport, seluruh consent, diagnostik dan evidence, program/enrollment/progress, record verifikasi, matching, transaksi, notifikasi, audit, serta antrean rekonsiliasi. Pemilik layanan menyetujui target berikut:

| Sasaran | Target |
| --- | --- |
| RPO | Maksimum 24 jam untuk backup terjadwal; gunakan PITR untuk target kehilangan data maksimum 15 menit bila tersedia pada paket aktif |
| RTO | 4 jam sejak keputusan restore disetujui sampai validasi selesai dan layanan dapat dibuka |
| Retensi recovery | 28 hari bila paket Pro/Enterprise mendukungnya; minimum 7 hari pada Core |
| Restore drill | Setiap kuartal dan setelah perubahan besar pada schema/strategi backup |

RPO 15 menit hanya boleh dilaporkan tercapai jika operator telah membuktikan pilihan recovery point tersebut di Database tool. Jika tidak, status operasionalnya adalah RPO 24 jam.

## Kontrol backup dan bukti

Replit SQL Database menyediakan backup production terjadwal/PITR dalam lingkungan terisolasi dan enkripsi at-rest AES-256. Retensi yang didokumentasikan adalah default 7 hari dan dapat diperpanjang sampai 28 hari untuk paket yang mendukung. Sumber otoritatif: [Data recovery](https://docs.replit.com/features/data-and-storage/data-recovery) dan [Development and production databases](https://docs.replit.com/features/data-and-storage/development-and-production).

Pada awal setiap bulan, operator:

1. Buka pengaturan Database production dan pastikan scheduled backup/PITR aktif.
2. Pastikan retention window sesuai tabel target di atas.
3. Catat waktu backup terbaru, recovery point tertua, paket/retensi, operator, dan hasil verifikasi pada tiket kontrol bulanan. Jangan salin connection string atau PII.
4. Pastikan sedikitnya dua operator berwenang mengetahui prosedur restore dan aksesnya mengikuti least privilege.
5. Jika backup terbaru lebih tua dari 24 jam, retention berkurang, atau kontrol tidak dapat diakses, buka insiden dan jangan menyatakan RPO tercapai.

Backup platform adalah sumber pemulihan resmi. Jangan menyalin dump production ke repository, workspace bersama, laptop, atau object storage tanpa kontrol enkripsi, akses, dan lifecycle yang disetujui.

## Prosedur insiden

1. Hentikan write dengan maintenance mode/pembatasan akses yang disetujui. Simpan waktu dugaan awal kerusakan.
2. Tetapkan incident commander, operator restore, validator, dan approver. Operator dan approver harus berbeda.
3. Tentukan recovery point terakhir sebelum kerusakan dan cocokkan dengan versi aplikasi/schema pada saat itu. Database restore tidak memulihkan code.
4. **Jangan restore langsung ke production sebagai drill.** Buat database/lingkungan restore terisolasi melalui kontrol recovery Replit dan batasi akses hanya ke tim insiden.
5. Pulihkan backup/PITR yang dipilih ke target terisolasi dengan credential/endpoint restore-only. Jangan menghubungkan Clerk production, webhook, email, settlement, atau integration eksternal ke target tersebut.
6. Security owner yang berbeda dari operator memverifikasi endpoint target pada Database tool, lalu membuat attestation eksternal bertanda tangan. `RECOVERY_RESTORE_DATABASE_URL` hanya tersedia saat pembuatan attestation; jangan menaruh URL di argumen atau file:

   ```sh
   pnpm --filter @workspace/scripts recovery:attest -- \
     --drill-id drill-YYYY-QN \
     --backup-id <id-recovery-point-platform> \
     --security-owner-approved \
     --output recovery-evidence/drill-YYYY-QN.attestation.json
   ```

   Tool tidak membuka koneksi database. Attestation mengikat hash endpoint, drill, backup, issuance, dan expiry maksimum 24 jam dengan `RECOVERY_ATTESTATION_HMAC_KEY`. Validator memeriksa tanda tangan dan kecocokan hash `DATABASE_URL` sebelum query database pertama. Dengan demikian URL production yang tidak ditandatangani ditolak tanpa koneksi/query.
7. Jalankan validator di bawah. Report hanya berisi hitungan, hasil relasi, fingerprint database non-reversibel, dan ID backup—tanpa PII.
8. Bandingkan hitungan report dengan baseline kontrol sebelum insiden dan jelaskan setiap selisih. Semua pemeriksaan `critical` harus nol.
9. Lakukan smoke check read-only untuk satu alur anggota fiktif/non-PII: profil → passport → consent → enrollment → transaksi/audit.
10. Validator dan approver menandatangani keputusan. Jika gagal, pilih recovery point lain atau eskalasi; jangan membuka traffic.
11. Untuk insiden nyata, jalankan restore production hanya melalui kontrol Replit setelah approval. Selaraskan code ke versi kompatibel, lalu buka read traffic sebelum write traffic.
12. Pantau error, hitungan record, consent exposure, transaksi, dan audit selama minimal 60 menit. Catat waktu layanan pulih untuk mengukur RTO.
13. Hapus target drill sesuai bagian retensi setelah bukti non-PII disimpan.

## Menjalankan validasi pada restore terisolasi

Set `DATABASE_URL` hanya ke endpoint restore-only yang sama dengan attestation. Jangan memakai URL production. Pengaman tool menolak deployment/production dan memerlukan attestation bertanda tangan yang cocok dengan endpoint, drill, dan backup sebelum membuka koneksi.

Sebelum drill, privacy owner mengekspor authoritative erasure ledger dari sistem tiket/records yang terpisah dari database aplikasi sebagai JSON berisi hanya hash subjek, misalnya `[{"subjectHash":"<64 hex>"}]`. Hash dibuat dengan HMAC-SHA256 atas Clerk user ID menggunakan secret `RECOVERY_ERASURE_HMAC_KEY`; secret dikelola melalui Replit Secrets, tidak ditulis ke file/report/log, dan minimal 32 karakter. File ledger disimpan akses-terbatas dan tidak di-commit.

```sh
RECOVERY_DRILL_ISOLATED=true \
pnpm --filter @workspace/scripts recovery:validate -- \
  --target isolated-restore \
  --confirm-isolated-restore \
  --drill-id drill-YYYY-QN \
  --backup-id <id-recovery-point-platform> \
  --attestation recovery-evidence/drill-YYYY-QN.attestation.json \
  --erasure-ledger <path-ledger-json> \
  --output recovery-evidence/drill-YYYY-QN.json
```

Exit `0` berarti seluruh pemeriksaan kritis lulus, `2` berarti report dibuat tetapi ada pelanggaran kritis, dan `1` berarti tool gagal/menolak dijalankan. Simpan report pada penyimpanan bukti akses-terbatas, bukan commit Git. Report menghitung seluruh tabel dalam scope, memeriksa setiap foreign key yang ditemukan pada schema hasil restore, seluruh verification type yang didukung (`competency`, legacy `profile`, dan legacy external `document`), seluruh audit entity type yang dikenal, konsistensi matching, referensi transaksi program, nilai uang negatif, kronologi consent, dan memastikan identitas pada erasure ledger tidak muncul kembali. Type verification/audit yang tidak dikenal menjadi kegagalan kritis. Record `document` saat ini self-contained: integritasnya mensyaratkan ID/nama/jenis bukti tidak kosong dan audit dokumen menunjuk subject verifikasi yang ada. Produk belum menyimpan binary object dokumen; bila upload object mulai digunakan, backup dan checksum object menjadi kontrol terpisah.

## Jadwal restore drill dan kriteria lulus

Jadwalkan drill pada Januari, April, Juli, dan Oktober, dengan owner bergilir. Drill lulus bila:

- recovery point berada dalam RPO yang dinyatakan;
- restore selesai pada target terisolasi;
- validator selesai dengan semua pemeriksaan kritis nol;
- hitungan tabel kritis direkonsiliasi dengan baseline;
- tidak ada traffic/integration production yang menyentuh target;
- durasi total tidak melebihi RTO 4 jam;
- bukti mencatat backup ID, waktu, operator, approver, durasi, hasil, dan tindak lanjut tanpa PII.

Kegagalan drill adalah temuan operasional: buat tindak lanjut dengan owner dan tenggat, lalu ulangi bagian yang gagal dalam 14 hari.

## Retensi, penghapusan, dan anonymization PII

| Data | Retensi aktif | Tindakan akhir |
| --- | --- | --- |
| Profil, passport, evidence, consent aktif | Selama akun/keanggotaan aktif dan masih diperlukan | Hapus atau anonymize dalam 30 hari setelah permintaan/berakhirnya dasar pemrosesan, kecuali legal hold |
| Consent history dan audit keamanan | 5 tahun setelah aksi terakhir | Pertahankan bukti minimum; anonymize nama/email/free text yang tidak diperlukan |
| Transaksi dan rekonsiliasi | 10 tahun atau masa wajib yang ditetapkan penasihat hukum, mana yang berlaku | Anonymize identitas non-esensial; pertahankan nilai/referensi yang wajib |
| Notifikasi operasional | 180 hari | Hapus |
| Target restore drill | Maksimum 7 hari setelah drill | Hapus seluruh database target |
| Report drill non-PII | 2 tahun | Hapus |

Penghapusan dari database aktif dicatat di audit tanpa memasukkan PII yang dihapus. Privacy owner juga menambahkan HMAC subjek ke authoritative erasure ledger yang disimpan pada sistem records terpisah dengan retensi sekurangnya sepanjang retention backup ditambah 30 hari. Backup immutable tidak diedit per-record: PII yang telah dihapus dapat tetap ada sampai backup melewati retention window dan tidak boleh dipakai kembali untuk operasi normal. Setiap restore wajib memakai ledger terbaru; bila validator menemukan identitas terhapus, privacy owner menjalankan kembali prosedur deletion/anonymization pada target restore lalu mengulang validasi sebelum layanan dibuka. Legal hold harus terdokumentasi, dibatasi scope/waktu, dan disetujui. Kebijakan ini wajib ditinjau penasihat hukum sebelum production karena masa retensi final bergantung pada kewajiban organisasi dan yurisdiksi.

## Template bukti drill

- Drill ID:
- Incident/ticket:
- Backup/PITR ID dan recovery time:
- Backup terbaru/tertua dan retention window:
- Operator / validator / approver:
- Mulai / restore selesai / validasi selesai / total durasi:
- Fingerprint database:
- Lokasi report akses-terbatas:
- Semua critical check nol: ya/tidak
- Rekonsiliasi count disetujui: ya/tidak
- Production integration terhubung: harus tidak
- Target restore dihapus pada:
- Temuan, owner, dan tenggat: