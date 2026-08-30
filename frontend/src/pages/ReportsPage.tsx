import { useState } from "react";
import { useApp } from "../store/app";
import { useResource } from "../hooks/useResource";
import { downloadCsv, reportRange } from "../lib/reports";
import { money } from "../data/demo";
type Summary = {
  cantidadVentas: number;
  totalVentas: number;
  totalPagado: number;
};
type Day = { fecha: string; cantidadVentas: number; totalVentas: number };
type Product = { producto: string; cantidadVendida: number };
export function ReportsPage() {
  const { session, branchId } = useApp();
  return <Reports key={`${session?.user.id}:${branchId}`} />;
}
function Reports() {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Bogota",
  });
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`),
    [to, setTo] = useState(today),
    [range, setRange] = useState({
      from: `${today.slice(0, 7)}-01`,
      to: today,
    }),
    [error, setError] = useState("");
  return (
    <div className="space-y-5">
      <h1 className="page-title">Reportes</h1>
      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            reportRange(from, to);
            setRange({ from, to });
            setError("");
          } catch {
            setError("La fecha inicial debe ser anterior o igual a la final.");
          }
        }}
      >
        <label>
          Desde
          <input
            className="input"
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            className="input"
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="primary w-auto px-4">Consultar</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ReportResults
        key={`${range.from}:${range.to}`}
        from={range.from}
        to={range.to}
      />
    </div>
  );
}
function ReportResults({ from, to }: { from: string; to: string }) {
  const { branchId, session } = useApp();
  const range = reportRange(from, to);
  const params = new URLSearchParams({
    ...range.current,
    sucursalId: String(branchId),
  }).toString();
  const previousParams = new URLSearchParams({
    ...range.previous,
    sucursalId: String(branchId),
  }).toString();
  const empty = { cantidadVentas: 0, totalVentas: 0, totalPagado: 0 };
  const summary = useResource<Summary>(`/reportes/resumen?${params}`, empty);
  const previous = useResource<Summary>(
    `/reportes/resumen?${previousParams}`,
    empty,
  );
  const daily = useResource<{ datos: Day[] }>(
    `/reportes/ventas-diarias?${params}`,
    { datos: [] },
  );
  const products = useResource<{ datos: Product[] }>(
    `/reportes/productos-mas-vendidos?${params}&limite=50`,
    { datos: [] },
  );
  const stock = useResource<{ total: number }>(
    `/reportes/inventario-sin-stock?${params}`,
    { total: 0 },
  );
  const errors = [summary, previous, daily, products, stock]
    .map((q) => q.error)
    .filter(Boolean);
  const busy = [summary, previous, daily, products, stock].some(
    (q) => q.loading,
  );
  return (
    <section className="space-y-5">
      {session?.demo && (
        <p>
          Vista de demostración sin cifras contables reales. Inicia sesión para
          generar reportes.
        </p>
      )}
      {errors.length > 0 && (
        <p role="alert" className="rounded-xl bg-red-50 p-4">
          {errors.join(" · ")}
        </p>
      )}
      {busy && <p role="status">Calculando…</p>}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Ventas", money.format(summary.data.totalVentas)],
          ["Pagado", money.format(summary.data.totalPagado)],
          ["Operaciones", summary.data.cantidadVentas],
          ["Sin stock", stock.data.total],
        ].map(([title, value]) => (
          <article className="card" key={title}>
            <p>{title}</p>
            <strong className="mt-3 block text-2xl">{value}</strong>
          </article>
        ))}
      </div>
      <article className="card">
        <h2 className="font-bold">
          Comparación con período anterior equivalente
        </h2>
        <p className="mt-2">
          Ventas anteriores: {money.format(previous.data.totalVentas)}
        </p>
        <p>
          Diferencia:{" "}
          {money.format(summary.data.totalVentas - previous.data.totalVentas)}
          {previous.data.totalVentas > 0
            ? ` (${((summary.data.totalVentas / previous.data.totalVentas - 1) * 100).toFixed(1)}%)`
            : " · Sin base porcentual"}
        </p>
      </article>
      <button
        className="secondary w-auto px-4"
        disabled={busy || errors.length > 0 || session?.demo}
        onClick={() =>
          downloadCsv(`ventas-${from}-${to}.csv`, [
            ["Fecha", "Operaciones", "Total ventas"],
            ...daily.data.datos.map((d) => [
              d.fecha,
              d.cantidadVentas,
              d.totalVentas,
            ]),
          ])
        }
      >
        Exportar ventas diarias CSV
      </button>
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="card">
          <h2 className="text-xl font-bold">Ventas diarias</h2>
          <table className="mt-3 w-full text-left">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Operaciones</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {daily.data.datos.map((d) => (
                <tr key={d.fecha}>
                  <td className="py-3">{d.fecha}</td>
                  <td>{d.cantidadVentas}</td>
                  <td>{money.format(d.totalVentas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="card">
          <h2 className="text-xl font-bold">Productos más vendidos</h2>
          {products.data.datos.map((p) => (
            <div
              key={p.producto}
              className="flex justify-between border-b py-3"
            >
              <strong>{p.producto}</strong>
              <span>{p.cantidadVendida} und.</span>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
