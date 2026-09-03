import {
  BarChart3,
  ClipboardList,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  QrCode,
  Truck,
  CircleDollarSign,
  WalletCards,
  UsersRound,
  BrainCircuit,
  Radar,
  Presentation,
  HeartHandshake,
  Settings,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Connection } from "../components/Connection";
import { OperationsNotice } from "../components/OperationsNotice";
import { useApp } from "../store/app";
import { api } from "../lib/api";
import { GuidedTour } from "../components/GuidedTour";
import { pendingCommandCount, type Command } from "../features/kds/contracts";

const nav = [
  {
    to: "/centro-operativo",
    label: "Centro Operativo",
    icon: Radar,
    permission: "CENTRO_OPERATIVO_VER",
    capability: "ANALYTICS",
  },
  {
    to: "/presentacion",
    label: "Presentación comercial",
    icon: Presentation,
    permission: null,
    capability: null,
  },
  {
    to: "/inteligencia",
    label: "Inteligencia y alertas",
    icon: BrainCircuit,
    permission: "REPORTES_VER",
    capability: "ANALYTICS",
  },
  {
    to: "/personal",
    label: "Personal y turnos",
    icon: UsersRound,
    permission: "USUARIOS_VER",
    capability: null,
  },
  {
    to: "/cuentas-pagar",
    label: "Cuentas por pagar",
    icon: WalletCards,
    permission: "REPORTES_VER",
    capability: "INVENTARIO",
  },
  {
    to: "/costos",
    label: "Costos y rentabilidad",
    icon: CircleDollarSign,
    permission: "REPORTES_VER",
    capability: "INVENTARIO",
  },
  {
    to: "/abastecimiento",
    label: "Proveedores y compras",
    icon: Truck,
    permission: "INVENTARIO_VER",
    capability: "INVENTARIO",
  },
  {
    to: "/pedidos-qr",
    label: "Pedidos QR",
    icon: QrCode,
    permission: "PEDIDOS_VER",
    capability: "MESAS",
  },
  {
    to: "/fidelizacion",
    label: "Promociones y clientes",
    icon: HeartHandshake,
    permission: "CLIENTES_VER",
    capability: "CLIENTES",
  },
  {
    to: "/continuidad",
    label: "Sincronización",
    icon: ClipboardList,
    permission: null,
    capability: null,
  },
  {
    to: "/fiscal",
    label: "Facturación y DIAN",
    icon: Receipt,
    permission: null,
    capability: null,
  },
  {
    to: "/administracion",
    label: "Administración",
    icon: Settings,
    permission: null,
    capability: null,
  },
  {
    to: "/inventario",
    label: "Inventario",
    icon: ClipboardList,
    permission: "INVENTARIO_VER",
    capability: "INVENTARIO",
  },
  {
    to: "/domicilios",
    label: "Domicilios",
    icon: UtensilsCrossed,
    permission: "PEDIDOS_VER",
    capability: null,
  },
  {
    to: "/catalogo",
    label: "Catálogo y clientes",
    icon: ClipboardList,
    permission: null,
    capability: null,
  },
  {
    to: "/",
    label: "Resumen",
    icon: LayoutDashboard,
    permission: null,
    capability: null,
  },
  {
    to: "/salon",
    label: "Salón",
    icon: UtensilsCrossed,
    permission: "MESAS_VER",
    capability: "MESAS",
  },
  {
    to: "/cocina",
    label: "Cocina y bar",
    icon: Flame,
    permission: "COMANDAS_VER",
    capability: "KDS",
  },
  {
    to: "/caja",
    label: "Caja",
    icon: Receipt,
    permission: "CAJA_VER",
    capability: null,
  },
  {
    to: "/facturas",
    label: "Facturas",
    icon: ClipboardList,
    permission: "REGISTROS_FACTURA_VER",
    capability: "FACTURACION",
  },
  {
    to: "/reportes",
    label: "Reportes",
    icon: BarChart3,
    permission: "REPORTES_VER",
    capability: null,
  },
  {
    to: "/configuracion",
    label: "Configuración",
    icon: Settings,
    permission: "CONFIGURACION_VER",
    capability: null,
  },
];
export function AppShell() {
  const [open, setOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [pendingKitchenCommands, setPendingKitchenCommands] = useState(0);
  const {
    session,
    logout,
    branchId,
    branches,
    branchesLoading,
    setBranch,
    serviceAvailable,
    hasPermission,
    hasCapability,
    orders,
  } = useApp();
  const demoKitchenPending = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status !== "PAGADO" &&
          order.status !== "PENDIENTE_PAGO" &&
          Object.values(order.stationStatus).some(
            (state) => state === "PENDIENTE",
          ),
      ).length,
    [orders],
  );
  useEffect(() => {
    if (
      session?.demo ||
      !branchId ||
      !hasPermission("COMANDAS_VER") ||
      !hasCapability("KDS")
    )
      return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await api.get<Command[]>("/comandas", {
          params: { sucursalId: branchId },
          signal: controller.signal,
        });
        setPendingKitchenCommands(pendingCommandCount(response.data));
      } catch {
        if (!controller.signal.aborted) setPendingKitchenCommands(0);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [branchId, hasCapability, hasPermission, session?.demo, session?.user.id]);
  const kitchenBadge = session?.demo
    ? demoKitchenPending
    : branchId && hasPermission("COMANDAS_VER") && hasCapability("KDS")
      ? pendingKitchenCommands
      : 0;
  return (
    <div className="min-h-screen bg-[#f4f2ec] text-denim">
      <a href="#contenido-principal" className="skip-link">
        Saltar al contenido principal
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-steel p-5 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button
            aria-label="Cerrar navegación"
            className="lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <nav className="mt-6 max-h-[calc(100dvh-240px)] space-y-1 overflow-y-auto">
          {nav
            .filter(
              (item) =>
                hasPermission(item.permission) &&
                hasCapability(item.capability),
            )
            .sort(
              (a, b) =>
                [
                  "/",
                  "/centro-operativo",
                  "/salon",
                  "/pedidos-qr",
                  "/cocina",
                  "/caja",
                  "/facturas",
                  "/domicilios",
                  "/catalogo",
                  "/inventario",
                  "/abastecimiento",
                  "/costos",
                  "/cuentas-pagar",
                  "/personal",
                  "/inteligencia",
                  "/presentacion",
                  "/reportes",
                  "/fiscal",
                  "/administracion",
                  "/configuracion",
                  "/continuidad",
                ].indexOf(a.to) -
                [
                  "/",
                  "/centro-operativo",
                  "/salon",
                  "/pedidos-qr",
                  "/cocina",
                  "/caja",
                  "/facturas",
                  "/domicilios",
                  "/catalogo",
                  "/inventario",
                  "/abastecimiento",
                  "/costos",
                  "/cuentas-pagar",
                  "/personal",
                  "/inteligencia",
                  "/presentacion",
                  "/reportes",
                  "/fiscal",
                  "/administracion",
                  "/configuracion",
                  "/continuidad",
                ].indexOf(b.to),
            )
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold transition ${isActive ? "bg-marigold text-steel" : "text-white/58 hover:bg-white/7 hover:text-white"}`
                }
              >
                <Icon size={19} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {to === "/cocina" && kitchenBadge > 0 && (
                  <span
                    className="grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-black text-white shadow-sm"
                    aria-label={`${kitchenBadge} comandas pendientes`}
                    title={`${kitchenBadge} comandas pendientes por iniciar`}
                  >
                    {kitchenBadge > 99 ? "99+" : kitchenBadge}
                  </span>
                )}
              </NavLink>
            ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-marigold font-black text-steel">
              {session?.user.nombres[0]}
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-sm">
                {session?.user.nombres}
              </strong>
              <span className="text-xs text-white/45">{session?.user.rol}</span>
            </div>
            <button onClick={logout} aria-label="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-steel/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      )}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-denim/8 bg-[#f4f2ec]/90 px-4 backdrop-blur sm:px-7">
          <button
            aria-label="Abrir navegación"
            onClick={() => setOpen(true)}
            className="lg:hidden"
          >
            <Menu />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-[.14em] text-denim/38">
              {session?.user.restauranteNombre ??
                (session?.demo
                  ? "Restaurante El Mono"
                  : `Restaurante ${session?.user.restauranteId ?? "SIGR"}`)}
            </p>
            <select
              aria-label="Sucursal activa"
              value={branchId ?? ""}
              onChange={(e) => setBranch(Number(e.target.value))}
              disabled={branchesLoading || branches.length <= 1}
              className="-ml-1 mt-1 bg-transparent text-lg font-black outline-none"
            >
              {branches.length === 0 && (
                <option value="">
                  {branchesLoading
                    ? "Consultando sucursales…"
                    : "Sin sucursal asignada"}
                </option>
              )}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          {!serviceAvailable && (
            <span className="hidden rounded-full bg-orange-100 px-3 py-2 text-xs font-bold text-orange-800 md:block">
              Servidor sin respuesta
            </span>
          )}
          <Connection />
          <button
            aria-label="Iniciar recorrido guiado"
            title="Recorrido guiado"
            onClick={() => setTourOpen(true)}
            className="hidden rounded-xl border border-denim/10 p-2.5 text-denim/50 sm:block"
          >
            <ClipboardList size={19} />
          </button>
        </header>
        <main id="contenido-principal" tabIndex={-1} className="p-4 sm:p-7">
          <OperationsNotice />
          <Outlet />
        </main>
      </div>
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
