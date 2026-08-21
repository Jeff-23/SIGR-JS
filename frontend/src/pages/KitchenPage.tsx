import { BellRing, Check, ChefHat, Clock3, Martini, PackageCheck, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useApp } from "../store/app";
import type { StationStatus } from "../types";

const labels: Record<StationStatus, string> = { PENDIENTE: "Iniciar preparación", PREPARANDO: "Marcar listo", LISTO: "Entregar a servicio", ENTREGADO: "Entregado" };

export function KitchenPage() {
  const { orders, advanceStation, markDelivered } = useApp();
  const [station, setStation] = useState<"TODAS" | "COCINA" | "BAR">("TODAS");
  const [sound, setSound] = useState(true);
  const [now, setNow] = useState(() => new Date().getTime());
  const known = useRef(new Set<number>());
  const active = useMemo(() => orders.filter((order) => order.status !== "PAGADO" && order.status !== "PENDIENTE_PAGO"), [orders]);
  useEffect(() => {
    const newcomers = active.filter((order) => !known.current.has(order.id));
    if (newcomers.length && known.current.size) {
      toast.success(`${newcomers.length} nueva${newcomers.length > 1 ? "s" : ""} comanda${newcomers.length > 1 ? "s" : ""}`, { icon: "🔔", duration: 6000 });
      if (sound) { const context = new AudioContext(); const oscillator = context.createOscillator(); oscillator.connect(context.destination); oscillator.frequency.value = 880; oscillator.start(); oscillator.stop(context.currentTime + 0.16); }
    }
    active.forEach((order) => known.current.add(order.id));
  }, [active, sound]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().getTime()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return <div>
    <div className="section-title"><div><p className="eyebrow">KDS en tiempo real</p><h1 className="page-title">Cocina y bar</h1></div><button onClick={() => setSound(!sound)} className="secondary h-11 w-auto px-4">{sound ? <Volume2 size={17}/> : <BellRing size={17}/>} Alertas {sound ? "activas" : "silenciadas"}</button></div>
    <div className="mt-5 flex gap-2">{(["TODAS", "COCINA", "BAR"] as const).map((value) => <button key={value} onClick={() => setStation(value)} className={`rounded-xl px-4 py-2 text-xs font-black ${station === value ? "bg-steel text-white" : "bg-white"}`}>{value === "TODAS" ? "Todas" : value === "COCINA" ? "Cocina" : "Bar"}</button>)}</div>
    {active.length === 0 ? <div className="empty"><ChefHat size={44}/><h2>No hay comandas activas</h2><p>Los nuevos pedidos generan una alerta visual y sonora.</p></div> : <div className="mt-6 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map((order) => {
      const visibleStations = (["COCINA", "BAR"] as const).filter((value) => order.stationStatus[value] !== "NO_APLICA" && (station === "TODAS" || station === value));
      if (!visibleStations.length) return null;
      const ready = Object.values(order.stationStatus).filter((value) => value !== "NO_APLICA").every((value) => value === "LISTO" || value === "ENTREGADO");
      return <article className="flex min-h-[360px] flex-col overflow-hidden rounded-[24px] bg-white shadow-card" key={order.id}><header className={`flex min-h-[96px] items-center justify-between p-5 ${ready ? "bg-emerald-600" : "bg-steel"} text-white`}><div><small className="opacity-60">#{String(order.id).slice(-4)}</small><h2 className="text-2xl font-black">Mesa {order.table}</h2></div><span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold"><Clock3 size={14}/>{Math.max(1, Math.floor((now - new Date(order.createdAt).getTime()) / 60000))} min</span></header><div className="flex flex-1 flex-col p-5"><div className="space-y-5">{visibleStations.map((value) => { const status = order.stationStatus[value] as StationStatus; const items = order.items.filter((item) => item.station === value); return <section key={value}><div className="mb-2 flex items-center justify-between"><strong className={`flex items-center gap-2 text-xs ${value === "BAR" ? "text-blue-600" : "text-orange-600"}`}>{value === "BAR" ? <Martini size={16}/> : <ChefHat size={16}/>} {value}</strong><span className="text-[10px] font-black text-denim/45">{status}</span></div>{items.map((item) => <div className="flex gap-3 py-1.5" key={item.id}><b className="text-marigold">{item.quantity}×</b><span className="font-bold">{item.name}</span></div>)}<button disabled={status === "ENTREGADO"} onClick={() => { advanceStation(order.id, value); toast.success(`${value === "BAR" ? "Bar" : "Cocina"}: ${labels[status].toLowerCase()}`); }} className={`secondary mt-3 h-11 ${status === "LISTO" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}`}>{status === "LISTO" && <Check size={17}/>} {labels[status]}</button></section>; })}</div>{ready && <button onClick={() => { markDelivered(order.id); toast.success(`Pedido de mesa ${order.table} entregado; caja fue notificada`); }} className="primary mt-auto bg-emerald-700"><PackageCheck size={18}/> Confirmar entrega completa</button>}</div></article>;
    })}</div>}
  </div>;
}
