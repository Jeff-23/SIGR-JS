import {
  Download,
  Eye,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import { money } from "../data/demo";
import { api, errorMessage } from "../lib/api";
import { Modal } from "../components/Modal";
import { FinancialRecovery } from "../components/FinancialRecovery";
import { confirmedPost } from "../lib/confirmed-operation";
import { parseArchiveDraft, type PaperDraft } from "../lib/archive-draft";
import { archiveParams, archiveFilterError } from "../lib/archive-filters";
import { useApp } from "../store/app";

type InvoiceRecord = {
  id: number;
  numero: string;
  numeroComanda: string | null;
  numeroSoporte: string | null;
  origen: "SISTEMA" | "PAPEL" | "DIGITACION_DIRECTA" | "IMPORTADO";
  fechaOperacion: string;
  subtotal: string | number;
  impuestos: string | number;
  descuentos: string | number;
  propina: string | number;
  domicilio: string | number;
  total: string | number;
  detalles?: Array<Line & { total: number }>;
  formasPago?: Array<{ nombre: string; monto: number }>;
  soporteArchivoRef?: string | null;
  sucursal: { id: number; nombre: string };
  digitadoPor: { nombres: string; apellidos: string };
};

type Line = { nombre: string; cantidad: number; precioUnitario: number };
const localDate = (date: Date) =>
  date
    .toLocaleString("sv-SE", { timeZone: "America/Bogota" })
    .slice(0, 16)
    .replace(" ", "T");

const demoRecords: InvoiceRecord[] = [
  {
    id: 1,
    numero: "PAP-1842",
    numeroComanda: "C-1842",
    numeroSoporte: "S-1842",
    origen: "PAPEL",
    fechaOperacion: new Date().toISOString(),
    subtotal: 42000,
    impuestos: 3360,
    descuentos: 0,
    propina: 0,
    domicilio: 0,
    total: 45360,
    sucursal: { id: 1, nombre: "La Carolina" },
    digitadoPor: { nombres: "Laura", apellidos: "Cajera" },
  },
  {
    id: 2,
    numero: "FAC-1-108",
    numeroComanda: null,
    numeroSoporte: null,
    origen: "SISTEMA",
    fechaOperacion: new Date(Date.now() - 86400000).toISOString(),
    subtotal: 68000,
    impuestos: 5440,
    descuentos: 0,
    propina: 0,
    domicilio: 0,
    total: 73440,
    sucursal: { id: 1, nombre: "La Carolina" },
    digitadoPor: { nombres: "Carlos", apellidos: "Administrador" },
  },
];

export function InvoicesPage() {
  const { session, branchId } = useApp();
  return (
    <ArchivePage
      key={`${session?.user.restauranteId}:${session?.user.id}:${branchId}:${session?.demo}`}
    />
  );
}

function ArchivePage() {
  const { session, branchId, online } = useApp();
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [amount, setAmount] = useState(0);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [origin, setOrigin] = useState("");
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const filters = useMemo(
    () => ({ search, from, to, minimum, maximum, origin }),
    [search, from, to, minimum, maximum, origin],
  );
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const canCreate =
    (session?.user.permisos.includes("REGISTROS_FACTURA_CREAR") ?? false) &&
    branchId !== null;
  const canDelete =
    session?.user.permisos.includes("REGISTROS_FACTURA_ELIMINAR") ?? false;
  const canExport =
    session?.user.permisos.includes("REGISTROS_FACTURA_EXPORTAR") ?? false;

  const load = useCallback(
    async (quiet = false) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const invalid = archiveFilterError(filters);
      if (invalid) {
        setLoadError(invalid);
        setRecords([]);
        setTotal(0);
        setAmount(0);
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      if (session?.demo) {
        const filtered = demoRecords.filter(
          (record) =>
            (branchId === null || record.sucursal.id === branchId) &&
            (!origin || record.origen === origin) &&
            (!from ||
              record.fechaOperacion >=
                new Date(`${from}T00:00:00-05:00`).toISOString()) &&
            (!to ||
              record.fechaOperacion <=
                new Date(`${to}T23:59:59.999-05:00`).toISOString()) &&
            (minimum === "" || Number(record.total) >= Number(minimum)) &&
            (maximum === "" || Number(record.total) <= Number(maximum)) &&
            (!search ||
              [record.numero, record.numeroComanda, record.numeroSoporte].some(
                (value) => value?.toLowerCase().includes(search.toLowerCase()),
              )),
        );
        setRecords(filtered.slice((page - 1) * 50, page * 50));
        setLoadError(null);
        setTotal(filtered.length);
        setAmount(
          filtered.reduce((sum, record) => sum + Number(record.total), 0),
        );
        setLoading(false);
        return;
      }
      try {
        const response = await api.get("/registros-factura", {
          signal: controller.signal,
          params: {
            ...archiveParams(filters, branchId),
            pagina: page,
            limite: 50,
          },
        });
        if (controller.signal.aborted) return;
        setLoadError(null);
        setRecords(response.data.datos);
        setTotal(response.data.resumen.cantidad);
        setAmount(Number(response.data.resumen.total ?? 0));
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(errorMessage(error));
          setRecords([]);
          setTotal(0);
          setAmount(0);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [
      branchId,
      filters,
      from,
      maximum,
      minimum,
      origin,
      page,
      search,
      session?.demo,
      to,
    ],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => online && void load(true), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      activeRequest.current?.abort();
    };
  }, [load, online]);

  async function remove(record: InvoiceRecord) {
    if (
      !window.confirm(
        `Eliminar definitivamente el registro ${record.numero}? La venta y DIAN no serán modificados.`,
      )
    )
      return;
    try {
      if (session?.demo)
        setRecords((current) =>
          current.filter((item) => item.id !== record.id),
        );
      else await api.delete(`/registros-factura/${record.id}`);
      toast.success("Registro eliminado");
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function exportCsv() {
    try {
      const invalid = archiveFilterError(filters);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      if (session?.demo) {
        toast(
          "La exportación requiere una sesión real; los datos mostrados son ficticios.",
        );
        return;
      }
      const response = await api.get("/registros-factura/exportar.csv", {
        params: archiveParams(filters, branchId),
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `facturas-${from || "inicio"}-${to || "hoy"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function openSupport(record: InvoiceRecord) {
    try {
      if (record.soporteArchivoRef?.startsWith("http")) {
        window.open(record.soporteArchivoRef, "_blank", "noopener,noreferrer");
        return;
      }
      const response = await api.get(
        `/registros-factura/${record.id}/soporte`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(response.data);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function setPeriod(kind: "today" | "month") {
    const today = new Date();
    const end = localDate(today).slice(0, 10);
    const start = kind === "today" ? end : `${end.slice(0, 7)}-01`;
    setFrom(start);
    setTo(end);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Archivo operativo</p>
          <h1 className="page-title">Facturas y comprobantes</h1>
          <p className="mt-2 text-sm text-denim/50">
            Registro independiente. Nada se envía automáticamente a DIAN.
          </p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <button
              className="secondary h-12 w-auto px-4"
              onClick={() => void exportCsv()}
            >
              <Download size={18} /> Exportar
            </button>
          )}
          {canCreate && (
            <button
              className="primary h-12 w-auto px-4"
              onClick={() => setOpen(true)}
            >
              <Plus size={18} /> Registrar
            </button>
          )}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="card">
          <p className="eyebrow">Registros encontrados</p>
          <strong className="mt-2 block text-3xl font-black">{total}</strong>
        </article>
        <article className="card sm:col-span-2">
          <p className="eyebrow">Total del período</p>
          <strong className="mt-2 block text-3xl font-black">
            {money.format(amount)}
          </strong>
        </article>
      </section>

      <section className="card">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="rounded-xl bg-denim/5 px-3 py-2 text-xs font-bold"
            onClick={() => setPeriod("today")}
          >
            Hoy
          </button>
          <button
            className="rounded-xl bg-denim/5 px-3 py-2 text-xs font-bold"
            onClick={() => setPeriod("month")}
          >
            Este mes
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
          <label className="relative">
            <Search className="absolute left-4 top-4 text-denim/30" size={18} />
            <input
              className="input pl-11"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Factura, comanda o soporte"
            />
          </label>
          <input
            className="input"
            type="date"
            aria-label="Desde"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
          <input
            className="input"
            type="date"
            aria-label="Hasta"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
          <button className="secondary h-14 px-4" onClick={() => void load()}>
            <RefreshCw size={18} /> Consultar
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label>
            Origen
            <select
              className="input"
              value={origin}
              onChange={(event) => {
                setOrigin(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {["PAPEL", "SISTEMA", "DIGITACION_DIRECTA", "IMPORTADO"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Monto mínimo
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={minimum}
              onChange={(event) => {
                setMinimum(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Monto máximo
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={maximum}
              onChange={(event) => {
                setMaximum(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      </section>

      {loadError && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          No se pudo actualizar el archivo: {loadError}
        </p>
      )}

      <section className="overflow-hidden rounded-[24px] border border-denim/[.06] bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-denim/[.035] text-xs uppercase tracking-wider text-denim/45">
              <tr>
                <th className="px-5 py-4">Fecha / número</th>
                <th className="px-5 py-4">Origen</th>
                <th className="px-5 py-4">Comanda / soporte</th>
                <th className="px-5 py-4">Digitado por</th>
                <th className="px-5 py-4 text-right">Impuestos</th>
                <th className="px-5 py-4 text-right">Total</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-denim/[.06]">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-marigold/[.06]">
                  <td className="px-5 py-4">
                    <strong className="block">{record.numero}</strong>
                    <span className="text-xs text-denim/45">
                      {new Date(record.fechaOperacion).toLocaleString("es-CO", {
                        timeZone: "America/Bogota",
                      })}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-denim/[.06] px-3 py-1 text-xs font-bold">
                      {record.origen.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="block">
                      {record.numeroComanda ?? "Sin comanda"}
                    </span>
                    <span className="text-xs text-denim/45">
                      {record.numeroSoporte ?? "Sin soporte"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {record.digitadoPor.nombres} {record.digitadoPor.apellidos}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {money.format(Number(record.impuestos))}
                  </td>
                  <td className="px-5 py-4 text-right font-black">
                    {money.format(Number(record.total))}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      {record.soporteArchivoRef && (
                        <button
                          onClick={() => void openSupport(record)}
                          className="rounded-xl p-2 text-blue-700 hover:bg-blue-50"
                          aria-label={`Ver soporte ${record.numero}`}
                        >
                          <Eye size={18} />
                        </button>
                      )}
                      {canCreate && (
                        <button
                          onClick={() => {
                            setEditing(record);
                            setOpen(true);
                          }}
                          className="rounded-xl p-2 text-denim/60 hover:bg-denim/5"
                          aria-label={`Editar ${record.numero}`}
                        >
                          <Pencil size={18} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          disabled={!online && !session?.demo}
                          onClick={() => void remove(record)}
                          className="rounded-xl p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"
                          aria-label={`Eliminar ${record.numero}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && records.length === 0 && (
          <p className="p-10 text-center text-sm text-denim/45">
            No hay registros para los filtros seleccionados.
          </p>
        )}
        {loading && (
          <p className="p-10 text-center text-sm text-denim/45">
            Consultando archivo…
          </p>
        )}
      </section>
      <nav
        aria-label="Páginas del archivo"
        className="flex items-center justify-between gap-3"
      >
        <button
          className="secondary w-auto px-4"
          disabled={page <= 1 || loading}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / 50))}
        </span>
        <button
          className="secondary w-auto px-4"
          disabled={page * 50 >= total || loading}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
      </nav>
      {open && (
        <InvoiceForm
          key={`${session?.user.id}:${branchId}:${editing?.id ?? "new"}`}
          branchId={branchId ?? 0}
          demo={Boolean(session?.demo)}
          saving={saving}
          initial={editing}
          onExisting={(record) => setEditing(record)}
          setSaving={setSaving}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setOpen(false);
            setEditing(null);
            await load(true);
          }}
        />
      )}
    </div>
  );
}

function InvoiceForm({
  branchId,
  demo,
  saving,
  initial,
  onExisting,
  setSaving,
  onClose,
  onSaved,
}: {
  branchId: number;
  demo: boolean;
  saving: boolean;
  initial: InvoiceRecord | null;
  onExisting: (record: InvoiceRecord) => void;
  setSaving: (value: boolean) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const actor = useApp((state) => state.session?.user);
  const draftKey = `sigr-archive-draft:${api.defaults.baseURL}:${actor?.restauranteId}:${actor?.id}:${branchId}:${demo}:${initial?.id ?? "new"}`;
  const [recovery] = useState<{ draft: Partial<PaperDraft>; invalid: boolean }>(
    () => {
      try {
        return {
          draft: parseArchiveDraft(sessionStorage.getItem(draftKey)),
          invalid: false,
        };
      } catch {
        return { draft: {}, invalid: true };
      }
    },
  );
  const restored = recovery.draft;
  const [requestKey] = useState(restored.requestKey ?? crypto.randomUUID());
  const [savedId, setSavedId] = useState<number | null>(
    restored.savedId ?? null,
  );
  const [storageError, setStorageError] = useState(recovery.invalid);
  const [minimized, setMinimized] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [sourceType, setSourceType] = useState<"pedido" | "venta" | "factura">("venta");
  const [sourceId, setSourceId] = useState("");
  const [number, setNumber] = useState(
    restored.number ?? initial?.numero ?? "",
  );
  const [command, setCommand] = useState(
    restored.command ?? initial?.numeroComanda ?? "",
  );
  const [support, setSupport] = useState(
    restored.support ?? initial?.numeroSoporte ?? "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(
    restored.date ??
      localDate(initial ? new Date(initial.fechaOperacion) : new Date()),
  );
  const [taxes, setTaxes] = useState(
    Number(restored.taxes ?? initial?.impuestos ?? 0),
  );
  const [discounts, setDiscounts] = useState(
    Number(restored.discounts ?? initial?.descuentos ?? 0),
  );
  const [tip, setTip] = useState(Number(restored.tip ?? initial?.propina ?? 0));
  const [delivery, setDelivery] = useState(
    Number(restored.delivery ?? initial?.domicilio ?? 0),
  );
  const [payment, setPayment] = useState(
    restored.payment ?? initial?.formasPago?.[0]?.nombre ?? "EFECTIVO",
  );
  const [lines, setLines] = useState<Line[]>(
    restored.lines ??
      initial?.detalles?.map(({ nombre, cantidad, precioUnitario }) => ({
        nombre,
        cantidad: Number(cantidad),
        precioUnitario: Number(precioUnitario),
      })) ?? [{ nombre: "", cantidad: 1, precioUnitario: 0 }],
  );
  useEffect(() => {
    if (recovery.invalid) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          number,
          command,
          support,
          date,
          taxes,
          discounts,
          tip,
          delivery,
          payment,
          lines,
          requestKey,
          savedId,
        }),
      );
    } catch {
      const timer = setTimeout(() => setStorageError(true), 0);
      return () => clearTimeout(timer);
    }
  }, [
    draftKey,
    number,
    command,
    support,
    date,
    taxes,
    discounts,
    tip,
    delivery,
    payment,
    lines,
    requestKey,
    savedId,
    recovery.invalid,
  ]);
  const close = () => {
    if (
      !saving &&
      window.confirm(
        "¿Cerrar el formulario? El borrador se conserva en esta pestaña. Si adjuntaste un archivo tendrás que seleccionarlo nuevamente.",
      )
    )
      onClose();
  };
  const finish = async () => {
    sessionStorage.removeItem(draftKey);
    await onSaved();
  };
  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => sum + line.cantidad * line.precioUnitario, 0),
    [lines],
  );
  const changeLine = (index: number, changes: Partial<Line>) =>
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, ...changes } : line,
      ),
    );
  async function lookupNumber() {
    if (!number.trim()) {
      toast.error("Escribe primero el número de factura");
      return;
    }
    setLookingUp(true);
    try {
      let found: InvoiceRecord | undefined;
      if (demo)
        found = demoRecords.find(
          (record) =>
            record.numero.toLowerCase() === number.trim().toLowerCase(),
        );
      else {
        const response = await api.get("/registros-factura", {
          params: { buscar: number.trim(), sucursalId: branchId, limite: 10 },
        });
        found = response.data.datos.find(
          (record: InvoiceRecord) =>
            record.numero.toLowerCase() === number.trim().toLowerCase(),
        );
      }
      if (!found) {
        toast(
          "No existe un registro previo; continúa con la digitación manual.",
        );
        return;
      }
      if (!initial) {
        toast(
          "El registro ya existe; se abrirá para corregirlo sin duplicarlo.",
        );
        onExisting(found);
        return;
      }
      setCommand(found.numeroComanda ?? "");
      setSupport(found.numeroSoporte ?? "");
      setDate(localDate(new Date(found.fechaOperacion)));
      setTaxes(Number(found.impuestos));
      setDiscounts(Number(found.descuentos));
      setTip(Number(found.propina));
      setDelivery(Number(found.domicilio));
      setPayment(found.formasPago?.[0]?.nombre ?? "EFECTIVO");
      if (found.detalles?.length)
        setLines(
          found.detalles.map(({ nombre, cantidad, precioUnitario }) => ({
            nombre,
            cantidad: Number(cantidad),
            precioUnitario: Number(precioUnitario),
          })),
        );
      toast.success("Datos recuperados del archivo");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLookingUp(false);
    }
  }
  async function loadSource() {
    const id = Number(sourceId);
    if (!Number.isInteger(id) || id < 1) {
      toast.error("Indica un ID válido de pedido, venta o factura");
      return;
    }
    setLookingUp(true);
    try {
      const response = await api.get<Record<string, unknown>>(
        `/${sourceType === "factura" ? "facturas" : `${sourceType}s`}/${id}`,
      );
      const raw = response.data;
      const sale = (sourceType === "factura" ? raw.venta : raw) as
        | {
            id?: number;
            total?: string | number;
            subtotal?: string | number;
            impuestos?: string | number;
            descuentos?: string | number;
            propina?: string | number;
            domicilioCosto?: string | number;
            fechaOperacion?: string;
            numeroComandaPapel?: string | null;
            numeroSoporte?: string | null;
            detalles?: Array<{
              cantidad: number;
              precioUnitario?: string | number;
              precio?: string | number;
              subtotal?: string | number;
              producto?: { nombre?: string };
            }>;
            pagos?: Array<{ monto: string | number; metodoPago?: { nombre?: string } }>;
          }
        | undefined;
      const order = (sourceType === "pedido" ? raw : undefined) as
        | {
            creadoEn?: string;
            detalles?: Array<{
              cantidad: number;
              precioUnitario?: string | number;
              precio?: string | number;
              subtotal?: string | number;
              producto?: { nombre?: string };
            }>;
          }
        | undefined;
      const source = sale ?? order;
      const detail = source?.detalles ?? [];
      if (!detail.length) throw new Error("La operación no contiene productos para autocompletar");
      setLines(
        detail.map((item, index) => ({
          nombre: item.producto?.nombre ?? `Producto ${index + 1}`,
          cantidad: Number(item.cantidad),
          precioUnitario: Number(
            item.precioUnitario ??
              item.precio ??
              Number(item.subtotal ?? 0) / Number(item.cantidad || 1),
          ),
        })),
      );
      if (sale) {
        setTaxes(Number(sale.impuestos ?? 0));
        setDiscounts(Number(sale.descuentos ?? 0));
        setTip(Number(sale.propina ?? 0));
        setDelivery(Number(sale.domicilioCosto ?? 0));
        if (sale.fechaOperacion) setDate(localDate(new Date(sale.fechaOperacion)));
        setCommand(sale.numeroComandaPapel ?? command);
        setSupport(sale.numeroSoporte ?? support);
        if (sale.pagos?.[0]?.metodoPago?.nombre)
          setPayment(sale.pagos[0].metodoPago.nombre);
      } else if (order?.creadoEn) setDate(localDate(new Date(order.creadoEn)));
      if (sourceType === "factura" && typeof raw.numero === "string")
        setNumber(raw.numero);
      toast.success(`Datos cargados desde ${sourceType} #${id}; revisa antes de guardar`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLookingUp(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (!demo) {
        const body = {
          numero: number,
          numeroComanda: command || undefined,
          numeroSoporte: support || undefined,
          origen: initial?.origen ?? "PAPEL",
          fechaOperacion: new Date(`${date}:00-05:00`).toISOString(),
          sucursalId: branchId,
          subtotal,
          descuentos: discounts,
          impuestos: taxes,
          propina: tip,
          domicilio: delivery,
          total: subtotal - discounts + taxes + tip + delivery,
          formasPago: [
            {
              nombre: payment,
              monto: subtotal - discounts + taxes + tip + delivery,
            },
          ],
          detalles: lines.map((line) => ({
            ...line,
            total: line.cantidad * line.precioUnitario,
          })),
        };
        const result = savedId
          ? { data: { id: savedId } }
          : initial
            ? await api.patch<{ id: number }>(
                `/registros-factura/${initial.id}`,
                body,
              )
            : {
                data: await confirmedPost<{ id: number }>(
                  draftKey,
                  "/registros-factura",
                  body,
                ),
              };
        if (file) {
          setSavedId(result.data.id);
          const form = new FormData();
          form.append("archivo", file);
          await api.post(`/registros-factura/${result.data.id}/soporte`, form);
        }
      }
      toast.success(
        demo
          ? "Simulación completada; no se guardaron datos reales"
          : "Registro operativo guardado; no se envió a DIAN",
      );
      await finish();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  if (savedId)
    return (
      <Modal
        title={`Registro #${savedId} guardado · soporte pendiente`}
        onClose={close}
        busy={saving}
      >
        <p>
          El registro ya existe. Reintentar aquí adjunta únicamente el soporte,
          sin duplicar la factura.
        </p>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <label>
            Soporte pendiente
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="primary" disabled={saving || !file}>
            Reintentar adjuntar soporte
          </button>
          <button
            className="secondary"
            type="button"
            disabled={saving}
            onClick={() => void finish()}
          >
            Finalizar sin adjuntar
          </button>
        </form>
      </Modal>
    );
  if (minimized)
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-steel px-5 py-4 text-left text-white shadow-2xl"
      >
        <Maximize2 size={19} />
        <span>
          <small className="block text-[10px] font-bold uppercase tracking-wider text-white/45">
            Borrador en curso
          </small>
          <strong>{number || "Nueva factura"}</strong>
        </span>
      </button>
    );
  return (
    <Modal title="Archivo operativo de facturas" onClose={close} busy={saving}>
      <form onSubmit={(event) => void submit(event)} className="w-full">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow">Digitación manual</p>
            <h2 className="mt-1 text-2xl font-black">
              {initial
                ? "Corregir registro operativo"
                : "Registrar factura en papel"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="ml-auto mr-1 rounded-xl p-2 hover:bg-denim/5"
            aria-label="Minimizar formulario"
          >
            <Minimize2 />
          </button>
        </div>
        <p className="mt-3 text-sm" role="status">
          {storageError
            ? "No se pudo guardar el borrador local. No cierres esta pestaña."
            : "Borrador guardado en esta pestaña: puedes minimizar, navegar y volver. Los archivos deben seleccionarse otra vez tras recargar."}{" "}
          Fecha y hora de Colombia.
        </p>
        <FinancialRecovery
          scope={draftKey}
          onRecovered={async (result) => {
            if (
              result &&
              typeof result === "object" &&
              "id" in result &&
              typeof result.id === "number"
            )
              setSavedId(result.id);
          }}
        />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {!initial && !demo && (
            <div className="flex gap-2 sm:col-span-2">
              <select
                className="input max-w-40"
                aria-label="Tipo de origen para autocompletar"
                value={sourceType}
                onChange={(event) =>
                  setSourceType(event.target.value as typeof sourceType)
                }
              >
                <option value="pedido">Pedido</option>
                <option value="venta">Venta</option>
                <option value="factura">Factura comercial</option>
              </select>
              <input
                className="input min-w-0"
                type="number"
                min="1"
                placeholder="ID de la operación"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              />
              <button
                type="button"
                className="secondary shrink-0"
                disabled={lookingUp}
                onClick={() => void loadSource()}
              >
                Autocompletar
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="input min-w-0"
              required
              placeholder="Número de factura"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void lookupNumber()}
              disabled={lookingUp}
              className="secondary h-14 w-14 shrink-0 p-0"
              title="Buscar y autocompletar"
            >
              <WandSparkles size={18} />
            </button>
          </div>
          <input
            className="input"
            type="datetime-local"
            aria-label="Fecha y hora de operación en Colombia"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className="input"
            placeholder="Número de comanda"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
          <input
            className="input"
            placeholder="Número de soporte"
            value={support}
            onChange={(e) => setSupport(e.target.value)}
          />
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-denim/50">
              Foto o PDF del soporte (opcional, máximo 5 MB)
            </span>
            <input
              className="input pt-3"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <strong>Productos originales</strong>
            <button
              type="button"
              className="text-sm font-bold"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { nombre: "", cantidad: 1, precioUnitario: 0 },
                ])
              }
            >
              + Agregar línea
            </button>
          </div>
          {lines.map((line, index) => (
            <div
              className="grid gap-2 sm:grid-cols-[1fr_100px_160px_40px]"
              key={index}
            >
              <input
                className="input"
                required
                placeholder="Producto o concepto"
                value={line.nombre}
                onChange={(e) => changeLine(index, { nombre: e.target.value })}
              />
              <input
                className="input"
                type="number"
                min="0.001"
                aria-label={`Cantidad de línea ${index + 1}`}
                step="0.001"
                required
                value={line.cantidad}
                onChange={(e) =>
                  changeLine(index, { cantidad: Number(e.target.value) })
                }
              />
              <input
                className="input"
                type="number"
                min="0"
                aria-label={`Precio original de línea ${index + 1}`}
                step="0.01"
                required
                value={line.precioUnitario}
                onChange={(e) =>
                  changeLine(index, { precioUnitario: Number(e.target.value) })
                }
              />
              <button
                type="button"
                disabled={lines.length === 1}
                aria-label={`Eliminar línea ${index + 1}`}
                onClick={() =>
                  setLines((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs font-bold text-denim/50">
              Impuestos originales
            </span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={taxes}
              onChange={(e) => setTaxes(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-denim/50">
              Descuentos originales
            </span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={discounts}
              onChange={(e) => setDiscounts(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-denim/50">
              Propina
            </span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={tip}
              onChange={(e) => setTip(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-denim/50">
              Domicilio
            </span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={delivery}
              onChange={(e) => setDelivery(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-denim/50">
              Forma de pago
            </span>
            <select
              className="input"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option>EFECTIVO</option>
              <option>TARJETA</option>
              <option>TRANSFERENCIA</option>
              <option>QR</option>
              <option>OTRO</option>
            </select>
          </label>
          <div className="rounded-2xl bg-steel p-4 text-white">
            <span className="text-xs text-white/50">Total registrado</span>
            <strong className="block text-2xl">
              {money.format(subtotal - discounts + taxes + tip + delivery)}
            </strong>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="secondary w-auto px-5"
            onClick={close}
          >
            Cancelar
          </button>
          <button className="primary w-auto px-6" disabled={saving}>
            {saving
              ? "Guardando…"
              : initial
                ? "Guardar corrección"
                : "Guardar registro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
