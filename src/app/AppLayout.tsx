import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  Building2,
  Car,
  ChefHat,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Wallet,
  WandSparkles,
  type LucideIcon
} from 'lucide-react'

import logo from '@/assets/logo.png'
import { VehicleExpiryNotification } from '@/components/ui/VehicleExpiryNotification'
import { supabase } from '@/lib/supabase'
import { canAccess, type Permission } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'

type NavigationItem = {
  label: string
  to: string
  permission: Permission
  icon: LucideIcon
  pageTitle: string
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
        icon: LayoutDashboard,
        pageTitle: 'Dashboard'
      },
      {
        label: 'Pencairan Maker',
        to: '/disbursement-maker',
        permission: 'disbursement-maker.view',
        icon: WandSparkles,
        pageTitle: 'Pencairan Maker'
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
        icon: ChefHat,
        pageTitle: 'Data Dapur'
      },
      {
        label: 'Data Kendaraan',
        to: '/master/vehicle',
        permission: 'vehicle.view',
        icon: Car,
        pageTitle: 'Data Kendaraan'
      },
      {
        label: 'Data Supplier',
        to: '/master/supplier',
        permission: 'supplier.view',
        icon: Building2,
        pageTitle: 'Data Supplier'
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
        icon: ArrowLeftRight,
        pageTitle: 'Transaksi Bank'
      },
      {
        label: 'Pencairan',
        to: '/disbursement',
        permission: 'disbursement.view',
        icon: Wallet,
        pageTitle: 'Pencairan'
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
        icon: FileText,
        pageTitle: 'Laporan'
      }
    ]
  }
]

const SIDEBAR_STORAGE_KEY = 'sim-sppg.sidebar-collapsed'
const THEME_STORAGE_KEY = 'sim-sppg.theme'

function getPageTitle(pathname: string) {
  return (
    navigationSections
      .flatMap((section) => section.items)
      .find(({ to }) => pathname === to)?.pageTitle ?? 'SIM SPPG'
  )
}

function getRoleLabel(role: string | undefined) {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'operator':
      return 'Operator'
    case 'viewer':
      return 'Viewer'
    default:
      return 'User'
  }
}

function getStoredDarkMode() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
  } catch {
    return false
  }
}

function applyTheme(isDark: boolean) {
  const theme = isDark ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function AppLayout() {
  const { user } = useAuth()
  const { success, error } = useToast()
  const { pathname } = useLocation()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const [isDark, setIsDark] = useState(() => getStoredDarkMode())

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        sidebarCollapsed ? '1' : '0'
      )
    } catch {
      // Sidebar persistence is optional.
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    document.documentElement.classList.add('theme-transitioning')
    applyTheme(isDark)

    try {
      window.localStorage.setItem(
        THEME_STORAGE_KEY,
        isDark ? 'dark' : 'light'
      )
    } catch {
      // Theme persistence is optional.
    }

    const timeoutId = window.setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning')
    }, 180)

    return () => {
      window.clearTimeout(timeoutId)
      document.documentElement.classList.remove('theme-transitioning')
    }
  }, [isDark])

  const visibleSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        canAccess(user?.role, item.permission)
      )
    }))
    .filter((section) => section.items.length > 0)

  const visibleNavigation = visibleSections.flatMap(
    (section) => section.items
  )

  const pageTitle = getPageTitle(pathname)
  const roleLabel = getRoleLabel(user?.role)

  function toggleTheme() {
    setIsDark((current) => !current)
  }

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
    <div
      className={`app-shell${
        sidebarCollapsed ? ' sidebar-collapsed' : ''
      }`}
    >
      <aside className="app-sidebar">
        <div className="app-sidebar-theme">
          <button
            type="button"
            className="app-theme-switch"
            data-dark={isDark}
            onClick={toggleTheme}
            aria-label={isDark ? 'Aktifkan tema light' : 'Aktifkan tema dark'}
            aria-pressed={isDark}
            title={isDark ? 'Tema Dark' : 'Tema Light'}
          >
            <span className="app-theme-switch-track" aria-hidden="true">
              <span className="app-theme-switch-icon">
                <Sun />
              </span>
              <span className="app-theme-switch-icon">
                <Moon />
              </span>
              <span className="app-theme-switch-thumb" />
            </span>
          </button>
        </div>

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
              <span className="app-nav-section-label">
                {section.label}
              </span>

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
                      <span className="app-nav-label">
                        {item.label}
                      </span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
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
              <Menu aria-hidden="true" />
            </button>

            <div className="app-page-heading">
              <span className="app-header-kicker">SIM SPPG</span>
              <h1 className="app-page-title">{pageTitle}</h1>
            </div>
          </div>

          <div className="app-user">
            <div className="app-mobile-theme-control">
              <button
                type="button"
                className="app-mobile-theme-switch"
                onClick={toggleTheme}
                aria-label={
                  isDark ? 'Aktifkan tema light' : 'Aktifkan tema dark'
                }
                aria-pressed={isDark}
                title={isDark ? 'Tema Dark' : 'Tema Light'}
              >
                {isDark ? (
                  <Moon aria-hidden="true" />
                ) : (
                  <Sun aria-hidden="true" />
                )}
              </button>
            </div>

            <VehicleExpiryNotification />

            <span className="app-user-role">{roleLabel}</span>

            <button
              type="button"
              className="app-logout-button"
              onClick={() => void handleLogout()}
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut aria-hidden="true" />
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
