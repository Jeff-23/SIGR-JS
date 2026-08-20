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
}));
