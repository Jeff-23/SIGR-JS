import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
import { money } from "../data/demo";

type Summary = {
  ventas: { cantidad: number; total: string; totalPagado: string };
  pedidos: { cantidad: number };
  operacionActual: {
    cajasAbiertas: number;
    mesasOcupadas: number;
    mesasPendientesPago: number;
  };
  productosMasVendidos: Array<{
    productoId: number;
    producto: string;
    cantidadVendida: number;
  }>;
  inventario: { sinStock: number };
};
export function RealDashboardPage() {
  const { branchId, hasPermission, hasCapability, session } = useApp();
  const allowed = hasPermission("REPORTES_VER") && hasCapability("ANALYTICS");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [range, setRange] = useState({ desde: "", hasta: "" });
  useEffect(() => {
    if (!allowed || !branchId) return;
    const controller = new AbortController();
    void api
      .get<Summary>("/dashboard/resumen", {
        signal: controller.signal,
        params: {
          sucursalId: branchId,
          desde: range.desde || undefined,
          hasta: range.hasta || undefined,
        },
      })
      .then(({ data }) => {
        setSummary(data);
        setError("");
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [allowed, branchId, range, revision]);
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">SIGR · sesión real</p>
        <h1 className="page-title">Hola, {session?.user.nombres}</h1>
      </header>
      {!allowed ? (
        <section className="card">
          <h2 className="font-bold">Tu espacio de trabajo</h2>
          <p>
            Usa las opciones de tu perfil en el menú. El resumen gerencial
            requiere permiso de reportes y capacidad Analytics.
          </p>
        </section>
      ) : !branchId ? (
        <p>Selecciona una sucursal para consultar su operación.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              Desde
              <input
                className="input"
                type="date"
                value={range.desde}
                onChange={(event) =>
                  setRange({ ...range, desde: event.target.value })
                }
              />
            </label>
            <label>
              Hasta
              <input
                className="input"
                type="date"
                value={range.hasta}
                onChange={(event) =>
                  setRange({ ...range, hasta: event.target.value })
                }
              />
            </label>
            <button
              className="secondary w-auto"
              onClick={() => setRevision(revision + 1)}
            >
              Actualizar
            </button>
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
              {error}
            </p>
          ) : !summary ? (
            <p role="status">Consultando resumen…</p>
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    "Ventas del período",
                    money.format(Number(summary.ventas.total)),
                  ],
                  ["Pagado", money.format(Number(summary.ventas.totalPagado))],
                  ["Pedidos del período", summary.pedidos.cantidad],
                  [
                    "Ticket promedio",
                    money.format(
                      summary.ventas.cantidad
                        ? Number(summary.ventas.total) / summary.ventas.cantidad
                        : 0,
                    ),
                  ],
                  [
                    "Mesas ocupadas ahora",
                    summary.operacionActual.mesasOcupadas,
                  ],
                  [
                    "Mesas pendientes de pago",
                    summary.operacionActual.mesasPendientesPago,
                  ],
                  [
                    "Cajas abiertas ahora",
                    summary.operacionActual.cajasAbiertas,
                  ],
                  ["Productos sin stock", summary.inventario.sinStock],
                ].map(([label, value]) => (
                  <article className="card" key={label}>
                    <p className="eyebrow">{label}</p>
                    <strong className="mt-3 block text-3xl">{value}</strong>
                  </article>
                ))}
              </section>
              <section className="card">
                <h2 className="font-bold">Productos más vendidos</h2>
                {summary.productosMasVendidos.map((product) => (
                  <div
                    className="flex justify-between border-b py-3"
                    key={product.productoId}
                  >
                    <span>{product.producto}</span>
                    <strong>{product.cantidadVendida} und.</strong>
                  </div>
                ))}
                {!summary.productosMasVendidos.length && (
                  <p>No hay ventas para este período.</p>
                )}
                <Link to="/reportes" className="mt-4 inline-block underline">
                  Consultar reportes
                </Link>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
