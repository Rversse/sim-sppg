import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/app/AppLayout'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { RoleRoute } from '@/features/auth/role-route'
import { BankPage } from '@/pages/BankPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DisbursementPage } from '@/pages/DisbursementPage'
import { KitchenPage } from '@/pages/KitchenPage'
import { LoginPage } from '@/pages/LoginPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SupplierPage } from '@/pages/SupplierPage'
import { UnauthorizedPage } from '@/pages/UnauthorizedPage'
import { VehiclePage } from '@/pages/VehiclePage'
import { DefaultRoute } from '@/pages/DefaultRoute'

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
            index: true,
            element: <DefaultRoute />
          },
          {
            element: <RoleRoute permission="dashboard.view" />,
            children: [
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
            element: <RoleRoute permission="vehicle.view" />,
            children: [
              {
                path: 'master/vehicle',
                element: <VehiclePage />
              }
            ]
          },
          {
            element: <RoleRoute permission="supplier.view" />,
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
          },
          {
            element: <RoleRoute permission="disbursement.view" />,
            children: [
              {
                path: 'disbursement',
                element: <DisbursementPage />
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
