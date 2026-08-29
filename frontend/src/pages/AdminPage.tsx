import { useState } from "react";
import { useApp } from "../store/app";
import { useResource } from "../hooks/useResource";
import { api, errorMessage } from "../lib/api";
import { Modal } from "../components/Modal";
import { ResourcePanel } from "../features/management/ResourcePanel";
import {
  display,
  field,
  type Resource,
  type Row,
} from "../features/management/contracts";
const name = field("nombre", "Nombre", { required: true });
const resources: Resource[] = [
  {
    key: "usuarios",
    title: "Usuarios",
    path: "/usuarios",
    permission: "USUARIOS_VER",
    create: "USUARIOS_CREAR",
    edit: "USUARIOS_EDITAR",
    columns: [
      field("nombres", "Nombres"),
      field("apellidos", "Apellidos"),
      field("email", "Correo"),
      field("rol", "Rol"),
      field("sucursalId", "Sucursal"),
      field("activo", "Activo"),
    ],
    fields: [
      field("nombres", "Nombres", { required: true }),
      field("apellidos", "Apellidos", { required: true }),
      field("email", "Correo", { required: true, type: "email" }),
      field("password", "Contraseña nueva (mínimo 10 caracteres)", {
        type: "password",
      }),
      field("rolId", "Rol", { lookup: "/autorizacion/roles", required: true }),
      field("restauranteId", "ID del restaurante", { type: "number", min: 1 }),
      field("sucursalId", "Sucursal (vacío: alcance del restaurante)", {
        lookup: "/sucursales",
      }),
    ],
    notice:
      "Los cambios de rol y alcance se validan en el servidor. La contraseña se transmite sólo al guardar y nunca se persiste en el borrador.",
  },
  {
    key: "sucursales",
    title: "Sucursales",
    path: "/sucursales",
    permission: "SUCURSALES_VER",
    create: "SUCURSALES_CREAR",
    edit: "SUCURSALES_EDITAR",
    columns: [
      name,
      field("direccion", "Dirección"),
      field("telefono", "Teléfono"),
      field("estado", "Activa"),
    ],
    fields: [
      name,
      field("direccion", "Dirección", { maxLength: 200 }),
      field("telefono", "Teléfono", { maxLength: 20 }),
      field("restauranteId", "ID restaurante", {
        type: "number",
        required: true,
        min: 1,
        createOnly: true,
      }),
    ],
  },
  {
    key: "estaciones",
    title: "Estaciones",
    path: "/estaciones-preparacion",
    listPath: "/estaciones-preparacion?sucursalId=:sede",
    permission: "COMANDAS_VER",
    capability: "KDS",
    create: "CONFIGURACION_GESTIONAR",
    edit: "CONFIGURACION_GESTIONAR",
    branchBody: true,
    columns: [
      name,
      field("codigo", "Código"),
      field("estado", "Activa"),
      field("orden", "Orden"),
    ],
    fields: [
      name,
      field("codigo", "Código (MAYÚSCULAS)", {
        required: true,
        createOnly: true,
        maxLength: 40,
      }),
      field("color", "Color hexadecimal (#F7CE3E)", { required: true }),
      field("orden", "Orden", { type: "number", step: "1" }),
    ],
  },
  {
    key: "metodos",
    title: "Medios de pago",
    path: "/metodos-pago",
    permission: "METODOS_PAGO_VER",
    create: "METODOS_PAGO_GESTIONAR",
    columns: [name, field("tipo", "Tipo")],
    fields: [
      name,
      field("tipo", "Tipo", {
        options: ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"],
      }),
    ],
  },
];
const restaurants: Resource = {
  key: "restaurantes",
  title: "Restaurantes",
  path: "/restaurantes",
  permission: "",
  create: "",
  edit: "",
  columns: [
    name,
    field("nit", "NIT"),
    field("correo", "Correo"),
    field("estado", "Activo"),
  ],
  fields: [
    name,
    field("nit", "NIT", { required: true }),
    field("direccion", "Dirección"),
    field("telefono", "Teléfono"),
    field("correo", "Correo", { type: "email" }),
  ],
};
export function AdminPage() {
  const { session, branchId, hasPermission, hasCapability } = useApp();
  const global =
    session?.user.rol === "SUPERADMIN" && session.user.restauranteId === null;
  const available = resources.filter(
    (r) => hasPermission(r.permission) && hasCapability(r.capability),
  );
  if (global)
    available.unshift({
      ...restaurants,
      create: "AUTORIZACION_GESTIONAR",
      edit: "AUTORIZACION_GESTIONAR",
    });
  const [tab, setTab] = useState("");
  const selected = available.find((r) => r.key === tab) ?? available[0];
  return (
    <div className="space-y-6">
      <h1 className="page-title">Administración y auditoría</h1>
      <nav className="flex flex-wrap gap-2">
        {available.map((r) => (
          <button
            key={r.key}
            className="secondary w-auto px-4"
            onClick={() => setTab(r.key)}
          >
            {r.title}
          </button>
        ))}
        {hasPermission("AUTORIZACION_VER") && (
          <button
            className="secondary w-auto px-4"
            onClick={() => setTab("accesos")}
          >
            Roles y planes
          </button>
        )}
        {hasPermission("AUDITORIA_VER") && (
          <button
            className="secondary w-auto px-4"
            onClick={() => setTab("auditoria")}
          >
            Auditoría
          </button>
        )}
      </nav>
      {tab === "accesos" && hasPermission("AUTORIZACION_VER") ? (
        <AccessPanel key={session?.user.id} />
      ) : tab === "auditoria" && hasPermission("AUDITORIA_VER") ? (
        <AuditPanel key={`${session?.user.id}:${branchId}`} />
      ) : selected ? (
        <ResourcePanel
          resource={selected}
          key={`${selected.key}:${session?.user.id}:${branchId}`}
        />
      ) : (
        <p>Sin módulos administrativos autorizados.</p>
      )}
    </div>
  );
}
type Coded = Row & { codigo: string; nombre: string };
type Role = Row & {
  id: number;
  nombre: string;
  permisos: { permiso: Coded }[];
};
type Plan = Row & {
  id: number;
  nombre: string;
  capacidades: { capacidad: { codigo: string } }[];
};
function AccessPanel() {
  const { session, hasPermission } = useApp();
  const global =
    session?.user.rol === "SUPERADMIN" && session.user.restauranteId === null;
  const catalog = useResource<{
    planes: Plan[];
    capacidades: Coded[];
    permisos: Coded[];
  }>("/autorizacion/catalogo", { planes: [], capacidades: [], permisos: [] });
  const roles = useResource<Role[]>(
    global ? "/sucursales" : "/autorizacion/roles",
    [],
  );
  const [editing, setEditing] = useState<{
      id: number;
      name: string;
      kind: "roles" | "planes";
      codes: string[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tenant, setTenant] = useState(""),
    [plan, setPlan] = useState("");
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api.put(
        `/autorizacion/${editing.kind}/${editing.id}/${editing.kind === "roles" ? "permisos" : "capacidades"}`,
        { codigos: editing.codes },
      );
      setEditing(null);
      roles.refresh();
      catalog.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Roles y planes</h2>
      <p>
        Los cambios afectan al alcance indicado y se aplican con el mismo JWT.
        Los permisos de sistema no se conceden a restaurantes.
      </p>
      {(catalog.error || roles.error) && (
        <p role="alert">{catalog.error || roles.error}</p>
      )}
      {(global ? catalog.data.planes : roles.data).map((row) => (
        <article className="card flex justify-between" key={row.id}>
          <strong>{row.nombre}</strong>
          {hasPermission("AUTORIZACION_GESTIONAR") && (
            <button
              disabled={session?.demo}
              onClick={() => {
                setError("");
                setEditing({
                  id: row.id,
                  name: row.nombre,
                  kind: global ? "planes" : "roles",
                  codes: global
                    ? (row as Plan).capacidades.map((c) => c.capacidad.codigo)
                    : (row as Role).permisos.map((p) => p.permiso.codigo),
                });
              }}
            >
              Administrar {global ? "capacidades" : "permisos"}
            </button>
          )}
        </article>
      ))}
      {global && hasPermission("AUTORIZACION_GESTIONAR") && (
        <form
          className="card space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await api.put(
                `/autorizacion/restaurantes/${Number(tenant)}/plan`,
                { planId: Number(plan) },
              );
              setError("Plan asignado y auditado.");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="font-bold">Asignar plan a restaurante</h3>
          <label>
            ID restaurante
            <input
              className="input"
              type="number"
              min="1"
              required
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
            />
          </label>
          <label>
            Plan
            <select
              className="input"
              required
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {catalog.data.planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy || session?.demo}>
            Asignar plan
          </button>
        </form>
      )}
      {error && !editing && <p role="status">{error}</p>}
      {editing && (
        <Modal
          title={editing.name}
          busy={busy}
          onClose={() => setEditing(null)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(editing.kind === "roles"
              ? catalog.data.permisos
              : catalog.data.capacidades
            ).map((c) => (
              <label
                className="flex gap-2 rounded-xl border p-3 text-sm"
                key={c.codigo}
              >
                <input
                  type="checkbox"
                  checked={editing.codes.includes(c.codigo)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      codes: e.target.checked
                        ? [...editing.codes, c.codigo]
                        : editing.codes.filter((v) => v !== c.codigo),
                    })
                  }
                />
                {c.nombre} ({c.codigo})
              </label>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
          <button
            className="primary mt-4"
            disabled={busy}
            onClick={() => void save()}
          >
            Guardar cambios de acceso
          </button>
        </Modal>
      )}
    </section>
  );
}
function AuditPanel() {
  const { branchId } = useApp();
  const [action, setAction] = useState(""),
    [page, setPage] = useState(1);
  const query = useResource<{ datos: Row[] }>(
    `/auditoria?pagina=${page}&limite=50${branchId ? `&sucursalId=${branchId}` : ""}${action ? `&accion=${encodeURIComponent(action)}` : ""}`,
    { datos: [] },
  );
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Auditoría inmutable</h2>
      <input
        className="input"
        aria-label="Filtrar acción"
        placeholder="Código exacto de acción"
        value={action}
        onChange={(e) => {
          setAction(e.target.value);
          setPage(1);
        }}
      />
      {query.error && <p role="alert">{query.error}</p>}
      {query.data.datos.map((row) => (
        <details className="card" key={row.id}>
          <summary className="cursor-pointer font-bold">
            {display(row.accion)} · {display(row.recurso)} #
            {display(row.recursoId)} · {display(row.creadoEn)}
          </summary>
          <p className="mt-3">
            Correlación: {display(row.requestId)} · Actor:{" "}
            {display(row.actorId)}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {["antes", "despues"].map((key) => (
              <div key={key}>
                <h3>{key === "antes" ? "Antes" : "Después"}</h3>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-denim/5 p-3 text-xs">
                  {JSON.stringify(row[key] ?? null, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      ))}
      <nav className="flex justify-between">
        <button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={query.data.datos.length < 50}
          onClick={() => setPage((n) => n + 1)}
        >
          Siguiente
        </button>
      </nav>
    </section>
  );
}
