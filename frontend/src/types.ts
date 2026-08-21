export type Session = {
  token: string;
  user: {
    id: number;
    nombres: string;
    email: string;
    rol: string;
    restauranteId: number | null;
    sucursalId: number | null;
    permisos: string[];
    capacidades: string[];
  };
  demo?: boolean;
};
export type Branch = { id: number; name: string; location: string };
export type TableState = "LIBRE" | "OCUPADA" | "PENDIENTE_PAGO";
export type Table = {
  id: number;
  number: number;
  seats: number;
  zone: string;
  state: TableState;
  orderId?: number;
};
export type MenuItem = {
  id: number;
  name: string;
  price: number;
  station: "COCINA" | "BAR";
  category: string;
};
export type OrderStatus = "NUEVO" | "PREPARANDO" | "LISTO" | "ENTREGADO" | "PENDIENTE_PAGO" | "PAGADO";
export type StationStatus = "PENDIENTE" | "PREPARANDO" | "LISTO" | "ENTREGADO";
export type Order = {
  id: number;
  table: number;
  createdAt: string;
  status: OrderStatus;
  items: Array<MenuItem & { quantity: number }>;
  total: number;
  paymentStatus: "PENDIENTE" | "PAGADO";
  stationStatus: Record<"COCINA" | "BAR", StationStatus | "NO_APLICA">;
  note?: string;
};
