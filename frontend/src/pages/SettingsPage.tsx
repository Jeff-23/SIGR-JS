import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../store/app";
import { useResource } from "../hooks/useResource";
import { api, errorMessage } from "../lib/api";
import { applyRestaurantTheme, DEFAULT_THEME, type RestaurantTheme } from "../lib/theme";
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
  const [theme, setTheme] = useState<RestaurantTheme>(DEFAULT_THEME);
  const [themeBusy, setThemeBusy] = useState(false);
  const canEditTheme =
    hasPermission("CONFIGURACION_GESTIONAR") && session?.user.sucursalId === null;

  useEffect(() => {
    if (!branchId || session?.demo) return;
    let active = true;
    api.get<RestaurantTheme>(`/configuracion/tema/${branchId}`)
      .then(({ data }) => { if (active) setTheme(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [branchId, session?.demo]);

  const saveTheme = async () => {
    if (!canEditTheme || session?.demo) return;
    setThemeBusy(true);
    try {
      const { data } = await api.patch<RestaurantTheme>("/configuracion/tema", theme);
      setTheme(data);
      applyRestaurantTheme(data);
      window.dispatchEvent(new Event("sigr:theme-refresh"));
      setMessage("Identidad visual guardada para todo el restaurante.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setThemeBusy(false);
    }
  };

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
      <section className="card max-w-4xl space-y-4">
        <div>
          <h2 className="text-xl font-black">Identidad visual del restaurante</h2>
          <p className="text-sm text-denim/55">
            Personaliza la marca en PC, tablet y celular. Los colores de alertas y estados operativos conservan su significado.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["colorPrimario", "Color principal"],
            ["colorSecundario", "Color secundario"],
            ["colorAcento", "Color de acento"],
            ["colorFondo", "Fondo"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm font-bold">
              {label}
              <input
                className="mt-2 h-12 w-full rounded-xl border border-denim/10 bg-white p-1"
                type="color"
                disabled={!canEditTheme || themeBusy}
                value={theme[key as keyof RestaurantTheme] as string}
                onChange={(event) => {
                  const next = { ...theme, [key]: event.target.value };
                  setTheme(next);
                  applyRestaurantTheme(next);
                }}
              />
            </label>
          ))}
        </div>
        <label className="block max-w-sm text-sm font-bold">
          Tipografía
          <select
            className="input mt-1"
            disabled={!canEditTheme || themeBusy}
            value={theme.tipografia}
            onChange={(event) => {
              const next = { ...theme, tipografia: event.target.value as RestaurantTheme["tipografia"] };
              setTheme(next);
              applyRestaurantTheme(next);
            }}
          >
            <option value="MANROPE">Manrope (SIGR)</option>
            <option value="SYSTEM">Sistema</option>
            <option value="ARIAL">Arial</option>
            <option value="VERDANA">Verdana</option>
            <option value="TREBUCHET">Trebuchet MS</option>
            <option value="GEORGIA">Georgia</option>
          </select>
        </label>
        <div className="rounded-2xl border border-denim/10 p-4">
          <p className="eyebrow">Vista previa</p>
          <strong className="mt-1 block text-2xl">{session?.user.restauranteNombre ?? "Tu restaurante"}</strong>
          <div className="mt-3 flex gap-2">
            <span className="rounded-xl bg-steel px-3 py-2 text-xs font-black text-white">Acción principal</span>
            <span className="rounded-xl bg-marigold px-3 py-2 text-xs font-black text-steel">Acento</span>
          </div>
        </div>
        {canEditTheme ? (
          <div className="flex flex-wrap gap-2">
            <button className="primary h-11 w-auto px-5" disabled={themeBusy} onClick={() => void saveTheme()}>
              Guardar identidad visual
            </button>
            <button
              className="secondary h-11 w-auto px-5"
              disabled={themeBusy}
              onClick={() => { setTheme(DEFAULT_THEME); applyRestaurantTheme(DEFAULT_THEME); }}
            >
              Restaurar vista previa SIGR
            </button>
          </div>
        ) : (
          <p className="text-xs text-denim/50">La identidad visual global la administra el administrador general del restaurante.</p>
        )}
      </section>
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
          {Object.entries(query.data.valores).filter(([key]) => key !== "QR_REQUIERE_ACEPTACION").map(([key, value]) => (
            <label key={key}>
              {key === "QR_MODO" ? "Modo del menú QR" : key.replaceAll("_", " ")}
              {key === "QR_MODO" ? (
                <select
                  className="input mt-1"
                  disabled={!hasPermission("CONFIGURACION_GESTIONAR") || busy}
                  value={String(changes[key] ?? value)}
                  onChange={(e) =>
                    setChanges((current) => ({
                      ...current,
                      [key]: e.target.value,
                    }))
                  }
                >
                  <option value="SOLO_MENU">Solo consultar menú</option>
                  <option value="PEDIDO_CON_APROBACION">Permitir pedidos con aprobación</option>
                  <option value="PEDIDO_AUTOMATICO">Permitir pedidos automáticos</option>
                </select>
              ) : key === "ANCHO_PAPEL" ? (
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
              <small>{key === "QR_MODO" ? "Solo menú evita que el cliente cree pedidos desde el QR. " : ""}Origen: {query.data.origenes[key]}</small>
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
