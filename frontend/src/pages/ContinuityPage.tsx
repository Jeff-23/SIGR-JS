import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  RefreshCw,
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

export function ContinuityPage() {
  const { session, branchId } = useApp();
  return <Continuity key={`${session?.user.id}:${branchId}`} />;
}

function Continuity() {
  const { online, setPendingCount } = useApp();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof ownedPending>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<ReturnType<typeof apiFailure> | null>(null);

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
    const initial = window.setTimeout(() => void loadStatus(), 0);
    const timer = window.setInterval(() => void loadStatus(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Continuidad y sincronización</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Estado real del nodo SIGR y su comunicación híbrida. La cola del navegador se muestra
            aparte porque no representa los eventos pendientes del nodo EDGE.
          </p>
        </div>
        <button className="secondary w-auto px-4" onClick={() => void loadStatus()}>
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
              await loadStatus();
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
        <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900" role="status">
          <TriangleAlert size={18} /> Se muestra el último diagnóstico disponible; la actualización más reciente falló.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="card space-y-2">
          <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${stateClass}`}>
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
          {status.peer.lastContactAt && <p className="text-xs text-slate-500">Último contacto: {formatDate(status.peer.lastContactAt)}</p>}
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
