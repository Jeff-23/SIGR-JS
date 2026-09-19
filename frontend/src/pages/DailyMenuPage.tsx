import {
  CalendarDays,
  Download,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";

type DailyGroup = { titulo: string; opciones: string[] };
type DailySpecial = {
  titulo: string;
  nombre: string;
  descripcion: string;
  precio?: number;
};
type DailyContent = {
  titulo: string;
  subtitulo: string;
  precioBase?: number;
  grupos: DailyGroup[];
  especial?: DailySpecial | null;
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

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyMenu(branchId: number, fecha: string): DailyMenu {
  return {
    id: null,
    sucursalId: branchId,
    fecha,
    publicada: false,
    actualizadoEn: null,
    contenido: {
      titulo: "Almuerzo del día",
      subtitulo: "",
      grupos: [
        { titulo: "Proteínas disponibles", opciones: [] },
        { titulo: "Acompañamientos", opciones: [] },
      ],
      especial: {
        titulo: "Especial de hoy",
        nombre: "",
        descripcion: "",
      },
      mensaje: "",
    },
  };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function DailyMenuPage() {
  const { branchId, session } = useApp();
  const [date, setDate] = useState(todayKey());
  const [menu, setMenu] = useState<DailyMenu>(() => emptyMenu(branchId ?? 0, date));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) return;
    let active = true;

    if (session?.demo) {
      const timer = window.setTimeout(() => {
        if (!active) return;
        setMenu(emptyMenu(branchId, date));
        setLoading(false);
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    const loadingTimer = window.setTimeout(() => {
      if (active) setLoading(true);
    }, 0);

    api
      .get<DailyMenu>(`/cartas-dia/${branchId}/${date}`)
      .then(({ data }) => {
        if (active) setMenu(data);
      })
      .catch((error) => {
        if (active) toast.error(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [branchId, date, session?.demo]);

  const restaurantName =
    session?.user.restauranteNombre?.trim() || "Tu restaurante";
  const special = menu.contenido.especial;
  const visibleGroups = useMemo(
    () =>
      menu.contenido.grupos
        .map((group) => ({
          ...group,
          opciones: group.opciones.filter((item) => item.trim()),
        }))
        .filter((group) => group.titulo.trim() && group.opciones.length),
    [menu.contenido.grupos],
  );

  const patchContent = (patch: Partial<DailyContent>) =>
    setMenu((current) => ({
      ...current,
      contenido: { ...current.contenido, ...patch },
    }));

  const save = async () => {
    if (session?.demo) {
      toast.success("Vista demo actualizada.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.put<DailyMenu>(
        `/cartas-dia/${branchId}/${date}`,
        {
          publicada: menu.publicada,
          contenido: menu.contenido,
        },
      );
      setMenu(data);
      toast.success(
        data.publicada
          ? "Carta del día guardada y publicada."
          : "Borrador de carta guardado.",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const addGroup = () =>
    patchContent({
      grupos: [
        ...menu.contenido.grupos,
        { titulo: "Nueva sección", opciones: [""] },
      ],
    });

  const updateGroup = (index: number, group: DailyGroup) =>
    patchContent({
      grupos: menu.contenido.grupos.map((item, current) =>
        current === index ? group : item,
      ),
    });

  const removeGroup = (index: number) =>
    patchContent({
      grupos: menu.contenido.grupos.filter((_, current) => current !== index),
    });

  const printMenu = () => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      toast.error("El navegador bloqueó la ventana de impresión.");
      return;
    }
    const groups = visibleGroups
      .map(
        (group) => `
          <section>
            <h3>${escapeHtml(group.titulo)}</h3>
            <p>${group.opciones.map(escapeHtml).join(" · ")}</p>
          </section>`,
      )
      .join("");
    const specialBlock = special?.nombre?.trim()
      ? `<section class="special"><small>${escapeHtml(special.titulo || "Especial de hoy")}</small><h2>${escapeHtml(special.nombre)}</h2>${special.descripcion ? `<p>${escapeHtml(special.descripcion)}</p>` : ""}${special.precio !== undefined ? `<strong>${money.format(Number(special.precio))}</strong>` : ""}</section>`
      : "";
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Carta ${date}</title><style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#15263a;background:#f4f0e8}
      .sheet{min-height:270mm;padding:20mm 16mm;background:#fff;border:1px solid #e6dfd2}header{border-bottom:3px solid #d7aa45;padding-bottom:18px}
      .brand{font-size:13px;letter-spacing:.18em;text-transform:uppercase;font-weight:800;color:#9b7624}.date{float:right;color:#667}
      h1{font-size:42px;margin:10px 0 4px}.subtitle{font-size:17px;color:#667}.price{font-size:30px;font-weight:900;margin-top:14px}
      main{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px}section{padding:18px;border:1px solid #ece6dc;border-radius:16px}
      section h3{margin:0 0 10px;font-size:18px}section p{margin:0;line-height:1.6;color:#4f5b66}.special{grid-column:1/-1;background:#15263a;color:white;border:0}
      .special small{color:#e9c66f;text-transform:uppercase;letter-spacing:.16em;font-weight:800}.special h2{font-size:30px;margin:8px 0}.special p{color:#d9e0e7}.special strong{display:block;margin-top:12px;font-size:22px}
      footer{margin-top:28px;text-align:center;color:#667;font-style:italic}@media print{body{background:#fff}.sheet{border:0}}
    </style></head><body><article class="sheet"><header><span class="brand">${escapeHtml(restaurantName)}</span><span class="date">${escapeHtml(date)}</span><h1>${escapeHtml(menu.contenido.titulo)}</h1>${menu.contenido.subtitulo ? `<div class="subtitle">${escapeHtml(menu.contenido.subtitulo)}</div>` : ""}${menu.contenido.precioBase !== undefined ? `<div class="price">${money.format(Number(menu.contenido.precioBase))}</div>` : ""}</header>${specialBlock}<main>${groups}</main>${menu.contenido.mensaje ? `<footer>${escapeHtml(menu.contenido.mensaje)}</footer>` : ""}</article><script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };

  const downloadPng = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#f4f0e8";
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(54, 54, 972, 1242);

    ctx.fillStyle = "#b3882e";
    ctx.font = "700 26px Arial";
    ctx.fillText(restaurantName.toUpperCase(), 100, 125);

    ctx.fillStyle = "#15263a";
    ctx.font = "900 60px Arial";
    let y = 210;
    for (const line of wrapText(ctx, menu.contenido.titulo, 820)) {
      ctx.fillText(line, 100, y);
      y += 70;
    }

    if (menu.contenido.subtitulo) {
      ctx.fillStyle = "#66727e";
      ctx.font = "32px Arial";
      for (const line of wrapText(ctx, menu.contenido.subtitulo, 820)) {
        ctx.fillText(line, 100, y);
        y += 42;
      }
    }
    if (menu.contenido.precioBase !== undefined) {
      ctx.fillStyle = "#15263a";
      ctx.font = "900 48px Arial";
      ctx.fillText(money.format(Number(menu.contenido.precioBase)), 100, y + 20);
      y += 80;
    }

    if (special?.nombre?.trim()) {
      ctx.fillStyle = "#15263a";
      ctx.fillRect(100, y, 880, 210);
      ctx.fillStyle = "#e9c66f";
      ctx.font = "700 22px Arial";
      ctx.fillText((special.titulo || "Especial de hoy").toUpperCase(), 135, y + 48);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 38px Arial";
      ctx.fillText(special.nombre, 135, y + 98);
      if (special.descripcion) {
        ctx.font = "25px Arial";
        const lines = wrapText(ctx, special.descripcion, 760).slice(0, 2);
        lines.forEach((line, index) => ctx.fillText(line, 135, y + 140 + index * 31));
      }
      if (special.precio !== undefined) {
        ctx.font = "900 30px Arial";
        ctx.fillText(money.format(Number(special.precio)), 760, y + 48);
      }
      y += 245;
    }

    const columns = 2;
    const colWidth = 410;
    visibleGroups.slice(0, 6).forEach((group, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = 100 + col * 460;
      const top = y + row * 185;
      ctx.fillStyle = "#15263a";
      ctx.font = "800 28px Arial";
      ctx.fillText(group.titulo, x, top + 30);
      ctx.fillStyle = "#596774";
      ctx.font = "25px Arial";
      const text = group.opciones.join(" · ");
      wrapText(ctx, text, colWidth)
        .slice(0, 4)
        .forEach((line, lineIndex) =>
          ctx.fillText(line, x, top + 70 + lineIndex * 31),
        );
    });

    if (menu.contenido.mensaje) {
      ctx.fillStyle = "#7a6750";
      ctx.font = "italic 25px Arial";
      const lines = wrapText(ctx, menu.contenido.mensaje, 820).slice(0, 3);
      lines.forEach((line, index) => ctx.fillText(line, 100, 1240 + index * 30));
    }

    const link = document.createElement("a");
    link.download = `carta-${date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  if (loading) {
    return <div className="card">Cargando carta del día…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Publicación diaria</p>
          <h1 className="page-title">Carta del día</h1>
          <p className="mt-2 max-w-2xl text-sm text-denim/55">
            Cambia el especial, proteínas y secciones cada día sin modificar el
            catálogo maestro.
          </p>
        </div>
        <label className="text-sm font-bold">
          Fecha
          <input
            className="input mt-1"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,.8fr)]">
        <section className="card space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              Título de la carta
              <input
                className="input mt-1"
                value={menu.contenido.titulo}
                onChange={(event) =>
                  patchContent({ titulo: event.target.value })
                }
              />
            </label>
            <label className="sm:col-span-2">
              Subtítulo / descripción
              <input
                className="input mt-1"
                placeholder="Ej. Almuerzos frescos preparados hoy"
                value={menu.contenido.subtitulo}
                onChange={(event) =>
                  patchContent({ subtitulo: event.target.value })
                }
              />
            </label>
            <label>
              Precio base
              <input
                className="input mt-1"
                type="number"
                min="0"
                step="100"
                placeholder="18000"
                value={menu.contenido.precioBase ?? ""}
                onChange={(event) =>
                  patchContent({
                    precioBase: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label className="flex items-end gap-3 pb-2 font-bold">
              <input
                type="checkbox"
                checked={menu.publicada}
                onChange={(event) =>
                  setMenu((current) => ({
                    ...current,
                    publicada: event.target.checked,
                  }))
                }
              />
              Publicar esta carta
            </label>
          </div>

          <div className="rounded-3xl border border-marigold/35 bg-marigold/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Variable cada día</p>
                <h2 className="text-xl font-black">Especial de hoy</h2>
              </div>
              {special?.nombre ? (
                <button
                  className="secondary h-10 w-auto px-4"
                  onClick={() =>
                    patchContent({
                      especial: {
                        titulo: "Especial de hoy",
                        nombre: "",
                        descripcion: "",
                      },
                    })
                  }
                >
                  Limpiar especial
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                Encabezado
                <input
                  className="input mt-1"
                  value={special?.titulo ?? "Especial de hoy"}
                  onChange={(event) =>
                    patchContent({
                      especial: {
                        titulo: event.target.value,
                        nombre: special?.nombre ?? "",
                        descripcion: special?.descripcion ?? "",
                        precio: special?.precio,
                      },
                    })
                  }
                />
              </label>
              <label>
                Nombre
                <input
                  className="input mt-1"
                  placeholder="Ej. Carne desmechada"
                  value={special?.nombre ?? ""}
                  onChange={(event) =>
                    patchContent({
                      especial: {
                        titulo: special?.titulo ?? "Especial de hoy",
                        nombre: event.target.value,
                        descripcion: special?.descripcion ?? "",
                        precio: special?.precio,
                      },
                    })
                  }
                />
              </label>
              <label className="sm:col-span-2">
                Descripción opcional
                <textarea
                  className="input mt-1 min-h-24"
                  placeholder="Preparación, salsa, presentación…"
                  value={special?.descripcion ?? ""}
                  onChange={(event) =>
                    patchContent({
                      especial: {
                        titulo: special?.titulo ?? "Especial de hoy",
                        nombre: special?.nombre ?? "",
                        descripcion: event.target.value,
                        precio: special?.precio,
                      },
                    })
                  }
                />
              </label>
              <label>
                Precio especial opcional
                <input
                  className="input mt-1"
                  type="number"
                  min="0"
                  step="100"
                  value={special?.precio ?? ""}
                  onChange={(event) =>
                    patchContent({
                      especial: {
                        titulo: special?.titulo ?? "Especial de hoy",
                        nombre: special?.nombre ?? "",
                        descripcion: special?.descripcion ?? "",
                        precio: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Secciones libres</p>
                <h2 className="text-xl font-black">Opciones de hoy</h2>
              </div>
              <button
                className="secondary flex h-10 w-auto items-center gap-2 px-4"
                onClick={addGroup}
              >
                <Plus size={16} /> Sección
              </button>
            </div>

            {menu.contenido.grupos.map((group, groupIndex) => (
              <div
                key={`${groupIndex}-${group.titulo}`}
                className="rounded-2xl border border-denim/10 p-4"
              >
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={group.titulo}
                    onChange={(event) =>
                      updateGroup(groupIndex, {
                        ...group,
                        titulo: event.target.value,
                      })
                    }
                  />
                  <button
                    aria-label="Eliminar sección"
                    className="grid h-11 w-11 place-items-center rounded-xl border border-red-200 text-red-700"
                    onClick={() => removeGroup(groupIndex)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {group.opciones.map((option, optionIndex) => (
                    <div
                      className="flex gap-2"
                      key={`${groupIndex}-${optionIndex}`}
                    >
                      <input
                        className="input flex-1"
                        placeholder="Escribe una opción"
                        value={option}
                        onChange={(event) =>
                          updateGroup(groupIndex, {
                            ...group,
                            opciones: group.opciones.map((item, current) =>
                              current === optionIndex
                                ? event.target.value
                                : item,
                            ),
                          })
                        }
                      />
                      <button
                        aria-label="Eliminar opción"
                        className="grid h-11 w-11 place-items-center rounded-xl border border-denim/10"
                        onClick={() =>
                          updateGroup(groupIndex, {
                            ...group,
                            opciones: group.opciones.filter(
                              (_, current) => current !== optionIndex,
                            ),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-sm font-black text-steel"
                    onClick={() =>
                      updateGroup(groupIndex, {
                        ...group,
                        opciones: [...group.opciones, ""],
                      })
                    }
                  >
                    + Agregar opción
                  </button>
                </div>
              </div>
            ))}
          </div>

          <label className="block">
            Mensaje final opcional
            <textarea
              className="input mt-1 min-h-24"
              placeholder="Ej. Sujeto a disponibilidad · Domicilios al..."
              value={menu.contenido.mensaje}
              onChange={(event) =>
                patchContent({ mensaje: event.target.value })
              }
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              className="primary flex h-11 w-auto items-center gap-2 px-5"
              disabled={busy}
              onClick={() => void save()}
            >
              <Save size={17} /> Guardar carta
            </button>
            <button
              className="secondary flex h-11 w-auto items-center gap-2 px-5"
              onClick={printMenu}
            >
              <Printer size={17} /> Imprimir / PDF
            </button>
            <button
              className="secondary flex h-11 w-auto items-center gap-2 px-5"
              onClick={downloadPng}
            >
              <Download size={17} /> Descargar PNG
            </button>
          </div>
        </section>

        <aside className="self-start xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-[2rem] border border-denim/10 bg-[#f4f0e8] p-4">
            <article className="min-h-[660px] rounded-[1.6rem] bg-white p-7 shadow-sm">
              <div className="border-b-2 border-marigold pb-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-[.18em] text-[#9b7624]">
                    {restaurantName}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-denim/45">
                    <CalendarDays size={14} /> {date}
                  </span>
                </div>
                <h2 className="mt-4 text-4xl font-black leading-tight">
                  {menu.contenido.titulo || "Carta del día"}
                </h2>
                {menu.contenido.subtitulo && (
                  <p className="mt-2 text-sm text-denim/55">
                    {menu.contenido.subtitulo}
                  </p>
                )}
                {menu.contenido.precioBase !== undefined && (
                  <strong className="mt-4 block text-3xl">
                    {money.format(Number(menu.contenido.precioBase))}
                  </strong>
                )}
              </div>

              {special?.nombre?.trim() && (
                <section className="mt-5 rounded-2xl bg-steel p-5 text-white">
                  <p className="text-xs font-black uppercase tracking-[.16em] text-marigold">
                    {special.titulo || "Especial de hoy"}
                  </p>
                  <h3 className="mt-1 text-2xl font-black">{special.nombre}</h3>
                  {special.descripcion && (
                    <p className="mt-2 text-sm text-white/70">
                      {special.descripcion}
                    </p>
                  )}
                  {special.precio !== undefined && (
                    <strong className="mt-3 block text-xl">
                      {money.format(Number(special.precio))}
                    </strong>
                  )}
                </section>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {visibleGroups.map((group) => (
                  <section
                    key={group.titulo}
                    className="rounded-2xl border border-denim/10 p-4"
                  >
                    <h3 className="font-black">{group.titulo}</h3>
                    <p className="mt-2 text-sm leading-6 text-denim/60">
                      {group.opciones.join(" · ")}
                    </p>
                  </section>
                ))}
              </div>

              {menu.contenido.mensaje && (
                <p className="mt-6 text-center text-sm italic text-denim/50">
                  {menu.contenido.mensaje}
                </p>
              )}
            </article>
          </div>
          <p className="mt-3 text-xs text-denim/45">
            Esta misma información alimenta el menú QR cuando la carta está
            publicada.
          </p>
        </aside>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
