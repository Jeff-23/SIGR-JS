import { CheckCircle2, Minus, Plus, ShoppingBag, Unlock, Users, X } from "lucide-react";
import toast from "react-hot-toast";
import { useState } from "react";
import { menu, money } from "../data/demo";
import { useApp } from "../store/app";
import type { MenuItem, Table } from "../types";
export function SalonPage() {
  const { tables, orders, createOrder, releaseTable, occupyWithoutOrder } = useApp();
  const [selected, setSelected] = useState<Table | null>(null);
  const [cart, setCart] = useState<Array<MenuItem & { quantity: number }>>([]);
  const add = (item: MenuItem) =>
    setCart((c) => {
      const found = c.find((x) => x.id === item.id);
      return found
        ? c.map((x) =>
            x.id === item.id ? { ...x, quantity: x.quantity + 1 } : x,
          )
        : [...c, { ...item, quantity: 1 }];
    });
  const change = (id: number, delta: number) =>
    setCart((c) =>
      c
        .map((x) => (x.id === id ? { ...x, quantity: x.quantity + delta } : x))
        .filter((x) => x.quantity > 0),
    );
  const submit = () => {
    if (!selected || !cart.length) return;
    const total = cart.reduce((sum, x) => sum + x.price * x.quantity, 0);
    createOrder({
      id: Date.now(),
      table: selected.number,
      createdAt: new Date().toISOString(),
      status: "NUEVO",
      items: cart,
      total,
      paymentStatus: "PENDIENTE",
      stationStatus: {
        COCINA: cart.some((item) => item.station === "COCINA") ? "PENDIENTE" : "NO_APLICA",
        BAR: cart.some((item) => item.station === "BAR") ? "PENDIENTE" : "NO_APLICA",
      },
    });
    toast.success(`Pedido enviado · Cocina y bar fueron notificados`);
    setSelected(null);
    setCart([]);
  };
  return (
    <div>
      <div className="section-title">
        <div>
          <p className="eyebrow">Salón y terraza</p>
          <h1 className="page-title">Mapa de mesas</h1>
        </div>
        <div className="flex gap-3 text-xs">
          <span>
            <i className="legend bg-emerald-500" />
            Libre
          </span>
          <span>
            <i className="legend bg-orange-400" />
            Ocupada
          </span>
          <span>
            <i className="legend bg-marigold" />
            Por cobrar
          </span>
        </div>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tables.map((table) => (
          <button
            key={table.id}
            onClick={() => table.state === "LIBRE" && setSelected(table)}
            className={`table-card ${table.state.toLowerCase()}`}
          >
            <span className="text-xs font-bold uppercase tracking-wider opacity-45">
              {table.zone}
            </span>
            <strong className="mt-3 text-3xl font-black">{table.number}</strong>
            <span className="mt-3 flex items-center gap-1 text-xs opacity-55">
              <Users size={13} />
              {table.seats} personas
            </span>
            <span className="mt-5 text-xs font-extrabold">
              {table.state === "LIBRE"
                ? "Abrir mesa"
                : table.state === "OCUPADA"
                  ? "En servicio"
                  : "Pendiente de pago"}
            </span>
            {table.state === "LIBRE" && (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => { event.stopPropagation(); occupyWithoutOrder(table.id); toast.success(`Mesa ${table.number} ocupada sin pedido`); }}
                className="mt-3 rounded-lg border border-denim/10 px-2 py-1 text-[10px] font-bold"
              >Sólo ocupar</span>
            )}
            {table.state !== "LIBRE" && !table.orderId && (
              <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); releaseTable(table.id); toast.success(`Mesa ${table.number} liberada sin consumo`); }} className="mt-3 flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"><Unlock size={11}/> Liberar sin consumo</span>
            )}
            {table.orderId && orders.find((order) => order.id === table.orderId)?.paymentStatus === "PAGADO" && (
              <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); releaseTable(table.id); toast.success(`Mesa ${table.number} libre para nuevo servicio`); }} className="mt-3 flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"><CheckCircle2 size={11}/> Cerrar y liberar</span>
            )}
          </button>
        ))}
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-steel/45">
          <section className="h-full w-full max-w-2xl overflow-y-auto bg-[#f7f5ef] p-5 sm:p-8">
            <div className="section-title">
              <div>
                <p className="eyebrow">Nueva orden</p>
                <h2 className="text-3xl font-black">Mesa {selected.number}</h2>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setCart([]);
                }}
              >
                <X />
              </button>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {menu.map((item) => (
                <button
                  onClick={() => add(item)}
                  className="card flex items-center gap-3 p-4 text-left"
                  key={item.id}
                >
                  <span
                    className={`h-10 w-1 rounded-full ${item.station === "BAR" ? "bg-blue-400" : "bg-orange-400"}`}
                  />
                  <span className="flex-1">
                    <strong className="block">{item.name}</strong>
                    <small className="text-denim/45">
                      {item.category} · {item.station.toLowerCase()}
                    </small>
                  </span>
                  <b>{money.format(item.price)}</b>
                </button>
              ))}
            </div>
            <div className="mt-7 card">
              <div className="flex items-center gap-2">
                <ShoppingBag />
                <h3 className="text-lg font-black">Pedido</h3>
              </div>
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-denim/40">
                  Selecciona productos del menú.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-denim/7">
                  {cart.map((item) => (
                    <div className="flex items-center gap-3 py-3" key={item.id}>
                      <span className="flex-1 font-bold">{item.name}</span>
                      <button
                        onClick={() => change(item.id, -1)}
                        className="qty"
                      >
                        <Minus size={14} />
                      </button>
                      <b>{item.quantity}</b>
                      <button
                        onClick={() => change(item.id, 1)}
                        className="qty"
                      >
                        <Plus size={14} />
                      </button>
                      <span className="w-24 text-right font-bold">
                        {money.format(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 flex items-center justify-between border-t border-denim/10 pt-5">
                <span className="text-sm text-denim/45">Total estimado</span>
                <strong className="text-2xl">
                  {money.format(
                    cart.reduce((s, x) => s + x.price * x.quantity, 0),
                  )}
                </strong>
              </div>
              <button
                disabled={!cart.length}
                onClick={submit}
                className="primary mt-5"
              >
                Enviar a cocina y bar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
