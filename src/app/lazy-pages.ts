import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

type PageModule<T extends ComponentType = ComponentType> = Record<string, T>
function lazyNamed<T extends ComponentType>(
  loader: () => Promise<PageModule<T>>,
  exportName: string
): LazyExoticComponent<T> {
  return lazy(async () => {
    const module = await loader()
    const component = module[exportName]
    if (!component)
      throw new Error(`Page export "${exportName}" tidak ditemukan.`)
    return { default: component }
  })
}

const pageLoaders = {
  '/dashboard': () => import('@/pages/DashboardPage'),
  '/master/kitchen': () => import('@/pages/KitchenPage'),
  '/master/vehicle': () => import('@/pages/VehiclePage'),
  '/master/supplier': () => import('@/pages/SupplierPage'),
  '/bank': () => import('@/pages/BankPage'),
  '/disbursement': () => import('@/pages/DisbursementPage'),
  '/reports': () => import('@/pages/ReportsPage')
} as const

type AppRoutePath = keyof typeof pageLoaders

export function preloadPage(path: string) {
  const loader = pageLoaders[path as AppRoutePath]
  if (!loader) return
  void loader()
}

export const lazyPages = {
  LoginPage: lazyNamed(() => import('@/pages/LoginPage'), 'LoginPage'),
  UnauthorizedPage: lazyNamed(
    () => import('@/pages/UnauthorizedPage'),
    'UnauthorizedPage'
  ),
  DashboardPage: lazyNamed(
    () => import('@/pages/DashboardPage'),
    'DashboardPage'
  ),
  KitchenPage: lazyNamed(() => import('@/pages/KitchenPage'), 'KitchenPage'),
  VehiclePage: lazyNamed(() => import('@/pages/VehiclePage'), 'VehiclePage'),
  SupplierPage: lazyNamed(() => import('@/pages/SupplierPage'), 'SupplierPage'),
  BankPage: lazyNamed(() => import('@/pages/BankPage'), 'BankPage'),
  ReportsPage: lazyNamed(() => import('@/pages/ReportsPage'), 'ReportsPage'),
  DisbursementPage: lazyNamed(
    () => import('@/pages/DisbursementPage'),
    'DisbursementPage'
  ),
  DefaultRoute: lazyNamed(() => import('@/pages/DefaultRoute'), 'DefaultRoute')
} as const
