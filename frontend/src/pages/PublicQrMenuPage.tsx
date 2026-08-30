import { Minus, Plus, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { menu as demoProducts } from "../data/demo";

type Product = { id: number; nombre: string; descripcion?: string; precio: number };
type Menu = { restaurante: string; sucursal: string; mesa: { numero: string }; requiereAceptacion: boolean; categorias: { id: number; nombre: string; productos: Product[] }[] };
type RequestStatus = { id: string; estado: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"; pedidoId?: number; motivoRechazo?: string };

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const demoCategories = [...new Set(demoProducts.map((product) => product.category))].map((nombre, index) => ({
  id: index + 1,
  nombre,
  productos: demoProducts.filter((product) => product.category === nombre).map((product) => ({ id: product.id, nombre: product.name, precio: product.price })),
}));

export function PublicQrMenuPage() {
  const { token = "" } = useParams();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [request, setRequest] = useState<RequestStatus | null>(null);
  const [failure, setFailure] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (token.startsWith("demo-mesa-")) {
      const timer = window.setTimeout(() => setMenu({ restaurante: "Restaurante El Mono", sucursal: "La Carolina", mesa: { numero: token.replace("demo-mesa-", "") }, requiereAceptacion: true, categorias: demoCategories }), 0);
      return () => window.clearTimeout(timer);
    }
    api.get<Menu>(`/publico/menu-qr/${token}`).then((response) => setMenu(response.data)).catch((error) => setFailure(errorMessage(error)));
  }, [token]);
  useEffect(() => {
    if (!request || request.estado !== "PENDIENTE") return;
    if (token.startsWith("demo-mesa-")) {
      const timer = window.setTimeout(() => setRequest((current) => current ? { ...current, estado: "ACEPTADA", pedidoId: 9001 } : current), 2500);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setInterval(() => api.get<RequestStatus>(`/publico/pedidos-qr/${request.id}`).then((response) => setRequest(response.data)).catch(() => undefined), 4000);
    return () => window.clearInterval(timer);
  }, [request, token]);

  const products = useMemo(() => menu?.categorias.flatMap((category) => category.productos) ?? [], [menu]);
  const total = products.reduce((sum, product) => sum + Number(product.precio) * (cart[product.id] ?? 0), 0);
  const quantity = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const change = (id: number, amount: number) => setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + amount) }));
  const send = async () => {
    if (!quantity) return;
    setSending(true); setFailure("");
    if (token.startsWith("demo-mesa-")) {
      setRequest({ id: crypto.randomUUID(), estado: "PENDIENTE" });
      setSending(false);
      return;
    }
    try {
      const response = await api.post<RequestStatus>(`/publico/menu-qr/${token}/solicitudes`, {
        claveCliente: crypto.randomUUID(), nombreCliente: name || undefined, observaciones: notes || undefined,
        detalles: Object.entries(cart).filter(([, amount]) => amount > 0).map(([productId, cantidad]) => ({ productoId: Number(productId), cantidad })),
      });
      setRequest(response.data);
    } catch (error) { setFailure(errorMessage(error)); } finally { setSending(false); }
  };

  if (failure && !menu) return <main className="grid min-h-screen place-items-center bg-[#f4f2ec] p-6"><p className="rounded-3xl bg-white p-8 text-center font-bold text-red-700">{failure}</p></main>;
  if (!menu) return <main className="grid min-h-screen place-items-center bg-[#f4f2ec] font-bold">Cargando menú…</main>;
  if (request) return <main className="grid min-h-screen place-items-center bg-[#f4f2ec] p-5"><section className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl"><UtensilsCrossed className="mx-auto mb-4 text-marigold" size={42}/><p className="text-xs font-black uppercase tracking-[.25em] text-denim/45">Mesa {menu.mesa.numero}</p><h1 className="mt-2 text-3xl font-black">{request.estado === "PENDIENTE" ? "Pedido recibido" : request.estado === "ACEPTADA" ? "Pedido aceptado" : "Pedido no aceptado"}</h1><p className="mt-4 text-denim/65">{request.estado === "PENDIENTE" ? "El restaurante está revisando tu solicitud. Esta pantalla se actualizará automáticamente." : request.estado === "ACEPTADA" ? `Ya ingresó a operación${request.pedidoId ? ` como pedido #${request.pedidoId}` : ""}.` : request.motivoRechazo || "Consulta al personal del restaurante."}</p></section></main>;

  return <main className="min-h-screen bg-[#f4f2ec] pb-32 text-denim"><header className="sticky top-0 z-10 bg-steel px-5 py-5 text-white shadow-lg"><p className="text-xs font-black uppercase tracking-[.22em] text-marigold">{menu.restaurante}</p><div className="mt-1 flex items-end justify-between"><div><h1 className="text-2xl font-black">Menú</h1><p className="text-sm text-white/60">{menu.sucursal}</p></div><span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">Mesa {menu.mesa.numero}</span></div></header><div className="mx-auto max-w-3xl space-y-8 p-5">{menu.categorias.map((category) => <section key={category.id}><h2 className="mb-3 text-xl font-black">{category.nombre}</h2><div className="space-y-3">{category.productos.map((product) => <article key={product.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex gap-4"><div className="min-w-0 flex-1"><h3 className="font-black">{product.nombre}</h3>{product.descripcion && <p className="mt-1 text-sm text-denim/55">{product.descripcion}</p>}<strong className="mt-3 block text-lg">{money.format(Number(product.precio))}</strong></div><div className="flex items-center gap-3 self-end"><button className="grid h-9 w-9 place-items-center rounded-full border" onClick={() => change(product.id, -1)}><Minus size={16}/></button><b>{cart[product.id] ?? 0}</b><button className="grid h-9 w-9 place-items-center rounded-full bg-marigold" onClick={() => change(product.id, 1)}><Plus size={16}/></button></div></div></article>)}</div></section>)}<section className="rounded-3xl bg-white p-5"><h2 className="font-black">Datos del pedido</h2><input className="mt-4 w-full rounded-2xl border p-3" placeholder="Nombre (opcional)" value={name} onChange={(event) => setName(event.target.value)}/><textarea className="mt-3 w-full rounded-2xl border p-3" placeholder="Observaciones generales (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)}/><p className="mt-3 text-xs text-denim/50">{menu.requiereAceptacion ? "El restaurante confirmará el pedido antes de ingresarlo a operación." : "El restaurante tiene habilitada la aceptación automática."}</p>{failure && <p className="mt-3 text-sm font-bold text-red-700">{failure}</p>}</section></div><div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-4"><button disabled={!quantity || sending} onClick={send} className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl bg-steel px-5 py-4 font-black text-white disabled:opacity-40"><span className="flex items-center gap-2"><ShoppingCart size={20}/>Enviar {quantity} producto(s)</span><span>{money.format(total)}</span></button></div></main>;
}
