import {
  BarChart3,
  Boxes,
  Download,
  FileText,
  Landmark,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { money } from "../data/demo";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

type Contabilidad = {
  periodo: { desde: string; hasta: string; zonaHoraria: string };
  resumen: {
    cantidadVentas: number;
    totalVentas: number;
    subtotalVentas: number;
    descuentos: number;
    impuestos: number;
    impoconsumo: number;
    propinas: number;
    totalCobrado: number;
    totalCompras: number;
    totalPagadoProveedores: number;
    totalEgresos: number;
    cierresCaja: number;
  };
  pagosPorMetodo: Array<{ metodo: string; total: number }>;
  productos: Array<{ productoId: number; nombre: string; cantidad: number; total: number }>;
  diario: Array<{
    fecha: string;
    ventas: number;
    cantidadVentas: number;
    compras: number;
    pagosProveedores: number;
    egresosCaja: number;
  }>;
  ventas: Array<{
    id: number;
    fechaOperacion: string;
    estado: string;
    origen: string;
    subtotal: number;
    descuentos: number;
    impuestos: number;
    impoconsumo: number;
    propina: number;
    domicilioCosto: number;
    total: number;
    pedido?: { mesa?: { numero?: string | number } | null } | null;
    usuario: { nombres: string; apellidos: string };
    detalles: Array<{
      cantidad: number;
      precioUnitario: number;
      subtotal: number;
      producto: { id: number; nombre: string };
    }>;
    pagos: Array<{ metodo: string; monto: number; devuelto: number }>;
  }>;
  compras: Array<{
    id: number;
    numero: string;
    fechaEmision: string;
    fechaVencimiento: string;
    total: number;
    saldo: number;
    estado: string;
    proveedor: { nombre: string };
  }>;
  pagosProveedores: Array<{
    id: number;
    fecha: string;
    monto: number;
    metodo: string;
    referencia?: string | null;
    observaciones?: string | null;
    factura: { numero: string; proveedor: { nombre: string } };
  }>;
  egresosCaja: Array<{
    id: number;
    creadoEn: string;
    monto: number;
    concepto: string;
    observacion?: string | null;
    caja: { nombre: string };
    usuario: { nombres: string; apellidos: string };
  }>;
  cierres: Array<{
    id: number;
    nombre: string;
    fechaApertura: string;
    fechaCierre?: string | null;
    saldoInicial: number;
    saldoEsperado: number;
    saldoContado: number;
    diferencia: number;
    totalIngresos: number;
    totalEgresos: number;
  }>;
};

type Libro = {
  rows: Array<{
    tipo: string;
    fecha: string;
    documento: string;
    contraparte: string;
    detalle: string;
    cantidad: string | number;
    precioUnitario: string | number;
    subtotal: string | number;
    entrada: string | number;
    salida: string | number;
    medio: string;
    referencia: string;
    totalDocumento: string | number;
  }>;
};

const localDate = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
const startOfMonth = () => `${localDate().slice(0, 7)}-01`;
const formatDate = (value: string) => new Date(value).toLocaleDateString("es-CO");
const formatDateTime = (value: string) => new Date(value).toLocaleString("es-CO");

const excelCsvCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

function downloadExcelFriendlyCsv(filename: string, rows: Array<Array<unknown>>) {
  const separator = ";";
  const body = rows.map((row) => row.map(excelCsvCell).join(separator)).join("\r\n");
  // Excel en configuraciones regionales como es-CO suele esperar punto y coma.
  // La directiva sep=; fuerza la separación correcta en columnas al abrir el archivo.
  const content = `\uFEFFsep=;\r\n${body}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function metric(label: string, value: string | number, icon: ReactNode, note?: string) {
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-denim/55">{label}</p>
          <strong className="mt-1 block text-2xl xl:text-3xl">{value}</strong>
          {note && <p className="mt-2 text-xs text-denim/45">{note}</p>}
        </div>
        <span className="rounded-xl bg-black/5 p-2">{icon}</span>
      </div>
    </article>
  );
}

export function AccountantPage() {
  const { branchId, session, hasPermission, hasCapability } = useApp();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(localDate());
  const [applied, setApplied] = useState({ from: startOfMonth(), to: localDate() });
  const [data, setData] = useState<Contabilidad | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const canCash = hasPermission("CAJA_VER");
  const canInvoices = hasPermission("REGISTROS_FACTURA_VER");
  const canExportInvoices = hasPermission("REGISTROS_FACTURA_EXPORTAR");
  const canReports = hasPermission("REPORTES_VER") && hasCapability("REPORTES");
  const canInventory = hasPermission("INVENTARIO_VER") && hasCapability("INVENTARIO");
  const canPayables = hasPermission("REPORTES_VER") && hasCapability("CUENTAS_PAGAR");

  const params = useMemo(() => {
    const desde = new Date(`${applied.from}T00:00:00-05:00`).toISOString();
    const hasta = new Date(`${applied.to}T23:59:59.999-05:00`).toISOString();
    return { sucursalId: branchId, desde, hasta };
  }, [applied.from, applied.to, branchId]);

  const load = useCallback(async () => {
    if (!branchId || session?.demo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get<Contabilidad>("/contabilidad/consulta", { params });
      setData(response.data);
      setError("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, [branchId, params, session?.demo]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function exportInvoices() {
    if (!branchId || !canExportInvoices) return;
    try {
      const response = await api.get("/registros-factura/exportar.csv", {
        params: { sucursalId: branchId, desde: params.desde, hasta: params.hasta },
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

  async function exportAccountingBook() {
    if (!branchId) return;
    setExporting(true);
    try {
      const response = await api.get<Libro>("/contabilidad/libro", { params });
      downloadExcelFriendlyCsv(`libro-contable-${applied.from}-${applied.to}.csv`, [
        [
          "Tipo",
          "Fecha",
          "Documento",
          "Contraparte / Mesa",
          "Detalle / Producto",
          "Cantidad",
          "Precio unitario",
          "Subtotal",
          "Entrada",
          "Salida",
          "Medio",
          "Referencia / Estado",
          "Total documento",
        ],
        ...response.data.rows.map((row) => [
          row.tipo,
          row.fecha,
          row.documento,
          row.contraparte,
          row.detalle,
          row.cantidad,
          row.precioUnitario,
          row.subtotal,
          row.entrada,
          row.salida,
          row.medio,
          row.referencia,
          row.totalDocumento,
        ]),
      ]);
    } catch (failure) {
      toast.error(errorMessage(failure));
    } finally {
      setExporting(false);
    }
  }

  const summary = data?.resumen;
  const netCashFlow = summary
    ? summary.totalCobrado - summary.totalPagadoProveedores - summary.totalEgresos
    : 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Consulta financiera · sólo lectura</p>
        <h1 className="page-title">Consulta contable</h1>
        <p className="mt-2 max-w-4xl text-sm text-denim/55">
          Lectura consolidada de ventas, productos vendidos, cobros, compras a proveedores, pagos a proveedores,
          egresos internos y cierres de caja de la sucursal seleccionada.
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
        <button type="button" className="secondary w-auto px-4" disabled={exporting || !data} onClick={() => void exportAccountingBook()}>
          <Download size={17} /> {exporting ? "Preparando…" : "Exportar para Excel"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {loading && <p role="status">Consultando información contable…</p>}

      {summary && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metric("Ventas", summary.cantidadVentas, <ReceiptText size={20} />, `${money.format(summary.totalVentas)} vendidos`)}
            {metric("Cobrado", money.format(summary.totalCobrado), <Landmark size={20} />, `Pendiente aproximado: ${money.format(Math.max(0, summary.totalVentas - summary.totalCobrado))}`)}
            {metric("Compras / obligaciones", money.format(summary.totalCompras), <ShoppingCart size={20} />, "Facturas de proveedor emitidas en el período")}
            {metric("Pagado a proveedores", money.format(summary.totalPagadoProveedores), <WalletCards size={20} />)}
            {metric("Egresos internos de caja", money.format(summary.totalEgresos), <FileText size={20} />, "Incluye gastos internos registrados como egresos, identificados por concepto")}
            {metric("Flujo operativo neto", money.format(netCashFlow), <BarChart3 size={20} />, "Cobros - pagos a proveedores - egresos internos")}
            {metric("Impuestos + impoconsumo", money.format(summary.impuestos + summary.impoconsumo), <ReceiptText size={20} />)}
            {metric("Cierres de caja", summary.cierresCaja, <Landmark size={20} />)}
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Resumen diario</h2>
                <p className="mt-1 text-sm text-denim/50">Ventas del día y principales salidas financieras.</p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-denim/55">
                  <tr><th className="py-3">Fecha</th><th>Ventas</th><th>Valor vendido</th><th>Compras</th><th>Pago proveedores</th><th>Egresos internos</th></tr>
                </thead>
                <tbody>
                  {data.diario.map((item) => (
                    <tr key={item.fecha} className="border-b last:border-0">
                      <td className="py-3 font-bold">{item.fecha}</td>
                      <td>{item.cantidadVentas}</td>
                      <td className="font-semibold">{money.format(item.ventas)}</td>
                      <td>{money.format(item.compras)}</td>
                      <td>{money.format(item.pagosProveedores)}</td>
                      <td>{money.format(item.egresosCaja)}</td>
                    </tr>
                  ))}
                  {!data.diario.length && <tr><td className="py-6 text-denim/50" colSpan={6}>No hay movimientos en el período.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card">
              <h2 className="text-xl font-black">Productos vendidos</h2>
              <p className="mt-1 text-sm text-denim/50">Cantidad y valor por producto en las ventas cargadas.</p>
              <div className="mt-3 max-h-[30rem] overflow-auto">
                {data.productos.slice(0, 50).map((product) => (
                  <div key={product.productoId} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b py-3 text-sm">
                    <strong>{product.nombre}</strong>
                    <span>{product.cantidad} un.</span>
                    <strong>{money.format(product.total)}</strong>
                  </div>
                ))}
                {!data.productos.length && <p className="py-6 text-denim/50">No hay productos vendidos.</p>}
              </div>
            </section>

            <section className="card">
              <h2 className="text-xl font-black">Cobros por medio</h2>
              <div className="mt-3">
                {data.pagosPorMetodo.map((item) => (
                  <div key={item.metodo} className="flex justify-between border-b py-3"><span>{item.metodo}</span><strong>{money.format(item.total)}</strong></div>
                ))}
                {!data.pagosPorMetodo.length && <p className="py-6 text-denim/50">No hay pagos registrados.</p>}
              </div>
            </section>
          </div>

          <section className="card">
            <h2 className="text-xl font-black">Detalle de ventas</h2>
            <p className="mt-1 text-sm text-denim/50">Productos, cantidades, precios, impuestos y medios de pago por venta.</p>
            <div className="mt-4 space-y-3">
              {data.ventas.slice(0, 40).map((sale) => (
                <details key={sale.id} className="rounded-2xl border bg-white px-4 py-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong>Venta #{sale.id}</strong>
                        <p className="text-xs text-denim/50">{formatDateTime(sale.fechaOperacion)} · {sale.origen} · {sale.estado}{sale.pedido?.mesa?.numero ? ` · Mesa ${sale.pedido.mesa.numero}` : ""}</p>
                      </div>
                      <strong className="text-lg">{money.format(sale.total)}</strong>
                    </div>
                  </summary>
                  <div className="mt-4 overflow-x-auto border-t pt-3">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead className="text-left text-denim/50"><tr><th>Producto</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th></tr></thead>
                      <tbody>{sale.detalles.map((detail, index) => <tr key={`${detail.producto.id}-${index}`} className="border-b"><td className="py-2">{detail.producto.nombre}</td><td>{detail.cantidad}</td><td>{money.format(detail.precioUnitario)}</td><td>{money.format(detail.subtotal)}</td></tr>)}</tbody>
                    </table>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      <span>Subtotal: <strong>{money.format(sale.subtotal)}</strong></span>
                      <span>Descuentos: <strong>{money.format(sale.descuentos)}</strong></span>
                      <span>Impuestos: <strong>{money.format(sale.impuestos + sale.impoconsumo)}</strong></span>
                      <span>Propina: <strong>{money.format(sale.propina)}</strong></span>
                    </div>
                    <p className="mt-3 text-sm"><strong>Pagos:</strong> {sale.pagos.length ? sale.pagos.map((payment) => `${payment.metodo} ${money.format(Math.max(0, payment.monto - payment.devuelto))}`).join(" · ") : "Sin pagos"}</p>
                  </div>
                </details>
              ))}
              {!data.ventas.length && <p className="py-6 text-denim/50">No hay ventas en el período.</p>}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className="card">
              <h2 className="text-xl font-black">Compras / proveedores</h2>
              <div className="mt-3 max-h-[28rem] overflow-auto">
                {data.compras.map((item) => <div key={item.id} className="border-b py-3 text-sm"><div className="flex justify-between gap-3"><strong>{item.proveedor.nombre}</strong><strong>{money.format(item.total)}</strong></div><p className="text-denim/50">Factura {item.numero} · {formatDate(item.fechaEmision)} · {item.estado}</p><p className="mt-1">Saldo: {money.format(item.saldo)}</p></div>)}
                {!data.compras.length && <p className="py-6 text-denim/50">No hay compras registradas.</p>}
              </div>
            </section>
            <section className="card">
              <h2 className="text-xl font-black">Pagos a proveedores</h2>
              <div className="mt-3 max-h-[28rem] overflow-auto">
                {data.pagosProveedores.map((item) => <div key={item.id} className="border-b py-3 text-sm"><div className="flex justify-between gap-3"><strong>{item.factura.proveedor.nombre}</strong><strong>{money.format(item.monto)}</strong></div><p className="text-denim/50">{formatDateTime(item.fecha)} · {item.metodo} · Factura {item.factura.numero}</p>{item.referencia && <p className="mt-1">Ref: {item.referencia}</p>}</div>)}
                {!data.pagosProveedores.length && <p className="py-6 text-denim/50">No hay pagos a proveedores.</p>}
              </div>
            </section>
            <section className="card">
              <h2 className="text-xl font-black">Egresos / gastos internos</h2>
              <p className="mt-1 text-xs text-denim/45">Los gastos de personal aparecen aquí cuando se registran como egresos de caja con su concepto.</p>
              <div className="mt-3 max-h-[28rem] overflow-auto">
                {data.egresosCaja.map((item) => <div key={item.id} className="border-b py-3 text-sm"><div className="flex justify-between gap-3"><strong>{item.concepto}</strong><strong>{money.format(item.monto)}</strong></div><p className="text-denim/50">{formatDateTime(item.creadoEn)} · {item.caja.nombre}</p>{item.observacion && <p className="mt-1">{item.observacion}</p>}</div>)}
                {!data.egresosCaja.length && <p className="py-6 text-denim/50">No hay egresos de caja.</p>}
              </div>
            </section>
          </div>

          <section className="card">
            <h2 className="text-xl font-black">Herramientas del contador</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {canInvoices && <Link className="secondary w-auto px-4" to="/facturas"><FileText size={17} /> Archivo de facturas</Link>}
              {canExportInvoices && <button className="secondary w-auto px-4" onClick={() => void exportInvoices()}><Download size={17} /> Exportar facturas CSV</button>}
              {canCash && <Link className="secondary w-auto px-4" to="/caja"><Landmark size={17} /> Consultar caja</Link>}
              {canPayables && <Link className="secondary w-auto px-4" to="/cuentas-pagar"><WalletCards size={17} /> Cuentas por pagar</Link>}
              {canReports && <Link className="secondary w-auto px-4" to="/reportes"><BarChart3 size={17} /> Reportes</Link>}
              {canInventory && <Link className="secondary w-auto px-4" to="/inventario"><Boxes size={17} /> Inventario</Link>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
