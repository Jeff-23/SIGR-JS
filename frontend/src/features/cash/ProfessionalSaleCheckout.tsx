import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CreditCard,
  FileText,
  Landmark,
  Printer,
  ReceiptText,
  Split,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../../lib/api";
import { PrintableDocumentModal } from "../../components/PrintableDocumentModal";
import { money } from "../../data/demo";
import {
  automaticDiscount,
  balance,
  cashChange,
  clampPaymentAmount,
  divisionBalance,
  paid,
  refundable,
  type CashDrawer,
  type PaymentMethod,
  type Sale,
} from "./contracts";
import { splitPeople, splitPercentages, splitProducts } from "./account-split";

export type PaymentDraft = {
  monto: string;
  metodoPagoId: string;
  cajaId: string;
  referencia: string;
  divisionCuentaId: string;
};

type Customer = {
  id: number;
  nombres: string;
  apellidos?: string;
  razonSocial?: string;
  numeroDocumento?: string;
};

type Props = {
  sale: Sale;
  drawers: CashDrawer[];
  methods: PaymentMethod[];
  payment: PaymentDraft;
  setPayment: (next: PaymentDraft) => void;
  busy: boolean;
  uncertain: boolean;
  failure: string;
  hasPermission: (permission: string) => boolean;
  hasCapability: (capability: string) => boolean;
  onClose: () => void;
  onPay: () => Promise<unknown>;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
  onSaleChanged: (sale: Sale) => void;
};

function methodIcon(type: string) {
  if (type === "EFECTIVO") return Banknote;
  if (type === "TARJETA") return CreditCard;
  if (type === "TRANSFERENCIA") return Landmark;
  return WalletCards;
}

function customerName(customer: Sale["cliente"]) {
  if (!customer) return "Consumidor final / sin cliente";
  return (
    customer.razonSocial ||
    [customer.nombres, customer.apellidos].filter(Boolean).join(" ") ||
    `Cliente #${customer.id ?? ""}`
  );
}

export function ProfessionalSaleCheckout({
  sale,
  drawers,
  methods,
  payment,
  setPayment,
  busy,
  uncertain,
  failure,
  hasPermission,
  hasCapability,
  onClose,
  onPay,
  onRun,
  onSaleChanged,
}: Props) {
  const [cashReceived, setCashReceived] = useState(() =>
    methods.find((item) => item.id === Number(payment.metodoPagoId))?.tipo ===
    "EFECTIVO"
      ? payment.monto
      : "",
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(
    sale.cliente?.id ? String(sale.cliente.id) : "",
  );
  const [discounts, setDiscounts] = useState(
    String(Number(sale.descuentos ?? 0)),
  );
  const [tip, setTip] = useState(String(Number(sale.propina ?? 0)));
  const [invoiceHtml, setInvoiceHtml] = useState<string | null>(null);
  const [posHtml, setPosHtml] = useState<string | null>(null);
  const invoiceFrame = useRef<HTMLIFrameElement>(null);

  const selectedMethod = methods.find(
    (item) => item.id === Number(payment.metodoPagoId),
  );
  const selectedDivision = sale.divisionesCuenta?.find(
    (item) => item.id === Number(payment.divisionCuentaId),
  );
  const amountDue = selectedDivision
    ? divisionBalance(selectedDivision)
    : balance(sale);
  const amountPaid = paid(sale);
  const automatic = automaticDiscount(sale);
  const canEditLiquidation =
    hasPermission("VENTAS_CREAR") &&
    sale.estado !== "ANULADA" &&
    sale.pagos.length === 0 &&
    !sale.factura &&
    !(sale.divisionesCuenta?.length ?? 0);
  const canSearchCustomers =
    hasPermission("CLIENTES_VER") && hasCapability("CLIENTES");

  useEffect(() => {
    if (!canSearchCustomers || !canEditLiquidation) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api
        .get<{ datos: Customer[] }>("/clientes", {
          signal: controller.signal,
          params: { buscar: customerSearch, estado: true, limite: 20 },
        })
        .then(({ data }) => setCustomers(data.datos))
        .catch((error) => {
          if (!controller.signal.aborted) toast.error(errorMessage(error));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerSearch, canSearchCustomers, canEditLiquidation]);

  const change = useMemo(() => {
    if (selectedMethod?.tipo !== "EFECTIVO" || !cashReceived || !payment.monto)
      return 0;
    try {
      return cashChange(cashReceived, payment.monto);
    } catch {
      return 0;
    }
  }, [selectedMethod?.tipo, cashReceived, payment.monto]);

  async function refreshSale() {
    const { data } = await api.get<Sale>(`/ventas/${sale.id}`);
    onSaleChanged(data);
    return data;
  }

  async function saveLiquidation() {
    const discount = Number(discounts);
    const gratuity = Number(tip);
    if (!Number.isFinite(discount) || discount < automatic)
      return toast.error(
        `El descuento total no puede ser menor a ${money.format(automatic)}`,
      );
    if (!Number.isFinite(gratuity) || gratuity < 0)
      return toast.error("La propina no puede ser negativa");
    if (discount > Number(sale.subtotal ?? sale.total))
      return toast.error("El descuento no puede superar el subtotal");
    await onRun(async () => {
      const { data } = await api.patch<Sale>(`/ventas/${sale.id}/liquidacion`, {
        descuentos: discount,
        propina: gratuity,
        clienteId: customerId ? Number(customerId) : null,
      });
      onSaleChanged(data);
      setPayment({ ...payment, monto: String(balance(data)) });
      toast.success("Liquidación actualizada antes del cobro");
    });
  }

  async function createInvoice() {
    await onRun(async () => {
      await api.post("/facturas/venta", { ventaId: sale.id });
      await refreshSale();
      toast.success("Factura interna creada. No se envió a DIAN.");
    });
  }

  async function loadPosReceipt() {
    await onRun(async () => {
      const { data } = await api.get<{ contenido: string }>(
        `/ventas/${sale.id}/comprobante-pos`,
      );
      setPosHtml(data.contenido);
    });
  }

  async function loadInvoiceRepresentation() {
    if (!sale.factura) return;
    await onRun(async () => {
      const { data } = await api.get<{ contenido: string }>(
        `/facturas/${sale.factura!.id}/representacion-impresa`,
      );
      setInvoiceHtml(data.contenido);
    });
  }

  async function prepareElectronic() {
    if (!sale.factura) return;
    await onRun(async () => {
      await api.post("/documentos-electronicos/preparar", {
        facturaIds: [sale.factura!.id],
      });
      await refreshSale();
      toast.success(
        "Documento electrónico preparado, sin envío fiscal automático",
      );
    });
  }

  async function refund(paymentId: number, maximum: number) {
    const amount = window.prompt(
      `Monto a devolver (máximo ${money.format(maximum)})`,
      String(maximum),
    );
    if (amount === null) return;
    const reason = window.prompt("Motivo obligatorio de la devolución");
    if (!reason?.trim()) return;
    await onRun(async () => {
      await api.post(
        `/ventas/${sale.id}/pagos/${paymentId}/devoluciones`,
        { monto: Number(amount), motivo: reason.trim() },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      await refreshSale();
      toast.success("Devolución registrada sin alterar el pago original");
    });
  }

  async function splitAccount() {
    const mode = window
      .prompt("Tipo de división: PERSONAS, PORCENTAJE o PRODUCTOS", "PERSONAS")
      ?.trim()
      .toUpperCase();
    if (!mode) return;
    let parts;
    try {
      if (mode === "PERSONAS") {
        parts = splitPeople(
          Number(sale.total),
          Number(window.prompt("Número de personas", "2")),
        );
      } else if (mode === "PORCENTAJE") {
        const percentages = (
          window.prompt(
            "Porcentajes separados por coma (deben sumar 100)",
            "50,50",
          ) ?? ""
        )
          .split(",")
          .map(Number);
        parts = splitPercentages(Number(sale.total), percentages);
      } else if (mode === "PRODUCTOS") {
        const assignments = sale.detalles.map((detail) =>
          Number(
            window.prompt(
              `Grupo para ${detail.producto?.nombre ?? `Producto ${detail.id}`}`,
              "1",
            ),
          ),
        );
        parts = splitProducts(sale, assignments);
      } else throw new Error("Tipo de división inválido");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "División inválida");
      return;
    }
    await onRun(async () => {
      await api.post(`/ventas/${sale.id}/division-cuenta`, {
        modo: mode,
        partes: parts,
      });
      const detail = await refreshSale();
      const first = detail.divisionesCuenta?.[0];
      setPayment({
        ...payment,
        divisionCuentaId: first ? String(first.id) : "",
        monto: first ? String(divisionBalance(first)) : payment.monto,
      });
      toast.success(
        "Cuenta dividida; cada parte mantiene su saldo independiente",
      );
    });
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-steel/70 p-2 sm:p-4 print:bg-white print:p-0">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Caja POS profesional"
        className="mx-auto min-h-[calc(100vh-1rem)] max-w-6xl rounded-2xl bg-[#f7f7f5] p-4 shadow-2xl sm:min-h-0 sm:p-6 print:shadow-none"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-denim/10 pb-4 print:hidden">
          <div>
            <p className="eyebrow">Caja POS · Venta ≠ Pago ≠ Factura</p>
            <h2 className="page-title">
              Venta #{sale.id}
              {sale.pedido?.mesa ? ` · Mesa ${sale.pedido.mesa.numero}` : ""}
            </h2>
            <p className="text-sm text-denim/60">
              {sale.pedido ? `Pedido #${sale.pedido.id}` : "Venta directa"} ·{" "}
              {customerName(sale.cliente)}
            </p>
          </div>
          <button
            className="secondary w-auto"
            aria-label="Cerrar venta"
            disabled={busy || uncertain}
            onClick={onClose}
          >
            <X />
          </button>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.9fr)]">
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-denim p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                  Total
                </p>
                <strong className="mt-2 block text-3xl">
                  {money.format(Number(sale.total))}
                </strong>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-denim/50">
                  Pagado
                </p>
                <strong className="mt-2 block text-3xl text-denim">
                  {money.format(amountPaid)}
                </strong>
              </div>
              <div className="rounded-2xl border-2 border-marigold bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-denim/50">
                  Pendiente
                </p>
                <strong className="mt-2 block text-3xl text-denim">
                  {money.format(balance(sale))}
                </strong>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold">Consumo</h3>
                  <p className="text-sm text-denim/55">
                    Detalle comercial de la venta seleccionada.
                  </p>
                </div>
                <span className="rounded-full bg-screen/60 px-3 py-1 text-sm font-semibold">
                  {sale.detalles.length} líneas
                </span>
              </div>
              <div className="mt-3 divide-y divide-denim/10">
                {sale.detalles.map((detail) => (
                  <div
                    key={detail.id}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span>
                      {detail.cantidad} ×{" "}
                      {detail.producto?.nombre ?? `Producto ${detail.id}`}
                    </span>
                    <strong>{money.format(Number(detail.subtotal))}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 border-t border-denim/10 pt-3 text-sm sm:grid-cols-2">
                <p>
                  Subtotal{" "}
                  <strong>
                    {money.format(Number(sale.subtotal ?? sale.total))}
                  </strong>
                </p>
                <p>
                  Descuentos{" "}
                  <strong>−{money.format(Number(sale.descuentos ?? 0))}</strong>
                </p>
                <p>
                  Impuestos + impoconsumo{" "}
                  <strong>
                    {money.format(
                      Number(sale.impuestos ?? 0) +
                        Number(sale.impoconsumo ?? 0),
                    )}
                  </strong>
                </p>
                <p>
                  Propina{" "}
                  <strong>{money.format(Number(sale.propina ?? 0))}</strong>
                </p>
              </div>
            </section>

            {canEditLiquidation && (
              <section className="rounded-2xl bg-white p-4 shadow-sm print:hidden">
                <div className="flex items-center gap-2">
                  <UserRound size={20} />
                  <h3 className="text-lg font-bold">
                    Cliente, descuento y propina
                  </h3>
                </div>
                <p className="mt-1 text-sm text-denim/55">
                  Se define antes del primer pago. Los descuentos automáticos
                  existentes se conservan.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {canSearchCustomers && (
                    <>
                      <label>
                        Buscar cliente
                        <input
                          className="input"
                          value={customerSearch}
                          onChange={(event) =>
                            setCustomerSearch(event.target.value)
                          }
                          placeholder="Documento, nombre…"
                        />
                      </label>
                      <label>
                        Cliente
                        <select
                          className="input"
                          value={customerId}
                          onChange={(event) =>
                            setCustomerId(event.target.value)
                          }
                        >
                          <option value="">
                            Consumidor final / sin cliente
                          </option>
                          {sale.cliente?.id &&
                            !customers.some(
                              (item) => item.id === sale.cliente?.id,
                            ) && (
                              <option value={sale.cliente.id}>
                                {customerName(sale.cliente)}
                              </option>
                            )}
                          {customers.map((customer) => (
                            <option value={customer.id} key={customer.id}>
                              {customer.razonSocial ||
                                `${customer.nombres} ${customer.apellidos ?? ""}`}{" "}
                              · {customer.numeroDocumento ?? "sin documento"}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    Descuento total autorizado
                    <input
                      className="input"
                      type="number"
                      min={automatic}
                      step="0.01"
                      value={discounts}
                      readOnly={
                        !hasPermission("DESCUENTOS_APLICAR") &&
                        Number(discounts) === automatic
                      }
                      onChange={(event) => setDiscounts(event.target.value)}
                    />
                    {automatic > 0 && (
                      <span className="text-xs text-denim/55">
                        Automático protegido: {money.format(automatic)}
                      </span>
                    )}
                  </label>
                  <label>
                    Propina
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={tip}
                      onChange={(event) => setTip(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  className="secondary mt-3 w-auto"
                  disabled={busy || Boolean(failure)}
                  onClick={() => void saveLiquidation()}
                >
                  Guardar liquidación
                </button>
              </section>
            )}

            {(sale.divisionesCuenta?.length ?? 0) > 0 && (
              <section className="rounded-2xl bg-white p-4 shadow-sm print:hidden">
                <h3 className="font-bold">Cuenta dividida</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sale.divisionesCuenta?.map((division) => (
                    <button
                      key={division.id}
                      className={`rounded-xl border p-3 text-left ${Number(payment.divisionCuentaId) === division.id ? "border-marigold bg-amber-50" : "border-denim/10"}`}
                      onClick={() =>
                        setPayment({
                          ...payment,
                          divisionCuentaId: String(division.id),
                          monto: String(divisionBalance(division)),
                        })
                      }
                    >
                      <strong>{division.nombre}</strong>
                      <span className="mt-1 block text-sm">
                        Saldo {money.format(divisionBalance(division))}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold">Pagos registrados</h3>
                  <p className="text-sm text-denim/55">
                    Cada pago permanece como movimiento financiero
                    independiente.
                  </p>
                </div>
                <span className="rounded-full bg-screen/60 px-3 py-1 text-sm font-semibold">
                  {sale.pagos.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {sale.pagos.length === 0 && (
                  <p className="rounded-xl bg-screen/30 p-3 text-sm">
                    Aún no hay pagos registrados.
                  </p>
                )}
                {sale.pagos.map((item) => {
                  const available = refundable(item);
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-denim/10 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong>{item.metodoPago.nombre}</strong>
                          <p className="text-xs text-denim/55">
                            Pago #{item.id}
                            {item.referencia
                              ? ` · Ref. ${item.referencia}`
                              : ""}
                          </p>
                        </div>
                        <strong className="text-lg">
                          {money.format(Number(item.monto))}
                        </strong>
                      </div>
                      {(item.devoluciones ?? []).map((refund) => (
                        <p
                          key={refund.id}
                          className="mt-2 text-sm text-amber-800"
                        >
                          Devolución #{refund.id}: −
                          {money.format(Number(refund.monto))} · {refund.motivo}
                        </p>
                      ))}
                      {hasPermission("PAGOS_REGISTRAR") && available > 0 && (
                        <button
                          className="secondary mt-2 w-auto print:hidden"
                          disabled={busy || uncertain}
                          onClick={() => void refund(item.id, available)}
                        >
                          Registrar devolución
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-4 print:hidden xl:sticky xl:top-4 xl:self-start">
            {balance(sale) > 0 &&
            sale.estado !== "ANULADA" &&
            hasPermission("PAGOS_REGISTRAR") ? (
              <section className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-denim/10">
                <h3 className="text-xl font-bold">Cobrar</h3>
                <p className="mt-1 text-sm text-denim/55">
                  {selectedDivision
                    ? `${selectedDivision.nombre}: ${money.format(amountDue)} pendientes`
                    : `${money.format(amountDue)} pendientes`}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {methods.map((method) => {
                    const Icon = methodIcon(method.tipo);
                    const selected = Number(payment.metodoPagoId) === method.id;
                    return (
                      <button
                        type="button"
                        key={method.id}
                        className={`rounded-xl border-2 p-3 text-left transition ${selected ? "border-marigold bg-amber-50" : "border-denim/10 bg-white hover:border-denim/25"}`}
                        onClick={() => {
                          setPayment({
                            ...payment,
                            metodoPagoId: String(method.id),
                            referencia: "",
                          });
                          if (method.tipo === "EFECTIVO")
                            setCashReceived(payment.monto);
                        }}
                      >
                        <Icon size={22} />
                        <strong className="mt-2 block">{method.nombre}</strong>
                        <span className="text-xs text-denim/50">
                          {method.tipo === "QR"
                            ? "Otro / QR"
                            : method.tipo.toLowerCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (
                      selectedMethod?.tipo === "EFECTIVO" &&
                      Number(cashReceived) < Number(payment.monto)
                    ) {
                      toast.error(
                        "El efectivo recibido no cubre el monto aplicado",
                      );
                      return;
                    }
                    void onRun(onPay);
                  }}
                >
                  <label>
                    Monto aplicado a la venta
                    <input
                      className="input text-lg font-bold"
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      max={amountDue}
                      value={payment.monto}
                      onChange={(event) => {
                        const next = clampPaymentAmount(
                          event.target.value,
                          amountDue,
                        );
                        setPayment({ ...payment, monto: next });
                        if (
                          selectedMethod?.tipo === "EFECTIVO" &&
                          Number(cashReceived || 0) < Number(next || 0)
                        ) {
                          setCashReceived(next);
                        }
                      }}
                    />
                    <span className="text-xs text-denim/50">
                      Máximo aplicable: {money.format(amountDue)}
                    </span>
                  </label>
                  {selectedMethod?.tipo === "EFECTIVO" ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <label>
                        Efectivo recibido
                        <input
                          className="input"
                          type="number"
                          min={payment.monto || "0"}
                          step="0.01"
                          value={cashReceived}
                          onChange={(event) =>
                            setCashReceived(event.target.value)
                          }
                        />
                      </label>
                      <div className="rounded-xl bg-screen/35 p-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-denim/55">
                          Cambio
                        </span>
                        <strong className="mt-1 block text-2xl">
                          {money.format(change)}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <label>
                      Referencia / autorización
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
                        placeholder="Opcional según el medio"
                      />
                    </label>
                  )}
                  <label>
                    Caja receptora
                    <select
                      className="input"
                      required
                      value={payment.cajaId}
                      onChange={(event) =>
                        setPayment({ ...payment, cajaId: event.target.value })
                      }
                    >
                      <option value="">Selecciona caja</option>
                      {drawers.map((drawer) => (
                        <option value={drawer.id} key={drawer.id}>
                          {drawer.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  {uncertain && (
                    <p
                      role="alert"
                      className="rounded-xl bg-amber-50 p-3 text-sm"
                    >
                      El resultado del último cobro no quedó confirmado.
                      Reintenta exactamente la misma operación; SIGR conserva su
                      clave idempotente para evitar duplicarla.
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      Boolean(failure) ||
                      !payment.metodoPagoId ||
                      !payment.cajaId
                    }
                  >
                    {uncertain
                      ? "Consultar / reintentar mismo cobro"
                      : "Registrar pago"}
                  </button>
                </form>
              </section>
            ) : (
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <ReceiptText size={24} />
                <h3 className="mt-2 text-xl font-bold">
                  Venta sin saldo pendiente
                </h3>
                <p className="mt-1 text-sm text-denim/55">
                  El cobro terminó. Pago, factura y documento electrónico siguen
                  siendo operaciones separadas.
                </p>
              </section>
            )}

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="font-bold">Acciones de cuenta</h3>
              <div className="mt-3 grid gap-2">
                {hasPermission("VENTAS_CREAR") &&
                  sale.estado !== "ANULADA" &&
                  sale.pagos.length === 0 && (
                    <button
                      className="secondary"
                      disabled={busy || uncertain}
                      onClick={() => void splitAccount()}
                    >
                      <Split size={18} /> Dividir cuenta
                    </button>
                  )}
                {sale.pagos.length > 0 && hasPermission("VENTAS_VER") && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void loadPosReceipt()}
                  >
                    <Printer size={18} /> Imprimir / reimprimir comprobante POS
                  </button>
                )}
                {hasPermission("FACTURAS_EMITIR") &&
                  !sale.factura &&
                  sale.estado !== "ANULADA" && (
                    <button
                      className="secondary"
                      disabled={busy || uncertain}
                      onClick={() => void createInvoice()}
                    >
                      <FileText size={18} /> Crear factura interna
                    </button>
                  )}
                {sale.factura && hasPermission("FACTURAS_VER") && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void loadInvoiceRepresentation()}
                  >
                    <Printer size={18} /> Imprimir / reimprimir factura
                  </button>
                )}
                {sale.factura &&
                  hasPermission("FACTURAS_EMITIR") &&
                  !sale.factura.documentoElectronico && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void prepareElectronic()}
                    >
                      <FileText size={18} /> Preparar documento electrónico
                    </button>
                  )}
              </div>
              <p className="mt-3 text-xs text-denim/50">
                Preparar un documento electrónico no significa enviarlo ni
                obtener aceptación DIAN. La integración fiscal real se habilita
                aparte.
              </p>
            </section>

            {sale.factura && (
              <section className="rounded-2xl bg-white p-4 text-sm shadow-sm">
                <strong>Factura interna</strong>
                <p className="mt-1">{sale.factura.numero}</p>
                <p className="text-denim/55">
                  Documento electrónico:{" "}
                  {sale.factura.documentoElectronico?.estado ?? "no preparado"}
                </p>
              </section>
            )}
          </aside>
        </div>
      </section>

      {posHtml && (
        <PrintableDocumentModal
          html={posHtml}
          title={`Comprobante POS · Venta #${sale.id}`}
          onClose={() => setPosHtml(null)}
        />
      )}

      {invoiceHtml && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 p-3 print:bg-white">
          <section className="card mx-auto max-w-3xl space-y-3">
            <div className="flex justify-end gap-2 print:hidden">
              <button
                className="primary w-auto"
                onClick={() => invoiceFrame.current?.contentWindow?.print()}
              >
                <Printer size={18} /> Imprimir
              </button>
              <button
                className="secondary w-auto"
                onClick={() => setInvoiceHtml(null)}
              >
                <X /> Cerrar
              </button>
            </div>
            <iframe
              ref={invoiceFrame}
              title="Factura interna imprimible"
              sandbox="allow-same-origin allow-modals"
              srcDoc={invoiceHtml}
              className="h-[75vh] w-full border-0 bg-white"
            />
          </section>
        </div>
      )}
    </div>
  );
}
