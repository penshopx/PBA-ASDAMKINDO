# PBA ASDAMKINDO

Platform pengembangan bisnis, kompetensi, dan karier tenaga konstruksi untuk anggota, perusahaan, dan tim operasional PBA.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pba-asdamkindo` — aplikasi web utama, routing, dan design system frontend.
- `artifacts/api-server` — REST API Express pada path `/api`.
- `lib/api-spec/openapi.yaml` — kontrak API sumber tunggal.
- `lib/db/src/schema` — schema PostgreSQL/Drizzle.
- `attached_assets` — dokumen referensi master prompt produk.

## Architecture decisions

- Fase pertama memakai Clerk Auth terkelola Replit; browser menggunakan session cookie same-origin.
- API dikembangkan contract-first lewat OpenAPI lalu codegen ke client React Query dan schema Zod.
- Data program publik disimpan di PostgreSQL; data pengguna dibuat saat pertama kali session Clerk mengakses API.
- Role onboarding perusahaan mengubah akun dari role awal `member` menjadi `company` setelah form lengkap.

## Product

Fase Foundation menyediakan landing page publik, autentikasi, onboarding, dashboard awal per role, katalog program, serta notifikasi in-app. Modul perjalanan anggota, Talent Pool, matching, dan pipeline akan dibangun setelah fondasi stabil.

## User preferences

- Seluruh antarmuka menggunakan Bahasa Indonesia.
- Format mata uang Rupiah dan konteks tanggal Indonesia/Asia Jakarta.
- Gunakan data fiktif; jangan menampilkan klaim kelulusan, sertifikasi, atau jaminan kerja.

## Gotchas

- Setelah mengubah `lib/api-spec/openapi.yaml`, jalankan `pnpm --filter @workspace/api-spec run codegen`.
- Schema database memakai `zod/v4` agar cocok dengan `drizzle-zod` pada workspace ini.
- Restart workflow managed setelah mengubah konfigurasi server atau frontend.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
