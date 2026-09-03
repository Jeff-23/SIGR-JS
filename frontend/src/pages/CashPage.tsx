import { useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  FileText,
  Landmark,
  Printer,
  Receipt,
  Search,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { money } from "../data/demo";
import { clampPaymentAmount } from "../features/cash/contracts";
import { useApp } from "../store/app";
import type { Order } from "../types";
import { RealCashPage } from "./RealCashPage";

type DemoPayment = {
  id: string;
  method: string;
  amount: number;
  reference?: string;
  received?: number;
  change?: number;
};
type DemoDocuments = {
  receipt: boolean;
  invoice: boolean;
  electronicPrepared: boolean;
  printCount: number;
};

const emptyDocuments: DemoDocuments = {
  receipt: false,
  invoice: false,
  electronicPrepared: false,
  printCount: 0,
};

export function CashPage() {
  const { session, branchId } = useApp();
  return session?.demo ? <DemoCashPage /> : <RealCashPage key={branchId} />;
}

function DemoCashPage() {
  const { orders, markPaid } = useApp();
  const [selected, setSelected] = useState<Order | null>(null);
  const [payments, setPayments] = useState<Record<number, DemoPayment[]>>({});
  const [documents, setDocuments] = useState<Record<number, DemoDocuments>>({});
  const [method, setMethod] = useState("EFECTIVO");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [tip, setTip] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [customer, setCustomer] = useState("Consumidor final");
  const [query, setQuery] = useState("");
  const [splitCount, setSplitCount] = useState("1");

  const pending = orders.filter(
    (order) => order.status === "PENDIENTE_PAGO" && order.paymentStatus === "PENDIENTE",
  );
  const visiblePending = pending.filter((order) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [
      `mesa ${order.table}`,
      String(order.table),
      `pedido ${order.id}`,
      String(order.id),
      order.waiter ?? "",
    ].some((value) => value.toLowerCase().includes(needle));
  });
  const paidOrders = orders.filter((order) => order.paymentStatus === "PAGADO");

  const selectedPayments = selected ? payments[selected.id] ?? [] : [];
  const selectedDocuments = selected ? documents[selected.id] ?? emptyDocuments : emptyDocuments;
  const totalWithAdjustments = selected
    ? Math.max(0, selected.total - Number(discount || 0) + Number(tip || 0))
    : 0;
  const paidAmount = selectedPayments.reduce((sum, item) => sum + item.amount, 0);
  const due = Math.max(0, totalWithAdjustments - paidAmount);
  const change = method === "EFECTIVO" ? Math.max(0, Number(received || 0) - Number(amount || 0)) : 0;
  const people = Math.max(1, Number(splitCount) || 1);
  const splitAmount = people > 1 ? totalWithAdjustments / people : 0;

  const pendingValue = pending.reduce((sum, order) => sum + order.total, 0);

  function updateDocuments(next: Partial<DemoDocuments>) {
    if (!selected) return;
    setDocuments((current) => ({
      ...current,
      [selected.id]: { ...(current[selected.id] ?? emptyDocuments), ...next },
    }));
  }

  function open(order: Order) {
    setSelected(order);
    const alreadyPaid = (payments[order.id] ?? []).reduce((sum, item) => sum + item.amount, 0);
    const remaining = Math.max(0, order.total - alreadyPaid);
    setAmount(String(remaining));
    setReceived(String(remaining));
    setMethod("EFECTIVO");
    setReference("");
    setTip("0");
    setDiscount("0");
    setCustomer("Consumidor final");
    setSplitCount("1");
  }

  function addPayment() {
    if (!selected) return;
    const applied = Number(amount);
    if (!(applied > 0) || applied > due) return toast.error("Revisa el monto del pago");
    if (method === "EFECTIVO" && Number(received) < applied)
      return toast.error("El efectivo recibido no cubre el monto aplicado");
    const cashTendered = method === "EFECTIVO" ? Number(received || 0) : undefined;
    const line: DemoPayment = {
      id: crypto.randomUUID(),
      method,
      amount: applied,
      reference: reference.trim() || undefined,
      received: cashTendered,
      change: method === "EFECTIVO" ? Math.max(0, Number(cashTendered || 0) - applied) : undefined,
    };
    const next = [...selectedPayments, line];
    setPayments((current) => ({ ...current, [selected.id]: next }));
    const nextPaid = next.reduce((sum, item) => sum + item.amount, 0);
    const remaining = Math.max(0, totalWithAdjustments - nextPaid);
    setAmount(String(remaining));
    setReceived(String(remaining));
    setReference("");
    if (remaining === 0) {
      markPaid(selected.id);
      toast.success(`Venta pagada. Mesa ${selected.table} lista para liberar.`);
    } else {
      toast.success("Pago parcial registrado. Puedes agregar otro medio.");
    }
  }

  function createReceipt() {
    updateDocuments({ receipt: true });
    toast.success("Comprobante interno generado. No es factura electrónica.");
  }

  function createInvoice() {
    if (due > 0) return toast.error("Completa el pago antes de crear la factura interna en el demo");
    updateDocuments({ invoice: true });
    toast.success("Factura interna creada. No se envió a DIAN.");
  }

  function prepareElectronic() {
    if (!selectedDocuments.invoice) return toast.error("Primero crea la factura interna");
    updateDocuments({ electronicPrepared: true });
    toast.success("Documento electrónico preparado en demo; no existe envío DIAN real.");
  }

  function printDocument() {
    const nextCount = selectedDocuments.printCount + 1;
    updateDocuments({ printCount: nextCount });
    toast.success(nextCount > 1 ? "Reimpresión autorizada simulada" : "Impresión simulada");
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Sprint 43 · Caja POS profesional</p>
        <h1 className="page-title">Cobros pendientes</h1>
        <p className="mt-2 text-sm text-denim/50">
          La demostración replica el flujo profesional: venta, pagos y factura permanecen separados.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="card">
          <p className="eyebrow">Por cobrar</p>
          <strong className="mt-2 block text-3xl">{pending.length}</strong>
        </article>
        <article className="card sm:col-span-2">
          <p className="eyebrow">Saldo pendiente</p>
          <strong className="mt-2 block text-3xl">{money.format(pendingValue)}</strong>
        </article>
      </section>

      {pending.length > 0 && (
        <label className="card block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold"><Search size={17} /> Buscar cobro</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Mesa, pedido o mesero"
          />
        </label>
      )}

      {pending.length === 0 ? (
        <div className="empty">
          <CheckCircle2 size={42} />
          <h2>Caja al día</h2>
          <p>Los pedidos entregados aparecerán aquí para cobrar.</p>
        </div>
      ) : visiblePending.length === 0 ? (
        <div className="empty">
          <Search size={36} />
          <h2>Sin coincidencias</h2>
          <p>Prueba con otro número de mesa, pedido o nombre del mesero.</p>
        </div>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {visiblePending.map((order) => {
            const orderPayments = payments[order.id] ?? [];
            const paid = orderPayments.reduce((sum, item) => sum + item.amount, 0);
            return (
              <article className="card" key={order.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Venta demo · Pedido #{String(order.id).slice(-4)}</p>
                    <h2 className="text-2xl font-black">Mesa {order.table}</h2>
                    <p className="mt-1 text-sm text-denim/50">{order.waiter ?? "Mesero"} · {order.guests ?? 2} personas</p>
                  </div>
                  <strong className="text-2xl">{money.format(order.total)}</strong>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <p>Pagado <strong>{money.format(paid)}</strong></p>
                  <p>Pendiente <strong>{money.format(Math.max(0, order.total - paid))}</strong></p>
                </div>
                <button className="primary mt-4" onClick={() => open(order)}>
                  <Receipt size={18} /> Abrir caja POS
                </button>
              </article>
            );
          })}
        </section>
      )}

      {paidOrders.length > 0 && (
        <section className="card">
          <h2 className="font-black">Pagos recientes</h2>
          <div className="mt-3 divide-y divide-denim/10">
            {paidOrders
              .slice(-5)
              .reverse()
              .map((order) => (
                <div key={order.id} className="flex justify-between py-3 text-sm">
                  <span>Mesa {order.table} · Pedido #{String(order.id).slice(-4)}</span>
                  <strong>{money.format(order.total)}</strong>
                </div>
              ))}
          </div>
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-steel/70 p-2 sm:p-4">
          <section className="mx-auto max-w-5xl rounded-2xl bg-[#f7f7f5] p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-denim/10 pb-4">
              <div>
                <p className="eyebrow">Caja POS · modo demostración</p>
                <h2 className="page-title">Mesa {selected.table} · Pedido #{String(selected.id).slice(-4)}</h2>
                <p className="mt-1 text-sm text-denim/55">Cliente: {customer || "Consumidor final"}</p>
              </div>
              <button className="secondary w-auto" onClick={() => setSelected(null)} aria-label="Cerrar caja POS demo"><X /></button>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-4">
                <section className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-denim p-5 text-white"><p className="eyebrow text-white/60">Total</p><strong className="mt-2 block text-3xl">{money.format(totalWithAdjustments)}</strong></div>
                  <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="eyebrow">Pagado</p><strong className="mt-2 block text-3xl">{money.format(paidAmount)}</strong></div>
                  <div className="rounded-2xl border-2 border-marigold bg-white p-5 shadow-sm"><p className="eyebrow">Pendiente</p><strong className="mt-2 block text-3xl">{money.format(due)}</strong></div>
                </section>
                <section className="rounded-2xl bg-white p-4 shadow-sm">
                  <h3 className="font-bold">Consumo</h3>
                  <div className="mt-3 divide-y divide-denim/10">
                    {selected.items.map((item, index) => (
                      <div className="flex justify-between gap-3 py-3 text-sm" key={`${item.id}-${index}`}><span>{item.quantity} × {item.name}</span><strong>{money.format(item.price * item.quantity)}</strong></div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2 border-t border-denim/10 pt-3 text-sm">
                    <div className="flex justify-between gap-3"><span>Consumo</span><strong>{money.format(selected.total)}</strong></div>
                    <div className="flex justify-between gap-3"><span>Descuento autorizado</span><strong>− {money.format(Number(discount || 0))}</strong></div>
                    <div className="flex justify-between gap-3"><span>Propina</span><strong>+ {money.format(Number(tip || 0))}</strong></div>
                    <div className="flex justify-between gap-3 border-t border-denim/10 pt-2 text-base"><strong>Total a cobrar</strong><strong>{money.format(totalWithAdjustments)}</strong></div>
                  </div>
                </section>

                {people > 1 && (
                  <section className="rounded-2xl bg-white p-4 shadow-sm">
                    <h3 className="font-bold">División de cuenta · {people} personas</h3>
                    <p className="mt-1 text-sm text-denim/55">Vista demostrativa de partes iguales. En producción cada parte conserva saldo independiente.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: people }, (_, index) => (
                        <div className="rounded-xl border border-denim/10 p-3" key={index}>
                          <strong>Persona {index + 1}</strong>
                          <span className="mt-1 block text-sm">{money.format(splitAmount)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {selectedPayments.length > 0 && (
                  <section className="rounded-2xl bg-white p-4 shadow-sm">
                    <h3 className="font-bold">Pagos independientes</h3>
                    <div className="mt-3 space-y-2">
                      {selectedPayments.map((item) => (
                        <div className="rounded-xl border border-denim/10 p-3" key={item.id}>
                          <div className="flex items-center justify-between gap-3">
                            <span>{item.method}{item.reference ? ` · ${item.reference}` : ""}</span>
                            <strong>{money.format(item.amount)}</strong>
                          </div>
                          {item.method === "EFECTIVO" && item.received !== undefined && (
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-denim/60">
                              <span>Recibido <strong className="text-denim">{money.format(item.received)}</strong></span>
                              <span className="text-right">Cambio <strong className="text-denim">{money.format(item.change ?? 0)}</strong></span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <aside className="space-y-4">
                <section className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2"><UserRound size={18} /><h3 className="font-bold">Ajustes de la venta</h3></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <label>Cliente<input className="input" value={customer} disabled={paidAmount > 0} onChange={(event) => setCustomer(event.target.value)} placeholder="Consumidor final o nombre" /></label>
                    <label>Descuento autorizado<input className="input" type="number" min="0" max={selected.total} value={discount} disabled={paidAmount > 0} onChange={(event) => { setDiscount(event.target.value); const nextDue = Math.max(0, selected.total - Number(event.target.value || 0) + Number(tip || 0) - paidAmount); setAmount(String(nextDue)); if (method === "EFECTIVO") setReceived(String(nextDue)); }} /></label>
                    <label>Propina (se suma al total)<input className="input" type="number" min="0" value={tip} disabled={paidAmount > 0} onChange={(event) => { setTip(event.target.value); const nextDue = Math.max(0, selected.total - Number(discount || 0) + Number(event.target.value || 0) - paidAmount); setAmount(String(nextDue)); if (method === "EFECTIVO") setReceived(String(nextDue)); }} /></label>
                    <label>Dividir cuenta<select className="input" value={splitCount} disabled={paidAmount > 0} onChange={(event) => setSplitCount(event.target.value)}><option value="1">Sin división</option><option value="2">2 personas</option><option value="3">3 personas</option><option value="4">4 personas</option><option value="5">5 personas</option><option value="6">6 personas</option></select></label>
                  </div>
                </section>

                {due > 0 && (
                  <section className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-denim/10">
                    <h3 className="text-xl font-bold">Registrar pago</h3>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {[
                        ["EFECTIVO", Banknote],
                        ["TARJETA", CreditCard],
                        ["TRANSFERENCIA", Landmark],
                        ["OTRO", WalletCards],
                      ].map(([value, Icon]) => (
                        <button key={String(value)} className={`rounded-xl border-2 p-3 text-left ${method === value ? "border-marigold bg-amber-50" : "border-denim/10"}`} onClick={() => { setMethod(String(value)); setReference(""); if (value === "EFECTIVO") setReceived(amount); }}><Icon size={22} /><strong className="mt-2 block">{String(value).charAt(0) + String(value).slice(1).toLowerCase()}</strong></button>
                      ))}
                    </div>
                    <label className="mt-3 block">Monto aplicado<input className="input text-lg font-bold" type="number" min="0.01" max={due} step="0.01" value={amount} onChange={(event) => { const next = clampPaymentAmount(event.target.value, due); setAmount(next); if (method === "EFECTIVO" && Number(received || 0) < Number(next || 0)) setReceived(next); }} /><span className="text-xs text-denim/50">Máximo aplicable: {money.format(due)}</span></label>
                    {method === "EFECTIVO" ? (
                      <div className="mt-3 grid grid-cols-2 gap-3"><label>Efectivo recibido<input className="input" type="number" min={amount || "0"} value={received} onChange={(event) => setReceived(event.target.value)} /></label><div className="rounded-xl bg-screen/40 p-3"><p className="eyebrow">Cambio</p><strong className="mt-1 block text-2xl">{money.format(change)}</strong></div></div>
                    ) : (
                      <label className="mt-3 block">Referencia / autorización<input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Voucher, transferencia, QR…" /></label>
                    )}
                    <button className="primary mt-4" onClick={addPayment}><Receipt size={18} /> Registrar pago</button>
                  </section>
                )}

                <section className="rounded-2xl bg-white p-4 text-sm shadow-sm">
                  <div className="flex items-center gap-2"><FileText size={18} /><strong>Documentos</strong></div>
                  <p className="mt-2 text-denim/55">Pago, comprobante, factura interna y documento electrónico son acciones separadas.</p>
                  <div className="mt-3 grid gap-2">
                    <button className="secondary" onClick={createReceipt}><Receipt size={17} /> {selectedDocuments.receipt ? "Comprobante generado" : "Generar comprobante"}</button>
                    <button className="secondary" disabled={due > 0} onClick={createInvoice}><FileText size={17} /> {selectedDocuments.invoice ? "Factura interna creada" : "Crear factura interna"}</button>
                    <button className="secondary" disabled={!selectedDocuments.invoice} onClick={prepareElectronic}><FileText size={17} /> {selectedDocuments.electronicPrepared ? "Electrónico preparado (demo)" : "Preparar documento electrónico"}</button>
                    {(selectedDocuments.receipt || selectedDocuments.invoice) && (
                      <button className="secondary" onClick={printDocument}><Printer size={17} /> {selectedDocuments.printCount > 0 ? "Reimprimir con autorización" : "Imprimir"}</button>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-denim/50">La preparación electrónica del demo no envía información a DIAN ni representa integración fiscal certificada.</p>
                </section>
              </aside>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
