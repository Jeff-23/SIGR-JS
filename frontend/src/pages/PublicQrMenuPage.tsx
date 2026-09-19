import { Minus, Plus, ShoppingCart, Sparkles, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { productImageUrl, type ProductImage } from "../lib/product-media";
import { menu as demoProducts } from "../data/demo";

type Product = { id: number; nombre: string; descripcion?: string; precio: number; imagenPrincipal?: ProductImage | null };
type QrMode = "SOLO_MENU" | "PEDIDO_CON_APROBACION" | "PEDIDO_AUTOMATICO";
type DailyContent = { especial?: { titulo: string; nombre: string; descripcion?: string; precio?: number } | null; mensaje?: string };
type MenuTemplate = { titulo?: string; subtitulo?: string; pie?: string; estilo?: "EDITORIAL_DORADO" | "CONTEMPORANEA" | "EJECUTIVA"; mostrarPrecios?: boolean; secciones?: Array<{ categoriaId: number; titulo: string; productoIds: number[] }> };
type Menu = { restaurante: string; sucursal: string; mesa: { numero: string }; modoQr: QrMode; pedidosHabilitados: boolean; requiereAceptacion: boolean; plantillaCarta?: MenuTemplate | null; cartaDia?: { fecha: string; contenido: DailyContent } | null; categorias: { id: number; nombre: string; productos: Product[] }[] };
type RequestStatus = { id: string; estado: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"; pedidoId?: number; motivoRechazo?: string };

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const demoCategories = [...new Set(demoProducts.map((product) => product.category))].map((nombre, index) => ({ id: index + 1, nombre, productos: demoProducts.filter((product) => product.category === nombre).map((product) => ({ id: product.id, nombre: product.name, precio: product.price })) }));

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
      const timer = window.setTimeout(() => setMenu({ restaurante: "Restaurante El Mono", sucursal: "La Carolina", mesa: { numero: token.replace("demo-mesa-", "") }, modoQr: "PEDIDO_CON_APROBACION", pedidosHabilitados: true, requiereAceptacion: true, plantillaCarta: { titulo: "Menú de almuerzos", subtitulo: "Cocina fresca todos los días", estilo: "EDITORIAL_DORADO", mostrarPrecios: true }, cartaDia: { fecha: "", contenido: { especial: { titulo: "Especial de hoy", nombre: "Carne desmechada", descripcion: "En salsa criolla" } } }, categorias: demoCategories }), 0);
      return () => window.clearTimeout(timer);
    }
    api.get<Menu>(`/publico/menu-qr/${token}`).then((response) => setMenu(response.data)).catch((error) => setFailure(errorMessage(error)));
  }, [token]);

  useEffect(() => {
    if (!request || request.estado !== "PENDIENTE") return;
    if (token.startsWith("demo-mesa-")) { const timer = window.setTimeout(() => setRequest((current) => current ? { ...current, estado: "ACEPTADA", pedidoId: 9001 } : current), 2500); return () => window.clearTimeout(timer); }
    const timer = window.setInterval(() => api.get<RequestStatus>(`/publico/pedidos-qr/${request.id}`).then((response) => setRequest(response.data)).catch(() => undefined), 4000);
    return () => window.clearInterval(timer);
  }, [request, token]);

  const displayCategories = useMemo(() => {
    if (!menu) return [];
    const configured = menu.plantillaCarta?.secciones ?? [];
    if (!configured.length) return menu.categorias;
    return configured.map((section) => {
      const source = menu.categorias.find((category) => category.id === section.categoriaId);
      if (!source) return null;
      const ids = new Set(section.productoIds);
      return { id: source.id, nombre: section.titulo || source.nombre, productos: source.productos.filter((product) => ids.has(product.id)) };
    }).filter((category): category is NonNullable<typeof category> => Boolean(category?.productos.length));
  }, [menu]);

  const products = useMemo(() => displayCategories.flatMap((category) => category.productos), [displayCategories]);
  const total = products.reduce((sum, product) => sum + Number(product.precio) * (cart[product.id] ?? 0), 0);
  const quantity = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const change = (id: number, amount: number) => setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + amount) }));
  const send = async () => {
    if (!menu?.pedidosHabilitados || !quantity) return;
    setSending(true); setFailure("");
    if (token.startsWith("demo-mesa-")) { setRequest({ id: crypto.randomUUID(), estado: "PENDIENTE" }); setSending(false); return; }
    try {
      const response = await api.post<RequestStatus>(`/publico/menu-qr/${token}/solicitudes`, { claveCliente: crypto.randomUUID(), nombreCliente: name || undefined, observaciones: notes || undefined, detalles: Object.entries(cart).filter(([, amount]) => amount > 0).map(([productId, cantidad]) => ({ productoId: Number(productId), cantidad })) });
      setRequest(response.data);
    } catch (error) { setFailure(errorMessage(error)); } finally { setSending(false); }
  };

  if (failure && !menu) return <main className="grid min-h-screen place-items-center bg-[#f3ede1] p-6"><p className="rounded-3xl bg-white p-8 text-center font-bold text-red-700">{failure}</p></main>;
  if (!menu) return <main className="grid min-h-screen place-items-center bg-[#f3ede1] font-bold">Cargando menú…</main>;
  if (request) return <main className="grid min-h-screen place-items-center bg-[#f3ede1] p-5"><section className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl"><UtensilsCrossed className="mx-auto mb-4 text-marigold" size={42}/><p className="text-xs font-black uppercase tracking-[.25em] text-denim/45">Mesa {menu.mesa.numero}</p><h1 className="mt-2 text-3xl font-black">{request.estado === "PENDIENTE" ? "Pedido recibido" : request.estado === "ACEPTADA" ? "Pedido aceptado" : "Pedido no aceptado"}</h1><p className="mt-4 text-denim/65">{request.estado === "PENDIENTE" ? "El restaurante está revisando tu solicitud. Esta pantalla se actualizará automáticamente." : request.estado === "ACEPTADA" ? `Ya ingresó a operación${request.pedidoId ? ` como pedido #${request.pedidoId}` : ""}.` : request.motivoRechazo || "Consulta al personal del restaurante."}</p></section></main>;

  const style = menu.plantillaCarta?.estilo ?? "EDITORIAL_DORADO";
  const palette = style === "CONTEMPORANEA" ? { bg: "#f6f3ed", card: "#ffffff", dark: "#182329", accent: "#d85f3d", muted: "#667078" } : style === "EJECUTIVA" ? { bg: "#fff8e9", card: "#fffdf7", dark: "#18352d", accent: "#e3a72f", muted: "#617069" } : { bg: "#f3ede1", card: "#fffdf8", dark: "#14283b", accent: "#b98a2d", muted: "#65717c" };
  const vars = { "--qr-bg": palette.bg, "--qr-card": palette.card, "--qr-dark": palette.dark, "--qr-accent": palette.accent, "--qr-muted": palette.muted } as CSSProperties;
  const special = menu.cartaDia?.contenido.especial;
  const showPrices = menu.plantillaCarta?.mostrarPrecios !== false;

  return <main style={vars} className={`min-h-screen bg-[var(--qr-bg)] text-[var(--qr-dark)] ${menu.pedidosHabilitados ? "pb-32" : "pb-10"}`}>
    <header className="relative overflow-hidden bg-[var(--qr-dark)] px-5 pb-9 pt-7 text-white">
      <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border-[34px] border-white/5" aria-hidden="true"/>
      <div className="relative mx-auto max-w-4xl"><p className="text-xs font-black uppercase tracking-[.24em] text-[var(--qr-accent)]">{menu.restaurante}</p><div className="mt-4 flex items-end justify-between gap-5"><div><h1 className="max-w-xl text-4xl font-black leading-[.95] sm:text-5xl">{menu.plantillaCarta?.titulo || "Menú"}</h1>{menu.plantillaCarta?.subtitulo && <p className="mt-3 max-w-lg text-sm text-white/60">{menu.plantillaCarta.subtitulo}</p>}</div><span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold">Mesa {menu.mesa.numero}</span></div><p className="mt-3 text-xs text-white/45">{menu.sucursal}</p></div>
    </header>
    <div className="mx-auto max-w-4xl space-y-8 p-5 sm:p-7">
      {special?.nombre && <section className="relative overflow-hidden rounded-[2rem] bg-[var(--qr-card)] p-6 shadow-sm sm:p-8"><div className="absolute left-0 top-0 h-full w-2 bg-[var(--qr-accent)]"/><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--qr-dark)] text-[var(--qr-accent)]"><Sparkles size={20}/></span><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--qr-accent)]">{special.titulo || "Especial de hoy"}</p><div className="mt-1 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-3xl font-black">{special.nombre}</h2>{special.descripcion && <p className="mt-2 max-w-xl text-sm text-[var(--qr-muted)]">{special.descripcion}</p>}</div>{special.precio !== undefined && <strong className="text-xl">{money.format(Number(special.precio))}</strong>}</div></div></div></section>}
      {!menu.pedidosHabilitados && <section className="rounded-2xl border border-[var(--qr-accent)]/40 bg-[var(--qr-card)] px-5 py-4"><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--qr-accent)]">Solo consulta</p><p className="mt-1 text-sm text-[var(--qr-muted)]">Para realizar tu pedido, comunícate con tu mesero.</p></section>}
      <div className="grid gap-8 md:grid-cols-2 md:items-start">{displayCategories.map((category) => <section key={category.id} className="rounded-[1.75rem] bg-[var(--qr-card)] p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="h-1 w-10 rounded-full bg-[var(--qr-accent)]"/><h2 className="text-xl font-black uppercase tracking-[.06em]">{category.nombre}</h2></div><div className="divide-y divide-black/5">{category.productos.map((product) => <article key={product.id} className="grid grid-cols-[1fr_auto] gap-4 py-4 first:pt-0 last:pb-0"><div className="min-w-0"><div className="flex gap-3">{product.imagenPrincipal && <img src={productImageUrl(product.imagenPrincipal, "thumb")} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" onError={(event) => { event.currentTarget.hidden = true; }}/>}<div><h3 className="font-black leading-tight">{product.nombre}</h3>{product.descripcion && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--qr-muted)]">{product.descripcion}</p>}{showPrices && <strong className="mt-2 block text-sm">{money.format(Number(product.precio))}</strong>}</div></div></div>{menu.pedidosHabilitados && <div className="flex items-center gap-2 self-center"><button aria-label={`Quitar ${product.nombre}`} className="grid h-9 w-9 place-items-center rounded-full border border-black/10" onClick={() => change(product.id, -1)}><Minus size={15}/></button><b className="w-5 text-center text-sm">{cart[product.id] ?? 0}</b><button aria-label={`Agregar ${product.nombre}`} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--qr-accent)] text-[var(--qr-dark)]" onClick={() => change(product.id, 1)}><Plus size={15}/></button></div>}</article>)}</div></section>)}</div>
      {(menu.cartaDia?.contenido.mensaje || menu.plantillaCarta?.pie) && <p className="text-center text-sm italic text-[var(--qr-muted)]">{menu.cartaDia?.contenido.mensaje || menu.plantillaCarta?.pie}</p>}
      {menu.pedidosHabilitados && <section className="rounded-[1.75rem] bg-[var(--qr-card)] p-5 shadow-sm"><h2 className="font-black">Datos del pedido</h2><input className="mt-4 w-full rounded-2xl border border-black/10 bg-transparent p-3" placeholder="Nombre (opcional)" value={name} onChange={(event) => setName(event.target.value)}/><textarea className="mt-3 w-full rounded-2xl border border-black/10 bg-transparent p-3" placeholder="Observaciones generales (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)}/><p className="mt-3 text-xs text-[var(--qr-muted)]">{menu.requiereAceptacion ? "El restaurante confirmará el pedido antes de ingresarlo a operación." : "El pedido ingresará automáticamente a operación."}</p>{failure && <p className="mt-3 text-sm font-bold text-red-700">{failure}</p>}</section>}
    </div>
    {menu.pedidosHabilitados && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-[var(--qr-card)] p-4"><button disabled={!quantity || sending} onClick={send} className="mx-auto flex w-full max-w-4xl items-center justify-between rounded-2xl bg-[var(--qr-dark)] px-5 py-4 font-black text-white disabled:opacity-40"><span className="flex items-center gap-2"><ShoppingCart size={20}/>Enviar {quantity} producto(s)</span><span>{money.format(total)}</span></button></div>}
  </main>;
}
