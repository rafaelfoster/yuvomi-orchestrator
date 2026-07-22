import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TenantsListPage } from "./pages/TenantsListPage";
import { TenantDetailPage } from "./pages/TenantDetailPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { ActivatePage } from "./pages/ActivatePage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();
  if (loading) return <p className="p-8 text-slate-400">Carregando…</p>;
  if (!admin) return <Navigate to="/login" replace />;
  if (admin.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

function RequirePasswordChange({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();
  if (loading) return <p className="p-8 text-slate-400">Carregando…</p>;
  if (!admin) return <Navigate to="/login" replace />;
  if (!admin.mustChangePassword) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/activate" element={<ActivatePage />} />
          <Route
            path="/change-password"
            element={
              <RequirePasswordChange>
                <ChangePasswordPage />
              </RequirePasswordChange>
            }
          />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tenants" element={<TenantsListPage />} />
            <Route path="/tenants/:id" element={<TenantDetailPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
