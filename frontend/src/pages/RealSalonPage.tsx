import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Heart,
  ImageIcon,
  Merge,
  Minus,
  MoveRight,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Scissors,
  Search,
  Send,
  ShoppingBag,
  Split,
  Unlock,
  UserRound,
  Users,
  Utensils,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PrintableDocumentModal } from "../components/PrintableDocumentModal";
import { Modal } from "../components/Modal";
import { SalonExperiencePanel } from "../features/salon/SalonExperiencePanel";
import { filterCatalogProducts, paginateCatalogProducts } from "../features/salon/catalog";
import {
  activeOrder,
  canRequestBill,
  cartTotal,
  lineUnitPrice,
  occupiedMinutes,
  pendingCommandDetails,
  stationSummary,
  suggestedAction,
  type ApiOrder,
  type ApiProduct,
  type ApiTable,
  type CartLine,
  type OrderDetail,
  type OrderType,
} from "../features/salon/contracts";
import { api, apiFailure, errorMessage, mutation } from "../lib/api";
import { productImageUrl } from "../lib/product-media";
import {
  listLocalPrinters,
  printAgentHealth,
  printWithLocalAgent,
  readDocumentPrinterSelection,
  saveDocumentPrinterSelection,
  type LocalPrinter,
} from "../lib/print-agent";
import { useApp } from "../store/app";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});


function orderPreparationStarted(order: ApiOrder) {
  const commandStarted = (order.comandas ?? []).some((command) => {
    if (["EN_PREPARACION", "LISTA", "ENTREGADA"].includes(command.estado)) return true;
    return (command.detalles ?? []).some((detail) =>
      ["EN_PREPARACION", "LISTA", "ENTREGADA"].includes(detail.estado ?? ""),
    );
  });
  if (commandStarted) return true;

  // El detalle del pedido es la fuente que usa Salón para reflejar el avance
  // parcial por línea. Algunas respuestas no incluyen order.comandas completo,
  // pero sí detalle.comandas; la cancelación debe respetar ese mismo estado.
  return (order.detalles ?? []).some((detail) =>
    (detail.comandas ?? []).some((item) =>
      item.comanda?.estado !== "CANCELADA" &&
      ["EN_PREPARACION", "LISTA", "ENTREGADA"].includes(item.estado ?? ""),
    ),
  );
}

function readPosImagePreference() {
  try {
    return window.localStorage.getItem("sigr:pos-product-images") !== "0";
  } catch {
    return true;
  }
}

function writePosImagePreference(enabled: boolean) {
  try {
    window.localStorage.setItem("sigr:pos-product-images", enabled ? "1" : "0");
  } catch {
    // La preferencia es opcional; la operación no debe depender de localStorage.
  }
}
const typeLabels: Record<OrderType, string> = {
  MESA: "Mesa",
  MOSTRADOR: "Mostrador",
  PARA_LLEVAR: "Para llevar",
  DOMICILIO: "Domicilio",
};
type Draft = {
  type: OrderType;
  table: ApiTable | null;
  existing: ApiOrder | null;
};
type User = { id: number; nombres: string; apellidos: string; activo: boolean };
type Delivery = {
  destinatario: string;
  telefono: string;
  direccion: string;
  referencias: string;
  costo: string;
};
type QuickAction =
  | "transfer"
  | "merge"
  | "separate"
  | "waiter"
  | "split"
  | null;
type TableForm = {
  id?: number;
  numero: string;
  capacidad: string;
  zonaId: string;
  forma: "REDONDA" | "CUADRADA" | "RECTANGULAR";
  orientacion: "HORIZONTAL" | "VERTICAL";
  tamanoVisual: string;
};
const emptyTableForm: TableForm = {
  numero: "",
  capacidad: "4",
  zonaId: "",
  forma: "CUADRADA",
  orientacion: "HORIZONTAL",
  tamanoVisual: "2",
};

function TableSilhouette({ table, order }: { table: ApiTable; order?: ApiOrder }) {
  const forma = table.forma ?? "CUADRADA";
  const orientacion = table.orientacion ?? "HORIZONTAL";
  const capacity = Math.max(1, Math.min(10, table.capacidad));
  const ready = order ? stationSummary(order).reduce((sum, station) => sum + station.ready, 0) : 0;
  const total = order ? stationSummary(order).reduce((sum, station) => sum + station.total, 0) : 0;
  // La preparación nunca debe cambiar la condición comercial de la mesa.
  // Mientras exista un consumo activo sin pagar, la mesa se representa ocupada.
  const state = order
    ? table.situacion === "PENDIENTE_PAGO" || order.venta?.estado === "PENDIENTE_PAGO"
      ? "PENDIENTE_PAGO"
      : order.venta?.estado === "PAGADA"
        ? table.situacion
        : "OCUPADA"
    : table.situacion;
  const preparationState = total > 0 && ready === total ? "LISTA" : ready > 0 ? "PARCIAL" : "PENDIENTE";
  const visualSize = Math.max(1, Math.min(3, table.tamanoVisual ?? 2));
  const palette: Record<string, { fill: string; stroke: string; chair: string }> = {
    LIBRE: { fill: "#ecfdf5", stroke: "#10b981", chair: "#a7f3d0" },
    OCUPADA: { fill: "#fff7ed", stroke: "#f97316", chair: "#fed7aa" },
    PARCIAL: { fill: "#fffbeb", stroke: "#f59e0b", chair: "#fde68a" },
    LISTA: { fill: "#ecfdf5", stroke: "#059669", chair: "#6ee7b7" },
    RESERVADA: { fill: "#eff6ff", stroke: "#3b82f6", chair: "#bfdbfe" },
    PENDIENTE_PAGO: { fill: "#fef2f2", stroke: "#ef4444", chair: "#fecaca" },
    FUERA_SERVICIO: { fill: "#f3f4f6", stroke: "#6b7280", chair: "#d1d5db" },
  };
  const colors = palette[state] ?? palette.LIBRE;
  const horizontal = forma !== "RECTANGULAR" || orientacion === "HORIZONTAL";
  const tableBox = forma === "REDONDA"
    ? { x: 55, y: 25, w: 70, h: 70, rx: 35 }
    : forma === "RECTANGULAR" && horizontal
      ? { x: 38, y: 31, w: 104, h: 58, rx: 16 }
      : forma === "RECTANGULAR"
        ? { x: 58, y: 16, w: 64, h: 88, rx: 16 }
        : { x: 50, y: 25, w: 80, h: 70, rx: 14 };
  const chairs: Array<{ x: number; y: number; rotate?: number }> = [];
  const topCount = Math.ceil(capacity / 4);
  const addRow = (count: number, y: number, startX: number, endX: number) => {
    for (let i = 0; i < count; i++) chairs.push({ x: count === 1 ? (startX + endX) / 2 : startX + ((endX - startX) * i) / (count - 1), y });
  };
  addRow(Math.min(topCount, capacity), 12, tableBox.x + 10, tableBox.x + tableBox.w - 10);
  const remainingAfterTop = capacity - Math.min(topCount, capacity);
  const bottomCount = Math.min(topCount, remainingAfterTop);
  addRow(bottomCount, 108, tableBox.x + 10, tableBox.x + tableBox.w - 10);
  const remaining = remainingAfterTop - bottomCount;
  const leftCount = Math.ceil(remaining / 2);
  const rightCount = remaining - leftCount;
  for (let i = 0; i < leftCount; i++) chairs.push({ x: 20, y: 45 + i * 26, rotate: 90 });
  for (let i = 0; i < rightCount; i++) chairs.push({ x: 160, y: 45 + i * 26, rotate: 90 });
  return (
    <svg
      viewBox="0 0 180 120"
      className="h-auto w-full"
      style={{ maxWidth: `${180 + (visualSize - 1) * 34}px` }}
      aria-label={`Mesa ${table.numero}, ${forma.toLowerCase()}, ${table.capacidad} puestos`}
    >
      <defs>
        <filter id={`shadow-${table.id}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity="0.16" />
        </filter>
      </defs>
      {chairs.slice(0, capacity).map((chair, index) => (
        <rect key={index} x={chair.x - 9} y={chair.y - 6} width="18" height="12" rx="4" fill={colors.chair} stroke={colors.stroke} strokeWidth="1.5" transform={chair.rotate ? `rotate(${chair.rotate} ${chair.x} ${chair.y})` : undefined} />
      ))}
      <rect x={tableBox.x} y={tableBox.y} width={tableBox.w} height={tableBox.h} rx={tableBox.rx} fill={colors.fill} stroke={colors.stroke} strokeWidth="3" filter={`url(#shadow-${table.id})`} />
      <rect x={tableBox.x + 6} y={tableBox.y + 5} width={Math.max(0, tableBox.w - 12)} height={5} rx="3" fill="white" opacity="0.65" />
      <text x="90" y="59" textAnchor="middle" fontSize="14.5" fontWeight="900" fill="#10252d">Mesa {table.numero}</text>
      <text x="90" y="77" textAnchor="middle" fontSize="10" fontWeight="800" fill="#52666d">{table.capacidad} puestos</text>
      {preparationState !== "PENDIENTE" && (
        <g>
          <circle cx="140" cy="27" r="8" fill={preparationState === "LISTA" ? "#10b981" : "#f59e0b"}>
            {preparationState === "LISTA" && <animate attributeName="r" values="7;9;7" dur="1.5s" repeatCount="indefinite" />}
          </circle>
          <path d="M136.5 27l2.2 2.2 4.5-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}


function sentQuantity(detail: OrderDetail) {
  return (detail.comandas ?? [])
    .filter((item) => item.comanda?.estado !== "CANCELADA")
    .reduce((sum, item) => sum + item.cantidad, 0);
}

export function RealSalonPage() {
  const { branchId, hasPermission, hasCapability } = useApp();
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ReturnType<typeof apiFailure> | null>(
    null,
  );
  const [zone, setZone] = useState<number | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState<number | "all" | "favorites">(
    "favorites",
  );
  const [search, setSearch] = useState("");
  const [showProductImages, setShowProductImages] = useState(readPosImagePreference);
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null);
  const deferredSearch = useDeferredValue(search);
  const [productLimit, setProductLimit] = useState(60);
  const cartPanelRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const [printDocument, setPrintDocument] = useState<{
    title: string;
    html: string;
    text: string;
    widthMm: 58 | 80;
    orderId: number;
  } | null>(null);
  const [printAgentOnline, setPrintAgentOnline] = useState(false);
  const [localPrinters, setLocalPrinters] = useState<LocalPrinter[]>([]);
  const [preaccountPrinter, setPreaccountPrinter] = useState("");
  const [splitParts, setSplitParts] = useState("2");
  const [contextPeople, setContextPeople] = useState("2");
  const [contextNotes, setContextNotes] = useState("");
  const [detailNotes, setDetailNotes] = useState<Record<number, string>>({});
  const [delivery, setDelivery] = useState<Delivery>({
    destinatario: "",
    telefono: "",
    direccion: "",
    referencias: "",
    costo: "",
  });
  const [prelinkedTableIds, setPrelinkedTableIds] = useState<number[]>([]);
  const [tableManagerOpen, setTableManagerOpen] = useState(false);
  const [managedTables, setManagedTables] = useState<ApiTable[]>([]);
  const [managedZones, setManagedZones] = useState<Array<{ id: number; nombre: string }>>([]);
  const [tableForm, setTableForm] = useState<TableForm>(emptyTableForm);
  const [tableManagerBusy, setTableManagerBusy] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!branchId) return;
      if (!quiet) setLoading(true);
      setFailure(null);
      try {
        const params = { sucursalId: branchId };
        const [tableResponse, productResponse, orderResponse, userResponse] =
          await Promise.all([
            api.get<ApiTable[]>("/mesas", { params }),
            api.get<ApiProduct[]>("/productos", { params }),
            api.get<ApiOrder[]>("/pedidos", { params }),
            hasPermission("USUARIOS_VER")
              ? api.get<User[]>("/usuarios")
              : Promise.resolve({ data: [] as User[] }),
          ]);
        setTables(tableResponse.data);
        setProducts(productResponse.data);
        setOrders(orderResponse.data.filter(activeOrder));
        setUsers(userResponse.data.filter((item) => item.activo));
      } catch (error) {
        setFailure(apiFailure(error));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [branchId, hasPermission],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(true), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setPreaccountPrinter(readDocumentPrinterSelection(branchId, "preaccount"));
      }
    });
    void Promise.all([
      printAgentHealth(controller.signal),
      listLocalPrinters(controller.signal),
    ])
      .then(([, printers]) => {
        setPrintAgentOnline(true);
        setLocalPrinters(printers);
      })
      .catch(() => {
        setPrintAgentOnline(false);
        setLocalPrinters([]);
      });
    return () => controller.abort();
  }, [branchId]);

  const selectPreaccountPrinter = (printerName: string) => {
    setPreaccountPrinter(printerName);
    if (branchId) {
      saveDocumentPrinterSelection(branchId, "preaccount", printerName);
    }
  };

  const zones = useMemo(
    () => [
      ...new Map(tables.map((table) => [table.zona.id, table.zona])).values(),
    ],
    [tables],
  );
  const categories = useMemo(
    () => [
      ...new Map(
        products.map((product) => [product.categoria.id, product.categoria]),
      ).values(),
    ],
    [products],
  );
  const visibleTables = tables.filter(
    (table) => zone === "all" || table.zona.id === zone,
  );
  const visibleProducts = useMemo(
    () => filterCatalogProducts(products, category, deferredSearch),
    [category, deferredSearch, products],
  );
  const renderedProducts = useMemo(
    () => paginateCatalogProducts(visibleProducts, productLimit),
    [productLimit, visibleProducts],
  );
  const tableById = new Map(tables.map((table) => [table.id, table] as const));

  const orderByTable = new Map(
    orders.flatMap((order) => {
      // Regla del salón: una mesa que el backend ya declara LIBRE no puede
      // conservar en pantalla un pedido histórico. Esto evita que pedidos
      // pagados/entregados sigan apareciendo por relaciones antiguas.
      // La trazabilidad del pedido no se elimina; únicamente deja de vincularse
      // a la representación operativa de la mesa libre.
      if (order.venta?.estado === "PAGADA") return [];

      const links = order.mesasVinculadas?.length
        ? order.mesasVinculadas.map((link) => [link.mesa.id, order] as const)
        : order.mesa
          ? [[order.mesa.id, order] as const]
          : [];

      return links.filter(([tableId]) => tableById.get(tableId)?.situacion !== "LIBRE");
    }),
  );

  const openNew = (type: OrderType, table: ApiTable | null = null) => {
    setCart([]);
    setCategory("favorites");
    setSearch("");
    setProductLimit(60);
    setContextPeople(String(Math.min(table?.capacidad ?? 2, 2)));
    setContextNotes("");
    setDetailNotes({});
    setQuickAction(null);
    setPrelinkedTableIds([]);
    setDraft({ type, table, existing: null });
  };
  const openExisting = async (summary: ApiOrder) => {
    try {
      const { data } = await api.get<ApiOrder>(`/pedidos/${summary.id}`);
      setCart([]);
      setCategory("favorites");
      setSearch("");
      setProductLimit(60);
      setContextPeople(String(data.personas ?? data.mesa?.capacidad ?? 2));
      setContextNotes(data.observaciones ?? "");
      setDetailNotes(
        Object.fromEntries(
          data.detalles.map((detail) => [
            detail.id,
            detail.observaciones ?? "",
          ]),
        ),
      );
      setQuickAction(null);
      setPrelinkedTableIds([]);
      setSplitParts(String(data.personas ?? 2));
      setDraft({ type: data.tipo, table: data.mesa, existing: data });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const refreshDraft = async () => {
    if (draft?.existing) await openExisting(draft.existing);
  };

  const add = (product: ApiProduct) => {
    if (product.disponible === false)
      return toast.error(`${product.nombre} está agotado`);
    setCart((current) => {
      const found = current.find(
        (line) =>
          line.product.id === product.id &&
          (line.modifierIds ?? []).length === 0,
      );
      return found
        ? current.map((line) =>
            line === found ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [...current, { product, quantity: 1, notes: "", modifierIds: [] }];
    });
  };
  const change = (index: number, delta: number) =>
    setCart((current) =>
      current
        .map((line, i) =>
          i === index ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  const setNotes = (index: number, notes: string) =>
    setCart((current) =>
      current.map((line, i) => (i === index ? { ...line, notes } : line)),
    );
  const toggleModifier = (index: number, modifierId: number) =>
    setCart((current) =>
      current.map((line, i) =>
        i !== index
          ? line
          : {
              ...line,
              modifierIds: (line.modifierIds ?? []).includes(modifierId)
                ? (line.modifierIds ?? []).filter((id) => id !== modifierId)
                : [...(line.modifierIds ?? []), modifierId],
            },
      ),
    );

  const persistDetailObservation = async (
    order: ApiOrder,
    detail: OrderDetail,
  ) => {
    if (sentQuantity(detail) > 0) return;
    const next = (detailNotes[detail.id] ?? detail.observaciones ?? "").trim();
    const current = (detail.observaciones ?? "").trim();
    if (next === current) return;
    await api.patch(`/pedidos/${order.id}/detalles/${detail.id}`, {
      cantidad: detail.cantidad,
      observaciones: next,
    });
    setDraft((value) =>
      value?.existing?.id === order.id
        ? {
            ...value,
            existing: {
              ...value.existing,
              detalles: value.existing.detalles.map((item) =>
                item.id === detail.id
                  ? { ...item, observaciones: next || null }
                  : item,
              ),
            },
          }
        : value,
    );
  };

  const flushDetailObservations = async (order: ApiOrder) => {
    for (const detail of order.detalles) {
      if (sentQuantity(detail) > 0) continue;
      const next = (
        detailNotes[detail.id] ??
        detail.observaciones ??
        ""
      ).trim();
      if (next !== (detail.observaciones ?? "").trim())
        await persistDetailObservation(order, detail);
    }
  };

  const sendPending = async (order: ApiOrder) => {
    if (!hasPermission("COMANDAS_ENVIAR") || !hasCapability("KDS")) return;
    // Persistir primero las observaciones todavía enfocadas evita que el click
    // en "Enviar nuevas" adelante a la petición disparada por onBlur.
    await flushDetailObservations(order);
    const details = pendingCommandDetails(order);
    if (details.length)
      await api.post(`/pedidos/${order.id}/comandas`, { detalles: details });
  };

  const submit = async () => {
    if (!draft || !branchId || !cart.length || saving) return;
    if (draft.type === "MESA" && !draft.table)
      return toast.error("Selecciona una mesa");
    if (
      draft.type === "DOMICILIO" &&
      (!delivery.destinatario.trim() ||
        !delivery.telefono.trim() ||
        !delivery.direccion.trim())
    )
      return toast.error("Completa destinatario, teléfono y dirección");
    setSaving(true);
    const details = cart.map((line) => ({
      productoId: line.product.id,
      cantidad: line.quantity,
      observaciones: line.notes.trim() || undefined,
      modificadorIds: line.modifierIds ?? [],
    }));
    try {
      if (draft.existing) {
        const previous = new Set(
          draft.existing.detalles.map((detail) => detail.id),
        );
        const { data: updated } = await api.post<ApiOrder>(
          `/pedidos/${draft.existing.id}/detalles`,
          { detalles: details },
        );
        await sendPending({
          ...updated,
          detalles: updated.detalles.filter(
            (detail) => !previous.has(detail.id),
          ),
        });
        toast.success("Líneas nuevas enviadas a preparación");
      } else {
        const body = {
          tipo: draft.type,
          sucursalId: branchId,
          mesaId: draft.table?.id,
          ...(draft.type === "MESA" && prelinkedTableIds.length
            ? { mesaIds: prelinkedTableIds }
            : {}),
          personas: Number(contextPeople) || undefined,
          observaciones: contextNotes.trim() || undefined,
          detalles: details,
          ...(draft.type === "DOMICILIO"
            ? { domicilio: { ...delivery, costo: Number(delivery.costo || 0) } }
            : {}),
        };
        const result = await mutation("POST", "/pedidos", body);
        if ("queued" in result)
          toast.success("Pedido guardado sin conexión; queda en cola");
        else {
          await sendPending(result.data as ApiOrder);
          toast.success("Pedido creado y enviado a preparación");
        }
      }
      setCart([]);
      setDraft(null);
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const run = async (
    action: () => Promise<unknown>,
    success: string,
    refresh = true,
  ) => {
    if (saving) return;
    setSaving(true);
    try {
      await action();
      toast.success(success);
      if (refresh) {
        await load(true);
        await refreshDraft();
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveContext = async (order: ApiOrder) =>
    run(
      () =>
        api.patch(`/pedidos/${order.id}/contexto`, {
          personas: Number(contextPeople),
          observaciones: contextNotes,
        }),
      "Datos de mesa actualizados",
    );
  const occupy = async (table: ApiTable) =>
    run(
      () =>
        api.patch(`/mesas/${table.id}/ocupar-sin-pedido`, {
          motivo: "Cliente ubicado sin pedido",
        }),
      `Mesa ${table.numero} ocupada sin consumo`,
    );
  const release = async (table: ApiTable) =>
    run(
      () =>
        api.patch(`/mesas/${table.id}/liberar-sin-consumo`, {
          motivo: "Cliente se retiró sin consumo",
        }),
      `Mesa ${table.numero} liberada`,
    );

  const markDelivered = async (order: ApiOrder) => {
    await run(
      () => api.patch(`/pedidos/${order.id}/entregado`),
      "Pedido entregado en mesa",
    );
  };

  const deliverDirect = async (commandIds: number[]) => {
    await run(
      async () => {
        for (const commandId of [...new Set(commandIds)]) {
          await api.patch(`/comandas/${commandId}/entrega-directa`);
        }
      },
      "Entrega directa confirmada",
    );
  };

  const previewPreaccount = async (order: ApiOrder) => {
    try {
      const { data } = await api.get<{
        contenido: string;
        contenidoTexto: string;
        anchoPapel: 58 | 80;
      }>(`/pedidos/${order.id}/precuenta`);
      setPrintDocument({
        title: `Precuenta · Pedido #${order.id}`,
        html: data.contenido,
        text: data.contenidoTexto,
        widthMm: data.anchoPapel,
        orderId: order.id,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const requestBill = async (order: ApiOrder) => {
    await run(async () => {
      if (!order.venta)
        await api.post(
          "/ventas/pedido-operativo",
          { pedidoId: order.id },
          { headers: { "Idempotency-Key": `venta-pedido-${order.id}` } },
        );
      await api.post(`/pedidos/${order.id}/solicitar-cuenta`);
    }, "Cuenta solicitada · mesa enviada a cobro");
  };
  const ensureSale = async (order: ApiOrder) => {
    if (order.venta?.id) return order.venta.id;
    const { data } = await api.post<{ id: number }>(
      "/ventas/pedido-operativo",
      { pedidoId: order.id },
      { headers: { "Idempotency-Key": `venta-pedido-${order.id}` } },
    );
    return data.id;
  };

  const splitBill = async (order: ApiOrder, requested: number) => {
    if (!Number.isInteger(requested) || requested < 2 || requested > 20)
      return toast.error("La cuenta debe dividirse entre 2 y 20 partes");
    try {
      const saleId = await ensureSale(order);
      const totalCents = Math.round(Number(order.total) * 100);
      const base = Math.floor(totalCents / requested);
      const parts = Array.from({ length: requested }, (_, index) => ({
        nombre: `Persona ${index + 1}`,
        total:
          (base +
            (index === requested - 1 ? totalCents - base * requested : 0)) /
          100,
      }));
      await run(
        () =>
          api.post(`/ventas/${saleId}/division-cuenta-operativa`, {
            modo: "PERSONAS",
            partes: parts,
          }),
        `Cuenta dividida en ${requested} partes`,
      );
      setQuickAction(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const transfer = async (order: ApiOrder, mesaDestinoId: number) => {
    await run(
      () => api.post(`/pedidos/${order.id}/mesas/trasladar`, { mesaDestinoId }),
      "Consumo trasladado",
    );
    setQuickAction(null);
  };
  const merge = async (order: ApiOrder, mesaId: number) => {
    await run(
      () => api.post(`/pedidos/${order.id}/mesas/unir`, { mesaIds: [mesaId] }),
      "Mesa unida al pedido",
    );
    setQuickAction(null);
  };
  const separate = async (order: ApiOrder, mesaId: number) => {
    await run(
      () => api.post(`/pedidos/${order.id}/mesas/separar`, { mesaId }),
      "Mesa separada",
    );
    setQuickAction(null);
  };
  const cancelOrder = async (order: ApiOrder) => {
    if (
      !window.confirm(
        `¿Cancelar el pedido #${order.id}? Esta acción liberará las mesas vinculadas y cancelará las comandas que aún no hayan iniciado preparación.`,
      )
    )
      return;
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/pedidos/${order.id}/cancelar`);
      toast.success("Pedido cancelado y mesa liberada");
      setDraft(null);
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const changeWaiter = async (order: ApiOrder, meseroId: number) => {
    await run(
      () => api.patch(`/pedidos/${order.id}/mesero`, { meseroId }),
      "Mesero actualizado",
    );
    setQuickAction(null);
  };
  const updateExistingDetail = async (
    order: ApiOrder,
    detail: OrderDetail,
    cantidad: number,
    observaciones = detail.observaciones ?? "",
  ) => {
    if (sentQuantity(detail) > 0)
      return toast.error(
        "La línea ya fue enviada; agrega una corrección como línea nueva",
      );
    if (cantidad < 1) return;
    await run(
      () =>
        api.patch(`/pedidos/${order.id}/detalles/${detail.id}`, {
          cantidad,
          observaciones,
        }),
      "Línea actualizada",
    );
  };
  const toggleFavorite = async (product: ApiProduct) =>
    run(
      () =>
        api.patch(`/productos/${product.id}`, { favorito: !product.favorito }),
      product.favorito ? "Quitado de favoritos" : "Agregado a favoritos",
      false,
    ).then(() => load(true));
  const toggleAvailability = async (product: ApiProduct) =>
    run(
      () =>
        api.patch(`/productos/${product.id}`, {
          disponible: product.disponible === false,
        }),
      product.disponible === false
        ? `${product.nombre} disponible otra vez`
        : `${product.nombre} marcado agotado`,
      false,
    ).then(() => load(true));

  const loadTableManager = useCallback(async () => {
    if (!branchId) return;
    const [mesaResponse, zonaResponse] = await Promise.all([
      api.get<ApiTable[]>("/mesas", {
        params: { sucursalId: branchId, incluirInactivas: true },
      }),
      api.get<Array<{ id: number; nombre: string }>>(`/zonas/sucursal/${branchId}`),
    ]);
    setManagedTables(mesaResponse.data);
    setManagedZones(zonaResponse.data);
    setTableForm((current) => ({
      ...current,
      zonaId: current.zonaId || String(zonaResponse.data[0]?.id ?? ""),
    }));
  }, [branchId]);

  const openTableManager = async () => {
    setTableManagerOpen(true);
    try {
      await loadTableManager();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const saveTable = async () => {
    if (!tableForm.numero.trim() || !tableForm.zonaId) return;
    setTableManagerBusy(true);
    try {
      const payload = {
        numero: tableForm.numero.trim(),
        capacidad: Number(tableForm.capacidad),
        zonaId: Number(tableForm.zonaId),
        forma: tableForm.forma,
        orientacion: tableForm.orientacion,
        tamanoVisual: Number(tableForm.tamanoVisual),
      };
      if (tableForm.id) await api.patch(`/mesas/${tableForm.id}`, payload);
      else await api.post("/mesas", payload);
      toast.success(tableForm.id ? "Mesa actualizada" : "Mesa creada");
      setTableForm({ ...emptyTableForm, zonaId: tableForm.zonaId });
      await Promise.all([loadTableManager(), load(true)]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTableManagerBusy(false);
    }
  };

  const toggleTableActive = async (table: ApiTable & { estado?: boolean }) => {
    setTableManagerBusy(true);
    try {
      await api.patch(`/mesas/${table.id}/estado`, { activo: table.estado === false });
      toast.success(table.estado === false ? "Mesa reactivada" : "Mesa desactivada");
      await Promise.all([loadTableManager(), load(true)]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTableManagerBusy(false);
    }
  };

  if (loading) return <LoadingState label="Cargando salón, carta y pedidos…" />;
  if (failure)
    return (
      <ErrorState
        detail={failure.message}
        requestId={failure.requestId}
        retry={() => void load()}
      />
    );

  return (
    <div>
      <div className="section-title">
        <div>
          <p className="eyebrow">Sprint 41 · Mesa Inteligente</p>
          <h1 className="page-title">Salón operativo</h1>
          <p className="mt-1 text-sm text-denim/50">
            La mesa muestra qué necesita atención, no sólo si está ocupada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["MOSTRADOR", "PARA_LLEVAR", "DOMICILIO"] as OrderType[]).map(
            (type) => (
              <button
                className="secondary h-11 w-auto px-4 text-sm"
                key={type}
                onClick={() => openNew(type)}
              >
                <Plus size={16} />
                {typeLabels[type]}
              </button>
            ),
          )}
          {(hasPermission("MESAS_CREAR") || hasPermission("MESAS_EDITAR")) && (
            <button
              className="secondary h-11 w-auto px-4 text-sm"
              onClick={() => void openTableManager()}
            >
              <Plus size={16} />
              Gestionar mesas
            </button>
          )}
          <button
            className="secondary h-11 w-11 px-0"
            aria-label="Actualizar"
            onClick={() => void load()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          className={`salon-filter ${zone === "all" ? "active" : ""}`}
          onClick={() => setZone("all")}
        >
          Todas las zonas
        </button>
        {zones.map((item) => (
          <button
            className={`salon-filter ${zone === item.id ? "active" : ""}`}
            onClick={() => setZone(item.id)}
            key={item.id}
          >
            {item.nombre}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-4 xl:grid-cols-4 2xl:gap-5">
        {visibleTables.map((table) => {
          // Guardia final: una mesa que el backend declara LIBRE jamás puede
          // mostrar consumo, mesero, total ni preparación de un pedido histórico.
          const order = table.situacion === "LIBRE" ? undefined : orderByTable.get(table.id);
          const stations = order ? stationSummary(order) : [];
          const minutes = occupiedMinutes(order, table);
          const unpaidConsumption = Boolean(order && order.venta?.estado !== "PAGADA");
          const manualOccupied = !order && table.ocupacionManual;
          const visualSituation = unpaidConsumption
            ? order?.venta?.estado === "PENDIENTE_PAGO"
              ? "PENDIENTE_PAGO"
              : "OCUPADA"
            : manualOccupied
              ? "OCUPADA"
              : table.situacion;
          const visualStateClass = visualSituation.toLowerCase();
          const isFree = !order && !manualOccupied && visualSituation === "LIBRE";

          return (
            <article
              className={
                isFree
                  ? "group relative flex min-h-[190px] flex-col items-center justify-center rounded-[28px] border border-white/70 bg-white/45 px-3 py-4 shadow-[0_8px_26px_rgba(16,37,45,0.05)] transition duration-200 hover:-translate-y-1 hover:border-denim/10 hover:bg-white/70 hover:shadow-[0_14px_34px_rgba(16,37,45,0.10)] lg:min-h-[225px] lg:px-5 lg:py-5"
                  : `table-card ${visualStateClass} !min-h-0 !items-stretch !p-3 !text-left lg:!p-4`
              }
              key={table.id}
            >
              <button
                className="w-full text-left"
                onClick={() =>
                  order
                    ? void openExisting(order)
                    : table.situacion === "LIBRE" || table.ocupacionManual
                      ? openNew("MESA", table)
                      : undefined
                }
              >
                <div className="relative flex justify-center py-1 lg:py-2">
                  <TableSilhouette table={table} order={order} />
                  {minutes > 0 && (
                    <span className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-black shadow-sm">
                      <Clock3 className="mr-1 inline" size={11} />
                      {minutes} min
                    </span>
                  )}
                </div>

                {order ? (
                  <div className="mt-1 rounded-2xl bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-denim/45">{table.zona.nombre}</span>
                      <span className="rounded-full bg-denim/5 px-2 py-1 text-[10px] font-black">{visualSituation.replaceAll("_", " ")}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-denim/60">
                      <span><UserRound className="mr-1 inline" size={11} />{order.mesero ? `${order.mesero.nombres} ${order.mesero.apellidos}` : "Sin mesero"}</span>
                      <span><Users className="mr-1 inline" size={11} />{order.personas ?? table.capacidad} personas</span>
                    </div>
                    <strong className="mt-2 block text-lg">{money.format(Number(order.total))}</strong>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {stations.length ? stations.map((station) => (
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${station.ready === station.total ? "bg-emerald-100 text-emerald-800" : station.ready ? "bg-amber-100 text-amber-800" : "bg-denim/5 text-denim/60"}`}
                          key={station.name}
                        >
                          {station.name} {station.ready}/{station.total}
                        </span>
                      )) : <span className="text-[10px] text-denim/45">Sin comandas enviadas</span>}
                    </div>
                    <div className={`mt-2 rounded-xl px-2.5 py-2 text-[11px] font-black ${suggestedAction(order).startsWith("Retirar") ? "bg-amber-100 text-amber-800" : "bg-denim/5 text-denim/70"}`}>
                      {suggestedAction(order)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-center lg:mt-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-denim/50 lg:text-[11px]">{table.zona.nombre}</div>
                    <div className="mt-1 text-sm font-black text-denim lg:text-base">
                      {manualOccupied ? "Ocupada sin consumo" : table.situacion === "LIBRE" ? "Disponible" : table.situacion.replaceAll("_", " ")} · {table.capacidad} puestos
                    </div>
                    {!manualOccupied && table.situacion === "LIBRE" && <div className="mt-1 text-[11px] font-medium text-denim/55 lg:text-xs">Tocar la mesa para abrir</div>}
                    {table.ocupacionManual && (
                      <div className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900 lg:text-[11px]">
                        Ocupada sin consumo · puedes tomar pedido o liberar
                      </div>
                    )}
                  </div>
                )}
              </button>

              {!order && table.situacion === "LIBRE" && (hasPermission("MESAS_EDITAR") || hasPermission("PEDIDOS_CREAR")) && (
                <button
                  className="mt-3 w-full rounded-xl border border-denim/15 bg-white/80 px-3 py-2 text-center text-xs font-black text-denim transition hover:border-marigold hover:bg-marigold/10"
                  onClick={() => void occupy(table)}
                >
                  Ocupar sin pedido
                </button>
              )}
              {!order && table.ocupacionManual && (hasPermission("MESAS_EDITAR") || hasPermission("PEDIDOS_CREAR")) && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {hasPermission("PEDIDOS_CREAR") && (
                    <button
                      className="rounded-xl bg-steel px-3 py-2 text-xs font-black text-white transition hover:bg-denim"
                      onClick={() => openNew("MESA", table)}
                    >
                      Tomar pedido
                    </button>
                  )}
                  <button
                    className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
                    onClick={() => void release(table)}
                  >
                    <Unlock size={13} />
                    Liberar sin consumo
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {tableManagerOpen && (
        <Modal title="Gestionar mesas" onClose={() => setTableManagerOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-denim/55">
              Las mesas se ordenan de forma natural y ahora pueden representar la distribución real del salón. Configura forma, orientación y tamaño visual; desactivar conserva todo el historial.
            </p>
            {(hasPermission("MESAS_CREAR") || (tableForm.id && hasPermission("MESAS_EDITAR"))) && (
              <div className="grid gap-3 rounded-2xl border border-denim/10 p-4 sm:grid-cols-3">
                <label className="text-sm font-bold">
                  Número / nombre
                  <input
                    className="input mt-1"
                    maxLength={10}
                    value={tableForm.numero}
                    onChange={(event) => setTableForm({ ...tableForm, numero: event.target.value })}
                    placeholder="Ej. 16 o Terraza 1"
                  />
                </label>
                <label className="text-sm font-bold">
                  Puestos
                  <input
                    className="input mt-1"
                    type="number"
                    min="1"
                    value={tableForm.capacidad}
                    onChange={(event) => setTableForm({ ...tableForm, capacidad: event.target.value })}
                  />
                </label>
                <label className="text-sm font-bold">
                  Zona
                  <select
                    className="input mt-1"
                    value={tableForm.zonaId}
                    onChange={(event) => setTableForm({ ...tableForm, zonaId: event.target.value })}
                  >
                    {managedZones.map((item) => (
                      <option key={item.id} value={item.id}>{item.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Forma
                  <select className="input mt-1" value={tableForm.forma} onChange={(event) => setTableForm({ ...tableForm, forma: event.target.value as TableForm["forma"] })}>
                    <option value="CUADRADA">Cuadrada</option>
                    <option value="REDONDA">Redonda</option>
                    <option value="RECTANGULAR">Rectangular</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Orientación
                  <select className="input mt-1" value={tableForm.orientacion} disabled={tableForm.forma !== "RECTANGULAR"} onChange={(event) => setTableForm({ ...tableForm, orientacion: event.target.value as TableForm["orientacion"] })}>
                    <option value="HORIZONTAL">Horizontal</option>
                    <option value="VERTICAL">Vertical</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Tamaño visual
                  <select className="input mt-1" value={tableForm.tamanoVisual} onChange={(event) => setTableForm({ ...tableForm, tamanoVisual: event.target.value })}>
                    <option value="1">Compacta</option>
                    <option value="2">Normal</option>
                    <option value="3">Grande</option>
                  </select>
                </label>
                <div className="flex gap-2 sm:col-span-3">
                  <button
                    className="primary h-11 w-auto px-5"
                    disabled={tableManagerBusy || !tableForm.numero.trim() || !tableForm.zonaId}
                    onClick={() => void saveTable()}
                  >
                    {tableForm.id ? "Guardar cambios" : "Añadir mesa"}
                  </button>
                  {tableForm.id && (
                    <button
                      className="secondary h-11 w-auto px-5"
                      onClick={() => setTableForm({ ...emptyTableForm, zonaId: tableForm.zonaId })}
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {managedTables.map((table) => (
                <div key={table.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-denim/10 p-3">
                  <div>
                    <strong>Mesa {table.numero}</strong>
                    <p className="text-xs text-denim/50">{table.zona.nombre} · {table.capacidad} puestos · {(table.forma ?? "CUADRADA").toLowerCase()} · {(table as ApiTable & { estado?: boolean }).estado === false ? "Inactiva" : "Activa"}</p>
                  </div>
                  {hasPermission("MESAS_EDITAR") && (
                    <div className="flex gap-2">
                      {(table as ApiTable & { estado?: boolean }).estado !== false && (
                        <button
                          className="secondary h-10 w-auto px-3 text-xs"
                          onClick={() => setTableForm({ id: table.id, numero: table.numero, capacidad: String(table.capacidad), zonaId: String(table.zona.id), forma: table.forma ?? "CUADRADA", orientacion: table.orientacion ?? "HORIZONTAL", tamanoVisual: String(table.tamanoVisual ?? 2) })}
                        >
                          Editar
                        </button>
                      )}
                      <button
                        className="secondary h-10 w-auto px-3 text-xs"
                        disabled={tableManagerBusy}
                        onClick={() => void toggleTableActive(table as ApiTable & { estado?: boolean })}
                      >
                        {(table as ApiTable & { estado?: boolean }).estado === false ? "Reactivar" : "Desactivar"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {branchId && (
        <div className="mt-8">
          <SalonExperiencePanel
            branchId={branchId}
            tables={tables}
            orders={orders}
            canEdit={
              hasPermission("MESAS_EDITAR") && hasPermission("PEDIDOS_EDITAR")
            }
            canViewUsers={hasPermission("USUARIOS_VER")}
            reservationsEnabled={hasCapability("RESERVAS")}
            onChanged={load}
          />
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex justify-end bg-steel/45">
          <section className="h-full w-full max-w-5xl overflow-y-auto bg-[#f7f5ef] p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">
            <div className="section-title">
              <div>
                <p className="eyebrow">
                  {draft.existing
                    ? `Mesa Inteligente · Pedido #${draft.existing.id}`
                    : "Nueva orden"}
                </p>
                <h2 className="text-3xl font-black">
                  {draft.table
                    ? `Mesa ${draft.table.numero}`
                    : typeLabels[draft.type]}
                </h2>
              </div>
              <button onClick={() => setDraft(null)} aria-label="Cerrar">
                <X />
              </button>
            </div>

            {draft.existing && (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="card p-4">
                    <span className="text-xs text-denim/45">
                      Tiempo ocupada
                    </span>
                    <strong className="mt-1 block text-xl">
                      {occupiedMinutes(
                        draft.existing,
                        draft.table ?? undefined,
                      )}{" "}
                      min
                    </strong>
                  </div>
                  <div className="card p-4">
                    <span className="text-xs text-denim/45">Mesero</span>
                    <strong className="mt-1 block text-lg">
                      {draft.existing.mesero
                        ? `${draft.existing.mesero.nombres} ${draft.existing.mesero.apellidos}`
                        : "Sin asignar"}
                    </strong>
                  </div>
                  <div className="card p-4">
                    <span className="text-xs text-denim/45">Personas</span>
                    <strong className="mt-1 block text-xl">
                      {draft.existing.personas ?? draft.table?.capacidad ?? "—"}
                    </strong>
                  </div>
                  <div className="card p-4">
                    <span className="text-xs text-denim/45">
                      Total acumulado
                    </span>
                    <strong className="mt-1 block text-xl">
                      {money.format(Number(draft.existing.total))}
                    </strong>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="card p-4">
                    <h3 className="font-black">Preparación</h3>
                    <div className="mt-3 space-y-2">
                      {stationSummary(draft.existing).map((station) => (
                        <div
                          className="flex justify-between rounded-xl bg-denim/[.03] px-3 py-2 text-sm"
                          key={station.name}
                        >
                          <span>
                            {station.ready === station.total
                              ? "🟢"
                              : station.ready
                                ? "🟡"
                                : "⚪"}{" "}
                            {station.name}
                          </span>
                          <b>
                            {station.ready}/{station.total} listas
                            {station.oldestReadyMinutes
                              ? ` · ${station.oldestReadyMinutes} min esperando`
                              : ""}
                          </b>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">
                      {suggestedAction(draft.existing)}
                    </div>
                  </div>
                  <div className="card p-4">
                    <h3 className="font-black">Contexto de servicio</h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        aria-label="Número de personas"
                        value={contextPeople}
                        onChange={(e) => setContextPeople(e.target.value)}
                      />
                      <input
                        className="input sm:col-span-2"
                        placeholder="Observaciones generales de la mesa"
                        value={contextNotes}
                        onChange={(e) => setContextNotes(e.target.value)}
                      />
                    </div>
                    {hasPermission("PEDIDOS_EDITAR") && (
                      <button
                        className="secondary mt-3 h-10"
                        onClick={() => void saveContext(draft.existing!)}
                      >
                        Guardar contexto
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 card p-4">
                  <h3 className="font-black">Acciones rápidas</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {hasPermission("PEDIDOS_EDITAR") && (
                      <>
                        {hasPermission("MESAS_EDITAR") && (
                          <>
                            <button
                              className="secondary h-10 px-2 text-xs"
                              onClick={() =>
                                setQuickAction((value) =>
                                  value === "transfer" ? null : "transfer",
                                )
                              }
                            >
                              <MoveRight size={14} />
                              Trasladar
                            </button>
                            <button
                              className="secondary h-10 px-2 text-xs"
                              onClick={() =>
                                setQuickAction((value) =>
                                  value === "separate" ? null : "separate",
                                )
                              }
                            >
                              <Scissors size={14} />
                              Separar
                            </button>
                          </>
                        )}
                        <button
                          className="secondary h-10 px-2 text-xs"
                          onClick={() =>
                            setQuickAction((value) =>
                              value === "merge" ? null : "merge",
                            )
                          }
                        >
                          <Merge size={14} />
                          Unir mesa
                        </button>
                        {hasPermission("USUARIOS_VER") && (
                          <button
                            className="secondary h-10 px-2 text-xs"
                            onClick={() =>
                              setQuickAction((value) =>
                                value === "waiter" ? null : "waiter",
                              )
                            }
                          >
                            <UserRound size={14} />
                            Mesero
                          </button>
                        )}
                      </>
                    )}
                    {draft.existing.estado === "LISTO" &&
                      hasPermission("PEDIDOS_EDITAR") && (
                        <button
                          className="secondary h-10 px-2 text-xs"
                          onClick={() => void markDelivered(draft.existing!)}
                        >
                          <CheckCircle2 size={14} />
                          Entregado a mesa
                        </button>
                      )}
                    {hasPermission("PEDIDOS_EDITAR") && (
                      <>
                        <button
                          className="secondary h-10 px-2 text-xs"
                          onClick={() =>
                            void previewPreaccount(draft.existing!)
                          }
                        >
                          <Printer size={14} />
                          Precuenta
                        </button>
                        <button
                          className="secondary h-10 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={saving || !canRequestBill(draft.existing)}
                          title={
                            canRequestBill(draft.existing)
                              ? "Solicitar cuenta"
                              : "Entrega primero todos los productos al cliente"
                          }
                          onClick={() => void requestBill(draft.existing!)}
                        >
                          <ReceiptText size={14} />
                          {canRequestBill(draft.existing)
                            ? "Solicitar cuenta"
                            : "Faltan entregas"}
                        </button>
                        <button
                          className="secondary h-10 px-2 text-xs"
                          onClick={() =>
                            setQuickAction((value) =>
                              value === "split" ? null : "split",
                            )
                          }
                        >
                          <Split size={14} />
                          Dividir cuenta
                        </button>
                      </>
                    )}
                    {!(["CANCELADO", "FACTURADO"] as string[]).includes(draft.existing.estado) &&
                      hasPermission("PEDIDOS_CANCELAR") && (
                        <button
                          className="secondary h-10 px-2 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={saving || orderPreparationStarted(draft.existing)}
                          title={
                            orderPreparationStarted(draft.existing)
                              ? "No se puede cancelar: la preparación ya inició"
                              : "Cancelar pedido creado por error"
                          }
                          onClick={() => void cancelOrder(draft.existing!)}
                        >
                          <XCircle size={14} />
                          {orderPreparationStarted(draft.existing)
                            ? "Cancelación bloqueada"
                            : "Cancelar pedido"}
                        </button>
                      )}
                    {pendingCommandDetails(draft.existing).length > 0 &&
                      hasPermission("COMANDAS_ENVIAR") &&
                      hasCapability("KDS") && (
                        <button
                          className="secondary h-10 px-2 text-xs"
                          onClick={() =>
                            void run(
                              () => sendPending(draft.existing!),
                              "Líneas nuevas enviadas",
                            )
                          }
                        >
                          <Send size={14} />
                          Enviar nuevas
                        </button>
                      )}
                  </div>
                  {quickAction && (
                    <div className="mt-3 rounded-2xl border border-denim/10 bg-[#f7f5ef] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <strong className="text-sm">
                          {quickAction === "transfer" &&
                            "Selecciona la mesa destino"}
                          {quickAction === "merge" &&
                            "Selecciona una mesa para unir"}
                          {quickAction === "separate" &&
                            "Selecciona la mesa que deseas separar"}
                          {quickAction === "waiter" &&
                            "Selecciona el nuevo mesero"}
                          {quickAction === "split" &&
                            "Divide la cuenta en partes iguales"}
                        </strong>
                        <button
                          className="rounded-lg p-1 hover:bg-white"
                          aria-label="Cerrar acción"
                          onClick={() => setQuickAction(null)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {(quickAction === "transfer" ||
                        quickAction === "merge") && (
                        <div className="flex flex-wrap gap-2">
                          {tables.filter((table) => table.situacion === "LIBRE")
                            .length === 0 ? (
                            <span className="text-sm text-denim/55">
                              No hay mesas libres disponibles.
                            </span>
                          ) : (
                            tables
                              .filter((table) => table.situacion === "LIBRE")
                              .map((table) => (
                                <button
                                  key={table.id}
                                  className="secondary h-9 px-3 text-xs"
                                  disabled={saving}
                                  onClick={() =>
                                    void (quickAction === "transfer"
                                      ? transfer(draft.existing!, table.id)
                                      : merge(draft.existing!, table.id))
                                  }
                                >
                                  Mesa {table.numero}
                                </button>
                              ))
                          )}
                        </div>
                      )}
                      {quickAction === "separate" && (
                        <div className="flex flex-wrap gap-2">
                          {(
                            draft.existing.mesasVinculadas?.filter(
                              (item) => !item.principal,
                            ) ?? []
                          ).length === 0 ? (
                            <span className="text-sm text-denim/55">
                              Este pedido no tiene mesas secundarias unidas.
                            </span>
                          ) : (
                            (
                              draft.existing.mesasVinculadas?.filter(
                                (item) => !item.principal,
                              ) ?? []
                            ).map((item) => (
                              <button
                                key={item.mesa.id}
                                className="secondary h-9 px-3 text-xs"
                                disabled={saving}
                                onClick={() =>
                                  void separate(draft.existing!, item.mesa.id)
                                }
                              >
                                Mesa {item.mesa.numero}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      {quickAction === "waiter" && (
                        <div className="flex flex-wrap gap-2">
                          {users.length === 0 ? (
                            <span className="text-sm text-denim/55">
                              No hay usuarios activos disponibles para asignar.
                            </span>
                          ) : (
                            users.map((user) => (
                              <button
                                key={user.id}
                                className="secondary h-9 px-3 text-xs"
                                disabled={
                                  saving ||
                                  user.id === draft.existing?.mesero?.id
                                }
                                onClick={() =>
                                  void changeWaiter(draft.existing!, user.id)
                                }
                              >
                                {user.nombres} {user.apellidos}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      {quickAction === "split" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="input h-10 w-24"
                            type="number"
                            min="2"
                            max="20"
                            value={splitParts}
                            onChange={(event) =>
                              setSplitParts(event.target.value)
                            }
                            aria-label="Número de partes"
                          />
                          <button
                            className="primary h-10 px-4 text-xs"
                            disabled={saving}
                            onClick={() =>
                              void splitBill(
                                draft.existing!,
                                Number(splitParts),
                              )
                            }
                          >
                            Confirmar división
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 card p-4">
                  <div className="flex items-center gap-2">
                    <Utensils />
                    <h3 className="font-black">Pedido actual</h3>
                  </div>
                  <div className="mt-3 divide-y divide-denim/10">
                    {draft.existing.detalles.map((detail) => {
                      const sent = sentQuantity(detail);
                      const ready = (detail.comandas ?? [])
                        .filter((item) => item.comanda?.estado !== "CANCELADA" && item.estado === "LISTA")
                        .reduce((sum, item) => sum + item.cantidad, 0);
                      const directCommandIds =
                        detail.producto.requierePreparacion === false
                          ? [
                              ...new Set(
                                (detail.comandas ?? [])
                                  .filter(
                                    (item) =>
                                      item.comanda &&
                                      !["ENTREGADA", "CANCELADA"].includes(
                                        item.comanda.estado,
                                      ),
                                  )
                                  .map((item) => item.comanda!.id),
                              ),
                            ]
                          : [];
                      return (
                        <div className="py-3" key={detail.id}>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="min-w-0 flex-1">
                              <b>{detail.producto.nombre}</b>
                              {detail.modificadores?.length ? (
                                <small className="block text-denim/45">
                                  {detail.modificadores
                                    .map((m) => m.nombre)
                                    .join(" · ")}
                                </small>
                              ) : null}
                              {sent ? (
                                <small className={`block ${ready ? "text-emerald-700" : "text-denim/55"}`}>
                                  {ready > 0
                                    ? `${ready}/${detail.cantidad} listas · ${sent}/${detail.cantidad} enviadas`
                                    : `${sent}/${detail.cantidad} enviadas a preparación`}
                                </small>
                              ) : (
                                <small className="block text-amber-700">
                                  Aún no enviada · editable
                                </small>
                              )}
                            </span>
                            {sent === 0 && hasPermission("PEDIDOS_EDITAR") ? (
                              <>
                                <button
                                  className="qty"
                                  onClick={() =>
                                    void updateExistingDetail(
                                      draft.existing!,
                                      detail,
                                      detail.cantidad - 1,
                                    )
                                  }
                                >
                                  <Minus size={14} />
                                </button>
                                <b>{detail.cantidad}</b>
                                <button
                                  className="qty"
                                  onClick={() =>
                                    void updateExistingDetail(
                                      draft.existing!,
                                      detail,
                                      detail.cantidad + 1,
                                    )
                                  }
                                >
                                  <Plus size={14} />
                                </button>
                              </>
                            ) : (
                              <b>{detail.cantidad}×</b>
                            )}
                            <b className="w-28 text-right">
                              {money.format(Number(detail.subtotal))}
                            </b>
                            {directCommandIds.length > 0 &&
                              hasPermission("PEDIDOS_EDITAR") && (
                                <button
                                  className="secondary h-9 w-auto px-3 text-xs text-emerald-700"
                                  disabled={saving}
                                  onClick={() =>
                                    void deliverDirect(directCommandIds)
                                  }
                                >
                                  <CheckCircle2 size={14} />
                                  Entregar directo
                                </button>
                              )}
                          </div>
                          <input
                            className="mt-2 w-full rounded-xl border border-denim/10 bg-white/70 px-3 py-2 text-sm"
                            value={
                              detailNotes[detail.id] ??
                              detail.observaciones ??
                              ""
                            }
                            disabled={
                              sent > 0 || !hasPermission("PEDIDOS_EDITAR")
                            }
                            placeholder="Observación para preparación o servicio: sin salsas, sin hielo…"
                            onChange={(e) =>
                              setDetailNotes((current) => ({
                                ...current,
                                [detail.id]: e.target.value,
                              }))
                            }
                            onBlur={() => {
                              if (sent === 0)
                                void persistDetailObservation(
                                  draft.existing!,
                                  detail,
                                ).catch((error) =>
                                  toast.error(errorMessage(error)),
                                );
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {!draft.existing && draft.type === "MESA" && (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <input
                  className="input"
                  type="number"
                  min="1"
                  max={draft.table?.capacidad ?? undefined}
                  placeholder="Personas"
                  value={contextPeople}
                  onChange={(e) => setContextPeople(e.target.value)}
                />
                <input
                  className="input sm:col-span-2"
                  placeholder="Observaciones de la mesa"
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                />
              </div>
            )}
            {draft.type === "DOMICILIO" && !draft.existing && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <input
                  className="input"
                  placeholder="Destinatario"
                  value={delivery.destinatario}
                  onChange={(e) =>
                    setDelivery({ ...delivery, destinatario: e.target.value })
                  }
                />
                <input
                  className="input"
                  placeholder="Teléfono"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel"
                  value={delivery.telefono}
                  onChange={(e) =>
                    setDelivery({
                      ...delivery,
                      telefono: e.target.value.replace(/\D/g, "").slice(0, 20),
                    })
                  }
                />
                <input
                  className="input sm:col-span-2"
                  placeholder="Dirección"
                  value={delivery.direccion}
                  onChange={(e) =>
                    setDelivery({ ...delivery, direccion: e.target.value })
                  }
                />
                <label className="grid gap-1 text-xs font-bold text-denim/55">
                  Referencias de entrega
                  <input
                    className="input"
                    placeholder="Casa, portería, indicaciones…"
                    value={delivery.referencias}
                    onChange={(e) =>
                      setDelivery({ ...delivery, referencias: e.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold text-denim/55">
                  Valor del domicilio
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={delivery.costo}
                    onChange={(e) =>
                      setDelivery({
                        ...delivery,
                        costo: e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""),
                      })
                    }
                  />
                  <span className="font-medium text-denim/40">Se suma al total del pedido y luego a la venta.</span>
                </label>
              </div>
            )}

            {draft.type === "MESA" && !draft.existing && draft.table && hasPermission("PEDIDOS_CREAR") && (
              <div className="mt-4 rounded-2xl border border-denim/10 bg-white/70 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="block text-sm sm:text-base">Unir mesas</strong>
                    <span className="text-xs text-denim/45">Opcional · Mesa principal {draft.table.numero}</span>
                  </div>
                  {prelinkedTableIds.length > 0 && (
                    <span className="rounded-full bg-marigold/25 px-3 py-1 text-xs font-black">
                      {prelinkedTableIds.length + 1} mesas
                    </span>
                  )}
                </div>

                {tables.some((table) => table.id !== draft.table?.id && table.situacion === "LIBRE") ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <select
                      className="input h-10 py-0 text-sm"
                      aria-label="Agregar mesa libre"
                      value=""
                      onChange={(event) => {
                        const mesaId = Number(event.target.value);
                        if (!mesaId) return;
                        setPrelinkedTableIds((current) =>
                          current.includes(mesaId) ? current : [...current, mesaId],
                        );
                      }}
                    >
                      <option value="">Agregar otra mesa libre…</option>
                      {tables
                        .filter(
                          (table) =>
                            table.id !== draft.table?.id &&
                            table.situacion === "LIBRE" &&
                            !prelinkedTableIds.includes(table.id),
                        )
                        .map((table) => (
                          <option key={table.id} value={table.id}>
                            Mesa {table.numero} · {table.capacidad} puestos
                          </option>
                        ))}
                    </select>
                    <span className="text-xs font-semibold text-denim/45">Sólo mesas libres</span>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-denim/45">No hay otras mesas libres en este momento.</p>
                )}

                {prelinkedTableIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex h-9 items-center rounded-xl bg-steel px-3 text-xs font-black text-white">
                      Mesa {draft.table.numero}
                    </span>
                    {prelinkedTableIds.map((mesaId) => {
                      const linked = tables.find((table) => table.id === mesaId);
                      if (!linked) return null;
                      return (
                        <button
                          type="button"
                          key={mesaId}
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-marigold/60 bg-marigold/15 px-3 text-xs font-black text-denim transition hover:bg-marigold/25"
                          title={`Quitar Mesa ${linked.numero}`}
                          onClick={() =>
                            setPrelinkedTableIds((current) => current.filter((id) => id !== mesaId))
                          }
                        >
                          <Merge size={13} /> Mesa {linked.numero} <X size={13} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
              <div className="min-w-0 rounded-[24px] border border-denim/10 bg-white/50 p-3 sm:p-4">
                <div className="sticky top-0 z-10 -mx-1 bg-[#f7f5ef]/95 px-1 pb-3 backdrop-blur">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="eyebrow">Carta operativa</p>
                      <h3 className="text-lg font-black">
                        {visibleProducts.length} producto{visibleProducts.length === 1 ? "" : "s"}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={`secondary h-9 w-auto px-3 text-xs ${showProductImages ? "bg-marigold/20" : ""}`}
                        onClick={() => {
                          const next = !showProductImages;
                          setShowProductImages(next);
                          writePosImagePreference(next);
                        }}
                        title="Mostrar u ocultar fotos en este dispositivo"
                      >
                        <ImageIcon size={14} /> Fotos {showProductImages ? "sí" : "no"}
                      </button>
                      {search.trim() && (
                        <button
                          className="secondary h-9 w-auto px-3 text-xs"
                          onClick={() => setSearch("")}
                        >
                          Limpiar búsqueda
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 sm:hidden">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-denim/45">Categorías</span>
                    <span className="text-[11px] font-semibold text-denim/35">Desliza para ver más →</span>
                  </div>
                  <div className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 sm:mt-3">
                    <button
                      className={`salon-filter shrink-0 snap-start ${category === "favorites" ? "active" : ""}`}
                      onClick={() => { setCategory("favorites"); setProductLimit(60); }}
                    >
                      <Heart size={13} /> Favoritos
                    </button>
                    <button
                      className={`salon-filter shrink-0 snap-start ${category === "all" ? "active" : ""}`}
                      onClick={() => { setCategory("all"); setProductLimit(60); }}
                    >
                      Toda la carta
                    </button>
                    {categories.map((item) => (
                      <button
                        className={`salon-filter shrink-0 snap-start ${category === item.id ? "active" : ""}`}
                        onClick={() => { setCategory(item.id); setProductLimit(60); }}
                        key={item.id}
                      >
                        {item.nombre}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-3 text-denim/35"
                      size={18}
                    />
                    <input
                      className="input pl-10"
                      placeholder="Buscar producto, categoría o estación…"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setProductLimit(60); }}
                    />
                  </div>
                </div>

                <div className="max-h-[54vh] overflow-y-auto pr-1 lg:max-h-[calc(100vh-19rem)]">
                  {!visibleProducts.length ? (
                    <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-denim/15 bg-white/60 p-6 text-center">
                      <div>
                        <Search className="mx-auto text-denim/25" size={30} />
                        <p className="mt-3 font-black">No encontramos productos</p>
                        <p className="mt-1 text-sm text-denim/45">
                          Cambia la categoría o prueba otra búsqueda.
                        </p>
                        {category === "favorites" && (
                          <button
                            className="secondary mt-4 h-10 w-auto px-4"
                            onClick={() => setCategory("all")}
                          >
                            Ver toda la carta
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {renderedProducts.map((product) => (
                          <article
                            className={`card flex min-h-[116px] flex-col justify-between p-3 ${product.disponible === false ? "opacity-55" : ""}`}
                            key={product.id}
                          >
                            <button
                              className="w-full text-left"
                              title={`Ver detalle de ${product.nombre}`}
                              onClick={() => setSelectedProduct(product)}
                            >
                              <div className="flex items-start gap-3">
                                <span
                                  className={`mt-1 h-10 w-1 shrink-0 rounded-full ${product.estacion?.codigo === "BAR" ? "bg-blue-400" : "bg-orange-400"}`}
                                />
                                <span className="min-w-0 flex-1">
                                  <strong className="block min-h-10 overflow-hidden leading-5">
                                    {product.nombre}
                                  </strong>
                                  <small className="mt-1 block truncate text-denim/45">
                                    {product.categoria.nombre}
                                    {product.estacion ? ` · ${product.estacion.nombre}` : ""}
                                  </small>
                                </span>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-3 border-t border-denim/5 pt-2">
                                <span className="text-[11px] font-semibold text-denim/40">Ver detalle</span>
                                <b className="shrink-0 text-sm">{money.format(Number(product.precio))}</b>
                              </div>
                            </button>
                            <div className="mt-2 flex gap-2">
                              <button
                                aria-label="Favorito"
                                className="secondary h-8 w-9 px-0"
                                onClick={() => void toggleFavorite(product)}
                              >
                                <Heart
                                  size={14}
                                  fill={product.favorito ? "currentColor" : "none"}
                                />
                              </button>
                              {hasPermission("PRODUCTOS_EDITAR") && (
                                <button
                                  className="secondary h-8 flex-1 px-2 text-xs"
                                  onClick={() => void toggleAvailability(product)}
                                >
                                  {product.disponible === false ? (
                                    <>
                                      <CheckCircle2 size={13} />
                                      Reactivar
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle size={13} />
                                      Agotado
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            {product.disponible === false && (
                              <p className="mt-2 text-xs font-bold text-rose-600">
                                Agotado temporalmente
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                      {renderedProducts.length < visibleProducts.length && (
                        <button
                          className="secondary mt-4"
                          onClick={() => setProductLimit((value) => value + 60)}
                        >
                          Mostrar 60 más · quedan {visibleProducts.length - renderedProducts.length}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div ref={cartPanelRef} className="card scroll-mt-6 p-4 lg:sticky lg:top-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag />
                    <div>
                      <h3 className="text-lg font-black">
                        {draft.existing ? "Líneas nuevas" : "Pedido"}
                      </h3>
                      {draft.existing && (
                        <p className="text-xs font-semibold text-emerald-700">
                          Sólo estas líneas se enviarán a preparación
                        </p>
                      )}
                    </div>
                  </div>
                  {cart.length > 0 && (
                    <span className="status-pill">
                      {cart.reduce((sum, line) => sum + line.quantity, 0)} ítems
                    </span>
                  )}
                </div>
                {!cart.length ? (
                  <p className="py-8 text-center text-sm text-denim/40">
                    Selecciona productos de la carta.
                  </p>
                ) : (
                  <div className="mt-3 max-h-[42vh] divide-y divide-denim/10 overflow-y-auto pr-1 lg:max-h-[calc(100vh-27rem)]">
                    {cart.map((line, index) => (
                      <div className="py-3" key={`${line.product.id}-${index}`}>
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 font-bold">
                            {line.product.nombre}
                          </span>
                          <button className="qty" onClick={() => change(index, -1)}>
                            <Minus size={14} />
                          </button>
                          <b>{line.quantity}</b>
                          <button className="qty" onClick={() => change(index, 1)}>
                            <Plus size={14} />
                          </button>
                          <b className="w-24 text-right text-sm">
                            {money.format(lineUnitPrice(line) * line.quantity)}
                          </b>
                        </div>
                        {(line.product.modificadores?.length ?? 0) > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {line.product.modificadores!.map((modifier) => (
                              <label
                                className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${(line.modifierIds ?? []).includes(modifier.id) ? "border-marigold bg-marigold/20 font-bold" : "border-denim/10"}`}
                                key={modifier.id}
                              >
                                <input
                                  className="sr-only"
                                  type="checkbox"
                                  checked={(line.modifierIds ?? []).includes(modifier.id)}
                                  onChange={() => toggleModifier(index, modifier.id)}
                                />
                                {modifier.nombre}
                                {Number(modifier.precio) ? ` +${money.format(Number(modifier.precio))}` : ""}
                              </label>
                            ))}
                          </div>
                        )}
                        <input
                          className="mt-2 w-full rounded-xl border border-denim/10 bg-denim/[.02] px-3 py-2 text-sm"
                          title={line.notes || "Observaciones del producto"}
                          maxLength={300}
                          placeholder="Observaciones: sin cebolla, término medio…"
                          value={line.notes}
                          onChange={(e) => setNotes(index, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 space-y-2 border-t border-denim/10 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-denim/45">Productos</span>
                    <strong>{money.format(cartTotal(cart))}</strong>
                  </div>
                  {draft.type === "DOMICILIO" && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-denim/45">Domicilio</span>
                      <strong>{money.format(Number(delivery.costo) || 0)}</strong>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-lg">
                    <span className="font-black">Total pedido</span>
                    <strong className="text-xl">
                      {money.format(cartTotal(cart) + (draft.type === "DOMICILIO" ? Number(delivery.costo) || 0 : 0))}
                    </strong>
                  </div>
                </div>
                <button
                  className="primary mt-4"
                  disabled={!cart.length || saving}
                  onClick={() => void submit()}
                >
                  {draft.existing ? (
                    <>
                      <Send size={16} />
                      Enviar sólo líneas nuevas
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Crear pedido y enviar
                    </>
                  )}
                </button>
              </div>
            </div>
            {cart.length > 0 && (
              <button
                className="fixed bottom-4 left-4 right-4 z-[60] flex items-center justify-between rounded-2xl bg-steel px-4 py-3 text-left text-white shadow-2xl lg:hidden"
                onClick={() => cartPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wide text-white/65">Pedido en curso</span>
                  <strong>{cart.reduce((sum, line) => sum + line.quantity, 0)} ítems · {money.format(cartTotal(cart))}</strong>
                </span>
                <span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black">Ver pedido</span>
              </button>
            )}
          </section>
        </div>
      )}
      {selectedProduct && (
        <Modal title={selectedProduct.nombre} onClose={() => setSelectedProduct(null)}>
          <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
            <div className="overflow-hidden rounded-3xl border border-denim/10 bg-white">
              {showProductImages && selectedProduct.imagenPrincipal ? (
                <div className="aspect-square bg-denim/5">
                  <img
                    src={productImageUrl(selectedProduct.imagenPrincipal, "medium")}
                    alt={selectedProduct.nombre}
                    loading="eager"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      const image = event.currentTarget;
                      image.hidden = true;
                      image.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <div className="hidden h-full w-full place-items-center p-6 text-center text-denim/40">
                    <div>
                      <ImageIcon className="mx-auto mb-2" size={34} />
                      <p className="font-bold">Imagen no disponible</p>
                      <p className="mt-1 text-xs">El producto sigue disponible para la venta.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid aspect-square place-items-center p-6 text-center text-denim/40">
                  <div>
                    <ImageIcon className="mx-auto mb-2" size={34} />
                    <p className="font-bold">Sin foto</p>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">{selectedProduct.categoria.nombre}{selectedProduct.estacion ? ` · ${selectedProduct.estacion.nombre}` : ""}</p>
                  <h3 className="mt-1 text-2xl font-black">{selectedProduct.nombre}</h3>
                </div>
                <strong className="text-2xl">{money.format(Number(selectedProduct.precio))}</strong>
              </div>
              {selectedProduct.descripcion && (
                <p className="mt-4 text-sm leading-6 text-denim/65">{selectedProduct.descripcion}</p>
              )}
              {(selectedProduct.modificadores?.length ?? 0) > 0 && (
                <div className="mt-5 rounded-2xl bg-white p-4">
                  <p className="text-sm font-black">Este producto tiene opciones</p>
                  <p className="mt-1 text-xs text-denim/50">Agrégalo al pedido y podrás seleccionar modificadores y observaciones en el panel de pedido.</p>
                </div>
              )}
              {selectedProduct.disponible === false ? (
                <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">
                  Agotado temporalmente
                </div>
              ) : (
                <button
                  className="primary mt-5"
                  onClick={() => { add(selectedProduct); setSelectedProduct(null); }}
                >
                  <Plus size={17} />
                  Agregar al pedido · {money.format(Number(selectedProduct.precio))}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {printDocument && (
        <PrintableDocumentModal
          html={printDocument.html}
          title={printDocument.title}
          printLabel={
            preaccountPrinter && printAgentOnline
              ? "Imprimir precuenta directo"
              : "Imprimir precuenta"
          }
          toolbar={
            <div className="rounded-2xl border border-denim/10 bg-white/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-sm">Salida de precuenta</strong>
                  <p className="text-xs text-denim/55">
                    {printAgentOnline
                      ? "Selecciona una impresora local o usa el diálogo del navegador."
                      : "Agente local no detectado. Se usará la impresión del navegador."}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-[10px] font-black uppercase",
                    printAgentOnline
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-900",
                  ].join(" ")}
                >
                  Agente {printAgentOnline ? "conectado" : "no detectado"}
                </span>
              </div>
              <select
                className="input mt-2 h-10"
                disabled={!printAgentOnline}
                value={preaccountPrinter}
                onChange={(event) => selectPreaccountPrinter(event.target.value)}
              >
                <option value="">Usar impresión del navegador</option>
                {localPrinters.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}{printer.default ? " · predeterminada" : ""}
                    {printer.available ? "" : " · no disponible"}
                  </option>
                ))}
              </select>
            </div>
          }
          onPrint={async () => {
            if (!preaccountPrinter || !printAgentOnline) return "browser";
            try {
              const result = await printWithLocalAgent({
                printerName: preaccountPrinter,
                jobName: `SIGR Precuenta ${printDocument.orderId}`,
                content: printDocument.text,
                widthMm: printDocument.widthMm,
              });
              if (!result.ok || result.status !== "completed") {
                throw new Error(result.error || "No se confirmó la impresión física");
              }
              toast.success("Precuenta impresa físicamente");
              return "handled";
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "No se pudo imprimir con el agente local de SIGR",
              );
              return "handled";
            }
          }}
          onClose={() => setPrintDocument(null)}
        />
      )}
    </div>
  );
}
