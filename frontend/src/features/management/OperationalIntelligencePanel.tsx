import { AlertTriangle, CheckCircle2, Clock3, Gauge, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useApp } from "../../store/app";
import type { Order } from "../../types";

type Risk = "OK" | "ATENCION" | "DEMORADO";
type LiveCase = {
  pedidoId: number;
  mesa: string;
  estado: string;
  etapa: string;
  estacion: string | null;
  minutosEnEtapa: number;
  objetivoMin: number | null;
  riesgo: Risk;
  ventaEstado: string | null;
};
type OperationalData = {
  generadoEn: string;
  ventanaHoras: number;
  resumen: { activos: number; demorados: number; listosSinRetirar: number; esperandoEntrega: number; esperandoPago: number };
  tiemposPromedio: {
    pedidoACocina: number | null;
    cocinaAListo: number | null;
    listoARetirado: number | null;
    retiradoAMesa: number | null;
    entregaACuenta: number | null;
    cuentaAPago: number | null;
    cicloTotal: number | null;
  };
  casos: LiveCase[];
  nota: string;
};

function minutesBetween(from?: string, to?: string) {
  if (!from || !to) return null;
  return Math.max(0, Math.round(((new Date(to).getTime() - new Date(from).getTime()) / 60000) * 10) / 10);
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10 : null;
}

function demoOperationalData(orders: Order[], nowMs: number): OperationalData {
  const active = orders.filter((order) => order.operational && order.operational.stage !== "PAGADO" && order.paymentStatus !== "PAGADO");
  const cases: LiveCase[] = active.map((order) => {
    const op = order.operational!;
    const minutes = Math.max(0, Math.floor((nowMs - new Date(op.stageStartedAt).getTime()) / 60000));
    let etapa = "Pedido enviado a estación";
    let objetivoMin: number | null = 3;
    let estacion: string | null = op.station === "BAR" ? "Bar" : op.station === "COCINA" ? "Cocina" : null;
    if (op.stage === "EN_PREPARACION") { etapa = "En preparación"; objetivoMin = op.station === "BAR" ? 8 : 15; }
    if (op.stage === "LISTO_ESPERANDO_RETIRO") { etapa = "Listo esperando retiro"; objetivoMin = 5; }
    if (op.stage === "RETIRADO_ESPERANDO_ENTREGA") { etapa = "Retirado esperando entrega"; objetivoMin = 4; }
    if (op.stage === "ENTREGADO_ESPERANDO_CUENTA") { etapa = "Entregado esperando cuenta"; objetivoMin = null; estacion = null; }
    if (op.stage === "CUENTA_SOLICITADA") { etapa = "Cuenta solicitada esperando pago"; objetivoMin = 8; estacion = null; }
    const riesgo: Risk = objetivoMin === null ? "OK" : minutes > objetivoMin ? "DEMORADO" : minutes >= Math.max(1, Math.floor(objetivoMin * 0.75)) ? "ATENCION" : "OK";
    return { pedidoId: order.id, mesa: `Mesa ${order.table}`, estado: order.status, etapa, estacion, minutosEnEtapa: minutes, objetivoMin, riesgo, ventaEstado: order.accountRequested ? "PENDIENTE_PAGO" : null };
  }).sort((a, b) => (b.riesgo === "DEMORADO" ? 2 : b.riesgo === "ATENCION" ? 1 : 0) - (a.riesgo === "DEMORADO" ? 2 : a.riesgo === "ATENCION" ? 1 : 0) || b.minutosEnEtapa - a.minutosEnEtapa);

  const timelines = orders.map((order) => order.operational).filter(Boolean);
  return {
    generadoEn: new Date(nowMs).toISOString(),
    ventanaHoras: 24,
    resumen: {
      activos: cases.length,
      demorados: cases.filter((item) => item.riesgo === "DEMORADO").length,
      listosSinRetirar: active.filter((order) => order.operational?.stage === "LISTO_ESPERANDO_RETIRO").length,
      esperandoEntrega: active.filter((order) => order.operational?.stage === "RETIRADO_ESPERANDO_ENTREGA").length,
      esperandoPago: active.filter((order) => order.operational?.stage === "CUENTA_SOLICITADA").length,
    },
    tiemposPromedio: {
      pedidoACocina: average(timelines.map((op) => minutesBetween(op?.sentAt, op?.preparationStartedAt))),
      cocinaAListo: average(timelines.map((op) => minutesBetween(op?.preparationStartedAt, op?.readyAt))),
      listoARetirado: average(timelines.map((op) => minutesBetween(op?.readyAt, op?.retiredAt))),
      retiradoAMesa: average(timelines.map((op) => minutesBetween(op?.retiredAt, op?.deliveredAt))),
      entregaACuenta: average(timelines.map((op) => minutesBetween(op?.deliveredAt, op?.accountRequestedAt))),
      cuentaAPago: average(timelines.map((op) => minutesBetween(op?.accountRequestedAt, op?.paidAt))),
      cicloTotal: average(timelines.map((op) => minutesBetween(op?.sentAt, op?.paidAt))),
    },
    casos: cases,
    nota: "Modo demostración conectado al flujo actual: las acciones de KDS, salón y caja actualizan esta vista. En operación real, estos eventos se persisten en backend.",
  };
}

const labels: Array<[keyof OperationalData["tiemposPromedio"], string]> = [
  ["pedidoACocina", "Pedido → estación"],
  ["cocinaAListo", "Preparación → listo"],
  ["listoARetirado", "Listo → retirado"],
  ["retiradoAMesa", "Retirado → mesa"],
  ["entregaACuenta", "Mesa → cuenta"],
  ["cuentaAPago", "Cuenta → pago"],
  ["cicloTotal", "Ciclo total"],
];

function riskClass(risk: Risk) {
  return risk === "DEMORADO" ? "border-red-500 bg-red-50" : risk === "ATENCION" ? "border-amber-400 bg-amber-50" : "border-emerald-400 bg-emerald-50";
}

export function OperationalIntelligencePanel({ branchId, isDemo }: { branchId: number; isDemo: boolean }) {
  const orders = useApp((state) => state.orders);
  const [demoNow, setDemoNow] = useState(() => Date.now());
  const [data, setData] = useState<OperationalData | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const demoData = useMemo(() => demoOperationalData(orders, demoNow), [orders, demoNow]);

  useEffect(() => {
    if (isDemo) {
      const timer = window.setInterval(() => setDemoNow(Date.now()), 15000);
      return () => window.clearInterval(timer);
    }
    let active = true;
    const load = async () => {
      try {
        const response = await api.get<OperationalData>("/inteligencia/operacion-en-vivo", { params: { sucursalId: branchId } });
        if (active) { setData(response.data); setFailure(null); }
      } catch (error) { if (active) setFailure(errorMessage(error)); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [branchId, isDemo]);

  const visibleData = isDemo ? demoData : data;
  const mainBottleneck = useMemo(() => visibleData?.casos.find((item) => item.riesgo === "DEMORADO") ?? null, [visibleData]);
  if (!visibleData) return <section className="card"><p>Cargando operación en vivo…</p>{failure && <small className="text-red-700">{failure}</small>}</section>;

  return <section className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="eyebrow">Sprint 44 · inteligencia de tiempos</p><h2 className="text-2xl font-black">Operación en vivo</h2><p className="text-sm text-denim/55">Qué está ocurriendo ahora y en qué etapa se está perdiendo tiempo.</p></div>
      <span className="rounded-full bg-denim/5 px-3 py-2 text-xs font-bold">Actualización cada 15 s</span>
    </header>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[['Activos', visibleData.resumen.activos], ['Demorados', visibleData.resumen.demorados], ['Listos sin retirar', visibleData.resumen.listosSinRetirar], ['Esperando entrega', visibleData.resumen.esperandoEntrega], ['Esperando pago', visibleData.resumen.esperandoPago]].map(([label, value]) => <div className="card p-4" key={label}><p className="eyebrow">{label}</p><strong className="text-2xl">{value}</strong></div>)}
    </div>

    {mainBottleneck && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5" size={20}/><div><b>Cuello de botella actual</b><p>Pedido #{mainBottleneck.pedidoId} · {mainBottleneck.mesa}: {mainBottleneck.etapa.toLowerCase()} desde hace {mainBottleneck.minutosEnEtapa} min{mainBottleneck.objetivoMin ? ` (objetivo ${mainBottleneck.objetivoMin} min)` : ""}.</p></div></div></div>}

    <div className="grid gap-4 xl:grid-cols-[1.35fr_.9fr]">
      <div className="space-y-3">
        {visibleData.casos.length === 0 ? <div className="card p-8 text-center"><CheckCircle2 className="mx-auto mb-2"/><b>No hay pedidos activos con trazabilidad reciente.</b></div> : visibleData.casos.map((item) => <article className={`rounded-2xl border-l-4 p-4 ${riskClass(item.riesgo)}`} key={item.pedidoId}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Pedido #{item.pedidoId} · {item.mesa}</p><h3 className="font-black">{item.etapa}</h3><p className="text-sm">{item.estacion ? `${item.estacion} · ` : ""}{item.estado.replaceAll('_', ' ')}</p></div><div className="text-right"><strong className="text-2xl">{item.minutosEnEtapa} min</strong><small className="block">{item.objetivoMin ? `Objetivo ≤ ${item.objetivoMin} min` : "Tiempo informativo"}</small></div></div>
        </article>)}
      </div>
      <div className="card space-y-4 p-5"><div className="flex items-center gap-2"><Gauge size={19}/><h3 className="font-black">Tiempos promedio · últimas 24 h</h3></div>{labels.map(([key, label]) => <div className="flex items-center justify-between border-t border-denim/10 pt-3" key={key}><span className="flex items-center gap-2 text-sm"><Clock3 size={15}/>{label}</span><b>{visibleData.tiemposPromedio[key] === null ? "Sin datos" : `${visibleData.tiemposPromedio[key]} min`}</b></div>)}<p className="rounded-xl bg-denim/[.04] p-3 text-xs text-denim/60"><UtensilsCrossed className="mr-1 inline" size={13}/>{visibleData.nota}</p></div>
    </div>
  </section>;
}
