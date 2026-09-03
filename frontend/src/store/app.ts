import { create } from "zustand";
import { branches as demoBranches, demoOrders, tables as initialTables } from "../data/demo";
import type { Branch, Order, OrderLineStatus, Session, Table } from "../types";
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
    const session = { ...value, createdAt: value.createdAt ?? new Date().toISOString() } as Session;
    if (session.demo) {
      session.user.permisos = [...new Set([...session.user.permisos, "USUARIOS_VER", "USUARIOS_CREAR", "USUARIOS_EDITAR", "CONFIGURACION_GESTIONAR"])];
      session.user.capacidades = [...new Set([...session.user.capacidades, "ANALYTICS"])];
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    return session;
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
  appendOrderLines: (orderId: number, lines: Order["items"]) => void;
  requestAccount: (orderId: number, note?: string) => void;
  advanceStation: (id: number, station: "COCINA" | "BAR") => void;
  markKitchenSeen: (id: number, station: "COCINA" | "BAR") => void;
  setOrderLineStatus: (id: number, lineIndex: number, status: OrderLineStatus) => void;
  setOrderPriority: (id: number, priority: "NORMAL" | "ALTA" | "URGENTE") => void;
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
  orders: initialSession?.demo ? demoOrders : [],
  online: navigator.onLine,
  serviceAvailable: true,
  pendingCount: 0,
  setSession: (session) => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
    set({ session, branchId: session?.user.sucursalId ?? (session?.demo ? 1 : null), branches: session?.demo ? demoBranches : [], orders: session?.demo ? demoOrders : [] });
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
  createOrder: (order) => set((state) => { const now = new Date().toISOString(); const created = { ...order, operational: order.operational ?? { stage: "ENVIADO_ESTACION" as const, stageStartedAt: now, sentAt: now } }; return { orders: [...state.orders, created], tables: state.tables.map((table) => table.number === order.table ? { ...table, state: "OCUPADA", orderId: order.id } : table) }; }),
  appendOrderLines: (orderId, lines) => set((state) => ({
    orders: state.orders.map((order) => order.id === orderId ? {
      ...order,
      items: [...order.items, ...lines.map((line) => ({ ...line, sent: true, lineStatus: "ENVIADA" as const }))],
      total: order.total + lines.reduce((sum, line) => sum + (line.price + (line.selectedModifiers ?? []).reduce((acc, modifier) => acc + modifier.price, 0)) * line.quantity, 0),
      status: "NUEVO",
      stationStatus: {
        COCINA: lines.some((line) => line.station === "COCINA") ? "PENDIENTE" : order.stationStatus.COCINA,
        BAR: lines.some((line) => line.station === "BAR") ? "PENDIENTE" : order.stationStatus.BAR,
      },
      accountRequested: false,
      accountRequestNote: undefined,
      operational: { ...(order.operational ?? { stage: "ENVIADO_ESTACION" as const, stageStartedAt: new Date().toISOString() }), stage: "ENVIADO_ESTACION" as const, stageStartedAt: new Date().toISOString(), sentAt: new Date().toISOString() },
    } : order),
    tables: state.tables.map((table) => table.orderId === orderId ? { ...table, state: "OCUPADA" } : table),
  })),
  requestAccount: (orderId, note) => set((state) => ({
    orders: state.orders.map((order) => order.id === orderId ? { ...order, accountRequested: true, accountRequestNote: note, status: "PENDIENTE_PAGO", operational: { ...(order.operational ?? { stage: "CUENTA_SOLICITADA" as const, stageStartedAt: new Date().toISOString() }), stage: "CUENTA_SOLICITADA" as const, stageStartedAt: new Date().toISOString(), accountRequestedAt: new Date().toISOString() } } : order),
    tables: state.tables.map((table) => table.orderId === orderId ? { ...table, state: "PENDIENTE_PAGO" } : table),
  })),
  advanceStation: (id, station) => set((state) => ({ orders: state.orders.map((order) => {
    if (order.id !== id || order.stationStatus[station] === "NO_APLICA") return order;
    const current = order.stationStatus[station];
    const next = current === "PENDIENTE" ? "PREPARANDO" : current === "PREPARANDO" ? "LISTO" : "ENTREGADO";
    const stationStatus = { ...order.stationStatus, [station]: next };
    const now = new Date().toISOString();
    const activeStatuses = Object.values(stationStatus).filter((value) => value !== "NO_APLICA");
    const stage = activeStatuses.every((value) => value === "ENTREGADO") ? "RETIRADO_ESPERANDO_ENTREGA" as const : activeStatuses.some((value) => value === "LISTO") ? "LISTO_ESPERANDO_RETIRO" as const : "EN_PREPARACION" as const;
    const operational = { ...(order.operational ?? { stage, stageStartedAt: now }), stage, stageStartedAt: now, station, ...(next === "PREPARANDO" ? { preparationStartedAt: order.operational?.preparationStartedAt ?? now } : {}), ...(next === "LISTO" ? { readyAt: now } : {}), ...(stage === "RETIRADO_ESPERANDO_ENTREGA" ? { retiredAt: now } : {}) };
    const lineStatus: OrderLineStatus = next === "PREPARANDO" ? "PREPARANDO" : next === "LISTO" ? "LISTA" : "ENTREGADA";
    const items = order.items.map((item) => item.station === station ? { ...item, lineStatus } : item);
    const active = Object.values(stationStatus).filter((value) => value !== "NO_APLICA");
    const status = active.every((value) => value === "ENTREGADO") ? "ENTREGADO" : active.every((value) => value === "LISTO" || value === "ENTREGADO") ? "LISTO" : active.some((value) => value === "PREPARANDO" || value === "LISTO") ? "PREPARANDO" : "NUEVO";
    return { ...order, items, stationStatus, status, operational };
  }) })),
  markKitchenSeen: (id, station) => set((state) => ({
    orders: state.orders.map((order) => order.id === id ? { ...order, kitchenSeen: { ...order.kitchenSeen, [station]: true } } : order),
  })),
  setOrderLineStatus: (id, lineIndex, lineStatus) => set((state) => ({ orders: state.orders.map((order) => {
    if (order.id !== id || !order.items[lineIndex]) return order;
    const station = order.items[lineIndex].station;
    const items = order.items.map((item, index) => index === lineIndex ? { ...item, lineStatus } : item);
    const stationLines = items.filter((item) => item.station === station);
    const nextStation = stationLines.every((item) => item.lineStatus === "LISTA" || item.lineStatus === "ENTREGADA")
      ? "LISTO"
      : stationLines.some((item) => item.lineStatus === "PREPARANDO" || item.lineStatus === "LISTA")
        ? "PREPARANDO"
        : "PENDIENTE";
    const stationStatus = { ...order.stationStatus, [station]: nextStation };
    const active = Object.values(stationStatus).filter((value) => value !== "NO_APLICA");
    const status = active.every((value) => value === "ENTREGADO") ? "ENTREGADO" : active.every((value) => value === "LISTO" || value === "ENTREGADO") ? "LISTO" : active.some((value) => value === "PREPARANDO" || value === "LISTO") ? "PREPARANDO" : "NUEVO";
    return { ...order, items, stationStatus, status };
  }) })),
  setOrderPriority: (id, priority) => set((state) => ({ orders: state.orders.map((order) => order.id === id ? { ...order, priority } : order) })),
  markDelivered: (id) => set((state) => ({ orders: state.orders.map((order) => order.id === id ? { ...order, status: "PENDIENTE_PAGO", stationStatus: { COCINA: order.stationStatus.COCINA === "NO_APLICA" ? "NO_APLICA" : "ENTREGADO", BAR: order.stationStatus.BAR === "NO_APLICA" ? "NO_APLICA" : "ENTREGADO" }, operational: { ...(order.operational ?? { stage: "ENTREGADO_ESPERANDO_CUENTA" as const, stageStartedAt: new Date().toISOString() }), stage: "ENTREGADO_ESPERANDO_CUENTA" as const, stageStartedAt: new Date().toISOString(), deliveredAt: new Date().toISOString() } } : order), tables: state.tables.map((table) => table.orderId === id ? { ...table, state: "PENDIENTE_PAGO" } : table) })),
  markPaid: (id) => set((state) => ({ orders: state.orders.map((order) => order.id === id ? { ...order, status: "PAGADO", paymentStatus: "PAGADO", operational: { ...(order.operational ?? { stage: "PAGADO" as const, stageStartedAt: new Date().toISOString() }), stage: "PAGADO" as const, stageStartedAt: new Date().toISOString(), paidAt: new Date().toISOString() } } : order) })),
  releaseTable: (tableId) => set((state) => ({ tables: state.tables.map((table) => table.id === tableId ? { ...table, state: "LIBRE", orderId: undefined } : table) })),
  occupyWithoutOrder: (tableId) => set((state) => ({ tables: state.tables.map((table) => table.id === tableId ? { ...table, state: "OCUPADA" } : table) })),
}));
