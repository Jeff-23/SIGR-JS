import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import { money } from "../data/demo";
import {
  balance,
  divisionBalance,
  type CashDrawer,
  type PaymentMethod,
  type Sale,
} from "../features/cash/contracts";
import type { ApiOrder } from "../features/salon/contracts";
import { confirmedPost } from "../lib/confirmed-operation";
import { FinancialRecovery } from "../components/FinancialRecovery";
import { SaleForm } from "../features/cash/SaleForm";
import {
  ProfessionalSaleCheckout,
  type PaymentDraft,
} from "../features/cash/ProfessionalSaleCheckout";

export function RealCashPage() {
  const { branchId, session, hasPermission, hasCapability } = useApp();
  const attemptKey = `sigr-payment:${api.defaults.baseURL}:${session?.user.restauranteId}:${session?.user.id}:${branchId}`;
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [history, setHistory] = useState<CashDrawer[]>([]);
  const [selectedDrawer, setSelectedDrawer] = useState<CashDrawer | null>(null);
  const [turnClose, setTurnClose] = useState<{
    modoFlexible: boolean;
    generadoEn: string | null;
    excelDescargadoEn: string | null;
    operaciones: number;
    listoParaCerrar: boolean;
  } | null>(null);
  const [turnExclusions, setTurnExclusions] = useState<
    Array<{
      ventaId: number;
      facturaId: number;
      numero: string;
      total: number;
      fechaOperacion: string;
    }>
  >([]);
  const [selectedExclusionIds, setSelectedExclusionIds] = useState<number[]>([]);
  const [exclusionReason, setExclusionReason] = useState("");
  const [exclusionPassword, setExclusionPassword] = useState("");
  const [fiscalUniverse, setFiscalUniverse] = useState<{
    habilitado: boolean;
    resumen: {
      operaciones: number;
      excluidas: number;
      yaFiscalizadas: number;
      enProceso: number;
      elegibles: number;
      sinComprobante: number;
    };
    yaFiscalizadas: Array<{
      facturaId: number;
      numeroInterno: string;
      total: number;
      estadoDocumento: string;
      numeroFiscal: string | null;
    }>;
    enProceso: Array<{
      facturaId: number;
      numeroInterno: string;
      total: number;
      estadoDocumento: string;
      numeroFiscal: string | null;
    }>;
    elegibles: Array<{
      facturaId: number;
      numeroInterno: string;
      total: number;
    }>;
  } | null>(null);
  const [selectedFiscalIds, setSelectedFiscalIds] = useState<number[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [payment, setPayment] = useState<PaymentDraft>({
    monto: "",
    metodoPagoId: "",
    cajaId: "",
    referencia: "",
    divisionCuentaId: "",
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
  const [saleSearch, setSaleSearch] = useState("");
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
  async function loadTurnExclusions(id: number) {
    if (!hasPermission("DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE")) {
      if (mounted.current) setTurnExclusions([]);
      return;
    }
    const { data } = await api.get<{
      habilitado: boolean;
      candidatos: Array<{
        ventaId: number;
        facturaId: number;
        numero: string;
        total: number;
        fechaOperacion: string;
      }>;
    }>(`/cajas/${id}/cierre-turno/exclusiones`);
    if (mounted.current) {
      setTurnExclusions(data.habilitado ? data.candidatos : []);
      setSelectedExclusionIds((current) =>
        current.filter((ventaId) =>
          data.candidatos.some((item) => item.ventaId === ventaId),
        ),
      );
    }
  }

  async function loadFiscalUniverse(id: number) {
    if (!hasPermission("CAJA_CERRAR") || !hasPermission("FACTURAS_EMITIR")) {
      if (mounted.current) {
        setFiscalUniverse(null);
        setSelectedFiscalIds([]);
      }
      return;
    }
    const { data } = await api.get(`/cajas/${id}/cierre-turno/fiscalizacion`);
    if (mounted.current) {
      setFiscalUniverse(data);
      setSelectedFiscalIds((current) =>
        current.filter((facturaId) =>
          data.elegibles.some(
            (item: { facturaId: number }) => item.facturaId === facturaId,
          ),
        ),
      );
    }
  }

  async function drawerDetail(id: number) {
    const [{ data }, closeState] = await Promise.all([
      api.get<CashDrawer>(`/cajas/${id}`),
      hasPermission("CAJA_CERRAR")
        ? api.get(`/cajas/${id}/cierre-turno/estado`)
        : Promise.resolve({ data: null }),
    ]);
    if (mounted.current) {
      setSelectedDrawer(data);
      setTurnClose(closeState.data);
      setCounted("");
      setExclusionReason("");
      setExclusionPassword("");
      setSelectedExclusionIds([]);
      setSelectedFiscalIds([]);
      setFiscalUniverse(null);
    }
    if (closeState.data?.excelDescargadoEn) {
      await Promise.all([loadTurnExclusions(id), loadFiscalUniverse(id)]);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function prepareTurnClose() {
    if (!selectedDrawer) return;
    await run(async () => {
      await api.post(`/cajas/${selectedDrawer.id}/cierre-turno/preparar`);
      const excel = await api.get(
        `/cajas/${selectedDrawer.id}/cierre-turno/excel`,
        { responseType: "blob" },
      );
      downloadBlob(
        excel.data as Blob,
        `cierre-turno-${selectedDrawer.id}-previo.xlsx`,
      );
      const pdf = await api.get(
        `/cajas/${selectedDrawer.id}/cierre-turno/pdf`,
        {
          responseType: "blob",
        },
      );
      downloadBlob(
        pdf.data as Blob,
        `cierre-turno-${selectedDrawer.id}-previo.pdf`,
      );
      const { data: closeState } = await api.get(
        `/cajas/${selectedDrawer.id}/cierre-turno/estado`,
      );
      if (mounted.current) setTurnClose(closeState);
      await Promise.all([
        loadTurnExclusions(selectedDrawer.id),
        loadFiscalUniverse(selectedDrawer.id),
      ]);
      toast.success("Excel obligatorio y PDF previo descargados");
    });
  }
  async function processTurnExclusions() {
    if (!selectedDrawer || selectedExclusionIds.length === 0) return;
    if (!exclusionReason.trim()) {
      toast.error("Indica el motivo de la exclusión");
      return;
    }
    if (!exclusionPassword) {
      toast.error("Confirma con tu contraseña");
      return;
    }
    if (
      !window.confirm(
        `¿Excluir ${selectedExclusionIds.length} comprobante(s) interno(s) del cierre fiscal?`,
      )
    )
      return;
    await run(async () => {
      await api.post(`/cajas/${selectedDrawer.id}/cierre-turno/exclusiones`, {
        ventaIds: selectedExclusionIds,
        motivo: exclusionReason.trim(),
        password: exclusionPassword,
      });
      setSelectedExclusionIds([]);
      setExclusionReason("");
      setExclusionPassword("");
      await Promise.all([
        loadTurnExclusions(selectedDrawer.id),
        loadFiscalUniverse(selectedDrawer.id),
      ]);
      toast.success("Comprobantes internos excluidos del cierre fiscal");
    });
  }

  async function prepareFiscalSelection() {
    if (!selectedDrawer || selectedFiscalIds.length === 0) return;
    if (
      !window.confirm(
        `¿Preparar ${selectedFiscalIds.length} comprobante(s) para facturación electrónica? Esto todavía no asigna consecutivo ni transmite a DIAN.`,
      )
    )
      return;
    await run(async () => {
      await api.post(
        `/cajas/${selectedDrawer.id}/cierre-turno/fiscalizacion/preparar`,
        { facturaIds: selectedFiscalIds },
      );
      setSelectedFiscalIds([]);
      await loadFiscalUniverse(selectedDrawer.id);
      await loadTurnExclusions(selectedDrawer.id);
      toast.success("Documentos preparados para el flujo fiscal");
    });
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
      divisionCuentaId: sale.divisionesCuenta?.[0]
        ? String(sale.divisionesCuenta[0].id)
        : "",
    });
  }
  async function pay() {
    if (!selectedSale) return;
    if (!paymentAttempt.current) {
      const monto = Number(payment.monto);
      const selectedDivision = selectedSale.divisionesCuenta?.find(
        (item) => item.id === Number(payment.divisionCuentaId),
      );
      const maximum = selectedDivision
        ? divisionBalance(selectedDivision)
        : balance(selectedSale);
      if (
        !(monto > 0) ||
        monto > maximum ||
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
          divisionCuentaId: payment.divisionCuentaId
            ? Number(payment.divisionCuentaId)
            : undefined,
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
      const { data: updatedSale } = await api.get<Sale>(
        `/ventas/${attempt.saleId}`,
      );
      setSelectedSale(updatedSale);
      const nextDivision = updatedSale.divisionesCuenta?.find(
        (item) => item.id === Number(payment.divisionCuentaId),
      );
      setPayment((current) => ({
        ...current,
        monto: String(
          nextDivision ? divisionBalance(nextDivision) : balance(updatedSale),
        ),
        referencia: "",
      }));
      toast.success(
        balance(updatedSale) > 0
          ? "Pago registrado. Puedes agregar otro medio."
          : "Venta pagada completamente.",
      );
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
  const normalizedSaleSearch = saleSearch.trim().toLocaleLowerCase("es-CO");
  const visiblePendingSales = normalizedSaleSearch
    ? pendingSales.filter((sale) => {
        const customer =
          sale.cliente?.razonSocial || sale.cliente?.nombres || "";
        return [
          String(sale.id),
          sale.pedido?.mesa?.numero ?? "",
          sale.pedido?.id ? String(sale.pedido.id) : "",
          customer,
        ].some((value) =>
          String(value)
            .toLocaleLowerCase("es-CO")
            .includes(normalizedSaleSearch),
        );
      })
    : pendingSales;
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">
                Por cobrar · {pendingSales.length}
              </h2>
              <p className="text-sm text-denim/55">
                Busca por venta, pedido, mesa o cliente y entra directo al
                cobro.
              </p>
            </div>
            <label className="w-full sm:w-80">
              Buscar venta pendiente
              <input
                className="input"
                value={saleSearch}
                onChange={(event) => setSaleSearch(event.target.value)}
                placeholder="Ej. mesa 12, venta 1050, cliente…"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {visiblePendingSales.map((sale) => (
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
          {!loading &&
            pendingSales.length > 0 &&
            visiblePendingSales.length === 0 && (
              <p className="mt-3">
                No hay ventas pendientes que coincidan con la búsqueda.
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
                    {turnClose?.modoFlexible && (
                      <div className="rounded-2xl border border-denim/15 bg-white/60 p-4 text-sm">
                        <p className="font-bold">Cierre previo del turno</p>
                        <p className="mt-1 text-denim/60">
                          El Excel previo es obligatorio. El PDF se genera y
                          descarga junto con él.
                        </p>
                        <p className="mt-2">
                          Operaciones congeladas: <b>{turnClose.operaciones}</b>
                        </p>
                        <p>
                          Excel:{" "}
                          {turnClose.excelDescargadoEn
                            ? "descargado"
                            : "pendiente"}
                        </p>
                        <button
                          className="secondary mt-3 w-auto px-4"
                          type="button"
                          disabled={busy}
                          onClick={() => void prepareTurnClose()}
                        >
                          {turnClose.excelDescargadoEn
                            ? "Volver a descargar Excel + PDF"
                            : "Generar y descargar Excel + PDF"}
                        </button>
                      </div>
                    )}
                    {turnClose?.modoFlexible &&
                      turnClose.excelDescargadoEn &&
                      hasPermission("DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE") && (
                        <div className="rounded-2xl border border-denim/15 bg-white/60 p-4 text-sm">
                          <p className="font-bold">Exclusión de comprobantes internos</p>
                          <p className="mt-1 text-denim/60">
                            Solo aparecen comprobantes del Excel previo que aún no
                            iniciaron facturación electrónica. La venta, el pago y
                            la caja no se eliminan.
                          </p>
                          {turnExclusions.length === 0 ? (
                            <p className="mt-3 text-denim/60">
                              No hay comprobantes internos disponibles para excluir.
                            </p>
                          ) : (
                            <>
                              <div className="mt-3 max-h-48 space-y-2 overflow-auto">
                                {turnExclusions.map((item) => (
                                  <label
                                    key={item.facturaId}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-denim/10 bg-white p-3"
                                  >
                                    <span className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={selectedExclusionIds.includes(
                                          item.ventaId,
                                        )}
                                        onChange={(event) =>
                                          setSelectedExclusionIds((current) =>
                                            event.target.checked
                                              ? [...current, item.ventaId]
                                              : current.filter(
                                                  (id) => id !== item.ventaId,
                                                ),
                                          )
                                        }
                                      />
                                      <span>
                                        <b>{item.numero}</b>
                                        <span className="ml-2 text-denim/50">
                                          Venta #{item.ventaId}
                                        </span>
                                      </span>
                                    </span>
                                    <b>{money.format(Number(item.total))}</b>
                                  </label>
                                ))}
                              </div>
                              <label className="mt-3 block">
                                Motivo
                                <input
                                  className="input"
                                  maxLength={250}
                                  value={exclusionReason}
                                  onChange={(event) =>
                                    setExclusionReason(event.target.value)
                                  }
                                />
                              </label>
                              <label className="mt-3 block">
                                Contraseña del usuario que confirma
                                <input
                                  className="input"
                                  type="password"
                                  autoComplete="current-password"
                                  value={exclusionPassword}
                                  onChange={(event) =>
                                    setExclusionPassword(event.target.value)
                                  }
                                />
                              </label>
                              <button
                                className="secondary mt-3 w-auto px-4"
                                type="button"
                                disabled={
                                  busy || selectedExclusionIds.length === 0
                                }
                                onClick={() => void processTurnExclusions()}
                              >
                                Excluir seleccionados del cierre fiscal
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    {turnClose?.modoFlexible &&
                      turnClose.excelDescargadoEn &&
                      hasPermission("FACTURAS_EMITIR") &&
                      fiscalUniverse?.habilitado && (
                        <div className="rounded-2xl border border-denim/15 bg-white/60 p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-bold">Preparación fiscal del turno</p>
                              <p className="mt-1 text-denim/60">
                                Separa automáticamente lo ya fiscalizado, lo que está en
                                proceso y lo que todavía puede prepararse. Preparar no
                                asigna consecutivo ni transmite a DIAN.
                              </p>
                            </div>
                            {fiscalUniverse.elegibles.length > 0 && (
                              <button
                                className="secondary w-auto px-3"
                                type="button"
                                onClick={() =>
                                  setSelectedFiscalIds(
                                    fiscalUniverse.elegibles.map(
                                      (item) => item.facturaId,
                                    ),
                                  )
                                }
                              >
                                Seleccionar elegibles
                              </button>
                            )}
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-4">
                            <div className="rounded-xl border border-denim/10 bg-white p-3">
                              <span className="block text-denim/50">Excluidos</span>
                              <b>{fiscalUniverse.resumen.excluidas}</b>
                            </div>
                            <div className="rounded-xl border border-denim/10 bg-white p-3">
                              <span className="block text-denim/50">Ya fiscalizados</span>
                              <b>{fiscalUniverse.resumen.yaFiscalizadas}</b>
                            </div>
                            <div className="rounded-xl border border-denim/10 bg-white p-3">
                              <span className="block text-denim/50">En proceso</span>
                              <b>{fiscalUniverse.resumen.enProceso}</b>
                            </div>
                            <div className="rounded-xl border border-denim/10 bg-white p-3">
                              <span className="block text-denim/50">Elegibles</span>
                              <b>{fiscalUniverse.resumen.elegibles}</b>
                            </div>
                          </div>
                          {fiscalUniverse.resumen.sinComprobante > 0 && (
                            <p className="mt-3 rounded-xl border border-amber-300/50 bg-amber-50 p-3 text-amber-900">
                              Hay {fiscalUniverse.resumen.sinComprobante} operación(es)
                              del Excel previo sin comprobante interno y no se incluirán
                              en la preparación fiscal.
                            </p>
                          )}
                          {fiscalUniverse.yaFiscalizadas.length > 0 && (
                            <div className="mt-3">
                              <p className="font-semibold">Ya fiscalizados durante la atención</p>
                              <div className="mt-2 space-y-2">
                                {fiscalUniverse.yaFiscalizadas.map((item) => (
                                  <div
                                    key={item.facturaId}
                                    className="flex justify-between rounded-xl border border-denim/10 bg-white p-3"
                                  >
                                    <span>
                                      {item.numeroInterno}
                                      {item.numeroFiscal
                                        ? ` · ${item.numeroFiscal}`
                                        : ""}
                                    </span>
                                    <b>{item.estadoDocumento}</b>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {fiscalUniverse.enProceso.length > 0 && (
                            <div className="mt-3">
                              <p className="font-semibold">Flujo electrónico ya iniciado</p>
                              <div className="mt-2 space-y-2">
                                {fiscalUniverse.enProceso.map((item) => (
                                  <div
                                    key={item.facturaId}
                                    className="flex justify-between rounded-xl border border-denim/10 bg-white p-3"
                                  >
                                    <span>{item.numeroInterno}</span>
                                    <b>{item.estadoDocumento}</b>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {fiscalUniverse.elegibles.length === 0 ? (
                            <p className="mt-3 text-denim/60">
                              No quedan comprobantes internos elegibles para preparar.
                            </p>
                          ) : (
                            <>
                              <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                                {fiscalUniverse.elegibles.map((item) => (
                                  <label
                                    key={item.facturaId}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-denim/10 bg-white p-3"
                                  >
                                    <span className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={selectedFiscalIds.includes(
                                          item.facturaId,
                                        )}
                                        onChange={(event) =>
                                          setSelectedFiscalIds((current) =>
                                            event.target.checked
                                              ? [...current, item.facturaId]
                                              : current.filter(
                                                  (id) => id !== item.facturaId,
                                                ),
                                          )
                                        }
                                      />
                                      <span>{item.numeroInterno}</span>
                                    </span>
                                    <b>{money.format(Number(item.total))}</b>
                                  </label>
                                ))}
                              </div>
                              <button
                                className="primary mt-3 w-auto px-4"
                                type="button"
                                disabled={busy || selectedFiscalIds.length === 0}
                                onClick={() => void prepareFiscalSelection()}
                              >
                                Preparar seleccionados para facturación electrónica
                              </button>
                            </>
                          )}
                        </div>
                      )}
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
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        (turnClose?.modoFlexible === true &&
                          !turnClose.listoParaCerrar)
                      }
                    >
                      Cerrar caja
                    </button>
                  </form>
                )}
              </fieldset>
            )}
          </section>
        </div>
      )}
      {selectedSale && (
        <ProfessionalSaleCheckout
          sale={selectedSale}
          drawers={drawers}
          methods={methods}
          payment={payment}
          setPayment={setPayment}
          busy={busy}
          uncertain={uncertain}
          failure={failure}
          hasPermission={hasPermission}
          hasCapability={hasCapability}
          onClose={() => setSelectedSale(null)}
          onPay={pay}
          onRun={run}
          onSaleChanged={(sale) => {
            setSelectedSale(sale);
            setSales((current) =>
              current.map((item) => (item.id === sale.id ? sale : item)),
            );
          }}
        />
      )}
    </div>
  );
}
