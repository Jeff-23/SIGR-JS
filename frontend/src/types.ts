export type Session = {
  token: string;
  createdAt: string;
  user: {
    id: number;
    nombres: string;
    email: string;
    rol: string;
    restauranteId: number | null;
    sucursalId: number | null;
    permisos: string[];
    capacidades: string[];
    restauranteNombre?: string;
    sucursalNombre?: string;
  };
  demo?: boolean;
};
export type Branch = { id: number; name: string; location: string; active?: boolean };
export type TableState = "LIBRE" | "OCUPADA" | "PENDIENTE_PAGO";
export type Table = {
  id: number;
  number: number;
  seats: number;
  zone: string;
  state: TableState;
  orderId?: number;
};
export type ProductModifier = { id: number; name: string; price: number };
export type MenuItem = {
  id: number;
  name: string;
  price: number;
  station: "COCINA" | "BAR";
  category: string;
  favorite?: boolean;
  available?: boolean;
  modifiers?: ProductModifier[];
};
export type OrderStatus = "NUEVO" | "PREPARANDO" | "LISTO" | "ENTREGADO" | "PENDIENTE_PAGO" | "PAGADO";
export type StationStatus = "PENDIENTE" | "PREPARANDO" | "LISTO" | "ENTREGADO";
export type OrderLineStatus = "ENVIADA" | "PREPARANDO" | "LISTA" | "ENTREGADA";
export type OrderLine = MenuItem & {
  quantity: number;
  note?: string;
  sent?: boolean;
  selectedModifiers?: ProductModifier[];
  lineStatus?: OrderLineStatus;
};
export type Order = {
  id: number;
  table: number;
  createdAt: string;
  status: OrderStatus;
  items: OrderLine[];
  total: number;
  paymentStatus: "PENDIENTE" | "PAGADO";
  stationStatus: Record<"COCINA" | "BAR", StationStatus | "NO_APLICA">;
  note?: string;
  serviceAlert?: string;
  accountRequested?: boolean;
  accountRequestNote?: string;
  waiter?: string;
  guests?: number;
  kitchenSeen?: Partial<Record<"COCINA" | "BAR", boolean>>;
  priority?: "NORMAL" | "ALTA" | "URGENTE";
};
