# SIM SPPG

Sistem Informasi Manajemen SPPG untuk mengelola transaksi, rekening, dapur, supplier, kendaraan, pencairan, dan laporan operasional.

## Stack

- React
- TypeScript
- Vite
- Supabase / PostgreSQL
- React Router
- Tailwind CSS
- Lucide React

## Modul

### Dashboard
Menampilkan ringkasan transaksi dan riwayat transaksi berdasarkan periode/filter yang dipilih.

Flow transaksi Dashboard:

- `income` → RAB / Pencairan
- `expense` → Pembayaran Supplier
- `neutral` → Operasional

### Transaksi Bank
Digunakan untuk transfer antar rekening dan transfer keluar.

Sumber data transaksi bank tetap terpisah dari transaksi Dashboard.

### Pencairan
Modul untuk pengelolaan pencairan dana.

### Master Data
- Dapur
- Kendaraan
- Supplier

### Laporan
Modul laporan untuk role yang memiliki izin `reports.view`.

## Role

| Role | Akses utama |
| --- | --- |
| Admin | Dashboard, Master Data, Transaksi Bank, Pencairan, Laporan, CRUD sesuai permission |
| Operator | Dashboard, Master Data (view), Transaksi Bank, sesuai permission |
| Viewer | Transaksi Bank dan data pendukung rekening |

Akses halaman ditentukan oleh permission pada `src/features/auth/role-policy.ts`, kemudian ditegakkan kembali melalui route protection.

## Struktur utama

```text
src/
├── app/
│   ├── AppLayout.tsx
│   ├── lazy-pages.ts
│   └── router.tsx
├── components/
│   └── ui/
├── features/
│   ├── auth/
│   ├── bank/
│   ├── dashboard/
│   ├── disbursement/
│   ├── kitchen/
│   ├── report/
│   ├── supplier/
│   └── transactions/
├── lib/
├── pages/
└── main.tsx
```

## Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Run production build check:

```bash
npm run build
```

Run the full validation used before pushing changes:

```bash
npm run check
```

## Deployment

Production is deployed through the repository's GitHub Actions workflow to GitHub Pages.

Before pushing a change:

```bash
npm run check
```

Only push changes after lint and build pass.

## Data integrity

Business flow and database structure are intentionally kept explicit:

- Dashboard transactions and bank transactions remain separate data sources.
- Bank balance is accumulated from the bank ledger and is not treated as a date-period report.
- Role restrictions are enforced in the database with RLS in addition to frontend route/permission checks.
- Financial calculations should be changed only after validating the corresponding database flow and affected services.

## Notes

Do not commit local environment files or secrets. Use `.env` / `.env.*` locally as configured by the project and keep credentials out of source control.
