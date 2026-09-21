import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { productImageUrl, type ProductImage } from "../../lib/product-media";
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
    [editor, setEditor] = useState<Row | null | undefined>(undefined),
    [photoProduct, setPhotoProduct] = useState<Row | null>(null);
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
                    <div className="flex flex-wrap gap-2">
                      {resource.key === "productos" && resource.edit && hasPermission(resource.edit) && (
                        <button
                          className="secondary h-10 w-auto px-3"
                          disabled={!online}
                          onClick={() => setPhotoProduct(row)}
                        >
                          Foto
                        </button>
                      )}
                      {resource.edit && hasPermission(resource.edit) && (
                        <button
                          className="secondary h-10 w-auto px-3"
                          disabled={!online}
                          onClick={() => setEditor(row)}
                        >
                          Editar #{row.id}
                        </button>
                      )}
                    </div>
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
      {photoProduct && (
        <ProductImageEditor
          product={photoProduct}
          onClose={() => setPhotoProduct(null)}
          onSaved={() => {
            setPhotoProduct(null);
            setRevision((n) => n + 1);
          }}
        />
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
      fields.map((f) => {
        const relationKey = f.lookup && f.key.endsWith("Id")
          ? f.key.slice(0, -2)
          : undefined;
        const relation = relationKey && initial?.[relationKey];
        const initialValue = initial?.[f.key] ??
          (relation && typeof relation === "object" && "id" in relation
            ? (relation as Row).id
            : undefined);
        return [
          f.key,
          f.type === "password"
            ? ""
            : f.type === "checkbox"
              ? initial
                ? Boolean(initialValue)
                : Boolean(f.defaultValue)
              : String(initialValue ?? f.defaultValue ?? ""),
        ];
      }),
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


function ProductImageEditor({
  product,
  onClose,
  onSaved,
}: {
  product: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = product.imagenPrincipal as ProductImage | null | undefined;
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(() => file ? URL.createObjectURL(file) : productImageUrl(current, "medium"), [file, current]);
  const [focoX, setFocoX] = useState(Number(current?.focoX ?? 50));
  const [focoY, setFocoY] = useState(Number(current?.focoY ?? 50));
  const [zoom, setZoom] = useState(Number(current?.zoom ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file || !preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [file, preview]);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("archivo", file);
      data.append("focoX", String(focoX));
      data.append("focoY", String(focoY));
      data.append("zoom", String(zoom));
      await api.post(`/productos/${product.id}/imagen`, data, {
        timeout: 30000,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/productos/${product.id}/imagen`);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Foto · ${display(product.nombre)}`} busy={busy} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-denim/65">
          Selecciona una foto. SIGR corrige la orientación, recorta, comprime y genera versiones optimizadas automáticamente.
        </p>
        <label className="block rounded-2xl border border-dashed border-denim/25 p-4 text-sm font-bold">
          Elegir o tomar foto
          <input
            className="mt-2 block w-full text-sm font-normal"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="mt-2 block text-xs font-normal text-denim/50">JPG, PNG o WEBP · máximo 12 MB.</span>
        </label>
        {preview ? (
          <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-denim/5">
            <img
              src={preview}
              alt={`Vista previa de ${display(product.nombre)}`}
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${focoX}% ${focoY}%`,
                transform: `scale(${zoom})`,
                transformOrigin: `${focoX}% ${focoY}%`,
              }}
            />
          </div>
        ) : (
          <div className="grid aspect-square w-full max-w-sm place-items-center rounded-3xl bg-denim/5 text-sm text-denim/45">
            Sin foto
          </div>
        )}
        {file && (
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-bold">Horizontal · {focoX}%<input type="range" min="0" max="100" value={focoX} onChange={(e) => setFocoX(Number(e.target.value))} className="mt-2 w-full"/></label>
            <label className="text-xs font-bold">Vertical · {focoY}%<input type="range" min="0" max="100" value={focoY} onChange={(e) => setFocoY(Number(e.target.value))} className="mt-2 w-full"/></label>
            <label className="text-xs font-bold">Zoom · {zoom.toFixed(1)}×<input type="range" min="1" max="2.5" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-2 w-full"/></label>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button className="primary w-auto px-5" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Procesando…" : current ? "Reemplazar foto" : "Guardar foto"}</button>
          {current && <button className="secondary w-auto px-5" disabled={busy} onClick={() => void remove()}>Eliminar foto</button>}
          <button className="secondary w-auto px-5" disabled={busy} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}
