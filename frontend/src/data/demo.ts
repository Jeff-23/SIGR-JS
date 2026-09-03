import type { Branch, MenuItem, Order, Table } from "../types";

export const branches: Branch[] = [
  { id: 1, name: "La Carolina", location: "Sincelejo · principal" },
  { id: 2, name: "La Castellana", location: "Sincelejo · norte" },
  { id: 3, name: "El Recreo", location: "Sincelejo · centro" },
];

const now = Date.now();
export const tables: Table[] = Array.from({ length: 15 }, (_, index) => ({
  id: index + 1,
  number: index + 1,
  seats: index % 3 === 0 ? 6 : 4,
  zone: index < 8 ? "Salón" : "Terraza",
  state:
    index === 0 || index === 5
      ? "PENDIENTE_PAGO"
      : index === 2 || index === 8
        ? "OCUPADA"
        : "LIBRE",
  orderId: index === 0 ? 4101 : index === 2 ? 4103 : index === 5 ? 4106 : index === 8 ? 4109 : undefined,
}));

export const menu: MenuItem[] = [
  { id: 1, name: "Almuerzo ejecutivo", price: 18000, station: "COCINA", category: "Almuerzos", favorite: true, available: true, modifiers: [{ id: 101, name: "Sin ensalada", price: 0 }, { id: 102, name: "Proteína adicional", price: 7000 }] },
  { id: 2, name: "Pechuga a la plancha", price: 24000, station: "COCINA", category: "Almuerzos", favorite: true, available: true, modifiers: [{ id: 201, name: "Queso adicional", price: 3500 }, { id: 202, name: "Sin salsas", price: 0 }] },
  { id: 3, name: "Hamburguesa El Mono", price: 22000, station: "COCINA", category: "Rápidas", favorite: true, available: true, modifiers: [{ id: 301, name: "Tocineta", price: 4500 }, { id: 302, name: "Queso extra", price: 3500 }, { id: 303, name: "Sin cebolla", price: 0 }] },
  { id: 4, name: "Perro especial", price: 16000, station: "COCINA", category: "Rápidas", available: true, modifiers: [{ id: 401, name: "Queso extra", price: 3000 }] },
  { id: 5, name: "Papas de la casa", price: 9000, station: "COCINA", category: "Rápidas", available: true },
  { id: 6, name: "Limonada de coco", price: 8000, station: "BAR", category: "Bebidas", favorite: true, available: true, modifiers: [{ id: 601, name: "Sin azúcar", price: 0 }] },
  { id: 7, name: "Jugo natural", price: 6500, station: "BAR", category: "Bebidas", available: true },
  { id: 8, name: "Gaseosa", price: 4500, station: "BAR", category: "Bebidas", available: true },
];

const item = (id: number, quantity: number, lineStatus: "ENVIADA" | "PREPARANDO" | "LISTA" | "ENTREGADA" = "ENVIADA") => ({
  ...menu.find((product) => product.id === id)!, quantity, sent: true, lineStatus,
});
export const demoOrders: Order[] = [
  {
    id: 4101, table: 1, createdAt: new Date(now - 34 * 60_000).toISOString(), status: "PENDIENTE_PAGO",
    items: [item(1, 2, "ENTREGADA"), item(6, 2, "ENTREGADA"), item(8, 2, "ENTREGADA")], total: 61000, paymentStatus: "PENDIENTE",
    stationStatus: { COCINA: "ENTREGADO", BAR: "ENTREGADO" }, waiter: "Juan", guests: 6,
    accountRequested: true, accountRequestNote: "Cliente pidió pago mixto",
    note: "Mesa cerca de ventana",
    operational: { stage: "CUENTA_SOLICITADA", stageStartedAt: new Date(now - 6 * 60_000).toISOString(), sentAt: new Date(now - 33 * 60_000).toISOString(), preparationStartedAt: new Date(now - 31 * 60_000).toISOString(), readyAt: new Date(now - 17 * 60_000).toISOString(), retiredAt: new Date(now - 12 * 60_000).toISOString(), deliveredAt: new Date(now - 10 * 60_000).toISOString(), accountRequestedAt: new Date(now - 6 * 60_000).toISOString() },
  },
  {
    id: 4103, table: 3, createdAt: new Date(now - 34 * 60_000).toISOString(), status: "LISTO",
    items: [item(2, 2, "LISTA"), item(5, 1, "LISTA"), item(6, 1, "PREPARANDO"), item(8, 1, "PREPARANDO")], total: 69500, paymentStatus: "PENDIENTE",
    stationStatus: { COCINA: "LISTO", BAR: "PREPARANDO" }, waiter: "Juan", guests: 4,
    serviceAlert: "Bebida esperando 9 min",
    operational: { stage: "LISTO_ESPERANDO_RETIRO", stageStartedAt: new Date(now - 9 * 60_000).toISOString(), station: "COCINA", sentAt: new Date(now - 33 * 60_000).toISOString(), preparationStartedAt: new Date(now - 31 * 60_000).toISOString(), readyAt: new Date(now - 9 * 60_000).toISOString() },
  },
  {
    id: 4106, table: 6, createdAt: new Date(now - 51 * 60_000).toISOString(), status: "PENDIENTE_PAGO",
    items: [item(3, 2, "ENTREGADA"), item(5, 1, "ENTREGADA"), item(8, 3, "ENTREGADA")], total: 66500, paymentStatus: "PENDIENTE",
    stationStatus: { COCINA: "ENTREGADO", BAR: "ENTREGADO" }, waiter: "Laura", guests: 4,
    operational: { stage: "ENTREGADO_ESPERANDO_CUENTA", stageStartedAt: new Date(now - 4 * 60_000).toISOString(), sentAt: new Date(now - 50 * 60_000).toISOString(), preparationStartedAt: new Date(now - 48 * 60_000).toISOString(), readyAt: new Date(now - 33 * 60_000).toISOString(), retiredAt: new Date(now - 28 * 60_000).toISOString(), deliveredAt: new Date(now - 4 * 60_000).toISOString() },
  },
  {
    id: 4109, table: 9, createdAt: new Date(now - 18 * 60_000).toISOString(), status: "PREPARANDO",
    items: [{ ...item(3, 1, "PREPARANDO"), note: "Sin cebolla" }, item(4, 1, "PREPARANDO"), item(7, 2, "LISTA")], total: 51000, paymentStatus: "PENDIENTE",
    stationStatus: { COCINA: "PREPARANDO", BAR: "LISTO" }, waiter: "Carlos", guests: 4,
    serviceAlert: "Bebidas listas para retirar",
    operational: { stage: "EN_PREPARACION", stageStartedAt: new Date(now - 18 * 60_000).toISOString(), station: "COCINA", sentAt: new Date(now - 18 * 60_000).toISOString(), preparationStartedAt: new Date(now - 18 * 60_000).toISOString() },
  },
];

export const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
