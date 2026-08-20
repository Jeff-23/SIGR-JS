import {
  ArrowUpRight,
  Clock3,
  CookingPot,
  CreditCard,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { money } from "../data/demo";
import { useApp } from "../store/app";

export function DashboardPage() {
  const { tables, orders, session } = useApp();
  const cards: Array<[string, string | number, LucideIcon, string]> = [
    [
      "Mesas ocupadas",
      `${tables.filter((table) => table.state !== "LIBRE").length}/15`,
      Users,
      "text-blue-700 bg-blue-50",
    ],
    [
      "En preparación",
      orders.filter((order) => ["PREPARANDO", "NUEVO"].includes(order.status))
        .length,
      CookingPot,
      "text-orange-700 bg-orange-50",
    ],
    [
      "Ventas del turno",
      money.format(1264500),
      CreditCard,
      "text-emerald-700 bg-emerald-50",
    ],
  ];
  return (
    <div className="space-y-7">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">
            Turno de la tarde · 2:00 p. m. – 11:00 p. m.
          </p>
          <h1>Hola, {session?.user.nombres}.</h1>
          <p>
            La Carolina está operando con normalidad. Tienes 12 mesas
            disponibles.
          </p>
        </div>
        <Link to="/salon" className="primary w-auto px-6">
          Abrir salón <ArrowUpRight size={18} />
        </Link>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(([label, value, Icon, color]) => (
          <article className="card" key={label}>
            <div
              className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}
            >
              <Icon size={20} />
            </div>
            <p className="mt-6 text-sm text-denim/48">{label}</p>
            <strong className="mt-1 block text-3xl font-black">{value}</strong>
          </article>
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <article className="card">
          <div className="section-title">
            <div>
              <p className="eyebrow">Pulso operativo</p>
              <h2>Actividad reciente</h2>
            </div>
            <Clock3 className="text-denim/25" />
          </div>
          <div className="mt-5 divide-y divide-denim/7">
            {[
              "Mesa 6 pendiente de pago",
              "Pedido #104 listo en cocina",
              "Bar recibió comanda #108",
              "Domicilio entregado en La Castellana",
            ].map((text, index) => (
              <div className="flex gap-4 py-4" key={text}>
                <span className="mt-1 h-2 w-2 rounded-full bg-marigold" />
                <div>
                  <p className="font-bold">{text}</p>
                  <span className="text-xs text-denim/40">
                    Hace {index * 3 + 2} minutos
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="card bg-steel text-white">
          <p className="eyebrow text-marigold">Continuidad SIGR</p>
          <h2 className="mt-2 text-2xl font-black">
            Preparado para una caída de internet
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            La aplicación está disponible en este dispositivo y las operaciones
            pendientes se enviarán al recuperar conexión.
          </p>
          <div className="mt-8 rounded-2xl bg-white/7 p-4 text-sm">
            <strong className="text-marigold">Importante</strong>
            <p className="mt-1 text-white/55">
              La comunicación entre varios equipos sin internet requerirá el
              nodo local de la sucursal.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
