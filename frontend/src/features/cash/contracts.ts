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
  total: string | number;
  fechaOperacion: string;
  pedido?: {
    id: number;
    estado: string;
    mesa?: { numero: string } | null;
  } | null;
  cliente?: { nombres?: string; razonSocial?: string } | null;
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
};
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
