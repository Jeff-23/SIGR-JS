import { BarChart3, Boxes, Download, FileText, Landmark, ReceiptText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { money } from "../data/demo";
import { api, errorMessage } from "../lib/api";
import { downloadCsv } from "../lib/reports";
import { useApp } from "../store/app";

type Sale = {
  id: number;
  estado: string;
  origen: string;
  total: string | number;
  subtotal?: string | number;
  impuestos?: string | number;
  descuentos?: string | number;
  fechaOperacion: string;
  sucursalId: number;
  pedido?: { mesa?: { numero?: string | number } | null } | null;
  pagos?: Array<{
    monto?: string | number;
    valor?: string | number;
    metodoPago?: { nombre?: string } | null;
    devoluciones?: Array<{ monto?: string | number; valor?: string | number }>;
  }>;
};

type CashClose = {
  id: number;
  fechaApertura: string;
  fechaCierre?: string | null;
  saldoInicial: string | number;
  saldoFinal?: string | number | null;
  diferencia?: string | number | null;
  sucursal: { id: number; nombre: string };
  abiertaPor?: { nombres: string; apellidos: string } | null;
  cerradaPor?: { nombres: string; apellidos: string } | null;
};

const localDate = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
const startOfMonth = () => `${localDate().slice(0, 7)}-01`;
const asNumber = (value: string | number | null | undefined) => Number(value ?? 0);

export function AccountantPage() {
  const { branchId, session, hasPermission, hasCapability } = useApp();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(localDate());
  const [applied, setApplied] = useState({ from: startOfMonth(), to: localDate() });
  const [sales, setSales] = useState<Sale[]>([]);
  const [cash, setCash] = useState<CashClose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canSales = hasPermission("VENTAS_VER");
  const canCash = hasPermission("CAJA_VER");
  const canInvoices = hasPermission("REGISTROS_FACTURA_VER");
  const canExportInvoices = hasPermission("REGISTROS_FACTURA_EXPORTAR");
  const canReports = hasPermission("REPORTES_VER") && hasCapability("REPORTES");
  const canInventory = hasPermission("INVENTARIO_VER") && hasCapability("INVENTARIO");

  const load = useCallback(async () => {
    if (!branchId || session?.demo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const desde = new Date(`${applied.from}T00:00:00-05:00`).toISOString();
      const hasta = new Date(`${applied.to}T23:59:59.999-05:00`).toISOString();
      const [salesResponse, cashResponse] = await Promise.all([
        canSales
          ? api.get<Sale[]>("/ventas", { params: { sucursalId: branchId, desde, hasta, pagina: 1, limite: 200 } })
          : Promise.resolve({ data: [] as Sale[] }),
        canCash
          ? api.get<CashClose[]>("/cajas/historial", { params: { sucursalId: branchId, desde, hasta, pagina: 1, limite: 100 } })
          : Promise.resolve({ data: [] as CashClose[] }),
      ]);
      setSales(salesResponse.data);
      setCash(cashResponse.data);
      setError("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, [applied.from, applied.to, branchId, canCash, canSales, session?.demo]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const metrics = useMemo(() => {
    const total = sales.reduce((sum, sale) => sum + asNumber(sale.total), 0);
    const paid = sales.reduce(
      (sum, sale) =>
        sum +
        (sale.pagos ?? []).reduce((paymentSum, payment) => {
          const gross = asNumber(payment.monto ?? payment.valor);
          const returned = (payment.devoluciones ?? []).reduce(
            (returnSum, item) => returnSum + asNumber(item.monto ?? item.valor),
            0,
          );
          return paymentSum + Math.max(0, gross - returned);
        }, 0),
      0,
    );
    const methods = new Map<string, number>();
    sales.forEach((sale) =>
      (sale.pagos ?? []).forEach((payment) => {
        const name = payment.metodoPago?.nombre ?? "Sin método";
        methods.set(name, (methods.get(name) ?? 0) + asNumber(payment.monto ?? payment.valor));
      }),
    );
    return { total, paid, count: sales.length, methods: [...methods.entries()].sort((a, b) => b[1] - a[1]) };
  }, [sales]);

  async function exportInvoices() {
    if (!branchId || !canExportInvoices) return;
    try {
      const response = await api.get("/registros-factura/exportar.csv", {
        params: { sucursalId: branchId, desde: `${applied.from}T00:00:00-05:00`, hasta: `${applied.to}T23:59:59.999-05:00` },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `archivo-facturas-${applied.from}-${applied.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      toast.error(errorMessage(failure));
    }
  }

  function exportSales() {
    downloadCsv(`ventas-contabilidad-${applied.from}-${applied.to}.csv`, [
      ["Venta", "Fecha", "Estado", "Origen", "Total", "Mesa"],
      ...sales.map((sale) => [
        sale.id,
        sale.fechaOperacion,
        sale.estado,
        sale.origen,
        asNumber(sale.total),
        sale.pedido?.mesa?.numero ?? "",
      ]),
    ]);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Consulta financiera · sólo lectura</p>
        <h1 className="page-title">Consulta contable</h1>
        <p className="mt-2 text-sm text-denim/55">
          Ventas, pagos, cierres y archivo comercial dentro de la sucursal seleccionada. Las funciones de inventario y reportes avanzados siguen sujetas al plan contratado.
        </p>
      </header>

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (from > to) return setError("La fecha inicial debe ser anterior o igual a la final.");
          setError("");
          setApplied({ from, to });
        }}
      >
        <label>Desde<input className="input" type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Hasta<input className="input" type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="primary w-auto px-4">Consultar</button>
        <button type="button" className="secondary w-auto px-4" onClick={() => void load()}><RefreshCw size={17} /> Actualizar</button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {loading && <p role="status">Consultando información…</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card"><ReceiptText size={20} /><p className="mt-2 text-sm text-denim/55">Ventas</p><strong className="mt-1 block text-3xl">{metrics.count}</strong></article>
        <article className="card"><FileText size={20} /><p className="mt-2 text-sm text-denim/55">Valor vendido</p><strong className="mt-1 block text-3xl">{money.format(metrics.total)}</strong></article>
        <article className="card"><Landmark size={20} /><p className="mt-2 text-sm text-denim/55">Pagos registrados</p><strong className="mt-1 block text-3xl">{money.format(metrics.paid)}</strong></article>
        <article className="card"><Landmark size={20} /><p className="mt-2 text-sm text-denim/55">Cierres de caja</p><strong className="mt-1 block text-3xl">{cash.length}</strong></article>
      </section>

      <section className="card">
        <h2 className="text-xl font-black">Herramientas del contador</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {canInvoices && <Link className="secondary w-auto px-4" to="/facturas"><FileText size={17} /> Archivo de facturas</Link>}
          {canExportInvoices && <button className="secondary w-auto px-4" onClick={() => void exportInvoices()}><Download size={17} /> Exportar facturas CSV</button>}
          {canSales && <button className="secondary w-auto px-4" disabled={!sales.length} onClick={exportSales}><Download size={17} /> Exportar ventas CSV</button>}
          {canCash && <Link className="secondary w-auto px-4" to="/caja"><Landmark size={17} /> Consultar caja</Link>}
          {canReports && <Link className="secondary w-auto px-4" to="/reportes"><BarChart3 size={17} /> Reportes</Link>}
          {canInventory && <Link className="secondary w-auto px-4" to="/inventario"><Boxes size={17} /> Inventario</Link>}
        </div>
        {!canReports && <p className="mt-4 text-sm text-denim/55">Los reportes estadísticos avanzados no están habilitados por el plan actual.</p>}
        {!canInventory && <p className="mt-2 text-sm text-denim/55">El inventario no está habilitado para este perfil o para el plan actual.</p>}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="text-xl font-black">Últimas ventas del período</h2>
          <div className="mt-3 max-h-[28rem] overflow-auto">
            {sales.slice(0, 30).map((sale) => (
              <div key={sale.id} className="flex items-center justify-between gap-4 border-b py-3 text-sm">
                <div><strong>Venta #{sale.id}</strong><p className="text-denim/50">{new Date(sale.fechaOperacion).toLocaleString("es-CO")} · {sale.estado}</p></div>
                <strong>{money.format(asNumber(sale.total))}</strong>
              </div>
            ))}
            {!sales.length && !loading && <p className="py-6 text-denim/50">No hay ventas en el período seleccionado.</p>}
          </div>
        </section>
        <section className="card">
          <h2 className="text-xl font-black">Pagos por medio</h2>
          <div className="mt-3">
            {metrics.methods.map(([name, total]) => <div key={name} className="flex justify-between border-b py-3"><span>{name}</span><strong>{money.format(total)}</strong></div>)}
            {!metrics.methods.length && !loading && <p className="py-6 text-denim/50">No hay pagos registrados en el período.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
