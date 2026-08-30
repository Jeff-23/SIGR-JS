import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { useApp } from "../../store/app";
import { Modal } from "../../components/Modal";
import {
  display,
  formBody,
  rowsOf,
  type Resource,
  type Row,
  type Field,
} from "./contracts";

export function ResourcePanel({ resource }: { resource: Resource }) {
  const { branchId, session, hasPermission, online } = useApp();
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [editor, setEditor] = useState<Row | null | undefined>(undefined);
  const url = (resource.listPath ?? resource.path).replaceAll(
    ":sede",
    String(branchId),
  );
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        if (session?.demo) {
          setRows([]);
          return;
        }
        const { data } = await api.get(url, {
          signal: controller.signal,
          params: resource.paginated
            ? { pagina: page, limite: 50, buscar: search || undefined }
            : undefined,
        });
        if (live)
          setRows(
            rowsOf(data).filter(
              (row) => !resource.branchFilter || row.sucursalId === branchId,
            ),
          );
      } catch (e) {
        if (live) {
          setRows([]);
          setError(errorMessage(e));
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
      controller.abort();
    };
  }, [
    url,
    page,
    search,
    revision,
    session?.demo,
    resource.paginated,
    resource.branchFilter,
    branchId,
  ]);
  const visible = resource.paginated
    ? rows
    : rows.filter((row) =>
        resource.columns.some((f) =>
          display(row[f.key]).toLowerCase().includes(search.toLowerCase()),
        ),
      );
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{resource.title}</h2>
          {resource.notice && <p className="mt-2 text-sm">{resource.notice}</p>}
        </div>
        {resource.create && hasPermission(resource.create) && (
          <button
            className="primary w-auto px-5"
            disabled={!online || session?.demo}
            onClick={() => setEditor(null)}
          >
            Crear
          </button>
        )}
      </header>
      {session?.demo && (
        <p className="rounded-xl bg-yellow-50 p-4">
          Este módulo utiliza datos reales. Inicia sesión para consultar o
          modificar; no se simulan guardados.
        </p>
      )}
      <div className="flex gap-3">
        <input
          aria-label={`Buscar ${resource.title}`}
          className="input"
          value={search}
          placeholder="Buscar…"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <button
          className="secondary w-auto px-4"
          onClick={() => setRevision((n) => n + 1)}
        >
          Actualizar
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Consultando…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {resource.columns.map((f) => (
                  <th className="p-4" key={f.key}>
                    {f.label}
                  </th>
                ))}
                <th className="p-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr key={row.id ?? index} className="border-t border-denim/10">
                  {resource.columns.map((f) => (
                    <td className="p-4" key={f.key}>
                      {display(row[f.key])}
                    </td>
                  ))}
                  <td className="p-4">
                    {resource.edit && hasPermission(resource.edit) && (
                      <button
                        className="secondary h-10 w-auto px-3"
                        disabled={!online}
                        onClick={() => setEditor(row)}
                      >
                        Editar #{row.id}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="p-6">Sin registros para esta consulta.</p>
          )}
        </div>
      )}
      {resource.paginated && (
        <nav className="flex items-center justify-between">
          <button
            disabled={page === 1 || loading}
            onClick={() => setPage((n) => n - 1)}
          >
            Anterior
          </button>
          <span>Página {page}</span>
          <button
            disabled={rows.length < 50 || loading}
            onClick={() => setPage((n) => n + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
      {editor !== undefined && (
        <ResourceEditor
          resource={resource}
          initial={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            setRevision((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

export function ResourceEditor({
  resource,
  initial,
  onClose,
  onSaved,
}: {
  resource: Resource;
  initial: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { branchId, session } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fields = resource.fields.filter((f) => !(initial && f.createOnly));
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.type === "password"
          ? ""
          : f.type === "checkbox"
            ? Boolean(initial?.[f.key])
            : String(initial?.[f.key] ?? ""),
      ]),
    ),
  );
  const [options, setOptions] = useState<Record<string, Row[]>>({}),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await Promise.all(
          resource.fields
            .filter((f) => f.lookup && !(initial && f.createOnly))
            .map(async (f) => {
              const { data } = await api.get(
                f.lookup!.replaceAll(":sede", String(branchId)),
                { signal: controller.signal },
              );
              return [
                f.key,
                rowsOf(data).filter(
                  (row) =>
                    row.sucursalId === undefined || row.sucursalId === branchId,
                ),
              ] as const;
            }),
        );
        if (!controller.signal.aborted) {
          setOptions(Object.fromEntries(result));
          setReady(true);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(errorMessage(e));
      }
    })();
    return () => controller.abort();
  }, [resource, initial, branchId]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready || session?.demo) return;
    setBusy(true);
    setError("");
    try {
      const body = formBody(fields, values, Boolean(initial));
      if (resource.branchBody && !initial) body.sucursalId = branchId;
      if (resource.method === "PUT") await api.put(resource.path, body);
      else if (initial)
        await api.patch(
          resource.updatePath?.replace(":id", String(initial.id)) ??
            `${resource.path}/${initial.id}`,
          body,
        );
      else await api.post(resource.path, body);
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error && !("isAxiosError" in e)
          ? e.message
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${initial ? "Editar" : "Crear"} · ${resource.title}`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <EditorField
              key={f.key}
              field={f}
              value={values[f.key]}
              options={options[f.key]}
              onChange={(v) =>
                setValues((current) => ({ ...current, [f.key]: v }))
              }
            />
          ))}
        </div>
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}
        <p className="text-xs text-denim/60">
          Si se pierde la respuesta al guardar, consulta el listado antes de
          repetir la creación.
        </p>
        <button className="primary" disabled={busy || !ready}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </Modal>
  );
}
export function EditorField({
  field: f,
  value,
  options,
  onChange,
}: {
  field: Field;
  value: string | boolean | undefined;
  options?: Row[];
  onChange: (value: string | boolean) => void;
}) {
  return (
    <label className="text-sm font-semibold">
      {f.label}
      {f.required ? " *" : ""}
      {f.options || f.lookup ? (
        <select
          className="input mt-1"
          required={f.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Seleccionar</option>
          {f.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
          {options?.map((o) => (
            <option key={o.id} value={o.id}>
              {display(o.nombre ?? o.nombres ?? o.numero)} · #{o.id}
            </option>
          ))}
        </select>
      ) : f.type === "checkbox" ? (
        <input
          className="ml-3"
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : (
        <input
          className="input mt-1"
          type={f.type ?? "text"}
          required={f.required}
          min={f.type === "number" ? (f.min ?? 0) : undefined}
          step={f.step}
          maxLength={f.maxLength}
          autoComplete={f.type === "password" ? "new-password" : "off"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
