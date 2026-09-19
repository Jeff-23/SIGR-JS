import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  LayoutTemplate,
  Printer,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import type { ApiProduct } from "../features/salon/contracts";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

type MenuStyle = "EDITORIAL_DORADO" | "CONTEMPORANEA" | "EJECUTIVA";
type TemplateSection = { categoriaId: number; titulo: string; productoIds: number[] };
type MenuTemplate = {
  sucursalId: number;
  titulo: string;
  subtitulo: string;
  pie: string;
  estilo: MenuStyle;
  mostrarPrecios: boolean;
  secciones: TemplateSection[];
  actualizadoEn?: string | null;
};
type DailyContent = {
  titulo: string;
  subtitulo: string;
  precioBase?: number;
  grupos: Array<{ titulo: string; opciones: string[] }>;
  especial?: { titulo: string; nombre: string; descripcion: string; precio?: number } | null;
  mensaje: string;
};
type DailyMenu = {
  id: number | null;
  sucursalId: number;
  fecha: string;
  publicada: boolean;
  contenido: DailyContent;
  actualizadoEn: string | null;
};

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const styles: Array<{ id: MenuStyle; name: string; note: string }> = [
  { id: "EDITORIAL_DORADO", name: "Editorial dorado", note: "Elegante, crema, azul profundo y dorado." },
  { id: "CONTEMPORANEA", name: "Contemporánea", note: "Limpia, moderna y de alto contraste." },
  { id: "EJECUTIVA", name: "Ejecutiva", note: "Compacta para carta de almuerzos y WhatsApp." },
];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function emptyDaily(branchId: number, fecha: string): DailyMenu {
  return {
    id: null, sucursalId: branchId, fecha, publicada: false, actualizadoEn: null,
    contenido: {
      titulo: "Almuerzo del día", subtitulo: "", grupos: [], mensaje: "",
      especial: { titulo: "Especial de hoy", nombre: "", descripcion: "" },
    },
  };
}
function defaultTemplate(branchId: number): MenuTemplate {
  return { sucursalId: branchId, titulo: "Menú de almuerzos", subtitulo: "Preparado fresco todos los días", pie: "Pregunta por disponibilidad y domicilios.", estilo: "EDITORIAL_DORADO", mostrarPrecios: true, secciones: [] };
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function DailyMenuPage() {
  const { branchId, session } = useApp();
  const [tab, setTab] = useState<"HOY" | "BASE">("HOY");
  const [date, setDate] = useState(todayKey());
  const [daily, setDaily] = useState<DailyMenu>(() => emptyDaily(branchId ?? 0, date));
  const [template, setTemplate] = useState<MenuTemplate>(() => defaultTemplate(branchId ?? 0));
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const restaurantName = session?.user.restauranteNombre?.trim() || "Tu restaurante";

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    if (session?.demo) {
      const timer = window.setTimeout(() => {
        if (!active) return;
        setDaily(emptyDaily(branchId, date));
        setTemplate(defaultTemplate(branchId));
        setLoading(false);
      }, 0);
      return () => { active = false; window.clearTimeout(timer); };
    }
    const timer = window.setTimeout(() => { if (active) setLoading(true); }, 0);
    Promise.all([
      api.get<DailyMenu>(`/cartas-dia/${branchId}/${date}`),
      api.get<MenuTemplate>(`/cartas-dia/${branchId}/plantilla`),
      api.get<ApiProduct[]>("/productos", { params: { sucursalId: branchId } }),
    ]).then(([dailyResponse, templateResponse, productResponse]) => {
      if (!active) return;
      setDaily(dailyResponse.data);
      setTemplate(templateResponse.data);
      setProducts(productResponse.data);
    }).catch((error) => { if (active) toast.error(errorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(timer); };
  }, [branchId, date, session?.demo]);

  const categories = useMemo(() => {
    const map = new Map<number, { id: number; nombre: string; products: ApiProduct[] }>();
    products.filter((product) => product.disponible !== false).forEach((product) => {
      const current = map.get(product.categoria.id) ?? { id: product.categoria.id, nombre: product.categoria.nombre, products: [] };
      current.products.push(product);
      map.set(product.categoria.id, current);
    });
    return [...map.values()];
  }, [products]);

  const effectiveSections = useMemo<TemplateSection[]>(() => {
    if (template.secciones.length) return template.secciones;
    return categories.map((category) => ({ categoriaId: category.id, titulo: category.nombre, productoIds: category.products.map((product) => product.id) }));
  }, [categories, template.secciones]);

  const visibleSections = useMemo(() => effectiveSections.map((section) => ({
    ...section,
    products: section.productoIds.map((id) => products.find((product) => product.id === id)).filter((product): product is ApiProduct => Boolean(product && product.disponible !== false)),
  })).filter((section) => section.products.length), [effectiveSections, products]);

  const updateDailySpecial = (patch: Partial<NonNullable<DailyContent["especial"]>>) => {
    setDaily((current) => ({ ...current, contenido: { ...current.contenido, especial: { titulo: current.contenido.especial?.titulo ?? "Especial de hoy", nombre: current.contenido.especial?.nombre ?? "", descripcion: current.contenido.especial?.descripcion ?? "", precio: current.contenido.especial?.precio, ...patch } } }));
  };

  const saveDaily = async () => {
    if (session?.demo) return toast.success("Vista demo actualizada.");
    setBusy(true);
    try {
      const { data } = await api.put<DailyMenu>(`/cartas-dia/${branchId}/${date}`, { publicada: daily.publicada, contenido: daily.contenido });
      setDaily(data);
      toast.success(data.publicada ? "Carta de hoy publicada." : "Borrador guardado.");
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  };

  const saveTemplate = async () => {
    if (session?.demo) return toast.success("Plantilla demo actualizada.");
    setBusy(true);
    try {
      const payload = { ...template, secciones: effectiveSections.map(({ categoriaId, titulo, productoIds }) => ({ categoriaId, titulo, productoIds })) };
      const { data } = await api.put<MenuTemplate>(`/cartas-dia/${branchId}/plantilla`, payload);
      setTemplate(data);
      toast.success("Plantilla de carta guardada.");
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  };

  const toggleCategory = (categoryId: number) => {
    setTemplate((current) => {
      const existing = effectiveSections.find((section) => section.categoriaId === categoryId);
      const selected = current.secciones.length ? current.secciones : effectiveSections;
      if (existing) return { ...current, secciones: selected.filter((section) => section.categoriaId !== categoryId) };
      const category = categories.find((item) => item.id === categoryId);
      if (!category) return current;
      return { ...current, secciones: [...selected, { categoriaId: category.id, titulo: category.nombre, productoIds: category.products.map((product) => product.id) }] };
    });
  };

  const toggleProduct = (categoryId: number, productId: number) => {
    setTemplate((current) => {
      const selected = current.secciones.length ? current.secciones : effectiveSections;
      return { ...current, secciones: selected.map((section) => section.categoriaId !== categoryId ? section : { ...section, productoIds: section.productoIds.includes(productId) ? section.productoIds.filter((id) => id !== productId) : [...section.productoIds, productId] }) };
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const selected = template.secciones.length ? [...template.secciones] : [...effectiveSections];
    const next = index + direction;
    if (next < 0 || next >= selected.length) return;
    [selected[index], selected[next]] = [selected[next], selected[index]];
    setTemplate((current) => ({ ...current, secciones: selected }));
  };

  const palette = template.estilo === "CONTEMPORANEA"
    ? { bg: "#f6f3ed", card: "#ffffff", dark: "#182329", accent: "#d85f3d", muted: "#667078" }
    : template.estilo === "EJECUTIVA"
      ? { bg: "#fff8e9", card: "#fffdf7", dark: "#18352d", accent: "#e3a72f", muted: "#617069" }
      : { bg: "#f3ede1", card: "#fffdf8", dark: "#14283b", accent: "#b98a2d", muted: "#65717c" };

  const printMenu = () => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return toast.error("El navegador bloqueó la ventana de impresión.");
    const special = daily.contenido.especial;
    const sectionsHtml = visibleSections.map((section) => `<section class="menu-section"><h2>${escapeHtml(section.titulo)}</h2>${section.products.map((product) => `<div class="item"><div><strong>${escapeHtml(product.nombre)}</strong>${product.descripcion ? `<small>${escapeHtml(product.descripcion)}</small>` : ""}</div>${template.mostrarPrecios ? `<b>${money.format(Number(product.precio))}</b>` : ""}</div>`).join("")}</section>`).join("");
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(template.titulo)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:${palette.bg};color:${palette.dark}}.sheet{min-height:297mm;padding:16mm 15mm;background:${palette.bg}}header{display:grid;grid-template-columns:1fr auto;align-items:end;border-bottom:4px solid ${palette.accent};padding-bottom:12mm}.brand{font-size:11px;letter-spacing:.2em;font-weight:900;color:${palette.accent};text-transform:uppercase}h1{font-size:35px;line-height:1;margin:6px 0}.sub{color:${palette.muted};font-size:13px}.date{font-size:12px;color:${palette.muted}}.special{margin:9mm 0;background:${palette.dark};color:#fff;border-radius:8px;padding:8mm;display:flex;justify-content:space-between;gap:8mm}.special small{display:block;color:${palette.accent};text-transform:uppercase;letter-spacing:.16em;font-weight:900}.special h2{margin:3px 0;font-size:25px}.special p{margin:4px 0;color:#d9e1e6}.special b{font-size:22px;white-space:nowrap}.grid{columns:2;column-gap:9mm}.menu-section{break-inside:avoid;margin:0 0 7mm;padding:0 0 5mm;border-bottom:1px solid #cfc8bc}.menu-section h2{font-size:18px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 3mm;color:${palette.accent}}.item{display:flex;justify-content:space-between;gap:6mm;margin:0 0 2.5mm}.item strong{font-size:13px}.item small{display:block;margin-top:2px;color:${palette.muted};font-size:10px;line-height:1.3}.item b{font-size:12px;white-space:nowrap}footer{border-top:1px solid #cfc8bc;margin-top:6mm;padding-top:4mm;text-align:center;color:${palette.muted};font-size:11px}@media print{.sheet{min-height:auto}}</style></head><body><article class="sheet"><header><div><div class="brand">${escapeHtml(restaurantName)}</div><h1>${escapeHtml(template.titulo)}</h1>${template.subtitulo ? `<div class="sub">${escapeHtml(template.subtitulo)}</div>` : ""}</div><div class="date">${escapeHtml(date)}</div></header>${special?.nombre?.trim() ? `<section class="special"><div><small>${escapeHtml(special.titulo || "Especial de hoy")}</small><h2>${escapeHtml(special.nombre)}</h2>${special.descripcion ? `<p>${escapeHtml(special.descripcion)}</p>` : ""}</div>${special.precio !== undefined ? `<b>${money.format(Number(special.precio))}</b>` : ""}</section>` : ""}<main class="grid">${sectionsHtml}</main>${template.pie || daily.contenido.mensaje ? `<footer>${escapeHtml(daily.contenido.mensaje || template.pie)}</footer>` : ""}</article><script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };

  const downloadPng = () => {
    const itemCount = visibleSections.reduce((sum, section) => sum + section.products.length, 0);
    const height = Math.max(1350, Math.min(2600, 900 + visibleSections.length * 95 + itemCount * 54));
    const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = height;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, 1080, height);
    ctx.fillStyle = palette.dark; ctx.fillRect(0, 0, 1080, 280);
    ctx.fillStyle = palette.accent; ctx.fillRect(72, 72, 10, 136);
    ctx.fillStyle = palette.accent; ctx.font = "800 25px Arial"; ctx.fillText(restaurantName.toUpperCase(), 112, 106);
    ctx.fillStyle = "#fff"; ctx.font = "900 64px Arial"; let y = 174;
    wrapText(ctx, template.titulo, 830).slice(0, 2).forEach((line) => { ctx.fillText(line, 112, y); y += 68; });
    if (template.subtitulo) { ctx.fillStyle = "#dce3e7"; ctx.font = "27px Arial"; ctx.fillText(template.subtitulo.slice(0, 58), 112, 244); }
    y = 330;
    const special = daily.contenido.especial;
    if (special?.nombre?.trim()) {
      ctx.fillStyle = palette.card; ctx.fillRect(72, y, 936, 190);
      ctx.fillStyle = palette.accent; ctx.font = "800 24px Arial"; ctx.fillText((special.titulo || "Especial de hoy").toUpperCase(), 108, y + 48);
      ctx.fillStyle = palette.dark; ctx.font = "900 42px Arial"; ctx.fillText(special.nombre.slice(0, 36), 108, y + 98);
      if (special.descripcion) { ctx.fillStyle = palette.muted; ctx.font = "25px Arial"; wrapText(ctx, special.descripcion, 650).slice(0, 2).forEach((line, index) => ctx.fillText(line, 108, y + 137 + index * 30)); }
      if (special.precio !== undefined) { ctx.fillStyle = palette.dark; ctx.font = "900 34px Arial"; ctx.textAlign = "right"; ctx.fillText(money.format(Number(special.precio)), 960, y + 54); ctx.textAlign = "left"; }
      y += 235;
    }
    const leftX = 72, rightX = 552, colW = 456; let leftY = y, rightY = y;
    visibleSections.forEach((section, index) => {
      const x = index % 2 === 0 ? leftX : rightX; let sy = index % 2 === 0 ? leftY : rightY;
      ctx.fillStyle = palette.accent; ctx.font = "900 27px Arial"; ctx.fillText(section.titulo.toUpperCase(), x, sy + 30); sy += 55;
      section.products.forEach((product) => {
        ctx.fillStyle = palette.dark; ctx.font = "700 24px Arial"; ctx.fillText(product.nombre.slice(0, 25), x, sy);
        if (template.mostrarPrecios) { ctx.font = "800 22px Arial"; ctx.textAlign = "right"; ctx.fillText(money.format(Number(product.precio)), x + colW - 10, sy); ctx.textAlign = "left"; }
        sy += 39;
        if (product.descripcion) { ctx.fillStyle = palette.muted; ctx.font = "20px Arial"; ctx.fillText(product.descripcion.slice(0, 36), x, sy); sy += 31; }
        sy += 10;
      });
      ctx.fillStyle = "#cfc8bc"; ctx.fillRect(x, sy, colW - 12, 1); sy += 34;
      if (index % 2 === 0) leftY = sy; else rightY = sy;
    });
    const footerY = Math.min(height - 70, Math.max(leftY, rightY) + 40);
    ctx.fillStyle = palette.dark; ctx.fillRect(72, footerY - 20, 936, 2);
    ctx.fillStyle = palette.muted; ctx.font = "22px Arial"; ctx.textAlign = "center"; ctx.fillText((daily.contenido.mensaje || template.pie || "").slice(0, 90), 540, footerY + 26); ctx.textAlign = "left";
    const link = document.createElement("a"); link.download = `carta-${date}.png`; link.href = canvas.toDataURL("image/png"); link.click();
  };

  if (loading) return <div className="card">Cargando carta…</div>;
  const special = daily.contenido.especial;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Carta dinámica</p><h1 className="page-title">Carta profesional</h1><p className="mt-2 max-w-2xl text-sm text-denim/55">Configura la carta base una vez. Cada día normalmente sólo cambias el especial y publicas.</p></div>
      <div className="flex rounded-2xl border border-denim/10 bg-white p-1">
        <button className={`rounded-xl px-4 py-2 text-sm font-black ${tab === "HOY" ? "bg-steel text-white" : "text-denim/60"}`} onClick={() => setTab("HOY")}>Carta de hoy</button>
        <button className={`rounded-xl px-4 py-2 text-sm font-black ${tab === "BASE" ? "bg-steel text-white" : "text-denim/60"}`} onClick={() => setTab("BASE")}>Configurar carta base</button>
      </div>
    </header>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(390px,.8fr)]">
      <section className="card space-y-5">
        {tab === "HOY" ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-bold">Fecha<input className="input mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label className="flex items-end gap-3 pb-3 font-bold"><input type="checkbox" checked={daily.publicada} onChange={(event) => setDaily((current) => ({ ...current, publicada: event.target.checked }))} /> Publicar esta carta</label>
          </div>
          <div className="rounded-[1.75rem] border-2 border-marigold/45 bg-marigold/5 p-6">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-steel text-marigold"><Sparkles size={20}/></span><div><p className="eyebrow">Lo que cambia hoy</p><h2 className="text-2xl font-black">Especial del día</h2></div></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">Nombre<input className="input mt-1" placeholder="Ej. Carne desmechada" value={special?.nombre ?? ""} onChange={(event) => updateDailySpecial({ nombre: event.target.value })}/></label>
              <label className="sm:col-span-2">Descripción opcional<textarea className="input mt-1 min-h-24" placeholder="Ej. En salsa criolla, acompañado de arroz y ensalada" value={special?.descripcion ?? ""} onChange={(event) => updateDailySpecial({ descripcion: event.target.value })}/></label>
              <label>Precio especial opcional<input className="input mt-1" type="number" min="0" step="100" value={special?.precio ?? ""} onChange={(event) => updateDailySpecial({ precio: event.target.value ? Number(event.target.value) : undefined })}/></label>
            </div>
          </div>
          <label className="block">Mensaje de hoy opcional<textarea className="input mt-1 min-h-20" placeholder="Ej. Servicio desde las 11:30 a. m." value={daily.contenido.mensaje} onChange={(event) => setDaily((current) => ({ ...current, contenido: { ...current.contenido, mensaje: event.target.value } }))}/></label>
          <div className="rounded-2xl bg-denim/5 p-4 text-sm text-denim/65"><b>La carta base ya aporta:</b> {visibleSections.map((section) => section.titulo).join(" · ") || "configura las secciones una vez en Carta base"}.</div>
          <button className="primary flex h-11 w-auto items-center gap-2 px-5" disabled={busy} onClick={() => void saveDaily()}><Save size={17}/> Guardar y actualizar</button>
        </> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">Título principal<input className="input mt-1" value={template.titulo} onChange={(event) => setTemplate((current) => ({ ...current, titulo: event.target.value }))}/></label>
            <label className="sm:col-span-2">Subtítulo<input className="input mt-1" value={template.subtitulo} onChange={(event) => setTemplate((current) => ({ ...current, subtitulo: event.target.value }))}/></label>
            <label className="sm:col-span-2">Pie de carta<input className="input mt-1" value={template.pie} onChange={(event) => setTemplate((current) => ({ ...current, pie: event.target.value }))}/></label>
          </div>
          <div><p className="eyebrow">Diseño</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{styles.map((style) => <button key={style.id} className={`rounded-2xl border p-4 text-left ${template.estilo === style.id ? "border-marigold bg-marigold/10" : "border-denim/10"}`} onClick={() => setTemplate((current) => ({ ...current, estilo: style.id }))}><LayoutTemplate size={20}/><b className="mt-3 block">{style.name}</b><span className="mt-1 block text-xs text-denim/50">{style.note}</span>{template.estilo === style.id && <Check className="mt-3 text-marigold" size={18}/>}</button>)}</div></div>
          <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={template.mostrarPrecios} onChange={(event) => setTemplate((current) => ({ ...current, mostrarPrecios: event.target.checked }))}/> Mostrar precios en la carta</label>
          <div><div className="flex items-end justify-between gap-3"><div><p className="eyebrow">Contenido permanente</p><h2 className="text-xl font-black">Secciones y productos</h2></div><span className="text-xs text-denim/45">Sale del catálogo actual</span></div><div className="mt-4 space-y-3">{categories.map((category) => { const section = effectiveSections.find((item) => item.categoriaId === category.id); const selected = Boolean(section); const index = effectiveSections.findIndex((item) => item.categoriaId === category.id); return <div key={category.id} className="rounded-2xl border border-denim/10 p-4"><div className="flex items-center gap-3"><input type="checkbox" checked={selected} onChange={() => toggleCategory(category.id)}/><input className="input h-10 flex-1" disabled={!selected} value={section?.titulo ?? category.nombre} onChange={(event) => setTemplate((current) => ({ ...current, secciones: (current.secciones.length ? current.secciones : effectiveSections).map((item) => item.categoriaId === category.id ? { ...item, titulo: event.target.value } : item) }))}/>{selected && <div className="flex"><button className="grid h-9 w-9 place-items-center" disabled={index <= 0} onClick={() => moveSection(index, -1)}><ChevronUp size={17}/></button><button className="grid h-9 w-9 place-items-center" disabled={index < 0 || index >= effectiveSections.length - 1} onClick={() => moveSection(index, 1)}><ChevronDown size={17}/></button></div>}</div>{selected && <div className="mt-3 grid gap-2 sm:grid-cols-2">{category.products.map((product) => <label key={product.id} className="flex items-center gap-2 rounded-xl bg-denim/5 px-3 py-2 text-sm"><input type="checkbox" checked={section?.productoIds.includes(product.id) ?? false} onChange={() => toggleProduct(category.id, product.id)}/><span className="min-w-0 flex-1 truncate">{product.nombre}</span>{template.mostrarPrecios && <small>{money.format(Number(product.precio))}</small>}</label>)}</div>}</div>; })}</div></div>
          <button className="primary flex h-11 w-auto items-center gap-2 px-5" disabled={busy} onClick={() => void saveTemplate()}><Save size={17}/> Guardar carta base</button>
        </>}
      </section>

      <aside className="self-start xl:sticky xl:top-24">
        <div className="mb-3 flex flex-wrap gap-2"><button className="secondary flex h-10 w-auto items-center gap-2 px-4" onClick={downloadPng}><Download size={16}/> PNG completo</button><button className="secondary flex h-10 w-auto items-center gap-2 px-4" onClick={printMenu}><Printer size={16}/> Imprimir / PDF</button></div>
        <div className="overflow-hidden rounded-[2rem] border border-denim/10 p-3" style={{ background: palette.bg }}>
          <article className="overflow-hidden rounded-[1.6rem]" style={{ background: palette.card, color: palette.dark }}>
            <header className="p-7 text-white" style={{ background: palette.dark }}><p className="text-xs font-black uppercase tracking-[.2em]" style={{ color: palette.accent }}>{restaurantName}</p><h2 className="mt-3 text-4xl font-black leading-none">{template.titulo}</h2>{template.subtitulo && <p className="mt-3 text-sm text-white/65">{template.subtitulo}</p>}</header>
            {special?.nombre?.trim() && <section className="m-5 rounded-2xl p-5" style={{ background: palette.bg }}><p className="text-xs font-black uppercase tracking-[.16em]" style={{ color: palette.accent }}>{special.titulo || "Especial de hoy"}</p><div className="mt-1 flex items-start justify-between gap-3"><div><h3 className="text-2xl font-black">{special.nombre}</h3>{special.descripcion && <p className="mt-2 text-sm" style={{ color: palette.muted }}>{special.descripcion}</p>}</div>{special.precio !== undefined && <strong className="whitespace-nowrap text-xl">{money.format(Number(special.precio))}</strong>}</div></section>}
            <div className="grid gap-x-6 gap-y-5 p-6 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">{visibleSections.map((section) => <section key={section.categoriaId}><h3 className="border-b pb-2 text-sm font-black uppercase tracking-[.1em]" style={{ color: palette.accent }}>{section.titulo}</h3><div className="mt-3 space-y-3">{section.products.map((product) => <div key={product.id} className="flex items-start justify-between gap-3"><div><b className="text-sm">{product.nombre}</b>{product.descripcion && <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: palette.muted }}>{product.descripcion}</p>}</div>{template.mostrarPrecios && <span className="whitespace-nowrap text-xs font-black">{money.format(Number(product.precio))}</span>}</div>)}</div></section>)}</div>
            {(daily.contenido.mensaje || template.pie) && <footer className="mx-6 border-t py-5 text-center text-xs" style={{ color: palette.muted }}>{daily.contenido.mensaje || template.pie}</footer>}
          </article>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-denim/45"><Eye size={14}/> Vista previa de la misma composición que alimenta PNG, PDF y QR.</p>
      </aside>
    </div>
  </div>;
}
