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

**SIM SPPG** adalah aplikasi manajemen operasional dan keuangan untuk mengelola data dapur, rekening, transaksi bank, transaksi operasional, impor RAB/Real dan Maker, pencairan, supplier, kendaraan, perhitungan gaji, serta laporan dalam satu workspace.

Repository ini bersifat **public** untuk transparansi dan pengelolaan kode. Data operasional tetap menggunakan layanan Supabase yang dikonfigurasi untuk aplikasi; repository tidak menyediakan akun, PIN, atau kredensial akses.

## Status program saat ini

**Snapshot: 20 November 2026.** SIM-SPPG aktif dikembangkan dan branch utama memuat modul operasional berikut:

- Dashboard operasional dengan filter periode dan dapur.
- Master data dapur, rekening, supplier, serta kendaraan.
- Ledger Transaksi Bank yang terpisah dari transaksi operasional.
- Import Maker dan Import RAB / Real dengan validasi, pemeriksaan duplikat, serta jejak audit batch.
- Input Belanja Harian Real khusus role Koperasi.
- Laporan operasional dan perhitungan alokasi gaji.

Frontend dipublikasikan melalui GitHub Pages. Autentikasi, database, fungsi RPC, dan migration berjalan melalui proyek Supabase SIM-SPPG. CI memeriksa perubahan melalui GitHub Actions; deployment ke Pages dijalankan pada push ke main.

Pembaruan terakhir yang tercatat di database: migration 20261120011504_preserve_ops_harian_neutral_notes. Migration ini mempertahankan catatan asli transaksi OPS HARIAN pada rekening Netral Arutala dan mencegah catatan OPS kosong otomatis berubah menjadi teks Gas.

## Modul aplikasi

| Area | Modul | Cakupan |
| --- | --- | --- |
| **Dashboard** | Ringkasan operasional | Ringkasan transaksi dan realisasi, filter periode/dapur, status harian, serta aktivitas operasional. |
| **Master Data** | Data Dapur | Identitas dapur, PIC, yayasan, alamat, penerima operasional, dan status aktif. |
| | Data Rekening | Rekening supplier/penampung, saldo awal, rekening tujuan, dan mapping rekening per dapur. |
| | Data Kendaraan | Data kendaraan, nomor polisi, masa berlaku PKB/STNK, serta notifikasi dokumen. |
| | Data Supplier | Profil supplier, pemilik usaha, kontak, alamat, jenis produk, dan rekening terkait. |
| **Transaksi** | Transaksi Bank | Saldo rekening, transfer masuk/keluar, biaya admin, riwayat, koreksi transaksi, dan ekspor Excel. |
| | Import Maker | Parsing output Maker, pencocokan rekening dan mapping tujuan, validasi manual, pemeriksaan duplikat, konfirmasi batch, serta penyimpanan jejak sumber untuk audit. |
| | Import RAB / Real | Admin dapat memproses sumber Real melalui parser dan validasi batch. Role Koperasi mendapat form Belanja Harian Real untuk menginput nominal per dapur dan melihat transaksi hariannya sendiri. |
| **Laporan** | Laporan operasional | Rekap keseluruhan, pencairan, dan supplier dengan filter periode, ekspor Excel, serta opsi cetak. |
| | Perhitungan Gaji | Mengalokasikan 30% dari total RAB dapur dan membaginya ke jabatan berdasarkan persentase yang dikonfigurasi per dapur. |

### Detail alur penting

#### Import Maker

Import Maker menerima teks output Maker, kemudian membangun draft transaksi yang dapat diperiksa sebelum disimpan. Prosesnya mencakup:

- Identifikasi tanggal dan dapur dari header sumber.
- Parsing kategori seperti RAB, GAS, OPS HARIAN, insentif fasilitas SPPG, gaji relawan, insentif PIC, dan Lain-lain.
- Pencocokan nama penerima, bank, nomor rekening, rekening yang dimapping, serta aturan rekening operasional.
- Validasi nominal dan detail, keputusan Admin untuk baris Lain-lain, serta pemeriksaan duplikat.
- Penyimpanan batch, baris sumber, hasil validasi, dan status impor/pengecualian sebagai jejak audit.

**Aturan khusus OPS HARIAN Arutala:** transaksi yang memakai rekening Netral Koperasi Arutala dan mapping dapur yang sesuai dicatat sebagai kategori OPS / Arutala. Catatan mengikuti teks sumber Maker, termasuk Ops Harian atau catatan pembelian seperti Gas 12kg (3 tabung). Catatan OPS yang kosong tetap kosong; tidak diisi otomatis dengan Gas. Ini berbeda dari transaksi sumber kategori GAS.

#### Belanja Harian Real

Role Koperasi diarahkan langsung ke menu **Belanja Harian Real**. Pengguna memasukkan nominal untuk dapur pada tanggal yang dipilih, melihat transaksi yang disimpan untuk akunnya, menyalin ringkasan harian, serta mengoreksi nominal atau menghapus transaksi miliknya sesuai aturan aplikasi.

Pada form saat ini, dapur Cisepat dan Kertajadi memiliki input terpisah untuk sumber Arutala Cianjur dan Arutala Cidaun. Dapur lainnya menggunakan satu input umum Arutala Cianjur.

#### Perhitungan Gaji

Modul Admin menghitung alokasi sebesar **30% dari total RAB** untuk dapur dan periode terpilih. Alokasi dibagi ke Akuntan, Ahli Gizi, Aslap, dan Kepala SPPG. Persentase dapat dikonfigurasi per dapur dan jumlahnya harus tepat 100% sebelum disimpan.

#### Pemisahan pencatatan

SIM-SPPG menjaga dua domain pencatatan yang berbeda:

- **Transaksi Bank** mencatat mutasi rekening, transfer, biaya admin, saldo awal, dan saldo rekening.
- **Transaksi operasional** mencatat RAB, GAS, OPS, pencairan operasional, dan kategori transaksi program lainnya untuk kebutuhan dashboard dan laporan.

Saldo rekening tidak boleh disamakan dengan total realisasi belanja atau pencairan operasional pada dashboard.

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

Akses halaman dan aksi dikendalikan melalui role dan permission di src/features/auth/role-policy.ts.

| Role | Akses ringkas |
| --- | --- |
| **Admin** | Seluruh modul: Dashboard, Master Data, Transaksi, Import, Laporan, dan Perhitungan Gaji; termasuk pengelolaan data dan proses impor. |
| **Operator** | Melihat Dashboard, Data Dapur, dan Data Supplier; mengelola Data Kendaraan; serta melihat, membuat/mengoreksi, dan mengekspor transaksi bank. |
| **Viewer** | Akses baca ke modul Transaksi Bank. Tidak memiliki aksi pembuatan transaksi atau ekspor. |
| **Guest** | Ringkasan Transaksi Bank terbatas untuk rekening penampung dan rekening prioritas melalui fungsi database khusus. Tidak mendapat akses ke seluruh daftar rekening atau aksi transaksi. |
| **Koperasi** | Hanya menu Belanja Harian Real. Dapat memasukkan nominal, melihat transaksi yang dibuat oleh akunnya, mengoreksi nominal, dan menghapus transaksi miliknya sesuai aturan backend. |

Route dilindungi oleh komponen ProtectedRoute dan RoleRoute. Aksi penting juga dibatasi melalui permission dan fungsi database/RPC. Pembatasan di UI bukan pengganti kebijakan keamanan database: perubahan backend harus tetap mempertahankan kontrol akses Supabase/RLS yang relevan.

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

1. **Check SIM-SPPG** — dipicu oleh pull request dan push ke main. Menjalankan install dependency, laporan audit dependency, lalu npm run check (lint, test, dan production build).
2. **Deploy SIM-SPPG to GitHub Pages** — dipicu oleh push ke main atau manual melalui workflow_dispatch. Workflow menjalankan npm run check, menyiapkan entry point SPA, lalu memublikasikan artefak ke GitHub Pages.

Workflow membutuhkan repository Actions Variables berikut:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

**Production URL:** [https://rversse.github.io/sim-sppg/](https://rversse.github.io/sim-sppg/)

## Catatan integritas data

Beberapa batas domain yang harus dijaga saat mengembangkan aplikasi:

- Transaksi operasional Dashboard dan ledger Transaksi Bank merupakan sumber data yang berbeda.
- Saldo rekening dihitung dari saldo awal dan mutasi yang relevan, bukan sekadar total laporan pada periode terpilih.
- Kategori transaksi, flow, rekening, dan tujuan operasional harus konsisten. Contohnya, transaksi OPS HARIAN Arutala yang masuk melalui rekening Netral tetap berkategori OPS, sedangkan transaksi sumber kategori GAS tetap berkategori GAS.
- Catatan transaksi impor harus mengikuti catatan sumber. Jangan menambahkan fallback teks yang dapat mengubah arti catatan atau mencampur transaksi GAS dengan OPS.
- Batch impor dan baris sumber perlu mempertahankan informasi audit, termasuk sumber asli, nomor baris, nominal, status impor, dan alasan pengecualian.
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
