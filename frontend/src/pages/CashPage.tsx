import { Banknote, CheckCircle2, CreditCard, Receipt, WalletCards } from "lucide-react";
import toast from "react-hot-toast";
import { money } from "../data/demo";
import { useApp } from "../store/app";

export function CashPage() {
  const { orders, markPaid } = useApp();
  const pending = orders.filter((order) => order.status === "PENDIENTE_PAGO" && order.paymentStatus === "PENDIENTE");
  const paid = orders.filter((order) => order.paymentStatus === "PAGADO");
  return <div className="space-y-6">
    <header><p className="eyebrow">Turno de caja</p><h1 className="page-title">Cobros pendientes</h1><p className="mt-2 text-sm text-denim/50">Cobrar no factura ni envía a DIAN. Cada operación conserva su identidad.</p></header>
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="card"><p className="eyebrow">Por cobrar</p><strong className="mt-2 block text-3xl">{pending.length}</strong></article>
      <article className="card sm:col-span-2"><p className="eyebrow">Saldo pendiente</p><strong className="mt-2 block text-3xl">{money.format(pending.reduce((sum, order) => sum + order.total, 0))}</strong></article>
    </section>
    {pending.length === 0 ? <div className="empty"><CheckCircle2 size={42}/><h2>Caja al día</h2><p>Los pedidos entregados aparecerán aquí para cobrar.</p></div> : <section className="grid gap-4 xl:grid-cols-2">{pending.map((order) => <article className="card" key={order.id}><div className="flex items-start justify-between"><div><p className="eyebrow">Pedido #{String(order.id).slice(-4)}</p><h2 className="text-2xl font-black">Mesa {order.table}</h2></div><strong className="text-2xl">{money.format(order.total)}</strong></div><div className="mt-5 flex flex-wrap gap-2"><button className="secondary flex-1"><Banknote size={17}/> Efectivo</button><button className="secondary flex-1"><CreditCard size={17}/> Tarjeta</button><button className="secondary flex-1"><WalletCards size={17}/> Transferencia</button></div><button className="primary mt-3" onClick={() => { markPaid(order.id); toast.success(`Pago registrado. Mesa ${order.table} lista para liberar`); }}><Receipt size={18}/> Confirmar pago</button></article>)}</section>}
    {paid.length > 0 && <section className="card"><h2 className="font-black">Pagos recientes</h2><div className="mt-3 divide-y divide-denim/10">{paid.slice(-5).reverse().map((order) => <div key={order.id} className="flex justify-between py-3 text-sm"><span>Mesa {order.table} · Pedido #{String(order.id).slice(-4)}</span><strong>{money.format(order.total)}</strong></div>)}</div></section>}
  </div>;
}
