export type OrderType = "MESA" | "MOSTRADOR" | "PARA_LLEVAR" | "DOMICILIO";

export type ApiTable = {
  id: number;
  numero: number;
  capacidad: number;
  situacion: "LIBRE" | "OCUPADA" | "PENDIENTE_PAGO";
  ocupacionManual: boolean;
  zona: { id: number; nombre: string; sucursalId: number };
};

export type ApiProduct = {
  id: number;
  nombre: string;
  precio: string | number;
  categoria: { id: number; nombre: string };
};

export type OrderDetail = {
  id: number;
  cantidad: number;
  precioUnitario: string | number;
  subtotal: string | number;
  observaciones?: string | null;
  producto: ApiProduct;
  comandas?: Array<{ cantidad: number }>;
};

export type ApiOrder = {
  id: number;
  tipo: OrderType;
  estado: "PENDIENTE" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "FACTURADO" | "CANCELADO";
  total: string | number;
  creadoEn: string;
  mesa: ApiTable | null;
  detalles: OrderDetail[];
  comandas: Array<{ id: number; estado: string; fechaEnvio: string }>;
  venta?: { id: number; estado: string; total: string | number } | null;
};

export type CartLine = {
  product: ApiProduct;
  quantity: number;
  notes: string;
};

export function cartTotal(lines: CartLine[]) {
  return lines.reduce((total, line) => total + Number(line.product.precio) * line.quantity, 0);
}

export function pendingCommandDetails(order: ApiOrder) {
  return order.detalles
    .map((detail) => ({
      detallePedidoId: detail.id,
      cantidad: detail.cantidad - (detail.comandas ?? []).reduce((sum, sent) => sum + sent.cantidad, 0),
    }))
    .filter((detail) => detail.cantidad > 0);
}

export function activeOrder(order: ApiOrder) {
  return order.estado !== "CANCELADO" && order.estado !== "FACTURADO";
}
