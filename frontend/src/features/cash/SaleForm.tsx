import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { confirmedPost } from "../../lib/confirmed-operation";
import { Modal } from "../../components/Modal";
import { useApp } from "../../store/app";
import { money } from "../../data/demo";
import type { ApiProduct } from "../salon/contracts";

type Customer = {
  id: number;
  nombres: string;
  apellidos?: string;
  numeroDocumento?: string;
};
type Line = {
  id: string;
  productoId: number;
  cantidad: number;
  precioUnitario: string;
};
export function SaleForm({
  mode,
  scope,
  onClose,
  onSaved,
}: {
  mode: "directa" | "manual";
  scope: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { branchId, hasPermission, hasCapability } = useApp();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [codigoPromocional, setCodigoPromocional] = useState("");
  const [usarPuntos, setUsarPuntos] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState({
    descuentos: "0",
    impuestos: mode === "manual" ? "0" : "",
    impoconsumo: "0",
    propina: "0",
  });
  const [paper, setPaper] = useState({
    numeroComandaPapel: "",
    numeroSoporte: "",
    soporteArchivoRef: "",
    fechaOperacion: new Date()
      .toLocaleString("sv-SE", { timeZone: "America/Bogota" })
      .slice(0, 16)
      .replace(" ", "T"),
  });
  useEffect(() => {
    const controller = new AbortController();
    void api
      .get<ApiProduct[]>("/productos", {
        signal: controller.signal,
        params: { sucursalId: branchId },
      })
      .then(({ data }) => setProducts(data))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [branchId]);
  useEffect(() => {
    if (!hasPermission("CLIENTES_VER") || !hasCapability("CLIENTES")) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api
        .get<{ datos: Customer[] }>("/clientes", {
          signal: controller.signal,
          params: { buscar: search, estado: true, limite: 30 },
        })
        .then(({ data }) => setCustomers(data.datos))
        .catch((failure) => {
          if (!controller.signal.aborted) setError(errorMessage(failure));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, hasPermission, hasCapability]);
  const change = (id: string, update: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...update } : line)),
    );
  const close = () => {
    if (
      !lines.length ||
      window.confirm(
        "¿Cerrar este formulario y descartar lo digitado? Una operación enviada que esté pendiente de confirmación se conserva.",
      )
    )
      onClose();
  };
  return (
    <Modal
      title={
        mode === "manual"
          ? "Digitar venta de comanda en papel"
          : "Venta directa de mostrador"
      }
      onClose={close}
      busy={busy}
    >
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !lines.length || !branchId) return;
          setBusy(true);
          setError("");
          try {
            const body = {
              sucursalId: branchId,
              clienteId: customerId ? Number(customerId) : undefined,
              codigoPromocional: codigoPromocional || undefined,
              usarPuntos: usarPuntos ? Number(usarPuntos) : undefined,
              ...Object.fromEntries(
                Object.entries(adjustments)
                  .filter(([, value]) => value !== "")
                  .map(([key, value]) => [key, Number(value)]),
              ),
              detalles: lines.map((line) => ({
                productoId: line.productoId,
                cantidad: line.cantidad,
                ...(mode === "manual"
                  ? { precioUnitario: Number(line.precioUnitario) }
                  : {}),
              })),
              ...(mode === "manual"
                ? {
                    ...paper,
                    soporteArchivoRef: paper.soporteArchivoRef || undefined,
                    fechaOperacion: new Date(
                      `${paper.fechaOperacion}:00-05:00`,
                    ).toISOString(),
                  }
                : {}),
            };
            await confirmedPost(scope, `/ventas/${mode}`, body);
            await onSaved();
          } catch (failure) {
            setError(errorMessage(failure));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="rounded-xl bg-amber-50 p-3 text-sm">
          Esta operación crea una venta y afecta inventario. No registra un
          pago, no emite factura ni envía a DIAN. Para sólo archivar un soporte
          usa el archivo operativo.
        </p>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <fieldset disabled={busy || loading} className="space-y-5">
          {mode === "manual" && (
            <section className="grid gap-3 sm:grid-cols-2">
              <label>
                Fecha y hora original (Colombia)
                <input
                  type="datetime-local"
                  required
                  className="input"
                  value={paper.fechaOperacion}
                  onChange={(event) =>
                    setPaper({ ...paper, fechaOperacion: event.target.value })
                  }
                />
              </label>
              <label>
                Número de comanda
                <input
                  required
                  maxLength={80}
                  className="input"
                  value={paper.numeroComandaPapel}
                  onChange={(event) =>
                    setPaper({
                      ...paper,
                      numeroComandaPapel: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Número de soporte
                <input
                  required
                  maxLength={80}
                  className="input"
                  value={paper.numeroSoporte}
                  onChange={(event) =>
                    setPaper({ ...paper, numeroSoporte: event.target.value })
                  }
                />
              </label>
              <label>
                URL del soporte (opcional)
                <input
                  type="url"
                  maxLength={500}
                  className="input"
                  value={paper.soporteArchivoRef}
                  onChange={(event) =>
                    setPaper({
                      ...paper,
                      soporteArchivoRef: event.target.value,
                    })
                  }
                />
              </label>
            </section>
          )}
          {hasPermission("CLIENTES_VER") && hasCapability("CLIENTES") && (
            <section className="grid gap-3 sm:grid-cols-2">
              <label>
                Buscar cliente
                <input
                  className="input"
                  placeholder="Documento, nombre, teléfono…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                Cliente
                <select
                  className="input"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Sin cliente asociado</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.nombres} {customer.apellidos} ·{" "}
                      {customer.numeroDocumento}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
          <label className="block">
            Agregar producto
            <select
              className="input"
              value=""
              onChange={(event) => {
                const product = products.find(
                  (item) => item.id === Number(event.target.value),
                );
                if (!product) return;
                const existing = lines.find(
                  (line) => line.productoId === product.id,
                );
                if (existing)
                  change(existing.id, { cantidad: existing.cantidad + 1 });
                else
                  setLines([
                    ...lines,
                    {
                      id: crypto.randomUUID(),
                      productoId: product.id,
                      cantidad: 1,
                      precioUnitario: String(product.precio),
                    },
                  ]);
              }}
            >
              <option value="">
                {loading ? "Cargando carta…" : "Selecciona producto"}
              </option>
              {products.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.nombre} · {money.format(Number(product.precio))}
                </option>
              ))}
            </select>
          </label>
          {lines.map((line) => (
            <div
              className="grid items-end gap-2 rounded-xl bg-white p-3 sm:grid-cols-[1fr_6rem_9rem_auto]"
              key={line.id}
            >
              <strong>
                {
                  products.find((product) => product.id === line.productoId)
                    ?.nombre
                }
              </strong>
              <label>
                Cantidad
                <input
                  className="input"
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={line.cantidad}
                  onChange={(event) =>
                    change(line.id, { cantidad: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                {mode === "manual" ? "Precio original" : "Precio de carta"}
                <input
                  className="input"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly={mode !== "manual"}
                  value={line.precioUnitario}
                  onChange={(event) =>
                    change(line.id, { precioUnitario: event.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className="secondary w-auto"
                onClick={() =>
                  setLines(lines.filter((item) => item.id !== line.id))
                }
              >
                Quitar
              </button>
            </div>
          ))}
          <section className="grid gap-3 sm:grid-cols-2">
            <label>
              Cupón o código promocional
              <input className="input" maxLength={50} value={codigoPromocional} onChange={(event) => setCodigoPromocional(event.target.value.toUpperCase())} placeholder="Opcional" />
            </label>
            <label>
              Puntos a redimir
              <input className="input" type="number" min="1" disabled={!customerId} value={usarPuntos} onChange={(event) => setUsarPuntos(event.target.value)} placeholder={customerId ? "Opcional" : "Selecciona cliente"} />
            </label>
            {(Object.keys(adjustments) as Array<keyof typeof adjustments>).map(
              (key) => (
                <label key={key}>
                  {
                    {
                      descuentos: "Descuentos",
                      impuestos: "Impuestos (vacío: configuración)",
                      impoconsumo: "Impoconsumo",
                      propina: "Propina",
                    }[key]
                  }
                  <input
                    className="input"
                    disabled={
                      key === "descuentos" &&
                      !hasPermission("DESCUENTOS_APLICAR")
                    }
                    required={mode === "manual"}
                    type="number"
                    min="0"
                    step="0.01"
                    value={adjustments[key]}
                    onChange={(event) =>
                      setAdjustments({
                        ...adjustments,
                        [key]: event.target.value,
                      })
                    }
                  />
                </label>
              ),
            )}
          </section>
          <p className="font-bold">
            Subtotal de productos:{" "}
            {money.format(
              lines.reduce(
                (sum, line) =>
                  sum + line.cantidad * Number(line.precioUnitario),
                0,
              ),
            )}
          </p>
          <p className="text-sm">
            El servidor confirma el total y disponibilidad al guardar. La venta
            directa usa los precios vigentes; la digitación conserva los
            originales.
          </p>
          <button className="primary" disabled={!lines.length}>
            {busy ? "Confirmando…" : "Crear venta sin cobrar"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
