import {
  BarChart3,
  CheckCircle2,
  MonitorSmartphone,
  Printer,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";
const journey = [
  "Reserva o llegada",
  "Mesa y pedido",
  "Cocina/bar",
  "Entrega",
  "Pago",
  "Comprobante",
  "Análisis",
];
export function CommercialPresentationPage() {
  return (
    <div className="printable space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">SIGR · Demostración comercial</p>
          <h1 className="page-title">
            Un restaurante conectado de principio a fin
          </h1>
          <p className="max-w-3xl">
            Operación multiempresa y multisucursal para salón, cocina, caja,
            administración y decisiones gerenciales.
          </p>
        </div>
        <button
          className="secondary no-print w-auto px-5"
          onClick={() => window.print()}
        >
          <Printer size={18} />
          Imprimir presentación
        </button>
      </header>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Restaurante El Mono · 3 sedes</p>
          <h2>El servicio avanza sin perder trazabilidad.</h2>
          <p>
            Pedidos digitales o comandas en papel conviven con inventario,
            facturas operativas y preparación para facturación electrónica.
          </p>
        </div>
        <ShieldCheck size={58} className="text-marigold" />
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          [
            UtensilsCrossed,
            "Operación",
            "Mesas, QR, cocina, bar, domicilios y caja.",
          ],
          [
            MonitorSmartphone,
            "Multidispositivo",
            "Computador, tablet y móvil con interfaz adaptable.",
          ],
          [
            BarChart3,
            "Gestión",
            "Costos, compras, personal, alertas y pronósticos responsables.",
          ],
        ].map(([Icon, title, body]) => {
          const C = Icon as typeof UtensilsCrossed;
          return (
            <article className="card" key={String(title)}>
              <C />
              <h2 className="mt-4 text-xl font-black">{String(title)}</h2>
              <p>{String(body)}</p>
            </article>
          );
        })}
      </section>
      <section className="card">
        <h2 className="text-2xl font-black">Recorrido operativo</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {journey.map((item, index) => (
            <li className="rounded-2xl bg-denim/5 p-4" key={item}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-marigold text-sm font-black">
                {index + 1}
              </span>
              <b className="mt-3 block">{item}</b>
            </li>
          ))}
        </ol>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="card">
          <h2 className="text-xl font-black">Roles preparados</h2>
          {[
            "Administrador: configuración y control",
            "Cajero: cobro y comprobantes",
            "Mesero: salón y pedidos",
            "Cocina/bar: comandas y tiempos",
            "Contador: consulta y reportes",
          ].map((item) => (
            <p className="mt-3 flex gap-2" key={item}>
              <CheckCircle2 size={18} className="text-emerald-600" />
              {item}
            </p>
          ))}
        </article>
        <article className="card">
          <h2 className="text-xl font-black">Límites transparentes</h2>
          <p className="mt-3">
            Pedido ≠ Venta ≠ Pago ≠ Factura ≠ Documento electrónico.
          </p>
          <p className="mt-3">
            El pronóstico muestra confianza y nunca se presenta como certeza.
          </p>
          <p className="mt-3">La demostración no modifica información real.</p>
        </article>
      </section>
    </div>
  );
}
