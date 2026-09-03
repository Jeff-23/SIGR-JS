import { AlertTriangle, ArrowRight, ChefHat, CircleDollarSign, Clock3, Filter, Gauge, Receipt, Table2, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { money } from "../data/demo";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import type { Order } from "../types";

type Priority = "NORMAL" | "ATENCION" | "URGENTE" | "CRITICO";
type Area = "COCINA" | "BAR" | "SALON" | "CAJA";
type TimelineItem = { tipo: string; etiqueta: string; ocurridoEn: string; metadata?: unknown };
type Case = {
  pedidoId: number; mesaId: number | null; mesa: string; mesero: string | null; total: number; estado: string;
  etapa: string; area: Area; estacion: string | null; minutosEnEtapa: number; objetivoMin: number | null;
  retrasoMin: number; prioridad: Priority; accion: Area;
  progreso: { cocina: { total: number; listas: number }; bar: { total: number; listas: number }; listas: number; total: number; parcial: boolean };
  timeline: TimelineItem[];
};
type Station = { codigo: string; nombre: string; pendientes: number; preparando: number; listas: number; retrasadas: number; tiempoPromedioActual: number };
type OperationalCenterData = {
  generadoEn: string; actualizacionSegundos: number;
  resumen: { mesasOcupadas: number; mesasEsperandoAtencion: number; pedidosEnPreparacion: number; pedidosRetrasados: number; listosSinRetirar: number; cuentasSolicitadas: number; pendientesPago: number; tiempoPromedioOperativoActual: number; situacionesAtencion: number };
  cola: Case[]; estaciones: Station[]; alertasRegla: { nivel: Priority; area: string; mensaje: string }[]; nota: string;
};

const priorityWeight: Record<Priority, number> = { NORMAL: 0, ATENCION: 1, URGENTE: 2, CRITICO: 3 };
const priorityClass: Record<Priority, string> = {
  NORMAL: "border-emerald-300 bg-emerald-50/70",
  ATENCION: "border-amber-300 bg-amber-50/80",
  URGENTE: "border-orange-400 bg-orange-50/90",
  CRITICO: "border-red-500 bg-red-50",
};

function demoTimeline(order: Order): TimelineItem[] {
  const op = order.operational;
  if (!op) return [];
  return [
    ["PEDIDO_CREADO", "Pedido tomado", order.createdAt],
    ["ENVIADO_ESTACION", "Enviado a estación", op.sentAt],
    ["PREPARACION_INICIADA", "Preparación iniciada", op.preparationStartedAt],
    ["LISTO_ESTACION", "Estación lista", op.readyAt],
    ["RETIRADO_ESTACION", "Retirado para servicio", op.retiredAt],
    ["ENTREGADO_CLIENTE", "Entregado", op.deliveredAt],
    ["CUENTA_SOLICITADA", "Cuenta solicitada", op.accountRequestedAt],
    ["PAGO_COMPLETADO", "Pago completado", op.paidAt],
  ].filter((item): item is [string, string, string] => Boolean(item[2])).map(([tipo, etiqueta, ocurridoEn]) => ({ tipo, etiqueta, ocurridoEn }));
}

function demoCenterData(orders: Order[], tables: ReturnType<typeof useApp.getState>["tables"], now: number): OperationalCenterData {
  const active = orders.filter((order) => order.paymentStatus !== "PAGADO" && order.operational?.stage !== "PAGADO");
  const cases: Case[] = active.map((order) => {
    const op = order.operational;
    const minutes = Math.max(0, Math.floor((now - new Date(op?.stageStartedAt ?? order.createdAt).getTime()) / 60000));
    let etapa = "Pedido creado esperando estación";
    let area: Area = "SALON";
    let objetivo: number | null = 5;
    let accion: Area = "SALON";
    if (op?.stage === "EN_PREPARACION") { etapa = "Pedido en preparación"; area = op.station === "BAR" ? "BAR" : "COCINA"; accion = area; objetivo = area === "BAR" ? 8 : 15; }
    if (op?.stage === "LISTO_ESPERANDO_RETIRO") { etapa = "Comida o bebida lista sin retirar"; area = op.station === "BAR" ? "BAR" : "COCINA"; accion = area; objetivo = 5; }
    if (op?.stage === "RETIRADO_ESPERANDO_ENTREGA") { etapa = "Retirado esperando entrega"; area = "SALON"; accion = "SALON"; objetivo = 4; }
    if (op?.stage === "ENTREGADO_ESPERANDO_CUENTA") { etapa = "Mesa atendida"; area = "SALON"; accion = "SALON"; objetivo = 20; }
    if (op?.stage === "CUENTA_SOLICITADA") { etapa = "Cuenta solicitada esperando pago"; area = "CAJA"; accion = "CAJA"; objetivo = 8; }
    const stationLines = (station: "COCINA" | "BAR") => {
      const list = order.items.filter((item) => item.station === station);
      return { total: list.reduce((sum, item) => sum + item.quantity, 0), listas: list.filter((item) => item.lineStatus === "LISTA" || item.lineStatus === "ENTREGADA").reduce((sum, item) => sum + item.quantity, 0) };
    };
    const cocina = stationLines("COCINA"); const bar = stationLines("BAR"); const total = cocina.total + bar.total; const listas = cocina.listas + bar.listas;
    const parcial = total > 0 && listas > 0 && listas < total;
    if (parcial && etapa === "Pedido en preparación") etapa = "Pedido parcialmente listo";
    const prioridad: Priority = !objetivo ? "NORMAL" : minutes >= Math.max(objetivo * 1.5, objetivo + 10) ? "CRITICO" : minutes > objetivo ? "URGENTE" : minutes >= Math.max(1, Math.floor(objetivo * .75)) ? "ATENCION" : "NORMAL";
    return { pedidoId: order.id, mesaId: tables.find((t) => t.number === order.table)?.id ?? null, mesa: `Mesa ${order.table}`, mesero: order.waiter ?? null, total: order.total, estado: order.status, etapa, area, estacion: op?.station ?? null, minutosEnEtapa: minutes, objetivoMin: objetivo, retrasoMin: objetivo ? Math.max(0, minutes - objetivo) : 0, prioridad, accion, progreso: { cocina, bar, listas, total, parcial }, timeline: demoTimeline(order) };
  }).sort((a, b) => priorityWeight[b.prioridad] - priorityWeight[a.prioridad] || b.retrasoMin - a.retrasoMin || b.minutosEnEtapa - a.minutosEnEtapa);
  const stations: Station[] = (["COCINA", "BAR"] as const).map((code) => {
    const relevant = active.filter((order) => order.stationStatus[code] !== "NO_APLICA");
    return { codigo: code, nombre: code === "COCINA" ? "Cocina" : "Bar", pendientes: relevant.filter((o) => o.stationStatus[code] === "PENDIENTE").length, preparando: relevant.filter((o) => o.stationStatus[code] === "PREPARANDO").length, listas: relevant.filter((o) => o.stationStatus[code] === "LISTO").length, retrasadas: cases.filter((c) => c.area === code && ["URGENTE", "CRITICO"].includes(c.prioridad)).length, tiempoPromedioActual: Math.round((cases.filter((c) => c.area === code).reduce((sum, c) => sum + c.minutosEnEtapa, 0) / Math.max(1, cases.filter((c) => c.area === code).length)) * 10) / 10 };
  });
  const attention = cases.filter((c) => c.prioridad !== "NORMAL").length;
  const occupied = tables.filter((t) => t.state === "OCUPADA" || t.state === "PENDIENTE_PAGO").length;
  const totalBacklog = stations.reduce((sum, s) => sum + s.pendientes + s.preparando, 0);
  const ruleAlerts = stations.flatMap((s) => totalBacklog >= 4 && (s.pendientes + s.preparando) / totalBacklog >= .7 ? [{ nivel: "URGENTE" as const, area: s.codigo, mensaje: `${s.nombre} concentra ${Math.round(((s.pendientes + s.preparando) / totalBacklog) * 100)} % de las comandas pendientes actuales.` }] : []);
  return { generadoEn: new Date(now).toISOString(), actualizacionSegundos: 15, resumen: { mesasOcupadas: occupied, mesasEsperandoAtencion: attention, pedidosEnPreparacion: cases.filter((c) => c.etapa.includes("preparación") || c.etapa.includes("parcialmente")).length, pedidosRetrasados: cases.filter((c) => ["URGENTE", "CRITICO"].includes(c.prioridad)).length, listosSinRetirar: cases.filter((c) => c.etapa.includes("lista sin retirar")).length, cuentasSolicitadas: cases.filter((c) => c.area === "CAJA").length, pendientesPago: active.filter((o) => o.status === "PENDIENTE_PAGO").length, tiempoPromedioOperativoActual: Math.round((cases.reduce((s, c) => s + c.minutosEnEtapa, 0) / Math.max(1, cases.length)) * 10) / 10, situacionesAtencion: attention + ruleAlerts.length }, cola: cases, estaciones: stations, alertasRegla: ruleAlerts, nota: "Modo demostración conectado a Salón, KDS y Caja. Las alertas cambian conforme se resuelve el flujo." };
}

export function OperationalCenterPage() {
  const navigate = useNavigate();
  const { session, branchId, orders, tables } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [data, setData] = useState<OperationalCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState<"TODAS" | Priority>("TODAS");
  const [area, setArea] = useState<"TODAS" | Area>("TODAS");
  const [waiter, setWaiter] = useState("TODOS");
  const [status, setStatus] = useState("TODOS");
  const [selected, setSelected] = useState<Case | null>(null);
  const demo = Boolean(session?.demo);
  const demoData = useMemo(() => demoCenterData(orders, tables, now), [orders, tables, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (demo || !branchId) return;
    let active = true;
    const load = async () => {
      try { const response = await api.get<OperationalCenterData>("/inteligencia/centro-operativo", { params: { sucursalId: branchId } }); if (active) { setData(response.data); setError(null); } }
      catch (cause) { if (active) setError(errorMessage(cause)); }
    };
    void load(); const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [branchId, demo]);

  const visible = demo ? demoData : data;
  const waiters = useMemo(() => [...new Set((visible?.cola ?? []).map((item) => item.mesero).filter(Boolean))] as string[], [visible]);
  const filtered = useMemo(() => (visible?.cola ?? []).filter((item) => (priority === "TODAS" || item.prioridad === priority) && (area === "TODAS" || item.area === area) && (waiter === "TODOS" || item.mesero === waiter) && (status === "TODOS" || item.estado === status)), [visible, priority, area, waiter, status]);
  const go = (item: Case) => {
    if (item.accion === "CAJA") navigate(`/caja?pedido=${item.pedidoId}`);
    else if (item.accion === "SALON") navigate(`/salon?mesa=${item.mesaId ?? ""}&pedido=${item.pedidoId}`);
    else navigate(`/cocina?estacion=${item.accion}&pedido=${item.pedidoId}`);
  };
  if (!visible) return <div className="card">Cargando Centro Operativo…{error && <p className="mt-2 text-red-700">{error}</p>}</div>;
  const top = [
    ["Mesas ocupadas", visible.resumen.mesasOcupadas, Table2], ["Necesitan atención", visible.resumen.situacionesAtencion, AlertTriangle], ["En preparación", visible.resumen.pedidosEnPreparacion, ChefHat], ["Retrasados", visible.resumen.pedidosRetrasados, Clock3], ["Listos sin retirar", visible.resumen.listosSinRetirar, UtensilsCrossed], ["Cuenta solicitada", visible.resumen.cuentasSolicitadas, Receipt], ["Pendientes de pago", visible.resumen.pendientesPago, CircleDollarSign], ["Tiempo operativo", `${visible.resumen.tiempoPromedioOperativoActual} min`, Gauge],
  ] as const;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Sprint 45 · control de turno</p><h1 className="page-title">Centro Operativo</h1><p className="mt-1 text-sm text-denim/55">Qué necesita atención ahora mismo, por qué importa y dónde resolverlo.</p></div><span className="rounded-full bg-denim/5 px-3 py-2 text-xs font-bold">Actualización cada {visible.actualizacionSegundos} s</span></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">{top.map(([label, value, Icon]) => <article className="card p-4" key={label}><Icon size={17}/><p className="eyebrow mt-2">{label}</p><strong className="text-2xl">{value}</strong></article>)}</section>
    {visible.alertasRegla.map((item, index) => <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4" key={`${item.area}-${index}`}><b>{item.nivel} · {item.area}</b><p>{item.mensaje}</p></div>)}
    <section className="card p-4"><div className="mb-3 flex items-center gap-2"><Filter size={17}/><b>Filtros operativos</b></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><select className="input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="TODAS">Todas las prioridades</option><option>CRITICO</option><option>URGENTE</option><option>ATENCION</option><option>NORMAL</option></select><select className="input" value={area} onChange={(e) => setArea(e.target.value as typeof area)}><option value="TODAS">Todas las áreas</option><option>COCINA</option><option>BAR</option><option>SALON</option><option>CAJA</option></select><select className="input" value={waiter} onChange={(e) => setWaiter(e.target.value)}><option value="TODOS">Todos los meseros</option>{waiters.map((name) => <option key={name}>{name}</option>)}</select><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="TODOS">Todos los estados</option>{[...new Set((visible.cola ?? []).map((item) => item.estado))].map((item) => <option key={item}>{item}</option>)}</select></div></section>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-2xl font-black">Cola de prioridades</h2><b>{filtered.length} situaciones</b></div>{filtered.length === 0 ? <div className="card p-8 text-center">No hay situaciones con esos filtros.</div> : filtered.map((item) => <article className={`rounded-2xl border-l-4 p-4 ${priorityClass[item.prioridad]}`} key={item.pedidoId}><div className="grid gap-4 md:grid-cols-[1fr_auto]"><div><p className="eyebrow">{item.prioridad} · {item.mesa} · Pedido #{item.pedidoId}</p><h3 className="text-lg font-black">{item.etapa}</h3><p className="text-sm">{item.area}{item.estacion ? ` · ${item.estacion}` : ""}{item.mesero ? ` · Mesero: ${item.mesero}` : ""}</p>{item.progreso.parcial && <p className="mt-2 text-sm font-bold text-amber-800">Parcialmente listo · {item.progreso.listas}/{item.progreso.total} líneas</p>}<p className="mt-2 text-sm">Cocina {item.progreso.cocina.listas}/{item.progreso.cocina.total} · Bar {item.progreso.bar.listas}/{item.progreso.bar.total} · {money.format(Number(item.total))}</p></div><div className="min-w-44 text-right"><strong className="text-2xl">{item.minutosEnEtapa} min</strong><small className="block">{item.objetivoMin ? `Objetivo ≤ ${item.objetivoMin} min` : "Tiempo informativo"}</small>{item.retrasoMin > 0 && <b className="mt-1 block text-red-700">Retraso +{item.retrasoMin} min</b>}<div className="mt-3 flex justify-end gap-2"><button className="secondary w-auto px-3" onClick={() => setSelected(item)}>Línea temporal</button><button className="primary w-auto px-3" onClick={() => go(item)}>Resolver <ArrowRight className="inline" size={15}/></button></div></div></div></article>)}</section>
      <aside className="space-y-4"><section className="card p-5"><h2 className="text-xl font-black">Estado por estación</h2><div className="mt-3 space-y-3">{visible.estaciones.map((station) => <article className="rounded-xl border border-denim/10 p-4" key={station.codigo}><div className="flex justify-between"><b>{station.nombre}</b><span>{station.tiempoPromedioActual} min prom.</span></div><div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><span>Pend. <b className="block text-lg">{station.pendientes}</b></span><span>Prep. <b className="block text-lg">{station.preparando}</b></span><span>Listas <b className="block text-lg">{station.listas}</b></span><span>Retr. <b className="block text-lg">{station.retrasadas}</b></span></div></article>)}</div></section><section className="card p-5"><h2 className="text-xl font-black">Estado resumido de mesas</h2><div className="mt-3 space-y-2">{visible.cola.filter((item) => item.mesaId).slice(0, 8).map((item) => <button className="w-full rounded-xl border border-denim/10 p-3 text-left hover:bg-denim/[.03]" key={item.pedidoId} onClick={() => go({ ...item, accion: "SALON" })}><div className="flex justify-between"><b>{item.mesa}</b><span>{item.minutosEnEtapa} min</span></div><small>Cocina {item.progreso.cocina.listas}/{item.progreso.cocina.total} · Bar {item.progreso.bar.listas}/{item.progreso.bar.total} · {item.mesero ?? "Sin mesero"}</small></button>)}</div></section></aside>
    </div>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={() => setSelected(null)}><section className="card max-h-[85vh] w-full max-w-xl overflow-y-auto p-6" onMouseDown={(e) => e.stopPropagation()}><div className="flex justify-between"><div><p className="eyebrow">Pedido #{selected.pedidoId}</p><h2 className="text-2xl font-black">Línea temporal operativa</h2></div><button onClick={() => setSelected(null)}>✕</button></div><div className="mt-5 space-y-3">{selected.timeline.length ? selected.timeline.map((event) => <div className="grid grid-cols-[90px_1fr] gap-3 border-t pt-3" key={`${event.tipo}-${event.ocurridoEn}`}><b>{new Date(event.ocurridoEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</b><span>{event.etiqueta}</span></div>) : <p>No hay hitos registrados todavía.</p>}</div></section></div>}
    <p className="text-xs text-denim/50">{visible.nota}</p>
  </div>;
}
