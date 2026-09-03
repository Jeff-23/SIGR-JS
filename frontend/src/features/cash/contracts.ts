export type PaymentMethod = {
  id: number;
  nombre: string;
  tipo: string;
  activo: boolean;
};
export type Sale = {
  id: number;
  sucursalId: number;
  estado: string;
  subtotal?: string | number;
  descuentos?: string | number;
  impuestos?: string | number;
  impoconsumo?: string | number;
  propina?: string | number;
  domicilioCosto?: string | number;
  total: string | number;
  fechaOperacion: string;
  pedido?: {
    id: number;
    estado: string;
    mesa?: { numero: string } | null;
  } | null;
  cliente?: { id?: number; nombres?: string; apellidos?: string; razonSocial?: string; numeroDocumento?: string } | null;
  factura?: { id: number; numero: string; documentoElectronico?: { id: number; estado: string; numeroCompleto?: string } | null } | null;
  aplicacionesDescuento?: Array<{ id: number; origen: string; nombre: string; monto: string | number }>;
  pagos: Array<{
    id: number;
    monto: string | number;
    referencia?: string;
    metodoPago: PaymentMethod;
    devoluciones?: Array<{
      id: number;
      monto: string | number;
      motivo: string;
      creadoEn: string;
    }>;
  }>;
  detalles: Array<{
    id: number;
    cantidad: number;
    precioUnitario: string | number;
    subtotal: string | number;
    producto?: { nombre: string };
  }>;
  divisionesCuenta?: Array<{
    id: number;
    nombre: string;
    modo: string;
    total: string | number;
    pagos: Array<{ id: number; monto: string | number }>;
  }>;
};

export function divisionBalance(
  division: NonNullable<Sale["divisionesCuenta"]>[number],
) {
  return (
    Math.max(
      0,
      cents(division.total) -
        division.pagos.reduce((sum, payment) => sum + cents(payment.monto), 0),
    ) / 100
  );
}
export type CashDrawer = {
  id: number;
  nombre: string;
  estado: string;
  sucursalId: number;
  saldoInicial: string | number;
  fechaApertura: string;
  fechaCierre?: string;
  saldoContado?: string;
  diferencia?: string;
  resumen?: {
    saldoEsperado: string;
    totalEfectivoSistema: string;
    totalOtrosPagos: string;
    totalIngresos: string;
    totalEgresos: string;
  };
  movimientos?: Array<{
    id: number;
    tipo: string;
    monto: string;
    concepto: string;
  }>;
};
export function cents(amount: string | number) {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new Error("Importe inválido");
  return Math.round((value + Number.EPSILON) * 100);
}
export function balance(sale: Pick<Sale, "total" | "pagos">) {
  return (
    Math.max(
      0,
      cents(sale.total) -
        sale.pagos.reduce(
          (sum, payment) =>
            sum +
            cents(payment.monto) -
            (payment.devoluciones ?? []).reduce(
              (returned, refund) => returned + cents(refund.monto),
              0,
            ),
          0,
        ),
    ) / 100
  );
}

export function refundable(payment: Sale["pagos"][number]) {
  return (
    Math.max(
      0,
      cents(payment.monto) -
        (payment.devoluciones ?? []).reduce(
          (sum, refund) => sum + cents(refund.monto),
          0,
        ),
    ) / 100
  );
}

export function paid(sale: Pick<Sale, "pagos">) {
  return (
    sale.pagos.reduce(
      (sum, payment) =>
        sum +
        cents(payment.monto) -
        (payment.devoluciones ?? []).reduce(
          (returned, refund) => returned + cents(refund.monto),
          0,
        ),
      0,
    ) / 100
  );
}

export function automaticDiscount(sale: Pick<Sale, "aplicacionesDescuento">) {
  return (sale.aplicacionesDescuento ?? []).reduce(
    (sum, item) => sum + Number(item.monto),
    0,
  );
}

export function cashChange(received: string | number, charged: string | number) {
  const receivedCents = cents(received || 0);
  const chargedCents = cents(charged || 0);
  return Math.max(0, receivedCents - chargedCents) / 100;
}

export function clampPaymentAmount(value: string | number, maximum: string | number) {
  const amount = Number(value);
  const max = Math.max(0, Number(maximum));
  if (!Number.isFinite(amount)) return "";
  if (!(amount > 0)) return value === "" ? "" : "0";
  return String(Math.min(amount, max));
}
