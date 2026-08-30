import { useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useResource } from "../hooks/useResource";
import { useApp } from "../store/app";
import { money } from "../data/demo";

type Promotion = { id: number; nombre: string; tipo: string; valor: string; sucursal?: { nombre: string } | null; cupones: Coupon[] };
type Coupon = { id: number; codigo: string; usosActuales: number; usosMaximos?: number | null; promocion?: Promotion };
type Level = { id: number; nombre: string; puntosMinimos: number; multiplicador: string };
type Customer = { id: number; nombres: string; apellidos: string; numeroDocumento: string };
type Summary = Customer & { indicadores: { ventas: number; totalCompras: number; ultimaCompra?: string }; cuentaFidelizacion?: { saldoPuntos: number; puntosHistoricos: number; nivel?: Level; movimientos: { id: number; puntos: number; motivo: string; creadoEn: string }[] }; consentimientos: { canal: string; otorgado: boolean }[]; ventas: { id: number; total: string; fechaOperacion: string; estado: string }[] };

export function LoyaltyPage() {
  const { branchId, hasPermission } = useApp();
  const promotions = useResource<Promotion[]>("/fidelizacion/promociones", []);
  const coupons = useResource<Coupon[]>("/fidelizacion/cupones", []);
  const levels = useResource<Level[]>("/fidelizacion/niveles", []);
  const customers = useResource<{ datos: Customer[] }>("/clientes?estado=true&limite=100", { datos: [] });
  const [customerId, setCustomerId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState("clientes");
  const submit = async (event: FormEvent<HTMLFormElement>, path: string, refresh: () => void) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = Object.fromEntries(form.entries());
    const body: Record<string, unknown> = { ...raw };
    for (const key of ["valor", "compraMinima", "promocionId", "usosMaximos", "puntosMinimos", "multiplicador", "sucursalId"])
      if (body[key] !== undefined && body[key] !== "") body[key] = Number(body[key]); else delete body[key];
    if (path.includes("promociones")) {
      body.diasSemana = [0, 1, 2, 3, 4, 5, 6];
      body.fechaInicio = new Date(String(body.fechaInicio)).toISOString();
      body.fechaFin = new Date(String(body.fechaFin)).toISOString();
      body.requiereCupon = form.get("requiereCupon") === "on";
      body.combinable = form.get("combinable") === "on";
    }
    try { await api.post(path, body); toast.success("Guardado correctamente"); event.currentTarget.reset(); refresh(); }
    catch (error) { toast.error(errorMessage(error)); }
  };
  const loadCustomer = async (id = customerId) => {
    if (!id) return;
    try { setSummary((await api.get<Summary>(`/fidelizacion/clientes/${id}/resumen`)).data); }
    catch (error) { toast.error(errorMessage(error)); }
  };
  const consent = async (channel: string, granted: boolean) => {
    if (!customerId) return;
    try { await api.put(`/fidelizacion/clientes/${customerId}/consentimientos/${channel}`, { otorgado: granted, fuente: "Panel administrativo" }); await loadCustomer(); }
    catch (error) { toast.error(errorMessage(error)); }
  };
  return <div className="space-y-6">
    <header><p className="eyebrow">Relación con clientes</p><h1 className="page-title">Promociones y fidelización</h1><p>Reglas comerciales, cupones, puntos e historial consolidado, separados de la facturación fiscal.</p></header>
    <nav className="flex flex-wrap gap-2" aria-label="Fidelización">{[["clientes","Clientes"],["promociones","Promociones"],["cupones","Cupones"],["niveles","Niveles"]].map(([key,label]) => <button key={key} className={`secondary w-auto px-4 ${tab === key ? "bg-marigold" : ""}`} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === "clientes" && <section className="space-y-5">
      <div className="panel grid gap-3 md:grid-cols-[1fr_auto]">
        <label>Cliente<select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Selecciona…</option>{customers.data.datos.map(c => <option key={c.id} value={c.id}>{c.nombres} {c.apellidos} · {c.numeroDocumento}</option>)}</select></label>
        <button className="primary self-end" onClick={() => void loadCustomer()}>Consultar historial</button>
      </div>
      {summary && <div className="grid gap-4 lg:grid-cols-3">
        <article className="panel"><p className="eyebrow">Cliente</p><h2 className="text-xl font-bold">{summary.nombres} {summary.apellidos}</h2><p>{summary.indicadores.ventas} ventas · {money.format(summary.indicadores.totalCompras)}</p><p className="mt-3 text-3xl font-black">{summary.cuentaFidelizacion?.saldoPuntos ?? 0} puntos</p><p>Nivel: {summary.cuentaFidelizacion?.nivel?.nombre ?? "Inicial"}</p></article>
        <article className="panel lg:col-span-2"><h2 className="text-xl font-bold">Consentimientos</h2><div className="mt-3 flex flex-wrap gap-3">{["EMAIL","SMS","WHATSAPP"].map(channel => { const active = summary.consentimientos.some(c => c.canal === channel && c.otorgado); return <button key={channel} disabled={!hasPermission("CLIENTES_EDITAR")} className={active ? "primary w-auto" : "secondary w-auto"} onClick={() => void consent(channel, !active)}>{channel}: {active ? "Autorizado" : "No autorizado"}</button>; })}</div><p className="mt-3 text-sm">Cada cambio conserva canal, fuente, responsable y fecha de revocación.</p></article>
        <article className="panel lg:col-span-3"><h2 className="text-xl font-bold">Compras recientes</h2><div className="table-wrap"><table><thead><tr><th>Venta</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead><tbody>{summary.ventas.map(v => <tr key={v.id}><td>#{v.id}</td><td>{new Date(v.fechaOperacion).toLocaleString("es-CO")}</td><td>{v.estado}</td><td>{money.format(Number(v.total))}</td></tr>)}</tbody></table></div></article>
      </div>}
    </section>}
    {tab === "promociones" && <section className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <form className="panel space-y-3" onSubmit={e => void submit(e, "/fidelizacion/promociones", promotions.refresh)}><h2 className="text-xl font-bold">Nueva regla</h2><input className="input" name="nombre" placeholder="Nombre" required/><select className="input" name="tipo"><option value="PORCENTAJE">Porcentaje</option><option value="VALOR_FIJO">Valor fijo</option></select><input className="input" name="valor" type="number" min="0.01" step="0.01" placeholder="Valor" required/><input className="input" name="compraMinima" type="number" min="0" placeholder="Compra mínima"/><input className="input" name="sucursalId" type="number" value={branchId ?? ""} readOnly/><label>Inicio<input className="input" name="fechaInicio" type="datetime-local" required/></label><label>Fin<input className="input" name="fechaFin" type="datetime-local" required/></label><div className="flex gap-4"><label><input name="combinable" type="checkbox"/> Combinable</label><label><input name="requiereCupon" type="checkbox"/> Requiere cupón</label></div><button className="primary">Crear promoción</button></form>
      <div className="grid gap-3 md:grid-cols-2">{promotions.data.map(p => <article className="panel" key={p.id}><h3 className="font-bold">{p.nombre}</h3><p>{p.tipo === "PORCENTAJE" ? `${p.valor}%` : money.format(Number(p.valor))} · {p.sucursal?.nombre ?? "Todas las sedes"}</p></article>)}</div>
    </section>}
    {tab === "cupones" && <section className="grid gap-5 lg:grid-cols-[22rem_1fr]"><form className="panel space-y-3" onSubmit={e => void submit(e, "/fidelizacion/cupones", coupons.refresh)}><h2 className="text-xl font-bold">Nuevo cupón</h2><input className="input" name="codigo" placeholder="Código" required/><select className="input" name="promocionId" required><option value="">Promoción…</option>{promotions.data.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select><input className="input" name="usosMaximos" type="number" min="1" placeholder="Usos máximos"/><button className="primary">Crear cupón</button></form><div className="grid gap-3 md:grid-cols-2">{coupons.data.map(c => <article className="panel" key={c.id}><h3 className="font-bold">{c.codigo}</h3><p>{c.promocion?.nombre} · {c.usosActuales}/{c.usosMaximos ?? "∞"} usos</p></article>)}</div></section>}
    {tab === "niveles" && <section className="grid gap-5 lg:grid-cols-[22rem_1fr]"><form className="panel space-y-3" onSubmit={e => void submit(e, "/fidelizacion/niveles", levels.refresh)}><h2 className="text-xl font-bold">Nuevo nivel</h2><input className="input" name="nombre" placeholder="Nombre" required/><input className="input" name="puntosMinimos" type="number" min="0" placeholder="Puntos mínimos" required/><input className="input" name="multiplicador" type="number" min="0.1" step="0.1" placeholder="Multiplicador" required/><button className="primary">Crear nivel</button></form><div className="grid gap-3 md:grid-cols-2">{levels.data.map(l => <article className="panel" key={l.id}><h3 className="font-bold">{l.nombre}</h3><p>Desde {l.puntosMinimos} puntos · x{l.multiplicador}</p></article>)}</div></section>}
  </div>;
}
