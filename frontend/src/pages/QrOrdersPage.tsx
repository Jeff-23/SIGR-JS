import { Check, Cloud, Copy, QrCode, RefreshCw, Unplug, X } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import type { ApiTable } from "../features/salon/contracts";

type QrMode = "SOLO_MENU" | "PEDIDO_CON_APROBACION" | "PEDIDO_AUTOMATICO";
type QrRequest = { id: string; estado: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"; nombreCliente?: string; total: number; creadoEn: string; pedidoId?: number; mesa: { numero: string }; detalles: { id: number; cantidad: number; producto: { nombre: string } }[] };
type PublicationState = { activa: boolean; configurada: boolean; baseUrl: string | null; publicadaEn?: string; versionHash?: string; ultimoError?: string | null; mesas?: Array<{ id: number; globalId: string; numero: string; url: string }> };
const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function QrOrdersPage() {
  const { branchId, session, tables: demoTables, hasPermission } = useApp();
  const canManageTableQr = hasPermission("MESAS_EDITAR");
  const [requests, setRequests] = useState<QrRequest[]>([]);
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [selectedTable, setSelectedTable] = useState(0);
  const [mode, setMode] = useState<QrMode>("SOLO_MENU");
  const [qr, setQr] = useState<{ url: string; image: string; table: string } | null>(null);
  const [publication, setPublication] = useState<PublicationState | null>(null);
  const [publishing, setPublishing] = useState(false);
  const load = useCallback(async () => {
    if (!branchId) return;
    if (session?.demo) {
      setTables(demoTables.map((table) => ({ id: table.id, numero: String(table.number), capacidad: table.seats, situacion: table.state, ocupacionManual: false, zona: { id: 1, nombre: table.zone, sucursalId: branchId } })));
      setRequests((current) => current.length ? current : [{ id: "demo-qr-1", estado: "PENDIENTE", nombreCliente: "Valentina", total: 37500, creadoEn: new Date().toISOString(), mesa: { numero: "4" }, detalles: [{ id: 1, cantidad: 1, producto: { nombre: "Hamburguesa El Mono" } }, { id: 2, cantidad: 1, producto: { nombre: "Jugo natural" } }] }]);
      setSelectedTable((current) => current || demoTables[0]?.id || 0);
      setMode("PEDIDO_CON_APROBACION");
      setPublication(null);
      return;
    }
    try {
      const [requestsResponse, modeResponse, publicationResponse] = await Promise.all([
        api.get<QrRequest[]>("/pedidos-qr", { params: { sucursalId: branchId } }),
        api.get<{ modoQr: QrMode }>("/pedidos-qr/modo", { params: { sucursalId: branchId } }),
        api.get<PublicationState>("/pedidos-qr/publicacion", { params: { sucursalId: branchId } }),
      ]);
      setRequests(requestsResponse.data);
      setMode(modeResponse.data.modoQr);
      setPublication(publicationResponse.data);
      if (canManageTableQr) {
        const tablesResponse = await api.get<ApiTable[]>("/mesas", { params: { sucursalId: branchId } });
        setTables(tablesResponse.data);
        setSelectedTable((current) => current || tablesResponse.data[0]?.id || 0);
      } else {
        setTables([]);
        setSelectedTable(0);
      }
    } catch (error) { toast.error(errorMessage(error)); }
  }, [branchId, canManageTableQr, demoTables, session?.demo]);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => void load(), 5000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  const resolve = async (id: string, action: "aceptar" | "rechazar") => { if (session?.demo) { setRequests((current) => current.map((request) => request.id === id ? { ...request, estado: action === "aceptar" ? "ACEPTADA" : "RECHAZADA", pedidoId: action === "aceptar" ? 9001 : undefined } : request)); toast.success(action === "aceptar" ? "Pedido ingresado a operación" : "Solicitud rechazada"); return; } try { await api.post(`/pedidos-qr/${id}/${action}`, action === "rechazar" ? { motivo: "No disponible en este momento" } : undefined); toast.success(action === "aceptar" ? "Pedido ingresado a operación" : "Solicitud rechazada"); await load(); } catch (error) { toast.error(errorMessage(error)); } };
  const publishPublic = async () => {
    if (!branchId || session?.demo) return;
    setPublishing(true);
    try {
      const response = await api.post<PublicationState>("/pedidos-qr/publicacion", { sucursalId: branchId });
      setPublication(response.data);
      toast.success("Carta publicada en Internet");
    } catch (error) { toast.error(errorMessage(error)); } finally { setPublishing(false); }
  };
  const disablePublic = async () => {
    if (!branchId || session?.demo || !publication?.activa) return;
    setPublishing(true);
    try {
      const response = await api.post<PublicationState>("/pedidos-qr/publicacion/desactivar", { sucursalId: branchId });
      setPublication(response.data);
      setQr(null);
      toast.success("Carta pública desactivada");
    } catch (error) { toast.error(errorMessage(error)); } finally { setPublishing(false); }
  };
  const generate = async () => {
    const table = tables.find((item) => item.id === selectedTable);
    if (!table) return;
    try {
      if (!session?.demo && publication?.activa && publication.publicadaEn) {
        const publicTable = publication.mesas?.find((item) => item.id === table.id);
        if (!publicTable) throw new Error("Esta mesa aún no tiene enlace público. Vuelve a publicar la carta.");
        const url = publicTable.url;
        setQr({ url, image: await QRCode.toDataURL(url, { width: 320, margin: 2 }), table: table.numero });
        return;
      }
      const token = session?.demo ? `demo-mesa-${table.numero}` : (await api.post<{ token: string }>(`/pedidos-qr/mesas/${table.id}/acceso`)).data.token;
      const url = `${window.location.origin}/menu/${token}`;
      setQr({ url, image: await QRCode.toDataURL(url, { width: 320, margin: 2 }), table: table.numero });
    } catch (error) { toast.error(errorMessage(error)); }
  };
  const pending = requests.filter((request) => request.estado === "PENDIENTE");
  const modeLabel = mode === "SOLO_MENU" ? "Solo consultar menú" : mode === "PEDIDO_CON_APROBACION" ? "Pedidos con aprobación" : "Pedidos automáticos";
  const qrNetworkNote = qr ? (() => {
    try {
      const host = new URL(qr.url).hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "Este QR sólo funciona en este equipo. Abre SIGR usando la IP local del PC antes de generarlo para otros dispositivos.";
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return "Este QR funciona sólo para dispositivos conectados a la misma red local/Wi-Fi del restaurante.";
      return "El enlace usa un host público o resoluble fuera de la red local.";
    } catch {
      return "No se pudo determinar el alcance de red del enlace.";
    }
  })() : "";
  return <div className="space-y-6"><header><p className="text-xs font-black uppercase tracking-[.22em] text-denim/45">Pedidos propios</p><h1 className="text-4xl font-black">Menú QR y solicitudes</h1><p className="mt-2 text-denim/55">Modo activo: <strong>{modeLabel}</strong>. {mode === "SOLO_MENU" ? "El cliente sólo consulta la carta y solicita su pedido al mesero." : mode === "PEDIDO_CON_APROBACION" ? "Las solicitudes no ingresan a operación hasta que el restaurante las acepte." : "Las solicitudes se convierten automáticamente en pedidos."}</p></header>
  {!session?.demo && <section className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-denim/45">Internet público</p><h2 className="mt-1 text-2xl font-black">Carta pública por datos móviles</h2><p className="mt-2 max-w-2xl text-sm text-denim/55">EDGE publica una copia de la carta. El backend, PostgreSQL y la operación local no se exponen a Internet.</p></div>{canManageTableQr && <div className="flex flex-wrap gap-2"><button disabled={publishing || !publication?.configurada || mode !== "SOLO_MENU"} onClick={() => void publishPublic()} className="flex items-center gap-2 rounded-2xl bg-steel px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Cloud size={18}/>{publishing ? "Procesando…" : publication?.publicadaEn ? "Publicar cambios" : "Activar y publicar"}</button>{publication?.activa && <button disabled={publishing || !publication.configurada} onClick={() => void disablePublic()} className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-black text-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Unplug size={18}/>Desactivar</button>}</div>}</div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-[#f4f2ec] p-4"><span className="text-xs font-black uppercase text-denim/45">Configuración</span><strong className="mt-1 block">{publication?.configurada ? "Cloudflare listo" : "Pendiente en EDGE"}</strong></div><div className="rounded-2xl bg-[#f4f2ec] p-4"><span className="text-xs font-black uppercase text-denim/45">Publicación</span><strong className="mt-1 block">{publication?.publicadaEn ? new Date(publication.publicadaEn).toLocaleString("es-CO") : "Sin publicar"}</strong></div><div className="rounded-2xl bg-[#f4f2ec] p-4"><span className="text-xs font-black uppercase text-denim/45">Estado</span><strong className="mt-1 block">{publication?.activa ? "Activa · snapshot" : "Inactiva"}</strong></div></div>{mode !== "SOLO_MENU" && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">La primera etapa pública sólo se habilita en modo SOLO_MENU.</p>}{publication?.ultimoError && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">Último intento: {publication.ultimoError}</p>}</section>}
  <section className="rounded-[2rem] bg-white p-6 shadow-sm">{canManageTableQr ? <><div className="flex flex-wrap items-end gap-3"><label className="min-w-56 flex-1 text-sm font-bold">QR por mesa<select className="mt-2 w-full rounded-2xl border p-3" value={selectedTable} onChange={(e) => setSelectedTable(Number(e.target.value))}>{tables.map((table) => <option key={table.id} value={table.id}>Mesa {table.numero}</option>)}</select></label><button onClick={generate} className="flex items-center gap-2 rounded-2xl bg-steel px-5 py-3 font-black text-white"><QrCode size={19}/>{publication?.activa && publication?.publicadaEn ? "Generar QR público" : "Generar QR"}</button></div>{qr && <div className="mt-5 flex flex-wrap items-center gap-5 rounded-3xl bg-[#f4f2ec] p-5"><img src={qr.image} alt={`Código QR de la mesa ${qr.table}`} className="h-44 w-44 rounded-xl"/><div><h3 className="text-xl font-black">Mesa {qr.table}</h3><p className="mt-2 max-w-xl break-all text-sm text-denim/55">{qr.url}</p><button onClick={() => navigator.clipboard.writeText(qr.url).then(() => toast.success("Enlace copiado"))} className="mt-3 flex items-center gap-2 font-bold"><Copy size={17}/>Copiar enlace</button><p className="mt-3 max-w-xl rounded-2xl bg-white/70 p-3 text-xs font-bold text-denim/60">{qrNetworkNote}</p></div></div>}</> : <div className="rounded-2xl bg-[#f4f2ec] p-4 text-sm text-denim/60"><strong className="block text-denim">Política de QR</strong><span>Puedes aceptar o rechazar solicitudes entrantes. Generar o renovar el QR permanente de una mesa requiere el permiso de configuración de mesas.</span></div>}</section><section><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black">Pendientes <span className="rounded-full bg-red-600 px-2.5 py-1 text-sm text-white">{pending.length}</span></h2><button onClick={() => void load()} aria-label="Actualizar"><RefreshCw/></button></div>{pending.length === 0 ? <div className="rounded-3xl bg-white p-8 text-center text-denim/50">No hay solicitudes QR pendientes.</div> : <div className="grid gap-4 xl:grid-cols-2">{pending.map((request) => <article key={request.id} className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-denim/45">Mesa {request.mesa.numero}</p><h3 className="text-xl font-black">{request.nombreCliente || "Cliente de mesa"}</h3></div><strong className="text-xl">{money.format(Number(request.total))}</strong></div><ul className="my-4 space-y-1 text-sm">{request.detalles.map((detail) => <li key={detail.id}>{detail.cantidad}× {detail.producto.nombre}</li>)}</ul><div className="grid grid-cols-2 gap-3"><button onClick={() => void resolve(request.id, "rechazar")} className="flex items-center justify-center gap-2 rounded-2xl border p-3 font-bold"><X size={18}/>Rechazar</button><button onClick={() => void resolve(request.id, "aceptar")} className="flex items-center justify-center gap-2 rounded-2xl bg-steel p-3 font-bold text-white"><Check size={18}/>Aceptar pedido</button></div></article>)}</div>}</section></div>;
}
