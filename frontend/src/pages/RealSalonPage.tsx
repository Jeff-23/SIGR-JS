import { AlertCircle, ClipboardList, Minus, Plus, RefreshCw, ShoppingBag, Unlock, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { activeOrder, cartTotal, pendingCommandDetails, type ApiOrder, type ApiProduct, type ApiTable, type CartLine, type OrderType } from "../features/salon/contracts";
import { api, apiFailure, errorMessage, mutation } from "../lib/api";
import { useApp } from "../store/app";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const typeLabels: Record<OrderType, string> = { MESA: "Mesa", MOSTRADOR: "Mostrador", PARA_LLEVAR: "Para llevar", DOMICILIO: "Domicilio" };

type Draft = { type: OrderType; table: ApiTable | null; existing: ApiOrder | null };
type Delivery = { destinatario: string; telefono: string; direccion: string; referencias: string; costo: number };

export function RealSalonPage() {
  const { branchId, hasPermission, hasCapability } = useApp();
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ReturnType<typeof apiFailure> | null>(null);
  const [zone, setZone] = useState<number | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>({ destinatario: "", telefono: "", direccion: "", referencias: "", costo: 0 });

  const load = useCallback(async (quiet = false) => {
    if (!branchId) return;
    if (!quiet) setLoading(true);
    setFailure(null);
    try {
      const params = { sucursalId: branchId };
      const [tableResponse, productResponse, orderResponse] = await Promise.all([
        api.get<ApiTable[]>("/mesas", { params }), api.get<ApiProduct[]>("/productos", { params }), api.get<ApiOrder[]>("/pedidos", { params }),
      ]);
      setTables(tableResponse.data); setProducts(productResponse.data); setOrders(orderResponse.data.filter(activeOrder));
    } catch (error) { setFailure(apiFailure(error)); }
    finally { if (!quiet) setLoading(false); }
  }, [branchId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(true), 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  const zones = useMemo(() => [...new Map(tables.map((table) => [table.zona.id, table.zona])).values()], [tables]);
  const categories = useMemo(() => [...new Map(products.map((product) => [product.categoria.id, product.categoria])).values()], [products]);
  const visibleTables = tables.filter((table) => zone === "all" || table.zona.id === zone);
  const visibleProducts = products.filter((product) => (category === "all" || product.categoria.id === category) && product.nombre.toLowerCase().includes(search.toLowerCase()));
  const orderByTable = new Map(orders.filter((order) => order.mesa).map((order) => [order.mesa!.id, order]));

  const openNew = (type: OrderType, table: ApiTable | null = null) => { setCart([]); setDraft({ type, table, existing: null }); };
  const openExisting = async (summary: ApiOrder) => {
    try { const { data } = await api.get<ApiOrder>(`/pedidos/${summary.id}`); setCart([]); setDraft({ type: data.tipo, table: data.mesa, existing: data }); }
    catch (error) { toast.error(errorMessage(error)); }
  };
  const add = (product: ApiProduct) => setCart((current) => {
    const found = current.find((line) => line.product.id === product.id && !line.notes);
    return found ? current.map((line) => line === found ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { product, quantity: 1, notes: "" }];
  });
  const change = (id: number, delta: number) => setCart((current) => current.map((line) => line.product.id === id ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0));
  const setNotes = (id: number, notes: string) => setCart((current) => current.map((line) => line.product.id === id ? { ...line, notes } : line));

  const sendPending = async (order: ApiOrder) => {
    if (!hasPermission("COMANDAS_ENVIAR") || !hasCapability("KDS")) return;
    const details = pendingCommandDetails(order);
    if (!details.length) return;
    await api.post(`/pedidos/${order.id}/comandas`, { detalles: details });
  };

  const submit = async () => {
    if (!draft || !branchId || !cart.length || saving) return;
    if (draft.type === "MESA" && !draft.table) return toast.error("Selecciona una mesa");
    if (draft.type === "DOMICILIO" && (!delivery.destinatario.trim() || !delivery.telefono.trim() || !delivery.direccion.trim())) return toast.error("Completa destinatario, teléfono y dirección");
    setSaving(true);
    const details = cart.map((line) => ({ productoId: line.product.id, cantidad: line.quantity, observaciones: line.notes.trim() || undefined }));
    try {
      if (draft.existing) {
        const previous = new Set(draft.existing.detalles.map((detail) => detail.id));
        const result = await api.post<ApiOrder>(`/pedidos/${draft.existing.id}/detalles`, { detalles: details });
        const updated = result.data;
        await sendPending({ ...updated, detalles: updated.detalles.filter((detail) => !previous.has(detail.id)) });
        toast.success("Productos agregados y enviados a preparación");
      } else {
        const body = { tipo: draft.type, sucursalId: branchId, mesaId: draft.table?.id, detalles: details, ...(draft.type === "DOMICILIO" ? { domicilio: delivery } : {}) };
        const result = await mutation("POST", "/pedidos", body);
        if ("queued" in result) toast.success("Pedido guardado sin conexión; quedará pendiente de envío a preparación");
        else { await sendPending(result.data as ApiOrder); toast.success("Pedido creado y enviado a preparación"); }
      }
      setDraft(null); setCart([]); await load(true);
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  };

  const occupy = async (table: ApiTable) => { try { await api.patch(`/mesas/${table.id}/ocupar-sin-pedido`, { motivo: "Cliente ubicado sin pedido" }); toast.success(`Mesa ${table.numero} ocupada`); await load(true); } catch (error) { toast.error(errorMessage(error)); } };
  const release = async (table: ApiTable) => { try { await api.patch(`/mesas/${table.id}/liberar-sin-consumo`, { motivo: "Cliente se retiró sin consumo" }); toast.success(`Mesa ${table.numero} liberada`); await load(true); } catch (error) { toast.error(errorMessage(error)); } };
  const cancelOrder = async (order: ApiOrder) => { if (!window.confirm(`¿Cancelar el pedido #${order.id}? Esta acción quedará auditada.`)) return; try { await api.patch(`/pedidos/${order.id}/cancelar`, {}); toast.success("Pedido cancelado"); setDraft(null); await load(true); } catch (error) { toast.error(errorMessage(error)); } };

  if (loading) return <LoadingState label="Cargando salón, carta y pedidos…"/>;
  if (failure) return <ErrorState detail={failure.message} requestId={failure.requestId} retry={() => void load()}/>;
  return <div>
    <div className="section-title"><div><p className="eyebrow">Operación en tiempo real</p><h1 className="page-title">Salón y pedidos</h1></div><div className="flex flex-wrap gap-2">
      {(["MOSTRADOR", "PARA_LLEVAR", "DOMICILIO"] as OrderType[]).map((type) => <button className="secondary h-11 w-auto px-4 text-sm" key={type} onClick={() => openNew(type)}><Plus size={16}/>{typeLabels[type]}</button>)}
      <button className="secondary h-11 w-11 px-0" aria-label="Actualizar" onClick={() => void load()}><RefreshCw size={17}/></button>
    </div></div>
    <div className="mt-6 flex flex-wrap gap-2"><button className={`salon-filter ${zone === "all" ? "active" : ""}`} onClick={() => setZone("all")}>Todas las zonas</button>{zones.map((item) => <button className={`salon-filter ${zone === item.id ? "active" : ""}`} onClick={() => setZone(item.id)} key={item.id}>{item.nombre}</button>)}</div>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{visibleTables.map((table) => { const order = orderByTable.get(table.id); return <article className={`table-card ${table.situacion.toLowerCase()}`} key={table.id}>
      <span className="text-xs font-bold uppercase tracking-wider opacity-45">{table.zona.nombre}</span><strong className="mt-2 text-3xl font-black">Mesa {table.numero}</strong><span className="mt-2 flex items-center gap-1 text-xs opacity-55"><Users size={13}/>{table.capacidad} personas</span>
      <span className="mt-4 text-xs font-extrabold">{table.situacion === "LIBRE" ? "Disponible" : table.situacion === "OCUPADA" ? "En servicio" : "Pendiente de pago"}</span>
      {table.situacion === "LIBRE" && <><button className="primary mt-3 h-10 text-xs" onClick={() => openNew("MESA", table)}>Tomar pedido</button>{hasPermission("MESAS_EDITAR") && <button className="mt-2 text-xs font-bold text-denim/55" onClick={() => void occupy(table)}>Ocupar sin pedido</button>}</>}
      {order && <button className="primary mt-3 h-10 text-xs" onClick={() => void openExisting(order)}>Ver pedido #{order.id}</button>}
      {!order && table.ocupacionManual && hasPermission("MESAS_EDITAR") && <button className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-700" onClick={() => void release(table)}><Unlock size={13}/>Liberar sin consumo</button>}
    </article>; })}</div>
    <section className="mt-8"><div className="section-title"><div><p className="eyebrow">Seguimiento</p><h2 className="text-2xl font-black">Pedidos activos</h2></div><span className="text-sm text-denim/45">{orders.length} en curso</span></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">{orders.map((order) => <button className="card flex min-h-36 flex-col text-left" key={order.id} onClick={() => void openExisting(order)}><div className="flex w-full justify-between gap-3"><strong>#{order.id} · {order.mesa ? `Mesa ${order.mesa.numero}` : typeLabels[order.tipo]}</strong><span className="status-pill">{order.estado.replaceAll("_", " ")}</span></div><span className="mt-3 text-sm text-denim/55">{order.detalles.reduce((sum, detail) => sum + detail.cantidad, 0)} productos · {money.format(Number(order.total))}</span><span className="mt-auto pt-4 text-xs font-bold text-denim/45">Abrir cuenta preliminar y gestionar</span></button>)}</div>
    </section>
    {draft && <div className="fixed inset-0 z-50 flex justify-end bg-steel/45"><section className="h-full w-full max-w-3xl overflow-y-auto bg-[#f7f5ef] p-5 sm:p-8">
      <div className="section-title"><div><p className="eyebrow">{draft.existing ? `Pedido #${draft.existing.id}` : "Nuevo pedido"}</p><h2 className="text-3xl font-black">{draft.table ? `Mesa ${draft.table.numero}` : typeLabels[draft.type]}</h2></div><button onClick={() => setDraft(null)} aria-label="Cerrar"><X/></button></div>
      {draft.existing && <div className="mt-5 card"><div className="flex items-center gap-2"><ClipboardList/><h3 className="font-black">Cuenta preliminar</h3></div>{draft.existing.detalles.map((detail) => <div className="mt-3 flex justify-between gap-3 text-sm" key={detail.id}><span>{detail.cantidad}× {detail.producto.nombre}{detail.observaciones && <small className="block text-denim/45">{detail.observaciones}</small>}</span><b>{money.format(Number(detail.subtotal))}</b></div>)}<div className="mt-4 flex justify-between border-t border-denim/10 pt-4"><b>Total actual</b><strong className="text-xl">{money.format(Number(draft.existing.total))}</strong></div>
        {pendingCommandDetails(draft.existing).length > 0 && hasPermission("COMANDAS_ENVIAR") && hasCapability("KDS") && <button className="secondary mt-4 h-11" onClick={async () => { try { await sendPending(draft.existing!); toast.success("Pendientes enviados a preparación"); await openExisting(draft.existing!); } catch (error) { toast.error(errorMessage(error)); } }}><AlertCircle size={16}/>Enviar pendientes a preparación</button>}
      </div>}
      {draft.type === "DOMICILIO" && !draft.existing && <div className="mt-5 grid gap-3 sm:grid-cols-2"><input className="input" placeholder="Destinatario" value={delivery.destinatario} onChange={(e) => setDelivery({...delivery,destinatario:e.target.value})}/><input className="input" placeholder="Teléfono" value={delivery.telefono} onChange={(e) => setDelivery({...delivery,telefono:e.target.value})}/><input className="input sm:col-span-2" placeholder="Dirección" value={delivery.direccion} onChange={(e) => setDelivery({...delivery,direccion:e.target.value})}/><input className="input" placeholder="Referencias" value={delivery.referencias} onChange={(e) => setDelivery({...delivery,referencias:e.target.value})}/><input className="input" type="number" min="0" placeholder="Costo domicilio" value={delivery.costo} onChange={(e) => setDelivery({...delivery,costo:Number(e.target.value)})}/></div>}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2"><button className={`salon-filter ${category === "all" ? "active" : ""}`} onClick={() => setCategory("all")}>Toda la carta</button>{categories.map((item) => <button className={`salon-filter ${category === item.id ? "active" : ""}`} onClick={() => setCategory(item.id)} key={item.id}>{item.nombre}</button>)}</div><input className="input mt-3" placeholder="Buscar producto" value={search} onChange={(e) => setSearch(e.target.value)}/>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{visibleProducts.map((product) => <button className="card flex items-center gap-3 p-4 text-left" onClick={() => add(product)} key={product.id}><span className="h-10 w-1 rounded-full bg-orange-400"/><span className="flex-1"><strong className="block">{product.nombre}</strong><small className="text-denim/45">{product.categoria.nombre}</small></span><b>{money.format(Number(product.precio))}</b></button>)}</div>
      <div className="mt-6 card"><div className="flex items-center gap-2"><ShoppingBag/><h3 className="text-lg font-black">{draft.existing ? "Agregar productos" : "Pedido"}</h3></div>{!cart.length ? <p className="py-8 text-center text-sm text-denim/40">Selecciona productos de la carta.</p> : cart.map((line) => <div className="border-b border-denim/7 py-3" key={line.product.id}><div className="flex items-center gap-3"><span className="flex-1 font-bold">{line.product.nombre}</span><button className="qty" onClick={() => change(line.product.id,-1)}><Minus size={14}/></button><b>{line.quantity}</b><button className="qty" onClick={() => change(line.product.id,1)}><Plus size={14}/></button><b className="w-24 text-right">{money.format(Number(line.product.precio)*line.quantity)}</b></div><input className="mt-2 w-full rounded-xl border border-denim/10 bg-denim/[.02] px-3 py-2 text-sm outline-none focus:border-marigold" maxLength={300} placeholder="Observaciones: sin cebolla, término medio…" value={line.notes} onChange={(e) => setNotes(line.product.id,e.target.value)}/></div>)}
        <div className="mt-5 flex justify-between"><span className="text-sm text-denim/45">{draft.existing ? "Adición" : "Total estimado"}</span><strong className="text-2xl">{money.format(cartTotal(cart) + (!draft.existing && draft.type === "DOMICILIO" ? delivery.costo : 0))}</strong></div><button disabled={!cart.length || saving} className="primary mt-5" onClick={() => void submit()}>{saving ? "Guardando…" : draft.existing ? "Agregar y enviar a preparación" : "Crear y enviar a preparación"}</button>
        {draft.existing && hasPermission("PEDIDOS_CANCELAR") && <button className="mt-4 w-full text-sm font-bold text-red-600" onClick={() => void cancelOrder(draft.existing!)}>Cancelar pedido</button>}
      </div>
    </section></div>}
  </div>;
}
