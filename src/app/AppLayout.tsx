import { NavLink, Outlet } from 'react-router-dom'

import { canAccess, type Permission } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'

type NavigationItem = {
  label: string
  to: string
  permission: Permission
}

const navigation: NavigationItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    permission: 'dashboard.view'
  },
  {
    label: 'Data Dapur',
    to: '/master/kitchen',
    permission: 'kitchen.manage'
  },
  {
    label: 'Supplier',
    to: '/master/supplier',
    permission: 'supplier.manage'
  },
  {
    label: 'Transaksi',
    to: '/transactions',
    permission: 'dashboard.view'
  },
  {
    label: 'Transaksi Bank',
    to: '/bank',
    permission: 'bank.view'
  },
  {
    label: 'Laporan',
    to: '/reports',
    permission: 'reports.view'
  }
]

export function AppLayout() {
  const { user } = useAuth()

  const visibleNavigation = navigation.filter((item) =>
    canAccess(user?.role, item.permission)
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r md:block">
          <div className="flex h-16 items-center border-b px-6">
            <span className="font-semibold">SIM SPPG</span>
          </div>

          <nav className="space-y-1 p-4">
            {visibleNavigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'block rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center border-b px-6">
            <span className="font-medium">SIM SPPG</span>
          </header>

          <main className="min-w-0 flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
