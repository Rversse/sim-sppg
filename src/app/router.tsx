import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/app/AppLayout'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { RoleRoute } from '@/features/auth/role-route'
import { LoginPage } from '@/pages/LoginPage'
import { UnauthorizedPage } from '@/pages/UnauthorizedPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { KitchenPage } from '@/pages/KitchenPage'
import { SupplierPage } from '@/pages/SupplierPage'
import { BankPage } from '@/pages/BankPage'
import { ReportsPage } from '@/pages/ReportsPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/unauthorized',
    element: <UnauthorizedPage />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            element: <RoleRoute permission="dashboard.view" />,
            children: [
              {
                index: true,
                element: <DashboardPage />
              },
              {
                path: 'dashboard',
                element: <DashboardPage />
              }
            ]
          },
          {
            element: <RoleRoute permission="kitchen.view" />,
            children: [
              {
                path: 'master/kitchen',
                element: <KitchenPage />
              }
            ]
          },
          {
            element: <RoleRoute permission="supplier.manage" />,
            children: [
              {
                path: 'master/supplier',
                element: <SupplierPage />
              }
            ]
          },
          {
            element: <RoleRoute permission="bank.view" />,
            children: [
              {
                path: 'bank',
                element: <BankPage />
              }
            ]
          },
          {
            element: <RoleRoute permission="reports.view" />,
            children: [
              {
                path: 'reports',
                element: <ReportsPage />
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
])
