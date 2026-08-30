import { Check, Copy, QrCode, RefreshCw, X } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import type { ApiTable } from "../features/salon/contracts";

type QrRequest = { id: string; estado: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"; nombreCliente?: string; total: number; creadoEn: string; pedidoId?: number; mesa: { numero: string }; detalles: { id: number; cantidad: number; producto: { nombre: string } }[] };
const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function QrOrdersPage() {
  const { branchId } = useApp();
  const [requests, setRequests] = useState<QrRequest[]>([]);
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [selectedTable, setSelectedTable] = useState(0);
  const [qr, setQr] = useState<{ url: string; image: string; table: string } | null>(null);
  const load = useCallback(async () => {
    if (!branchId) return;
    try { const [r, t] = await Promise.all([api.get<QrRequest[]>("/pedidos-qr", { params: { sucursalId: branchId } }), api.get<ApiTable[]>("/mesas", { params: { sucursalId: branchId } })]); setRequests(r.data); setTables(t.data); setSelectedTable((current) => current || t.data[0]?.id || 0); }
    catch (error) { toast.error(errorMessage(error)); }
  }, [branchId]);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => void load(), 5000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  const resolve = async (id: string, action: "aceptar" | "rechazar") => { try { await api.post(`/pedidos-qr/${id}/${action}`, action === "rechazar" ? { motivo: "No disponible en este momento" } : undefined); toast.success(action === "aceptar" ? "Pedido ingresado a operación" : "Solicitud rechazada"); await load(); } catch (error) { toast.error(errorMessage(error)); } };
  const generate = async () => { const table = tables.find((item) => item.id === selectedTable); if (!table) return; try { const response = await api.post<{ token: string }>(`/pedidos-qr/mesas/${table.id}/acceso`); const url = `${window.location.origin}/menu/${response.data.token}`; setQr({ url, image: await QRCode.toDataURL(url, { width: 320, margin: 2 }), table: table.numero }); } catch (error) { toast.error(errorMessage(error)); } };
  const pending = requests.filter((request) => request.estado === "PENDIENTE");
  return <div className="space-y-6"><header><p className="text-xs font-black uppercase tracking-[.22em] text-denim/45">Pedidos propios</p><h1 className="text-4xl font-black">Menú QR y solicitudes</h1><p className="mt-2 text-denim/55">Las solicitudes pendientes no llegan a cocina hasta que el restaurante las acepte.</p></header><section className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end gap-3"><label className="min-w-56 flex-1 text-sm font-bold">QR por mesa<select className="mt-2 w-full rounded-2xl border p-3" value={selectedTable} onChange={(e) => setSelectedTable(Number(e.target.value))}>{tables.map((table) => <option key={table.id} value={table.id}>Mesa {table.numero}</option>)}</select></label><button onClick={generate} className="flex items-center gap-2 rounded-2xl bg-steel px-5 py-3 font-black text-white"><QrCode size={19}/>Generar QR</button></div>{qr && <div className="mt-5 flex flex-wrap items-center gap-5 rounded-3xl bg-[#f4f2ec] p-5"><img src={qr.image} alt={`Código QR de la mesa ${qr.table}`} className="h-44 w-44 rounded-xl"/><div><h3 className="text-xl font-black">Mesa {qr.table}</h3><p className="mt-2 max-w-xl break-all text-sm text-denim/55">{qr.url}</p><button onClick={() => navigator.clipboard.writeText(qr.url).then(() => toast.success("Enlace copiado"))} className="mt-3 flex items-center gap-2 font-bold"><Copy size={17}/>Copiar enlace</button></div></div>}</section><section><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black">Pendientes <span className="rounded-full bg-red-600 px-2.5 py-1 text-sm text-white">{pending.length}</span></h2><button onClick={() => void load()} aria-label="Actualizar"><RefreshCw/></button></div>{pending.length === 0 ? <div className="rounded-3xl bg-white p-8 text-center text-denim/50">No hay solicitudes QR pendientes.</div> : <div className="grid gap-4 xl:grid-cols-2">{pending.map((request) => <article key={request.id} className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-denim/45">Mesa {request.mesa.numero}</p><h3 className="text-xl font-black">{request.nombreCliente || "Cliente de mesa"}</h3></div><strong className="text-xl">{money.format(Number(request.total))}</strong></div><ul className="my-4 space-y-1 text-sm">{request.detalles.map((detail) => <li key={detail.id}>{detail.cantidad}× {detail.producto.nombre}</li>)}</ul><div className="grid grid-cols-2 gap-3"><button onClick={() => void resolve(request.id, "rechazar")} className="flex items-center justify-center gap-2 rounded-2xl border p-3 font-bold"><X size={18}/>Rechazar</button><button onClick={() => void resolve(request.id, "aceptar")} className="flex items-center justify-center gap-2 rounded-2xl bg-steel p-3 font-bold text-white"><Check size={18}/>Aceptar pedido</button></div></article>)}</div>}</section></div>;
}
