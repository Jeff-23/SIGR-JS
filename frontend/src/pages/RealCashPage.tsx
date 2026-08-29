import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Printer, X } from "lucide-react";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import { money } from "../data/demo";
import {
  balance,
  refundable,
  type CashDrawer,
  type PaymentMethod,
  type Sale,
} from "../features/cash/contracts";
import type { ApiOrder } from "../features/salon/contracts";
import { confirmedPost } from "../lib/confirmed-operation";
import { FinancialRecovery } from "../components/FinancialRecovery";
import { SaleForm } from "../features/cash/SaleForm";

export function RealCashPage() {
  const { branchId, session, hasPermission } = useApp();
  const attemptKey = `sigr-payment:${api.defaults.baseURL}:${session?.user.restauranteId}:${session?.user.id}:${branchId}`;
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [history, setHistory] = useState<CashDrawer[]>([]);
  const [selectedDrawer, setSelectedDrawer] = useState<CashDrawer | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [payment, setPayment] = useState({
    monto: "",
    metodoPagoId: "",
    cajaId: "",
    referencia: "",
  });
  const paymentAttempt = useRef<{
    id: string;
    saleId: number;
    body: object;
  } | null>(null);
  const restored = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [opening, setOpening] = useState({
    nombre: "Caja principal",
    saldoInicial: "0",
  });
  const [movement, setMovement] = useState({
    tipo: "INGRESO",
    monto: "",
    concepto: "",
  });
  const [counted, setCounted] = useState("");
  const [observation, setObservation] = useState("");
  const [showOpen, setShowOpen] = useState(false);
  const [saleMode, setSaleMode] = useState<"directa" | "manual" | null>(null);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      const params = { sucursalId: branchId };
      const [cash, salesResponse, ordersResponse, methodResponse, historic] =
        await Promise.all([
          api.get<CashDrawer[]>("/cajas/abiertas", { params }),
          hasPermission("VENTAS_VER")
            ? api.get<Sale[]>("/ventas", { params })
            : Promise.resolve({ data: [] as Sale[] }),
          hasPermission("PEDIDOS_VER")
            ? api.get<ApiOrder[]>("/pedidos", { params })
            : Promise.resolve({ data: [] as ApiOrder[] }),
          hasPermission("METODOS_PAGO_VER")
            ? api.get<PaymentMethod[]>("/metodos-pago")
            : Promise.resolve({ data: [] as PaymentMethod[] }),
          api.get<CashDrawer[]>("/cajas/historial", { params }),
        ]);
      if (!mounted.current) return;
      setDrawers(cash.data);
      setSales(salesResponse.data);
      setOrders(ordersResponse.data);
      setMethods(methodResponse.data.filter((method) => method.activo));
      setHistory(historic.data);
      setFailure("");
      if (!restored.current) {
        const saved = sessionStorage.getItem(attemptKey);
        if (saved) {
          const attempt = JSON.parse(saved) as {
            id: string;
            saleId: number;
            body: typeof payment;
          };
          const sale = (await api.get<Sale>(`/ventas/${attempt.saleId}`)).data;
          if (!mounted.current) return;
          paymentAttempt.current = attempt;
          setSelectedSale(sale);
          setPayment(attempt.body);
          setUncertain(true);
        }
        restored.current = true;
      }
    } catch (error) {
      if (mounted.current) setFailure(errorMessage(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [branchId, hasPermission, attemptKey]);
  useEffect(() => {
    mounted.current = true;
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      mounted.current = false;
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function drawerDetail(id: number) {
    const { data } = await api.get<CashDrawer>(`/cajas/${id}`);
    if (mounted.current) {
      setSelectedDrawer(data);
      setCounted("");
    }
  }
  function chooseSale(sale: Sale) {
    if (uncertain)
      return toast.error(
        "Primero reconcilia el cobro pendiente de confirmación",
      );
    paymentAttempt.current = null;
    setSelectedSale(sale);
    setPayment({
      monto: String(balance(sale)),
      metodoPagoId: methods[0] ? String(methods[0].id) : "",
      cajaId: drawers[0] ? String(drawers[0].id) : "",
      referencia: "",
    });
  }
  async function pay() {
    if (!selectedSale) return;
    if (!paymentAttempt.current) {
      const monto = Number(payment.monto);
      if (
        !(monto > 0) ||
        monto > balance(selectedSale) ||
        !payment.cajaId ||
        !payment.metodoPagoId
      )
        return toast.error("Revisa monto, método y caja abierta");
      paymentAttempt.current = {
        id: crypto.randomUUID(),
        saleId: selectedSale.id,
        body: {
          monto,
          cajaId: Number(payment.cajaId),
          metodoPagoId: Number(payment.metodoPagoId),
          referencia: payment.referencia.trim() || undefined,
        },
      };
    }
    const attempt = paymentAttempt.current;
    try {
      sessionStorage.setItem(attemptKey, JSON.stringify(attempt));
      await api.post(`/ventas/${attempt.saleId}/pagos`, attempt.body, {
        headers: { "Idempotency-Key": attempt.id },
      });
      sessionStorage.removeItem(attemptKey);
      paymentAttempt.current = null;
      setUncertain(false);
      setSelectedSale(null);
      toast.success("Pago confirmado por el servidor");
    } catch (error) {
      // Keep the exact operation/key even when the server committed but its response was lost.
      if (
        !uncertain &&
        isAxiosError(error) &&
        error.response &&
        error.response.status >= 400 &&
        error.response.status < 500
      ) {
        sessionStorage.removeItem(attemptKey);
        paymentAttempt.current = null;
        setUncertain(false);
      } else setUncertain(true);
      throw error;
    }
  }
  const pendingSales = sales.filter(
    (sale) => sale.estado !== "ANULADA" && balance(sale) > 0,
  );
  return (
    <div className="space-y-6">
      <header className="section-title">
        <div>
          <p className="eyebrow">Operación real · sede seleccionada</p>
          <h1 className="page-title">Ventas y caja</h1>
          <p className="mt-2 text-sm">
            Un cobro no emite factura ni se envía a DIAN.
          </p>
        </div>
        <button className="secondary w-auto" onClick={() => void load()}>
          <RefreshCw size={18} />
          Actualizar
        </button>
      </header>
      <FinancialRecovery
        scope={attemptKey}
        onRecovered={async () => {
          setSelectedDrawer(null);
          setShowOpen(false);
          await load();
        }}
      />
      {hasPermission("VENTAS_CREAR") && hasPermission("PRODUCTOS_VER") && (
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy || Boolean(failure)}
            className="secondary w-auto"
            onClick={() => setSaleMode("directa")}
          >
            Venta directa
          </button>
          {hasPermission("VENTAS_REGISTRAR_MANUAL") && (
            <button
              disabled={busy || Boolean(failure)}
              className="secondary w-auto"
              onClick={() => setSaleMode("manual")}
            >
              Digitar venta en papel
            </button>
          )}
        </div>
      )}
      {saleMode && (
        <SaleForm
          mode={saleMode}
          scope={attemptKey}
          onClose={() => setSaleMode(null)}
          onSaved={async () => {
            setSaleMode(null);
            await load();
            toast.success("Venta registrada sin cobrar ni facturar");
          }}
        />
      )}
      {failure && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          No se puede confirmar el estado actual: {failure}. Las acciones están
          bloqueadas hasta recuperar conexión.
        </div>
      )}
      {loading && <p role="status">Consultando cajas y ventas…</p>}
      <fieldset
        disabled={busy || Boolean(failure) || loading}
        className="space-y-6 disabled:opacity-60"
      >
        <section className="card">
          <div className="flex justify-between">
            <h2 className="text-xl font-bold">Cajas abiertas</h2>
            {hasPermission("CAJA_ABRIR") && (
              <button
                className="secondary w-auto"
                onClick={() => setShowOpen(!showOpen)}
              >
                Abrir caja
              </button>
            )}
          </div>
          {showOpen && (
            <form
              className="mt-4 grid gap-3 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await confirmedPost(attemptKey, "/cajas/abrir", {
                    sucursalId: branchId,
                    nombre: opening.nombre,
                    saldoInicial: Number(opening.saldoInicial),
                  });
                  setShowOpen(false);
                  toast.success("Caja abierta");
                });
              }}
            >
              <label>
                Nombre
                <input
                  className="input"
                  required
                  maxLength={80}
                  value={opening.nombre}
                  onChange={(event) =>
                    setOpening({ ...opening, nombre: event.target.value })
                  }
                />
              </label>
              <label>
                Base de apertura
                <input
                  className="input"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={opening.saldoInicial}
                  onChange={(event) =>
                    setOpening({ ...opening, saldoInicial: event.target.value })
                  }
                />
              </label>
              <button className="primary self-end">Confirmar apertura</button>
            </form>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            {drawers.map((drawer) => (
              <button
                className="secondary w-auto"
                key={drawer.id}
                onClick={() => void run(() => drawerDetail(drawer.id))}
              >
                {drawer.nombre} · Base{" "}
                {money.format(Number(drawer.saldoInicial))}
              </button>
            ))}
            {!loading && drawers.length === 0 && (
              <p>No hay caja abierta. Abre una antes de registrar pagos.</p>
            )}
          </div>
        </section>
        <section className="card">
          <h2 className="text-xl font-bold">Pedidos entregados sin venta</h2>
          <p className="text-sm text-denim/60">
            Crear la venta conserva precios del pedido; todavía no registra el
            pago.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {orders
              .filter((order) => order.estado === "ENTREGADO" && !order.venta)
              .map((order) => (
                <button
                  key={order.id}
                  className="secondary w-auto"
                  disabled={!hasPermission("VENTAS_CREAR")}
                  onClick={() =>
                    void run(async () => {
                      await api.post(
                        "/ventas/pedido",
                        { pedidoId: order.id },
                        {
                          headers: {
                            "Idempotency-Key": `venta-pedido-${order.id}`,
                          },
                        },
                      );
                      toast.success("Venta creada");
                    })
                  }
                >
                  Crear venta ·{" "}
                  {order.mesa ? `Mesa ${order.mesa.numero}` : order.tipo} · #
                  {order.id}
                </button>
              ))}
          </div>
        </section>
        <section>
          <h2 className="text-xl font-bold">
            Por cobrar · {pendingSales.length}
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {pendingSales.map((sale) => (
              <article className="card" key={sale.id}>
                <h3 className="font-bold">
                  Venta #{sale.id}
                  {sale.pedido?.mesa
                    ? ` · Mesa ${sale.pedido.mesa.numero}`
                    : ""}
                </h3>
                <p>
                  Total {money.format(Number(sale.total))} · Saldo{" "}
                  <strong>{money.format(balance(sale))}</strong>
                </p>
                <div className="mt-3 flex gap-2">
                  {hasPermission("PAGOS_REGISTRAR") && (
                    <button
                      className="primary"
                      disabled={!drawers.length || uncertain}
                      onClick={() => chooseSale(sale)}
                    >
                      Cobrar / pago parcial
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() => chooseSale(sale)}
                  >
                    Detalle
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!loading && !pendingSales.length && (
            <p className="mt-3">
              Sin saldos pendientes en las últimas 200 ventas consultadas.
            </p>
          )}
        </section>
        <section className="card">
          <h2 className="text-xl font-bold">Ventas recientes</h2>
          <div className="mt-3 divide-y">
            {sales.slice(0, 30).map((sale) => (
              <button
                key={sale.id}
                className="flex w-full justify-between py-3 text-left"
                onClick={() => chooseSale(sale)}
              >
                <span>
                  #{sale.id} · {sale.estado}
                </span>
                <strong>{money.format(Number(sale.total))}</strong>
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <h2 className="text-xl font-bold">Historial de cajas</h2>
          {history.map((drawer) => (
            <button
              className="mt-3 block text-left underline"
              key={drawer.id}
              onClick={() => void run(() => drawerDetail(drawer.id))}
            >
              {drawer.nombre} · {drawer.estado} ·{" "}
              {new Date(drawer.fechaApertura).toLocaleString("es-CO")}
            </button>
          ))}
        </section>
      </fieldset>
      {selectedDrawer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de caja"
            className="card mx-auto max-w-2xl space-y-4"
          >
            <button
              className="secondary ml-auto w-auto"
              aria-label="Cerrar detalle"
              disabled={busy}
              onClick={() => setSelectedDrawer(null)}
            >
              <X />
            </button>
            <h2 className="page-title">{selectedDrawer.nombre}</h2>
            <p>
              {selectedDrawer.estado} · Efectivo esperado{" "}
              {money.format(Number(selectedDrawer.resumen?.saldoEsperado ?? 0))}
            </p>
            <p>
              Otros medios{" "}
              {money.format(
                Number(selectedDrawer.resumen?.totalOtrosPagos ?? 0),
              )}
            </p>
            {selectedDrawer.movimientos?.map((item) => (
              <p key={item.id}>
                {item.tipo} · {item.concepto} ·{" "}
                {money.format(Number(item.monto))}
              </p>
            ))}
            {selectedDrawer.estado === "ABIERTA" && (
              <fieldset
                disabled={busy || Boolean(failure)}
                className="space-y-5"
              >
                {hasPermission("CAJA_MOVIMIENTOS") && (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await confirmedPost(
                          attemptKey,
                          `/cajas/${selectedDrawer.id}/movimientos`,
                          { ...movement, monto: Number(movement.monto) },
                        );
                        setMovement({
                          tipo: "INGRESO",
                          monto: "",
                          concepto: "",
                        });
                        await drawerDetail(selectedDrawer.id);
                        toast.success("Movimiento registrado");
                      });
                    }}
                  >
                    <h3 className="font-bold">
                      Movimiento manual (no es un pago)
                    </h3>
                    <label>
                      Tipo
                      <select
                        className="input"
                        value={movement.tipo}
                        onChange={(event) =>
                          setMovement({ ...movement, tipo: event.target.value })
                        }
                      >
                        <option>INGRESO</option>
                        <option>EGRESO</option>
                      </select>
                    </label>
                    <label>
                      Importe
                      <input
                        className="input"
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={movement.monto}
                        onChange={(event) =>
                          setMovement({
                            ...movement,
                            monto: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Concepto
                      <input
                        className="input"
                        required
                        maxLength={120}
                        value={movement.concepto}
                        onChange={(event) =>
                          setMovement({
                            ...movement,
                            concepto: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button className="secondary">Registrar movimiento</button>
                  </form>
                )}
                {hasPermission("CAJA_CERRAR") && (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (
                        !window.confirm(
                          "¿Cerrar esta caja con el efectivo contado indicado?",
                        )
                      )
                        return;
                      void run(async () => {
                        await confirmedPost(
                          attemptKey,
                          `/cajas/${selectedDrawer.id}/cerrar`,
                          {
                            saldoContado: Number(counted),
                            observacion: observation || undefined,
                          },
                        );
                        setSelectedDrawer(null);
                        toast.success("Caja cerrada");
                      });
                    }}
                  >
                    <h3 className="font-bold">Arqueo y cierre</h3>
                    <label>
                      Efectivo contado
                      <input
                        className="input"
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={counted}
                        onChange={(event) => setCounted(event.target.value)}
                      />
                    </label>
                    <label>
                      Observación
                      <input
                        className="input"
                        maxLength={250}
                        value={observation}
                        onChange={(event) => setObservation(event.target.value)}
                      />
                    </label>
                    <button className="primary">Cerrar caja</button>
                  </form>
                )}
              </fieldset>
            )}
          </section>
        </div>
      )}
      {selectedSale && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 print:bg-white print:p-0">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Venta y cobro"
            className="card mx-auto max-w-2xl space-y-4 print:shadow-none"
          >
            <button
              className="secondary ml-auto w-auto print:hidden"
              aria-label="Cerrar venta"
              disabled={busy || uncertain}
              onClick={() => setSelectedSale(null)}
            >
              <X />
            </button>
            <div className="cash-receipt">
              <p className="eyebrow">
                Comprobante de operación · No es factura electrónica
              </p>
              <h2 className="page-title">Venta #{selectedSale.id}</h2>
              <p>
                {new Date(selectedSale.fechaOperacion).toLocaleString("es-CO")}
              </p>
              {selectedSale.detalles.map((detail) => (
                <p key={detail.id}>
                  {detail.cantidad} ×{" "}
                  {detail.producto?.nombre ?? `Producto ${detail.id}`} ·{" "}
                  {money.format(Number(detail.subtotal))}
                </p>
              ))}
              <p className="mt-4 font-bold">
                Total {money.format(Number(selectedSale.total))} · Saldo{" "}
                {money.format(balance(selectedSale))}
              </p>
              {selectedSale.pagos.map((item) => (
                <div key={item.id} className="rounded-xl border p-3">
                  <p>
                    Pago #{item.id}: {item.metodoPago.nombre} ·{" "}
                    {money.format(Number(item.monto))}
                  </p>
                  {(item.devoluciones ?? []).map((refund) => (
                    <p key={refund.id} className="text-sm text-amber-800">
                      Devolución #{refund.id}: −{money.format(Number(refund.monto))} · {refund.motivo}
                    </p>
                  ))}
                  {hasPermission("PAGOS_REGISTRAR") && refundable(item) > 0 && (
                    <button
                      className="secondary mt-2 print:hidden"
                      disabled={busy || uncertain}
                      onClick={() => {
                        const amount = window.prompt(
                          `Monto a devolver (máximo ${money.format(refundable(item))})`,
                          String(refundable(item)),
                        );
                        if (amount === null) return;
                        const reason = window.prompt("Motivo obligatorio de la devolución");
                        if (!reason?.trim()) return;
                        void run(async () => {
                          await api.post(
                            `/ventas/${selectedSale.id}/pagos/${item.id}/devoluciones`,
                            { monto: Number(amount), motivo: reason.trim() },
                            { headers: { "Idempotency-Key": crypto.randomUUID() } },
                          );
                          const detail = await api.get<Sale>(`/ventas/${selectedSale.id}`);
                          setSelectedSale(detail.data);
                          toast.success("Devolución registrada sin alterar el pago original");
                        });
                      }}
                    >
                      Registrar devolución
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="secondary print:hidden"
              onClick={() => window.print()}
            >
              <Printer size={18} />
              Imprimir comprobante
            </button>
            {(uncertain || balance(selectedSale) > 0) &&
              selectedSale.estado !== "ANULADA" &&
              hasPermission("PAGOS_REGISTRAR") && (
                <form
                  className="space-y-3 print:hidden"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(pay);
                  }}
                >
                  <fieldset
                    disabled={busy || uncertain}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <label>
                      Monto a cobrar
                      <input
                        className="input"
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        max={balance(selectedSale)}
                        value={payment.monto}
                        onChange={(event) =>
                          setPayment({ ...payment, monto: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Método
                      <select
                        required
                        className="input"
                        value={payment.metodoPagoId}
                        onChange={(event) =>
                          setPayment({
                            ...payment,
                            metodoPagoId: event.target.value,
                          })
                        }
                      >
                        <option value="">Selecciona</option>
                        {methods.map((method) => (
                          <option key={method.id} value={method.id}>
                            {method.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Caja
                      <select
                        required
                        className="input"
                        value={payment.cajaId}
                        onChange={(event) =>
                          setPayment({ ...payment, cajaId: event.target.value })
                        }
                      >
                        <option value="">Selecciona</option>
                        {drawers.map((drawer) => (
                          <option key={drawer.id} value={drawer.id}>
                            {drawer.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Referencia
                      <input
                        className="input"
                        maxLength={100}
                        value={payment.referencia}
                        onChange={(event) =>
                          setPayment({
                            ...payment,
                            referencia: event.target.value,
                          })
                        }
                      />
                    </label>
                  </fieldset>
                  {uncertain && (
                    <p role="alert" className="rounded-xl bg-amber-50 p-3">
                      No se confirmó el resultado. Reintenta exactamente el
                      mismo cobro; su clave evita duplicarlo. No vuelvas a
                      cobrar al cliente.
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={busy || Boolean(failure)}
                  >
                    {uncertain
                      ? "Consultar / reintentar mismo cobro"
                      : "Confirmar cobro"}
                  </button>
                </form>
              )}
            {hasPermission("VENTAS_ANULAR") &&
              selectedSale.estado !== "ANULADA" &&
              selectedSale.pagos.length > 0 &&
              selectedSale.pagos.every((item) => refundable(item) === 0) && (
                <button
                  className="secondary print:hidden"
                  disabled={busy || uncertain}
                  onClick={() => {
                    const reason = window.prompt(
                      "Motivo de la reversión comercial (los pagos deben estar totalmente devueltos)",
                    );
                    if (!reason?.trim()) return;
                    void run(async () => {
                      await api.post(
                        `/ventas/${selectedSale.id}/reversar`,
                        { motivo: reason.trim() },
                        { headers: { "Idempotency-Key": crypto.randomUUID() } },
                      );
                      setSelectedSale(null);
                      toast.success("Venta revertida con trazabilidad append-only");
                    });
                  }}
                >
                  Reversar venta después de devoluciones
                </button>
              )}
            {hasPermission("VENTAS_ANULAR") &&
              selectedSale.estado !== "ANULADA" &&
              selectedSale.pagos.length === 0 && (
                <button
                  className="secondary print:hidden"
                  disabled={busy || uncertain}
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Anular esta venta sin pagos? No es una devolución de dinero.",
                      )
                    )
                      void run(async () => {
                        await api.patch(`/ventas/${selectedSale.id}/anular`);
                        setSelectedSale(null);
                        toast.success("Venta anulada");
                      });
                  }}
                >
                  Anular venta sin pagos
                </button>
              )}
          </section>
        </div>
      )}
    </div>
  );
}
