import { useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AccessDenied, ServiceUnavailable } from "./components/AsyncState";
import { RouteGuard } from "./components/RouteGuard";
import { useBranches } from "./hooks/useBranches";
import { useSessionContext } from "./hooks/useSessionContext";
import { AppShell } from "./layout/AppShell";
import { synchronize } from "./lib/api";
import { pending } from "./lib/offline";
import { CashPage } from "./pages/CashPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { KitchenPage } from "./pages/KitchenPage";
import { LoginPage } from "./pages/LoginPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SalonRouterPage } from "./pages/SalonRouterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useApp } from "./store/app";

function ApplicationRoutes() {
  const { session, logout, setOnline, setPendingCount, setServiceAvailable } = useApp();
  useBranches();
  useSessionContext();
  useEffect(() => {
    const unauthorized = () => { if (useApp.getState().session) { logout(); toast.error("Tu sesión terminó. Ingresa nuevamente."); } };
    const service = (event: Event) => setServiceAvailable(Boolean((event as CustomEvent<{ available: boolean }>).detail.available));
    const refresh = async () => {
      setOnline(navigator.onLine); setPendingCount((await pending()).length);
      if (navigator.onLine && session && !session.demo) { const result = await synchronize(); setPendingCount(result.remaining); }
    };
    window.addEventListener("sigr:unauthorized", unauthorized); window.addEventListener("sigr:service", service);
    window.addEventListener("online", refresh); window.addEventListener("offline", refresh); void refresh();
    return () => { window.removeEventListener("sigr:unauthorized", unauthorized); window.removeEventListener("sigr:service", service); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, [logout, session, setOnline, setPendingCount, setServiceAvailable]);
  if (!session) return <LoginPage />;
  return <Routes><Route element={<AppShell />}>
    <Route index element={<DashboardPage/>}/>
    <Route path="salon" element={<RouteGuard permission="MESAS_VER" capability="MESAS" branchRequired><SalonRouterPage/></RouteGuard>}/>
    <Route path="cocina" element={<RouteGuard permission="COMANDAS_VER" capability="COMANDAS" branchRequired><KitchenPage/></RouteGuard>}/>
    <Route path="caja" element={<RouteGuard permission="CAJA_VER" branchRequired><CashPage/></RouteGuard>}/>
    <Route path="facturas" element={<RouteGuard permission="REGISTROS_FACTURA_VER" capability="FACTURACION" branchRequired><InvoicesPage/></RouteGuard>}/>
    <Route path="reportes" element={<RouteGuard permission="REPORTES_VER" branchRequired><ReportsPage/></RouteGuard>}/>
    <Route path="configuracion" element={<RouteGuard permission="CONFIGURACION_VER" branchRequired><SettingsPage/></RouteGuard>}/>
    <Route path="acceso-denegado" element={<AccessDenied/>}/><Route path="servicio-no-disponible" element={<ServiceUnavailable/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Route></Routes>;
}

export default function App() { return <BrowserRouter><ApplicationRoutes/><Toaster position="top-right" toastOptions={{ duration: 4500 }}/></BrowserRouter>; }
