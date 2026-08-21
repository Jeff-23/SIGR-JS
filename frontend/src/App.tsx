import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { pending } from "./lib/offline";
import { synchronize } from "./lib/api";
import { DashboardPage } from "./pages/DashboardPage";
import { KitchenPage } from "./pages/KitchenPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SalonPage } from "./pages/SalonPage";
import { useApp } from "./store/app";

export default function App() {
  const { session, setOnline, setPendingCount } = useApp();
  const allowed = (permission: string) =>
    session?.user.permisos.includes(permission) ?? false;
  useEffect(() => {
    const refresh = async () => {
      setOnline(navigator.onLine);
      setPendingCount((await pending()).length);
      if (navigator.onLine && session && !session.demo) {
        const result = await synchronize();
        setPendingCount(result.remaining);
      }
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    void refresh();
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [session, setOnline, setPendingCount]);
  return (
    <BrowserRouter>
      {!session ? (
        <LoginPage />
      ) : (
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route
              path="salon"
              element={
                allowed("MESAS_VER") ? (
                  <SalonPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="cocina"
              element={
                allowed("COMANDAS_VER") ? (
                  <KitchenPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="caja"
              element={<PlaceholderPage title="Caja y pagos" />}
            />
            <Route
              path="facturas"
              element={
                allowed("REGISTROS_FACTURA_VER") ? (
                  <InvoicesPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="reportes"
              element={<PlaceholderPage title="Reportes" />}
            />
            <Route
              path="configuracion"
              element={<PlaceholderPage title="Configuración" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}
