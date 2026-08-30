import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

type Supplier = { id: number; nombre: string };
type Payment = { id: number; monto: number; fecha: string; metodo: string; referencia?: string };
type Invoice = { id: number; numero: string; fechaEmision: string; fechaVencimiento: string; total: number; saldo: number; estado: string; proveedor: Supplier; abonos: Payment[] };
type Close = { id: number; fecha: string; totalVentas: number; totalCobrado: number; nuevasObligaciones: number; abonosProveedores: number; saldoProveedores: number; diferenciaCajas: number };
type Report = { facturas: Invoice[]; abonos: (Payment & { factura: Invoice })[]; cierres: Close[]; totales: { facturado: number; saldo: number; abonado: number } };
const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;

export function PayablesPage() {
  const { branchId, session } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [supplierId, setSupplierId] = useState(0); const [number, setNumber] = useState(""); const [issued, setIssued] = useState(today); const [due, setDue] = useState(today); const [total, setTotal] = useState(0);
  const [from, setFrom] = useState(monthStart); const [to, setTo] = useState(today); const [report, setReport] = useState<Report | null>(null);
  const load = useCallback(async () => {
    if (!branchId) return;
    if (session?.demo) {
      const demoSuppliers = [{ id: 1, nombre: "Distribuciones La Sabana" }, { id: 2, nombre: "Bebidas del Caribe" }];
      setSuppliers(demoSuppliers); setSupplierId((value) => value || 1);
      setInvoices((current) => current.length ? current : [{ id: 1, numero: "FP-1048", fechaEmision: today, fechaVencimiento: today, total: 680000, saldo: 420000, estado: "PARCIAL", proveedor: demoSuppliers[0], abonos: [{ id: 1, monto: 260000, fecha: new Date().toISOString(), metodo: "TRANSFERENCIA", referencia: "TRX-381" }] }]); return;
    }
    try { const [providerResponse, invoiceResponse] = await Promise.all([api.get<Supplier[]>("/abastecimiento/proveedores"), api.get<Invoice[]>("/cuentas-pagar/facturas", { params: { sucursalId: branchId } })]); setSuppliers(providerResponse.data); setInvoices(invoiceResponse.data); setSupplierId((value) => value || providerResponse.data[0]?.id || 0); }
    catch (error) { toast.error(errorMessage(error)); }
  }, [branchId, session?.demo]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const outstanding = useMemo(() => invoices.reduce((sum, invoice) => sum + Number(invoice.saldo), 0), [invoices]);
  const createInvoice = async () => {
    if (!branchId || !supplierId || !number.trim() || total <= 0) return toast.error("Completa proveedor, número y total");
    if (due < issued) return toast.error("El vencimiento no puede ser anterior a la emisión");
    if (session?.demo) { const supplier = suppliers.find((item) => item.id === supplierId)!; setInvoices((current) => [{ id: Date.now(), numero: number.trim(), fechaEmision: issued, fechaVencimiento: due, total, saldo: total, estado: "PENDIENTE", proveedor: supplier, abonos: [] }, ...current]); setNumber(""); setTotal(0); return toast.success("Factura registrada en demostración"); }
    try { await api.post("/cuentas-pagar/facturas", { sucursalId: branchId, proveedorId: supplierId, numero: number.trim(), fechaEmision: issued, fechaVencimiento: due, total }); setNumber(""); setTotal(0); await load(); toast.success("Factura de proveedor registrada"); } catch (error) { toast.error(errorMessage(error)); }
  };
  const pay = async (invoice: Invoice) => {
    const raw = window.prompt(`Abono para ${invoice.numero}. Saldo ${money.format(Number(invoice.saldo))}`); if (!raw) return; const amount = Number(raw); if (!(amount > 0) || amount > Number(invoice.saldo)) return toast.error("Monto inválido");
    const method = window.prompt("Método de pago", "TRANSFERENCIA")?.trim() || "TRANSFERENCIA";
    if (session?.demo) { setInvoices((current) => current.map((item) => item.id !== invoice.id ? item : { ...item, saldo: Number(item.saldo) - amount, estado: Number(item.saldo) === amount ? "PAGADA" : "PARCIAL", abonos: [{ id: Date.now(), monto: amount, fecha: new Date().toISOString(), metodo: method }, ...item.abonos] })); return toast.success("Abono registrado"); }
    try { await api.post(`/cuentas-pagar/facturas/${invoice.id}/abonos`, { monto: amount, metodo: method }, { headers: { "Idempotency-Key": crypto.randomUUID() } }); await load(); toast.success("Abono registrado"); } catch (error) { toast.error(errorMessage(error)); }
  };
  const closeDay = async () => {
    if (!branchId) return;
    if (session?.demo) return toast.success("Cierre administrativo generado en demostración");
    try { await api.post("/cuentas-pagar/cierres", { sucursalId: branchId, fecha: today }); toast.success("Cierre administrativo generado"); await consult(); } catch (error) { toast.error(errorMessage(error)); }
  };
  const consult = async () => {
    if (!branchId) return;
    if (session?.demo) { setReport({ facturas: invoices, abonos: invoices.flatMap((invoice) => invoice.abonos.map((payment) => ({ ...payment, factura: invoice }))), cierres: [], totales: { facturado: invoices.reduce((sum, item) => sum + Number(item.total), 0), saldo: outstanding, abonado: invoices.reduce((sum, item) => sum + item.abonos.reduce((part, payment) => part + Number(payment.monto), 0), 0) } }); return; }
    try { const response = await api.get<Report>("/cuentas-pagar/reporte", { params: { sucursalId: branchId, desde: from, hasta: to } }); setReport(response.data); } catch (error) { toast.error(errorMessage(error)); }
  };
  const exportCsv = () => {
    if (!report) return toast.error("Consulta primero el periodo");
    const rows = [["tipo", "fecha", "tercero", "documento", "debito", "credito", "saldo"], ...report.facturas.map((item) => ["FACTURA", item.fechaEmision, item.proveedor.nombre, item.numero, item.total, 0, item.saldo]), ...report.abonos.map((item) => ["ABONO", item.fecha, item.factura.proveedor.nombre, item.factura.numero, 0, item.monto, item.factura.saldo])];
    const blob = new Blob([rows.map((row) => row.join(";")).join("\n")], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `cuentas-pagar-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  return <div className="space-y-6"><header><p className="eyebrow">Administración financiera</p><h1 className="page-title">Cuentas por pagar y cierres</h1><p>Control auxiliar de obligaciones con proveedores. No reemplaza una contabilidad general.</p></header><div className="grid gap-4 sm:grid-cols-3"><div className="card"><p className="eyebrow">Documentos</p><strong className="text-3xl">{invoices.length}</strong></div><div className="card"><p className="eyebrow">Saldo pendiente</p><strong className="text-3xl">{money.format(outstanding)}</strong></div><div className="card"><p className="eyebrow">Vencidas</p><strong className="text-3xl">{invoices.filter((item) => item.estado === "VENCIDA").length}</strong></div></div><section className="card space-y-3"><h2 className="text-xl font-black">Registrar factura de proveedor</h2><div className="grid gap-3 md:grid-cols-5"><select className="input" value={supplierId} onChange={(event) => setSupplierId(Number(event.target.value))}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nombre}</option>)}</select><input className="input" placeholder="Número de factura" value={number} onChange={(event) => setNumber(event.target.value)}/><input className="input" aria-label="Fecha de emisión" type="date" value={issued} onChange={(event) => setIssued(event.target.value)}/><input className="input" aria-label="Fecha de vencimiento" type="date" value={due} onChange={(event) => setDue(event.target.value)}/><input className="input" type="number" min="0.01" placeholder="Total" value={total || ""} onChange={(event) => setTotal(Number(event.target.value))}/></div><button className="primary" onClick={() => void createInvoice()}>Guardar obligación</button></section><section className="card overflow-x-auto"><h2 className="text-xl font-black">Estado de cuenta</h2><table className="mt-3 w-full text-left text-sm"><thead><tr><th className="p-3">Proveedor / factura</th><th>Emisión</th><th>Vencimiento</th><th>Estado</th><th>Total</th><th>Saldo</th><th></th></tr></thead><tbody>{invoices.map((invoice) => <tr className="border-t" key={invoice.id}><td className="p-3"><b>{invoice.proveedor.nombre}</b><small className="block">{invoice.numero}</small></td><td>{invoice.fechaEmision.slice(0, 10)}</td><td>{invoice.fechaVencimiento.slice(0, 10)}</td><td>{invoice.estado}</td><td>{money.format(Number(invoice.total))}</td><td className="font-bold">{money.format(Number(invoice.saldo))}</td><td>{Number(invoice.saldo) > 0 && <button className="secondary my-2 h-10 w-auto px-3" onClick={() => void pay(invoice)}>Registrar abono</button>}</td></tr>)}</tbody></table></section><section className="card space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Cierre y reporte contable</h2><p className="text-sm text-denim/55">Resumen diario inmutable y exportación auxiliar por periodo.</p></div><button className="secondary w-auto px-4" onClick={() => void closeDay()}>Cerrar día</button></div><div className="flex flex-wrap gap-3"><input className="input w-auto" type="date" value={from} onChange={(event) => setFrom(event.target.value)}/><input className="input w-auto" type="date" value={to} onChange={(event) => setTo(event.target.value)}/><button className="primary w-auto px-5" onClick={() => void consult()}>Consultar</button><button className="secondary w-auto px-5" onClick={exportCsv}>Exportar CSV</button></div>{report && <div className="grid gap-3 sm:grid-cols-3"><span>Facturado <b>{money.format(Number(report.totales.facturado))}</b></span><span>Abonado <b>{money.format(Number(report.totales.abonado))}</b></span><span>Saldo <b>{money.format(Number(report.totales.saldo))}</b></span></div>}</section></div>;
}
