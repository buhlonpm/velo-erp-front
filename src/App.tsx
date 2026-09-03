import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { AdminRoute, PermissionRoute, ProtectedRoute } from './components/ProtectedRoute'
import { PERMISSIONS } from './auth/permissions'
import { DashboardPage } from './pages/DashboardPage'
import { ParkPage } from './pages/ParkPage'
import { AssetDetailPage } from './pages/AssetDetailPage'
import { RentalsPage } from './pages/RentalsPage'
import { RentalNewPage } from './pages/RentalNewPage'
import { RentalDetailPage } from './pages/RentalDetailPage'
import { CustomersPage } from './pages/CustomersPage'
import { FinancePage } from './pages/FinancePage'
import { ReportsPage } from './pages/ReportsPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="park" element={<ParkPage />} />
              <Route path="park/bikes/:id" element={<AssetDetailPage />} />
              <Route path="park/batteries/:id" element={<AssetDetailPage />} />
              <Route path="park/chargers/:id" element={<AssetDetailPage />} />
              <Route path="rentals" element={<RentalsPage />} />
              <Route path="rentals/new" element={<RentalNewPage />} />
              <Route path="rentals/:id/edit" element={<RentalNewPage />} />
              <Route path="rentals/:id" element={<RentalDetailPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="finance" element={<PermissionRoute permission={PERMISSIONS.FINANCE_VIEW} />}>
                <Route index element={<FinancePage />} />
              </Route>
              <Route path="reports" element={<PermissionRoute permission={PERMISSIONS.FINANCE_VIEW} />}>
                <Route index element={<ReportsPage />} />
              </Route>
              <Route element={<AdminRoute />}>
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
