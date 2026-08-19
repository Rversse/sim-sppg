import {
  createElement,
  Suspense,
  type ComponentType,
  type ReactElement
} from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/app/AppLayout'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { RoleRoute } from '@/features/auth/role-route'
import { lazyPages } from '@/app/lazy-pages'

const {
  LoginPage,
  UnauthorizedPage,
  DashboardPage,
  KitchenPage,
  VehiclePage,
  SupplierPage,
  BankPage,
  ReportsPage,
  DisbursementPage,
  DisbursementMakerPage,
  DefaultRoute
} = lazyPages

const pageFallback = createElement(
  'div',
  {
    className: 'app-page-loading',
    role: 'status',
    'aria-live': 'polite'
  },
  'Memuat halaman...'
)

function pageElement(Component: ComponentType): ReactElement {
  return createElement(
    Suspense,
    { fallback: pageFallback },
    createElement(Component)
  )
}

export const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: pageElement(LoginPage)
    },
    {
      path: '/unauthorized',
      element: pageElement(UnauthorizedPage)
    },
    {
      element: <ProtectedRoute />,
      children: [
        {
          path: '/',
          element: <AppLayout />,
          children: [
            {
              index: true,
              element: pageElement(DefaultRoute)
            },
            {
              element: <RoleRoute permission="dashboard.view" />,
              children: [
                {
                  path: 'dashboard',
                  element: pageElement(DashboardPage)
                }
              ]
            },
            {
              element: <RoleRoute permission="disbursement-maker.view" />,
              children: [
                {
                  path: 'disbursement-maker',
                  element: pageElement(DisbursementMakerPage)
                }
              ]
            },
            {
              element: <RoleRoute permission="kitchen.view" />,
              children: [
                {
                  path: 'master/kitchen',
                  element: pageElement(KitchenPage)
                }
              ]
            },
            {
              element: <RoleRoute permission="vehicle.view" />,
              children: [
                {
                  path: 'master/vehicle',
                  element: pageElement(VehiclePage)
                }
              ]
            },
            {
              element: <RoleRoute permission="supplier.view" />,
              children: [
                {
                  path: 'master/supplier',
                  element: pageElement(SupplierPage)
                }
              ]
            },
            {
              element: <RoleRoute permission="bank.view" />,
              children: [
                {
                  path: 'bank',
                  element: pageElement(BankPage)
                }
              ]
            },
            {
              element: <RoleRoute permission="reports.view" />,
              children: [
                {
                  path: 'reports',
                  element: pageElement(ReportsPage)
                }
              ]
            },
            {
              element: <RoleRoute permission="disbursement.view" />,
              children: [
                {
                  path: 'disbursement',
                  element: pageElement(DisbursementPage)
                }
              ]
            }
          ]
        }
      ]
    },
    {
      path: '*',
      element: <Navigate to="/" replace />
    }
  ],
  {
    basename: '/sim-sppg/'
  }
)
