import {
  Download,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
import { money } from "../data/demo";
import { api, errorMessage, mutation } from "../lib/api";
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
  const { session, branchId, online } = useApp();
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [amount, setAmount] = useState(0);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const canCreate =
    session?.user.permisos.includes("REGISTROS_FACTURA_CREAR") ?? false;
  const canDelete =
    session?.user.permisos.includes("REGISTROS_FACTURA_ELIMINAR") ?? false;
  const canExport =
    session?.user.permisos.includes("REGISTROS_FACTURA_EXPORTAR") ?? false;

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      if (session?.demo) {
        const filtered = demoRecords.filter(
          (record) =>
            !search ||
            [record.numero, record.numeroComanda, record.numeroSoporte].some(
              (value) => value?.toLowerCase().includes(search.toLowerCase()),
            ),
        );
        setRecords(filtered);
        setTotal(filtered.length);
        setAmount(
          filtered.reduce((sum, record) => sum + Number(record.total), 0),
        );
        setLoading(false);
        return;
      }
      try {
        const response = await api.get("/registros-factura", {
          params: {
            buscar: search || undefined,
            desde: from || undefined,
            hasta: to || undefined,
            sucursalId: branchId,
            limite: 50,
          },
        });
        setRecords(response.data.datos);
        setTotal(response.data.resumen.cantidad);
        setAmount(Number(response.data.resumen.total ?? 0));
      } catch (error) {
        if (!quiet) toast.error(errorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [branchId, from, search, session?.demo, to],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => online && void load(true), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
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
      const response = await api.get("/registros-factura/exportar.csv", {
        params: {
          buscar: search || undefined,
          desde: from || undefined,
          hasta: to || undefined,
          sucursalId: branchId,
        },
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
    const end = today.toISOString().slice(0, 10);
    const start = kind === "today" ? end : `${end.slice(0, 7)}-01`;
    setFrom(start);
    setTo(end);
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Factura, comanda o soporte"
            />
          </label>
          <input
            className="input"
            type="date"
            aria-label="Desde"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <input
            className="input"
            type="date"
            aria-label="Hasta"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <button className="secondary h-14 px-4" onClick={() => void load()}>
            <RefreshCw size={18} /> Consultar
          </button>
        </div>
      </section>

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
                      {new Date(record.fechaOperacion).toLocaleString("es-CO")}
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
      {open && (
        <InvoiceForm
          branchId={branchId}
          demo={Boolean(session?.demo)}
          saving={saving}
          initial={editing}
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
  setSaving,
  onClose,
  onSaved,
}: {
  branchId: number;
  demo: boolean;
  saving: boolean;
  initial: InvoiceRecord | null;
  setSaving: (value: boolean) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [number, setNumber] = useState(initial?.numero ?? "");
  const [command, setCommand] = useState(initial?.numeroComanda ?? "");
  const [support, setSupport] = useState(initial?.numeroSoporte ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(
    (initial ? new Date(initial.fechaOperacion) : new Date())
      .toISOString()
      .slice(0, 16),
  );
  const [taxes, setTaxes] = useState(Number(initial?.impuestos ?? 0));
  const [discounts, setDiscounts] = useState(Number(initial?.descuentos ?? 0));
  const [tip, setTip] = useState(Number(initial?.propina ?? 0));
  const [delivery, setDelivery] = useState(Number(initial?.domicilio ?? 0));
  const [payment, setPayment] = useState(
    initial?.formasPago?.[0]?.nombre ?? "EFECTIVO",
  );
  const [lines, setLines] = useState<Line[]>(
    initial?.detalles?.map(({ nombre, cantidad, precioUnitario }) => ({
      nombre,
      cantidad: Number(cantidad),
      precioUnitario: Number(precioUnitario),
    })) ?? [{ nombre: "", cantidad: 1, precioUnitario: 0 }],
  );
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (!demo) {
        const result = await mutation(
          initial ? "PATCH" : "POST",
          initial ? `/registros-factura/${initial.id}` : "/registros-factura",
          {
            numero: number,
            numeroComanda: command || undefined,
            numeroSoporte: support || undefined,
            origen: initial?.origen ?? "PAPEL",
            fechaOperacion: new Date(date).toISOString(),
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
          },
        );
        if (file && navigator.onLine && "data" in result) {
          const form = new FormData();
          form.append("archivo", file);
          await api.post(`/registros-factura/${result.data.id}/soporte`, form);
        } else if (file && !navigator.onLine) {
          toast(
            "El registro quedó en cola; adjunta el archivo cuando vuelva internet.",
          );
        }
      }
      toast.success(onlineOrQueued());
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-steel/65 p-4">
      <form
        onSubmit={(event) => void submit(event)}
        className="my-6 w-full max-w-3xl rounded-[28px] bg-[#f7f5ef] p-6 shadow-2xl"
      >
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
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-denim/5"
          >
            <X />
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <input
            className="input"
            required
            placeholder="Número de factura"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <input
            className="input"
            type="datetime-local"
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
            onClick={onClose}
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
    </div>
  );
}

function onlineOrQueued() {
  return navigator.onLine
    ? "Factura registrada"
    : "Factura guardada para sincronizar";
}
