import { Check, ChefHat, Clock3, Martini } from "lucide-react";
import { useApp } from "../store/app";
export function KitchenPage() {
  const { orders, advanceOrder } = useApp();
  return (
    <div>
      <div className="section-title">
        <div>
          <p className="eyebrow">KDS adaptable</p>
          <h1 className="page-title">Cocina y bar</h1>
        </div>
        <div className="rounded-xl bg-steel px-4 py-2 text-sm font-bold text-white">
          Vista táctil
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="empty">
          <ChefHat size={44} />
          <h2>No hay comandas nuevas</h2>
          <p>Los pedidos enviados desde salón aparecerán aquí.</p>
        </div>
      ) : (
        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders
            .filter((o) => o.status !== "ENTREGADO")
            .map((order) => (
              <article
                className="overflow-hidden rounded-[24px] bg-white shadow-card"
                key={order.id}
              >
                <header
                  className={`flex items-center justify-between p-5 ${order.status === "LISTO" ? "bg-emerald-500 text-white" : "bg-steel text-white"}`}
                >
                  <div>
                    <small className="opacity-55">
                      #{String(order.id).slice(-4)}
                    </small>
                    <h2 className="text-2xl font-black">Mesa {order.table}</h2>
                  </div>
                  <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold">
                    <Clock3 size={14} />
                    {order.status}
                  </span>
                </header>
                <div className="p-5">
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div className="flex gap-3" key={item.id}>
                        <b className="text-marigold">{item.quantity}×</b>
                        <span className="flex-1 font-bold">{item.name}</span>
                        {item.station === "BAR" ? (
                          <Martini size={17} className="text-blue-500" />
                        ) : (
                          <ChefHat size={17} className="text-orange-500" />
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => advanceOrder(order.id)}
                    className={`primary mt-6 ${order.status === "LISTO" ? "bg-emerald-600" : ""}`}
                  >
                    {order.status === "NUEVO" ? (
                      "Iniciar preparación"
                    ) : order.status === "PREPARANDO" ? (
                      "Marcar listo"
                    ) : (
                      <>
                        <Check size={18} /> Entregar
                      </>
                    )}
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
