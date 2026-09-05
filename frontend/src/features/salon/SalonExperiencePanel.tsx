import {
  CalendarDays,
  Clock3,
  Merge,
  MoveRight,
  Scissors,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../../lib/api";
import type { ApiOrder, ApiTable } from "./contracts";

type Reservation = {
  id: number;
  nombreCliente: string;
  telefono: string;
  personas: number;
  fechaHora: string;
  estado: string;
  mesa?: ApiTable | null;
};
type Waiting = {
  id: number;
  nombreCliente: string;
  personas: number;
  estado: string;
  llegadaEn: string;
};
type User = { id: number; nombres: string; apellidos: string; activo: boolean };

export function SalonExperiencePanel({
  branchId,
  tables,
  orders,
  canEdit,
  reservationsEnabled,
  onChanged,
}: {
  branchId: number;
  tables: ApiTable[];
  orders: ApiOrder[];
  canEdit: boolean;
  reservationsEnabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [reservations, setReservations] = useState<Reservation[]>([]),
    [waiting, setWaiting] = useState<Waiting[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [mode, setMode] = useState<"reserva" | "espera" | null>(null),
    [busy, setBusy] = useState(false);
  const [reservation, setReservation] = useState({
    nombreCliente: "",
    telefono: "",
    personas: "2",
    fechaHora: "",
    mesaId: "",
    observaciones: "",
  });
  const [wait, setWait] = useState({
    nombreCliente: "",
    telefono: "",
    personas: "2",
  });
  const free = useMemo(
    () => tables.filter((table) => table.situacion === "LIBRE"),
    [tables],
  );
  const active = orders.filter(
    (order) =>
      order.tipo === "MESA" &&
      !["CANCELADO", "FACTURADO"].includes(order.estado),
  );
  const [now] = useState(() => Date.now());
  const load = useCallback(async () => {
    const u = await api.get<User[]>("/usuarios");
    setUsers(u.data.filter((item) => item.activo));
    if (!reservationsEnabled) {
      setReservations([]);
      setWaiting([]);
      return;
    }
    const [r, w] = await Promise.all([
      api.get<Reservation[]>("/reservas", { params: { sucursalId: branchId } }),
      api.get<Waiting[]>("/reservas/espera/activas", {
        params: { sucursalId: branchId },
      }),
    ]);
    setReservations(r.data);
    setWaiting(w.data);
  }, [branchId, reservationsEnabled]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch((error) => toast.error(errorMessage(error))),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function chooseTable(personas: number) {
    const candidates = free.filter((table) => table.capacidad >= personas);
    const value = window.prompt(
      `Mesa libre: ${candidates.map((table) => `${table.id}=Mesa ${table.numero}`).join(", ")}`,
      candidates[0] ? String(candidates[0].id) : "",
    );
    return value ? Number(value) : null;
  }
  return (
    <section className="card space-y-5 border-l-4 border-l-marigold">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Recepción y servicio</p>
          <h2 className="text-2xl font-black">Experiencia integral de salón</h2>
        </div>
        {canEdit && reservationsEnabled && (
          <div className="flex gap-2">
            <button
              className="secondary w-auto px-4"
              onClick={() => setMode(mode === "reserva" ? null : "reserva")}
            >
              <CalendarDays size={17} /> Reserva
            </button>
            <button
              className="secondary w-auto px-4"
              onClick={() => setMode(mode === "espera" ? null : "espera")}
            >
              <Clock3 size={17} /> Espera
            </button>
          </div>
        )}
      </header>
      {mode === "reserva" && (
        <form
          className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api.post("/reservas", {
                ...reservation,
                sucursalId: branchId,
                personas: Number(reservation.personas),
                mesaId: reservation.mesaId
                  ? Number(reservation.mesaId)
                  : undefined,
                fechaHora: new Date(
                  `${reservation.fechaHora}:00-05:00`,
                ).toISOString(),
              });
              setMode(null);
              toast.success("Reserva creada");
            });
          }}
        >
          <input
            className="input"
            required
            placeholder="Cliente"
            value={reservation.nombreCliente}
            onChange={(e) =>
              setReservation({ ...reservation, nombreCliente: e.target.value })
            }
          />
          <input
            className="input"
            required
            placeholder="Teléfono"
            value={reservation.telefono}
            onChange={(e) =>
              setReservation({ ...reservation, telefono: e.target.value })
            }
          />
          <input
            className="input"
            required
            type="number"
            min="1"
            aria-label="Personas"
            value={reservation.personas}
            onChange={(e) =>
              setReservation({ ...reservation, personas: e.target.value })
            }
          />
          <input
            className="input"
            required
            type="datetime-local"
            aria-label="Fecha de reserva"
            value={reservation.fechaHora}
            onChange={(e) =>
              setReservation({ ...reservation, fechaHora: e.target.value })
            }
          />
          <select
            className="input"
            value={reservation.mesaId}
            onChange={(e) =>
              setReservation({ ...reservation, mesaId: e.target.value })
            }
          >
            <option value="">Mesa después</option>
            {tables
              .filter((t) => t.capacidad >= Number(reservation.personas))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  Mesa {t.numero} · {t.capacidad}
                </option>
              ))}
          </select>
          <input
            className="input"
            placeholder="Observaciones"
            value={reservation.observaciones}
            onChange={(e) =>
              setReservation({ ...reservation, observaciones: e.target.value })
            }
          />
          <button className="primary md:col-span-3" disabled={busy}>
            Guardar reserva
          </button>
        </form>
      )}
      {mode === "espera" && (
        <form
          className="grid gap-3 rounded-2xl bg-amber-50 p-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api.post("/reservas/espera", {
                ...wait,
                sucursalId: branchId,
                personas: Number(wait.personas),
              });
              setMode(null);
              toast.success("Cliente agregado a espera");
            });
          }}
        >
          <input
            className="input"
            required
            placeholder="Cliente"
            value={wait.nombreCliente}
            onChange={(e) =>
              setWait({ ...wait, nombreCliente: e.target.value })
            }
          />
          <input
            className="input"
            placeholder="Teléfono"
            value={wait.telefono}
            onChange={(e) => setWait({ ...wait, telefono: e.target.value })}
          />
          <input
            className="input"
            required
            type="number"
            min="1"
            aria-label="Personas en espera"
            value={wait.personas}
            onChange={(e) => setWait({ ...wait, personas: e.target.value })}
          />
          <button className="primary" disabled={busy}>
            Agregar
          </button>
        </form>
      )}
      <div
        className={`grid gap-4 ${reservationsEnabled ? "xl:grid-cols-3" : "xl:grid-cols-1"}`}
      >
        {reservationsEnabled && (
          <div>
            <h3 className="font-bold">Reservas · {reservations.length}</h3>
            <div className="mt-2 max-h-64 space-y-2 overflow-auto">
              {reservations.map((item) => (
                <article
                  className="rounded-xl border p-3 text-sm"
                  key={item.id}
                >
                  <strong>
                    {item.nombreCliente} · {item.personas}
                  </strong>
                  <p>
                    {new Date(item.fechaHora).toLocaleString("es-CO")} ·{" "}
                    {item.mesa ? `Mesa ${item.mesa.numero}` : "Sin mesa"}
                  </p>
                  <p>{item.estado}</p>
                  {canEdit &&
                    ["PENDIENTE", "CONFIRMADA", "EN_ESPERA"].includes(
                      item.estado,
                    ) && (
                      <div className="mt-2 flex gap-2">
                        <button
                          className="secondary h-9 w-auto px-3"
                          onClick={() => {
                            const mesaId = chooseTable(item.personas);
                            if (mesaId)
                              void run(() =>
                                api.post(`/reservas/${item.id}/sentar`, {
                                  mesaId,
                                }),
                              );
                          }}
                        >
                          Sentar
                        </button>
                        <button
                          className="secondary h-9 w-auto px-3"
                          onClick={() =>
                            void run(() =>
                              api.patch(`/reservas/${item.id}/estado`, {
                                estado: "CANCELADA",
                              }),
                            )
                          }
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                </article>
              ))}
            </div>
          </div>
        )}
        {reservationsEnabled && (
          <div>
            <h3 className="font-bold">Espera · {waiting.length}</h3>
            <div className="mt-2 max-h-64 space-y-2 overflow-auto">
              {waiting.map((item, index) => (
                <article
                  className="rounded-xl border p-3 text-sm"
                  key={item.id}
                >
                  <strong>
                    #{index + 1} {item.nombreCliente} · {item.personas}
                  </strong>
                  <p>
                    {Math.max(
                      0,
                      Math.round(
                        (now - new Date(item.llegadaEn).getTime()) / 60000,
                      ),
                    )}{" "}
                    min · {item.estado}
                  </p>
                  {canEdit && (
                    <div className="mt-2 flex gap-2">
                      <button
                        className="secondary h-9 w-auto px-3"
                        onClick={() =>
                          void run(() =>
                            api.patch(`/reservas/espera/${item.id}/estado`, {
                              estado: "AVISADO",
                            }),
                          )
                        }
                      >
                        Avisar
                      </button>
                      <button
                        className="secondary h-9 w-auto px-3"
                        onClick={() => {
                          const mesaId = chooseTable(item.personas);
                          if (mesaId)
                            void run(() =>
                              api.post(`/reservas/espera/${item.id}/sentar`, {
                                mesaId,
                              }),
                            );
                        }}
                      >
                        Sentar
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
        <div>
          <h3 className="font-bold">Servicios · {active.length}</h3>
          <div className="mt-2 max-h-64 space-y-2 overflow-auto">
            {active.map((order) => (
              <article className="rounded-xl border p-3 text-sm" key={order.id}>
                <strong>
                  Pedido #{order.id} · Mesa {order.mesa?.numero}
                </strong>
                <p>
                  Mesero:{" "}
                  {order.mesero
                    ? `${order.mesero.nombres} ${order.mesero.apellidos}`
                    : "Sin asignar"}
                </p>
                <p>
                  Mesas:{" "}
                  {(
                    order.mesasVinculadas?.map((link) => link.mesa.numero) ?? [
                      order.mesa?.numero,
                    ]
                  )
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {canEdit && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      className="secondary h-9 px-2"
                      onClick={() => {
                        const ids = window.prompt(
                          `Mesas libres: ${free.map((t) => `${t.id}=M${t.numero}`).join(", ")}`,
                        );
                        if (ids)
                          void run(() =>
                            api.post(`/pedidos/${order.id}/mesas/unir`, {
                              mesaIds: ids.split(",").map(Number),
                            }),
                          );
                      }}
                    >
                      <Merge size={14} />
                      Unir
                    </button>
                    <button
                      className="secondary h-9 px-2"
                      onClick={() => {
                        const id = window.prompt("ID mesa destino");
                        if (id)
                          void run(() =>
                            api.post(`/pedidos/${order.id}/mesas/trasladar`, {
                              mesaDestinoId: Number(id),
                            }),
                          );
                      }}
                    >
                      <MoveRight size={14} />
                      Trasladar
                    </button>
                    <button
                      className="secondary h-9 px-2"
                      onClick={() => {
                        const id = window.prompt(
                          `Secundaria: ${
                            order.mesasVinculadas
                              ?.filter((x) => !x.principal)
                              .map((x) => `${x.mesa.id}=M${x.mesa.numero}`)
                              .join(", ") ?? ""
                          }`,
                        );
                        if (id)
                          void run(() =>
                            api.post(`/pedidos/${order.id}/mesas/separar`, {
                              mesaId: Number(id),
                            }),
                          );
                      }}
                    >
                      <Scissors size={14} />
                      Separar
                    </button>
                    <button
                      className="secondary h-9 px-2"
                      onClick={() => {
                        const id = window.prompt(
                          `Mesero: ${users.map((u) => `${u.id}=${u.nombres}`).join(", ")}`,
                        );
                        if (id)
                          void run(() =>
                            api.patch(`/pedidos/${order.id}/mesero`, {
                              meseroId: Number(id),
                            }),
                          );
                      }}
                    >
                      <UserRound size={14} />
                      Mesero
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
