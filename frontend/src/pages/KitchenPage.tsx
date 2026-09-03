import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  Eye,
  Flame,
  Martini,
  PackageCheck,
  Play,
  Siren,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { servicePromise, urgency, type ServiceRisk } from "../features/kds/contracts";
import { useApp } from "../store/app";
import type { Order, OrderLine, OrderLineStatus, StationStatus } from "../types";

const stationTarget = { COCINA: 15, BAR: 8 } as const;
const stationName = { COCINA: "Cocina", BAR: "Bar" } as const;
const riskLabel: Record<ServiceRisk, string> = { low: "Bajo", medium: "Medio", high: "Alto", late: "Fuera de objetivo" };

function beep(frequency: number, duration = 0.15) {
  const context = new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.08;
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => void context.close();
}

type Station = "COCINA" | "BAR";
type DemoCommand = { order: Order; station: Station; status: StationStatus; lines: Array<{ line: OrderLine; index: number }> };

function lineKdsState(status?: OrderLineStatus) {
  if (status === "PREPARANDO") return "EN_PREPARACION";
  if (status === "LISTA" || status === "ENTREGADA") return "LISTA";
  return "PENDIENTE";
}

export function DemoKitchenPage() {
  const { orders, advanceStation, markDelivered, markKitchenSeen, setOrderLineStatus, setOrderPriority } = useApp();
  const [station, setStation] = useState<"TODAS" | Station>("TODAS");
  const [sound, setSound] = useState(true);
  const [compact, setCompact] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef(new Set<string>());
  const alertsReady = useRef(false);

  const commands = useMemo<DemoCommand[]>(() => orders.flatMap((order) => {
    if (order.status === "PAGADO" || order.status === "PENDIENTE_PAGO") return [];
    return (["COCINA", "BAR"] as const).flatMap((value) => {
      const status = order.stationStatus[value];
      if (status === "NO_APLICA" || status === "ENTREGADO") return [];
      const lines = order.items.map((line, index) => ({ line, index })).filter(({ line }) => line.station === value);
      return lines.length ? [{ order, station: value, status, lines }] : [];
    });
  }), [orders]);

  const visible = useMemo(() => commands.filter((command) => station === "TODAS" || command.station === station), [commands, station]);
  const stationCountByOrder = useMemo(() => {
    const counts = new Map<number, number>();
    commands.forEach(({ order }) => counts.set(order.id, (counts.get(order.id) ?? 0) + 1));
    return counts;
  }, [commands]);

  useEffect(() => {
    const newcomers = commands.filter(({ order, station: value }) => !known.current.has(`${order.id}-${value}`));
    if (newcomers.length && alertsReady.current) {
      toast.success(`${newcomers.length} nueva${newcomers.length > 1 ? "s" : ""} comanda${newcomers.length > 1 ? "s" : ""}`, { icon: "🔔", duration: 6000 });
      if (sound) beep(880);
    }
    commands.forEach(({ order, station: value }) => known.current.add(`${order.id}-${value}`));
    alertsReady.current = true;
  }, [commands, sound]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const unseen = commands.filter(({ order, station: value }) => !order.kitchenSeen?.[value]).length;
  const counters = {
    pending: commands.filter((item) => item.status === "PENDIENTE").length,
    preparing: commands.filter((item) => item.status === "PREPARANDO").length,
    ready: commands.filter((item) => item.status === "LISTO").length,
    delayed: commands.filter(({ order, station: value }) => servicePromise(Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000)), stationTarget[value]).risk === "late").length,
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    if (next) beep(720, 0.1);
    toast.success(next ? "Alertas sonoras activadas" : "Alertas sonoras silenciadas");
  };

  return <div>
    <div className="section-title">
      <div><p className="eyebrow">KDS · operación de cocina y bar</p><h1 className="page-title">Producción y despacho</h1></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCompact(!compact)} className="secondary h-11 w-auto px-4">{compact ? "Vista amplia" : "Vista compacta"}</button>
        <button onClick={() => { const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); void action.catch(() => toast.error("El navegador no permite pantalla completa")); }} className="secondary h-11 w-auto px-4">Pantalla completa</button>
        <button onClick={toggleSound} className="secondary h-11 w-auto px-4">{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>} {sound ? "Sonido activo" : "Sin sonido"}</button>
      </div>
    </div>

    {unseen > 0 && <div className="kds-new-alert mt-4" aria-live="assertive"><div className="flex items-center gap-3"><BellRing size={24}/><div><strong>{unseen} pedido(s) nuevo(s) sin confirmar</strong><p>La alerta permanece hasta que cocina o bar marque cada comanda como vista.</p></div></div></div>}

    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Por iniciar" value={counters.pending} tone="bg-denim"/>
      <Kpi label="Preparando" value={counters.preparing} tone="bg-orange-500"/>
      <Kpi label="Listas" value={counters.ready} tone="bg-emerald-600"/>
      <Kpi label="Fuera de objetivo" value={counters.delayed} tone="bg-red-600"/>
    </div>

    <div className="mt-6 flex gap-2">{(["TODAS", "COCINA", "BAR"] as const).map((value) => <button key={value} onClick={() => setStation(value)} className={["salon-filter", station === value ? "active" : ""].join(" ")}>{value === "TODAS" ? "Todas las estaciones" : stationName[value]}</button>)}</div>

    {visible.length === 0 ? <div className="empty"><ChefHat size={44}/><h2>Estación al día</h2><p>No hay comandas activas para el filtro seleccionado.</p></div> :
      <div className={["mt-6 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3", compact ? "kds-compact 2xl:grid-cols-4" : ""].join(" ")}>{visible.map((command) =>
        <DemoCommandCard
          key={`${command.order.id}-${command.station}`}
          command={command}
          now={now}
          advanceStation={advanceStation}
          markDelivered={markDelivered}
          markKitchenSeen={markKitchenSeen}
          setOrderLineStatus={setOrderLineStatus}
          setOrderPriority={setOrderPriority}
          stationCount={stationCountByOrder.get(command.order.id) ?? 1}
        />
      )}</div>}
  </div>;
}

function DemoCommandCard({ command, now, advanceStation, markDelivered, markKitchenSeen, setOrderLineStatus, setOrderPriority, stationCount }: {
  command: DemoCommand;
  now: number;
  advanceStation: (id: number, station: Station) => void;
  markDelivered: (id: number) => void;
  markKitchenSeen: (id: number, station: Station) => void;
  setOrderLineStatus: (id: number, lineIndex: number, status: OrderLineStatus) => void;
  setOrderPriority: (id: number, priority: "NORMAL" | "ALTA" | "URGENTE") => void;
  stationCount: number;
}) {
  const { order, station, status, lines } = command;
  const minutes = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000));
  const promise = servicePromise(minutes, stationTarget[station]);
  const level = urgency(minutes, stationTarget[station]);
  const seen = Boolean(order.kitchenSeen?.[station]);
  const priority = order.priority ?? "NORMAL";
  const allStationsReady = Object.values(order.stationStatus).filter((value) => value !== "NO_APLICA").every((value) => value === "LISTO" || value === "ENTREGADO");
  const longCommand = lines.length > 4;

  return <article style={longCommand ? undefined : { height: "auto", minHeight: 680 }} className={["kds-card", level, !seen ? "unseen" : ""].join(" ")}>
    {!seen && <div className="kds-unseen-ribbon"><BellRing size={14}/> NUEVO · REQUIERE VISTO</div>}
    <header className="kds-header" style={{ borderTopColor: station === "BAR" ? "#2563eb" : "#f97316" }}>
      <div className="min-w-0">
        <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wider ${station === "BAR" ? "text-blue-600" : "text-orange-600"}`}>{station === "BAR" ? <Martini size={16}/> : <ChefHat size={16}/>} {stationName[station]}</div>
        <h2 className="mt-1 truncate text-3xl font-black">Mesa {order.table}</h2>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-denim/45"><span>Pedido #{order.id}{stationCount > 1 ? ` · ${stationCount} estaciones` : ""}</span>{order.waiter && <span>Mesero: {order.waiter}</span>}{order.guests && <span>{order.guests} personas</span>}</div>
      </div>
      <div className={["kds-timer", level].join(" ")}><Clock3 size={18}/><span>{minutes}</span><small>min</small></div>
    </header>

    <PromisePanel promise={promise}/>

    <div className={["kds-lines flex min-h-0 flex-1 flex-col p-4", longCommand ? "overflow-y-auto" : "overflow-visible"].join(" ")}>
      {order.note && <div className="kds-note mb-3"><AlertTriangle size={15}/><span>{order.note}</span></div>}
      <div className="space-y-3">{lines.map(({ line, index }) => {
        const kdsState = lineKdsState(line.lineStatus);
        return <div key={`${line.id}-${index}`} className={["kds-line", kdsState.toLowerCase()].join(" ")}>
          <div className="flex items-start gap-3"><b className="kds-qty">{line.quantity}×</b><div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-lg leading-tight">{line.name}</strong><span className="rounded-full bg-denim/5 px-2 py-1 text-[10px] font-black uppercase text-denim/55">{kdsState === "EN_PREPARACION" ? "Preparando" : kdsState === "LISTA" ? "Lista" : "Pendiente"}</span></div>
            {(line.selectedModifiers ?? []).length > 0 && <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700">{line.selectedModifiers?.map((modifier) => <div key={modifier.id}>+ {modifier.name}</div>)}</div>}
            {line.note && <div className="kds-note mt-2"><AlertTriangle size={15}/><span>{line.note}</span></div>}
          </div></div>
          {kdsState !== "LISTA" && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {kdsState === "PENDIENTE" && <button className="kds-line-action" onClick={() => setOrderLineStatus(order.id, index, "PREPARANDO")}><Flame size={17}/> Iniciar línea</button>}
            <button className="kds-line-action ready" onClick={() => setOrderLineStatus(order.id, index, "LISTA")}><CheckCircle2 size={17}/> Línea lista</button>
          </div>}
          {kdsState === "LISTA" && <div className="mt-3 flex items-center gap-2 text-xs font-black text-emerald-700"><CheckCircle2 size={16}/> Preparación terminada</div>}
        </div>;
      })}</div>
    </div>

    <footer className="border-t border-denim/8 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><span className={["status-pill", status === "LISTO" ? "bg-emerald-100 text-emerald-800" : ""].join(" ")}>{status}</span><select aria-label="Prioridad" className="rounded-lg border border-denim/10 bg-white px-2 py-2 text-xs font-black" value={priority} onChange={(event) => setOrderPriority(order.id, event.target.value as "NORMAL" | "ALTA" | "URGENTE")}><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option></select></div>
      {!seen && <button onClick={() => { markKitchenSeen(order.id, station); toast.success(`${stationName[station]}: comanda vista`); }} className="kds-action bg-marigold text-steel"><Eye size={20}/> Visto por {station === "BAR" ? "bar" : "cocina"}</button>}
      {status === "PENDIENTE" && <button onClick={() => { advanceStation(order.id, station); toast.success(`${stationName[station]}: preparación iniciada`); }} className="kds-action bg-steel text-white"><Play size={20}/> Iniciar todos</button>}
      {status === "PREPARANDO" && <button onClick={() => { advanceStation(order.id, station); toast.success(`${stationName[station]}: todo listo`); }} className="kds-action bg-emerald-700 text-white"><CheckCircle2 size={20}/> Marcar todo listo</button>}
      {status === "LISTO" && <button onClick={() => { advanceStation(order.id, station); toast.success(`${stationName[station]} retiró para servicio`); }} className="kds-action bg-emerald-700 text-white"><Check size={20}/> Retirar para servicio</button>}
      {allStationsReady && <button onClick={() => { markDelivered(order.id); toast.success(`Pedido de mesa ${order.table} entregado; caja fue notificada`); }} className="kds-action border-2 border-emerald-700 bg-emerald-50 text-emerald-800"><PackageCheck size={18}/> Confirmar entrega completa</button>}
    </footer>

    {priority !== "NORMAL" && <span className={["absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-black", priority === "URGENTE" ? "bg-red-600 text-white" : "bg-amber-200 text-amber-900"].join(" ")}>{priority === "URGENTE" ? <Siren size={12}/> : <AlertTriangle size={12}/>} {priority}</span>}
  </article>;
}

function PromisePanel({ promise }: { promise: ReturnType<typeof servicePromise> }) {
  if (promise.risk === "late") return <div className="kds-promise late"><div><strong><AlertTriangle size={18}/> Fuera de objetivo</strong><span>Meta {promise.target} min</span></div><b>+{Math.abs(promise.remaining)} min</b></div>;
  return <div className={`kds-promise ${promise.risk}`}><div><span>Meta</span><strong>{promise.target} min</strong></div><div><span>Lleva</span><strong>{promise.elapsed} min</strong></div><div><span>Quedan</span><strong>{promise.remaining} min</strong></div><div><span>Riesgo</span><strong>{riskLabel[promise.risk]}</strong></div></div>;
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="card flex items-center gap-4 p-4"><span className={["grid h-12 w-12 place-items-center rounded-xl text-lg font-black text-white", tone].join(" ")}>{value}</span><span className="text-sm font-bold text-denim/55">{label}</span></div>;
}
