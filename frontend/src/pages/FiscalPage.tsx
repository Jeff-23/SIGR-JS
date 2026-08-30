import { useRef, useState } from "react";
import { useApp } from "../store/app";
import { useResource } from "../hooks/useResource";
import { api, errorMessage } from "../lib/api";
import { Modal } from "../components/Modal";
import {
  ResourceEditor,
  ResourcePanel,
} from "../features/management/ResourcePanel";
import {
  field,
  display,
  type Row,
  type Resource,
} from "../features/management/contracts";
export function FiscalPage() {
  const { session, branchId } = useApp();
  return <Fiscal key={`${session?.user.id}:${branchId}`} />;
}
function Fiscal() {
  const { session, hasPermission } = useApp();
  const [tab, setTab] = useState("facturas");
  return (
    <div className="space-y-5">
      <h1 className="page-title">Facturación y operación fiscal</h1>
      <p className="rounded-xl bg-yellow-50 p-4">
        El archivo operativo es independiente. Emitir una factura comercial no
        significa aceptación DIAN. La transmisión requiere proveedor,
        credenciales e habilitación reales.
      </p>
      <nav className="flex flex-wrap gap-2">
        {hasPermission("FACTURAS_VER") && (
          <>
            <button
              className="secondary w-auto px-4"
              onClick={() => setTab("facturas")}
            >
              Facturas comerciales
            </button>
            <button
              className="secondary w-auto px-4"
              onClick={() => setTab("documentos")}
            >
              Documentos electrónicos
            </button>
          </>
        )}
        {hasPermission("CONFIGURACION_VER") && (
          <button
            className="secondary w-auto px-4"
            onClick={() => setTab("perfil")}
          >
            Perfil y resoluciones
          </button>
        )}
      </nav>
      {session?.demo && (
        <p>
          Esta sección no simula documentos ni aceptaciones fiscales. Inicia
          sesión para consultar el backend.
        </p>
      )}
      {tab === "perfil" && hasPermission("CONFIGURACION_VER") ? (
        <FiscalProfile />
      ) : tab === "documentos" && hasPermission("FACTURAS_VER") ? (
        <ElectronicDocuments />
      ) : hasPermission("FACTURAS_VER") ? (
        <CommercialInvoices />
      ) : (
        <p>Selecciona un módulo autorizado.</p>
      )}
    </div>
  );
}
function CommercialInvoices() {
  const { session, hasPermission } = useApp();
  const query = useResource<Row[]>("/facturas", []);
  const [sale, setSale] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [html, setHtml] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  async function execute(path: string, body: object) {
    if (busy || session?.demo) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post(path, body);
      setMessage("Operación confirmada por el servidor.");
      query.refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Facturas comerciales</h2>
      <p>Últimas 100 facturas dentro de tu alcance autorizado.</p>
      {hasPermission("FACTURAS_EMITIR") && (
        <form
          className="card flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void execute("/facturas/venta", { ventaId: Number(sale) });
          }}
        >
          <label>
            Venta a facturar
            <input
              className="input"
              type="number"
              min="1"
              required
              value={sale}
              onChange={(e) => setSale(e.target.value)}
            />
          </label>
          <button
            className="primary w-auto px-4"
            disabled={busy || session?.demo}
          >
            Emitir desde venta
          </button>
        </form>
      )}
      {(query.error || message) && (
        <p role="status">{query.error || message}</p>
      )}
      {query.data.map((row) => (
        <article
          className="card flex flex-wrap items-center justify-between gap-3"
          key={row.id}
        >
          <div>
            <strong>{display(row.numero)}</strong>
            <p>
              Total {display(row.total)} · Venta #{display(row.ventaId)}
            </p>
            <p>
              Estado electrónico:{" "}
              {row.documentoElectronico
                ? display((row.documentoElectronico as Row).estado)
                : "Sin documento electrónico"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary w-auto px-4"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const { data } = await api.get<{ contenido: string }>(
                    `/facturas/${row.id}/representacion-impresa`,
                  );
                  setHtml(data.contenido);
                } catch (e) {
                  setMessage(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Ver e imprimir
            </button>
            {hasPermission("FACTURAS_EMITIR") && !row.documentoElectronico && (
              <button
                className="secondary w-auto px-4"
                disabled={busy}
                onClick={() =>
                  void execute("/documentos-electronicos/preparar", {
                    facturaIds: [row.id],
                  })
                }
              >
                Preparar documento (sin enviar)
              </button>
            )}
          </div>
        </article>
      ))}
      {html && (
        <Modal title="Representación de factura" onClose={() => setHtml(null)}>
          <button
            className="primary mb-3"
            onClick={() => frame.current?.contentWindow?.print()}
          >
            Imprimir / guardar PDF
          </button>
          <iframe
            ref={frame}
            title="Factura imprimible"
            sandbox="allow-same-origin allow-modals"
            srcDoc={html}
            className="h-[65vh] w-full border"
          />
        </Modal>
      )}
    </section>
  );
}
function ElectronicDocuments() {
  const { session, hasPermission } = useApp();
  const query = useResource<Row[]>("/documentos-electronicos", [], 15000);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [resolution, setResolution] = useState("");
  async function action(path: string, body: object = {}) {
    if (busy || session?.demo) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post(path, body);
      setMessage(
        "Solicitud procesada. Consulta el estado devuelto por el proveedor; no implica aceptación.",
      );
      setSelected(null);
      query.refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Documentos electrónicos</h2>
      {hasPermission("FACTURAS_EMITIR") && (
        <button
          className="secondary w-auto px-4"
          disabled={busy || session?.demo}
          onClick={() => {
            if (
              window.confirm(
                "¿Procesar hasta 20 documentos pendientes? Puede transmitirlos al proveedor configurado.",
              )
            )
              void action("/documentos-electronicos/procesar-cola", {
                limite: 20,
              });
          }}
        >
          Procesar cola pendiente
        </button>
      )}
      {(message || query.error) && (
        <p role="status">{message || query.error}</p>
      )}
      {query.data.map((row) => (
        <article className="card" key={row.id}>
          <h3 className="text-xl font-bold">
            {display(row.numeroCompleto)} · Documento #{row.id}
          </h3>
          <p>
            Factura #{display(row.facturaId)} · {display(row.estado)} ·{" "}
            {display(row.ambiente)}
          </p>
          {row.cufe ? (
            <p className="break-all text-xs">CUFE: {display(row.cufe)}</p>
          ) : (
            <p>Sin CUFE confirmado</p>
          )}
          {hasPermission("FACTURAS_EMITIR") && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!row.numeroCompleto && (
                <button
                  className="secondary w-auto px-3"
                  disabled={busy}
                  onClick={() => setSelected(row.id!)}
                >
                  Asignar numeración
                </button>
              )}
              <button
                className="secondary w-auto px-3"
                disabled={busy || !row.numeroCompleto}
                onClick={() => {
                  if (
                    window.confirm(
                      `¿Encolar documento #${row.id} para transmisión?`,
                    )
                  )
                    void action(`/documentos-electronicos/${row.id}/encolar`);
                }}
              >
                Encolar envío
              </button>
              <button
                className="secondary w-auto px-3"
                disabled={busy}
                onClick={() =>
                  void action(
                    `/documentos-electronicos/${row.id}/consultar-estado`,
                  )
                }
              >
                Consultar proveedor
              </button>
            </div>
          )}
        </article>
      ))}
      {selected && (
        <Modal
          title={`Numerar documento #${selected}`}
          busy={busy}
          onClose={() => setSelected(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action(`/documentos-electronicos/${selected}/numerar`, {
                resolucionId: Number(resolution),
              });
            }}
          >
            <p>
              Selecciona el ID de una resolución vigente del restaurante. La
              numeración queda reservada de forma transaccional.
            </p>
            <label>
              ID resolución
              <input
                className="input"
                type="number"
                min="1"
                required
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Asignar número
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function FiscalProfile() {
  const { session } = useApp();
  const tenant = session?.user.restauranteId;
  if (!tenant)
    return (
      <p>
        El perfil fiscal requiere el contexto de un restaurante; usa un
        administrador de ese restaurante.
      </p>
    );
  return <TenantFiscal tenant={tenant} />;
}
function TenantFiscal({ tenant }: { tenant: number }) {
  const { session, hasPermission } = useApp();
  const base = `/fiscal/restaurantes/${tenant}`;
  const profile = useResource<Row | null>(`${base}/perfil`, null);
  const diagnostic = useResource<{
    checks: Record<string, boolean>;
    listoTransmision: boolean;
    proveedorDiagnostico?: { mensaje: string };
  }>(`${base}/diagnostico`, { checks: {}, listoTransmision: false });
  const [editing, setEditing] = useState(false);
  const profileResource: Resource = {
    key: "perfil",
    title: "Perfil fiscal",
    path: `${base}/perfil`,
    method: "PUT",
    permission: "CONFIGURACION_VER",
    columns: [],
    fields: [
      field("ambiente", "Ambiente", {
        required: true,
        options: ["HABILITACION", "PRODUCCION"],
      }),
      field("modoOperacion", "Modo", {
        required: true,
        options: ["PROVEEDOR_TECNOLOGICO", "SOFTWARE_PROPIO"],
      }),
      field("proveedorCodigo", "Código proveedor", { maxLength: 50 }),
      field("responsabilidadFiscal", "Responsabilidad fiscal", {
        required: true,
        maxLength: 20,
      }),
      field("municipioCodigo", "Código municipio (5 dígitos)", {
        required: true,
        maxLength: 5,
      }),
      field("actividadEconomica", "Actividad económica", { maxLength: 20 }),
      field("softwareIdRef", "Referencia software secret://…"),
      field("credencialRef", "Referencia credencial secret://…"),
      field("certificadoRef", "Referencia certificado secret://…"),
      field("activo", "Activo", { type: "checkbox" }),
    ],
  };
  const resolutions: Resource = {
    key: "resoluciones",
    title: "Resoluciones",
    path: `${base}/resoluciones`,
    permission: "CONFIGURACION_VER",
    create: "CONFIGURACION_GESTIONAR",
    columns: [
      field("id", "ID"),
      field("numeroResolucion", "Resolución"),
      field("prefijo", "Prefijo"),
      field("rangoDesde", "Desde"),
      field("rangoHasta", "Hasta"),
      field("siguienteNumero", "Siguiente"),
      field("vigenteHasta", "Vencimiento"),
    ],
    fields: [
      field("numeroResolucion", "Número resolución", {
        required: true,
        maxLength: 100,
      }),
      field("prefijo", "Prefijo", { maxLength: 20 }),
      field("rangoDesde", "Rango inicial", {
        type: "number",
        min: 1,
        required: true,
      }),
      field("rangoHasta", "Rango final", {
        type: "number",
        min: 1,
        required: true,
      }),
      field("siguienteNumero", "Siguiente número", { type: "number", min: 1 }),
      field("vigenteDesde", "Vigencia desde", { type: "date", required: true }),
      field("vigenteHasta", "Vigencia hasta", { type: "date", required: true }),
      field("sucursalId", "Sucursal (vacío: restaurante)", {
        lookup: "/sucursales",
      }),
      field("claveTecnicaRef", "Referencia clave técnica secret://…"),
    ],
  };
  return (
    <section className="space-y-5">
      <article className="card">
        <h2 className="text-2xl font-bold">Diagnóstico del restaurante</h2>
        {(profile.error || diagnostic.error) && (
          <p role="alert">{profile.error || diagnostic.error}</p>
        )}
        <p>
          {diagnostic.data.listoTransmision
            ? "Configuración lista para transmisión"
            : "Transmisión aún no habilitada"}
        </p>
        <p>{diagnostic.data.proveedorDiagnostico?.mensaje}</p>
        <ul className="mt-3 space-y-2">
          {Object.entries(diagnostic.data.checks).map(([key, ok]) => (
            <li key={key}>
              {ok ? "✓" : "Pendiente:"} {key}
            </li>
          ))}
        </ul>
        {hasPermission("CONFIGURACION_GESTIONAR") && (
          <button
            className="primary mt-4 w-auto px-4"
            disabled={
              session?.demo || profile.loading || Boolean(profile.error)
            }
            onClick={() => setEditing(true)}
          >
            Configurar perfil
          </button>
        )}
        <p className="mt-3 text-xs">
          Sólo referencias a secretos; no escribas contraseñas ni certificados
          en estos campos.
        </p>
      </article>
      <ResourcePanel resource={resolutions} />
      {editing && (
        <ResourceEditor
          resource={profileResource}
          initial={profile.data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            profile.refresh();
            diagnostic.refresh();
          }}
        />
      )}
    </section>
  );
}
