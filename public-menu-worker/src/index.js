const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "sigr-menu-publico" });
    }
    if (request.method === "POST" && url.pathname === "/admin/publish") {
      return publish(request, env);
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/admin/publish/")) {
      return unpublish(request, env, url.pathname.slice("/admin/publish/".length));
    }
    const match = url.pathname.match(/^\/menu\/([^/]+)\/([^/]+)\/?$/);
    if (request.method === "GET" && match) {
      return menu(env, match[1], match[2]);
    }
    return new Response("Not found", { status: 404 });
  },
};

async function publish(request, env) {
  const expected = env.PUBLISH_TOKEN;
  const supplied = request.headers.get("authorization") || "";
  if (!expected || supplied !== `Bearer ${expected}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!UUID_RE.test(body?.branchId || "") || !body?.snapshot || typeof body.snapshot !== "object") {
    return json({ error: "Publicación inválida" }, 400);
  }
  const value = JSON.stringify({
    publishedAt: body.publishedAt || new Date().toISOString(),
    versionHash: body.versionHash || null,
    snapshot: body.snapshot,
  });
  await env.MENU_SNAPSHOTS.put(`branch:${body.branchId}`, value);
  return json({ ok: true, branchId: body.branchId, bytes: value.length });
}

async function unpublish(request, env, branchId) {
  const expected = env.PUBLISH_TOKEN;
  const supplied = request.headers.get("authorization") || "";
  if (!expected || supplied !== `Bearer ${expected}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!UUID_RE.test(branchId || "")) {
    return json({ error: "Sucursal inválida" }, 400);
  }
  await env.MENU_SNAPSHOTS.delete(`branch:${branchId}`);
  return json({ ok: true, branchId, unpublished: true });
}

async function menu(env, branchId, tableId) {
  if (!UUID_RE.test(branchId) || !UUID_RE.test(tableId)) {
    return html(errorPage("Enlace QR inválido"), 404);
  }
  const raw = await env.MENU_SNAPSHOTS.get(`branch:${branchId}`);
  if (!raw) return html(errorPage("El menú todavía no ha sido publicado"), 404);
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return html(errorPage("El menú publicado no pudo leerse"), 500);
  }
  const snapshot = record.snapshot || {};
  const mesa = (snapshot.mesas || []).find((item) => item.globalId === tableId);
  if (!mesa) return html(errorPage("La mesa no pertenece a esta carta pública"), 404);
  const menu = { ...snapshot, mesa: { numero: mesa.numero } };
  delete menu.mesas;
  return html(appPage(menu, record.publishedAt), 200, {
    "cache-control": "public, max-age=30, stale-while-revalidate=86400",
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function html(value, status = 200, extra = {}) {
  return new Response(value, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self' data:; img-src 'self' data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      ...extra,
    },
  });
}

function errorPage(message) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SIGR · Menú</title><style>body{margin:0;background:#f3ede1;color:#14283b;font:16px system-ui;display:grid;min-height:100vh;place-items:center;padding:24px}.c{max-width:460px;background:white;border-radius:28px;padding:32px;text-align:center;box-shadow:0 12px 40px #0001}h1{margin:0 0 12px;font-size:28px}p{color:#65717c}</style><div class="c"><h1>Menú no disponible</h1><p>${escapeHtml(message)}</p></div></html>`;
}

function appPage(menu, publishedAt) {
  const payload = JSON.stringify({ menu, publishedAt }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#14283b"><title>${escapeHtml(menu.restaurante || "SIGR")} · Menú</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}button{font:inherit}.hero{position:relative;overflow:hidden;background:var(--dark);color:white;padding:28px 20px 36px}.hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,var(--dark) 15%,color-mix(in srgb,var(--dark) 90%,transparent),transparent)}.wrap{position:relative;max-width:920px;margin:auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand-name{font-size:12px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}.logo{max-height:76px;max-width:140px;object-fit:contain}.hero-row{margin-top:20px;display:flex;align-items:end;justify-content:space-between;gap:18px}.title{margin:0;font-size:clamp(36px,8vw,58px);line-height:.95}.subtitle{margin:12px 0 0;color:#ffffffb3;max-width:580px;font-size:14px}.table-pill{flex:none;border:1px solid #ffffff26;background:#ffffff12;padding:10px 16px;border-radius:999px;font-weight:800}.branch{margin:12px 0 0;color:#ffffff80;font-size:12px}.content{max-width:920px;margin:auto;padding:22px 16px 46px;display:grid;gap:24px}.profiles{display:flex;flex-wrap:wrap;gap:8px;padding:12px;border-radius:20px;background:var(--cardA)}.profile{border:1px solid #00000018;background:transparent;border-radius:999px;padding:10px 15px;font-weight:850;color:var(--text)}.profile.active{background:var(--dark);color:white;border-color:transparent}.notice,.special,.category{background:var(--cardA);border-radius:26px}.notice{padding:16px 18px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)}.notice b{display:block;color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:.15em}.notice p{margin:4px 0 0;color:var(--muted);font-size:14px}.special{padding:24px;border-left:7px solid var(--accent)}.special-kicker{color:var(--accent);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.16em}.special h2{margin:6px 0;font-size:30px}.special p{margin:0;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.category{padding:20px}.cat-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.bar{height:4px;width:36px;border-radius:4px;background:var(--accent)}.category h2{margin:0;font-size:19px;text-transform:uppercase;letter-spacing:.05em}.product{display:grid;grid-template-columns:1fr auto;gap:16px;padding:14px 0;border-top:1px solid #0000000d}.product:first-of-type{border-top:0}.product-main{display:flex;gap:12px;min-width:0}.product img{width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none}.product h3{margin:0;font-size:15px}.product p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.5}.price{font-weight:900;font-size:14px;white-space:nowrap}.footer{text-align:center;color:var(--muted);font-size:12px;padding:4px 0}.published{text-align:center;color:var(--muted);font-size:11px}.empty{grid-column:1/-1;padding:28px;text-align:center;color:var(--muted);background:var(--cardA);border-radius:24px}@media(max-width:680px){.grid{grid-template-columns:1fr}.hero-row{align-items:flex-start;flex-direction:column}.table-pill{align-self:flex-start}.content{padding:18px 12px 36px}.category{padding:18px}}
</style></head><body><div id="app"></div><script>window.__SIGR__=${payload};
(function(){const state=window.__SIGR__;const menu=state.menu;const profiles=menu.perfilesCarta||[];let selected=profiles[0]?.id||null;const money=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});const esc=(v)=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));const rgba=(hex,a)=>{const v=(hex||'#ffffff').replace('#','');const n=parseInt(v,16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'};function active(){return profiles.find(p=>p.id===selected)||profiles[0]||null}function render(){const p=active();const t=p?.plantilla||menu.plantillaCarta||{};const d=p?.cartaDia||menu.cartaDia||null;const preset=t.estilo==='CONTEMPORANEA'?{bg:'#f6f3ed',card:'#fff',dark:'#182329',accent:'#d85f3d',muted:'#667078'}:t.estilo==='EJECUTIVA'?{bg:'#fff8e9',card:'#fffdf7',dark:'#18352d',accent:'#e3a72f',muted:'#617069'}:{bg:'#f3ede1',card:'#fffdf8',dark:'#14283b',accent:'#b98a2d',muted:'#65717c'};const bg=t.fondoColor||preset.bg,card=t.tarjetaColor||preset.card,dark=t.encabezadoColor||preset.dark,accent=t.acentoColor||preset.accent,text=t.textoColor||dark,muted=preset.muted;document.documentElement.style.cssText='--bg:'+bg+';--card:'+card+';--cardA:'+rgba(card,t.tarjetaOpacidad??.82)+';--dark:'+dark+';--accent:'+accent+';--text:'+text+';--muted:'+muted;const configured=t.secciones||[];let cats;if(!configured.length){cats=menu.categorias||[]}else{cats=configured.map(s=>{const c=(menu.categorias||[]).find(x=>x.id===s.categoriaId);if(!c)return null;const ids=new Set(s.productoIds||[]);return{id:c.id,nombre:s.titulo||c.nombre,productos:(c.productos||[]).filter(x=>ids.has(x.id))}}).filter(c=>c&&c.productos.length)}const special=d?.contenido?.especial;const logo=menu.identidadCarta?.logoUrl;const background=t.fondoImagenUrl;const showPrices=t.mostrarPrecios!==false,showImages=t.mostrarImagenesProductos===true;document.getElementById('app').innerHTML='<header class="hero">'+(background?'<img class="hero-bg" style="opacity:'+Math.min(.32,(t.fondoImagenOpacidad??.08)*1.8)+'" src="'+background+'" alt="">':'')+'<div class="hero-shade"></div><div class="wrap"><div class="brand"><span class="brand-name">'+esc(menu.restaurante)+'</span>'+(logo?'<img class="logo" src="'+logo+'" alt="Logo">':'')+'</div><div class="hero-row"><div><h1 class="title">'+esc(t.titulo||'Menú')+'</h1>'+(t.subtitulo?'<p class="subtitle">'+esc(t.subtitulo)+'</p>':'')+'</div><span class="table-pill">Mesa '+esc(menu.mesa?.numero)+'</span></div><p class="branch">'+esc(menu.sucursal)+'</p></div></header><main class="content">'+(profiles.length>1?'<div class="profiles">'+profiles.map(x=>'<button class="profile '+(x.id===p?.id?'active':'')+'" data-profile="'+x.id+'">'+esc(x.nombre)+'</button>').join('')+'</div>':'')+(special?.nombre?'<section class="special"><span class="special-kicker">'+esc(special.titulo||'Especial de hoy')+'</span><h2>'+esc(special.nombre)+'</h2>'+(special.descripcion?'<p>'+esc(special.descripcion)+'</p>':'')+(special.precio!==undefined?'<div class="price">'+money.format(Number(special.precio))+'</div>':'')+'</section>':'')+'<section class="notice"><b>Solo consulta</b><p>Para realizar tu pedido, comunícate con tu mesero.</p></section><div class="grid">'+(cats.length?cats.map(c=>'<section class="category"><div class="cat-head"><span class="bar"></span><h2>'+esc(c.nombre)+'</h2></div>'+c.productos.map(x=>'<article class="product"><div class="product-main">'+(showImages&&x.imagenPublica?'<img src="'+x.imagenPublica+'" alt="">':'')+'<div><h3>'+esc(x.nombre)+'</h3>'+(x.descripcion?'<p>'+esc(x.descripcion)+'</p>':'')+'</div></div>'+(showPrices?'<span class="price">'+money.format(Number(x.precio))+'</span>':'')+'</article>').join('')+'</section>').join(''):'<div class="empty">No hay productos publicados en esta carta.</div>')+'</div>'+((d?.contenido?.mensaje||t.pie)?'<div class="footer">'+esc(d?.contenido?.mensaje||t.pie)+'</div>':'')+'<div class="published">Última publicación: '+new Date(state.publishedAt).toLocaleString('es-CO')+'</div></main>';document.querySelectorAll('[data-profile]').forEach(b=>b.addEventListener('click',()=>{selected=Number(b.dataset.profile);render()}))}render()})();</script></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}
