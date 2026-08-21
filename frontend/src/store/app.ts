import { create } from "zustand";
import type { Order, Session, Table } from "../types";
import { tables as initialTables } from "../data/demo";

type State = {
  session: Session | null;
  branchId: number;
  tables: Table[];
  orders: Order[];
  online: boolean;
  pendingCount: number;
  setSession: (session: Session | null) => void;
  setBranch: (id: number) => void;
  setOnline: (online: boolean) => void;
  setPendingCount: (count: number) => void;
  createOrder: (order: Order) => void;
  advanceOrder: (id: number) => void;
  advanceStation: (id: number, station: "COCINA" | "BAR") => void;
  markDelivered: (id: number) => void;
  markPaid: (id: number) => void;
  releaseTable: (tableId: number) => void;
  occupyWithoutOrder: (tableId: number) => void;
};
const saved = sessionStorage.getItem("sigr-session");
export const useApp = create<State>((set) => ({
  session: saved ? JSON.parse(saved) : null,
  branchId: 1,
  tables: initialTables,
  orders: [],
  online: navigator.onLine,
  pendingCount: 0,
  setSession: (session) => {
    if (session)
      sessionStorage.setItem("sigr-session", JSON.stringify(session));
    else sessionStorage.removeItem("sigr-session");
    set({ session });
  },
  setBranch: (branchId) => set({ branchId }),
  setOnline: (online) => set({ online }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  createOrder: (order) =>
    set((state) => ({
      orders: [...state.orders, order],
      tables: state.tables.map((table) =>
        table.number === order.table
          ? { ...table, state: "OCUPADA", orderId: order.id }
          : table,
      ),
    })),
  advanceOrder: (id) =>
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === id
          ? {
              ...order,
              status:
                order.status === "NUEVO"
                  ? "PREPARANDO"
                  : order.status === "PREPARANDO"
                    ? "LISTO"
                    : "ENTREGADO",
            }
          : order,
      ),
    })),
  advanceStation: (id, station) => set((state) => ({
    orders: state.orders.map((order) => {
      if (order.id !== id || order.stationStatus[station] === "NO_APLICA") return order;
      const current = order.stationStatus[station];
      const next = current === "PENDIENTE" ? "PREPARANDO" : current === "PREPARANDO" ? "LISTO" : "ENTREGADO";
      const stationStatus = { ...order.stationStatus, [station]: next };
      const active = Object.values(stationStatus).filter((value) => value !== "NO_APLICA");
      const status = active.every((value) => value === "ENTREGADO") ? "ENTREGADO" : active.every((value) => value === "LISTO" || value === "ENTREGADO") ? "LISTO" : active.some((value) => value === "PREPARANDO" || value === "LISTO") ? "PREPARANDO" : "NUEVO";
      return { ...order, stationStatus, status };
    }),
  })),
  markDelivered: (id) => set((state) => ({
    orders: state.orders.map((order) => order.id === id ? { ...order, status: "PENDIENTE_PAGO", stationStatus: { COCINA: order.stationStatus.COCINA === "NO_APLICA" ? "NO_APLICA" : "ENTREGADO", BAR: order.stationStatus.BAR === "NO_APLICA" ? "NO_APLICA" : "ENTREGADO" } } : order),
    tables: state.tables.map((table) => table.orderId === id ? { ...table, state: "PENDIENTE_PAGO" } : table),
  })),
  markPaid: (id) => set((state) => ({ orders: state.orders.map((order) => order.id === id ? { ...order, status: "PAGADO", paymentStatus: "PAGADO" } : order) })),
  releaseTable: (tableId) => set((state) => ({
    tables: state.tables.map((table) => table.id === tableId ? { ...table, state: "LIBRE", orderId: undefined } : table),
  })),
  occupyWithoutOrder: (tableId) => set((state) => ({ tables: state.tables.map((table) => table.id === tableId ? { ...table, state: "OCUPADA" } : table) })),
}));
