import 'dotenv/config';
import { readFile, readdir, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;
const VARIANTES = { thumb: 240, medium: 800, large: 1400 };
let sharpFactory;
async function getSharp() {
  if (!sharpFactory) sharpFactory = (await import('sharp')).default;
  return sharpFactory;
}

const args = argumentos(process.argv.slice(2));
if (args.has('--help')) {
  ayuda();
  process.exit(0);
}

const aplicar = args.has('--apply');
const csvPath = rutaObligatoria('--csv');
const restauranteId = enteroObligatorio('--restaurante-id');
const sucursalId = enteroObligatorio('--sucursal-id');
const imagesDir = args.get('--images') ? ruta(args.get('--images')) : null;
const reportPath = args.get('--report') ? ruta(args.get('--report')) : null;
const strictImages = args.has('--strict-images');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL es obligatoria.');

const mediaRoot = resolverMedia();
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const reporte = {
  modo: aplicar ? 'APPLY' : 'DRY_RUN',
  restauranteId,
  sucursalId,
  csv: csvPath,
  imagesDir,
  mediaRoot,
  filas: 0,
  creados: 0,
  actualizados: 0,
  categoriasCreadas: 0,
  imagenesProcesadas: 0,
  imagenesSinCambios: 0,
  imagenesOmitidas: 0,
  advertencias: [],
  errores: [],
  productos: [],
  iniciadoEn: new Date().toISOString(),
};

try {
  const sucursal = await prisma.sucursal.findFirst({
    where: { id: sucursalId, restauranteId, estado: true, restaurante: { estado: true } },
    select: { id: true, nombre: true, restaurante: { select: { nombre: true } } },
  });
  if (!sucursal) throw new Error('La sucursal no pertenece al restaurante o está inactiva.');

  const csv = await readFile(csvPath, 'utf8');
  const filas = parseCsv(csv);
  const normalizadas = normalizarFilas(filas);
  reporte.filas = normalizadas.length;

  await validarFilas(normalizadas, sucursalId, imagesDir);
  if (reporte.errores.length) {
    await finalizar(2);
  }

  const categorias = await cargarCategorias(sucursalId);
  const estaciones = await cargarEstaciones(sucursalId);

  for (let index = 0; index < normalizadas.length; index++) {
    const fila = normalizadas[index];
    const resultado = await importarFila(fila, index + 2, categorias, estaciones);
    reporte.productos.push(resultado);
  }

  await finalizar(0);
} catch (error) {
  reporte.errores.push(error instanceof Error ? error.message : String(error));
  await finalizar(1);
}

async function importarFila(fila, numeroFila, categorias, estaciones) {
  const claveCategoria = clave(fila.categoria);
  let categoria = categorias.get(claveCategoria);
  if (!categoria) {
    if (!aplicar) {
      categoria = { id: -numeroFila, nombre: fila.categoria, sucursalId };
      categorias.set(claveCategoria, categoria);
      reporte.categoriasCreadas += 1;
    } else {
      categoria = await prisma.categoria.create({
        data: { nombre: fila.categoria, sucursalId },
        select: { id: true, nombre: true, sucursalId: true },
      });
      categorias.set(claveCategoria, categoria);
      reporte.categoriasCreadas += 1;
    }
  }

  let estacionId = null;
  if (fila.estacion) {
    const estacion = estaciones.get(clave(fila.estacion));
    if (!estacion) throw new Error(`Fila ${numeroFila}: estación no encontrada: ${fila.estacion}`);
    estacionId = estacion.id;
  }

  const existentes = await prisma.producto.findMany({
    where: { codigo: fila.codigo, categoria: { sucursalId } },
    select: { id: true, nombre: true, imagenPrincipal: { select: { hashSha256: true } } },
    take: 2,
  });
  if (existentes.length > 1) throw new Error(`Fila ${numeroFila}: código duplicado en la base: ${fila.codigo}`);

  const data = {
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion || null,
    precio: fila.precio,
    favorito: fila.favorito,
    disponible: fila.disponible,
    categoriaId: categoria.id,
    estacionId,
    estado: fila.activo,
  };

  let productoId = existentes[0]?.id ?? null;
  let accion = existentes[0] ? 'ACTUALIZAR' : 'CREAR';
  if (aplicar) {
    if (productoId) {
      await prisma.producto.update({ where: { id: productoId }, data });
      reporte.actualizados += 1;
    } else {
      const creado = await prisma.producto.create({ data, select: { id: true } });
      productoId = creado.id;
      reporte.creados += 1;
    }
  } else {
    if (productoId) reporte.actualizados += 1;
    else reporte.creados += 1;
  }

  let imagen = 'SIN_IMAGEN';
  if (fila.imagen) {
    if (!imagesDir) {
      imagen = 'OMITIDA_SIN_CARPETA';
      reporte.imagenesOmitidas += 1;
    } else {
      const imagePath = archivoImagen(imagesDir, fila.imagen);
      try {
        if (!aplicar) {
          const meta = await inspeccionarImagen(imagePath);
          imagen = `VALIDA_${meta.width}x${meta.height}`;
        } else if (productoId) {
          imagen = await procesarImagen(productoId, imagePath, fila.imagen);
        }
      } catch (error) {
        if (strictImages) throw error;
        imagen = 'OMITIDA_ERROR';
        reporte.imagenesOmitidas += 1;
        reporte.advertencias.push(`Fila ${numeroFila}: imagen ${fila.imagen}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  return { fila: numeroFila, codigo: fila.codigo, productoId, accion, imagen };
}

async function procesarImagen(productoId, imagePath, originalName) {
  const input = await readFile(imagePath);
  if (input.length <= 0 || input.length > MAX_BYTES) throw new Error(`${originalName}: la imagen debe pesar máximo 12 MB`);
  const sharp = await getSharp();
  const salida = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = salida.info;
  if (!width || !height || width * height > MAX_PIXELS) throw new Error(`${originalName}: resolución no permitida`);

  const hash = createHash('sha256').update(input).update(':50:50:1').digest('hex');
  const existente = await prisma.imagenProducto.findUnique({ where: { productoId } });
  if (existente?.hashSha256 === hash) {
    reporte.imagenesSinCambios += 1;
    return 'SIN_CAMBIOS';
  }

  const token = randomUUID();
  const destino = mediaDir(restauranteId, productoId, token);
  await mkdir(destino, { recursive: true });
  const size = Math.min(width, height);
  const recorte = {
    left: Math.max(0, Math.floor((width - size) / 2)),
    top: Math.max(0, Math.floor((height - size) / 2)),
    width: size,
    height: size,
  };
  try {
    for (const [nombre, dimension] of Object.entries(VARIANTES)) {
      const buffer = await sharp(salida.data)
        .extract(recorte)
        .resize(dimension, dimension, { fit: 'cover' })
        .webp({ quality: nombre === 'large' ? 84 : 82, effort: 4 })
        .toBuffer();
      await writeFile(resolve(destino, `${nombre}.webp`), buffer, { flag: 'wx' });
    }

    const extension = extname(originalName).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    const anterior = existente ? { token: existente.tokenPublico, restauranteId: existente.restauranteId } : null;
    await prisma.imagenProducto.upsert({
      where: { productoId },
      create: {
        productoId,
        restauranteId,
        tokenPublico: token,
        nombreOriginal: nombreSeguro(originalName),
        mimeOriginal: mime,
        bytesOriginales: input.length,
        anchoOriginal: width,
        altoOriginal: height,
        hashSha256: hash,
        focoX: 50,
        focoY: 50,
        zoom: 1,
      },
      update: {
        restauranteId,
        tokenPublico: token,
        nombreOriginal: nombreSeguro(originalName),
        mimeOriginal: mime,
        bytesOriginales: input.length,
        anchoOriginal: width,
        altoOriginal: height,
        hashSha256: hash,
        focoX: 50,
        focoY: 50,
        zoom: 1,
        estado: 'ACTIVA',
      },
    });
    if (anterior) await rm(mediaDir(anterior.restauranteId, productoId, anterior.token), { recursive: true, force: true });
    reporte.imagenesProcesadas += 1;
    return 'PROCESADA';
  } catch (error) {
    await rm(destino, { recursive: true, force: true });
    throw error;
  }
}

async function validarFilas(filas, targetSucursalId, imageRoot) {
  if (!filas.length) reporte.errores.push('El CSV no contiene productos.');
  const codigos = new Map();
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const n = i + 2;
    if (!fila.codigo) reporte.errores.push(`Fila ${n}: codigo es obligatorio.`);
    if (!fila.nombre) reporte.errores.push(`Fila ${n}: nombre es obligatorio.`);
    if (!fila.categoria) reporte.errores.push(`Fila ${n}: categoria es obligatoria.`);
    if (!Number.isFinite(fila.precio) || fila.precio < 0) reporte.errores.push(`Fila ${n}: precio inválido.`);
    if (fila.codigo) {
      if (codigos.has(fila.codigo)) reporte.errores.push(`Filas ${codigos.get(fila.codigo)} y ${n}: código duplicado ${fila.codigo}.`);
      else codigos.set(fila.codigo, n);
    }
    if (fila.imagen) {
      if (!imageRoot) {
        const msg = `Fila ${n}: ${fila.imagen} indicada pero no se pasó --images.`;
        (strictImages ? reporte.errores : reporte.advertencias).push(msg);
      } else {
        try {
          const imagePath = archivoImagen(imageRoot, fila.imagen);
          const info = await stat(imagePath);
          if (!info.isFile()) throw new Error('no es un archivo');
          if (info.size > MAX_BYTES) throw new Error('supera 12 MB');
          await inspeccionarImagen(imagePath);
        } catch (error) {
          const msg = `Fila ${n}: imagen ${fila.imagen}: ${error instanceof Error ? error.message : error}`;
          (strictImages ? reporte.errores : reporte.advertencias).push(msg);
        }
      }
    }
  }
  const existentes = await prisma.producto.findMany({
    where: { codigo: { in: [...codigos.keys()] }, categoria: { sucursalId: targetSucursalId } },
    select: { codigo: true, id: true },
  });
  const agrupados = new Map();
  for (const p of existentes) {
    const arr = agrupados.get(p.codigo) ?? [];
    arr.push(p.id);
    agrupados.set(p.codigo, arr);
  }
  for (const [codigo, ids] of agrupados) {
    if (ids.length > 1) reporte.errores.push(`Base inconsistente: código ${codigo} aparece ${ids.length} veces en la sucursal.`);
  }
}

async function inspeccionarImagen(path) {
  const info = await stat(path);
  if (info.size <= 0 || info.size > MAX_BYTES) throw new Error('peso fuera del límite de 12 MB');
  const sharp = await getSharp();
  const metadata = await sharp(path, { limitInputPixels: MAX_PIXELS }).metadata();
  if (!metadata.width || !metadata.height) throw new Error('dimensiones no detectables');
  if (metadata.width * metadata.height > MAX_PIXELS) throw new Error('resolución supera 60 MP');
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('formato no permitido');
  return metadata;
}

function normalizarFilas(rows) {
  return rows.map((row) => ({
    codigo: texto(row.codigo).toUpperCase(),
    nombre: texto(row.nombre),
    descripcion: texto(row.descripcion),
    categoria: texto(row.categoria),
    precio: numero(row.precio),
    estacion: texto(row.estacion),
    favorito: booleano(row.favorito, false),
    disponible: booleano(row.disponible, true),
    activo: booleano(row.activo, true),
    imagen: texto(row.imagen),
  }));
}

function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = contarFueraComillas(first, ';') >= contarFueraComillas(first, ',') ? ';' : ',';
  const matrix = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(value); value = ''; }
    else if (c === '\n') { row.push(value.replace(/\r$/, '')); matrix.push(row); row = []; value = ''; }
    else value += c;
  }
  if (value.length || row.length) { row.push(value.replace(/\r$/, '')); matrix.push(row); }
  const nonEmpty = matrix.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  const required = ['codigo', 'nombre', 'categoria', 'precio'];
  for (const h of required) if (!headers.includes(h)) throw new Error(`Falta columna obligatoria: ${h}`);
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

async function cargarCategorias(id) {
  const rows = await prisma.categoria.findMany({ where: { sucursalId: id }, select: { id: true, nombre: true, sucursalId: true } });
  return new Map(rows.map((r) => [clave(r.nombre), r]));
}
async function cargarEstaciones(id) {
  const rows = await prisma.estacionPreparacion.findMany({ where: { sucursalId: id, estado: true }, select: { id: true, nombre: true, codigo: true } });
  const map = new Map();
  for (const r of rows) { map.set(clave(r.nombre), r); map.set(clave(r.codigo), r); }
  return map;
}

async function finalizar(code) {
  reporte.finalizadoEn = new Date().toISOString();
  if (reportPath) {
    await mkdir(resolve(reportPath, '..'), { recursive: true }).catch(() => {});
    await writeFile(reportPath, JSON.stringify(reporte, null, 2), 'utf8');
  }
  console.log(JSON.stringify(reporte, null, 2));
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(code);
}

function mediaDir(restId, prodId, token) {
  const path = resolve(mediaRoot, `restaurante-${restId}`, `producto-${prodId}`, token);
  validarDentro(mediaRoot, path);
  return path;
}
function archivoImagen(root, name) {
  if (basename(name) !== name) throw new Error('el nombre de imagen no puede contener carpetas');
  const path = resolve(root, name);
  validarDentro(root, path);
  return path;
}
function validarDentro(root, path) {
  const base = resolve(root) + sep;
  if (!resolve(path).startsWith(base)) throw new Error('ruta fuera del directorio permitido');
}
function resolverMedia() {
  const configured = process.env.MEDIA_STORAGE_DIR?.trim();
  return configured ? (isAbsolute(configured) ? configured : resolve(process.cwd(), configured)) : resolve(process.cwd(), 'storage', 'media');
}
function nombreSeguro(name) {
  return basename(name).normalize('NFKC').replace(/[^a-zA-Z0-9 ._()\-áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 255) || 'foto';
}
function clave(v) { return texto(v).normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g, ' '); }
function texto(v) { return String(v ?? '').trim(); }
function numero(v) {
  let t = texto(v).replace(/[$\s]/g, '');
  if (!t) return Number.NaN;
  const comma = t.lastIndexOf(',');
  const dot = t.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (comma >= 0) {
    const decimals = t.length - comma - 1;
    t = decimals > 0 && decimals <= 2 ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (dot >= 0) {
    const decimals = t.length - dot - 1;
    if (decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  }
  return Number(t);
}
function booleano(v, fallback) {
  const t = texto(v).toLowerCase();
  if (!t) return fallback;
  if (['1', 'true', 'si', 'sí', 'yes', 'x'].includes(t)) return true;
  if (['0', 'false', 'no'].includes(t)) return false;
  throw new Error(`Valor booleano inválido: ${v}`);
}
function contarFueraComillas(line, target) { let q = false, n = 0; for (const c of line) { if (c === '"') q = !q; else if (!q && c === target) n++; } return n; }
function argumentos(argv) { const map = new Map(); for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) throw new Error(`Argumento inválido: ${k}`); if (['--apply','--strict-images','--help'].includes(k)) map.set(k, 'true'); else { const v = argv[++i]; if (!v || v.startsWith('--')) throw new Error(`Falta valor para ${k}`); map.set(k, v); } } return map; }
function ruta(value) { return resolve(process.cwd(), value); }
function rutaObligatoria(name) { const v = args.get(name); if (!v) throw new Error(`${name} es obligatorio.`); return ruta(v); }
function enteroObligatorio(name) { const n = Number(args.get(name)); if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} debe ser un entero positivo.`); return n; }
function ayuda() {
  console.log(`\nImportación segura de catálogo SIGR (Sprint 47D)\n\nPrimero ejecutar SIEMPRE sin --apply:\n  npm run catalog:import -- --csv onboarding/catalogo.csv --images onboarding/imagenes --restaurante-id 1 --sucursal-id 2 --report onboarding/reporte.json\n\nAplicar sólo cuando el DRY_RUN no tenga errores:\n  npm run catalog:import -- --csv onboarding/catalogo.csv --images onboarding/imagenes --restaurante-id 1 --sucursal-id 2 --report onboarding/reporte-aplicado.json --apply --strict-images\n\nColumnas: codigo;nombre;descripcion;categoria;precio;estacion;favorito;disponible;activo;imagen\n`);
}
