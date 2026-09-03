import {
  AlertTriangle, Ban, CheckCircle2, ChefHat, Clock3, CreditCard, FileText, Heart,
  Merge, Minus, MoreHorizontal, Plus, Search, Send, ShoppingBag, Split, Star,
  Trash2, Unlock, UserRound, UserRoundCog, Users, UtensilsCrossed, Wine, X,
  ArrowRightLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { menu, money } from "../data/demo";
import { useApp } from "../store/app";
import type { MenuItem, Order, OrderLine, ProductModifier, Table } from "../types";

type DraftLine = OrderLine & { key: string };
const waiters = ["Juan", "Laura", "Carlos", "Andrea"];

function minutesSince(date: string) {
  return Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
}

function stationLabel(order: Order | undefined, station: "COCINA" | "BAR") {
  if (!order) return { text: "Sin pedido", tone: "text-denim/45", progress: "0/0" };
  const lines = order.items.filter((item) => item.station === station);
  if (!lines.length) return { text: "No aplica", tone: "text-denim/35", progress: "0/0" };
  const state = order.stationStatus[station];
  const done = lines.filter((item) => item.lineStatus === "LISTA" || item.lineStatus === "ENTREGADA").length;
  const tone = state === "ENTREGADO" || state === "LISTO" ? "text-emerald-700" : state === "PREPARANDO" ? "text-amber-700" : "text-orange-700";
  const text = state === "ENTREGADO" ? "Entregado" : state === "LISTO" ? "Listo" : state === "PREPARANDO" ? "Preparando" : "Pendiente";
  return { text, tone, progress: `${done}/${lines.length}` };
}

function lineStatusLabel(line: OrderLine, order: Order) {
  if (line.lineStatus) return line.lineStatus;
  const station = order.stationStatus[line.station];
  if (station === "ENTREGADO") return "ENTREGADA";
  if (station === "LISTO") return "LISTA";
  if (station === "PREPARANDO") return "PREPARANDO";
  return "ENVIADA";
}

function lineStatusTone(status: string) {
  if (status === "ENTREGADA") return "bg-emerald-50 text-emerald-700";
  if (status === "LISTA") return "bg-green-50 text-green-700";
  if (status === "PREPARANDO") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function suggestedAction(order: Order | undefined) {
  if (!order) return { title: "Tomar pedido", detail: "Mesa abierta sin consumo registrado." };
  if (order.paymentStatus === "PAGADO") return { title: "Cerrar y liberar mesa", detail: "El pago ya está registrado." };
  if (order.stationStatus.COCINA === "LISTO") return { title: "Retirar cocina", detail: "Hay productos listos esperando servicio." };
  if (order.stationStatus.BAR === "LISTO") return { title: "Retirar bar", detail: order.serviceAlert ?? "Hay bebidas listas esperando servicio." };
  if (order.serviceAlert && (order.stationStatus.COCINA === "PREPARANDO" || order.stationStatus.BAR === "PREPARANDO")) return { title: "Atender demora", detail: order.serviceAlert };
  if (order.accountRequested || order.status === "PENDIENTE_PAGO") return { title: "Llevar cuenta / cobrar", detail: order.accountRequestNote ? `Cuenta solicitada · ${order.accountRequestNote}` : "La mesa está esperando cobro." };
  if (order.stationStatus.COCINA === "PREPARANDO" || order.stationStatus.BAR === "PREPARANDO") return { title: "Seguimiento de preparación", detail: "Hay productos en preparación." };
  if (order.stationStatus.COCINA === "ENTREGADO" && order.stationStatus.BAR === "ENTREGADO") return { title: "Sugerir solicitar cuenta", detail: "Todo el pedido fue entregado; la mesa aún no ha solicitado cuenta." };
  return { title: "Enviar nuevas líneas", detail: "Puedes continuar agregando productos al pedido." };
}

export function DemoSalonPage() {
  const { tables, orders, createOrder, appendOrderLines, requestAccount, releaseTable, occupyWithoutOrder } = useApp();
  const [selected, setSelected] = useState<Table | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [unavailable, setUnavailable] = useState<number[]>([]);
  const [guestOverrides, setGuestOverrides] = useState<Record<number, number>>({});
  const [waiterOverrides, setWaiterOverrides] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [availabilityMenu, setAvailabilityMenu] = useState<number | null>(null);
  const [mergedTables, setMergedTables] = useState<Record<number, number | null>>({});

  const currentOrder = selected?.orderId ? orders.find((order) => order.id === selected.orderId) : undefined;
  const categories = ["Todos", ...Array.from(new Set(menu.map((item) => item.category)))];
  const filteredMenu = useMemo(() => menu.filter((item) => {
    const matchesQuery = !query.trim() || `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "Todos" || item.category === category;
    const matchesFavorite = !favoritesOnly || item.favorite;
    return matchesQuery && matchesCategory && matchesFavorite;
  }), [query, category, favoritesOnly]);

  const tableOrder = (table: Table) => table.orderId ? orders.find((order) => order.id === table.orderId) : undefined;
  const closeWorkspace = () => { setSelected(null); setDraft([]); setQuery(""); setCategory("Todos"); setAvailabilityMenu(null); };

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected]);

  const add = (item: MenuItem) => {
    if (unavailable.includes(item.id) || item.available === false) return toast.error(`${item.name} está agotado`);
    setDraft((lines) => {
      const found = lines.find((line) => line.id === item.id && !line.selectedModifiers?.length && !line.note);
      if (found) return lines.map((line) => line.key === found.key ? { ...line, quantity: line.quantity + 1 } : line);
      return [...lines, { ...item, quantity: 1, sent: false, note: "", selectedModifiers: [], key: `${item.id}-${Date.now()}` }];
    });
  };

  const change = (key: string, delta: number) => setDraft((lines) => lines.map((line) => line.key === key ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0));
  const removeLine = (key: string) => setDraft((lines) => lines.filter((line) => line.key !== key));
  const toggleModifier = (key: string, modifier: ProductModifier) => setDraft((lines) => lines.map((line) => {
    if (line.key !== key) return line;
    const selectedModifiers = line.selectedModifiers ?? [];
    return { ...line, selectedModifiers: selectedModifiers.some((item) => item.id === modifier.id) ? selectedModifiers.filter((item) => item.id !== modifier.id) : [...selectedModifiers, modifier] };
  }));
  const lineTotal = (line: OrderLine) => (line.price + (line.selectedModifiers ?? []).reduce((sum, modifier) => sum + modifier.price, 0)) * line.quantity;
  const existingTotal = currentOrder?.total ?? 0;
  const draftTotal = draft.reduce((sum, line) => sum + lineTotal(line), 0);

  const sendNewLines = () => {
    if (!selected || !draft.length) return;
    const cleanLines = draft.map((draftLine): OrderLine => {
      const { key: draftKey, ...line } = draftLine;
      void draftKey;
      return { ...line, sent: true, lineStatus: "ENVIADA" as const };
    });
    if (!currentOrder) {
      const id = orders.reduce((maxId, order) => Math.max(maxId, order.id), 0) + 1;
      createOrder({
        id, table: selected.number, createdAt: new Date().toISOString(), status: "NUEVO",
        items: cleanLines, total: draftTotal, paymentStatus: "PENDIENTE",
        stationStatus: {
          COCINA: cleanLines.some((line) => line.station === "COCINA") ? "PENDIENTE" : "NO_APLICA",
          BAR: cleanLines.some((line) => line.station === "BAR") ? "PENDIENTE" : "NO_APLICA",
        },
        waiter: waiterOverrides[selected.id] ?? "Juan",
        guests: guestOverrides[selected.id] ?? Math.min(selected.seats, 2),
        note: notes[selected.id],
      });
      toast.success("Pedido creado y enviado a cocina/bar");
    } else {
      appendOrderLines(currentOrder.id, cleanLines);
      toast.success(`${draft.length} línea(s) nueva(s) enviadas; el pedido anterior no se reenvió`);
    }
    setDraft([]);
  };

  return (
    <div>
      <div className="section-title gap-4">
        <div>
          <p className="eyebrow">Salón y terraza · Mesa Inteligente</p>
          <h1 className="page-title">Centro operativo de mesas</h1>
          <p className="mt-2 max-w-2xl text-sm text-denim/55">Cada tarjeta muestra qué necesita atención. Toca cualquier mesa para operar pedido, cocina, bar y cuenta sin salir del salón.</p>
        </div>
        <div className="hidden gap-3 text-xs lg:flex">
          <span><i className="legend bg-emerald-500"/> Libre</span>
          <span><i className="legend bg-orange-400"/> En servicio</span>
          <span><i className="legend bg-marigold"/> Por cobrar</span>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {tables.map((table) => {
          const order = tableOrder(table);
          const action = suggestedAction(order);
          const kitchen = stationLabel(order, "COCINA");
          const bar = stationLabel(order, "BAR");
          const waiter = waiterOverrides[table.id] ?? order?.waiter;
          const guests = guestOverrides[table.id] ?? order?.guests ?? table.seats;
          return (
            <button key={table.id} onClick={() => setSelected(table)} className={`table-card ${table.state.toLowerCase()} min-h-[245px] text-left transition hover:-translate-y-0.5 hover:shadow-lg`}>
              <div className="flex w-full items-start justify-between gap-3">
                <div><span className="text-[10px] font-black uppercase tracking-[.18em] opacity-40">{table.zone}</span><strong className="mt-1 block text-3xl font-black">Mesa {table.number}</strong></div>
                {order && <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black"><Clock3 size={11} className="mr-1 inline"/>{minutesSince(order.createdAt)} min</span>}
              </div>
              {order ? <>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-denim/55"><span><UserRound size={12} className="mr-1 inline"/>{waiter ?? "Sin mesero"}</span><span><Users size={12} className="mr-1 inline"/>{guests} personas</span></div>
                <strong className="mt-3 block text-xl">{money.format(order.total)}</strong>
                <div className="mt-3 space-y-1.5 rounded-xl bg-white/55 p-3 text-xs">
                  <div className={`flex justify-between gap-2 ${kitchen.tone}`}><span><ChefHat size={13} className="mr-1 inline"/>Cocina · {kitchen.text}</span><b>{kitchen.progress}</b></div>
                  <div className={`flex justify-between gap-2 ${bar.tone}`}><span><Wine size={13} className="mr-1 inline"/>Bar · {bar.text}</span><b>{bar.progress}</b></div>
                </div>
                {(order.serviceAlert || order.accountRequested) && <p className="mt-2 line-clamp-1 text-[11px] font-semibold text-amber-800"><AlertTriangle size={11} className="mr-1 inline"/>{order.serviceAlert ?? `Cuenta solicitada${order.accountRequestNote ? ` · ${order.accountRequestNote}` : ""}`}</p>}
                <span className="mt-3 block text-[11px] font-black uppercase tracking-wide">Acción sugerida: {action.title}</span>
              </> : <>
                <span className="mt-4 flex items-center gap-1 text-xs opacity-55"><Users size={13}/>{table.seats} puestos</span>
                <div className="flex min-h-[125px] flex-col justify-end">
                  <p className="text-sm font-extrabold">Disponible · abrir mesa</p>
                  <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); occupyWithoutOrder(table.id); toast.success(`Mesa ${table.number} ocupada sin consumo`); }} className="mt-3 inline-flex w-fit rounded-lg border border-denim/10 px-2 py-1 text-[10px] font-bold">Sólo ocupar</span>
                </div>
              </>}
            </button>
          );
        })}
      </div>

      {selected && createPortal(
        <div className="fixed inset-0 z-[1000] overflow-y-auto overscroll-contain bg-[#f4f1eb]">
          <section className="mx-auto max-w-[1450px] p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="eyebrow">Mesa Inteligente · {selected.zone}</p><h2 className="text-3xl font-black">Mesa {selected.number}{currentOrder ? ` · ${minutesSince(currentOrder.createdAt)} min · ${waiterOverrides[selected.id] ?? currentOrder.waiter ?? "Sin mesero"}` : " · disponible"}</h2></div>
              <button onClick={closeWorkspace} className="rounded-full p-2 hover:bg-denim/5"><X/></button>
            </div>

            {currentOrder && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card p-4"><small className="text-denim/45">Total acumulado</small><strong className="mt-1 block text-2xl">{money.format(existingTotal + draftTotal)}</strong></div>
              <div className="card p-4"><small className="text-denim/45">Comensales</small><div className="mt-2 flex items-center gap-2"><button className="qty" onClick={() => setGuestOverrides((v) => ({ ...v, [selected.id]: Math.max(1, (v[selected.id] ?? currentOrder.guests ?? 1) - 1) }))}><Minus size={13}/></button><b>{guestOverrides[selected.id] ?? currentOrder.guests ?? 1}</b><button className="qty" onClick={() => setGuestOverrides((v) => ({ ...v, [selected.id]: (v[selected.id] ?? currentOrder.guests ?? 1) + 1 }))}><Plus size={13}/></button></div></div>
              <div className="card p-4"><small className="text-denim/45">Cocina</small><strong className={`mt-1 block ${stationLabel(currentOrder,"COCINA").tone}`}>{stationLabel(currentOrder,"COCINA").progress} · {stationLabel(currentOrder,"COCINA").text}</strong></div>
              <div className="card p-4"><small className="text-denim/45">Bar</small><strong className={`mt-1 block ${stationLabel(currentOrder,"BAR").tone}`}>{stationLabel(currentOrder,"BAR").progress} · {stationLabel(currentOrder,"BAR").text}</strong></div>
            </div>}

            <div className="mt-5 rounded-2xl border border-marigold/40 bg-marigold/10 p-4">
              <div className="flex items-center gap-2 text-sm font-black"><AlertTriangle size={17}/> Acción sugerida</div>
              <p className="mt-1 text-lg font-black">{suggestedAction(currentOrder).title}</p>
              <p className="mt-1 text-xs text-denim/60">{suggestedAction(currentOrder).detail}</p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button className="card flex items-center gap-2 p-3 text-sm font-bold" onClick={() => toast.success("Selecciona la mesa destino para trasladar el consumo")}><ArrowRightLeft size={17}/> Trasladar</button>
              {!mergedTables[selected.id] ? <button className="card flex items-center gap-2 p-3 text-sm font-bold" onClick={() => { const target = tables.find((table) => table.id !== selected.id && table.state === "LIBRE"); if (!target) return toast.error("No hay mesa libre disponible para unir en la demo"); setMergedTables((v) => ({ ...v, [selected.id]: target.id })); toast.success(`Mesa ${selected.number} unida con Mesa ${target.number}`); }}><Merge size={17}/> Unir mesa</button> : <button className="card flex items-center gap-2 p-3 text-sm font-bold" onClick={() => { setMergedTables((v) => ({ ...v, [selected.id]: null })); toast.success("Mesas separadas"); }}><Split size={17}/> Separar mesa</button>}
              <button className="card flex items-center gap-2 p-3 text-sm font-bold" onClick={() => { const current = waiterOverrides[selected.id] ?? currentOrder?.waiter ?? waiters[0]; const next = waiters[(waiters.indexOf(current) + 1) % waiters.length]; setWaiterOverrides((v) => ({ ...v, [selected.id]: next })); toast.success(`Mesero cambiado a ${next}`); }}><UserRoundCog size={17}/> Cambiar mesero</button>
              <button className="card flex items-center gap-2 p-3 text-sm font-bold" onClick={() => toast.success("División de cuenta abierta por productos/comensal")}><Split size={17}/> Dividir cuenta</button>
              {currentOrder?.paymentStatus === "PAGADO" ? (
                <button className="card flex items-center gap-2 p-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-200" onClick={() => { releaseTable(selected.id); closeWorkspace(); toast.success(`Mesa ${selected.number} cerrada y liberada`); }}><Unlock size={17}/> Cerrar y liberar mesa</button>
              ) : currentOrder ? (
                <button disabled={currentOrder.accountRequested} className={`card flex items-center gap-2 p-3 text-sm font-bold ${currentOrder.accountRequested ? "cursor-default text-emerald-700 opacity-70" : ""}`} onClick={() => { if (!currentOrder.accountRequested) { requestAccount(currentOrder.id, "Cliente pidió pago mixto"); toast.success("Cuenta solicitada · Caja fue notificada"); } }}><CreditCard size={17}/>{currentOrder.accountRequested ? "Cuenta solicitada ✓" : "Solicitar cuenta"}</button>
              ) : null}
              <button className="card flex items-center gap-2 p-3 text-sm font-bold" onClick={() => toast.success("La observación general queda asociada a la mesa en esta demostración")}><FileText size={17}/> Observaciones</button>
              {!currentOrder && selected.state !== "LIBRE" && <button className="card flex items-center gap-2 p-3 text-sm font-bold text-emerald-700" onClick={() => { releaseTable(selected.id); closeWorkspace(); toast.success("Mesa liberada sin consumo"); }}><Unlock size={17}/> Liberar sin consumo</button>}
            </div>

            {currentOrder && <div className="mt-6 card">
              <div className="flex items-center justify-between"><div className="flex items-center gap-2"><ShoppingBag/><h3 className="text-lg font-black">Pedido actual</h3></div><span className="text-xs font-bold text-denim/45">#{currentOrder.id}</span></div>
              <div className="mt-3 divide-y divide-denim/7">
                {currentOrder.items.map((item, index) => {
                  const state = lineStatusLabel(item, currentOrder);
                  return <div key={`${item.id}-${index}`} className="flex items-start gap-3 py-3">
                    <span className="flex-1"><b>{item.quantity}× {item.name}</b><small className="mt-1 block text-denim/45">{item.station.toLowerCase()}</small>{item.note && <small className="block text-amber-700">{item.note}</small>}{!!item.selectedModifiers?.length && <small className="block text-denim/50">{item.selectedModifiers.map((modifier) => modifier.name).join(" · ")}</small>}</span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${lineStatusTone(state)}`}>{state.toLowerCase()}</span>
                    <b>{money.format(lineTotal(item))}</b>
                    {state === "ENTREGADA" && <CheckCircle2 size={16} className="text-emerald-600"/>}
                  </div>;
                })}
              </div>
            </div>}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-denim/10 bg-white px-3 py-2"><Search size={17} className="text-denim/40"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto..." className="w-full bg-transparent text-sm outline-none"/></div>
                  <button onClick={() => setFavoritesOnly((v) => !v)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${favoritesOnly ? "border-marigold bg-marigold/20" : "border-denim/10 bg-white"}`}><Star size={16} className="mr-1 inline"/> Favoritos</button>
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{categories.map((name) => <button key={name} onClick={() => setCategory(name)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${category === name ? "bg-denim text-white" : "bg-white text-denim/60"}`}>{name}</button>)}</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {filteredMenu.map((item) => {
                    const exhausted = unavailable.includes(item.id) || item.available === false;
                    return <div key={item.id} className={`card relative p-4 ${exhausted ? "opacity-55" : ""}`}>
                      <button disabled={exhausted} onClick={() => add(item)} className="flex w-full items-center gap-3 text-left">
                        <span className={`h-10 w-1 rounded-full ${item.station === "BAR" ? "bg-blue-400" : "bg-orange-400"}`}/><span className="flex-1"><strong className="block">{item.name}{item.favorite && <Heart size={13} className="ml-1 inline fill-current text-marigold"/>}</strong><small className="text-denim/45">{item.category} · {item.station.toLowerCase()}</small>{exhausted && <small className="mt-1 block font-bold text-red-600">Agotado</small>}</span><b>{money.format(item.price)}</b>
                      </button>
                      <button aria-label={`Disponibilidad de ${item.name}`} onClick={() => setAvailabilityMenu((value) => value === item.id ? null : item.id)} className="absolute bottom-2 right-2 rounded-full p-1.5 text-denim/35 hover:bg-denim/5 hover:text-denim"><MoreHorizontal size={15}/></button>
                      {availabilityMenu === item.id && <div className="absolute bottom-10 right-2 z-10 rounded-xl border border-denim/10 bg-white p-2 shadow-xl"><button onClick={() => { setUnavailable((v) => v.includes(item.id) ? v.filter((id) => id !== item.id) : [...v, item.id]); setAvailabilityMenu(null); toast.success(exhausted ? `${item.name} disponible nuevamente` : `${item.name} marcado agotado`); }} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-denim/5"><Ban size={13}/>{exhausted ? "Reactivar producto" : "Marcar agotado"}</button></div>}
                    </div>;
                  })}
                </div>
              </div>

              <div className="card h-fit lg:sticky lg:top-4">
                <div className="flex items-center gap-2"><UtensilsCrossed/><h3 className="text-lg font-black">Líneas nuevas</h3></div>
                {!draft.length ? <p className="py-8 text-center text-sm text-denim/40">Agrega productos. Sólo estas líneas se enviarán nuevamente a cocina/bar.</p> : <div className="mt-4 divide-y divide-denim/7">{draft.map((line) => <div key={line.key} className="py-3">
                  <div className="flex items-center gap-2"><span className="min-w-0 flex-1"><b className="block truncate">{line.name}</b><small className="text-denim/45">{line.station.toLowerCase()}</small></span><button className="qty" onClick={() => change(line.key,-1)}><Minus size={13}/></button><b>{line.quantity}</b><button className="qty" onClick={() => change(line.key,1)}><Plus size={13}/></button><b className="w-24 text-right">{money.format(lineTotal(line))}</b><button onClick={() => removeLine(line.key)} className="rounded-lg p-1.5 text-denim/35 hover:bg-red-50 hover:text-red-600"><Trash2 size={14}/></button></div>
                  {!!line.modifiers?.length && <div className="mt-2 flex flex-wrap gap-1">{line.modifiers.map((modifier) => { const active = line.selectedModifiers?.some((item) => item.id === modifier.id); return <button key={modifier.id} onClick={() => toggleModifier(line.key, modifier)} className={`rounded-full px-2 py-1 text-[10px] font-bold ${active ? "bg-marigold/30" : "bg-denim/5"}`}>{modifier.name}{modifier.price ? ` +${money.format(modifier.price)}` : ""}</button>; })}</div>}
                  {!!line.selectedModifiers?.length && <p className="mt-2 text-[10px] font-semibold text-denim/55">Seleccionado: {line.selectedModifiers.map((modifier) => modifier.name).join(" · ")}</p>}
                  <input value={line.note ?? ""} onChange={(e) => setDraft((lines) => lines.map((item) => item.key === line.key ? { ...item, note: e.target.value } : item))} placeholder="Observación del producto" className="mt-2 w-full rounded-lg border border-denim/10 bg-white px-2 py-1.5 text-xs outline-none"/>
                </div>)}</div>}

                <div className="mt-4 border-t border-denim/10 pt-4">
                  <label className="text-xs font-black uppercase tracking-wide text-denim/45">Observación general de la mesa</label>
                  <textarea value={notes[selected.id] ?? currentOrder?.note ?? ""} onChange={(e) => setNotes((v) => ({ ...v, [selected.id]: e.target.value }))} placeholder="Ej. celebrar cumpleaños, mesa cerca de ventana..." className="mt-2 min-h-20 w-full rounded-xl border border-denim/10 bg-white p-3 text-sm outline-none"/>
                </div>
                {currentOrder?.accountRequested && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CreditCard size={14} className="mr-1 inline"/>Cuenta solicitada{currentOrder.accountRequestNote ? ` · ${currentOrder.accountRequestNote}` : ""}</div>}
                <div className="mt-4 flex items-center justify-between border-t border-denim/10 pt-4"><span className="text-sm text-denim/45">Nuevas líneas</span><strong className="text-xl">{money.format(draftTotal)}</strong></div>
                <button disabled={!draft.length} onClick={sendNewLines} className="primary mt-4"><Send size={16} className="mr-2 inline"/>{currentOrder ? "Enviar sólo líneas nuevas" : "Crear pedido y enviar"}</button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
