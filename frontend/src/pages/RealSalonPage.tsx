import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Heart,
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
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PrintableDocumentModal } from "../components/PrintableDocumentModal";
import { SalonExperiencePanel } from "../features/salon/SalonExperiencePanel";
import {
  activeOrder,
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
import { useApp } from "../store/app";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
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
  costo: number;
};
type QuickAction =
  | "transfer"
  | "merge"
  | "separate"
  | "waiter"
  | "split"
  | null;

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
  const [saving, setSaving] = useState(false);
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const [printDocument, setPrintDocument] = useState<{
    title: string;
    html: string;
  } | null>(null);
  const [splitParts, setSplitParts] = useState("2");
  const [contextPeople, setContextPeople] = useState("2");
  const [contextNotes, setContextNotes] = useState("");
  const [detailNotes, setDetailNotes] = useState<Record<number, string>>({});
  const [delivery, setDelivery] = useState<Delivery>({
    destinatario: "",
    telefono: "",
    direccion: "",
    referencias: "",
    costo: 0,
  });

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
  const visibleProducts = products.filter((product) => {
    const matchesCategory =
      category === "all" ||
      (category === "favorites"
        ? product.favorito
        : product.categoria.id === category);
    const term = search.trim().toLowerCase();
    return (
      matchesCategory &&
      (!term ||
        `${product.nombre} ${product.categoria.nombre}`
          .toLowerCase()
          .includes(term))
    );
  });
  const orderByTable = new Map(
    orders.flatMap((order) =>
      order.mesasVinculadas?.length
        ? order.mesasVinculadas.map((link) => [link.mesa.id, order] as const)
        : order.mesa
          ? [[order.mesa.id, order] as const]
          : [],
    ),
  );

  const openNew = (type: OrderType, table: ApiTable | null = null) => {
    setCart([]);
    setCategory("favorites");
    setSearch("");
    setContextPeople(String(Math.min(table?.capacidad ?? 2, 2)));
    setContextNotes("");
    setDetailNotes({});
    setQuickAction(null);
    setDraft({ type, table, existing: null });
  };
  const openExisting = async (summary: ApiOrder) => {
    try {
      const { data } = await api.get<ApiOrder>(`/pedidos/${summary.id}`);
      setCart([]);
      setCategory("favorites");
      setSearch("");
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
          personas: Number(contextPeople) || undefined,
          observaciones: contextNotes.trim() || undefined,
          detalles: details,
          ...(draft.type === "DOMICILIO" ? { domicilio: delivery } : {}),
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
      `Mesa ${table.numero} ocupada`,
      false,
    );
  const release = async (table: ApiTable) =>
    run(
      () =>
        api.patch(`/mesas/${table.id}/liberar-sin-consumo`, {
          motivo: "Cliente se retiró sin consumo",
        }),
      `Mesa ${table.numero} liberada`,
      false,
    );

  const markDelivered = async (order: ApiOrder) => {
    await run(
      () => api.patch(`/pedidos/${order.id}/entregado`),
      "Pedido entregado en mesa",
    );
  };

  const previewPreaccount = async (order: ApiOrder) => {
    try {
      const { data } = await api.get<{ contenido: string }>(
        `/pedidos/${order.id}/precuenta`,
      );
      setPrintDocument({
        title: `Precuenta · Pedido #${order.id}`,
        html: data.contenido,
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

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visibleTables.map((table) => {
          const order = orderByTable.get(table.id);
          const stations = order ? stationSummary(order) : [];
          const minutes = occupiedMinutes(order, table);
          return (
            <article
              className={`table-card ${table.situacion.toLowerCase()} !items-stretch !text-left`}
              key={table.id}
            >
              <button
                className="text-left"
                onClick={() =>
                  order
                    ? void openExisting(order)
                    : table.situacion === "LIBRE"
                      ? openNew("MESA", table)
                      : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-45">
                      {table.zona.nombre}
                    </span>
                    <strong className="mt-1 block text-2xl font-black">
                      Mesa {table.numero}
                    </strong>
                  </div>
                  {minutes > 0 && (
                    <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-black">
                      <Clock3 className="mr-1 inline" size={12} />
                      {minutes} min
                    </span>
                  )}
                </div>
                {order ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-denim/60">
                      <span>
                        <UserRound className="mr-1 inline" size={12} />
                        {order.mesero
                          ? `${order.mesero.nombres} ${order.mesero.apellidos}`
                          : "Sin mesero"}
                      </span>
                      <span>
                        <Users className="mr-1 inline" size={12} />
                        {order.personas ?? table.capacidad} personas
                      </span>
                    </div>
                    <strong className="mt-3 block text-xl">
                      {money.format(Number(order.total))}
                    </strong>
                    <div className="mt-3 space-y-1">
                      {stations.length ? (
                        stations.map((station) => (
                          <div
                            className="flex items-center justify-between text-xs"
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
                            </b>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-denim/45">
                          Sin comandas enviadas
                        </div>
                      )}
                    </div>
                    <div
                      className={`mt-3 rounded-xl px-3 py-2 text-xs font-black ${suggestedAction(order).startsWith("Retirar") ? "bg-amber-100 text-amber-800" : "bg-denim/5 text-denim/70"}`}
                    >
                      Acción sugerida: {suggestedAction(order)}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="mt-3 flex items-center gap-1 text-xs opacity-55">
                      <Users size={13} />
                      {table.capacidad} puestos
                    </span>
                    <span className="mt-4 block text-xs font-extrabold">
                      {table.situacion === "LIBRE"
                        ? "Disponible · tocar para abrir"
                        : table.situacion.replaceAll("_", " ")}
                    </span>
                  </>
                )}
              </button>
              {!order &&
                table.situacion === "LIBRE" &&
                hasPermission("MESAS_EDITAR") && (
                  <button
                    className="mt-3 text-xs font-bold text-denim/55"
                    onClick={() => void occupy(table)}
                  >
                    Ocupar sin pedido
                  </button>
                )}
              {!order &&
                table.ocupacionManual &&
                hasPermission("MESAS_EDITAR") && (
                  <button
                    className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-700"
                    onClick={() => void release(table)}
                  >
                    <Unlock size={13} />
                    Liberar sin consumo
                  </button>
                )}
            </article>
          );
        })}
      </div>

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
          <section className="h-full w-full max-w-5xl overflow-y-auto bg-[#f7f5ef] p-4 sm:p-6 lg:p-8">
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
                    <h3 className="font-black">Cocina / bar</h3>
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
                                  value === "merge" ? null : "merge",
                                )
                              }
                            >
                              <Merge size={14} />
                              Unir mesa
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
                          className="secondary h-10 px-2 text-xs"
                          onClick={() => void requestBill(draft.existing!)}
                        >
                          <ReceiptText size={14} />
                          Solicitar cuenta
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
                                <small className="block text-emerald-700">
                                  {sent}/{detail.cantidad} enviadas a
                                  preparación
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
                            placeholder="Observación para cocina/bar: sin salsas, sin hielo…"
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
                  value={delivery.telefono}
                  onChange={(e) =>
                    setDelivery({ ...delivery, telefono: e.target.value })
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
                <input
                  className="input"
                  placeholder="Referencias"
                  value={delivery.referencias}
                  onChange={(e) =>
                    setDelivery({ ...delivery, referencias: e.target.value })
                  }
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Costo domicilio"
                  value={delivery.costo}
                  onChange={(e) =>
                    setDelivery({ ...delivery, costo: Number(e.target.value) })
                  }
                />
              </div>
            )}

            <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
              <button
                className={`salon-filter ${category === "favorites" ? "active" : ""}`}
                onClick={() => setCategory("favorites")}
              >
                <Heart size={13} /> Favoritos
              </button>
              <button
                className={`salon-filter ${category === "all" ? "active" : ""}`}
                onClick={() => setCategory("all")}
              >
                Toda la carta
              </button>
              {categories.map((item) => (
                <button
                  className={`salon-filter ${category === item.id ? "active" : ""}`}
                  onClick={() => setCategory(item.id)}
                  key={item.id}
                >
                  {item.nombre}
                </button>
              ))}
            </div>
            <div className="relative mt-3">
              <Search
                className="absolute left-3 top-3 text-denim/35"
                size={18}
              />
              <input
                className="input pl-10"
                placeholder="Buscar producto, categoría…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProducts.map((product) => (
                <article
                  className={`card p-4 ${product.disponible === false ? "opacity-50" : ""}`}
                  key={product.id}
                >
                  <button
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => add(product)}
                    disabled={product.disponible === false}
                  >
                    <span
                      className={`h-10 w-1 rounded-full ${product.estacion?.codigo === "BAR" ? "bg-blue-400" : "bg-orange-400"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate">
                        {product.nombre}
                      </strong>
                      <small className="text-denim/45">
                        {product.categoria.nombre}
                        {product.estacion
                          ? ` · ${product.estacion.nombre}`
                          : ""}
                      </small>
                    </span>
                    <b>{money.format(Number(product.precio))}</b>
                  </button>
                  <div className="mt-3 flex gap-2">
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
                            Marcar agotado
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

            <div className="mt-6 card p-4">
              <div className="flex items-center gap-2">
                <ShoppingBag />
                <h3 className="text-lg font-black">
                  {draft.existing ? "Líneas nuevas" : "Pedido"}
                </h3>
              </div>
              {!cart.length ? (
                <p className="py-8 text-center text-sm text-denim/40">
                  Selecciona productos de la carta.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-denim/10">
                  {cart.map((line, index) => (
                    <div className="py-3" key={`${line.product.id}-${index}`}>
                      <div className="flex items-center gap-3">
                        <span className="flex-1 font-bold">
                          {line.product.nombre}
                        </span>
                        <button
                          className="qty"
                          onClick={() => change(index, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <b>{line.quantity}</b>
                        <button
                          className="qty"
                          onClick={() => change(index, 1)}
                        >
                          <Plus size={14} />
                        </button>
                        <b className="w-28 text-right">
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
                                checked={(line.modifierIds ?? []).includes(
                                  modifier.id,
                                )}
                                onChange={() =>
                                  toggleModifier(index, modifier.id)
                                }
                              />
                              {modifier.nombre}
                              {Number(modifier.precio)
                                ? ` +${money.format(Number(modifier.precio))}`
                                : ""}
                            </label>
                          ))}
                        </div>
                      )}
                      <input
                        className="mt-2 w-full rounded-xl border border-denim/10 bg-denim/[.02] px-3 py-2 text-sm"
                        maxLength={300}
                        placeholder="Observaciones: sin cebolla, término medio…"
                        value={line.notes}
                        onChange={(e) => setNotes(index, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-denim/10 pt-4">
                <span className="text-sm text-denim/45">
                  Total de líneas nuevas
                </span>
                <strong className="text-xl">
                  {money.format(cartTotal(cart))}
                </strong>
              </div>
              <button
                className="primary mt-4"
                disabled={!cart.length || saving}
                onClick={() => void submit()}
              >
                {draft.existing ? (
                  <>
                    <Send size={16} />
                    Agregar y enviar sólo líneas nuevas
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Crear pedido y enviar
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}
      {printDocument && (
        <PrintableDocumentModal
          html={printDocument.html}
          title={printDocument.title}
          onClose={() => setPrintDocument(null)}
        />
      )}
    </div>
  );
}
