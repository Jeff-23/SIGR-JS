import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../store/app";
import { useResource } from "../hooks/useResource";
import { api, errorMessage } from "../lib/api";
type Config = {
  valores: Record<string, string | number | boolean>;
  origenes: Record<string, string>;
};
export function SettingsPage() {
  const { session, branchId } = useApp();
  return <Settings key={`${session?.user.id}:${branchId}`} />;
}
function Settings() {
  const { branchId, session, hasPermission } = useApp();
  const query = useResource<Config>(`/configuracion/efectiva/${branchId}`, {
    valores: {},
    origenes: {},
  });
  const [changes, setChanges] = useState<
      Record<string, string | number | boolean>
    >({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="space-y-5">
      <h1 className="page-title">Configuración efectiva</h1>
      <p>
        Sólo se guardan las claves modificadas. Los valores heredados del
        restaurante se conservan.
      </p>
      <div className="flex gap-4">
        <Link to="/fiscal">Perfil fiscal y resoluciones</Link>
        <Link to="/administracion">Usuarios y accesos</Link>
      </div>
      {query.error && <p role="alert">{query.error}</p>}
      <form
        className="card max-w-4xl space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || session?.demo) return;
          setBusy(true);
          setMessage("");
          let saved = 0;
          try {
            for (const [key, value] of Object.entries(changes)) {
              await api.patch(
                `/configuracion/sucursales/${branchId}/${encodeURIComponent(key)}`,
                { valor: value },
              );
              saved++;
              setChanges((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              });
            }
            setMessage(`${saved} cambios guardados y auditados.`);
            query.refresh();
          } catch (err) {
            setMessage(
              `${saved} cambios confirmados; faltan los restantes. ${errorMessage(err)}`,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(query.data.valores).map(([key, value]) => (
            <label key={key}>
              {key.replaceAll("_", " ")}
              {key === "ANCHO_PAPEL" ? (
                <select
                  className="input mt-1"
                  disabled={!hasPermission("CONFIGURACION_GESTIONAR") || busy}
                  value={String(changes[key] ?? value)}
                  onChange={(e) =>
                    setChanges((current) => ({
                      ...current,
                      [key]: Number(e.target.value),
                    }))
                  }
                >
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                </select>
              ) : typeof value === "boolean" ? (
                <select
                  className="input mt-1"
                  disabled={!hasPermission("CONFIGURACION_GESTIONAR") || busy}
                  value={String(changes[key] ?? value)}
                  onChange={(e) =>
                    setChanges((current) => ({
                      ...current,
                      [key]: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  className="input mt-1"
                  disabled={!hasPermission("CONFIGURACION_GESTIONAR") || busy}
                  type={typeof value === "number" ? "number" : "text"}
                  min={typeof value === "number" ? 0 : undefined}
                  max={key === "PORCENTAJE_IMPUESTO" ? 100 : undefined}
                  step="0.01"
                  value={String(changes[key] ?? value)}
                  onChange={(e) =>
                    setChanges((current) => ({
                      ...current,
                      [key]:
                        typeof value === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                    }))
                  }
                />
              )}
              <small>Origen: {query.data.origenes[key]}</small>
            </label>
          ))}
        </div>
        {message && <p role="status">{message}</p>}
        {hasPermission("CONFIGURACION_GESTIONAR") && (
          <button
            className="primary"
            disabled={busy || session?.demo || !Object.keys(changes).length}
          >
            Guardar modificaciones
          </button>
        )}
        {session?.demo && <p>La configuración real requiere iniciar sesión.</p>}
      </form>
    </div>
  );
}
