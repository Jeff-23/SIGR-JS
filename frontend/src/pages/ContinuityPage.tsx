import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  RefreshCw,
  RotateCcw,
  Server,
  TriangleAlert,
} from "lucide-react";
import { ErrorState, LoadingState } from "../components/AsyncState";
import {
  api,
  apiFailure,
  discardOwnedPending,
  ownedPending,
  synchronize,
} from "../lib/api";
import { useApp } from "../store/app";

type SyncStatus = {
  status: "HEALTHY" | "DEGRADED" | "OFFLINE" | "DISABLED";
  node: {
    id: string;
    role: "EDGE" | "CLOUD" | string;
    syncEnabled: boolean;
  };
  peer: {
    configured: boolean;
    reachable: boolean | null;
    nodeId: string | null;
    lastContactAt: string | null;
  };
  outbox: {
    pending: number;
    sending: number;
    error: number;
    lastSynchronizedAt: string | null;
  };
  inbox: {
    error: number;
    lastAppliedAt: string | null;
  };
  conflicts: {
    open: number;
  };
  checkedAt: string;
};

type OutboxDiagnostic = {
  eventId: string;
  nodoOrigenId: string;
  nodoDestinoId: string;
  tipoAgregado: string;
  agregadoGlobalId: string | null;
  tipoEvento: string;
  ocurridoEn: string;
  creadoEn: string;
  intentos: number;
  ultimoIntentoEn: string | null;
  proximoIntentoEn: string | null;
  ultimoError: string | null;
  clasificacion: "REINTENTABLE" | "EN_ESPERA" | "HISTORICO_DESTINO" | "SIN_SYNC";
  causa: "TRANSPORTE" | "RECHAZO_PEER" | "OTRO";
  reintentoManualPermitido: boolean;
  saneamientoMasivoPermitido: boolean;
};

type InboxDiagnostic = {
  eventId: string;
  nodoOrigenId: string;
  tipoAgregado: string;
  agregadoGlobalId: string | null;
  tipoEvento: string;
  ocurridoEn: string;
  recibidoEn: string;
  aplicadoEn: string | null;
  ultimoError: string | null;
  clasificacion: "NO_SOPORTADO" | "REQUIERE_REVISION";
  reintentoManualPermitido: boolean;
};

type DiagnosticResponse<T> = {
  total: number;
  items: T[];
  checkedAt: string;
};

type ConflictRow = {
  conflictoId: string;
  eventId: string;
  tipoAgregado: string;
  tipoEvento: string;
  tipo: string;
  razon: string;
  creadoEn: string;
};

export function ContinuityPage() {
  const { session, branchId } = useApp();
  return <Continuity key={`${session?.user.id}:${branchId}`} />;
}

function Continuity() {
  const { online, setPendingCount, session } = useApp();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof ownedPending>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<ReturnType<typeof apiFailure> | null>(null);
  const [outboxErrors, setOutboxErrors] = useState<OutboxDiagnostic[]>([]);
  const [outboxTotal, setOutboxTotal] = useState(0);
  const [inboxErrors, setInboxErrors] = useState<InboxDiagnostic[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [diagnosticsError, setDiagnosticsError] = useState<ReturnType<typeof apiFailure> | null>(null);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [sanitizingOutbox, setSanitizingOutbox] = useState(false);
  const canManageSync = session?.user.permisos.includes("SYNC_CONFLICTOS_GESTIONAR") ?? false;

  const loadLocal = useCallback(async () => {
    const pending = await ownedPending();
    setRows(pending);
    setPendingCount(pending.length);
  }, [setPendingCount]);

  const loadStatus = useCallback(async () => {
    try {
      setStatusError(null);
      const { data } = await api.get<SyncStatus>("/sync/estado");
      setSyncStatus(data);
    } catch (error) {
      setStatusError(apiFailure(error));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadDiagnostics = useCallback(async () => {
    try {
      setDiagnosticsError(null);
      const [outbox, inbox, conflictRows] = await Promise.all([
        api.get<DiagnosticResponse<OutboxDiagnostic>>("/sync/diagnostico/outbox"),
        api.get<DiagnosticResponse<InboxDiagnostic>>("/sync/diagnostico/inbox"),
        api.get<ConflictRow[]>("/sync/conflictos?estado=ABIERTO"),
      ]);
      setOutboxErrors(outbox.data.items);
      setOutboxTotal(outbox.data.total);
      setInboxErrors(inbox.data.items);
      setInboxTotal(inbox.data.total);
      setConflicts(conflictRows.data);
    } catch (error) {
      setDiagnosticsError(apiFailure(error));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStatus(), loadDiagnostics()]);
  }, [loadDiagnostics, loadStatus]);

  useEffect(() => {
    let live = true;
    void ownedPending()
      .then((pending) => {
        if (!live) return;
        setRows(pending);
        setPendingCount(pending.length);
      })
      .catch(() => {
        if (live) setMessage("No se pudo leer la cola local.");
      });
    return () => {
      live = false;
    };
  }, [setPendingCount]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshAll(), 0);
    const timer = window.setInterval(() => void refreshAll(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshAll]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Continuidad y sincronización</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Estado real del nodo SIGR, errores de sincronización y comunicación híbrida. La cola del
            navegador se muestra aparte porque no representa los eventos pendientes del nodo EDGE.
          </p>
        </div>
        <button className="secondary w-auto px-4" onClick={() => void refreshAll()}>
          <RefreshCw size={17} /> Actualizar estado
        </button>
      </div>

      <section className="space-y-4" aria-labelledby="hybrid-status-title">
        <div className="flex items-center gap-2">
          <Server size={20} />
          <h2 id="hybrid-status-title" className="text-lg font-black text-denim">
            Estado híbrido del restaurante
          </h2>
        </div>

        {statusLoading && !syncStatus ? (
          <LoadingState label="Consultando estado EDGE / CLOUD…" />
        ) : statusError && !syncStatus ? (
          <ErrorState
            title="No se pudo consultar el diagnóstico de sincronización"
            detail={statusError.message}
            requestId={statusError.requestId}
            retry={() => void loadStatus()}
          />
        ) : syncStatus ? (
          <HybridStatus status={syncStatus} stale={Boolean(statusError)} />
        ) : null}
      </section>

      <section className="space-y-4" aria-labelledby="diagnostics-title">
        <div className="flex items-center gap-2">
          <TriangleAlert size={20} />
          <h2 id="diagnostics-title" className="text-lg font-black text-denim">
            Diagnóstico profundo y recuperación controlada
          </h2>
        </div>

        {diagnosticsLoading ? (
          <LoadingState label="Clasificando errores de sincronización…" />
        ) : diagnosticsError ? (
          <ErrorState
            title="No se pudo cargar el detalle de sincronización"
            detail={diagnosticsError.message}
            requestId={diagnosticsError.requestId}
            retry={() => void loadDiagnostics()}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <DiagnosticCard label="Outbox con error" value={outboxTotal} />
              <DiagnosticCard label="Inbox con error" value={inboxTotal} />
              <DiagnosticCard label="Conflictos abiertos" value={conflicts.length} />
            </div>

            <div className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-denim">Errores Outbox</h3>
                  <p className="text-sm text-slate-600">
                    Los errores de transporte pueden sanearse en lotes pequeños. Rechazos del peer y destinos históricos siguen requiriendo revisión.
                  </p>
                </div>
                {canManageSync && outboxTotal > 0 && (
                  <button
                    className="secondary w-auto px-3"
                    disabled={sanitizingOutbox || retryingEventId !== null}
                    onClick={async () => {
                      if (!window.confirm("¿Reencolar hasta 10 errores transitorios de transporte? No se tocarán rechazos 400/403 ni destinos inactivos.")) return;
                      setSanitizingOutbox(true);
                      try {
                        const { data } = await api.post<{ reencolados: number }>(
                          "/sync/diagnostico/outbox/sanear-transitorios",
                          { confirmar: true, limite: 10 },
                        );
                        setMessage(`${data.reencolados} errores transitorios fueron reencolados de forma controlada.`);
                        await refreshAll();
                      } catch (error) {
                        setMessage(apiFailure(error).message);
                      } finally {
                        setSanitizingOutbox(false);
                      }
                    }}
                  >
                    <RotateCcw size={15} /> Sanear transitorios
                  </button>
                )}
              </div>
              {!outboxErrors.length && <p className="text-sm">No hay eventos Outbox en ERROR.</p>}
              {outboxErrors.map((row) => (
                <article key={row.eventId} className="rounded-2xl border border-slate-200 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <strong>{row.tipoEvento}</strong>
                      <p className="break-all text-xs text-slate-500">{row.eventId}</p>
                      <p>
                        {row.tipoAgregado} · destino {row.nodoDestinoId} · {row.intentos} intentos
                      </p>
                      <p className="text-slate-600">{row.ultimoError || "Sin detalle de error"}</p>
                      <p className="text-xs font-bold text-slate-600">Causa: {outboxCause(row.causa)}</p>
                      <p className="text-xs text-slate-500">
                        Último intento: {formatDate(row.ultimoIntentoEn)} · Próximo: {formatDate(row.proximoIntentoEn)}
                      </p>
                    </div>
                    <div className="space-y-2 text-right">
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
                        {outboxClassification(row.clasificacion)}
                      </span>
                      {canManageSync && row.reintentoManualPermitido && (
                        <button
                          className="secondary ml-auto w-auto px-3"
                          disabled={retryingEventId !== null}
                          onClick={async () => {
                            if (!window.confirm(`¿Reintentar sólo el evento ${row.eventId}?`)) return;
                            setRetryingEventId(row.eventId);
                            try {
                              await api.post(`/sync/diagnostico/outbox/${row.eventId}/reintentar`, {
                                confirmar: true,
                              });
                              setMessage("Evento reencolado para un nuevo intento controlado.");
                              await refreshAll();
                            } catch (error) {
                              setMessage(apiFailure(error).message);
                            } finally {
                              setRetryingEventId(null);
                            }
                          }}
                        >
                          <RotateCcw size={15} /> Reintentar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="card space-y-3">
                <div>
                  <h3 className="font-black text-denim">Errores Inbox</h3>
                  <p className="text-sm text-slate-600">
                    49C permite reaplicar un único Inbox en ERROR después de revisar/corregir la causa. Los tipos no soportados quedan bloqueados.
                  </p>
                </div>
                {!inboxErrors.length && <p className="text-sm">No hay eventos Inbox en ERROR.</p>}
                {inboxErrors.map((row) => (
                  <article key={row.eventId} className="rounded-2xl border border-slate-200 p-3 text-sm">
                    <strong>{row.tipoEvento}</strong>
                    <p className="break-all text-xs text-slate-500">{row.eventId}</p>
                    <p className="mt-1 text-slate-600">{row.ultimoError || "Sin detalle de error"}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold">{inboxClassification(row.clasificacion)}</p>
                      {canManageSync && row.reintentoManualPermitido && (
                        <button
                          className="secondary w-auto px-3"
                          disabled={retryingEventId !== null || sanitizingOutbox}
                          onClick={async () => {
                            if (!window.confirm(`¿Reaplicar sólo el Inbox ${row.eventId}? Hazlo únicamente si la causa original ya fue corregida.`)) return;
                            setRetryingEventId(row.eventId);
                            try {
                              const { data } = await api.post<{ estado: string; ultimoError: string | null }>(
                                `/sync/diagnostico/inbox/${row.eventId}/reintentar`,
                                { confirmar: true },
                              );
                              setMessage(
                                data.estado === "APLICADO"
                                  ? "Inbox reaplicado correctamente."
                                  : data.ultimoError || `El Inbox quedó en ${data.estado}.`,
                              );
                              await refreshAll();
                            } catch (error) {
                              setMessage(apiFailure(error).message);
                            } finally {
                              setRetryingEventId(null);
                            }
                          }}
                        >
                          <RotateCcw size={15} /> Reaplicar
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="card space-y-3">
                <div>
                  <h3 className="font-black text-denim">Conflictos abiertos</h3>
                  <p className="text-sm text-slate-600">
                    Se muestran para soporte; la resolución conserva el flujo administrativo existente.
                  </p>
                </div>
                {!conflicts.length && <p className="text-sm">No hay conflictos abiertos.</p>}
                {conflicts.slice(0, 20).map((row) => (
                  <article key={row.conflictoId} className="rounded-2xl border border-slate-200 p-3 text-sm">
                    <strong>{row.tipo} · {row.tipoEvento}</strong>
                    <p className="break-all text-xs text-slate-500">{row.eventId}</p>
                    <p className="mt-1 text-slate-600">{row.razon}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(row.creadoEn)}</p>
                  </article>
                ))}
                {conflicts.length > 20 && (
                  <p className="text-xs text-slate-500">Se muestran los 20 conflictos abiertos más recientes.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="browser-queue-title">
        <div className="flex items-center gap-2">
          <Database size={20} />
          <h2 id="browser-queue-title" className="text-lg font-black text-denim">
            Cola local de este dispositivo
          </h2>
        </div>

        <div className="card space-y-2">
          <p className="font-bold">Esta cola pertenece al navegador, no al Outbox del nodo EDGE.</p>
          <p>
            Sólo los pedidos nuevos admiten cola automática. Pagos, facturas, cierres,
            inventario y administración requieren confirmación del servidor. No cierres la pestaña
            con una operación financiera incierta.
          </p>
          <p>
            La cola pertenece a tu usuario, empresa y servidor. No se ejecuta con otra identidad.
          </p>
        </div>

        <button
          className="primary w-auto px-5"
          disabled={!online || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await synchronize();
              setMessage(
                `${result.synced} confirmados; ${result.remaining} pendientes. Si no avanzan, revisa el conflicto antes de crear otro pedido.`,
              );
              await loadLocal();
              await refreshAll();
            } catch {
              setMessage("No se pudo sincronizar. Los pendientes se conservan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Sincronizar pendientes del navegador
        </button>

        {message && <p role="status">{message}</p>}
        {rows.map((row) => (
          <article className="card" key={row.id}>
            <strong>Pedido pendiente · {row.id}</strong>
            <p>{new Date(row.createdAt).toLocaleString("es-CO")}</p>
            <p>No confirmado por el servidor; todavía no está enviado a cocina.</p>
            <button
              className="secondary mt-3 w-auto"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    "¿Descartar este pedido local? Sólo hazlo si confirmaste que no fue recibido por el restaurante.",
                  )
                )
                  return;
                setBusy(true);
                try {
                  await discardOwnedPending(row.id);
                  setMessage("Pedido local descartado por decisión del usuario.");
                  await loadLocal();
                } catch {
                  setMessage("No se pudo descartar el pendiente.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Descartar pendiente
            </button>
          </article>
        ))}
        {!rows.length && <p>No hay pedidos pendientes para esta sesión.</p>}
      </section>
    </div>
  );
}

function DiagnosticCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-denim">{value}</p>
    </article>
  );
}

function HybridStatus({ status, stale }: { status: SyncStatus; stale: boolean }) {
  const stateLabel = {
    HEALTHY: "Operativo",
    DEGRADED: "Requiere atención",
    OFFLINE: "Cloud no disponible",
    DISABLED: "Sincronización deshabilitada",
  }[status.status];

  const stateClass =
    status.status === "HEALTHY"
      ? "bg-emerald-50 text-emerald-700"
      : status.status === "OFFLINE"
        ? "bg-amber-100 text-amber-900"
        : status.status === "DEGRADED"
          ? "bg-orange-100 text-orange-800"
          : "bg-slate-100 text-slate-700";

  return (
    <div className="space-y-4">
      {stale && (
        <div
          className="flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900"
          role="status"
        >
          <TriangleAlert size={18} /> Se muestra el último diagnóstico disponible; la actualización más reciente falló.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="card space-y-2">
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${stateClass}`}
          >
            {status.status === "HEALTHY" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {stateLabel}
          </span>
          <strong className="block text-lg">Nodo {status.node.role}</strong>
          <p className="break-all text-xs text-slate-500">{status.node.id}</p>
        </article>

        <article className="card space-y-2">
          <div className="flex items-center gap-2 font-black">
            {status.peer.reachable === false ? <CloudOff size={19} /> : <Cloud size={19} />}
            Peer {status.node.role === "EDGE" ? "CLOUD" : "EDGE"}
          </div>
          <p className="text-lg font-black">{peerLabel(status)}</p>
          {status.peer.lastContactAt && (
            <p className="text-xs text-slate-500">Último contacto: {formatDate(status.peer.lastContactAt)}</p>
          )}
        </article>

        <article className="card space-y-2">
          <strong className="block">Outbox del nodo</strong>
          <p><b>{status.outbox.pending}</b> pendientes · <b>{status.outbox.sending}</b> enviando</p>
          <p><b>{status.outbox.error}</b> con error</p>
          <p className="text-xs text-slate-500">Último envío: {formatDate(status.outbox.lastSynchronizedAt)}</p>
        </article>

        <article className="card space-y-2">
          <strong className="block">Recepción y conflictos</strong>
          <p><b>{status.inbox.error}</b> Inbox con error</p>
          <p><b>{status.conflicts.open}</b> conflictos abiertos</p>
          <p className="text-xs text-slate-500">Última aplicación: {formatDate(status.inbox.lastAppliedAt)}</p>
        </article>
      </div>

      <p className="text-xs text-slate-500">Diagnóstico actualizado: {formatDate(status.checkedAt)}</p>
    </div>
  );
}

function outboxClassification(value: OutboxDiagnostic["clasificacion"]) {
  return {
    REINTENTABLE: "Reintentable",
    EN_ESPERA: "En backoff",
    HISTORICO_DESTINO: "Destino histórico",
    SIN_SYNC: "Sync deshabilitado",
  }[value];
}

function outboxCause(value: OutboxDiagnostic["causa"]) {
  if (value === "TRANSPORTE") return "Transporte / disponibilidad";
  if (value === "RECHAZO_PEER") return "Rechazo de alcance o autorización del peer";
  return "Negocio / revisión manual";
}

function inboxClassification(value: InboxDiagnostic["clasificacion"]) {
  return {
    NO_SOPORTADO: "Evento no soportado: requiere revisión",
    REQUIERE_REVISION: "Requiere revisión",
  }[value];
}

function peerLabel(status: SyncStatus) {
  if (!status.node.syncEnabled) return "Sincronización deshabilitada";
  if (!status.peer.configured) return "No configurado";
  if (status.peer.reachable === true) return "Disponible ahora";
  if (status.peer.reachable === false) return "No disponible";
  return status.peer.lastContactAt ? "Último contacto registrado" : "Sin contacto registrado";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("es-CO") : "Sin registro";
}
