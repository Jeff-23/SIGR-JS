import { useState } from "react";
import { useResource } from "../hooks/useResource";
import { useApp } from "../store/app";
import { ResourceEditor } from "../features/management/ResourcePanel";
import {
  field,
  type Row,
  type Resource,
} from "../features/management/contracts";
type Delivery = Row & {
  id: number;
  estado: string;
  destinatario: string;
  direccion: string;
  telefono: string;
  pedido: { id: number; sucursalId: number; estado: string };
  repartidor?: { nombres: string };
  costo: string;
  creadoEn: string;
};
const transitions: Record<string, string[]> = {
  PENDIENTE_ASIGNACION: ["ASIGNADO", "CANCELADO"],
  ASIGNADO: ["EN_RUTA", "CANCELADO"],
  EN_RUTA: ["ENTREGADO", "NO_ENTREGADO"],
  NO_ENTREGADO: ["ASIGNADO", "CANCELADO"],
};
export function DeliveryPage() {
  const { session, branchId } = useApp();
  return <Deliveries key={`${session?.user.id}:${branchId}`} />;
}
function Deliveries() {
  const { branchId, session, hasPermission } = useApp();
  const query = useResource<Delivery[]>(
    "/pedidos/domicilios/activos",
    [],
    15000,
  );
  const [selected, setSelected] = useState<Delivery | null>(null);
  const resource: Resource = {
    key: "domicilio",
    title: "Actualizar domicilio",
    path: "/pedidos/domicilios",
    permission: "PEDIDOS_EDITAR",
    columns: [],
    fields: [
      field("estado", "Siguiente estado", {
        options: transitions[selected?.estado ?? ""] ?? [],
        required: true,
      }),
      field("repartidorId", "Repartidor (obligatorio al asignar)", {
        type: "number",
        min: 1,
      }),
      field("observacion", "Observación", { maxLength: 300 }),
    ],
  };
  return (
    <div className="space-y-5">
      <h1 className="page-title">Distribución y domicilios</h1>
      <p>
        La salida a ruta requiere pedido listo. Entregar un domicilio no
        registra un pago ni emite una factura.
      </p>
      {session?.demo && <p>Inicia sesión para consultar domicilios reales.</p>}
      <button className="secondary w-auto px-4" onClick={query.refresh}>
        Actualizar
      </button>
      {query.error && <p role="alert">{query.error}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {query.data
          .filter((d) => d.pedido.sucursalId === branchId)
          .map((d) => (
            <article className="card" key={d.id}>
              <div className="flex justify-between">
                <h2 className="text-xl font-bold">Pedido #{d.pedido.id}</h2>
                <span>{d.estado.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-3 font-bold">{d.destinatario}</p>
              <p>{d.direccion}</p>
              <p>{d.telefono}</p>
              <p className="mt-3">
                Repartidor: {d.repartidor?.nombres ?? "Sin asignar"} · Cocina:{" "}
                {d.pedido.estado}
              </p>
              <p>Registrado {new Date(d.creadoEn).toLocaleString("es-CO")}</p>
              {hasPermission("PEDIDOS_EDITAR") && (
                <button
                  className="primary mt-4"
                  disabled={Boolean(query.error)}
                  onClick={() => setSelected(d)}
                >
                  Actualizar entrega
                </button>
              )}
            </article>
          ))}
      </div>
      {!query.loading && !query.data.length && (
        <p>No hay domicilios activos.</p>
      )}
      {selected && (
        <DeliveryEditor
          resource={resource}
          selected={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            query.refresh();
          }}
        />
      )}
    </div>
  );
}
function DeliveryEditor({
  resource,
  selected,
  onClose,
  onSaved,
}: {
  resource: Resource;
  selected: Delivery;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <ResourceEditor
      resource={{ ...resource, updatePath: "/pedidos/domicilios/:id/estado" }}
      initial={{ id: selected.id }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
