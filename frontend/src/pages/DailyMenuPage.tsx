import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  LayoutTemplate,
  Plus,
  Printer,
  Save,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import type { ApiProduct } from "../features/salon/contracts";
import { api, errorMessage } from "../lib/api";
import { frontendConfig } from "../lib/config";
import { productImageUrl } from "../lib/product-media";
import { useApp } from "../store/app";

type MenuStyle = "EDITORIAL_DORADO" | "CONTEMPORANEA" | "EJECUTIVA";
type ActivationMode = "SIEMPRE" | "HORARIO" | "MANUAL";
type TemplateSection = { categoriaId: number; titulo: string; productoIds: number[] };
type MenuTemplate = {
  titulo: string;
  subtitulo: string;
  pie: string;
  estilo: MenuStyle;
  mostrarPrecios: boolean;
  mostrarImagenesProductos: boolean;
  fondoColor: string;
  tarjetaColor: string;
  textoColor: string;
  acentoColor: string;
  encabezadoColor: string;
  logoUrl?: string | null;
  fondoImagenUrl?: string | null;
  fondoImagenOpacidad: number;
  tarjetaOpacidad: number;
  secciones: TemplateSection[];
};
type MenuProfile = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  estado: boolean;
  predeterminada: boolean;
  orden: number;
  modoActivacion: ActivationMode;
  activoManual: boolean;
  horaInicio?: string | null;
  horaFin?: string | null;
  diasSemana: number[];
  plantilla: MenuTemplate;
};
type DailyContent = {
  titulo: string;
  subtitulo: string;
  precioBase?: number;
  grupos: Array<{ titulo: string; opciones: string[] }>;
  especial?: { titulo: string; nombre: string; descripcion: string; precio?: number } | null;
  mensaje: string;
};
type MenuIdentity = { restauranteId?: number; logoUrl?: string | null; actualizadoEn?: string | null };
type DailyMenu = {
  id: number | null;
  sucursalId: number;
  perfilCartaId: number;
  fecha: string;
  publicada: boolean;
  contenido: DailyContent;
  actualizadoEn: string | null;
};

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const week = [
  [1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [7, "D"],
] as const;
const visualStyles: Array<{ id: MenuStyle; name: string; note: string }> = [
  { id: "EDITORIAL_DORADO", name: "Editorial", note: "Elegante y gastronómica." },
  { id: "CONTEMPORANEA", name: "Contemporánea", note: "Limpia y de alto contraste." },
  { id: "EJECUTIVA", name: "Ejecutiva", note: "Compacta para menús extensos." },
];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function defaultTemplate(title = "Menú"): MenuTemplate {
  return {
    titulo: title,
    subtitulo: "",
    pie: "",
    estilo: "EDITORIAL_DORADO",
    mostrarPrecios: true,
    mostrarImagenesProductos: false,
    fondoColor: "#F3EDE1",
    tarjetaColor: "#FFFDF8",
    textoColor: "#14283B",
    acentoColor: "#B98A2D",
    encabezadoColor: "#14283B",
    logoUrl: null,
    fondoImagenUrl: null,
    fondoImagenOpacidad: 0.12,
    tarjetaOpacidad: 0.82,
    secciones: [],
  };
}
function assetUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${frontendConfig.apiUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

function canvasRgba(hex: string, alpha: number) {
  return hexToRgba(hex, alpha);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

export function DailyMenuPage() {
  const { branchId, session } = useApp();
  const [tab, setTab] = useState<"HOY" | "CONTENIDO" | "DISENO" | "ACTIVACION">("HOY");
  const [date, setDate] = useState(todayKey());
  const [profiles, setProfiles] = useState<MenuProfile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [identity, setIdentity] = useState<MenuIdentity>({ logoUrl: null });
  const [daily, setDaily] = useState<DailyMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const restaurantName = session?.user.restauranteNombre?.trim() || "Tu restaurante";
  const profile = profiles.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    Promise.all([
      api.get<MenuProfile[]>(`/cartas-dia/${branchId}/perfiles`),
      api.get<ApiProduct[]>("/productos", { params: { sucursalId: branchId } }),
      api.get<MenuIdentity>(`/cartas-dia/${branchId}/identidad`),
    ])
      .then(([profileResponse, productResponse, identityResponse]) => {
        if (!active) return;
        const received = profileResponse.data.map(normalizeProfile);
        setProfiles(received);
        setProducts(productResponse.data);
        setIdentity(identityResponse.data);
        setSelectedId((current) => current && received.some((item) => item.id === current) ? current : received[0]?.id ?? null);
      })
      .catch((error) => toast.error(errorMessage(error)))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branchId]);

  useEffect(() => {
    if (!branchId || !selectedId) return;
    let active = true;
    api.get<DailyMenu>(`/cartas-dia/${branchId}/perfiles/${selectedId}/${date}`)
      .then(({ data }) => { if (active) setDaily(data); })
      .catch((error) => toast.error(errorMessage(error)));
    return () => { active = false; };
  }, [branchId, selectedId, date]);

  const categories = useMemo(() => {
    const map = new Map<number, { id: number; nombre: string; products: ApiProduct[] }>();
    for (const product of products) {
      const item = map.get(product.categoria.id) ?? { id: product.categoria.id, nombre: product.categoria.nombre, products: [] };
      item.products.push(product);
      map.set(product.categoria.id, item);
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [products]);

  const effectiveSections = useMemo(() => {
    if (!profile) return [];
    if (profile.plantilla.secciones.length) return profile.plantilla.secciones;
    return categories.map((category) => ({
      categoriaId: category.id,
      titulo: category.nombre,
      productoIds: category.products.filter((product) => product.disponible !== false).map((product) => product.id),
    }));
  }, [profile, categories]);

  const displaySections = useMemo(() => effectiveSections.map((section) => {
    const category = categories.find((item) => item.id === section.categoriaId);
    const allowed = new Set(section.productoIds);
    return {
      ...section,
      products: (category?.products ?? []).filter((product) => allowed.has(product.id) && product.disponible !== false),
    };
  }).filter((section) => section.products.length), [effectiveSections, categories]);

  const updateProfile = (patch: Partial<MenuProfile>) => {
    if (!selectedId) return;
    setProfiles((current) => current.map((item) => item.id === selectedId ? { ...item, ...patch } : item));
  };
  const updateTemplate = (patch: Partial<MenuTemplate>) => {
    if (!profile) return;
    updateProfile({ plantilla: { ...profile.plantilla, ...patch } });
  };

  const createProfile = async () => {
    if (!branchId) return;
    setBusy(true);
    try {
      const payload = {
        nombre: "Nueva carta",
        descripcion: "",
        estado: true,
        predeterminada: profiles.length === 0,
        orden: profiles.length,
        modoActivacion: "MANUAL" as const,
        activoManual: false,
        horaInicio: null,
        horaFin: null,
        diasSemana: [1, 2, 3, 4, 5, 6, 7],
        plantilla: defaultTemplate("Nueva carta"),
      };
      const { data } = await api.post<MenuProfile>(`/cartas-dia/${branchId}/perfiles`, payload);
      const normalized = normalizeProfile(data);
      setProfiles((current) => [...current, normalized]);
      setSelectedId(normalized.id);
      setTab("ACTIVACION");
      toast.success("Carta creada. Configura su contenido y horario.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!branchId || !profile) return;
    setBusy(true);
    try {
      const payload = {
        nombre: profile.nombre,
        descripcion: profile.descripcion || "",
        estado: profile.estado,
        predeterminada: profile.predeterminada,
        orden: profile.orden,
        modoActivacion: profile.modoActivacion,
        activoManual: profile.activoManual,
        horaInicio: profile.horaInicio || null,
        horaFin: profile.horaFin || null,
        diasSemana: profile.diasSemana,
        plantilla: { ...profile.plantilla, secciones: effectiveSections },
      };
      const { data } = await api.put<MenuProfile>(`/cartas-dia/${branchId}/perfiles/${profile.id}`, payload);
      const normalized = normalizeProfile(data);
      setProfiles((current) => current.map((item) => item.id === normalized.id ? normalized : item));
      toast.success("Carta guardada.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const saveDaily = async () => {
    if (!branchId || !profile || !daily) return;
    setBusy(true);
    try {
      const { data } = await api.put<DailyMenu>(`/cartas-dia/${branchId}/perfiles/${profile.id}/${date}`, {
        publicada: daily.publicada,
        contenido: daily.contenido,
      });
      setDaily(data);
      toast.success(data.publicada ? "Cambios del día publicados." : "Cambios guardados como borrador.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (file: File, field: "logoUrl" | "fondoImagenUrl") => {
    if (!branchId) return;
    const form = new FormData();
    form.append("archivo", file);
    try {
      const { data } = await api.post<{ url: string }>(`/cartas-dia/${branchId}/recursos`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (field === "logoUrl") {
        const { data: saved } = await api.put<MenuIdentity>(`/cartas-dia/${branchId}/identidad`, { logoUrl: data.url });
        setIdentity(saved);
        toast.success("Logo del restaurante actualizado para todas las cartas.");
      } else {
        updateTemplate({ fondoImagenUrl: data.url });
        toast.success("Fondo cargado. Guarda la carta para conservarlo.");
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const removeLogo = async () => {
    if (!branchId) return;
    try {
      const { data } = await api.put<MenuIdentity>(
        `/cartas-dia/${branchId}/identidad`,
        { logoUrl: null },
      );
      setIdentity(data);
      toast.success("Logo del restaurante eliminado de todas las cartas.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggleCategory = (categoryId: number) => {
    if (!profile) return;
    const current = effectiveSections;
    const exists = current.some((item) => item.categoriaId === categoryId);
    if (exists) {
      updateTemplate({ secciones: current.filter((item) => item.categoriaId !== categoryId) });
      return;
    }
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    updateTemplate({ secciones: [...current, { categoriaId: categoryId, titulo: category.nombre, productoIds: category.products.map((item) => item.id) }] });
  };
  const toggleProduct = (categoryId: number, productId: number) => {
    const current = effectiveSections;
    updateTemplate({ secciones: current.map((section) => section.categoriaId !== categoryId ? section : {
      ...section,
      productoIds: section.productoIds.includes(productId) ? section.productoIds.filter((id) => id !== productId) : [...section.productoIds, productId],
    }) });
  };
  const moveSection = (index: number, delta: number) => {
    const next = [...effectiveSections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateTemplate({ secciones: next });
  };

  const printMenu = () => {
    if (!profile) return;
    const template = profile.plantilla;
    const special = daily?.contenido.especial;
    const logo = assetUrl(identity.logoUrl);
    const customBackground = assetUrl(template.fondoImagenUrl);
    const watermark = customBackground || logo;
    const cardColor = hexToRgba(template.tarjetaColor, template.tarjetaOpacidad);
    const backgroundClass = customBackground ? "background-art cover" : "background-art contain";
    const sections = displaySections
      .map(
        (section) =>
          `<section class="menu-section"><h2>${escapeHtml(section.titulo)}</h2>${section.products
            .map(
              (product) =>
                `<div class="item"><span>${escapeHtml(product.nombre)}${
                  product.descripcion
                    ? `<small>${escapeHtml(product.descripcion)}</small>`
                    : ""
                }</span>${
                  template.mostrarPrecios
                    ? `<b>${money.format(Number(product.precio))}</b>`
                    : ""
                }</div>`,
            )
            .join("")}</section>`,
      )
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      template.titulo,
    )}</title><style>
      @page{size:A4;margin:0}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      html,body{margin:0;padding:0;background:${template.fondoColor};color:${template.textoColor};font-family:Arial,sans-serif}
      .sheet{position:relative;min-height:297mm;padding:15mm;overflow:hidden;background:${template.fondoColor}}
      .background-art{position:absolute;inset:0;width:100%;height:100%;opacity:${template.fondoImagenOpacidad};pointer-events:none}
      .background-art.cover{object-fit:cover}
      .background-art.contain{object-fit:contain;padding:24mm}
      .content{position:relative;z-index:1}
      .head{display:grid;grid-template-columns:1fr auto;gap:10mm;align-items:center;background:${hexToRgba(template.encabezadoColor, 0.96)};color:#fff;padding:8mm;border-radius:5mm}
      .logo{max-width:42mm;max-height:28mm;object-fit:contain}
      .brand{font-size:10px;letter-spacing:.2em;color:${template.acentoColor};font-weight:900;text-transform:uppercase}
      h1{font-size:34px;line-height:1;margin:4px 0 0}
      .sub{margin-top:3mm;color:rgba(255,255,255,.72)}
      .special{margin:8mm 0;background:${hexToRgba(template.encabezadoColor, 0.94)};color:#fff;padding:7mm;border-radius:5mm}
      .special small{color:${template.acentoColor};font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      .special h2{margin:2mm 0;font-size:24px}
      .grid{columns:2;column-gap:9mm}
      .menu-section{break-inside:avoid;margin:0 0 6mm;padding:5mm;background:${cardColor};border:1px solid rgba(0,0,0,.05);border-radius:4mm;backdrop-filter:blur(2px)}
      .menu-section h2{margin:0 0 3mm;color:${template.acentoColor};font-size:17px;text-transform:uppercase}
      .item{display:grid;grid-template-columns:1fr auto;gap:3mm;margin:0 0 2.5mm;font-size:12px}
      .item small{display:block;color:${template.textoColor};opacity:.62;font-size:9px;margin-top:1mm}
      .item b{white-space:nowrap}
      footer{margin-top:7mm;background:${cardColor};border-top:1px solid ${template.acentoColor};padding:4mm;text-align:center;font-size:10px;border-radius:3mm}
    </style></head><body><article class="sheet">${
      watermark ? `<img class="${backgroundClass}" src="${watermark}" alt=""/>` : ""
    }<div class="content"><header class="head"><div><div class="brand">${escapeHtml(
      restaurantName,
    )} · ${escapeHtml(profile.nombre)}</div><h1>${escapeHtml(template.titulo)}</h1>${
      template.subtitulo ? `<p class="sub">${escapeHtml(template.subtitulo)}</p>` : ""
    }</div>${logo ? `<img class="logo" src="${logo}" alt="Logo"/>` : ""}</header>${
      special?.nombre
        ? `<section class="special"><small>${escapeHtml(
            special.titulo || "Especial de hoy",
          )}</small><h2>${escapeHtml(special.nombre)}</h2>${
            special.descripcion ? `<p>${escapeHtml(special.descripcion)}</p>` : ""
          }${
            special.precio !== undefined
              ? `<b>${money.format(Number(special.precio))}</b>`
              : ""
          }</section>`
        : ""
    }<main class="grid">${sections}</main>${
      template.pie || daily?.contenido.mensaje
        ? `<footer>${escapeHtml(daily?.contenido.mensaje || template.pie)}</footer>`
        : ""
    }</div></article></body></html>`;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(frame);
    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) {
      frame.remove();
      toast.error("No fue posible preparar la impresión.");
      return;
    }
    printDocument.open();
    printDocument.write(html);
    printDocument.close();

    const images = Array.from(printDocument.images);
    Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    ).then(() => {
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        window.setTimeout(() => frame.remove(), 15000);
      }, 150);
    });
  };

  const downloadPng = async () => {
    if (!profile) return;
    const template = profile.plantilla;
    const itemCount = displaySections.reduce((sum, section) => sum + section.products.length, 0);
    const height = Math.max(1350, Math.min(3200, 780 + itemCount * 52));
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = template.fondoColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const customBackgroundUrl = assetUrl(template.fondoImagenUrl);
    const background = await loadImage(customBackgroundUrl);
    if (background) {
      ctx.save();
      ctx.globalAlpha = template.fondoImagenOpacidad;
      drawImageCover(ctx, background, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    ctx.fillStyle = template.encabezadoColor;
    ctx.fillRect(0, 0, 1080, 300);
    const logo = await loadImage(assetUrl(identity.logoUrl));
    if (logo) {
      const scale = Math.min(220 / logo.width, 140 / logo.height);
      ctx.drawImage(logo, 800, 70, logo.width * scale, logo.height * scale);
    }
    ctx.fillStyle = template.acentoColor;
    ctx.font = "700 24px Arial";
    ctx.fillText(`${restaurantName.toUpperCase()} · ${profile.nombre.toUpperCase()}`, 70, 82);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 58px Arial";
    ctx.fillText(template.titulo, 70, 158);
    ctx.font = "26px Arial";
    if (template.subtitulo) ctx.fillText(template.subtitulo, 70, 210);
    let y = 350;
    const special = daily?.contenido.especial;
    if (special?.nombre) {
      ctx.fillStyle = template.tarjetaColor;
      ctx.fillRect(60, y, 960, 185);
      ctx.fillStyle = template.acentoColor;
      ctx.font = "800 23px Arial";
      ctx.fillText((special.titulo || "Especial de hoy").toUpperCase(), 95, y + 45);
      ctx.fillStyle = template.textoColor;
      ctx.font = "900 40px Arial";
      ctx.fillText(special.nombre, 95, y + 95);
      if (special.descripcion) { ctx.font = "23px Arial"; ctx.fillText(special.descripcion.slice(0, 70), 95, y + 135); }
      if (special.precio !== undefined) { ctx.font = "900 30px Arial"; ctx.fillText(money.format(Number(special.precio)), 800, y + 58); }
      y += 225;
    }
    const columns = [70, 570];
    const colY = [y, y];
    displaySections.forEach((section, index) => {
      const col = index % 2;
      const x = columns[col];
      let sy = colY[col];
      const cardTop = sy - 26;
      const cardHeight = 62 + section.products.length * 38;
      ctx.fillStyle = canvasRgba(template.tarjetaColor, template.tarjetaOpacidad);
      ctx.fillRect(x - 18, cardTop, 458, cardHeight);
      ctx.fillStyle = template.acentoColor;
      ctx.font = "900 27px Arial";
      ctx.fillText(section.titulo.toUpperCase(), x, sy);
      sy += 40;
      for (const product of section.products) {
        ctx.fillStyle = template.textoColor;
        ctx.font = "700 22px Arial";
        ctx.fillText(product.nombre.slice(0, 28), x, sy);
        if (template.mostrarPrecios) {
          ctx.textAlign = "right";
          ctx.fillText(money.format(Number(product.precio)), x + 420, sy);
          ctx.textAlign = "left";
        }
        sy += 38;
      }
      sy += 34;
      colY[col] = sy;
    });
    const link = document.createElement("a");
    link.download = `${profile.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  if (loading) return <div className="card">Cargando cartas…</div>;
  if (!profile) return <div className="card"><p>No hay cartas configuradas.</p><button className="primary mt-4 w-auto px-5" onClick={() => void createProfile()}>Crear primera carta</button></div>;
  const template = profile.plantilla;
  const vars = {
    "--menu-bg": template.fondoColor,
    "--menu-card": template.tarjetaColor,
    "--menu-card-alpha": hexToRgba(template.tarjetaColor, template.tarjetaOpacidad),
    "--menu-text": template.textoColor,
    "--menu-accent": template.acentoColor,
    "--menu-head": template.encabezadoColor,
  } as CSSProperties;
  const logo = assetUrl(identity.logoUrl);
  const background = assetUrl(template.fondoImagenUrl);

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Menús por turno y canal</p><h1 className="page-title">Cartas del restaurante</h1><p className="mt-2 max-w-3xl text-sm text-denim/55">Crea cartas independientes para almuerzos, comidas rápidas, bar u otros conceptos sin duplicar sucursal, productos ni inventario.</p></div>
      <button className="secondary flex h-11 w-auto items-center gap-2 px-4" disabled={busy} onClick={() => void createProfile()}><Plus size={17}/> Nueva carta</button>
    </header>

    <section className="card flex flex-wrap items-end gap-3">
      <label className="min-w-64 flex-1 text-sm font-bold">Carta<select className="input mt-1" value={profile.id} onChange={(event) => setSelectedId(Number(event.target.value))}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.predeterminada ? " · principal" : ""}</option>)}</select></label>
      <label className="text-sm font-bold">Fecha<input className="input mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>
      <div className="flex flex-wrap gap-2">{(["HOY", "CONTENIDO", "DISENO", "ACTIVACION"] as const).map((item) => <button key={item} className={tab === item ? "primary h-11 w-auto px-4" : "secondary h-11 w-auto px-4"} onClick={() => setTab(item)}>{item === "HOY" ? "Hoy" : item === "CONTENIDO" ? "Productos" : item === "DISENO" ? "Diseño" : "Activación"}</button>)}</div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.9fr)]">
      <section className="card space-y-5">
        {tab === "HOY" && daily && <>
          <div><p className="eyebrow">Sólo lo que cambia hoy</p><h2 className="text-2xl font-black">Variables de {profile.nombre}</h2><p className="mt-1 text-sm text-denim/50">Si esta carta no usa especial diario, deja estos campos vacíos y la carta base seguirá funcionando.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">Título del bloque<input className="input mt-1" value={daily.contenido.especial?.titulo ?? "Especial de hoy"} onChange={(event) => setDaily((current) => current ? { ...current, contenido: { ...current.contenido, especial: { titulo: event.target.value, nombre: current.contenido.especial?.nombre ?? "", descripcion: current.contenido.especial?.descripcion ?? "", precio: current.contenido.especial?.precio } } } : current)}/></label>
            <label className="sm:col-span-2">Especial de hoy<input className="input mt-1" placeholder="Ej. Carne desmechada" value={daily.contenido.especial?.nombre ?? ""} onChange={(event) => setDaily((current) => current ? { ...current, contenido: { ...current.contenido, especial: { titulo: current.contenido.especial?.titulo ?? "Especial de hoy", nombre: event.target.value, descripcion: current.contenido.especial?.descripcion ?? "", precio: current.contenido.especial?.precio } } } : current)}/></label>
            <label className="sm:col-span-2">Descripción opcional<textarea className="input mt-1 min-h-24" value={daily.contenido.especial?.descripcion ?? ""} onChange={(event) => setDaily((current) => current ? { ...current, contenido: { ...current.contenido, especial: { titulo: current.contenido.especial?.titulo ?? "Especial de hoy", nombre: current.contenido.especial?.nombre ?? "", descripcion: event.target.value, precio: current.contenido.especial?.precio } } } : current)}/></label>
            <label>Precio especial opcional<input className="input mt-1" type="number" min="0" step="100" value={daily.contenido.especial?.precio ?? ""} onChange={(event) => setDaily((current) => current ? { ...current, contenido: { ...current.contenido, especial: { titulo: current.contenido.especial?.titulo ?? "Especial de hoy", nombre: current.contenido.especial?.nombre ?? "", descripcion: current.contenido.especial?.descripcion ?? "", precio: event.target.value ? Number(event.target.value) : undefined } } } : current)}/></label>
            <label className="flex items-end gap-3 pb-2 font-bold"><input type="checkbox" checked={daily.publicada} onChange={(event) => setDaily((current) => current ? { ...current, publicada: event.target.checked } : current)}/> Publicar variación de hoy</label>
            <label className="sm:col-span-2">Mensaje del día<textarea className="input mt-1 min-h-20" placeholder="Opcional" value={daily.contenido.mensaje} onChange={(event) => setDaily((current) => current ? { ...current, contenido: { ...current.contenido, mensaje: event.target.value } } : current)}/></label>
          </div>
          <button className="primary flex h-11 w-auto items-center gap-2 px-5" disabled={busy} onClick={() => void saveDaily()}><Save size={17}/> Guardar hoy</button>
        </>}

        {tab === "CONTENIDO" && <>
          <div><p className="eyebrow">Catálogo compartido</p><h2 className="text-2xl font-black">Productos de esta carta</h2><p className="mt-1 text-sm text-denim/50">Un mismo producto puede estar en varias cartas. El inventario sigue siendo uno solo.</p></div>
          <label>Nombre visible<input className="input mt-1" value={template.titulo} onChange={(event) => updateTemplate({ titulo: event.target.value })}/></label>
          <label>Subtítulo<input className="input mt-1" value={template.subtitulo} onChange={(event) => updateTemplate({ subtitulo: event.target.value })}/></label>
          <label>Pie de carta<textarea className="input mt-1 min-h-20" value={template.pie} onChange={(event) => updateTemplate({ pie: event.target.value })}/></label>
          <div className="space-y-3">{categories.map((category) => { const section = effectiveSections.find((item) => item.categoriaId === category.id); const selected = Boolean(section); const index = effectiveSections.findIndex((item) => item.categoriaId === category.id); return <div key={category.id} className="rounded-2xl border border-denim/10 p-4"><div className="flex items-center gap-3"><input type="checkbox" checked={selected} onChange={() => toggleCategory(category.id)}/><input className="input h-10 flex-1" disabled={!selected} value={section?.titulo ?? category.nombre} onChange={(event) => updateTemplate({ secciones: effectiveSections.map((item) => item.categoriaId === category.id ? { ...item, titulo: event.target.value } : item) })}/>{selected && <div className="flex"><button className="grid h-9 w-9 place-items-center" disabled={index <= 0} onClick={() => moveSection(index, -1)}><ChevronUp size={17}/></button><button className="grid h-9 w-9 place-items-center" disabled={index < 0 || index >= effectiveSections.length - 1} onClick={() => moveSection(index, 1)}><ChevronDown size={17}/></button></div>}</div>{selected && <div className="mt-3 grid gap-2 sm:grid-cols-2">{category.products.map((product) => <label key={product.id} className="flex items-center gap-2 rounded-xl bg-denim/5 px-3 py-2 text-sm"><input type="checkbox" checked={section?.productoIds.includes(product.id) ?? false} onChange={() => toggleProduct(category.id, product.id)}/><span className="min-w-0 flex-1 truncate">{product.nombre}</span>{template.mostrarPrecios && <small>{money.format(Number(product.precio))}</small>}</label>)}</div>}</div>; })}</div>
          <button className="primary flex h-11 w-auto items-center gap-2 px-5" disabled={busy} onClick={() => void saveProfile()}><Save size={17}/> Guardar productos</button>
        </>}

        {tab === "DISENO" && <>
          <div><p className="eyebrow">Identidad visual</p><h2 className="text-2xl font-black">Plantilla de {profile.nombre}</h2><p className="mt-1 text-sm text-denim/50">El logo pertenece a la marca y se comparte automáticamente entre todas las cartas. El fondo y la composición sí pueden cambiar por carta.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">{visualStyles.map((style) => <button key={style.id} className={`rounded-2xl border p-4 text-left ${template.estilo === style.id ? "border-marigold bg-marigold/10" : "border-denim/10"}`} onClick={() => updateTemplate({ estilo: style.id })}><LayoutTemplate size={20}/><b className="mt-2 block">{style.name}</b><small className="text-denim/50">{style.note}</small></button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([['fondoColor','Fondo'],['tarjetaColor','Tarjetas'],['textoColor','Texto'],['acentoColor','Acento'],['encabezadoColor','Encabezado']] as const).map(([key,label]) => <label key={key} className="rounded-xl border border-denim/10 p-3 text-sm font-bold">{label}<div className="mt-2 flex items-center gap-2"><input type="color" className="h-10 w-14" value={template[key]} onChange={(event) => updateTemplate({ [key]: event.target.value })}/><code>{template[key]}</code></div></label>)}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-denim/10 p-4">
              <span className="flex items-center gap-2 font-black"><ImageIcon size={17}/> Logo del restaurante</span>
              <input className="mt-3 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, "logoUrl"); }}/>
              {logo && <>
                <img src={logo} alt="Logo" className="mt-3 h-24 max-w-full object-contain"/>
                <button type="button" className="secondary mt-3 h-10 w-auto px-4" onClick={() => void removeLogo()}>Quitar logo</button>
              </>}
            </div>
            <div className="rounded-2xl border border-denim/10 p-4">
              <span className="flex items-center gap-2 font-black"><Sparkles size={17}/> Arte de fondo opcional</span>
              <input className="mt-3 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, "fondoImagenUrl"); }}/>
              {template.fondoImagenUrl && <>
                <img src={assetUrl(template.fondoImagenUrl)} alt="Fondo" className="mt-3 h-24 w-full rounded-xl object-cover"/>
                <button type="button" className="secondary mt-3 h-10 w-auto px-4" onClick={() => updateTemplate({ fondoImagenUrl: null })}>Quitar fondo</button>
              </>}
            </div>
            <label>Opacidad del fondo / marca de agua: {Math.round(template.fondoImagenOpacidad * 100)}%<input className="mt-2 w-full" type="range" min="0" max="0.75" step="0.01" value={template.fondoImagenOpacidad} onChange={(event) => updateTemplate({ fondoImagenOpacidad: Number(event.target.value) })}/></label>
            <label>Transparencia de tarjetas: {Math.round(template.tarjetaOpacidad * 100)}%<input className="mt-2 w-full" type="range" min="0.25" max="1" step="0.01" value={template.tarjetaOpacidad} onChange={(event) => updateTemplate({ tarjetaOpacidad: Number(event.target.value) })}/></label>
            <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={template.mostrarPrecios} onChange={(event) => updateTemplate({ mostrarPrecios: event.target.checked })}/> Mostrar precios</label>
            <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={template.mostrarImagenesProductos} onChange={(event) => updateTemplate({ mostrarImagenesProductos: event.target.checked })}/> Mostrar fotos de productos (opcional)</label>
          </div>
          <button className="primary flex h-11 w-auto items-center gap-2 px-5" disabled={busy} onClick={() => void saveProfile()}><Save size={17}/> Guardar diseño</button>
        </>}

        {tab === "ACTIVACION" && <>
          <div><p className="eyebrow">Cuándo se muestra</p><h2 className="text-2xl font-black">Turno y activación</h2><p className="mt-1 text-sm text-denim/50">No convierte la carta en otra sede. Sólo determina qué menú ve el cliente.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Nombre interno<input className="input mt-1" value={profile.nombre} onChange={(event) => updateProfile({ nombre: event.target.value })}/></label>
            <label>Descripción<input className="input mt-1" value={profile.descripcion ?? ""} onChange={(event) => updateProfile({ descripcion: event.target.value })}/></label>
            <label>Modo<select className="input mt-1" value={profile.modoActivacion} onChange={(event) => updateProfile({ modoActivacion: event.target.value as ActivationMode })}><option value="SIEMPRE">Siempre disponible</option><option value="HORARIO">Por horario</option><option value="MANUAL">Activación manual</option></select></label>
            <label className="flex items-end gap-3 pb-2 font-bold"><input type="checkbox" checked={profile.estado} onChange={(event) => updateProfile({ estado: event.target.checked })}/> Carta habilitada</label>
            {profile.modoActivacion === "HORARIO" && <><label>Desde<input className="input mt-1" type="time" value={profile.horaInicio ?? ""} onChange={(event) => updateProfile({ horaInicio: event.target.value })}/></label><label>Hasta<input className="input mt-1" type="time" value={profile.horaFin ?? ""} onChange={(event) => updateProfile({ horaFin: event.target.value })}/></label><div className="sm:col-span-2"><span className="text-sm font-bold">Días activos</span><div className="mt-2 flex flex-wrap gap-2">{week.map(([id,label]) => <button key={id} className={profile.diasSemana.includes(id) ? "primary h-10 w-10 rounded-full p-0" : "secondary h-10 w-10 rounded-full p-0"} onClick={() => updateProfile({ diasSemana: profile.diasSemana.includes(id) ? profile.diasSemana.filter((day) => day !== id) : [...profile.diasSemana, id].sort() })}>{label}</button>)}</div></div></>}
            {profile.modoActivacion === "MANUAL" && <label className="sm:col-span-2 flex items-center gap-3 rounded-2xl bg-denim/5 p-4 font-bold"><input type="checkbox" checked={profile.activoManual} onChange={(event) => updateProfile({ activoManual: event.target.checked })}/> Mostrar esta carta ahora</label>}
            <label className="sm:col-span-2 flex items-center gap-3"><input type="checkbox" checked={profile.predeterminada} onChange={(event) => updateProfile({ predeterminada: event.target.checked })}/><span><b>Carta de respaldo</b><small className="block text-denim/50">Se usa si ningún horario o modo manual queda activo.</small></span></label>
          </div>
          <button className="primary flex h-11 w-auto items-center gap-2 px-5" disabled={busy} onClick={() => void saveProfile()}><Settings2 size={17}/> Guardar activación</button>
        </>}

        <div className="flex flex-wrap gap-2 border-t border-denim/10 pt-5"><button className="secondary flex h-11 w-auto items-center gap-2 px-4" onClick={printMenu}><Printer size={17}/> Imprimir / PDF</button><button className="secondary flex h-11 w-auto items-center gap-2 px-4" onClick={() => void downloadPng()}><Download size={17}/> Descargar PNG</button></div>
      </section>

      <aside className="self-start xl:sticky xl:top-24">
        <article style={vars} className="relative min-h-[760px] overflow-hidden rounded-[2rem] bg-[var(--menu-bg)] p-6 text-[var(--menu-text)] shadow-sm">
          {background && <img src={background} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: template.fondoImagenOpacidad }}/>}<div className="relative z-10">
            <header className="rounded-[1.5rem] bg-[var(--menu-head)] p-6 text-white"><div className="flex items-start justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[var(--menu-accent)]">{restaurantName}</p><h2 className="mt-3 text-4xl font-black leading-none">{template.titulo}</h2>{template.subtitulo && <p className="mt-3 text-sm text-white/65">{template.subtitulo}</p>}</div>{logo && <img src={logo} alt="Logo" className="max-h-24 max-w-32 object-contain"/>}</div></header>
            {daily?.contenido.especial?.nombre && <section className="mt-5 rounded-[1.5rem] bg-[var(--menu-card-alpha)] p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--menu-accent)]">{daily.contenido.especial.titulo || "Especial de hoy"}</p><div className="mt-2 flex justify-between gap-4"><div><h3 className="text-2xl font-black">{daily.contenido.especial.nombre}</h3>{daily.contenido.especial.descripcion && <p className="mt-1 text-sm opacity-65">{daily.contenido.especial.descripcion}</p>}</div>{daily.contenido.especial.precio !== undefined && <b>{money.format(Number(daily.contenido.especial.precio))}</b>}</div></section>}
            <div className="mt-5 columns-1 gap-4 sm:columns-2">{displaySections.map((section) => <section key={section.categoriaId} className="mb-4 break-inside-avoid rounded-[1.35rem] bg-[var(--menu-card-alpha)] p-5"><div className="mb-3 h-1 w-10 rounded-full bg-[var(--menu-accent)]"/><h3 className="mb-4 text-lg font-black uppercase tracking-[.06em] text-[var(--menu-accent)]">{section.titulo}</h3><div className="space-y-3">{section.products.map((product) => <div key={product.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">{template.mostrarImagenesProductos && product.imagenPrincipal ? <div className="flex gap-2"><img src={productImageUrl(product.imagenPrincipal, "thumb")} alt="" className="h-11 w-11 rounded-lg object-cover"/><span className="font-bold">{product.nombre}</span></div> : <span className="font-bold">{product.nombre}</span>}{template.mostrarPrecios && <b>{money.format(Number(product.precio))}</b>}</div>)}</div></section>)}</div>
            {(daily?.contenido.mensaje || template.pie) && <footer className="mt-5 border-t border-[var(--menu-accent)]/30 pt-4 text-center text-xs opacity-60">{daily?.contenido.mensaje || template.pie}</footer>}
          </div>
        </article>
        <p className="mt-3 flex items-center gap-2 text-xs text-denim/45"><CalendarDays size={14}/> Esta composición alimenta QR, PNG y PDF.</p>
      </aside>
    </div>
  </div>;
}

function normalizeProfile(profile: MenuProfile): MenuProfile {
  const template = profile.plantilla ?? defaultTemplate(profile.nombre);
  return {
    ...profile,
    diasSemana: Array.isArray(profile.diasSemana) ? profile.diasSemana : [1, 2, 3, 4, 5, 6, 7],
    plantilla: { ...defaultTemplate(profile.nombre), ...template, secciones: Array.isArray(template.secciones) ? template.secciones : [] },
  };
}

async function loadImage(src?: string) {
  if (!src) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
