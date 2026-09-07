import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeDollarSign,
  Bike,
  BookOpenCheck,
  ChefHat,
  ClipboardList,
  CreditCard,
  FileText,
  Martini,
  PackageSearch,
  QrCode,
  ReceiptText,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import { money } from "../data/demo";

type Summary = {
  ventas: { cantidad: number; total: string; totalPagado: string };
  pedidos: { cantidad: number };
  operacionActual: {
    cajasAbiertas: number;
    mesasOcupadas: number;
    mesasPendientesPago: number;
  };
  productosMasVendidos: Array<{
    productoId: number;
    producto: string;
    cantidadVendida: number;
  }>;
  inventario: { sinStock: number };
};

type Action = {
  to: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  visible: boolean;
};

type Workspace = {
  title: string;
  description: string;
  functions: string[];
  actions: Action[];
};

function FunctionCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <article className="card">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-marigold/20 text-steel">
        <Icon size={20} />
      </div>
      <h2 className="mt-5 text-lg font-black">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-denim/65">{children}</div>
    </article>
  );
}

function RoleWorkspace() {
  const { branchId, pendingCount, session, hasPermission, hasCapability } = useApp();
  const role = (session?.user.rol ?? "USUARIO").toUpperCase();
  const can = (permission: string) => hasPermission(permission);
  const cap = (capability: string) => hasCapability(capability);

  const common = {
    salon: can("MESAS_VER") && cap("MESAS"),
    qr: can("PEDIDOS_CREAR") && cap("MESAS"),
    kds: can("COMANDAS_VER") && cap("KDS"),
    cash: can("CAJA_VER"),
    deliveries: can("DOMICILIOS_VER"),
    invoices: can("REGISTROS_FACTURA_VER"),
    reports: can("REPORTES_VER") && cap("REPORTES"),
    inventory: can("INVENTARIO_VER") && cap("INVENTARIO"),
  };

  const workspaces: Record<string, Workspace> = {
    MESERO: {
      title: "Tu turno en salón",
      description: "Toma pedidos, sigue la preparación y atiende las mesas que necesitan acción.",
      functions: [
        "Abrir mesas y registrar pedidos.",
        "Agregar productos, cantidades y observaciones por línea.",
        "Enviar sólo líneas nuevas a cocina o bar.",
        "Seguir pedidos listos para retirar y solicitar la cuenta.",
      ],
      actions: [
        { to: "/salon", label: "Ir al salón", detail: "Mesas, pedidos y servicio", icon: UtensilsCrossed, visible: common.salon },
        { to: "/cocina", label: "Seguir preparación", detail: `${pendingCount} comanda(s) requieren atención`, icon: ChefHat, visible: common.kds },
        { to: "/pedidos-qr", label: "Solicitudes QR", detail: "Aceptar pedidos propios cuando aplique", icon: QrCode, visible: common.qr },
      ],
    },
    COCINA: {
      title: "Tu estación de cocina",
      description: "Prioriza comandas, controla tiempos y marca cada preparación cuando esté lista.",
      functions: [
        "Confirmar comandas recibidas en Cocina.",
        "Iniciar preparación y actualizar líneas.",
        "Revisar observaciones especiales del cliente.",
        "Marcar productos listos para que servicio los retire.",
      ],
      actions: [
        { to: "/cocina", label: "Abrir KDS Cocina", detail: `${pendingCount} comanda(s) nueva(s) sin confirmar`, icon: ChefHat, visible: common.kds },
      ],
    },
    BAR: {
      title: "Tu estación de bar",
      description: "Gestiona bebidas y preparaciones del bar sin mezclar el trabajo de cocina.",
      functions: [
        "Confirmar comandas recibidas en Bar.",
        "Iniciar y completar líneas de bebidas.",
        "Atender observaciones como sin hielo o poca azúcar.",
        "Marcar bebidas listas para retiro.",
      ],
      actions: [
        { to: "/cocina", label: "Abrir KDS Bar", detail: `${pendingCount} comanda(s) nueva(s) sin confirmar`, icon: Martini, visible: common.kds },
      ],
    },
    CAJERO: {
      title: "Caja y operación del turno",
      description: "En este restaurante tu perfil puede combinar toma de pedidos, despacho y cobro según los permisos asignados.",
      functions: [
        "Recibir pedidos de salón, mostrador, para llevar o domicilio cuando esté habilitado.",
        "Enviar pedidos a cocina y bar.",
        "Abrir caja, registrar pagos y cerrar operaciones.",
        "Consultar comprobantes y facturas dentro de tu alcance.",
      ],
      actions: [
        { to: "/salon", label: "Tomar pedido", detail: "Salón y venta operativa", icon: Store, visible: common.salon },
        { to: "/caja", label: "Ir a caja", detail: "Ventas pendientes y cobros", icon: CreditCard, visible: common.cash },
        { to: "/cocina", label: "Ver preparación", detail: "Seguimiento de cocina y bar", icon: ChefHat, visible: common.kds },
        { to: "/domicilios", label: "Domicilios", detail: "Pedidos para distribución", icon: Bike, visible: common.deliveries },
      ],
    },
    DOMICILIARIO: {
      title: "Tus entregas",
      description: "Consulta únicamente los pedidos de distribución que están dentro de tu alcance operativo.",
      functions: [
        "Consultar domicilios activos.",
        "Identificar dirección, contacto y estado del pedido.",
        "Actualizar la entrega según el flujo autorizado.",
        "Registrar incidencias u observaciones de reparto.",
      ],
      actions: [
        { to: "/domicilios", label: "Ver entregas", detail: "Pendientes, en ruta y entregadas", icon: Bike, visible: common.deliveries },
      ],
    },
    CONTADOR: {
      title: "Consulta contable y financiera",
      description: "Tu perfil es principalmente de lectura, conciliación y soporte documental; no opera mesas ni comandas.",
      functions: [
        "Consultar facturas, comprobantes y ventas autorizadas.",
        "Revisar caja, pagos, ingresos y egresos dentro del alcance asignado.",
        "Consultar reportes e inventario cuando el plan del restaurante lo incluya.",
        "Usar exportaciones disponibles para conciliación y análisis.",
      ],
      actions: [
        { to: "/contabilidad", label: "Consulta contable", detail: "Ventas, pagos, cierres y exportaciones", icon: BookOpenCheck, visible: can("CONTABILIDAD_VER") },
        { to: "/facturas", label: "Facturas y comprobantes", detail: "Archivo comercial autorizado", icon: FileText, visible: common.invoices },
        { to: "/caja", label: "Consultar caja", detail: "Movimientos y cierres", icon: BadgeDollarSign, visible: common.cash },
        { to: "/reportes", label: "Reportes", detail: "Ventas e indicadores del período", icon: BookOpenCheck, visible: common.reports },
        { to: "/inventario", label: "Inventario", detail: "Existencias y movimientos", icon: PackageSearch, visible: common.inventory },
      ],
    },
    ADMIN: {
      title: "Administración del restaurante",
      description: "Supervisa la operación y utiliza los módulos habilitados por el plan y tus permisos.",
      functions: [
        "Supervisar salón, cocina, caja y distribución.",
        "Consultar indicadores y reportes disponibles.",
        "Gestionar configuración y usuarios autorizados.",
        "Revisar facturación, auditoría y trazabilidad.",
      ],
      actions: [
        { to: "/salon", label: "Supervisar salón", detail: "Operación en vivo", icon: UtensilsCrossed, visible: common.salon },
        { to: "/caja", label: "Revisar caja", detail: "Ventas y cobros", icon: CreditCard, visible: common.cash },
        { to: "/reportes", label: "Ver reportes", detail: "Indicadores del negocio", icon: BookOpenCheck, visible: common.reports },
        { to: "/facturas", label: "Facturación", detail: "Comprobantes comerciales", icon: ReceiptText, visible: common.invoices },
      ],
    },
  };

  const workspace = workspaces[role] ?? {
    title: "Tu espacio de trabajo",
    description: "Utiliza las opciones habilitadas por tu perfil.",
    functions: ["Tus funciones dependen de los permisos configurados por el restaurante."],
    actions: [],
  };
  const actions = workspace.actions.filter((action) => action.visible);

  return (
    <div className="space-y-5">
      <section className="card border-l-4 border-marigold">
        <p className="eyebrow">{role.replaceAll("_", " ")} · {branchId ? session?.user.sucursalNombre ?? "Sucursal seleccionada" : "Alcance restaurante"}</p>
        <h2 className="mt-2 text-2xl font-black">{workspace.title}</h2>
        <p className="mt-2 max-w-3xl text-denim/65">{workspace.description}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
        <FunctionCard icon={ClipboardList} title="Tus funciones">
          <ul className="space-y-2">
            {workspace.functions.map((item) => (
              <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-marigold" />{item}</li>
            ))}
          </ul>
        </FunctionCard>

        <article className="card">
          <h2 className="text-lg font-black">Accesos rápidos</h2>
          <p className="mt-1 text-sm text-denim/55">Sólo aparecen funciones disponibles para tu perfil y el plan del restaurante.</p>
          {actions.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {actions.map(({ to, label, detail, icon: Icon }) => (
                <Link key={to + label} to={to} className="rounded-2xl border border-denim/10 p-4 transition hover:border-marigold hover:bg-marigold/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-denim/[.06]"><Icon size={19} /></div>
                    <ArrowUpRight size={18} className="text-denim/35" />
                  </div>
                  <strong className="mt-4 block">{label}</strong>
                  <span className="mt-1 block text-xs text-denim/50">{detail}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-denim/[.04] p-4 text-sm text-denim/55">No hay accesos operativos adicionales disponibles con los permisos actuales.</p>
          )}
        </article>
      </section>
    </div>
  );
}

export function RealDashboardPage() {
  const { branchId, hasPermission, hasCapability, session } = useApp();
  const allowed = hasPermission("REPORTES_VER") && hasCapability("ANALYTICS");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [range, setRange] = useState({ desde: "", hasta: "" });
  useEffect(() => {
    if (!allowed || !branchId) return;
    const controller = new AbortController();
    void api
      .get<Summary>("/dashboard/resumen", {
        signal: controller.signal,
        params: {
          sucursalId: branchId,
          desde: range.desde || undefined,
          hasta: range.hasta || undefined,
        },
      })
      .then(({ data }) => {
        setSummary(data);
        setError("");
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [allowed, branchId, range, revision]);

  const roleNeedsWorkspace = useMemo(() => {
    const role = (session?.user.rol ?? "").toUpperCase();
    return ["MESERO", "COCINA", "BAR", "CAJERO", "DOMICILIARIO", "CONTADOR"].includes(role);
  }, [session?.user.rol]);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">SIGR · sesión real</p>
        <h1 className="page-title">Hola, {session?.user.nombres}</h1>
      </header>

      {roleNeedsWorkspace || !allowed ? <RoleWorkspace /> : !branchId ? (
        <p>Selecciona una sucursal para consultar su operación.</p>
      ) : (
        <>
          <RoleWorkspace />
          <div className="flex flex-wrap items-end gap-3">
            <label>
              Desde
              <input className="input" type="date" value={range.desde} onChange={(event) => setRange({ ...range, desde: event.target.value })} />
            </label>
            <label>
              Hasta
              <input className="input" type="date" value={range.hasta} onChange={(event) => setRange({ ...range, hasta: event.target.value })} />
            </label>
            <button className="secondary w-auto" onClick={() => setRevision(revision + 1)}>Actualizar</button>
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>
          ) : !summary ? (
            <p role="status">Consultando resumen…</p>
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Ventas del período", money.format(Number(summary.ventas.total))],
                  ["Pagado", money.format(Number(summary.ventas.totalPagado))],
                  ["Pedidos del período", summary.pedidos.cantidad],
                  ["Ticket promedio", money.format(summary.ventas.cantidad ? Number(summary.ventas.total) / summary.ventas.cantidad : 0)],
                  ["Mesas ocupadas ahora", summary.operacionActual.mesasOcupadas],
                  ["Mesas pendientes de pago", summary.operacionActual.mesasPendientesPago],
                  ["Cajas abiertas ahora", summary.operacionActual.cajasAbiertas],
                  ["Productos sin stock", summary.inventario.sinStock],
                ].map(([label, value]) => (
                  <article className="card" key={label}>
                    <p className="eyebrow">{label}</p>
                    <strong className="mt-3 block text-3xl">{value}</strong>
                  </article>
                ))}
              </section>
              <section className="card">
                <h2 className="font-bold">Productos más vendidos</h2>
                {summary.productosMasVendidos.map((product) => (
                  <div className="flex justify-between border-b py-3" key={product.productoId}>
                    <span>{product.producto}</span><strong>{product.cantidadVendida} und.</strong>
                  </div>
                ))}
                {!summary.productosMasVendidos.length && <p>No hay ventas para este período.</p>}
                <Link to="/reportes" className="mt-4 inline-block underline">Consultar reportes</Link>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
