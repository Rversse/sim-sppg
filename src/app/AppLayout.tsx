import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  Building2,
  Car,
  ChefHat,
  FileText,
  LayoutDashboard,
  Menu,
  Wallet,
  type LucideIcon
} from 'lucide-react'

import logo from '@/assets/logo.png'
import { supabase } from '@/lib/supabase'
import { canAccess, type Permission } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'

type NavigationItem = {
  label: string
  to: string
  permission: Permission
  icon: LucideIcon
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
        icon: LayoutDashboard
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
        icon: ChefHat
      },
      {
        label: 'Data Kendaraan',
        to: '/master/vehicle',
        permission: 'vehicle.view',
        icon: Car
      },
      {
        label: 'Data Supplier',
        to: '/master/supplier',
        permission: 'supplier.view',
        icon: Building2
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
        icon: ArrowLeftRight
      },
      {
        label: 'Pencairan',
        to: '/disbursement',
        permission: 'disbursement.view',
        icon: Wallet
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
        icon: FileText
      }
    ]
  }
]

const pageTitles: Array<{ match: string; title: string }> = [
  { match: '/dashboard', title: 'Dashboard' },
  { match: '/master/kitchen', title: 'Data Dapur' },
  { match: '/master/vehicle', title: 'Data Kendaraan' },
  { match: '/master/supplier', title: 'Data Supplier' },
  { match: '/bank', title: 'Transaksi Bank' },
  { match: '/disbursement', title: 'Pencairan' },
  { match: '/reports', title: 'Laporan' }
]

function getPageTitle(pathname: string) {
  return pageTitles.find(({ match }) => pathname === match)?.title ?? 'SIM SPPG'
}

export function AppLayout() {
  const { user } = useAuth()
  const { success, error } = useToast()
  const { pathname } = useLocation()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('sim-sppg.sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'sim-sppg.sidebar-collapsed',
        sidebarCollapsed ? '1' : '0'
      )
    } catch {
      // Sidebar persistence is optional.
    }
  }, [sidebarCollapsed])

  const visibleSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        canAccess(user?.role, item.permission)
      )
    }))
    .filter((section) => section.items.length > 0)

  const visibleNavigation = visibleSections.flatMap((section) => section.items)

  const pageTitle = getPageTitle(pathname)

  async function handleLogout() {
    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) {
      console.error('Logout gagal:', signOutError)
      error('Gagal keluar', signOutError.message)
      return
    }

    success('Berhasil keluar', 'Sesi Anda telah diakhiri.')
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <img src={logo} alt="" />
          </span>

          <div className="app-brand-copy">
            <strong>SIM SPPG</strong>
            <span>Management System</span>
          </div>
        </div>

        <nav className="app-nav" aria-label="Navigasi utama">
          {visibleSections.map((section) => (
            <div className="app-nav-section" key={section.label}>
              <span className="app-nav-section-label">{section.label}</span>

              <div className="app-nav-section-items">
                {section.items.map((item) => {
                  const Icon = item.icon

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `app-nav-link${isActive ? ' is-active' : ''}`
                      }
                    >
                      <span className="app-nav-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="app-nav-label">{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <span className="app-online-dot" aria-hidden="true" />
          <span>System online</span>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-header">
          <div className="app-header-left">
            <button
              type="button"
              className="app-sidebar-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={
                sidebarCollapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'
              }
              title={
                sidebarCollapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'
              }
            >
              {sidebarCollapsed ? (
                <Menu aria-hidden="true" />
              ) : (
                <Menu aria-hidden="true" />
              )}
            </button>

            <div className="app-page-heading">
              <span className="app-header-kicker">SIM SPPG</span>
              <h1 className="app-page-title">{pageTitle}</h1>
            </div>
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
        {visibleNavigation.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `app-mobile-link${isActive ? ' is-active' : ''}`
              }
              aria-label={item.label}
              title={item.label}
            >
              <Icon aria-hidden="true" />
              <small>{item.label}</small>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
