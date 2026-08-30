import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

type Article = { id: number; nombre: string; unidad: string; stock?: string };
type Supplier = { id: number; nombre: string; identificacion?: string; articulos: { articuloId: number; precio: number; articulo: Article }[] };
type Request = { id: number; estado: string; observaciones?: string; proveedor?: Supplier; detalles: { id: number; cantidad: number; articulo: Article }[]; orden?: { id: number } };
type OrderLine = { id: number; cantidadPedida: number; cantidadRecibida: number; precioUnitario: number; articulo: Article };
type Order = { id: number; estado: string; totalEstimado: number; proveedor: Supplier; detalles: OrderLine[] };
const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function SupplyPage() {
  const { branchId, session } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState(0);
  const [articleId, setArticleId] = useState(0);
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [receiving, setReceiving] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    if (!branchId) return;
    if (session?.demo) {
      const demoArticles = [{ id: 1, nombre: "Carne para hamburguesa", unidad: "KG", stock: "18" }, { id: 2, nombre: "Papa", unidad: "KG", stock: "24" }];
      setArticles(demoArticles);
      setSuppliers((current) => current.length ? current : [{ id: 1, nombre: "Distribuciones La Sabana", identificacion: "900123456", articulos: [{ articuloId: 1, precio: 28500, articulo: demoArticles[0] }] }]);
      setSupplierId((current) => current || 1); setArticleId((current) => current || 1);
      return;
    }
    try {
      const [providerResponse, articleResponse, requestResponse, orderResponse] = await Promise.all([
        api.get<Supplier[]>("/abastecimiento/proveedores"), api.get<Article[]>("/articulos"),
        api.get<Request[]>("/abastecimiento/solicitudes", { params: { sucursalId: branchId } }),
        api.get<Order[]>("/abastecimiento/ordenes", { params: { sucursalId: branchId } }),
      ]);
      setSuppliers(providerResponse.data); setArticles(articleResponse.data); setRequests(requestResponse.data); setOrders(orderResponse.data);
      setSupplierId((current) => current || providerResponse.data[0]?.id || 0); setArticleId((current) => current || articleResponse.data[0]?.id || 0);
    } catch (error) { toast.error(errorMessage(error)); }
  }, [branchId, session?.demo]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const selectedSupplier = useMemo(() => suppliers.find((supplier) => supplier.id === supplierId), [supplierId, suppliers]);
  const createSupplier = async () => {
    if (!supplierName.trim()) return;
    if (session?.demo) { setSuppliers((current) => [...current, { id: Date.now(), nombre: supplierName.trim(), articulos: [] }]); setSupplierName(""); toast.success("Proveedor creado en demostración"); return; }
    try { await api.post("/abastecimiento/proveedores", { nombre: supplierName.trim() }); setSupplierName(""); await load(); } catch (error) { toast.error(errorMessage(error)); }
  };
  const savePrice = async () => {
    if (!supplierId || !articleId || price < 0) return;
    if (session?.demo) { const article = articles.find((item) => item.id === articleId)!; setSuppliers((current) => current.map((supplier) => supplier.id === supplierId ? { ...supplier, articulos: [...supplier.articulos.filter((item) => item.articuloId !== articleId), { articuloId: articleId, precio: price, articulo: article }] } : supplier)); toast.success("Precio actualizado"); return; }
    try { await api.post(`/abastecimiento/proveedores/${supplierId}/precios`, { articuloId: articleId, precio: price }); await load(); toast.success("Precio actualizado"); } catch (error) { toast.error(errorMessage(error)); }
  };
  const createRequest = async () => {
    if (!branchId || !articleId || quantity <= 0) return;
    if (session?.demo) { const article = articles.find((item) => item.id === articleId)!; setRequests((current) => [{ id: Date.now(), estado: "PENDIENTE", proveedor: selectedSupplier, detalles: [{ id: Date.now(), cantidad: quantity, articulo: article }] }, ...current]); toast.success("Solicitud creada"); return; }
    try { await api.post("/abastecimiento/solicitudes", { sucursalId: branchId, proveedorId: supplierId || undefined, detalles: [{ articuloId: articleId, cantidad: quantity }] }); await load(); toast.success("Solicitud creada"); } catch (error) { toast.error(errorMessage(error)); }
  };
  const convert = async (request: Request) => {
    if (session?.demo) { const supplier = request.proveedor ?? selectedSupplier; if (!supplier) return; const details = request.detalles.map((detail) => ({ id: detail.id, cantidadPedida: detail.cantidad, cantidadRecibida: 0, precioUnitario: supplier.articulos.find((priceItem) => priceItem.articuloId === detail.articulo.id)?.precio ?? 0, articulo: detail.articulo })); setOrders((current) => [{ id: Date.now(), estado: "ABIERTA", proveedor: supplier, totalEstimado: details.reduce((total, detail) => total + detail.cantidadPedida * detail.precioUnitario, 0), detalles: details }, ...current]); setRequests((current) => current.map((item) => item.id === request.id ? { ...item, estado: "CONVERTIDA" } : item)); toast.success("Orden creada"); return; }
    try { await api.post(`/abastecimiento/solicitudes/${request.id}/convertir`, { proveedorId: request.proveedor?.id ?? supplierId }); await load(); toast.success("Orden creada"); } catch (error) { toast.error(errorMessage(error)); }
  };
  const receive = async (order: Order) => {
    const details = order.detalles.map((detail) => ({ detalleOrdenId: detail.id, cantidad: receiving[detail.id] ?? 0 })).filter((detail) => detail.cantidad > 0);
    if (!details.length) return toast.error("Indica al menos una cantidad recibida");
    if (session?.demo) { setOrders((current) => current.map((item) => item.id !== order.id ? item : { ...item, detalles: item.detalles.map((detail) => ({ ...detail, cantidadRecibida: detail.cantidadRecibida + (receiving[detail.id] ?? 0) })), estado: item.detalles.every((detail) => detail.cantidadRecibida + (receiving[detail.id] ?? 0) >= detail.cantidadPedida) ? "RECIBIDA" : "PARCIAL" })); setReceiving({}); toast.success("Recepción registrada e inventario actualizado"); return; }
    try { await api.post(`/abastecimiento/ordenes/${order.id}/recepciones`, { detalles: details }); setReceiving({}); await load(); toast.success("Recepción registrada e inventario actualizado"); } catch (error) { toast.error(errorMessage(error)); }
  };

  return <div className="space-y-6"><header><p className="eyebrow">Compras e inventario</p><h1 className="page-title">Proveedores y abastecimiento</h1><p>Las recepciones actualizan existencias mediante movimientos trazables; una recepción parcial mantiene la orden abierta.</p></header><div className="grid gap-5 xl:grid-cols-2"><section className="card space-y-4"><h2 className="text-xl font-black">Proveedores</h2><div className="flex gap-2"><input className="input" placeholder="Nombre del proveedor" value={supplierName} onChange={(e) => setSupplierName(e.target.value)}/><button className="primary w-auto px-4" onClick={() => void createSupplier()}>Crear</button></div><select className="input" value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nombre}</option>)}</select><div className="grid grid-cols-3 gap-2"><select className="input col-span-2" value={articleId} onChange={(e) => setArticleId(Number(e.target.value))}>{articles.map((article) => <option key={article.id} value={article.id}>{article.nombre}</option>)}</select><input className="input" type="number" min="0" placeholder="Precio" value={price} onChange={(e) => setPrice(Number(e.target.value))}/></div><button className="secondary" onClick={() => void savePrice()}>Guardar precio suministrado</button>{selectedSupplier?.articulos.map((item) => <p key={item.articuloId} className="text-sm"><b>{item.articulo.nombre}</b> · {money.format(Number(item.precio))}</p>)}</section><section className="card space-y-4"><h2 className="text-xl font-black">Nueva solicitud</h2><p className="text-sm text-denim/60">Proveedor: {selectedSupplier?.nombre || "Sin seleccionar"}</p><select className="input" value={articleId} onChange={(e) => setArticleId(Number(e.target.value))}>{articles.map((article) => <option key={article.id} value={article.id}>{article.nombre} ({article.unidad})</option>)}</select><input className="input" type="number" min="0.0001" step="0.0001" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}/><button className="primary" onClick={() => void createRequest()}>Crear solicitud de compra</button></section></div><section className="card overflow-x-auto"><h2 className="text-xl font-black">Solicitudes</h2><table className="mt-3 w-full text-left text-sm"><thead><tr><th className="p-3">Número</th><th>Proveedor</th><th>Insumos</th><th>Estado</th><th></th></tr></thead><tbody>{requests.map((request) => <tr className="border-t" key={request.id}><td className="p-3">#{request.id}</td><td>{request.proveedor?.nombre || "Por definir"}</td><td>{request.detalles.map((detail) => `${detail.cantidad} ${detail.articulo.nombre}`).join(", ")}</td><td>{request.estado}</td><td>{request.estado === "PENDIENTE" && <button className="secondary my-2 h-10 w-auto px-3" onClick={() => void convert(request)}>Crear orden</button>}</td></tr>)}</tbody></table></section><section className="space-y-4"><h2 className="text-2xl font-black">Órdenes y recepciones</h2>{orders.map((order) => <article className="card" key={order.id}><div className="flex flex-wrap justify-between gap-3"><div><p className="eyebrow">Orden #{order.id} · {order.estado}</p><h3 className="text-xl font-black">{order.proveedor.nombre}</h3></div><strong>{money.format(Number(order.totalEstimado))}</strong></div><div className="mt-4 space-y-3">{order.detalles.map((detail) => { const pending = Number(detail.cantidadPedida) - Number(detail.cantidadRecibida); return <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_150px]" key={detail.id}><span>{detail.articulo.nombre}<small className="block text-denim/50">Pedido {detail.cantidadPedida} · Recibido {detail.cantidadRecibida} · Diferencia {-pending}</small></span><span>Pendiente {pending}</span><input className="input" disabled={pending <= 0} type="number" min="0" max={pending} step="0.0001" placeholder="Recibir" value={receiving[detail.id] ?? ""} onChange={(e) => setReceiving((current) => ({ ...current, [detail.id]: Number(e.target.value) }))}/></div>; })}</div>{order.estado !== "RECIBIDA" && <button className="primary mt-4" onClick={() => void receive(order)}>Registrar recepción</button>}</article>)}</section></div>;
}
