import { useEffect, useState } from "react";
import { discardOwnedPending, ownedPending, synchronize } from "../lib/api";
import { useApp } from "../store/app";
export function ContinuityPage() {
  const { session, branchId } = useApp();
  return <Continuity key={`${session?.user.id}:${branchId}`} />;
}
function Continuity() {
  const { online, setPendingCount } = useApp();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof ownedPending>>>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    const pending = await ownedPending();
    setRows(pending);
    setPendingCount(pending.length);
  }
  useEffect(() => {
    let live = true;
    void ownedPending()
      .then((r) => {
        if (live) setRows(r);
      })
      .catch(() => {
        if (live) setMessage("No se pudo leer la cola local.");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="space-y-5">
      <h1 className="page-title">Continuidad y sincronización</h1>
      <p className="card">
        Sólo los pedidos nuevos admiten cola automática. Pagos, facturas,
        cierres, inventario y administración requieren confirmación del
        servidor. No cierres la pestaña con una operación financiera incierta.
      </p>
      <p>
        La cola pertenece a tu usuario, empresa y servidor. No se ejecuta con
        otra identidad. Para coordinar varios equipos durante una caída de
        internet se necesita infraestructura local y energía de respaldo.
      </p>
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
            await load();
          } catch {
            setMessage("No se pudo sincronizar. Los pendientes se conservan.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Sincronizar pendientes
      </button>
      {message && <p role="status">{message}</p>}
      {rows.map((r) => (
        <article className="card" key={r.id}>
          <strong>Pedido pendiente · {r.id}</strong>
          <p>{new Date(r.createdAt).toLocaleString("es-CO")}</p>
          <p>
            No confirmado por el servidor; todavía no está enviado a cocina.
          </p>
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
                await discardOwnedPending(r.id);
                setMessage("Pedido local descartado por decisión del usuario.");
                await load();
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
    </div>
  );
}
