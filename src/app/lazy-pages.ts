import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

type PageModule<T extends ComponentType = ComponentType> = Record<string, T>

function lazyNamed<T extends ComponentType>(
  loader: () => Promise<PageModule<T>>,
  exportName: string
): LazyExoticComponent<T> {
  return lazy(async () => {
    const module = await loader()
    const component = module[exportName]

    if (!component) {
      throw new Error(`Page export "${exportName}" tidak ditemukan.`)
    }

    return { default: component }
  })
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
  DisbursementMakerPage: lazyNamed(
    () => import('@/pages/DisbursementMakerPage'),
    'DisbursementMakerPage'
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
