import type { Branch, MenuItem, Table } from "../types";

export const branches: Branch[] = [
  { id: 1, name: "La Carolina", location: "Sincelejo · principal" },
  { id: 2, name: "La Castellana", location: "Sincelejo · norte" },
  { id: 3, name: "El Recreo", location: "Sincelejo · centro" },
];
export const tables: Table[] = Array.from({ length: 15 }, (_, index) => ({
  id: index + 1,
  number: index + 1,
  seats: index % 3 === 0 ? 6 : 4,
  zone: index < 8 ? "Salón" : "Terraza",
  state:
    index === 2 || index === 8
      ? "OCUPADA"
      : index === 5
        ? "PENDIENTE_PAGO"
        : "LIBRE",
}));
export const menu: MenuItem[] = [
  {
    id: 1,
    name: "Almuerzo ejecutivo",
    price: 18000,
    station: "COCINA",
    category: "Almuerzos",
  },
  {
    id: 2,
    name: "Pechuga a la plancha",
    price: 24000,
    station: "COCINA",
    category: "Almuerzos",
  },
  {
    id: 3,
    name: "Hamburguesa El Mono",
    price: 22000,
    station: "COCINA",
    category: "Rápidas",
  },
  {
    id: 4,
    name: "Perro especial",
    price: 16000,
    station: "COCINA",
    category: "Rápidas",
  },
  {
    id: 5,
    name: "Papas de la casa",
    price: 9000,
    station: "COCINA",
    category: "Rápidas",
  },
  {
    id: 6,
    name: "Limonada de coco",
    price: 8000,
    station: "BAR",
    category: "Bebidas",
  },
  {
    id: 7,
    name: "Jugo natural",
    price: 6500,
    station: "BAR",
    category: "Bebidas",
  },
  { id: 8, name: "Gaseosa", price: 4500, station: "BAR", category: "Bebidas" },
];
export const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
