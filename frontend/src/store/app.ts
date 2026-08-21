import { create } from "zustand";
import { branches as demoBranches, tables as initialTables } from "../data/demo";
import type { Branch, Order, Session, Table } from "../types";
import { hasCapability, hasPermission } from "../lib/access";

const SESSION_KEY = "sigr-session";

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Session>;
    if (!value.token || !value.user?.id || !Array.isArray(value.user.permisos) || !Array.isArray(value.user.capacidades)) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { ...value, createdAt: value.createdAt ?? new Date().toISOString() } as Session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

type State = {
  session: Session | null;
  branchId: number | null;
  branches: Branch[];
  branchesLoading: boolean;
  tables: Table[];
  orders: Order[];
  online: boolean;
  serviceAvailable: boolean;
  pendingCount: number;
  setSession: (session: Session | null) => void;
  logout: () => void;
  setBranch: (id: number) => void;
  setBranches: (branches: Branch[]) => void;
  setBranchesLoading: (loading: boolean) => void;
  setOnline: (online: boolean) => void;
  setServiceAvailable: (available: boolean) => void;
  setPendingCount: (count: number) => void;
  hasPermission: (permission?: string | null) => boolean;
  hasCapability: (capability?: string | null) => boolean;
  createOrder: (order: Order) => void;
  advanceStation: (id: number, station: "COCINA" | "BAR") => void;
  markDelivered: (id: number) => void;
  markPaid: (id: number) => void;
  releaseTable: (tableId: number) => void;
  occupyWithoutOrder: (tableId: number) => void;
};

const initialSession = readSession();
export const useApp = create<State>((set, get) => ({
  session: initialSession,
  branchId: initialSession?.user.sucursalId ?? (initialSession?.demo ? 1 : null),
  branches: initialSession?.demo ? demoBranches : [],
  branchesLoading: false,
  tables: initialTables,
  orders: [],
  online: navigator.onLine,
  serviceAvailable: true,
  pendingCount: 0,
  setSession: (session) => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
    set({ session, branchId: session?.user.sucursalId ?? (session?.demo ? 1 : null), branches: session?.demo ? demoBranches : [] });
  },
  logout: () => { sessionStorage.removeItem(SESSION_KEY); set({ session: null, branchId: null, branches: [], orders: [] }); },
  setBranch: (branchId) => set({ branchId }),
  setBranches: (branches) => set((state) => ({ branches, branchId: state.branchId && branches.some((branch) => branch.id === state.branchId) ? state.branchId : branches[0]?.id ?? state.session?.user.sucursalId ?? null })),
  setBranchesLoading: (branchesLoading) => set({ branchesLoading }),
  setOnline: (online) => set({ online }),
  setServiceAvailable: (serviceAvailable) => set({ serviceAvailable }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  hasPermission: (permission) => hasPermission(get().session?.user, permission),
  hasCapability: (capability) => hasCapability(get().session?.user, capability),
  createOrder: (order) => set((state) => ({ orders: [...state.orders, order], tables: state.tables.map((table) => table.number === order.table ? { ...table, state: "OCUPADA", orderId: order.id } : table) })),
  advanceStation: (id, station) => set((state) => ({ orders: state.orders.map((order) => {
    if (order.id !== id || order.stationStatus[station] === "NO_APLICA") return order;
    const current = order.stationStatus[station];
    const next = current === "PENDIENTE" ? "PREPARANDO" : current === "PREPARANDO" ? "LISTO" : "ENTREGADO";
    const stationStatus = { ...order.stationStatus, [station]: next };
    const active = Object.values(stationStatus).filter((value) => value !== "NO_APLICA");
    const status = active.every((value) => value === "ENTREGADO") ? "ENTREGADO" : active.every((value) => value === "LISTO" || value === "ENTREGADO") ? "LISTO" : active.some((value) => value === "PREPARANDO" || value === "LISTO") ? "PREPARANDO" : "NUEVO";
    return { ...order, stationStatus, status };
  }) })),
  markDelivered: (id) => set((state) => ({ orders: state.orders.map((order) => order.id === id ? { ...order, status: "PENDIENTE_PAGO", stationStatus: { COCINA: order.stationStatus.COCINA === "NO_APLICA" ? "NO_APLICA" : "ENTREGADO", BAR: order.stationStatus.BAR === "NO_APLICA" ? "NO_APLICA" : "ENTREGADO" } } : order), tables: state.tables.map((table) => table.orderId === id ? { ...table, state: "PENDIENTE_PAGO" } : table) })),
  markPaid: (id) => set((state) => ({ orders: state.orders.map((order) => order.id === id ? { ...order, status: "PAGADO", paymentStatus: "PAGADO" } : order) })),
  releaseTable: (tableId) => set((state) => ({ tables: state.tables.map((table) => table.id === tableId ? { ...table, state: "LIBRE", orderId: undefined } : table) })),
  occupyWithoutOrder: (tableId) => set((state) => ({ tables: state.tables.map((table) => table.id === tableId ? { ...table, state: "OCUPADA" } : table) })),
}));
