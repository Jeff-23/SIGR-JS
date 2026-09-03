export type OrderType = "MESA" | "MOSTRADOR" | "PARA_LLEVAR" | "DOMICILIO";

export type ApiTable = {
  id: number;
  numero: string;
  capacidad: number;
  situacion: "LIBRE" | "OCUPADA" | "RESERVADA" | "PENDIENTE_PAGO" | "FUERA_SERVICIO";
  ocupacionManual: boolean;
  ocupadaManualEn?: string | null;
  zona: { id: number; nombre: string; sucursalId: number };
};

export type ApiModifier = { id: number; nombre: string; precio: string | number; activo?: boolean; orden?: number };

export type ApiProduct = {
  id: number;
  nombre: string;
  precio: string | number;
  favorito?: boolean;
  disponible?: boolean;
  stock?: string | number;
  estrategiaInventario?: string;
  categoria: { id: number; nombre: string };
  estacion?: { id: number; codigo: string; nombre: string } | null;
  modificadores?: ApiModifier[];
};

export type OrderDetail = {
  id: number;
  cantidad: number;
  precioUnitario: string | number;
  subtotal: string | number;
  observaciones?: string | null;
  producto: ApiProduct;
  modificadores?: Array<{ id: number; nombre: string; precioUnitario: string | number; cantidad: number; subtotal: string | number }>;
  comandas?: Array<{ cantidad: number; comanda?: ApiCommand }>;
};

export type ApiCommand = {
  id: number;
  estado: string;
  prioridad?: string;
  fechaEnvio: string;
  fechaInicio?: string | null;
  fechaLista?: string | null;
  fechaEntrega?: string | null;
  estacion?: { id: number; codigo: string; nombre: string; color?: string };
  detalles?: Array<{ cantidad: number; detallePedido?: OrderDetail }>;
};

export type ApiOrder = {
  id: number;
  tipo: OrderType;
  estado: "PENDIENTE" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "FACTURADO" | "CANCELADO";
  total: string | number;
  creadoEn: string;
  personas?: number | null;
  observaciones?: string | null;
  mesa: ApiTable | null;
  detalles: OrderDetail[];
  comandas: ApiCommand[];
  venta?: { id: number; estado: string; total: string | number } | null;
  mesero?: { id: number; nombres: string; apellidos: string } | null;
  mesasVinculadas?: Array<{ principal: boolean; mesa: ApiTable }>;
};

export type CartLine = {
  product: ApiProduct;
  quantity: number;
  notes: string;
  modifierIds?: number[];
};

export function lineUnitPrice(line: CartLine) {
  return Number(line.product.precio) + (line.product.modificadores ?? []).filter((m) => (line.modifierIds ?? []).includes(m.id)).reduce((sum, m) => sum + Number(m.precio), 0);
}

export function cartTotal(lines: CartLine[]) {
  return lines.reduce((total, line) => total + lineUnitPrice(line) * line.quantity, 0);
}

export function pendingCommandDetails(order: ApiOrder) {
  return order.detalles
    .map((detail) => ({
      detallePedidoId: detail.id,
      cantidad: detail.cantidad - (detail.comandas ?? []).filter((sent) => sent.comanda?.estado !== "CANCELADA").reduce((sum, sent) => sum + sent.cantidad, 0),
    }))
    .filter((detail) => detail.cantidad > 0);
}

export function activeOrder(order: ApiOrder) {
  return order.estado !== "CANCELADO" && order.estado !== "FACTURADO" && !(order.estado === "ENTREGADO" && order.venta?.estado === "PAGADA");
}

export function occupiedMinutes(order?: ApiOrder, table?: ApiTable) {
  const value = order?.creadoEn ?? table?.ocupadaManualEn;
  return value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)) : 0;
}

export function stationSummary(order: ApiOrder) {
  const grouped = new Map<string, { name: string; total: number; ready: number; oldestReadyMinutes: number }>();
  for (const command of order.comandas ?? []) {
    const key = command.estacion?.codigo ?? "PREPARACION";
    const current = grouped.get(key) ?? { name: command.estacion?.nombre ?? "Preparación", total: 0, ready: 0, oldestReadyMinutes: 0 };
    current.total += 1;
    if (["LISTA", "ENTREGADA"].includes(command.estado)) current.ready += 1;
    if (command.estado === "LISTA") {
      const since = command.fechaLista ?? command.fechaEnvio;
      current.oldestReadyMinutes = Math.max(current.oldestReadyMinutes, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
    }
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function suggestedAction(order: ApiOrder) {
  const stations = stationSummary(order);
  const waiting = stations.find((item) => item.oldestReadyMinutes >= 5);
  if (waiting) return `Retirar ${waiting.name.toLowerCase()} · esperando ${waiting.oldestReadyMinutes} min`;
  const ready = stations.find((item) => item.ready > 0);
  if (ready) return `Retirar ${ready.name.toLowerCase()}`;
  if (pendingCommandDetails(order).length) return "Enviar líneas nuevas a preparación";
  if (order.estado === "LISTO") return "Entregar pedido";
  if (order.venta?.estado === "PENDIENTE_PAGO") return "Cobrar cuenta";
  return "Continuar seguimiento";
}
