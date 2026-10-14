import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  Building2,
  Car,
  ChefHat,
  FileText,
  ClipboardPaste,
  LayoutDashboard,
  Landmark,
  LogOut,
  type LucideIcon
} from 'lucide-react'
import { VehicleExpiryNotification } from '@/components/ui/VehicleExpiryNotification'
import { preloadPage } from '@/app/lazy-pages'
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
type NavigationSection = { label: string; items: NavigationItem[] }
const navigationSections: NavigationSection[] = [
  {
    label: '',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        permission: 'dashboard.view',
        icon: LayoutDashboard,
        pageTitle: 'Dashboard'
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
        label: 'Data Rekening',
        to: '/master/disbursement-accounts',
        permission: 'disbursement-accounts.view',
        icon: Landmark,
        pageTitle: 'Data Rekening'
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
        label: 'Import Maker',
        to: '/maker-import',
        permission: 'maker-import.view',
        icon: ClipboardPaste,
        pageTitle: 'Import Maker'
      },
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

export function AppLayout() {
  const { user } = useAuth()
  const { success, error } = useToast()
  const { pathname } = useLocation()
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.style.colorScheme = 'dark'
  }, [])
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
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      console.error('Logout gagal:', signOutError)
      error('Gagal keluar', signOutError.message)
      return
    }
    success('Berhasil keluar', 'Sesi Anda telah diakhiri.')
  }
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <NavLink to="/dashboard" className="app-brand-home" aria-label="SIM-SPPG Dashboard">
            <span className="app-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <rect x="2" y="2" width="36" height="36" rx="12" fill="currentColor" opacity="0.12" />
                <path d="M11 14.5h18M11 20h18M11 25.5h12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                <circle cx="28" cy="25.5" r="2.1" fill="currentColor" />
              </svg>
            </span>
            <span className="app-brand-copy">
              <strong>SIM-SPPG</strong>
              <small>Operasional Dapur</small>
            </span>
          </NavLink>
          <a
            className="app-brand-switch"
            href="https://rversse.github.io/maker-pencairan/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="app-brand-switch-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 3.75h8l4 4v12.5H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M14 3.75v4h4M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <span>Maker-Pencairan</span>
            <svg className="app-brand-switch-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 16 16 8M9 8h7v7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
        <nav className="app-nav" aria-label="Navigasi utama">
          {visibleSections.map((section) => (
            <div className="app-nav-section" key={section.label}>
              {section.label ? (
                <span className="app-nav-section-label">{section.label}</span>
              ) : null}
              <div className="app-nav-section-items">
                {section.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      viewTransition
                      onMouseEnter={() => preloadPage(item.to)}
                      onFocus={() => preloadPage(item.to)}
                      className={({ isActive }) =>
                        `app-nav-link${isActive ? ' is-active' : ''}`
                      }
                      aria-label={item.label}
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
      </aside>
      <div className="app-content">
        <header className="app-header">
          <div className="app-header-left">
            <div className="app-page-heading">
              <span className="app-header-kicker">SIM SPPG</span>
              <h1 className="app-page-title">{getPageTitle(pathname)}</h1>
            </div>
          </div>
          <div className="app-user">
            <VehicleExpiryNotification />
            <span className="app-user-role">{getRoleLabel(user?.role)}</span>
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
              viewTransition
              onTouchStart={() => preloadPage(item.to)}
              onMouseEnter={() => preloadPage(item.to)}
              onFocus={() => preloadPage(item.to)}
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
