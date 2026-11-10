<div align="center">
  <img src="fav.svg" width="88" height="88" alt="SIM SPPG" />
  <h1>SIM SPPG</h1>
  <p><strong>Sistem Informasi Manajemen Satuan Pelayanan Pemenuhan Gizi</strong></p>
  <p>Workspace operasional untuk mengelola data dapur, rekening, transaksi, pencairan, impor, dan laporan dalam satu aplikasi.</p>
  <p>
    <a href="https://rversse.github.io/sim-sppg/"><strong>BUKA APLIKASI ↗</strong></a>
  </p>
  <p>
    <a href="https://github.com/Rversse/sim-sppg/actions/workflows/check.yml"><img alt="CI" src="https://github.com/Rversse/sim-sppg/actions/workflows/check.yml/badge.svg?branch=main" /></a>
    <a href="https://github.com/Rversse/sim-sppg/actions/workflows/deploy.yml"><img alt="GitHub Pages" src="https://github.com/Rversse/sim-sppg/actions/workflows/deploy.yml/badge.svg?branch=main" /></a>
    <img alt="React" src="https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" />
    <img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white" />
  </p>
</div>

---

## Tentang proyek

**SIM SPPG** adalah aplikasi manajemen operasional yang menggabungkan pemantauan aktivitas, pengelolaan master data, pencatatan transaksi, proses impor, dan pelaporan.

Repository ini bersifat **public** untuk transparansi dan pengelolaan kode. Data operasional tetap menggunakan layanan Supabase yang dikonfigurasi untuk aplikasi; repository tidak menyediakan akun, PIN, atau kredensial akses.

## Modul aplikasi

| Area | Modul | Cakupan |
| --- | --- | --- |
| **Dashboard** | Ringkasan operasional | Ringkasan transaksi, filter periode dan dapur, status pencairan, serta riwayat aktivitas. |
| **Master Data** | Data Dapur | Data dan status dapur. |
| | Data Rekening | Rekening penampung, rekening tujuan, serta mapping rekening untuk kebutuhan operasional. |
| | Data Kendaraan | Data kendaraan dan pemantauan masa berlaku dokumen. |
| | Data Supplier | Data supplier dan informasi rekening terkait. |
| **Transaksi** | Transaksi Bank | Saldo rekening, transfer masuk/keluar, riwayat transaksi, dan ekspor Excel. |
| | Import Maker | Parsing hasil Maker, pencocokan rekening dan tujuan operasional, validasi, pemeriksaan duplikat, serta review sebelum penyimpanan. |
| | Import RAB / Real | Impor laporan realisasi belanja harian, normalisasi dapur/tanggal, validasi nilai, dan pemeriksaan duplikat. |
| **Laporan** | Laporan operasional | Rekap pencairan belanja, pemasukan lainnya, dan pencairan operasional dengan filter periode serta ekspor. |

### Aplikasi pendamping

Untuk akun Admin, navigasi juga menyediakan shortcut ke dua aplikasi terpisah:

- [Maker-Pencairan](https://rversse.github.io/maker-pencairan/)
- [Pencairan-Gen](https://rversse.github.io/catatan-pencairan-gen/)

Keduanya bukan bagian dari bundle atau route aplikasi SIM-SPPG ini.

## Teknologi

| Lapisan | Teknologi |
| --- | --- |
| UI | React 19, TypeScript 6 |
| Build | Vite 8 |
| Styling | Tailwind CSS 4, CSS modular per halaman/komponen |
| Navigasi | React Router 7 |
| UI primitives | Base UI, Lucide React |
| Backend & database | Supabase Auth, Edge Functions, PostgreSQL |
| Ekspor | ExcelJS |
| Quality checks | ESLint, Node.js test runner, TypeScript |
| Hosting | GitHub Pages via GitHub Actions |

## Hak akses

Akses halaman dan aksi dikendalikan melalui role dan permission di `src/features/auth/role-policy.ts`.

| Role | Akses ringkas |
| --- | --- |
| **Admin** | Seluruh modul: Dashboard, Master Data, Transaksi, Import, dan Laporan; termasuk pengelolaan data sesuai permission. |
| **Operator** | Dashboard, melihat data dapur/supplier, mengelola data kendaraan, serta melihat, membuat, dan mengekspor transaksi bank. |
| **Viewer** | Akses baca untuk Transaksi Bank. |

Route juga dilindungi oleh komponen `ProtectedRoute` dan `RoleRoute`. Pembatasan di UI bukan pengganti kebijakan keamanan database: setiap perubahan backend harus tetap mempertahankan kontrol akses Supabase/RLS yang relevan.

## Menjalankan secara lokal

### Prasyarat

- Node.js **24** (versi yang digunakan workflow CI).
- npm.
- Proyek Supabase yang sudah dikonfigurasi untuk SIM-SPPG.

### 1. Clone dan install

```bash
git clone https://github.com/Rversse/sim-sppg.git
cd sim-sppg
npm ci
```

### 2. Siapkan environment

Buat file `.env.local` di root proyek:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Ganti placeholder dengan nilai dari proyek Supabase yang digunakan. Jangan commit file environment, PIN, token, atau secret.

> Variabel dengan prefix `VITE_` akan tersedia di bundle browser. Gunakan **publishable key** untuk client aplikasi; jangan pernah menaruh `service_role` key atau secret server-side di variabel `VITE_`.

### 3. Jalankan development server

```bash
npm run dev
```

Buka URL yang ditampilkan Vite. Base path aplikasi dikonfigurasi sebagai `/sim-sppg/` agar konsisten dengan deployment GitHub Pages.

## Perintah proyek

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan development server. |
| `npm run lint` | Menjalankan ESLint. |
| `npm test` | Menjalankan unit test parser/import. |
| `npm run build` | Type-check dan membuat production build. |
| `npm run preview` | Menjalankan preview dari hasil build. |
| `npm run check` | Menjalankan lint, test, dan production build secara berurutan. |

Sebelum perubahan dikirim ke `main`, jalankan:

```bash
npm run check
```

## Struktur repository

```text
.
├── .github/
│   └── workflows/          # CI dan deployment GitHub Pages
├── public/                 # Aset publik
├── src/
│   ├── app/                # App shell, router, lazy loading
│   ├── components/ui/      # Komponen UI bersama
│   ├── features/           # Auth, transaksi, dashboard, import, laporan, dll.
│   ├── lib/                # Supabase client dan helper
│   ├── pages/              # Halaman aplikasi
│   └── styles/             # CSS global, halaman, dan responsive layer
├── supabase/
│   ├── functions/          # Supabase Edge Functions
│   └── migrations/         # Riwayat perubahan schema dan aturan database
├── tests/                  # Unit tests
├── index.html
├── package.json
└── vite.config.ts
```

## Responsiveness & UI

Layout menggunakan pendekatan responsive untuk desktop, tablet, ponsel, dan layar foldable. Lapisan perangkat berada di `src/styles/device-responsive.css`, dimuat setelah stylesheet komponen agar aturan breakpoint memiliki urutan yang jelas.

Area yang ditangani meliputi navigasi, dashboard, tabel, form, importer, modal, date picker, notifikasi, safe area, serta orientasi landscape. Tabel dengan banyak kolom menggunakan area scroll horizontal tersendiri agar halaman tidak ikut melebar.

Breakpoint CSS membantu adaptasi layout, tetapi bukan klaim bahwa setiap kombinasi perangkat/browser fisik sudah diuji satu per satu.

## CI & deployment

GitHub Actions menjalankan dua workflow:

1. **Check SIM-SPPG** — dipicu oleh pull request dan push ke `main`. Menjalankan install, laporan audit dependency, lalu `npm run check`.
2. **Deploy SIM-SPPG to GitHub Pages** — dipicu oleh push ke `main` atau manual melalui `workflow_dispatch`. Build diperiksa sebelum artefak dipublikasikan ke GitHub Pages.

Workflow membutuhkan repository Actions Variables berikut:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

**Production URL:** [https://rversse.github.io/sim-sppg/](https://rversse.github.io/sim-sppg/)

## Catatan integritas data

Beberapa batas domain yang harus dijaga saat mengembangkan aplikasi:

- Transaksi operasional Dashboard dan ledger Transaksi Bank merupakan sumber data yang berbeda.
- Flow `real_ops` digunakan untuk realisasi operasional; flow ini tidak dimasukkan ke ledger Transaksi Bank.
- Saldo rekening dihitung dari saldo awal dan mutasi yang relevan, bukan sekadar total laporan pada periode terpilih.
- Aturan bisnis yang melibatkan transaksi, mapping, impor, atau perhitungan laporan perlu diperiksa bersama service TypeScript dan migration SQL terkait.
- Jangan mengubah schema, RPC, permission, atau kebijakan database hanya untuk menyelesaikan perubahan tampilan.

## Kontribusi & perubahan

Untuk perubahan fitur atau perbaikan:

1. Periksa halaman, service, permission, dan migration yang terdampak.
2. Pertahankan aturan bisnis dan kontrak data yang sudah berjalan.
3. Hindari menambahkan override CSS global jika aturan tersebut hanya berlaku untuk satu komponen.
4. Jalankan `npm run check`.
5. Pastikan hasil UI tetap masuk akal pada desktop, tablet, ponsel, dan foldable sebelum perubahan diintegrasikan.

---

<div align="center">
  <sub>SIM SPPG · Operations, Finance & Reporting</sub>
  <br />
  <sub>Built for clear workflows, accountable data, and maintainable operations.</sub>
</div>
