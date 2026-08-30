import { useState } from "react";
import { useApp } from "../store/app";
import { useResource } from "../hooks/useResource";
import { ResourceEditor } from "../features/management/ResourcePanel";
import {
  display,
  field,
  units,
  type Resource,
  type Row,
} from "../features/management/contracts";
type Stock = Row & {
  id: number;
  nombre: string;
  unidad: string;
  stock: string;
  estrategiaInventario?: string;
};
export function InventoryPage() {
  const { session, branchId } = useApp();
  return <Inventory key={`${session?.user.id}:${branchId}`} />;
}
function Inventory() {
  const { branchId, session, hasPermission, hasCapability } = useApp();
  const stock = useResource<{ productos: Stock[]; articulos: Stock[] }>(
    `/inventario/existencias?sucursalId=${branchId}`,
    { productos: [], articulos: [] },
  );
  const history = useResource<Row[]>(
    `/inventario/movimientos?sucursalId=${branchId}`,
    [],
  );
  const [editor, setEditor] = useState<Resource | null>(null),
    [query, setQuery] = useState("");
  function adjust(row: Stock, kind: "producto" | "articulo") {
    setEditor({
      key: "ajuste",
      title: `Ajustar ${row.nombre}`,
      path: "/inventario/ajustes",
      permission: "INVENTARIO_AJUSTAR",
      branchBody: true,
      columns: [],
      fields: [
        field(`${kind}Id`, kind, {
          lookup:
            kind === "producto"
              ? `/productos?sucursalId=${branchId}`
              : "/articulos",
          required: true,
        }),
        field("tipo", "Movimiento", {
          options: [
            "ENTRADA",
            "AJUSTE_POSITIVO",
            "AJUSTE_NEGATIVO",
            "MERMA",
            "DEVOLUCION",
            "CONSUMO_INTERNO",
          ],
          required: true,
        }),
        field("cantidad", "Cantidad", {
          type: "number",
          min: 0.0001,
          step: "0.0001",
          required: true,
        }),
        field("unidad", "Unidad", { options: units, required: true }),
        field("motivo", "Motivo", { required: true, maxLength: 250 }),
      ],
    });
  }
  const recipe: Resource = {
    key: "receta",
    title: "Ingrediente de receta",
    path: "/recetas",
    permission: "RECETAS_CREAR",
    columns: [],
    fields: [
      field("productoId", "Producto", {
        lookup: "/productos?sucursalId=:sede",
        required: true,
      }),
      field("articuloId", "Insumo", { lookup: "/articulos", required: true }),
      field("cantidad", "Consumo por producto", {
        type: "number",
        step: "0.0001",
        min: 0.0001,
        required: true,
      }),
      field("unidad", "Unidad de consumo", { options: units, required: true }),
    ],
  };
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="eyebrow">Existencias e historial</p>
          <h1 className="page-title">Inventario</h1>
        </div>
        {hasPermission("RECETAS_CREAR") && hasCapability("RECETAS") && (
          <button
            className="secondary w-auto px-4"
            disabled={session?.demo}
            onClick={() => setEditor(recipe)}
          >
            Agregar ingrediente a receta
          </button>
        )}
        <button
          className="secondary w-auto px-4"
          onClick={() => {
            stock.refresh();
            history.refresh();
          }}
        >
          Actualizar
        </button>
      </header>
      <p>
        Las correcciones crean movimientos nuevos. No se elimina ni sobrescribe
        el historial; las salidas y reversos de venta los genera el dominio
        comercial.
      </p>
      {session?.demo && (
        <p>
          La demostración no contiene movimientos reales. Inicia sesión para
          operar.
        </p>
      )}
      {(stock.error || history.error) && (
        <p role="alert" className="text-red-800">
          {stock.error || history.error}
        </p>
      )}
      <input
        className="input"
        aria-label="Buscar existencias"
        placeholder="Buscar producto o insumo"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {(["productos", "articulos"] as const).map((kind) => (
        <section key={kind} className="card overflow-x-auto">
          <h2 className="text-xl font-bold">
            {kind === "productos" ? "Productos" : "Insumos"}
          </h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Nombre</th>
                <th>Existencias</th>
                <th>Unidad</th>
                <th>Control</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stock.data[kind]
                .filter((r) =>
                  r.nombre.toLowerCase().includes(query.toLowerCase()),
                )
                .map((r) => (
                  <tr className="border-t" key={r.id}>
                    <td className="p-3">{r.nombre}</td>
                    <td
                      className={
                        Number(r.stock) <= 0 ? "font-bold text-red-700" : ""
                      }
                    >
                      {r.stock}
                    </td>
                    <td>{r.unidad}</td>
                    <td>{r.estrategiaInventario ?? "INSUMO"}</td>
                    <td>
                      {hasPermission("INVENTARIO_AJUSTAR") && (
                        <button
                          className="secondary my-2 h-10 w-auto px-3"
                          disabled={
                            r.estrategiaInventario !== undefined &&
                            r.estrategiaInventario !== "STOCK_DIRECTO"
                          }
                          onClick={() =>
                            adjust(
                              r,
                              kind === "productos" ? "producto" : "articulo",
                            )
                          }
                        >
                          Ajustar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {stock.loading && <p>Consultando…</p>}
        </section>
      ))}
      <section className="card overflow-x-auto">
        <h2 className="text-xl font-bold">Historial de movimientos</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Fecha",
                "Movimiento",
                "Recurso",
                "Cantidad",
                "Motivo",
                "Responsable",
              ].map((v) => (
                <th className="p-3" key={v}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.data.map((r) => (
              <tr className="border-t" key={r.id}>
                <td className="p-3">
                  {new Date(String(r.creadoEn)).toLocaleString("es-CO")}
                </td>
                <td>{display(r.tipo)}</td>
                <td>{display(r.producto ?? r.articulo)}</td>
                <td>{display(r.cantidad)}</td>
                <td>{display(r.motivo)}</td>
                <td>{display(r.usuario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editor && (
        <ResourceEditor
          resource={editor}
          initial={null}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            stock.refresh();
            history.refresh();
          }}
        />
      )}
    </div>
  );
}
