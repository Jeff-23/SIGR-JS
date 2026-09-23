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
      field("municipio", "Municipio"),
      field("telefono", "Teléfono"),
      field("whatsapp", "WhatsApp"),
      field("estado", "Activa"),
    ],
    fields: [
      name,
      field("direccion", "Dirección", { maxLength: 200 }),
      field("municipio", "Municipio", { maxLength: 100 }),
      field("departamento", "Departamento", { maxLength: 100 }),
      field("telefono", "Teléfono", { maxLength: 20 }),
      field("whatsapp", "WhatsApp", { maxLength: 30 }),
      field("correo", "Correo", { type: "email", maxLength: 150 }),
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
    field("razonSocial", "Razón social"),
    field("nit", "NIT"),
    field("dv", "DV"),
    field("municipio", "Municipio"),
    field("estado", "Activo"),
  ],
  fields: [
    field("nombre", "Nombre comercial", { required: true, maxLength: 100 }),
    field("razonSocial", "Razón social", { maxLength: 150 }),
    field("nit", "NIT", { required: true, maxLength: 20 }),
    field("dv", "DV", { maxLength: 1 }),
    field("direccion", "Dirección", { maxLength: 200 }),
    field("municipio", "Municipio", { maxLength: 100 }),
    field("departamento", "Departamento", { maxLength: 100 }),
    field("telefono", "Teléfono", { maxLength: 20 }),
    field("whatsapp", "WhatsApp", { maxLength: 30 }),
    field("correo", "Correo", { type: "email", maxLength: 150 }),
  ],
  notice:
    "Datos maestros de puesta en marcha. Moneda y zona horaria se inicializan con COP y America/Bogota y pueden ajustarse en Configuración.",
};
const tenantResources: Resource[] = resources.map((resource) =>
  resource.key === "usuarios"
    ? {
        ...resource,
        fields: resource.fields.filter(
          (fieldConfig) => fieldConfig.key !== "restauranteId",
        ),
      }
    : resource,
);

export function AdminPage() {
  const { session, branchId, hasPermission, hasCapability } = useApp();
  const global =
    session?.user.rol === "SUPERADMIN" && session.user.restauranteId === null;
  const available = (global ? resources : tenantResources).filter(
    (resource) =>
      hasPermission(resource.permission) && hasCapability(resource.capability),
  );
  if (global)
    available.unshift({
      ...restaurants,
      create: "AUTORIZACION_GESTIONAR",
      edit: "AUTORIZACION_GESTIONAR",
      remove: "AUTORIZACION_GESTIONAR",
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
        {(global || hasPermission("AUTORIZACION_VER")) && (
          <button
            className="secondary w-auto px-4"
            onClick={() => setTab("accesos")}
          >
            Roles y planes
          </button>
        )}
        {global && (
          <button
            className="secondary w-auto px-4"
            onClick={() => setTab("politica-documentos")}
          >
            Política interna
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
      {tab === "accesos" && (global || hasPermission("AUTORIZACION_VER")) ? (
        <AccessPanel key={session?.user.id} />
      ) : tab === "politica-documentos" && global ? (
        <InternalDocumentPolicyPanel key={session?.user.id} />
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
  clave: string;
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
  const canManageAccess =
    global || hasPermission("AUTORIZACION_GESTIONAR");
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
          {canManageAccess && (global || !((row as Role).clave === "ADMIN" || (row as Role).clave.endsWith(":ADMIN"))) ? (
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
          ) : !global && ((row as Role).clave === "ADMIN" || (row as Role).clave.endsWith(":ADMIN")) ? (
            <span className="text-sm opacity-60">
              Rol protegido por plataforma
            </span>
          ) : null}
        </article>
      ))}
      {global && canManageAccess && (
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
type InternalDocumentPolicy = {
  restauranteId: number;
  modo: "CONTROLADA" | "FLEXIBLE";
  permisoCajero: string;
  actualizadoEn: string | null;
};
function InternalDocumentPolicyPanel() {
  const { session } = useApp();
  const [restaurantId, setRestaurantId] = useState("");
  const [policy, setPolicy] = useState<InternalDocumentPolicy | null>(null);
  const [mode, setMode] = useState<"CONTROLADA" | "FLEXIBLE">("CONTROLADA");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadPolicy() {
    const id = Number(restaurantId);
    if (!Number.isInteger(id) || id < 1) {
      setError("Indica un ID de restaurante válido.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.get<InternalDocumentPolicy>(
        `/autorizacion/restaurantes/${id}/politica-documentos-internos`,
      );
      setPolicy(data);
      setMode(data.modo);
    } catch (e) {
      setPolicy(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy() {
    const id = Number(restaurantId);
    if (!Number.isInteger(id) || id < 1) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put<InternalDocumentPolicy>(
        `/autorizacion/restaurantes/${id}/politica-documentos-internos`,
        { modo: mode, password, pin },
      );
      setPolicy(data);
      setPassword("");
      setPin("");
      setMessage(
        `Política ${data.modo} aplicada. El permiso ${data.permisoCajero} se administra desde Roles y planes.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Política privada de documentos internos</h2>
        <p className="mt-2 text-sm opacity-80">
          Solo SUPERADMIN global puede cambiar este modo. CONTROLADA mantiene el
          flujo sin exclusiones; FLEXIBLE habilita el futuro flujo de exclusión
          en cierre para roles que reciban el permiso específico.
        </p>
      </div>
      <div className="card space-y-4">
        <label>
          ID del restaurante
          <input
            className="input"
            type="number"
            min="1"
            value={restaurantId}
            onChange={(e) => {
              setRestaurantId(e.target.value);
              setPolicy(null);
              setMessage("");
              setError("");
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !restaurantId}
          onClick={() => void loadPolicy()}
        >
          Consultar política
        </button>
        {policy && (
          <div className="rounded-xl border p-4">
            <p>
              Modo actual: <strong>{policy.modo}</strong>
            </p>
            <p className="mt-1 text-xs opacity-70">
              Permiso delegable: {policy.permisoCajero}
            </p>
            <fieldset className="mt-4 space-y-2">
              <legend className="font-semibold">Nuevo modo</legend>
              {(["CONTROLADA", "FLEXIBLE"] as const).map((value) => (
                <label className="flex items-start gap-2" key={value}>
                  <input
                    type="radio"
                    name="document-policy"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  <span>
                    <strong>{value}</strong>
                    <span className="block text-sm opacity-75">
                      {value === "CONTROLADA"
                        ? "No habilita exclusión de documentos internos en el cierre."
                        : "Permite que el ADMIN delegue el permiso a cajeros concretos; la exclusión real seguirá protegida por el cierre y reautenticación."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                Contraseña SUPERADMIN
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                PIN privado de plataforma
                <input
                  className="input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              </label>
            </div>
            <button
              className="primary mt-4"
              disabled={busy || session?.demo || password.length < 1 || pin.length < 6}
              onClick={() => void savePolicy()}
            >
              Confirmar cambio privado
            </button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
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
