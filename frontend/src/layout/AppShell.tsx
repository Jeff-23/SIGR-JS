import {
  BarChart3,
  ClipboardList,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Connection } from "../components/Connection";
import { branches } from "../data/demo";
import { useApp } from "../store/app";

const nav = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, permission: null },
  {
    to: "/salon",
    label: "Salón",
    icon: UtensilsCrossed,
    permission: "MESAS_VER",
  },
  {
    to: "/cocina",
    label: "Cocina y bar",
    icon: Flame,
    permission: "COMANDAS_VER",
  },
  { to: "/caja", label: "Caja", icon: Receipt, permission: "CAJA_VER" },
  {
    to: "/facturas",
    label: "Facturas",
    icon: ClipboardList,
    permission: "REGISTROS_FACTURA_VER",
  },
  {
    to: "/reportes",
    label: "Reportes",
    icon: BarChart3,
    permission: "REPORTES_VER",
  },
  {
    to: "/configuracion",
    label: "Configuración",
    icon: Settings,
    permission: "CONFIGURACION_VER",
  },
];
export function AppShell() {
  const [open, setOpen] = useState(false);
  const { session, setSession, branchId, setBranch } = useApp();
  return (
    <div className="min-h-screen bg-[#f4f2ec] text-denim">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-steel p-5 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <nav className="mt-10 space-y-1">
          {nav
            .filter(
              (item) =>
                !item.permission ||
                session?.user.permisos.includes(item.permission),
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
                {label}
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
            <button onClick={() => setSession(null)} aria-label="Cerrar sesión">
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
          <button onClick={() => setOpen(true)} className="lg:hidden">
            <Menu />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-[.14em] text-denim/38">
              Restaurante El Mono
            </p>
            <select
              value={branchId}
              onChange={(e) => setBranch(Number(e.target.value))}
              className="-ml-1 mt-1 bg-transparent text-lg font-black outline-none"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <Connection />
          <button className="hidden rounded-xl border border-denim/10 p-2.5 text-denim/50 sm:block">
            <ClipboardList size={19} />
          </button>
        </header>
        <main className="p-4 sm:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
