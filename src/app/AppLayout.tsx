import { NavLink, Outlet } from 'react-router-dom'

import { supabase } from '@/lib/supabase'
import { canAccess, type Permission } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'

type NavigationItem = {
  label: string
  to: string
  permission: Permission
  short: string
}

type NavigationSection = {
  label: string
  items: NavigationItem[]
}

const navigationSections: NavigationSection[] = [
  {
    label: 'Utama',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        permission: 'dashboard.view',
        short: 'DB'
      }
    ]
  },
  {
    label: 'Master Data',
    items: [
      {
        label: 'Data Dapur',
        to: '/master/kitchen',
        permission: 'kitchen.view',
        short: 'DP'
      },
      {
        label: 'Supplier',
        to: '/master/supplier',
        permission: 'supplier.manage',
        short: 'SP'
      }
    ]
  },
  {
    label: 'Transaksi',
    items: [
      {
        label: 'Transaksi Bank',
        to: '/bank',
        permission: 'bank.view',
        short: 'BK'
      }
    ]
  },
  {
    label: 'Laporan',
    items: [
      {
        label: 'Laporan',
        to: '/reports',
        permission: 'reports.view',
        short: 'LP'
      }
    ]
  }
]

export function AppLayout() {
  const { user } = useAuth()

  const visibleSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        canAccess(user?.role, item.permission)
      )
    }))
    .filter((section) => section.items.length > 0)

  const visibleNavigation = visibleSections.flatMap((section) => section.items)

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Logout gagal:', error)
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark">S</span>

          <div>
            <strong>SIM SPPG</strong>
            <span>Management System</span>
          </div>
        </div>

        <nav className="app-nav" aria-label="Navigasi utama">
          {visibleSections.map((section) => (
            <div className="app-nav-section" key={section.label}>
              <span className="app-nav-section-label">{section.label}</span>

              <div className="app-nav-section-items">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `app-nav-link${isActive ? ' is-active' : ''}`
                    }
                  >
                    <span className="app-nav-icon">{item.short}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <span className="app-online-dot" />
          <span>System online</span>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-header">
          <div>
            <span className="app-header-kicker">
              SISTEM INFORMASI MANAJEMEN
            </span>

            <strong>SATUAN PELAYANAN PEMENUHAN GIZI</strong>
          </div>

          <div className="app-user">
            <span className="app-user-role">{user?.role ?? 'user'}</span>

            <span className="app-user-avatar">
              {(user?.email?.[0] ?? 'U').toUpperCase()}
            </span>

            <button
              type="button"
              className="app-logout-button"
              onClick={() => void handleLogout()}
            >
              Keluar
            </button>
          </div>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <nav className="app-mobile-nav" aria-label="Navigasi mobile">
        {visibleNavigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `app-mobile-link${isActive ? ' is-active' : ''}`
            }
          >
            <span>{item.short}</span>
            <small>{item.label}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
