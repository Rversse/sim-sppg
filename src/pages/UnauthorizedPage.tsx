import { Link } from 'react-router-dom'

export function UnauthorizedPage() {
  return (
    <main className="unauthorized-page">
      <div className="unauthorized-card">
        <h1>Akses Ditolak</h1>
        <p>Anda tidak memiliki akses ke halaman ini.</p>
      </div>

      <Link to="/dashboard" className="unauthorized-link">
        Kembali ke Dashboard
      </Link>
    </main>
  )
}
