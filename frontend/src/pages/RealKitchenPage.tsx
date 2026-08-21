import { AlertTriangle, BellRing, Check, ChefHat, Clock3, Martini, RefreshCw, Siren, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { commandDestination, elapsedMinutes, urgency, type Command, type KdsPriority, type KdsState, type Station } from "../features/kds/contracts";
import { api, apiFailure, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

const nextState: Record<KdsState, { state: "EN_PREPARACION" | "LISTA" | "ENTREGADA"; label: string }> = {
  PENDIENTE: { state: "EN_PREPARACION", label: "Iniciar preparación" },
  EN_PREPARACION: { state: "LISTA", label: "Marcar lista" },
  LISTA: { state: "ENTREGADA", label: "Entregar a servicio" },
};

function beep(frequency: number, duration = 0.15) {
  const context = new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain); gain.connect(context.destination);
  oscillator.frequency.value = frequency; gain.gain.value = 0.08;
  oscillator.start(); oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => void context.close();
}

export function RealKitchenPage() {
  const { branchId, hasPermission } = useApp();
  const [commands, setCommands] = useState<Command[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<number | "all">("all");
  const [state, setState] = useState<KdsState | "all">("all");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ReturnType<typeof apiFailure> | null>(null);
  const [now, setNow] = useState(() => new Date().getTime());
  const [sound, setSound] = useState(() => localStorage.getItem("sigr-kds-sound") !== "off");
  const [busy, setBusy] = useState<number | null>(null);
  const [stationForm, setStationForm] = useState(false);
  const [newStation, setNewStation] = useState({ codigo: "", nombre: "", color: "#8B5CF6" });
  const known = useRef(new Set<number>());
  const ready = useRef(new Set<number>());
  const initialized = useRef(false);

  const load = useCallback(async (quiet = false) => {
    if (!branchId) return;
    if (!quiet) setLoading(true);
    try {
      const params = { sucursalId: branchId };
      const [stationResponse, commandResponse] = await Promise.all([
        api.get<Station[]>("/estaciones-preparacion", { params }),
        api.get<Command[]>("/comandas", { params }),
      ]);
      const incoming = commandResponse.data;
      if (initialized.current) {
        const newcomers = incoming.filter((command) => !known.current.has(command.id));
        const newlyReady = incoming.filter((command) => command.estado === "LISTA" && !ready.current.has(command.id));
        if (newcomers.length) {
          toast.success(String(newcomers.length) + " nueva(s) comanda(s)", { icon: "🔔", duration: 6000 });
          if (sound) beep(880);
        }
        if (newlyReady.length) {
          toast.success(String(newlyReady.length) + " comanda(s) lista(s) para servicio", { icon: "✅" });
          if (sound) beep(660, 0.22);
        }
      }
      incoming.forEach((command) => {
        known.current.add(command.id);
        if (command.estado === "LISTA") ready.current.add(command.id);
      });
      initialized.current = true;
      setStations(stationResponse.data); setCommands(incoming); setFailure(null);
    } catch (error) {
      if (!quiet) setFailure(apiFailure(error));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [branchId, sound]);

  useEffect(() => {
    initialized.current = false; known.current.clear(); ready.current.clear();
    const initial = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(true), 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(poll); window.clearInterval(clock); };
  }, [load]);

  const visible = useMemo(() => commands.filter((command) =>
    (stationId === "all" || command.estacion.id === stationId) &&
    (state === "all" || command.estado === state),
  ), [commands, state, stationId]);
  const counters = useMemo(() => ({
    pending: commands.filter((item) => item.estado === "PENDIENTE").length,
    preparing: commands.filter((item) => item.estado === "EN_PREPARACION").length,
    ready: commands.filter((item) => item.estado === "LISTA").length,
    delayed: commands.filter((item) => urgency(elapsedMinutes(item.fechaEnvio, now)) !== "normal").length,
  }), [commands, now]);

  const advance = async (command: Command) => {
    if (!hasPermission("COMANDAS_ACTUALIZAR_ESTADO") || busy) return;
    setBusy(command.id);
    try {
      await api.patch("/comandas/" + command.id + "/estado", { estado: nextState[command.estado].state });
      toast.success(command.estacion.nombre + ": " + nextState[command.estado].label.toLowerCase());
      await load(true);
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(null); }
  };
  const prioritize = async (command: Command, prioridad: KdsPriority) => {
    setBusy(command.id);
    try { await api.patch("/comandas/" + command.id + "/prioridad", { prioridad }); await load(true); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(null); }
  };
  const toggleSound = () => {
    const next = !sound; setSound(next); localStorage.setItem("sigr-kds-sound", next ? "on" : "off");
    if (next) { beep(720, 0.1); toast.success("Alertas sonoras activadas"); }
  };
  const createStation = async () => {
    if (!branchId || !newStation.codigo.trim() || !newStation.nombre.trim()) return;
    try {
      await api.post("/estaciones-preparacion", { ...newStation, codigo: newStation.codigo.trim().toUpperCase().replaceAll(" ", "_"), nombre: newStation.nombre.trim(), sucursalId: branchId });
      toast.success("Estación creada"); setStationForm(false); setNewStation({ codigo: "", nombre: "", color: "#8B5CF6" }); await load(true);
    } catch (error) { toast.error(errorMessage(error)); }
  };

  if (loading) return <LoadingState label="Conectando estaciones de preparación…"/>;
  if (failure) return <ErrorState detail={failure.message} requestId={failure.requestId} retry={() => void load()}/>;
  return <div>
    <div className="section-title">
      <div><p className="eyebrow">KDS · actualización cada 5 segundos</p><h1 className="page-title">Producción y despacho</h1></div>
      <div className="flex gap-2">
        {hasPermission("CONFIGURACION_GESTIONAR") && <button onClick={() => setStationForm(!stationForm)} className="secondary h-11 w-auto px-4">+ Estación</button>}
        <button onClick={toggleSound} className="secondary h-11 w-auto px-4">{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>} {sound ? "Sonido activo" : "Sin sonido"}</button>
        <button onClick={() => void load()} aria-label="Actualizar comandas" className="secondary h-11 w-11 px-0"><RefreshCw size={17}/></button>
      </div>
    </div>
    {stationForm && <div className="card mt-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto_auto]"><input className="input h-11" maxLength={40} placeholder="Código: POSTRES" value={newStation.codigo} onChange={(event) => setNewStation({ ...newStation, codigo: event.target.value })}/><input className="input h-11" maxLength={80} placeholder="Nombre de estación" value={newStation.nombre} onChange={(event) => setNewStation({ ...newStation, nombre: event.target.value })}/><input aria-label="Color de estación" className="h-11 w-full rounded-xl bg-white p-1" type="color" value={newStation.color} onChange={(event) => setNewStation({ ...newStation, color: event.target.value })}/><button className="primary h-11 px-5" onClick={() => void createStation()}>Crear</button></div>}
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Por iniciar" value={counters.pending} tone="bg-denim"/>
      <Kpi label="Preparando" value={counters.preparing} tone="bg-orange-500"/>
      <Kpi label="Listas" value={counters.ready} tone="bg-emerald-600"/>
      <Kpi label="Con demora" value={counters.delayed} tone="bg-red-600"/>
    </div>
    <div className="mt-6 flex flex-wrap gap-2">
      <button className={["salon-filter", stationId === "all" ? "active" : ""].join(" ")} onClick={() => setStationId("all")}>Todas las estaciones</button>
      {stations.map((station) => <button key={station.id} onClick={() => setStationId(station.id)} className={["salon-filter", stationId === station.id ? "active" : ""].join(" ")}><i className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: station.color }}/>{station.nombre}</button>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {(["all","PENDIENTE","EN_PREPARACION","LISTA"] as const).map((value) => <button key={value} onClick={() => setState(value)} className={["rounded-lg px-3 py-2 text-[11px] font-black uppercase", state === value ? "bg-marigold text-steel" : "bg-white text-denim/55"].join(" ")}>{value === "all" ? "Todos los estados" : value.replaceAll("_"," ")}</button>)}
    </div>
    {visible.length === 0 ? <div className="empty"><ChefHat size={44}/><h2>Estación al día</h2><p>No hay comandas activas para los filtros seleccionados.</p></div> :
      <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((command) =>
        <CommandCard key={command.id} command={command} now={now} busy={busy === command.id} canEdit={hasPermission("COMANDAS_ACTUALIZAR_ESTADO")} advance={advance} prioritize={prioritize}/>
      )}</div>}
  </div>;
}

function CommandCard({ command, now, busy, canEdit, advance, prioritize }: { command: Command; now: number; busy: boolean; canEdit: boolean; advance: (command: Command) => Promise<void>; prioritize: (command: Command, priority: KdsPriority) => Promise<void> }) {
  const minutes = elapsedMinutes(command.fechaEnvio, now);
  const level = urgency(minutes);
  return <article className={["kds-card", level].join(" ")}>
    <header className="kds-header" style={{ borderTopColor: command.estacion.color }}>
      <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-denim/45">{command.estacion.codigo === "BAR" ? <Martini size={15}/> : <ChefHat size={15}/>} {command.estacion.nombre}</div><h2 className="mt-1 text-2xl font-black">{commandDestination(command)}</h2><small className="text-denim/45">Pedido #{command.pedido.id} · Comanda #{command.id}</small></div>
      <div className={["kds-timer", level].join(" ")}><Clock3 size={15}/>{minutes} min</div>
    </header>
    <div className="flex min-h-[190px] flex-1 flex-col p-5"><div className="space-y-3">{command.detalles.map((detail) =>
      <div className="flex gap-3" key={detail.id}><b className="text-lg text-marigold">{detail.cantidad}×</b><div><strong>{detail.detallePedido.producto.nombre}</strong>{detail.detallePedido.observaciones && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">{detail.detallePedido.observaciones}</p>}</div></div>
    )}</div></div>
    <footer className="border-t border-denim/8 p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><span className={["status-pill", command.estado === "LISTA" ? "bg-emerald-100 text-emerald-800" : ""].join(" ")}>{command.estado.replaceAll("_"," ")}</span>{canEdit && <select aria-label="Prioridad" className="rounded-lg border border-denim/10 bg-white px-2 py-1 text-xs font-bold" value={command.prioridad} onChange={(event) => void prioritize(command,event.target.value as KdsPriority)}><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option></select>}</div>
      <button disabled={busy || !canEdit} onClick={() => void advance(command)} className={["primary h-12", command.estado === "LISTA" ? "bg-emerald-700" : ""].join(" ")}>{command.estado === "PENDIENTE" ? <BellRing size={17}/> : command.estado === "EN_PREPARACION" ? <ChefHat size={17}/> : <Check size={17}/>} {nextState[command.estado].label}</button>
    </footer>
    {command.prioridad !== "NORMAL" && <span className={["absolute right-4 top-4 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black", command.prioridad === "URGENTE" ? "bg-red-600 text-white" : "bg-amber-200 text-amber-900"].join(" ")}>{command.prioridad === "URGENTE" ? <Siren size={12}/> : <AlertTriangle size={12}/>} {command.prioridad}</span>}
  </article>;
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="card flex items-center gap-4 p-4"><span className={["grid h-11 w-11 place-items-center rounded-xl text-lg font-black text-white", tone].join(" ")}>{value}</span><span className="text-sm font-bold text-denim/55">{label}</span></div>;
}
