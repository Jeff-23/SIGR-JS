import { Bike, CheckCircle2, Clock3, MapPin, Phone, RefreshCw, Route, UserRound, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

type DeliveryState =
  | "PENDIENTE_ASIGNACION"
  | "ASIGNADO"
  | "EN_RUTA"
  | "ENTREGADO"
  | "NO_ENTREGADO"
  | "CANCELADO";

type Delivery = {
  id: number;
  estado: DeliveryState;
  destinatario: string;
  direccion: string;
  telefono: string;
  referencias?: string | null;
  observacion?: string | null;
  costo: string;
  creadoEn: string;
  repartidor?: { id: number; nombres: string; apellidos: string } | null;
  pedido: {
    id: number;
    sucursalId: number;
    estado: string;
    detalles?: Array<{ id: number; cantidad: number; producto: { nombre: string } }>;
  };
};

type Courier = { id: number; nombres: string; apellidos: string; sucursalId?: number | null };

const stateLabel: Record<DeliveryState, string> = {
  PENDIENTE_ASIGNACION: "Pendiente de asignación",
  ASIGNADO: "Asignado",
  EN_RUTA: "En ruta",
  ENTREGADO: "Entregado",
  NO_ENTREGADO: "No entregado",
  CANCELADO: "Cancelado",
};

export function DeliveryPage() {
  const { session, branchId, hasPermission } = useApp();
  const canUpdate = hasPermission("DOMICILIOS_ACTUALIZAR");
  const isSupervisor = hasPermission("DOMICILIOS_SUPERVISAR");
  const isCourier = !isSupervisor;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [selectedCourier, setSelectedCourier] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!branchId || session?.demo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const deliveryResponse = await api.get<Delivery[]>("/pedidos/domicilios/activos");
      setDeliveries(deliveryResponse.data.filter((item) => item.pedido.sucursalId === branchId));
      if (canUpdate && isSupervisor) {
        const courierResponse = await api.get<Courier[]>("/pedidos/domicilios/repartidores");
        setCouriers(
          courierResponse.data.filter(
            (courier) => courier.sucursalId === null || courier.sucursalId === undefined || courier.sucursalId === branchId,
          ),
        );
      } else {
        setCouriers([]);
      }
      setError("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, [branchId, canUpdate, isSupervisor, session?.demo]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const counters = useMemo(
    () => ({
      waiting: deliveries.filter((item) => item.estado === "PENDIENTE_ASIGNACION").length,
      assigned: deliveries.filter((item) => item.estado === "ASIGNADO").length,
      route: deliveries.filter((item) => item.estado === "EN_RUTA").length,
      issue: deliveries.filter((item) => item.estado === "NO_ENTREGADO").length,
    }),
    [deliveries],
  );

  async function transition(delivery: Delivery, estado: DeliveryState, repartidorId?: number) {
    if (!canUpdate || savingId !== null) return;
    if (estado === "CANCELADO" && !window.confirm(`¿Cancelar el domicilio del pedido #${delivery.pedido.id}?`)) return;
    setSavingId(delivery.id);
    try {
      await api.patch(`/pedidos/domicilios/${delivery.id}/estado`, {
        estado,
        ...(repartidorId ? { repartidorId } : {}),
        ...(notes[delivery.id]?.trim() ? { observacion: notes[delivery.id].trim() } : {}),
      });
      toast.success(
        estado === "EN_RUTA"
          ? "Salida a ruta registrada"
          : estado === "ENTREGADO"
            ? "Entrega registrada"
            : estado === "ASIGNADO"
              ? "Domicilio asignado"
              : "Estado actualizado",
      );
      setNotes((current) => ({ ...current, [delivery.id]: "" }));
      await load();
    } catch (failure) {
      toast.error(errorMessage(failure));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Distribución y última milla</p>
          <h1 className="page-title">{isCourier ? "Mis entregas" : "Distribución y domicilios"}</h1>
          <p className="mt-2 text-sm text-denim/55">
            {isCourier
              ? "Aquí sólo aparecen los pedidos que ya fueron asignados a tu usuario. Cobrar o facturar sigue siendo una operación separada."
              : "Asigna un repartidor cuando cocina/bar haya dejado el pedido listo. Entregar no registra un pago ni emite una factura."}
          </p>
        </div>
        <button className="secondary w-auto px-4" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={17} /> Actualizar
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: isCourier ? "Por recoger" : "Sin asignar", value: isCourier ? counters.assigned : counters.waiting, icon: Clock3 },
          { label: "Asignados", value: counters.assigned, icon: UserRound },
          { label: "En ruta", value: counters.route, icon: Route },
          { label: "Con novedad", value: counters.issue, icon: XCircle },
        ].map(({ label, value, icon: CardIcon }) => (
          <article className="card" key={label}>
            <CardIcon size={20} />
            <p className="mt-2 text-sm text-denim/55">{label}</p>
            <strong className="mt-1 block text-3xl">{value}</strong>
          </article>
        ))}
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {loading && <p role="status">Consultando entregas…</p>}
      {!loading && !error && deliveries.length === 0 && (
        <div className="empty">
          <Bike size={42} />
          <h2>{isCourier ? "No tienes entregas asignadas" : "No hay domicilios activos"}</h2>
          <p>{isCourier ? "Cuando te asignen un pedido aparecerá aquí automáticamente." : "Los nuevos domicilios aparecerán cuando entren a la operación."}</p>
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        {deliveries.map((delivery) => {
          const courierId = selectedCourier[delivery.id] ?? delivery.repartidor?.id ?? 0;
          const busy = savingId === delivery.id;
          return (
            <article className="card" key={delivery.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Pedido #{delivery.pedido.id}</p>
                  <h2 className="text-2xl font-black">{delivery.destinatario}</h2>
                </div>
                <span className="rounded-full bg-[#f4f2ec] px-3 py-1 text-xs font-black uppercase tracking-wide">
                  {stateLabel[delivery.estado]}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p className="flex items-start gap-2"><MapPin size={17} className="mt-0.5 shrink-0" /> {delivery.direccion}</p>
                {delivery.referencias && <p className="pl-6 text-denim/55">Referencia: {delivery.referencias}</p>}
                <p className="flex items-center gap-2"><Phone size={17} /> {delivery.telefono}</p>
                <p>Preparación: <strong>{delivery.pedido.estado.replaceAll("_", " ")}</strong></p>
                <p>Repartidor: <strong>{delivery.repartidor ? `${delivery.repartidor.nombres} ${delivery.repartidor.apellidos}` : "Sin asignar"}</strong></p>
                {delivery.pedido.detalles?.length ? (
                  <div className="rounded-2xl bg-[#f4f2ec] p-3">
                    {delivery.pedido.detalles.map((detail) => (
                      <p key={detail.id}>{detail.cantidad}× {detail.producto.nombre}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              {canUpdate && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <input
                    className="input"
                    value={notes[delivery.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [delivery.id]: event.target.value }))}
                    placeholder="Observación de entrega (opcional)"
                    maxLength={300}
                  />

                  {isCourier ? (
                    <div className="flex flex-wrap gap-2">
                      {delivery.estado === "ASIGNADO" && (
                        <button className="primary w-auto px-4" disabled={busy} onClick={() => void transition(delivery, "EN_RUTA")}> 
                          <Route size={17} /> Iniciar ruta
                        </button>
                      )}
                      {delivery.estado === "EN_RUTA" && (
                        <>
                          <button className="primary w-auto px-4" disabled={busy} onClick={() => void transition(delivery, "ENTREGADO")}> 
                            <CheckCircle2 size={17} /> Entregado
                          </button>
                          <button className="secondary w-auto px-4" disabled={busy} onClick={() => void transition(delivery, "NO_ENTREGADO")}> 
                            <XCircle size={17} /> No entregado
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(delivery.estado === "PENDIENTE_ASIGNACION" || delivery.estado === "NO_ENTREGADO") && (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-64 flex-1 text-sm font-bold">
                            Repartidor
                            <select
                              className="input mt-1"
                              value={courierId}
                              onChange={(event) => setSelectedCourier((current) => ({ ...current, [delivery.id]: Number(event.target.value) }))}
                            >
                              <option value={0}>Seleccionar…</option>
                              {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.nombres} {courier.apellidos}</option>)}
                            </select>
                          </label>
                          <button className="primary w-auto px-4" disabled={busy || !courierId} onClick={() => void transition(delivery, "ASIGNADO", courierId)}>Asignar</button>
                        </div>
                      )}
                      {delivery.estado === "ASIGNADO" && <button className="secondary w-auto px-4" disabled={busy} onClick={() => void transition(delivery, "EN_RUTA")}><Route size={17} /> Registrar salida</button>}
                      {delivery.estado === "EN_RUTA" && (
                        <div className="flex flex-wrap gap-2">
                          <button className="secondary w-auto px-4" disabled={busy} onClick={() => void transition(delivery, "ENTREGADO")}><CheckCircle2 size={17} /> Entregado</button>
                          <button className="secondary w-auto px-4" disabled={busy} onClick={() => void transition(delivery, "NO_ENTREGADO")}><XCircle size={17} /> No entregado</button>
                        </div>
                      )}
                      {["PENDIENTE_ASIGNACION", "ASIGNADO", "NO_ENTREGADO"].includes(delivery.estado) && (
                        <button className="text-sm font-bold text-red-700" disabled={busy} onClick={() => void transition(delivery, "CANCELADO")}>Cancelar domicilio</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
